require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.JWT_SECRET || 'super_secret_key_change_me';

const db = new Database(process.env.DB_PATH || 'levi.sqlite');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS bots(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, method TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'setup', owner_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS plugins(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, code TEXT NOT NULL, owner_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS chat_messages(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, message TEXT NOT NULL, is_private INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`);

app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:'10mb'}));
app.use(express.static(path.join(__dirname, 'public')));

const DEVELOPER = {
  name: 'Ahmed Mobark',
  phone: '201287881592',
  telegram: 'ahmedmohmedmobark',
  tgChannel: 'https://t.me/se_eh0',
  waChannel: 'https://whatsapp.com/channel/0029Vb7Tdre8qJ01I3DioT01'
};

const GEMINI_KEYS = [
  "AQ.Ab8RN6L6GlqGPeyJQfsvtAtMP3xAcvnW2pBGzMlqlu2k6sfFAA",
  "AQ.Ab8RN6LHRYMlFvmt82gZhvLUjPRBj0lKwoY7w53DMTgKnrok8w",
  "AQ.Ab8RN6I46W47wyC_srOaoqMgFLjZBOSKbQm-vcxfu5cYnY4rQw",
  "AQ.Ab8RN6JFR0qKhrxW_Yd5QJJVfzX3wInKGaAie-Vg8ZP5rOY1-Q"
];

function auth(req,res,next){ const t = (req.headers.authorization||'').replace(/^Bearer /,''); try{ req.user = jwt.verify(t, SECRET); next(); } catch { res.status(401).json({error:'سجل دخول الأول'}); } }
function adminOnly(req,res,next){ if(req.user.role !== 'admin') return res.status(403).json({error:'⚠️ هذا الأمر خاص بالمطور'}); next(); }

// ================= Auth Routes =================
app.post('/api/auth/register', (req,res)=>{
  const u = String(req.body.username||'').trim().toLowerCase(), p = String(req.body.password||'');
  if(!u || !p || p.length < 6) return res.status(400).json({error:'البيانات غير صحيحة'});
  if(db.prepare('SELECT id FROM users WHERE username=?').get(u)) return res.status(409).json({error:'الاسم محجوز'});
  const r = db.prepare('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)').run(u, bcrypt.hashSync(p,12), 'user');
  const user = db.prepare('SELECT id,username,role FROM users WHERE id=?').get(r.lastInsertRowid);
  res.json({token: jwt.sign({id:user.id,username:user.username,role:user.role}, SECRET, {expiresIn:'30d'}), user});
});

app.post('/api/auth/login', (req,res)=>{
  const u = String(req.body.username||'').trim().toLowerCase(), p = String(req.body.password||'');
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(u);
  if(!user || !bcrypt.compareSync(p, user.password_hash)) return res.status(401).json({error:'بيانات الدخول غير صحيحة'});
  res.json({token: jwt.sign({id:user.id,username:user.username,role:user.role}, SECRET, {expiresIn:'30d'}), user:{id:user.id,username:user.username,role:user.role}});
});

// ================= Developer & Bots Routes =================
app.get('/api/developer', (req,res)=> res.json({developer: DEVELOPER}));

app.get('/api/bots', auth, (req,res)=>{
  const bots = req.user.role==='admin' ? db.prepare('SELECT * FROM bots ORDER BY id DESC').all() : db.prepare('SELECT * FROM bots WHERE owner_id=? ORDER BY id DESC').all(req.user.id);
  res.json({bots});
});

app.post('/api/bots', auth, (req,res)=>{
  const r = db.prepare('INSERT INTO bots(name,phone,method,status,owner_id) VALUES(?,?,?,?,?)').run(req.body.name||'Levi', req.body.phone, req.body.method, 'setup', req.user.id);
  res.json({bot: db.prepare('SELECT * FROM bots WHERE id=?').get(r.lastInsertRowid)});
});

// ================= Admin Users Route =================
app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id DESC').all();
    res.json({ users });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


app.post('/api/admin/users/:id/role', auth, adminOnly, (req, res) => {
  try {
    const id = Number(req.params.id);
    const newRole = req.body.role === 'admin' ? 'admin' : 'user';
    if(id === req.user.id) return res.status(400).json({error: 'مش هتقدر تغير صلاحيتك إنت'});
    db.prepare('UPDATE users SET role=? WHERE id=?').run(newRole, id);
    res.json({ ok: true, role: newRole });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ================= Plugins & Files Routes =================
const multerPlugins = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => { const dir = path.join(__dirname, 'plugins'); if (!fs.existsSync(dir)) fs.mkdirSync(dir); cb(null, dir); },
  filename: (req, file, cb) => cb(null, file.originalname)
}), limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/plugins/upload', auth, adminOnly, multerPlugins.array('files', 10), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'مفيش ملفات مرفوعة' });
  res.json({ success: true, count: req.files.length });
});

app.get('/api/plugins/files', auth, adminOnly, (req, res) => {
  const dir = path.join(__dirname, 'plugins');
  if (!fs.existsSync(dir)) return res.json({ files: [] });
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => {
    const stats = fs.statSync(path.join(dir, f));
    return { name: f, size: (stats.size / 1024).toFixed(2) + ' KB' };
  });
  res.json({ files });
});

app.post('/api/plugins/create', auth, adminOnly, (req, res) => {
  const { fileName, type } = req.body;
  let name = fileName.trim().replace(/[^a-zA-Z0-9_]/g, '') + '.js';
  const filePath = path.join(__dirname, 'plugins', name);
  if (fs.existsSync(filePath)) return res.status(400).json({ error: 'الملف موجود' });
  
  const multiTpl = "// ملف تجميعي\nexport default {\n  command: ['ping', 'الاسم'],\n  execute: async (m, { conn }) => {\n    const cmd = m.text.split(' ')[0].replace('.', '').toLowerCase();\n    if (cmd === 'ping') await m.reply('🏓 Pong!');\n    if (cmd === 'الاسم') await m.reply('أنا البوت 🤖');\n  }\n};";
  const singleTpl = "// ملف عادي\nexport default {\n  command: 'test',\n  execute: async (m) => await m.reply('أهلاً بك!')\n};";
  
  fs.writeFileSync(filePath, type === 'multi' ? multiTpl : singleTpl, 'utf8');
  res.json({ success: true, filename: name });
});

app.get('/api/plugins/files/read/:name', auth, adminOnly, (req, res) => {
  const filePath = path.join(__dirname, 'plugins', req.params.name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'مش موجود' });
  res.json({ content: fs.readFileSync(filePath, 'utf8') });
});

app.post('/api/plugins/files/save/:name', auth, adminOnly, (req, res) => {
  const filePath = path.join(__dirname, 'plugins', req.params.name);
  fs.writeFileSync(filePath, req.body.code, 'utf8');
  res.json({ ok: true });
});

app.delete('/api/plugins/files/:name', auth, adminOnly, (req, res) => {
  const filePath = path.join(__dirname, 'plugins', req.params.name);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// ================= Chats Routes =================
app.get('/api/chat/messages', auth, (req, res) => {
  const isPrivate = req.query.type === 'private' ? 1 : 0;
  if (isPrivate && req.user.role !== 'admin') return res.status(403).json({ error: 'مش مسموح' });
  res.json({ messages: db.prepare('SELECT * FROM chat_messages WHERE is_private = ? ORDER BY id DESC LIMIT 50').all(isPrivate).reverse() });
});

app.post('/api/chat/messages', auth, (req, res) => {
  const isPrivate = req.body.type === 'private' ? 1 : 0;
  if (isPrivate && req.user.role !== 'admin') return res.status(403).json({ error: 'مش مسموح' });
  db.prepare('INSERT INTO chat_messages(username, message, is_private) VALUES(?, ?, ?)').run(req.user.username, req.body.message, isPrivate);
  res.json({ ok: true });
});

// ================= AI Route (Clean & Async) =================
app.post('/api/ai/chat', auth, async (req, res) => {
  try {
    const msg = String(req.body.message || '');
    if (!msg) return res.status(400).json({ error: 'اكتب رسالتك' });

    let reply = null;
    for (const key of GEMINI_KEYS) {
      try {
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
          body: JSON.stringify({ contents: [{ parts: [{ text: msg }] }] })
        });
        const data = await response.json();
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
          reply = data.candidates[0].content.parts[0].text;
          break; 
        }
      } catch(e) { continue; }
    }

    if (reply) res.json({ reply });
    else res.status(500).json({ error: 'المفاتيح مش شغالة أو انتهت.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= Start Server =================

// ================= 🛡️ Keep-Alive (منع النوم على Render) =================
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;

if (RENDER_URL) {
  console.log('🛡️ Keep-Alive شغال على:', RENDER_URL);
  setInterval(() => {
    fetch(RENDER_URL + '/api/health')
      .then(res => console.log('🛡️ Keep-Alive Ping:', res.status))
      .catch(err => console.log('🛡️ Keep-Alive Error:', err.message));
  }, 14 * 60 * 1000); // كل 14 دقيقة
} else {
  console.log('ℹ️ Keep-Alive متعطل (مش شغال على Render).');
}

const server = app.listen(PORT, () => {
  console.log('🚀 Levi running on http://localhost:' + PORT);
});
