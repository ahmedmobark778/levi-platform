'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DIR, 'store.json');
const CHAT_DEFAULTS = { enabled: true, antilink: false, welcome: false };

let data = {};
try {
  data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  data = {};
}

function persist() {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}

function node(botId) {
  const key = String(botId);
  if (!data[key]) data[key] = { enabled: true, chats: {} };
  if (!data[key].chats) data[key].chats = {};
  return data[key];
}

function getBot(botId) {
  const n = node(botId);
  return { enabled: n.enabled !== false, buttons: n.buttons !== false };
}

function setBot(botId, patch) {
  Object.assign(node(botId), patch);
  persist();
}

function getChat(botId, chat) {
  return { ...CHAT_DEFAULTS, ...(node(botId).chats[chat] || {}) };
}

function setChat(botId, chat, patch) {
  const n = node(botId);
  n.chats[chat] = { ...(n.chats[chat] || {}), ...patch };
  persist();
}

function removeBot(botId) {
  delete data[String(botId)];
  persist();
}

module.exports = { getBot, setBot, getChat, setChat, removeBot };
