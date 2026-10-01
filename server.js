'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const QRCode = require('qrcode');
const { rateLimit } = require('express-rate-limit');
const { pool, query } = require('./src/db');
const { normalizePhone, shortRef, cleanText, validSlug } = require('./src/utils');

const app = express();
const root = __dirname;
const PgStore = connectPgSimple(session);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 }, fileFilter: (_req, file, cb) => cb(null, /^image\/(png|jpeg|webp|svg\+xml)$/.test(file.mimetype)) });
const loginLocks = new Map();

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is required in production');

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(session({
  store: new PgStore({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'local-development-only-change-me',
  name: 'muakkad.sid',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }
}));

const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 80, standardHeaders: 'draft-8', legacyHeaders: false });
const submitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false });

app.use('/api/public', publicLimiter);
app.use('/api/public/:slug', async (req, res, next) => {
  if (req.method === 'GET') return next();
  const office = await loadOffice(req.params.slug);
  if (office?.preview_only) return res.status(403).json({ error: 'نسخة للمراجعة فقط؛ الحجز لم يُفعّل بعد.' });
  next();
});
app.use('/styles.css', express.static(path.join(root, 'styles.css')));
app.use('/app.js', express.static(path.join(root, 'app.js')));
app.use('/hamad', express.static(path.join(root, 'hamad'), { index: false }));
app.use('/platform', express.static(path.join(root, 'public')));

function csrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  return req.session.csrfToken;
}

function requireCsrf(req, res, next) {
  if (!req.session.csrfToken || req.get('x-csrf-token') !== req.session.csrfToken) return res.status(403).json({ error: 'رمز الحماية غير صالح. حدّث الصفحة.' });
  next();
}

function requireAuth(role) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'سجّل الدخول أولًا.' });
    if (role && req.session.user.role !== role) return res.status(403).json({ error: 'غير مصرح.' });
    next();
  };
}

// لا يصل المستخدم لأي بيانات قبل تغيير كلمة المرور المؤقتة
function requirePasswordChanged(req, res, next) {
  if (req.session.user?.mustChangePassword) return res.status(403).json({ error: 'غيّر كلمة المرور المؤقتة أولًا.', mustChangePassword: true });
  next();
}

function pageFor(role, file) {
  return (req, res) => {
    const user = req.session.user;
    if (!user || user.role !== role) return res.redirect('/login');
    res.sendFile(path.join(root, 'public', file));
  };
}

function officeScope(req) {
  return req.session.user.role === 'owner_admin' ? null : req.session.user.officeId;
}

function dateClause(range, column = 'created_at') {
  const map = { today: "DATE_TRUNC('day', NOW())", '7d': "NOW() - INTERVAL '7 days'", '30d': "NOW() - INTERVAL '30 days'" };
  return map[range] ? `AND ${column} >= ${map[range]}` : '';
}

function safeOffice(row) {
  return {
    slug: row.slug, name: row.name, logoUrl: row.logo_url, brandColors: row.brand_colors,
    whatsapp: row.whatsapp, price: row.price, duration: row.duration_min,
    times: row.workspace_config?.enabled ? [`${row.workspace_config.start}–${row.workspace_config.end}`] : row.periods,
    allDays: row.workspace_config?.enabled ? row.workspace_config.days.length===7 : row.all_days, caseTypes: row.case_types,
    bankName: row.bank_name, accountName: row.account_name, iban: row.iban,
    cancelPolicy: row.cancel_policy, active: row.active, planStatus: row.plan_status, draft: !!row.preview_only,
    workspace: row.workspace_config
  };
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

async function loadOffice(slug) {
  const result = await query('SELECT * FROM offices WHERE slug=$1', [slug]);
  return result.rows[0] || null;
}

app.get('/health', async (_req, res) => {
  try { await query('SELECT 1'); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false }); }
});

app.get('/', (_req, res) => res.redirect('/demo'));
app.get('/demo', (_req, res) => res.sendFile(path.join(root, 'index.html')));
app.get('/privacy', (_req, res) => res.sendFile(path.join(root, 'public', 'privacy.html')));

app.get('/api/csrf', async (req, res, next) => {
  try {
    if (req.session.user) {
      const result = await query('SELECT must_change_password FROM users WHERE id=$1', [req.session.user.id]);
      if (result.rows[0]) req.session.user.mustChangePassword = result.rows[0].must_change_password;
    }
    res.json({ token: csrfToken(req), user: req.session.user || null });
  } catch (error) { next(error); }
});

app.post('/api/login', requireCsrf, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const lock = loginLocks.get(email);
  if (lock?.until > Date.now()) return res.status(429).json({ error: 'محاولات كثيرة. حاول بعد 15 دقيقة.' });
  const result = await query('SELECT id,office_id,email,password_hash,role,must_change_password,locked_until FROM users WHERE email=$1', [email]);
  const user = result.rows[0];
  const ok = user && (!user.locked_until || new Date(user.locked_until) <= new Date()) && await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    const next = { count: (lock?.count || 0) + 1, until: 0 };
    if (next.count >= 5) next.until = Date.now() + 15 * 60 * 1000;
    loginLocks.set(email, next);
    return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة.' });
  }
  loginLocks.delete(email);
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: 'تعذر بدء الجلسة.' });
    req.session.user = { id: user.id, officeId: user.office_id, email: user.email, role: user.role, mustChangePassword: user.must_change_password };
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    res.json({ ok: true, role: user.role, mustChangePassword: user.must_change_password });
  });
});

app.post('/api/logout', requireAuth(), requireCsrf, (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.post('/api/change-password', requireAuth(), requireCsrf, async (req, res) => {
  const password = String(req.body.password || '');
  if (password.length < 10) return res.status(400).json({ error: 'كلمة المرور لازم تكون 10 أحرف على الأقل.' });
  const hash = await bcrypt.hash(password, 12);
  await query('UPDATE users SET password_hash=$1,must_change_password=FALSE WHERE id=$2', [hash, req.session.user.id]);
  req.session.user.mustChangePassword = false;
  res.json({ ok: true });
});

app.get('/login', (_req, res) => res.sendFile(path.join(root, 'public', 'login.html')));
app.get('/dashboard', async (req,res) => {
  if (req.session.user?.role !== 'lawyer') return res.redirect('/login');
  const office = (await query('SELECT workspace_config FROM offices WHERE id=$1',[req.session.user.officeId])).rows[0];
  res.sendFile(path.join(root,'public',office?.workspace_config?.enabled ? 'workspace-dashboard.html' : 'dashboard.html'));
});
app.get('/admin', pageFor('owner_admin', 'admin.html'));
app.use(['/api/dashboard', '/api/admin', '/api/workspace'], (req, res, next) => (req.session.user ? requirePasswordChanged(req, res, next) : next()));

require('./src/workspace')(app,{ pool,query,loadOffice,safeOffice,requireAuth,requireCsrf,submitLimiter });
app.use('/api/public/:slug',async(req,res,next)=>{
  if (req.method !== 'GET' && ['/start','/progress','/submit'].includes(req.path)) {
    const office=await loadOffice(req.params.slug);
    if(office?.workspace_config?.enabled) return res.status(400).json({error:'استخدم نموذج الحجز في رابط المكتب.'});
  }
  next();
});

app.get('/api/public/:slug/office', async (req, res) => {
  const office = await loadOffice(req.params.slug);
  if (!office) return res.status(404).json({ error: 'المكتب غير موجود.' });
  res.json(safeOffice(office));
});

app.post('/api/public/:slug/event', async (req, res) => {
  const office = await loadOffice(req.params.slug);
  if (!office?.active) return res.status(404).json({ error: 'الخدمة غير متاحة.' });
  const type = ['visit','started','step_reached','submitted'].includes(req.body.type) ? req.body.type : null;
  const sessionHash = cleanText(req.body.sessionHash, 80);
  const step = Number(req.body.step) || null;
  if (!type || sessionHash.length < 12) return res.status(400).json({ error: 'بيانات الحدث غير صالحة.' });
  await query('INSERT INTO events (office_id,type,step,session_hash) VALUES ($1,$2,$3,$4)', [office.id, type, step, sessionHash]);
  res.status(204).end();
});

app.post('/api/public/:slug/start', async (req, res) => {
  const office = await loadOffice(req.params.slug);
  if (!office?.active) return res.status(404).json({ error: 'الخدمة غير متاحة.' });
  const sessionHash = cleanText(req.body.sessionHash, 80);
  const caseType = cleanText(req.body.caseType, 40);
  if (sessionHash.length < 12 || !office.case_types?.[caseType]) return res.status(400).json({ error: 'الطلب غير صالح.' });
  const existing = await query("SELECT id,ref FROM bookings WHERE office_id=$1 AND session_hash=$2 AND status='started' ORDER BY created_at DESC LIMIT 1", [office.id, sessionHash]);
  if (existing.rows[0]) return res.json(existing.rows[0]);
  const result = await query("INSERT INTO bookings (office_id,ref,case_type,session_hash,status,last_step) VALUES ($1,$2,$3,$4,'started',1) RETURNING id,ref", [office.id, shortRef(), caseType, sessionHash]);
  await query("INSERT INTO events (office_id,type,step,session_hash) VALUES ($1,'started',1,$2)", [office.id, sessionHash]);
  res.status(201).json(result.rows[0]);
});

app.patch('/api/public/:slug/progress', async (req, res) => {
  const office = await loadOffice(req.params.slug);
  const id = String(req.body.bookingId || '');
  const sessionHash = cleanText(req.body.sessionHash, 80);
  const step = Math.max(1, Math.min(6, Number(req.body.step) || 1));
  const clientName = cleanText(req.body.clientName, 60);
  const clientPhone = normalizePhone(req.body.clientPhone);
  if (!office || !id || sessionHash.length < 12) return res.status(400).json({ error: 'طلب غير صالح.' });
  await query(`UPDATE bookings SET last_step=GREATEST(last_step,$1),
    client_name=COALESCE($2,client_name), client_phone=COALESCE($3,client_phone), updated_at=NOW()
    WHERE id=$4 AND office_id=$5 AND session_hash=$6 AND status='started'`,
    [step, clientName.length >= 2 ? clientName : null, clientPhone || null, id, office.id, sessionHash]);
  await query("INSERT INTO events (office_id,type,step,session_hash) VALUES ($1,'step_reached',$2,$3)", [office.id, step, sessionHash]);
  res.status(204).end();
});

app.post('/api/public/:slug/submit', submitLimiter, async (req, res) => {
  if (req.body.website) return res.status(204).end();
  const office = await loadOffice(req.params.slug);
  if (!office?.active) return res.status(404).json({ error: 'الخدمة غير متاحة.' });
  const phone = normalizePhone(req.body.clientPhone);
  const name = cleanText(req.body.clientName, 60);
  const caseType = cleanText(req.body.caseType, 40);
  const summary = cleanText(req.body.summary, 300);
  const preferredDay = cleanText(req.body.preferredDay, 80);
  const preferredPeriod = cleanText(req.body.preferredPeriod, 80);
  const sessionHash = cleanText(req.body.sessionHash, 80);
  const rawAnswers = req.body.answers && typeof req.body.answers === 'object' && !Array.isArray(req.body.answers) ? req.body.answers : {};
  const answers = Object.fromEntries(Object.entries(rawAnswers).slice(0, 12).map(([key,value]) => [cleanText(key,40),cleanText(value,120)]));
  if (!phone || name.length < 2 || !office.case_types?.[caseType] || !preferredDay || !preferredPeriod || sessionHash.length < 12 || req.body.consent !== true) {
    return res.status(400).json({ error: 'راجع الاسم والجوال والموعد والموافقة.' });
  }
  const bookingId = String(req.body.bookingId || '');
  let result;
  if (bookingId) {
    result = await query(`UPDATE bookings SET case_type=$1,answers=$2,summary=$3,client_name=$4,client_phone=$5,
      preferred_day=$6,preferred_period=$7,status='awaiting_payment',last_step=5,updated_at=NOW()
      WHERE id=$8 AND office_id=$9 AND session_hash=$10 AND status='started' RETURNING id,ref`,
      [caseType, JSON.stringify(answers), summary || null, name, phone, preferredDay, preferredPeriod, bookingId, office.id, sessionHash]);
  }
  if (!result?.rows[0]) {
    result = await query(`INSERT INTO bookings
      (office_id,ref,case_type,answers,summary,client_name,client_phone,preferred_day,preferred_period,status,last_step,session_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'awaiting_payment',5,$10) RETURNING id,ref`,
      [office.id, shortRef(), caseType, JSON.stringify(answers), summary || null, name, phone, preferredDay, preferredPeriod, sessionHash]);
  }
  await query("INSERT INTO events (office_id,type,step,session_hash) VALUES ($1,'submitted',5,$2)", [office.id, sessionHash]);
  res.status(201).json({ ...result.rows[0], office: safeOffice(office) });
});

app.get('/api/dashboard/summary', requireAuth(), async (req, res) => {
  const officeId = officeScope(req);
  if (!officeId) return res.status(403).json({ error: 'استخدم لوحة المدير.' });
  const range = ['today','7d','30d','all'].includes(req.query.range) ? req.query.range : '7d';
  const eventsWhere = dateClause(range);
  const bookingsWhere = dateClause(range);
  const [office, eventStats, bookingStats, funnel] = await Promise.all([
    query('SELECT * FROM offices WHERE id=$1', [officeId]),
    query(`SELECT COUNT(*) FILTER (WHERE type='visit')::int visits, COUNT(*) FILTER (WHERE type='started')::int started FROM events WHERE office_id=$1 ${eventsWhere}`, [officeId]),
    query(`SELECT COUNT(*) FILTER (WHERE status IN ('submitted','awaiting_payment','paid','confirmed','cancelled','no_show'))::int submitted,
      COUNT(*) FILTER (WHERE status IN ('paid','confirmed'))::int paid,
      COUNT(*) FILTER (WHERE status='started')::int incomplete
      FROM bookings WHERE office_id=$1 ${bookingsWhere}`, [officeId]),
    query(`SELECT step,COUNT(DISTINCT session_hash)::int count FROM events WHERE office_id=$1 AND type='step_reached' ${eventsWhere} GROUP BY step ORDER BY step`, [officeId])
  ]);
  const e = eventStats.rows[0]; const b = bookingStats.rows[0]; const price = office.rows[0].price;
  res.json({ office: safeOffice(office.rows[0]), visits:e.visits, started:e.started, submitted:b.submitted, paid:b.paid,
    incomplete:b.incomplete, visitConversion:e.visits ? Math.round(b.paid/e.visits*100) : 0,
    startConversion:e.started ? Math.round(b.paid/e.started*100) : 0, revenue:b.paid*price, funnel:funnel.rows });
});

app.get('/api/dashboard/bookings', requireAuth(), async (req, res) => {
  const officeId = officeScope(req);
  if (!officeId) return res.status(403).json({ error: 'غير مصرح.' });
  const tab = req.query.tab;
  const statusSql = tab === 'incomplete' ? "status='started'" : tab === 'paid' ? "status IN ('paid','confirmed')" : "status='awaiting_payment'";
  const result = await query(`SELECT id,ref,case_type,client_name,client_phone,preferred_day,preferred_period,status,followup_status,last_step,created_at,updated_at,paid_at
    FROM bookings WHERE office_id=$1 AND ${statusSql} ORDER BY updated_at DESC LIMIT 200`, [officeId]);
  res.json(result.rows);
});

app.patch('/api/dashboard/bookings/:id', requireAuth(), requireCsrf, async (req, res) => {
  const officeId = officeScope(req);
  if((await query('SELECT workspace_config FROM offices WHERE id=$1',[officeId])).rows[0]?.workspace_config?.enabled) return res.status(400).json({error:'استخدم لوحة المواعيد والخدمات.'});
  const status = ['paid','confirmed','cancelled','no_show'].includes(req.body.status) ? req.body.status : null;
  const followup = ['none','followed','not_interested'].includes(req.body.followupStatus) ? req.body.followupStatus : null;
  if (!officeId || (!status && !followup)) return res.status(400).json({ error: 'حالة غير صالحة.' });
  const result = await query(`UPDATE bookings SET
    status=COALESCE($1,status), followup_status=COALESCE($2,followup_status),
    paid_at=CASE WHEN $1='paid' THEN COALESCE(paid_at,NOW()) ELSE paid_at END, updated_at=NOW()
    WHERE id=$3 AND office_id=$4 RETURNING id,status,followup_status`, [status, followup, req.params.id, officeId]);
  if (!result.rows[0]) return res.status(404).json({ error: 'الطلب غير موجود.' });
  res.json(result.rows[0]);
});

app.get('/api/dashboard/settings', requireAuth(), async (req, res) => {
  const officeId = officeScope(req);
  const result = await query('SELECT * FROM offices WHERE id=$1', [officeId]);
  if (!result.rows[0]) return res.status(404).json({ error: 'المكتب غير موجود.' });
  res.json(safeOffice(result.rows[0]));
});

app.get('/api/dashboard/link', requireAuth(), async (req, res) => {
  const officeId = officeScope(req);
  const result = await query('SELECT slug FROM offices WHERE id=$1', [officeId]);
  if (!result.rows[0]) return res.status(404).json({ error: 'المكتب غير موجود.' });
  const base = process.env.APP_URL?.startsWith('http') ? process.env.APP_URL : `${req.protocol}://${req.get('host')}`;
  const url = `${base.replace(/\/$/,'')}/${result.rows[0].slug}`;
  res.json({ url, qr: await QRCode.toDataURL(url, { width: 240, margin: 1 }) });
});

app.patch('/api/dashboard/settings', requireAuth(), requireCsrf, async (req, res) => {
  const officeId = officeScope(req);
  const price = Number(req.body.price); const duration = Number(req.body.duration);
  const whatsapp = normalizePhone(req.body.whatsapp).replace('+','');
  const periods = Array.isArray(req.body.times) ? req.body.times.map((x) => cleanText(x, 50)).filter(Boolean).slice(0,8) : [];
  if (!officeId || !Number.isInteger(price) || price < 0 || !Number.isInteger(duration) || duration < 10 || !whatsapp || !periods.length) return res.status(400).json({ error: 'راجع الإعدادات.' });
  await query(`UPDATE offices SET price=$1,duration_min=$2,periods=$3,all_days=$4,whatsapp=$5,bank_name=$6,account_name=$7,iban=$8,cancel_policy=$9,updated_at=NOW() WHERE id=$10`,
    [price,duration,JSON.stringify(periods),!!req.body.allDays,whatsapp,cleanText(req.body.bankName,80),cleanText(req.body.accountName,100),cleanText(req.body.iban,34),cleanText(req.body.cancelPolicy,600),officeId]);
  res.json({ ok:true });
});

app.get('/api/admin/offices', requireAuth('owner_admin'), async (_req, res) => {
  const result = await query(`SELECT o.*,
    COUNT(DISTINCT e.id) FILTER (WHERE e.type='visit' AND e.created_at>=NOW()-INTERVAL '14 days')::int visits14,
    COUNT(DISTINCT b.id) FILTER (WHERE b.created_at>=NOW()-INTERVAL '14 days')::int bookings14,
    COUNT(DISTINCT b.id) FILTER (WHERE b.status IN ('paid','confirmed') AND b.created_at>=NOW()-INTERVAL '14 days')::int paid14
    FROM offices o LEFT JOIN events e ON e.office_id=o.id LEFT JOIN bookings b ON b.office_id=o.id GROUP BY o.id ORDER BY o.created_at DESC`);
  res.json(result.rows);
});

app.post('/api/admin/offices', requireAuth('owner_admin'), requireCsrf, upload.single('logo'), async (req, res) => {
  const slug = String(req.body.slug || '').toLowerCase();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const officeName = cleanText(req.body.name, 140);
  const officeWhatsapp = normalizePhone(req.body.whatsapp).replace('+','');
  if (!validSlug(slug) || officeName.length < 3 || !officeWhatsapp || !email.includes('@') || password.length < 10) return res.status(400).json({ error: 'راجع الاسم والرابط والواتساب والبريد وكلمة المرور.' });
  const logoUrl = req.file ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}` : null;
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const office = await client.query(`INSERT INTO offices
      (slug,name,logo_url,whatsapp,price,duration_min,periods,all_days,case_types,bank_name,account_name,iban,cancel_policy,trial_ends_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW()+INTERVAL '14 days') RETURNING id`,
      [slug,officeName,logoUrl,officeWhatsapp,Number(req.body.price)||250,Number(req.body.duration)||30,
       JSON.stringify(['صباحًا','مساءً']),false,JSON.stringify({labor:'عمالية',enforcement:'تنفيذ ومطالبات',commercial:'تجارية',realestate:'عقارية',family:'أحوال شخصية',other:'أخرى'}),
       cleanText(req.body.bankName,80),cleanText(req.body.accountName,100),cleanText(req.body.iban,34),cleanText(req.body.cancelPolicy,600)]);
    await client.query("INSERT INTO users (office_id,email,password_hash,role,must_change_password) VALUES ($1,$2,$3,'lawyer',TRUE)", [office.rows[0].id,email,passwordHash]);
    await client.query('COMMIT');
    res.status(201).json({ ok:true, url:`/${slug}` });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error:'الرابط أو البريد مستخدم.' });
    throw error;
  } finally { client.release(); }
});

app.patch('/api/admin/offices/:id/status', requireAuth('owner_admin'), requireCsrf, async (req, res) => {
  const active = !!req.body.active;
  const plan = ['trial','active','paused'].includes(req.body.planStatus) ? req.body.planStatus : (active?'active':'paused');
  await query('UPDATE offices SET active=$1,plan_status=$2,updated_at=NOW() WHERE id=$3', [active,plan,req.params.id]);
  res.json({ ok:true });
});

app.get('/:slug', async (req, res, next) => {
  if (['api','platform'].includes(req.params.slug)) return next();
  const office = await loadOffice(req.params.slug);
  if (!office) return res.status(404).send('المكتب غير موجود');
  if (!office.active || office.plan_status === 'paused') return res.status(503).send('<main dir="rtl" style="font-family:system-ui;max-width:600px;margin:15vh auto;padding:24px"><h1>الحجز متوقف مؤقتًا</h1><p>تواصل مع المكتب مباشرة، ونعتذر عن الإزعاج.</p></main>');
  if(office.workspace_config?.enabled) {
    const config=safeOffice(office);
    const html=fs.readFileSync(path.join(root,'public','workspace-client.html'),'utf8')
      .replaceAll('__OFFICE_NAME__',escapeHtml(office.name))
      .replace('__OFFICE_CONFIG__',JSON.stringify(config).replace(/</g,'\\u003c'));
    return res.type('html').send(html);
  }
  let html = fs.readFileSync(path.join(root,'hamad','index.html'),'utf8');
  const config = safeOffice(office);
  const officeName = escapeHtml(cleanText(office.name,140));
  html = html
    .replaceAll('مكتب حمد بن عواد الشريف للمحاماة والاستشارات القانونية', officeName)
    .replaceAll('حمد بن عواد الشريف للمحاماة والاستشارات القانونية', officeName.replace(/^مكتب\s+/,'')).replaceAll('مكتب حمد بن عواد الشريف', officeName)
    .replaceAll('logo-mark.png', office.logo_url || '/hamad/logo-mark.png')
    .replace('href="../styles.css?v=4"','href="/styles.css?v=5"')
    .replace('href="hamad.css?v=2"','href="/hamad/hamad.css?v=3"')
    .replace('<script src="app.js?v=3"></script>', `<script>window.__OFFICE__=${JSON.stringify(config).replace(/</g,'\\u003c')};window.__OFFICE_SLUG__=${JSON.stringify(office.slug)};</script><script src="/hamad/app.js?v=6"></script>`)
    .replace('لا تُحفظ بياناتك على أي خادم في هذه الصفحة، ونستخدم إحصاءً مجهولًا لعدد الزيارات فقط بدون كوكيز. عند الضغط على «أرسل الطلب» يفتح واتساب برسالة إلى رقم المكتب، ولا تُرسل إلا إذا ضغطت إرسال بنفسك.', 'تُحفظ بيانات الطلب بأقل قدر لازم لتأكيد الاستشارة ومتابعتها، ثم تُخفى البيانات الشخصية تلقائيًا بعد 90 يومًا. لا نخزن عنوان IP ولا نستخدم كوكيز تتبع.')
    .replace('</form>', '<label class="sr-only">اترك هذا الحقل فارغًا<input id="website" name="website" tabindex="-1" autocomplete="off"></label></form>');
  if (office.slug === 'alogla') {
    html = html.replaceAll('حمد بن عواد الشريف', 'علي العقلا').replaceAll('المدينة المنورة', 'الرياض')
      .replace('</head>', '<style>.brand-logo{width:110px;height:auto;max-width:30vw}.offer-logo{width:120px;height:auto;max-width:28vw;object-fit:contain}</style></head>');
  }
  if (office.slug === 'shathri') {
    html = html.replaceAll('حمد بن عواد الشريف', 'عبدالله الشثري').replaceAll('المدينة المنورة', 'الرياض')
      .replace(`<h1 id="offerTitle">${officeName}</h1>`, '<h1 id="offerTitle">مكتب عبدالله الشثري</h1>')
      .replace('</head>', '<style>.brand-logo{width:64px;height:64px;max-width:20vw}.offer-logo{width:72px;height:72px;max-width:22vw;object-fit:contain}</style></head>');
  }
  res.type('html').send(html);
});

app.use((error, _req, res, _next) => {
  if(error.type==='entity.parse.failed') return res.status(400).json({error:'صيغة JSON غير صالحة.'});
  if(error.type==='entity.too.large') return res.status(413).json({error:'حجم الطلب أكبر من المسموح.'});
  if(error.code==='22P02') return res.status(400).json({error:'معرّف الطلب غير صالح.'});
  console.error(error);
  res.status(500).json({ error: 'حدث خطأ غير متوقع.' });
});

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => console.log(`Muakkad listening on ${port}`));

function shutdown() { server.close(() => pool.end().finally(() => process.exit(0))); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
