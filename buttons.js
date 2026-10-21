'use strict';

let baileys;
const load = () => baileys ||= import('@whiskeysockets/baileys');

const btn = {
  reply: (text, id) => ({ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: text, id }) }),
  url: (text, url) => ({ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: text, url, merchant_url: url }) }),
  copy: (text, code) => ({ name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: text, copy_code: code }) }),
  list: (title, sections) => ({ name: 'single_select', buttonParamsJson: JSON.stringify({ title, sections }) })
};

function asList(buttons) {
  const quick = buttons.filter(b => b.name === 'quick_reply');
  if (!quick.length) return buttons;
  const rows = quick.map(b => {
    const p = JSON.parse(b.buttonParamsJson);
    return { title: p.display_text, id: p.id };
  });
  const rest = buttons.filter(b => b.name !== 'quick_reply');
  const existing = rest.find(b => b.name === 'single_select');
  if (existing) {
    const p = JSON.parse(existing.buttonParamsJson);
    p.sections.push({ title: 'More', rows });
    existing.buttonParamsJson = JSON.stringify(p);
    return rest;
  }
  return [btn.list('Options', [{ title: 'Options', rows }]), ...rest];
}

function enabled(ctx) {
  return ctx.config.buttons !== false && ctx.store.getBot(ctx.botId).buttons;
}

function toText(text, buttons) {
  const extra = [];
  for (const b of buttons) {
    const p = JSON.parse(b.buttonParamsJson);
    if (b.name === 'quick_reply') extra.push(`${p.id}  (${p.display_text})`);
    else if (b.name === 'cta_url') extra.push(`${p.display_text}: ${p.url}`);
    else if (b.name === 'cta_copy' && !text.includes(p.copy_code)) extra.push(p.copy_code);
    else if (b.name === 'single_select') {
      for (const s of p.sections) for (const r of s.rows) extra.push(`${r.id} - ${r.description || r.title}`);
    }
  }
  return extra.length ? [text, '', ...extra].join('\n') : text;
}

function nodes(isGroup) {
  const biz = {
    tag: 'biz',
    attrs: {},
    content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }]
  };
  return isGroup ? [biz] : [biz, { tag: 'bot', attrs: { biz_bot: '1' } }];
}

async function send(ctx, { text, footer, buttons: raw }) {
  const buttons = asList(raw);
  const plain = toText(text, buttons);
  if (!enabled(ctx)) return ctx.reply(plain);
  try {
    const b = await load();
    const IM = b.proto.Message.InteractiveMessage;
    const content = {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage: IM.create({
            body: IM.Body.create({ text }),
            footer: IM.Footer.create({ text: footer || ctx.config.botName }),
            nativeFlowMessage: IM.NativeFlowMessage.create({ buttons, messageParamsJson: '' })
          })
        }
      }
    };
    const msg = b.generateWAMessageFromContent(ctx.chat, content, { quoted: ctx.msg, userJid: ctx.sock.user.id });
    await ctx.sock.relayMessage(ctx.chat, msg.message, { messageId: msg.key.id, additionalNodes: nodes(ctx.isGroup) });
  } catch (e) {
    console.error('[buttons]', e.message);
    await ctx.reply(plain);
  }
}

module.exports = { btn, send, enabled };
