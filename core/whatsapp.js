'use strict';
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const pino = require('pino');
const NodeCache = require('node-cache');
const handler = require('./handler');
const store = require('./store');

const MAX_RETRIES = 8;

function makeWhatsAppManager({ db, sessionsDir }) {
  const sessions = new Map();
  let baileysPromise;

  const getBaileys = () => baileysPromise ||= import('@whiskeysockets/baileys');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const sessionPath = id => path.join(sessionsDir, String(id));
  const setDbStatus = (id, status) => db.prepare('UPDATE bots SET status=? WHERE id=?').run(status, id);

  function getStatus(id) {
    const s = sessions.get(Number(id));
    if (!s) return { status: 'disconnected', qr: null, pairingCode: null, message: 'البوت غير متصل' };
    return { status: s.status, qr: s.qr || null, pairingCode: s.pairingCode || null, message: s.message || '' };
  }

  function dropSession(id, state) {
    if (state && state.sock) {
      try { state.sock.ev.removeAllListeners(); } catch {}
      try { state.sock.end(undefined); } catch {}
    }
    sessions.delete(id);
  }

  async function connect(bot, { requestPairing = false } = {}) {
    const id = Number(bot.id);
    const current = sessions.get(id);
    if (current) return getStatus(id);
    if (!['qr', 'code'].includes(bot.method)) throw new Error('طريقة الربط غير صحيحة');
    if (requestPairing && !String(bot.phone || '').replace(/\D/g, '')) throw new Error('أدخل رقم واتساب بصيغة دولية');

    const state = { status: 'connecting', qr: null, pairingCode: null, message: 'جاري الاتصال…', sock: null, retries: 0, wantPairing: requestPairing };
    sessions.set(id, state);
    fs.mkdirSync(sessionPath(id), { recursive: true, mode: 0o700 });

    try {
      const B = await getBaileys();
      let version;
      try {
        ({ version } = await B.fetchLatestWaWebVersion({}));
      } catch {
        version = undefined;
      }
      const makeWASocket = B.default || B.makeWASocket;
      const { state: authState, saveCreds } = await B.useMultiFileAuthState(sessionPath(id));
      const groupCache = new NodeCache({ stdTTL: 60, useClones: false });
      const loggedOut = (B.DisconnectReason && B.DisconnectReason.loggedOut) || 401;
      const replaced = (B.DisconnectReason && B.DisconnectReason.connectionReplaced) || 440;
      const restartRequired = (B.DisconnectReason && B.DisconnectReason.restartRequired) || 515;

      const sock = makeWASocket({
        ...(version ? { version } : {}),
        auth: authState,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        browser: ['Ubuntu', 'Chrome', '22.04'],
        cachedGroupMetadata: async jid => groupCache.get(jid)
      });

      state.sock = sock;
      sock.ev.on('creds.update', saveCreds);
      handler.attach({ sock, bot, groupCache });

      sock.ev.on('connection.update', async update => {
        if (sessions.get(id) !== state) return;

        if (update.qr && !state.wantPairing) {
          state.qr = await QRCode.toDataURL(update.qr, { margin: 1, width: 280 }).catch(() => null);
          state.status = 'qr';
          state.message = 'امسح QR من واتساب > الأجهزة المرتبطة';
        }

        if (update.connection === 'open') {
          state.status = 'connected';
          state.qr = null;
          state.pairingCode = null;
          state.retries = 0;
          state.message = 'متصل ✅';
          setDbStatus(id, 'connected');
        }

        if (update.connection === 'close') {
          const code = update.lastDisconnect && update.lastDisconnect.error && update.lastDisconnect.error.output
            ? update.lastDisconnect.error.output.statusCode
            : undefined;

          if (code === loggedOut) {
            dropSession(id, state);
            fs.rmSync(sessionPath(id), { recursive: true, force: true });
            setDbStatus(id, 'disconnected');
            return;
          }

          if (code === replaced) {
            dropSession(id, state);
            setDbStatus(id, 'disconnected');
            return;
          }

          const registered = !!(sock.authState && sock.authState.creds && sock.authState.creds.registered);
          if (code !== restartRequired && !registered) {
            dropSession(id, state);
            setDbStatus(id, 'disconnected');
            return;
          }

          state.retries += 1;
          if (state.retries > MAX_RETRIES) {
            dropSession(id, state);
            setDbStatus(id, 'disconnected');
            return;
          }

          state.status = 'reconnecting';
          state.message = 'انقطع، جاري إعادة الاتصال…';
          const delay = code === restartRequired ? 500 : Math.min(5000 * state.retries, 30000);
          setTimeout(() => {
            if (sessions.get(id) !== state) return;
            dropSession(id, state);
            const fresh = db.prepare('SELECT * FROM bots WHERE id=?').get(id);
            if (fresh) connect(fresh).catch(e => console.error('[reconnect]', e.message));
          }, delay);
        }
      });

      if (requestPairing && !authState.creds.registered) {
        await sleep(2000);
        const phone = String(bot.phone).replace(/\D/g, '');
        state.pairingCode = await sock.requestPairingCode(phone);
        state.status = 'code';
        state.message = 'أدخل الكود في واتساب';
      }

      return getStatus(id);
    } catch (e) {
      dropSession(id, state);
      setDbStatus(id, 'disconnected');
      throw new Error('تعذر الاتصال: ' + (e.message || 'خطأ'));
    }
  }

  async function disconnect(bot) {
    const id = Number(bot.id);
    const state = sessions.get(id);
    if (state && state.sock) {
      try { state.sock.ev.removeAllListeners(); } catch {}
      try { await state.sock.logout(); } catch { try { state.sock.end(undefined); } catch {} }
    }
    sessions.delete(id);
    fs.rmSync(sessionPath(id), { recursive: true, force: true });
    setDbStatus(id, 'disconnected');
    return getStatus(id);
  }

  function remove(bot) {
    const id = Number(bot.id);
    dropSession(id, sessions.get(id));
    fs.rmSync(sessionPath(id), { recursive: true, force: true });
    store.removeBot(id);
  }

  async function restore() {
    const rows = db.prepare('SELECT * FROM bots').all();
    for (const bot of rows) {
      if (!fs.existsSync(path.join(sessionPath(bot.id), 'creds.json'))) continue;
      connect(bot).catch(e => console.error('[restore]', bot.id, e.message));
      await sleep(1500);
    }
  }

  return { connect, disconnect, remove, getStatus, restore };
}

module.exports = { makeWhatsAppManager };
