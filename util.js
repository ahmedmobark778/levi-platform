'use strict';

const WRAPPERS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage'];

function unwrap(message) {
  let m = message;
  for (let i = 0; m && i < 5; i++) {
    const key = WRAPPERS.find(k => m[k]);
    if (!key) break;
    m = m[key].message;
  }
  return m || {};
}

function extractText(message) {
  const m = unwrap(message);
  const flow = m.interactiveResponseMessage && m.interactiveResponseMessage.nativeFlowResponseMessage;
  if (flow && flow.paramsJson) {
    try {
      const id = JSON.parse(flow.paramsJson).id;
      if (id) return String(id);
    } catch {}
  }
  const picked = (m.buttonsResponseMessage && m.buttonsResponseMessage.selectedButtonId)
    || (m.templateButtonReplyMessage && m.templateButtonReplyMessage.selectedId)
    || (m.listResponseMessage && m.listResponseMessage.singleSelectReply && m.listResponseMessage.singleSelectReply.selectedRowId);
  if (picked) return String(picked);
  return m.conversation
    || m.extendedTextMessage?.text
    || m.imageMessage?.caption
    || m.videoMessage?.caption
    || m.documentMessage?.caption
    || '';
}

function getContext(message) {
  const m = unwrap(message);
  for (const v of Object.values(m)) {
    if (v && typeof v === 'object' && v.contextInfo) return v.contextInfo;
  }
  return null;
}

function bare(jid) {
  return String(jid || '').split('@')[0].split(':')[0];
}

function sameUser(a, b) {
  const x = bare(a);
  const y = bare(b);
  return !!x && x === y;
}

function participantIds(p) {
  return [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean);
}

function findParticipant(meta, jids) {
  const wanted = jids.filter(Boolean);
  if (!meta || !wanted.length) return null;
  return meta.participants.find(p => participantIds(p).some(id => wanted.some(w => sameUser(id, w)))) || null;
}

function isAdminP(p) {
  return !!p && (p.admin === 'admin' || p.admin === 'superadmin');
}

function safeTz(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

function formatTime(date, tz) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz(tz),
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(date);
}

function formatDate(date, tz) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: safeTz(tz),
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function formatUptime(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [d && d + 'd', (d || h) && h + 'h', (d || h || m) && m + 'm', sec + 's'].filter(Boolean).join(' ');
}

module.exports = {
  unwrap,
  extractText,
  getContext,
  bare,
  sameUser,
  participantIds,
  findParticipant,
  isAdminP,
  safeTz,
  formatTime,
  formatDate,
  formatUptime
};
