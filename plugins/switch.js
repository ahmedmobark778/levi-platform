'use strict';

const FEATURES = {
  antilink: 'Antilink',
  welcome: 'Welcome'
};

function label(value) {
  return value ? 'on' : 'off';
}

function done(ctx, text) {
  const p = ctx.config.prefix;
  const buttons = ctx.isGroup
    ? [ctx.btn.reply('Settings', p + 'settings'), ctx.btn.reply('Status', p + 'status')]
    : [ctx.btn.reply('Status', p + 'status'), ctx.btn.reply('Menu', p + 'menu')];
  return ctx.sendButtons({ text, buttons });
}

async function toggle(ctx, value) {
  const feature = (ctx.args[0] || '').toLowerCase();
  const p = ctx.config.prefix;
  if (feature && !FEATURES[feature]) {
    return ctx.reply(`Try ${p}on or ${p}off, or add antilink or welcome after it, like ${p}on antilink`);
  }

  if (!ctx.isGroup) {
    if (!ctx.isOwner) return ctx.reply('Only my owner can switch me on or off from a private chat.');
    if (feature) return ctx.reply('That setting is per group, so use it inside a group.');
    ctx.store.setBot(ctx.botId, { enabled: value });
    return done(ctx, value ? "I'm back on everywhere 👍" : `Going quiet everywhere. Send ${p}on when you want me back.`);
  }

  await ctx.loadAccess();
  if (!ctx.isOwner && !ctx.isAdmin) return ctx.reply('Only admins can do that.');

  if (feature) {
    ctx.store.setChat(ctx.botId, ctx.chat, { [feature]: value });
    const text = {
      antilink: value ? "Antilink is on, I'll remove anyone who posts group links." : 'Antilink is off.',
      welcome: value ? "I'll welcome new members from now on." : 'No more welcome messages.'
    }[feature];
    const note = feature === 'antilink' && value && !ctx.isBotAdmin
      ? "\nI'm not an admin here though, so make me one or it won't work."
      : '';
    return done(ctx, text + note);
  }

  ctx.store.setChat(ctx.botId, ctx.chat, { enabled: value });
  return done(ctx, value ? "Okay, I'm back on in this group 👍" : `Alright, I'll stay quiet here. Admins can send ${p}on to bring me back.`);
}

module.exports = [
  {
    name: 'on',
    category: 'Settings',
    usage: 'on [antilink|welcome]',
    desc: 'Turn the bot or a feature on',
    run: ctx => toggle(ctx, true)
  },
  {
    name: 'off',
    category: 'Settings',
    usage: 'off [antilink|welcome]',
    desc: 'Turn the bot or a feature off',
    run: ctx => toggle(ctx, false)
  },
  {
    name: 'settings',
    aliases: ['config'],
    category: 'Settings',
    usage: 'settings',
    desc: 'Open the group settings buttons',
    group: true,
    admin: true,
    async run(ctx) {
      const p = ctx.config.prefix;
      const f = ctx.store.getChat(ctx.botId, ctx.chat);
      const flip = (name, on, key) => ctx.btn.reply(`${on ? 'Turn off' : 'Turn on'} ${name}`, `${p}${on ? 'off' : 'on'}${key ? ' ' + key : ''}`);
      await ctx.sendButtons({
        text: `Settings for this group\n\nBot: ${label(f.enabled)}\nAntilink: ${label(f.antilink)}\nWelcome: ${label(f.welcome)}\n\nTap to change:`,
        buttons: [flip('Bot', f.enabled, ''), flip('Antilink', f.antilink, 'antilink'), flip('Welcome', f.welcome, 'welcome')]
      });
    }
  },
  {
    name: 'buttons',
    category: 'Settings',
    usage: 'buttons on|off',
    desc: 'Owner only, buttons on or off',
    owner: true,
    async run(ctx) {
      const v = (ctx.args[0] || '').toLowerCase();
      if (v !== 'on' && v !== 'off') {
        return ctx.reply(`Buttons are ${label(ctx.store.getBot(ctx.botId).buttons)} right now. Use ${ctx.config.prefix}buttons on or ${ctx.config.prefix}buttons off to change it.`);
      }
      ctx.store.setBot(ctx.botId, { buttons: v === 'on' });
      return ctx.reply(v === 'on' ? 'Done, buttons are on.' : "Done, buttons are off. I'll send plain text instead.");
    }
  }
];
