'use strict';
const util = require('../core/util');

function usageOf(ctx) {
  return `Like this: ${ctx.config.prefix}${ctx.plugin.usage}`;
}

function pickTargets(ctx) {
  const info = util.getContext(ctx.msg.message);
  const mentioned = info && info.mentionedJid ? info.mentionedJid : [];
  if (mentioned.length) return mentioned;
  if (info && info.participant && info.quotedMessage) return [info.participant];
  return ctx.args
    .map(a => a.replace(/\D/g, ''))
    .filter(n => n.length >= 8 && n.length <= 15)
    .map(n => `${n}@s.whatsapp.net`);
}

async function memberAction(ctx, action, past, check) {
  const targets = pickTargets(ctx);
  if (!targets.length) return ctx.reply(usageOf(ctx));
  const meta = await ctx.getMeta();
  const me = ctx.botIds();
  const done = [];
  const skipped = [];
  const seen = new Set();
  for (const t of targets) {
    const p = util.findParticipant(meta, [t]);
    if (!p) {
      skipped.push(`@${util.bare(t)} isn't in this group`);
      continue;
    }
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    if (util.participantIds(p).some(id => me.some(m => util.sameUser(id, m)))) {
      skipped.push("I'm not doing that to myself");
      continue;
    }
    const reason = check(p);
    if (reason) {
      skipped.push(`@${util.bare(p.id)} ${reason}`);
      continue;
    }
    done.push(p.id);
  }
  if (done.length) {
    await ctx.sock.groupParticipantsUpdate(ctx.chat, done, action);
    ctx.invalidateMeta();
  }
  const lines = [];
  if (done.length) lines.push(past(done.map(j => '@' + util.bare(j)).join(' ')));
  if (skipped.length) lines.push(...(done.length ? ['', "Couldn't do these:"] : []), ...skipped);
  const mentions = [...done, ...targets];
  return ctx.reply(lines.join('\n') || 'Nothing to do there.', { mentions });
}

async function allIds(ctx) {
  const meta = await ctx.getMeta();
  return meta.participants.map(p => p.id);
}

module.exports = [
  {
    name: 'kick',
    aliases: ['remove'],
    category: 'Members',
    usage: 'kick @user',
    desc: 'Remove someone (tag, reply or number)',
    group: true,
    admin: true,
    botAdmin: true,
    run: ctx => memberAction(ctx, 'remove', l => `Removed ${l} 👋`, p => (util.isAdminP(p) ? 'is an admin, demote them first' : null))
  },
  {
    name: 'add',
    category: 'Members',
    usage: 'add 2010xxxxxxxx',
    desc: 'Add a member by number',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      const nums = ctx.args.map(a => a.replace(/\D/g, '')).filter(n => n.length >= 8 && n.length <= 15);
      if (!nums.length) return ctx.reply(usageOf(ctx));
      const result = await ctx.sock.groupParticipantsUpdate(ctx.chat, nums.map(n => `${n}@s.whatsapp.net`), 'add');
      ctx.invalidateMeta();
      const labels = {
        200: 'added ✅',
        401: 'has blocked me',
        403: "can't be added directly, their privacy settings need an invite",
        408: 'left recently, try again later',
        409: 'is already in here'
      };
      const lines = nums.map((n, i) => {
        const status = result[i] ? Number(result[i].status) : 0;
        return `+${n} ${labels[status] || "didn't work (" + status + ')'}`;
      });
      return ctx.reply(lines.join('\n'));
    }
  },
  {
    name: 'promote',
    category: 'Members',
    usage: 'promote @user',
    desc: 'Make a member admin',
    group: true,
    admin: true,
    botAdmin: true,
    run: ctx => memberAction(ctx, 'promote', l => `${l} is an admin now ✅`, p => (util.isAdminP(p) ? 'is already an admin' : null))
  },
  {
    name: 'demote',
    category: 'Members',
    usage: 'demote @user',
    desc: 'Remove admin rights from a member',
    group: true,
    admin: true,
    botAdmin: true,
    run: ctx => memberAction(ctx, 'demote', l => `${l} isn't an admin anymore`, p => {
      if (!util.isAdminP(p)) return "isn't an admin";
      return p.admin === 'superadmin' ? 'created the group, I can\'t touch that' : null;
    })
  },
  {
    name: 'tagall',
    aliases: ['everyone'],
    category: 'Members',
    usage: 'tagall [message]',
    desc: 'Mention every member',
    group: true,
    admin: true,
    async run(ctx) {
      const ids = await allIds(ctx);
      const lines = [ctx.argText || 'Hey everyone 👀', '', ...ids.map(id => `@${util.bare(id)}`)];
      await ctx.reply(lines.join('\n'), { mentions: ids });
    }
  },
  {
    name: 'hidetag',
    aliases: ['announce'],
    category: 'Members',
    usage: 'hidetag message',
    desc: 'Send a message that notifies everyone silently',
    group: true,
    admin: true,
    async run(ctx) {
      if (!ctx.argText) return ctx.reply(usageOf(ctx));
      const ids = await allIds(ctx);
      await ctx.sock.sendMessage(ctx.chat, { text: ctx.argText, mentions: ids });
    }
  },
  {
    name: 'mute',
    aliases: ['close'],
    category: 'Group',
    usage: 'mute',
    desc: 'Only admins can send messages',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      await ctx.sock.groupSettingUpdate(ctx.chat, 'announcement');
      ctx.invalidateMeta();
      await ctx.sendButtons({ text: "Group's closed, only admins can send messages now.", buttons: [ctx.btn.reply('Open group', ctx.config.prefix + 'unmute')] });
    }
  },
  {
    name: 'unmute',
    aliases: ['open'],
    category: 'Group',
    usage: 'unmute',
    desc: 'Let everyone send messages',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      await ctx.sock.groupSettingUpdate(ctx.chat, 'not_announcement');
      ctx.invalidateMeta();
      await ctx.sendButtons({ text: "Group's open, everyone can chat again.", buttons: [ctx.btn.reply('Close group', ctx.config.prefix + 'mute')] });
    }
  },
  {
    name: 'link',
    aliases: ['invite'],
    category: 'Group',
    usage: 'link',
    desc: 'Get the group invite link',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      const code = await ctx.sock.groupInviteCode(ctx.chat);
      const url = `https://chat.whatsapp.com/${code}`;
      await ctx.sendButtons({ text: url, buttons: [ctx.btn.copy('Copy link', url), ctx.btn.reply('Reset link', ctx.config.prefix + 'revoke')] });
    }
  },
  {
    name: 'revoke',
    aliases: ['resetlink'],
    category: 'Group',
    usage: 'revoke',
    desc: 'Reset the group invite link',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      const code = await ctx.sock.groupRevokeInvite(ctx.chat);
      const url = `https://chat.whatsapp.com/${code}`;
      await ctx.sendButtons({ text: `Done, here's the new link:\n${url}`, buttons: [ctx.btn.copy('Copy link', url)] });
    }
  },
  {
    name: 'groupinfo',
    aliases: ['ginfo'],
    category: 'Group',
    usage: 'groupinfo',
    desc: 'Show group details',
    group: true,
    async run(ctx) {
      const meta = await ctx.getMeta(true);
      const admins = meta.participants.filter(util.isAdminP).length;
      const created = meta.creation ? util.formatDate(new Date(meta.creation * 1000), ctx.config.timezone) : 'unknown';
      const lines = [
        `*${meta.subject}*`,
        `👥 ${meta.participants.length} members, ${admins} admins`,
        `📅 Created ${created}`,
        meta.announce ? '🔒 Only admins can send messages' : '💬 Everyone can send messages'
      ];
      if (meta.desc) lines.push('', meta.desc);
      await ctx.sendButtons({ text: lines.join('\n'), buttons: [ctx.btn.reply('Group panel', ctx.config.prefix + 'group')] });
    }
  },
  {
    name: 'setname',
    category: 'Group',
    usage: 'setname new name',
    desc: 'Change the group name',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      if (!ctx.argText) return ctx.reply(usageOf(ctx));
      if (ctx.argText.length > 100) return ctx.reply("That name's too long, 100 characters max.");
      await ctx.sock.groupUpdateSubject(ctx.chat, ctx.argText);
      ctx.invalidateMeta();
      await ctx.reply('Done, group name changed.');
    }
  },
  {
    name: 'setdesc',
    category: 'Group',
    usage: 'setdesc new description',
    desc: 'Change the group description',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      if (!ctx.argText) return ctx.reply(usageOf(ctx));
      await ctx.sock.groupUpdateDescription(ctx.chat, ctx.argText);
      ctx.invalidateMeta();
      await ctx.reply('Done, description updated.');
    }
  },
  {
    name: 'del',
    aliases: ['delete'],
    category: 'Group',
    usage: 'del (reply to a message)',
    desc: 'Delete the replied message',
    group: true,
    admin: true,
    async run(ctx) {
      const info = util.getContext(ctx.msg.message);
      if (!info || !info.stanzaId) return ctx.reply(usageOf(ctx));
      const fromBot = !!info.participant && ctx.botIds().some(b => util.sameUser(b, info.participant));
      if (!fromBot && !ctx.isBotAdmin) return ctx.reply("I can only delete other people's messages if I'm an admin.");
      await ctx.sock.sendMessage(ctx.chat, {
        delete: { remoteJid: ctx.chat, fromMe: fromBot, id: info.stanzaId, participant: info.participant }
      });
    }
  },
  {
    name: 'group',
    aliases: ['panel'],
    category: 'Group',
    usage: 'group',
    desc: 'Open the group control panel',
    group: true,
    admin: true,
    async run(ctx) {
      const p = ctx.config.prefix;
      const rows = [
        ['mute', 'Close the group'],
        ['unmute', 'Open the group'],
        ['link', 'Get the invite link'],
        ['revoke', 'Reset the invite link'],
        ['groupinfo', 'Show group details'],
        ['tagall', 'Mention every member'],
        ['settings', 'Bot settings for this group']
      ].map(([name, description]) => ({ title: p + name, description, id: p + name }));
      await ctx.sendButtons({
        text: 'What do you want to do?',
        buttons: [ctx.btn.list('Actions', [{ title: 'Group', rows }])]
      });
    }
  }
];
