'use strict';
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');
const config = require('./config');
const store = require('./store');
const util = require('./util');
const buttons = require('./buttons');

const PLUGINS_DIR = path.join(__dirname, '..', 'plugins');
const INVITE_RE = /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i;
const MAX_AGE_SECONDS = 90;

function loadPlugins() {
  const commands = new Map();
  const list = [];
  if (!fs.existsSync(PLUGINS_DIR)) return { commands, list };
  for (const file of fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js'))) {
    try {
      const mod = require(path.join(PLUGINS_DIR, file));
      for (const item of Array.isArray(mod) ? mod : [mod]) {
        if (!item || !item.name || typeof item.run !== 'function') continue;
        list.push(item);
        for (const n of [item.name, ...(item.aliases || [])]) commands.set(n.toLowerCase(), item);
      }
    } catch (e) {
      console.error('[plugins] failed to load', file, e.message);
    }
  }
  return { commands, list };
}

const { commands, list } = loadPlugins();

function toSeconds(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toNumber === 'function') return ts.toNumber();
  return Number(ts) || 0;
}

function attach({ sock, bot, groupCache }) {
  const botId = Number(bot.id);
  const seen = new NodeCache({ stdTTL: 120, checkperiod: 60, useClones: false });

  const botIds = () => [sock.user?.id, sock.user?.lid].filter(Boolean);

  async function getMeta(chat, fresh = false) {
    let meta = fresh ? null : groupCache.get(chat);
    if (!meta) {
      meta = await sock.groupMetadata(chat);
      groupCache.set(chat, meta);
    }
    return meta;
  }

  function ownerNumbers() {
    const raw = [config.devPhone, ...(config.owners || []), bot.phone, ...botIds()];
    return new Set(raw.map(v => util.bare(v).replace(/\D/g, '')).filter(Boolean));
  }

  function buildCtx(msg, plugin, command, args, argText) {
    const chat = msg.key.remoteJid;
    const isGroup = chat.endsWith('@g.us');
    const candidates = [msg.key.participant, msg.key.participantAlt, msg.key.remoteJidAlt, isGroup ? null : chat].filter(Boolean);
    const owners = ownerNumbers();
    const ctx = {
      sock,
      msg,
      chat,
      isGroup,
      plugin,
      command,
      args: args || [],
      argText: argText || '',
      config,
      store,
      botId,
      commands: list,
      sender: msg.key.participant || chat,
      pushName: msg.pushName || '',
      isOwner: !!msg.key.fromMe || candidates.some(c => owners.has(util.bare(c))),
      meta: null,
      isAdmin: false,
      isBotAdmin: false,
      botIds,
      btn: buttons.btn,
      sendButtons: opts => buttons.send(ctx, opts),
      reply: (text, extra = {}) => sock.sendMessage(chat, { text, ...extra }, { quoted: msg }),
      getMeta: fresh => getMeta(chat, fresh),
      invalidateMeta: () => groupCache.del(chat),
      loadAccess: async () => {
        if (!isGroup || ctx.meta) return;
        ctx.meta = await getMeta(chat);
        ctx.isBotAdmin = util.isAdminP(util.findParticipant(ctx.meta, botIds()));
        ctx.isAdmin = util.isAdminP(util.findParticipant(ctx.meta, candidates));
      }
    };
    return ctx;
  }

  async function enforceAntilink(msg, text) {
    const chat = msg.key.remoteJid;
    if (!chat.endsWith('@g.us') || msg.key.fromMe || !INVITE_RE.test(text)) return;
    if (!store.getBot(botId).enabled) return;
    const flags = store.getChat(botId, chat);
    if (!flags.enabled || !flags.antilink) return;
    const ctx = buildCtx(msg);
    if (ctx.isOwner) return;
    await ctx.loadAccess();
    if (ctx.isAdmin || !ctx.isBotAdmin) return;
    await sock.sendMessage(chat, { delete: msg.key });
    await sock.groupParticipantsUpdate(chat, [ctx.sender], 'remove');
    groupCache.del(chat);
    await sock.sendMessage(chat, {
      text: `@${util.bare(ctx.sender)} got removed, no group links here.`,
      mentions: [ctx.sender]
    });
  }

  async function onMessage(msg) {
    const chat = msg.key && msg.key.remoteJid;
    if (!msg.message || !chat) return;
    if (chat === 'status@broadcast' || chat.endsWith('@broadcast') || chat.endsWith('@newsletter')) return;
    if (msg.message.protocolMessage || msg.message.reactionMessage) return;
    if (seen.get(msg.key.id)) return;
    seen.set(msg.key.id, 1);

    const ts = toSeconds(msg.messageTimestamp);
    if (ts && Date.now() / 1000 - ts > MAX_AGE_SECONDS) return;

    const text = util.extractText(msg.message).trim();
    if (!text) return;

    const prefix = config.prefix;
    const isCmd = text.startsWith(prefix);
    if (msg.key.fromMe && !isCmd) return;
    if (!isCmd) {
      await enforceAntilink(msg, text);
      return;
    }

    const body = text.slice(prefix.length).trim();
    const parts = body.split(/\s+/);
    const command = (parts[0] || '').toLowerCase();
    const plugin = commands.get(command);
    if (!plugin) return;

    const ctx = buildCtx(msg, plugin, command, parts.slice(1), body.slice(parts[0].length).trim());

    const botState = store.getBot(botId);
    const chatFlags = ctx.isGroup ? store.getChat(botId, chat) : null;
    const disabled = !botState.enabled || (chatFlags && !chatFlags.enabled);
    if (disabled && plugin.name !== 'on') return;
    if (!botState.enabled && !ctx.isOwner) return;

    try {
      if (plugin.owner && !ctx.isOwner) return await ctx.reply("That one's just for my owner.");
      if (plugin.group && !ctx.isGroup) return await ctx.reply('That only works in groups.');
      if (plugin.admin || plugin.botAdmin) {
        await ctx.loadAccess();
        if (plugin.admin && !ctx.isOwner && !ctx.isAdmin) return await ctx.reply('Only admins can do that.');
        if (plugin.botAdmin && !ctx.isBotAdmin) return await ctx.reply('Make me an admin first, then I can do that.');
      }
      await plugin.run(ctx);
    } catch (e) {
      console.error('[command]', command, e.message);
      await ctx.reply("Hmm, that didn't work. Try again in a sec.").catch(() => {});
    }
  }

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) onMessage(m).catch(e => console.error('[handler]', e.message));
  });

  sock.ev.on('groups.update', updates => {
    for (const u of updates) if (u.id) groupCache.del(u.id);
  });

  sock.ev.on('group-participants.update', async ev => {
    try {
      groupCache.del(ev.id);
      if (ev.action !== 'add') return;
      if (!store.getBot(botId).enabled) return;
      const flags = store.getChat(botId, ev.id);
      if (!flags.enabled || !flags.welcome) return;
      const meta = await getMeta(ev.id, true);
      const me = botIds();
      const jids = (ev.participants || [])
        .map(p => (typeof p === 'string' ? p : p.id || p.phoneNumber))
        .filter(j => j && !me.some(m => util.sameUser(m, j)));
      for (const jid of jids) {
        const lines = [`Welcome @${util.bare(jid)} 👋 glad to have you in *${meta.subject}*`];
        if (meta.desc) lines.push('', meta.desc);
        await sock.sendMessage(ev.id, { text: lines.join('\n'), mentions: [jid] });
      }
    } catch (e) {
      console.error('[welcome]', e.message);
    }
  });
}

module.exports = { attach, commandCount: () => list.length };
