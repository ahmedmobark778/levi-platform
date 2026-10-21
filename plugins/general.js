'use strict';
const os = require('os');
const util = require('../core/util');
const buttons = require('../core/buttons');

const ORDER = ['General', 'Settings', 'Members', 'Group'];

function onOff(value) {
  return value ? 'on' : 'off';
}

async function measurePing(ctx) {
  const started = Date.now();
  try {
    await ctx.sock.onWhatsApp(util.bare(ctx.sock.user.id) + '@s.whatsapp.net');
  } catch {}
  return Date.now() - started;
}

function textMenu(ctx) {
  const prefix = ctx.config.prefix;
  const lines = ["Here's everything I can do:", ''];
  for (const cat of ORDER) {
    const items = ctx.commands.filter(c => c.category === cat);
    if (!items.length) continue;
    lines.push(`*${cat}*`);
    for (const c of items) lines.push(`${prefix}${c.usage || c.name} - ${c.desc}`);
    lines.push('');
  }
  lines.push(`Made by ${ctx.config.devName}`);
  return lines.join('\n');
}

module.exports = [
  {
    name: 'menu',
    aliases: ['help', 'commands'],
    category: 'General',
    desc: 'Show all commands',
    async run(ctx) {
      const p = ctx.config.prefix;
      if (!buttons.enabled(ctx)) return ctx.reply(textMenu(ctx));
      const sections = ORDER.map(cat => ({
        title: cat,
        rows: ctx.commands
          .filter(c => c.category === cat)
          .map(c => ({ title: p + c.name, description: c.desc.slice(0, 72), id: p + c.name }))
      })).filter(s => s.rows.length);
      return ctx.sendButtons({
        text: 'Hey 👋 what do you need? Open the list and pick a command.',
        buttons: [ctx.btn.list('Commands', sections)]
      });
    }
  },
  {
    name: 'status',
    aliases: ['state', 'info', 'stats'],
    category: 'General',
    desc: 'Show time, date, ping and bot status',
    async run(ctx) {
      const tz = ctx.config.timezone;
      const ping = await measurePing(ctx);
      const now = new Date();
      const memory = process.memoryUsage().rss / 1048576;
      const total = os.totalmem() / 1073741824;
      const lines = [
        `${ctx.config.botName} is up 🟢`,
        '',
        `🕒 ${util.formatTime(now, tz)}`,
        `📅 ${util.formatDate(now, tz)}`,
        `🌍 ${util.safeTz(tz)}`,
        `📶 ${ping} ms`,
        `⏱ Running for ${util.formatUptime(process.uptime())}`,
        `💾 ${memory.toFixed(0)} MB used of ${total.toFixed(1)} GB`,
        `⚙ Node ${process.version} on ${os.platform()}`
      ];
      if (ctx.isGroup) {
        const flags = ctx.store.getChat(ctx.botId, ctx.chat);
        lines.push('', `In this group I'm ${onOff(flags.enabled)}, antilink is ${onOff(flags.antilink)} and welcome is ${onOff(flags.welcome)}`);
      }
      const p = ctx.config.prefix;
      await ctx.sendButtons({
        text: lines.join('\n'),
        buttons: [ctx.btn.reply('Refresh', p + 'status'), ctx.btn.reply('Ping', p + 'ping'), ctx.btn.reply('Menu', p + 'menu')]
      });
    }
  },
  {
    name: 'ping',
    category: 'General',
    desc: 'Check response speed',
    async run(ctx) {
      const ping = await measurePing(ctx);
      const p = ctx.config.prefix;
      await ctx.sendButtons({
        text: `Pong! ${ping} ms 🏓`,
        buttons: [ctx.btn.reply('Ping again', p + 'ping'), ctx.btn.reply('Status', p + 'status')]
      });
    }
  },
  {
    name: 'owner',
    aliases: ['dev', 'developer'],
    category: 'General',
    desc: 'Show developer info',
    async run(ctx) {
      const c = ctx.config;
      const links = {
        whatsapp: ['WhatsApp', `https://wa.me/${c.devPhone}`],
        telegram: ['Telegram', `https://t.me/${c.devTg}`],
        wachannel: ['WhatsApp channel', c.waChannel],
        tgchannel: ['Telegram channel', c.tgChannel]
      };
      const pick = links[(ctx.args[0] || '').toLowerCase()];
      if (pick) return ctx.reply(`${pick[0]}: ${pick[1]}`);
      const p = c.prefix;
      const rows = Object.entries(links).map(([key, [title]]) => ({ title, description: 'Tap to get the link', id: `${p}owner ${key}` }));
      await ctx.sendButtons({
        text: `That's ${c.devName}, the guy who made me. Pick where you want to reach him:`,
        buttons: [ctx.btn.list('Contact', [{ title: 'Developer', rows }])]
      });
    }
  }
];
