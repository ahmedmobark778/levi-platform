'use strict';
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const initSqlJs = require('sql.js');


const PLUGINS_DIR = path.join(__dirname, "plugins");
let esmPlugins = {};

async function loadESMPlugins() {
  esmPlugins = {};
  if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR);
  const files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith(".js"));
  for (const file of files) {
    try {
      const pluginPath = "file://" + path.join(PLUGINS_DIR, file);
      const module = await import(pluginPath + "?update=" + Date.now());
      const plugin = module.default || module;
      if (plugin && plugin.command) {
        const commands = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
        for (const cmd of commands) esmPlugins[cmd.toLowerCase()] = plugin;
        console.log("🔌 تم تحميل:", file);
      }
    } catch(e) { console.error("❌ فشل تحميل:", file, e.message); }
  }
}

async function runESMPlugin(plugin, sock, msg, text) {
  try {
    const args = text.trim().split(/\s+/).slice(1);
    const m = {
      chat: msg.key.remoteJid, sender: msg.key.participant || msg.key.remoteJid,
      isGroup: (msg.key.remoteJid || "").endsWith("@g.us"), text: text, key: msg.key, message: msg.message,
      reply: async (txt) => sock.sendMessage(msg.key.remoteJid, { text: txt }, { quoted: msg })
    };
    await plugin.execute(m, { conn: sock, args, command: text.split(/\s+/)[0].slice(1) });
  } catch(e) { console.error("❌ خطأ في الإضافة:", e.message); }
}

const DB_PATH = process.env.DB_PATH || 'levi.sqlite';
const SESSIONS_DIR = process.env.SESSIONS_DIR || 'sessions';
const IMAGES_DIR = path.join(__dirname, 'images');

const DEVELOPER = {
  name: 'Ahmed Mobark',
  phone: '201287881592',
  telegram: 'ahmedmohmedmobark',
  tgChannel: 'https://t.me/SE_EH0',
  waChannel: 'https://whatsapp.com/channel/0029Vb7Tdre8qJ01I3DioT01'
};

let db = null;

async function initDB() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  db.run(`CREATE TABLE IF NOT EXISTS plugins(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, code TEXT NOT NULL, owner_id INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function saveDB(){ try { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); } catch(e){} }
function dbRun(sql, params){ try { db.run(sql, params); saveDB(); } catch(e){ console.error('DB error:', e.message); } }
function dbGet(sql, params){ try { const r = db.exec(sql, params); if(!r.length) return null; const cols = r[0].columns; const vals = r[0].values[0]; const obj={}; cols.forEach((c,i)=>obj[c]=vals[i]); return obj; } catch(e){ return null; } }

const log = (user, action, detail) => { dbRun('INSERT INTO activity(user_id,action,detail) VALUES(?,?,?)', [user?.id||1, action, String(detail).slice(0,200)]); };

async function handleMessage(sock, msg) {
  
  // قراءة الملفات كل دقيقة بدل كل رسالة
  if (!global.lastPluginLoad || Date.now() - global.lastPluginLoad > 60000) {
    await loadESMPlugins();
    global.lastPluginLoad = Date.now();
  }
    
  const chat = msg.key.remoteJid;
  const isGroup = chat.endsWith('@g.us');
  const sender = isGroup ? (msg.key.participant || '') : chat;
  const senderNum = sender.split('@')[0].split(':')[0].replace(/\D/g, '');
  const text = extractText(msg.message).trim();
  if (!text || msg.key.fromMe || chat === 'status@broadcast') return;
  if (!text.startsWith('.')) return;

  const cmd = text.slice(1).split(/\s+/)[0];
  const args = text.slice(cmd.length + 1).trim();
  const ctx = { sender, senderNum, pushName: msg.pushName, args, isGroup, chat, sock };
  const isDev = senderNum === DEVELOPER.phone.replace(/\D/g,'');

  
      if (cmd === 'اوامر' || cmd === 'قائمة') {
        const uptime = process.uptime();
        const h = Math.floor(uptime / 3600);
        const m = Math.floor(uptime / 60) % 60;
        const s = Math.floor(uptime) % 60;
        const timeStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        
        const menuText = `
╔═══━━━─── • ───━━━═══╗
⟡ ⚡ Levi 𝑩𝑶𝑻 🩸 ⟡
╚═══━━━─── • ───━━━═══╝

╭─ • ─ 𓆩 معلومات 𓆪 ─ • ─╮
│ ✦ المطور : Ahmed Mobark
│ ✦ شغال من : ${timeStr}
╰─ • ───────── • ─╯

◈ ━━━━━━━━ ⸙ ━━━━━━━━ ◈
𓂀 قـائـمـة الأوامـر 𓂀
◈ ━━━━━━━━ ⸙ ━━━━━━━━ ◈

╭─⟡─ عام ─╮
│ ✦ .سلام
│ ✦ .وقت
│ ✦ .تاريخ
│ ✦ .اسمي
│ ✦ .ايدي
│ ✦ .حي
│ ✦ .بنق
╰───────────────╯

╭─⟡─ ترفيهي ─╮
│ ✦ .نكتة
│ ✦ .دعاء
│ ✦ .ذكر
│ ✦ .اية
│ ✦ .اقتباس
│ ✦ .حظ
│ ✦ .عملة
│ ✦ .حجر
│ ✦ .نرد
╰───────────────╯

╭─⟡─ معلومات ─╮
│ ✦ .البوت
│ ✦ .المطور
│ ✦ .القناة
╰───────────────╯

⟡───────────────⟡
𓆩 ☠️ انتهت القائمة ☠️ 𓆪
`;
        await sock.sendMessage(chat, { text: menuText }, { quoted: msg });
        return;
      }

      
  
  
  
  

  
    // 🔌 فحص الإضافات
    if (loadedPlugins[cmd]) {
      await runPlugin(loadedPlugins[cmd], sock, msg, args);
      return;
    }
  
      if (esmPlugins[cmd.toLowerCase()]) {
    await runESMPlugin(esmPlugins[cmd.toLowerCase()], sock, msg, text);
    return;
  }

  if (COMMANDS[cmd]) {
    let r = COMMANDS[cmd];
    if (typeof r === 'function') r = r(ctx);
    if (Array.isArray(r)) r = r[Math.floor(Math.random()*r.length)];
    await sock.sendMessage(chat, { text: r }, { quoted: msg });
    return;
  }

  const plugin = dbGet('SELECT * FROM plugins WHERE name=?', [cmd]);
  if (plugin) {
    if (!isDev) {
      const c = '⚠️ *هذا الأمر خاص بالمطور*';
      if (!await sendImage(sock, chat, 'error', c, msg)) await sock.sendMessage(chat, { text: c }, { quoted: msg });
      return;
    }
    try {
      const vm = require('vm');
      const sandbox = { ctx, result: null };
      vm.createContext(sandbox);
      vm.runInContext(plugin.code, sandbox, { timeout: 3000 });
      if (sandbox.result) await sock.sendMessage(chat, { text: String(sandbox.result) }, { quoted: msg });
    } catch(e) { await sock.sendMessage(chat, { text: '⚠️ ' + e.message }, { quoted: msg }); }
    return;
  }
}


// ==========================================
// 🛡️ Watchdog System (Anti-Disconnect)
// ==========================================
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;

function startWatchdog(sock, phone) {
  console.log('🛡️ Watchdog Started: Monitoring connection...');
  
  setInterval(async () => {
    try {
      // التأكد من الاتصال
      if (sock.ws.readyState !== 1) { // 1 means OPEN
        console.log('⚠️ Connection lost. Reconnecting...');
        reconnectAttempts++;
        
        if (reconnectAttempts <= MAX_RECONNECT) {
          try {
            await sock.end(undefined);
            // إعادة التشغيل
            const newSock = await connectWithPairingCode(phone);
            startWatchdog(newSock, phone);
          } catch (e) {
            console.error('❌ Reconnect failed:', e.message);
          }
        } else {
          console.log('❌ Max reconnect attempts reached. Restarting process...');
          process.exit(1); // إعادة تشغيل السيرفر بالكامل
        }
      } else {
        reconnectAttempts = 0; // تصفير العداد لو الاتصال شغال
      }
    } catch (e) {
      console.error('Watchdog Error:', e.message);
    }
  }, 30000); // فحص كل 30 ثانية
}
async function connectWithPairingCode(phone) {
  const B = await getBaileys();
  const makeWASocket = B.default || B.makeWASocket;
  const { state: authState, saveCreds } = await B.useMultiFileAuthState(path.join(SESSIONS_DIR, 'main'));
  const { version } = await B.fetchLatestWaWebVersion();

  const sock = makeWASocket({
    version,
    auth: authState,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    browser: ['Ubuntu', 'Chrome', '22.04']
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', ({messages,type}) => { console.log('📨 RAW upsert:', type, messages.length); });
  sock.ev.on('messages.update', (u) => { console.log('🔄 msg update:', u.length); });
  sock.ev.on('presence.update', (p) => { console.log('👁️ presence update'); });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type === 'notify') {
      for (const m of messages) {
        handleMessage(sock, m).catch(e => console.error('msg error:', e.message));
      }
    }
  });

  sock.ev.on('connection.update', async (update) => {
    if (update.connection === 'open') {
      console.log('\n✅✅✅ تم الربط بنجاح! البوت شغال دلوقتي.');
      console.log('📱 ابعت أي أمر في واتساب (زي .سلام) وشوف الرد.\n');
    }
    if (update.connection === 'close') {
      const code = update.lastDisconnect?.error?.output?.statusCode;
      if (code === 401) {
        console.log('\n❌ تم تسجيل الخروج. امسح مجلد sessions وأعد التشغيل.');
      } else {
        console.log('\n⚠️  انقطع الاتصال، جاري إعادة المحاولة...');
        setTimeout(() => connectWithPairingCode(phone).catch(e => console.error(e.message)), 3000);
      }
    }
  });

  if (!authState.creds.registered) {
    console.log('⏳ جاري طلب كود الاقتران...\n');
    await new Promise(r => setTimeout(r, 2000));
    try {
      const cleanPhone = String(phone).replace(/\D/g, '');
      const code = await sock.requestPairingCode(cleanPhone);
      console.log('╔═══════════════════════════════════════╗');
      console.log('║      🔢 كود الاقتران بتاعك:           ║');
      console.log('║                                       ║');
      console.log('║         ' + code + '         ║');
      console.log('║                                       ║');
      console.log('╚═══════════════════════════════════════╝');
      console.log('\n📱 افتح واتساب > الإعدادات > الأجهزة المرتبطة');
      console.log('🔗 اختار "ربط برقم الهاتف"');
      console.log('⌨️  اكتب الكود اللي فوق');
      console.log('\n⏳ في انتظار الربط...\n');
    } catch(e) {
      console.error('❌ فشل طلب الكود:', e.message);
    }
  }
  return sock;
}

async function main() {
  await initDB();
  const phone = process.argv[2];
  if (!phone) {
    console.log('❌ اكتب رقمك بالصيغة الدولية');
    console.log('مثال: node bot.js 201287881592');
    process.exit(1);
  }
  console.log('╔═══════════════════════════════════════╗');
  console.log('║        ⚡ LEVI BOT STARTING ⚡        ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('📱 الرقم: ' + phone);
  console.log('👑 المطور: ' + DEVELOPER.name + '\n');
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.mkdirSync(path.join(SESSIONS_DIR, 'main'), { recursive: true });
  try {
    await connectWithPairingCode(phone);
  } catch(e) {
    console.error('❌ خطأ:', e.message);
  }
}

main().catch(e => console.error('Fatal:', e.message));
