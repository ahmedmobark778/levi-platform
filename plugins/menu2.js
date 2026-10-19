const CATEGORIES = [
    [1, '『 الـتـحـمـيـل 』', 'downloads', '📂'],
    [2, '『 الـمـجـمـوعـات 』', 'group', '🛡️'],
    [3, '『 الـمـلـصـقـات 』', 'sticker', '🃏'],
    [4, '『 الـمـطـوريـن 』', 'owner', '👑'],
    [5, '『 الـدعــــــم 』', 'support', '✳️'],
    [6, '『 الـأدوات 』', 'tools', '⚙️'],
    [7, '『 الـبـحـث 』', 'search', '🔍'],
    [8, '『 الـأدمــــن 』', 'admin', '⚔️'],
    [9, '『 الـألـعـاب 』', 'games', '🎮'],
    [10, '『 الـچـيـف 』', 'gif', '🖼️'],
    [11, '『 الـبـنـك 』', 'bank', '💳'],
    [12, '『 الـذكـاء الاصـطـنـاعـي 』', 'ai', '🤖'],
    [13, '『 الـبـوتـات الـفـرعـيـة 』', 'sub', '⛓️'],
    [14, '『 مـعـلـومـات الـبـوت 』', 'info', '📜'],
    [15, '『 الـنـقـابـــــات 』', 'nicknames', '🏷️'],
    [16, '『 الـلـوجـوهــــات 』', 'logos', '🎨'],
    [17, '『 تـغـيـيـر الأصـوات 』', 'voices', '🎙️'],
    [18, '『 الإسـلامـيـات 』', 'islamic', '🕌']
];

const getCat = n => CATEGORIES.find(c => c[0] === n);

const getImg = (bot) => {
    const images = bot?.config?.info?.images || global.config?.info?.images;
    if (!images) return "https://files.catbox.moe/yke73w.jpg";
    return Array.isArray(images) ? images[Math.floor(Math.random() * images.length)] : images;
};

const cleanContext = (jid) => ({
    mentionedJid: [jid],
    isForwarded: true,
    forwardingScore: 1,
    forwardedNewsletterMessageInfo: {
        newsletterJid: '120363401670228863@newsletter',
        newsletterName: '𝑭𝒍𝒂𝒔𝒉𝒃𝒂𝒄𝒌',
        serverMessageId: 0
    }
});

async function handler(m, { conn, bot, command, args }) {
    const selected = parseInt(args[0]);
    const now = new Date();
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600).toString().padStart(2, '0');
    const m_ = Math.floor((uptime % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(uptime % 60).toString().padStart(2, '0');
    const uptimeFormatted = `${h}:${m_}:${s}`;
    
    const date = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    const time = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const sections = [{
        title: "🏴‍☠️ ┇ levi 𝑮𝑨𝑻𝑬𝑾𝑨𝒀 ┇ 🩸",
        rows: CATEGORIES.map(c => ({
            title: `${c[0]} ⚡ ${c[1]} ${c[3]}`,
            description: `Explore commands for ${c[1]} section`,
            id: `.${command} ${c[0]}`
        }))
    }];

    if (!selected && !args[0]) {
        const menuText = `
☠️ *SYSTEM CORE INITIALIZED* ☠️
━━━━━━━━━━━━━━━━━━━━━━
  ⚡ *USER* ⭢ @${m.pushName || 'User'}
  🤖 *BOT* ⭢ 𝑱.𝑨.𝑵 𝑩𝑶𝑻 🩸
  🟢 *STATUS* ⭢ 𝑶𝑵𝑳𝑰𝑵𝑬
  ⏱️ *UPTIME* ⭢ ${uptimeFormatted}
  📅 *DATE* ⭢ ${date}
  🕐 *TIME* ⭢ ${time}
━━━━━━━━━━━━━━━━━━━━━━
🔥 *ACCESS LEVEL: ROOT*
💀 *WELCOME TO THE VOID*
━━━━━━━━━━━━━━━━━━━━━━
> levi 𝑩𝑶𝑻 ⚡ 𝑺𝒕𝒂𝒚 𝑫𝒆𝒗𝒂𝒔𝒕𝒂𝒕𝒊𝒏𝒈 🩸
`;
        
        await conn.sendButtonNormal(m.chat, {
            media: { url: "https://files.catbox.moe/yke73w.jpg" },
            mediaType: 'image',
            caption: menuText,
            buttons: [
                {
                    name: "cta_url",
                    params: {
                        display_text: "✬ .•𓍢𝙲𝙷𝙰𝙽𝙽𝙴𝙻 ❆ ⃟⃝⃕🤎𝙳𝙴𝚅ᰔᩚ",
                        url: "https://whatsapp.com/channel❆ ⃟⃝⃕🤎𝙳𝙴𝚅ᰔᩚ",
                        url: "https://whatsapp.com/channel/channelDAWtP59pqx3c"
                    }/0029VbAwIeZ7DAWtP59pqx3c"
                    }
               title               {
                    name: "single_select",
                    params: {
                        title: "📜 𝗺𝗮𝗜𝗡 𝗺𝗘𝗡𝗨 𓅃",
                        sections: sections
                    }
                },
                {
                    name: "quick_reply",
                    params: {
                        display_text: "✬ .♡تنـصيـب❆ ⃟⃝⃕🥷ᰔᩚ",
                        id: ".تنصيب"
                    }
                }
            ],
            mentions: [m.sender],
            contextInfo: cleanContext(m.sender)
        }, m);
        return;
    }

    const cat = getCat(selected);
    const botImg = getImg(bot);

    if (!cat) {
        return conn.sendMessage(m.chat, { 
            image: { url: botImg },
            caption: '❌ ┇ *ERROR: INVALID CATEGORY ID*', 
            contextInfo: cleanContext(m.sender) 
        }, { quoted: m });
    }

    const cmds = await bot.getAllCommands();
    const categoryCmds = cmds.filter(c => c.category === cat[2]);
    
    if (!categoryCmds.length) {
        return conn.sendMessage(m.chat, { 
            image: { url: botImg },
            caption: `❌ ┇ *EMPTY_FOLDER: ${cat[1]}*`, 
            contextInfo: cleanContext(m.sender) 
        }, { quoted: m });
    }

    // تنسيق قائمة الأوامر المطلوب
    let cmdsList = "";
    categoryCmds.forEach((c, index) => {
        const usages = Array.isArray(c.usage) ? c.usage : [c.usage];
        usages.filter(Boolean).forEach(usage => {
            const currentCount = cmdsList.split('\n').filter(line => line.startsWith('>')).length + 1;
            cmdsList += `> 〘${currentCount}〙נ← \`.${usage}\`\n`;
        });
    });

    const resultText = `
*~=========================~*
*┃⌯${cat[3]}︙ 〘 قـسـم ${cat[1]} 〙*
*~=========================~*
${cmdsList}
*~=========================~*
*┃⌯${cat[3]}︙~נ 〘🔱 levi 𝑩𝑶𝑻 🔱 〙*
*~=========================~*
> levi ᗷOT
`;

    await conn.sendButtonNormal(m.chat, {
        media: { url: botImg },
        mediaType: 'image',
        caption: resultText.trim(),
        buttons: [
            {
                name: "single_select",
                params: {
                    title: "✬ .•𓍢levi_bot💛ᰔᩚ",
                    sections: sections
                }
            }
        ],
        contextInfo: cleanContext(m.sender)
    }, m);
}

handler.command = ['اوامر','menu'];
export default handler;
