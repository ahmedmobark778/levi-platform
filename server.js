require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const config = require('./core/config');
const handler = require('./core/handler');
const { makeWhatsAppManager } = require('./core/whatsapp');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  console.error('Set JWT_SECRET (32+ characters) in .env');
  process.exit(1);
}

const db = new Database(path.resolve(__dirname, process.env.DB_PATH || 'levi.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS bots(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, method TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'setup', owner_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(owner_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`);
db.prepare("UPDATE bots SET status='disconnected'").run();

const DEVELOPER = {
  name: config.devName,
  phone: config.devPhone,
  telegram: config.devTg,
  tgChannel: config.tgChannel,
  waChannel: config.waChannel
};

const adminName = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;
if (adminName && adminPassword && !db.prepare('SELECT id FROM users WHERE username=?').get(adminName)) {
  db.prepare('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)').run(adminName, bcrypt.hashSync(adminPassword, 12), 'admin');
  console.log('Admin created:', adminName);
}

const whatsapp = makeWhatsAppManager({
  db,
  sessionsDir: path.resolve(__dirname, process.env.SESSIONS_DIR || 'sessions')
});

function log(user, action, detail) {
  try {
    db.prepare('INSERT INTO activity(user_id,action,detail) VALUES(?,?,?)').run(user ? user.id : null, action, String(detail).slice(0, 200));
  } catch {}
}

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '30d' });
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    const payload = jwt.verify(token, SECRET);
    const user = db.prepare('SELECT id,username,role FROM users WHERE id=?').get(payload.id);
    if (!user) throw new Error('no user');
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'سجل دخول الأول' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'هذا الأمر خاص بالمطور' });
  next();
}

function ownedBot(req, res) {
  const bot = db.prepare('SELECT * FROM bots WHERE id=?').get(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'البوت مش موجود' });
    return null;
  }
  if (req.user.role !== 'admin' && bot.owner_id !== req.user.id) {
    res.status(403).json({ error: 'مش مسموح' });
    return null;
  }
  return bot;
}

function present(bot) {
  return { ...bot, status: whatsapp.getStatus(bot.id).status };
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '500kb' }));
app.use('/api/', rateLimit({ windowMs: 60000, limit: 300 }));
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({ windowMs: 900000, limit: 30 });

app.post('/api/auth/register', authLimiter, (req, res) => {
  const u = String(req.body.username || '').trim().toLowerCase();
  const p = String(req.body.password || '');
  if (!u || !p) return res.status(400).json({ error: 'اكتب اسم المستخدم وكلمة المرور' });
  if (u.length < 3 || u.length > 30) return res.status(400).json({ error: 'اسم المستخدم 3-30 حرف' });
  if (!/^[a-z0-9._-]+$/.test(u)) return res.status(400).json({ error: 'اسم المستخدم حروف إنجليزية وأرقام فقط' });
  if (p.length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
  if (db.prepare('SELECT id FROM users WHERE username=?').get(u)) return res.status(409).json({ error: 'الاسم محجوز' });
  const r = db.prepare('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)').run(u, bcrypt.hashSync(p, 12), 'user');
  const user = db.prepare('SELECT id,username,role FROM users WHERE id=?').get(r.lastInsertRowid);
  log(user, 'register', 'حساب جديد');
  res.json({ token: signToken(user), user });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const u = String(req.body.username || '').trim().toLowerCase();
  const p = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(u);
  if (!user || !bcrypt.compareSync(p, user.password_hash)) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  log(user, 'login', 'تسجيل دخول');
  res.json({ token: signToken(user), user: { id: user.id, username: user.username, role: user.role } });
});

app.get('/api/me', auth, (req, res) => {
  res.json({ user: db.prepare('SELECT id,username,role,created_at FROM users WHERE id=?').get(req.user.id) });
});

app.get('/api/bots', auth, (req, res) => {
  const rows = req.user.role === 'admin'
    ? db.prepare('SELECT * FROM bots ORDER BY id DESC').all()
    : db.prepare('SELECT * FROM bots WHERE owner_id=? ORDER BY id DESC').all(req.user.id);
  res.json({ bots: rows.map(present) });
});

app.post('/api/bots', auth, (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 40) || 'Levi';
  const phone = String(req.body.phone || '').replace(/\D/g, '').slice(0, 15);
  const method = req.body.method;
  if (!['qr', 'code'].includes(method)) return res.status(400).json({ error: 'اختار QR أو كود' });
  if (method === 'code' && phone.length < 8) return res.status(400).json({ error: 'أدخل رقم واتساب بصيغة دولية' });
  const r = db.prepare('INSERT INTO bots(name,phone,method,status,owner_id) VALUES(?,?,?,?,?)').run(name, phone || null, method, 'disconnected', req.user.id);
  res.json({ bot: present(db.prepare('SELECT * FROM bots WHERE id=?').get(r.lastInsertRowid)) });
});

app.delete('/api/bots/:id', auth, (req, res) => {
  const bot = ownedBot(req, res);
  if (!bot) return;
  whatsapp.remove(bot);
  db.prepare('DELETE FROM bots WHERE id=?').run(bot.id);
  res.json({ ok: true });
});

app.get('/api/bots/:id/connection', auth, (req, res) => {
  const bot = ownedBot(req, res);
  if (!bot) return;
  res.json({ connection: whatsapp.getStatus(bot.id) });
});

app.post('/api/bots/:id/connect', auth, async (req, res) => {
  const bot = ownedBot(req, res);
  if (!bot) return;
  try {
    res.json({ connection: await whatsapp.connect(bot, { requestPairing: bot.method === 'code' }) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/bots/:id/disconnect', auth, async (req, res) => {
  const bot = ownedBot(req, res);
  if (!bot) return;
  try {
    res.json({ connection: await whatsapp.disconnect(bot) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  res.json({ users: db.prepare('SELECT id,username,role,created_at FROM users ORDER BY id DESC').all() });
});

app.delete('/api/admin/users/:id', auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'مش هتحذف نفسك' });
  for (const bot of db.prepare('SELECT * FROM bots WHERE owner_id=?').all(id)) whatsapp.remove(bot);
  db.prepare('DELETE FROM bots WHERE owner_id=?').run(id);
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  res.json({ ok: true });
});

app.get('/api/dashboard', auth, (req, res) => {
  const rows = req.user.role === 'admin'
    ? db.prepare('SELECT id FROM bots').all()
    : db.prepare('SELECT id FROM bots WHERE owner_id=?').all(req.user.id);
  const connected = rows.filter(b => whatsapp.getStatus(b.id).status === 'connected').length;
  res.json({ bots: rows.length, connected, commands: handler.commandCount() });
});

app.get('/api/developer', (req, res) => res.json({ developer: DEVELOPER }));
app.get('/api/health', (req, res) => res.json({ ok: true, platform: 'Levi', version: '3.1.0' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/tools/convert', auth, adminOnly, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'مفيش ملف مرفوع' });
  const filename = path.basename(req.file.originalname || '');
  if (!filename) return res.status(400).json({ error: 'اسم الملف غير صالح' });
  try {
    let content = req.file.buffer.toString('utf8');
    content = content.replace(/NOX ZRF|NOX/gi, 'Levi');
    content = content.replace(/https:\/\/whatsapp\.com\/channel\/[A-Za-z0-9]+/g, DEVELOPER.waChannel);
    content = content.replace(/https:\/\/t\.me\/[A-Za-z0-9_]+/g, DEVELOPER.tgChannel);
    content = content.replace(/(966|201|963)\d{8,10}/g, DEVELOPER.phone);
    const sslDir = path.join(__dirname, 'ssl');
    fs.mkdirSync(sslDir, { recursive: true });
    fs.writeFileSync(path.join(sslDir, filename), content);
    res.json({ success: true, message: 'تم الحفظ في مجلد ssl', filename });
  } catch (e) {
    res.status(500).json({ error: 'فشل: ' + e.message });
  }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'مش موجود' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: err.message });
  res.status(500).send('Error');
});

const server = app.listen(PORT, () => {
  console.log('Levi running on http://localhost:' + PORT);
  whatsapp.restore().catch(e => console.error('[restore]', e.message));
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('unhandledRejection', e => console.error('[unhandledRejection]', e && e.message ? e.message : e));
