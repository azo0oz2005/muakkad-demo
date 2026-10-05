'use strict';

// إصلاحات بيانات تُنفَّذ مرة واحدة فقط (تُسجَّل في data_migrations).
const { pool } = require('../src/db');

const FIXES = [
  {
    // Name and phone supplied by the owner; commercial settings await approval.
    id: '2026-10-05-abdulmajeed-preview',
    run: (c) => c.query(`INSERT INTO offices
      (slug,name,logo_url,whatsapp,price,duration_min,periods,all_days,case_types,cancel_policy,preview_only)
      VALUES ('abdulmajeed','المحامي عبدالمجيد',
      '/platform/abdulmajeed/name-mark.svg','966533895044',0,30,
      '["يحددها المكتب"]',TRUE,
      '{"labor":"عمالية","enforcement":"تنفيذ ومطالبات","commercial":"تجارية","realestate":"عقارية","family":"أحوال شخصية","other":"أخرى"}',
      'السعر والمدة والأوقات وسياسة الإلغاء تُعتمد مع المكتب قبل التفعيل.',TRUE)
      ON CONFLICT (slug) DO NOTHING`)
  },
  {
    // Owner requested sample fees and the original logo from wasmalbayan.com.
    id: '2026-10-05-abdulmajeed-logo-sample-fees',
    run: (c) => c.query(`UPDATE offices SET
      logo_url='/platform/abdulmajeed/logo.png',price=250,duration_min=30,updated_at=NOW()
      WHERE slug='abdulmajeed' AND preview_only=TRUE`)
  },
  {
    // Replace the inferred company logo with the owner's supplied personal logo.
    id: '2026-10-05-abdulmajeed-personal-logo',
    run: (c) => c.query(`UPDATE offices SET
      logo_url='/platform/abdulmajeed/logo-clean.png',
      brand_colors='{"ink":"#27313d","accent":"#68727e"}',updated_at=NOW()
      WHERE slug='abdulmajeed'`)
  },
  {
    // Public office identity; fees, duration and availability await approval.
    id: '2026-10-04-alomary-preview',
    run: (c) => c.query(`INSERT INTO offices
      (slug,name,logo_url,whatsapp,price,duration_min,periods,all_days,case_types,cancel_policy,preview_only)
      VALUES ('alomary','مكتب المحامي سليمان بن يوسف العمري',
      '/platform/alomary/name-mark.svg','966537778130',0,30,
      '["يحددها المكتب"]',TRUE,
      '{"commercial":"القضايا التجارية","intellectual":"الملكية الفكرية","arbitration":"التحكيم التجاري والوساطة والتسوية الودية","other":"أخرى"}',
      'السعر والمدة والأوقات وسياسة الإلغاء تُعتمد مع المكتب قبل التفعيل.',TRUE)
      ON CONFLICT (slug) DO NOTHING`)
  },
  {
    // Public identity from al-tayyar.com.sa; price and duration are unpublished.
    id: '2026-10-04-atyar-preview',
    run: (c) => c.query(`INSERT INTO offices
      (slug,name,logo_url,whatsapp,price,duration_min,periods,all_days,case_types,cancel_policy,preview_only,brand_colors)
      VALUES ('atyar','شركة أطيار للمحاماة والاستشارات القانونية',
      '/platform/atyar/logo.png','966555398969',0,30,
      '["صباحًا (8–12)","ظهرًا (12–4)"]',FALSE,
      '{"labor":"عمالية","enforcement":"تنفيذ ومطالبات","commercial":"تجارية","realestate":"عقارية","family":"أحوال شخصية","other":"أخرى"}',
      'السعر والمدة وسياسة الإلغاء تنتظر اعتماد المكتب. الفترات مستندة إلى ساعات العمل المنشورة وليست مواعيد مؤكدة.',TRUE,
      '{"ink":"#5a3b17","accent":"#ab711a"}')
      ON CONFLICT (slug) DO NOTHING`)
  },
  {
    // المالك طلب إبقاء كلمة المرور المسلّمة لآل جابر دون فرض تغييرها.
    id: '2026-10-01-aljaber-keep-issued-password',
    run: (c) => c.query(`UPDATE users SET must_change_password=FALSE
      WHERE office_id=(SELECT id FROM offices WHERE slug='aljaber') AND role='lawyer'`)
  },
  {
    // بيانات المكتب من دليل الهيئة السعودية للمحامين؛ الإعدادات أمثلة للمراجعة.
    id: '2026-09-30-shathri-preview',
    run: (c) => c.query(`INSERT INTO offices
      (slug,name,logo_url,whatsapp,price,duration_min,periods,all_days,case_types,cancel_policy,preview_only)
      VALUES ('shathri','مكتب عبدالله عبدالعزيز عبدالرحمن الشثري للمحاماة',
      '/platform/shathri/name-mark.svg','966505428010',250,30,
      '["صباحًا (9–12)","ظهرًا (12–4)","مساءً (4–9)","أي وقت"]',TRUE,
      '{"labor":"عمالية","enforcement":"تنفيذ ومطالبات","commercial":"تجارية","realestate":"عقارية","family":"أحوال شخصية","other":"أخرى"}',
      'تُحدد سياسة الإلغاء عند تفعيل الخدمة مع المكتب.',TRUE)
      ON CONFLICT (slug) DO NOTHING`)
  },
  {
    // نموذج للمراجعة فقط؛ لا ننسخ حساب الشريف أو بيانات التحويل.
    id: '2026-09-30-alogla-preview',
    run: (c) => c.query(`INSERT INTO offices
      (slug,name,logo_url,whatsapp,price,duration_min,periods,all_days,case_types,cancel_policy,preview_only)
      VALUES ('alogla','مكتب علي العقلا للمحاماة والاستشارات القانونية',
      '/platform/alogla/logo.webp','966505557970',250,30,
      '["صباحًا (9–12)","ظهرًا (12–4)","مساءً (4–9)","أي وقت"]',TRUE,
      '{"labor":"عمالية","enforcement":"تنفيذ ومطالبات","commercial":"تجارية","realestate":"عقارية","family":"أحوال شخصية","other":"أخرى"}',
      'تُحدد سياسة الإلغاء عند تفعيل الخدمة مع المكتب.',TRUE)
      ON CONFLICT (slug) DO NOTHING`)
  },
  {
    // حمد طلب الأوقات مفتوحة: كل أيام الأسبوع
    id: '2026-09-28-hamad-all-days',
    run: (c) => c.query("UPDATE offices SET all_days=TRUE, updated_at=NOW() WHERE slug='hamad'")
  },
  {
    // حساب حمد يستخدم كلمة المرور المسلّمة له بدون إجباره على تغييرها.
    id: '2026-09-29-hamad-keep-issued-password',
    run: (c) => c.query(`UPDATE users SET must_change_password=FALSE
      WHERE office_id=(SELECT id FROM offices WHERE slug='hamad') AND role='lawyer'`)
  },
  {
    // تصفير بيانات الاختبار قبل تسليم اللوحة لحمد.
    // نحفظ نسخة كاملة قبل الحذف في جداول *_purged_backup، فلا يضيع شيء لو كان بينها طلب حقيقي.
    id: '2026-09-28-hamad-purge-test-data',
    run: async (c) => {
      await c.query('CREATE TABLE IF NOT EXISTS bookings_purged_backup (LIKE bookings INCLUDING DEFAULTS)');
      await c.query('CREATE TABLE IF NOT EXISTS events_purged_backup (LIKE events INCLUDING DEFAULTS)');
      const office = await c.query("SELECT id FROM offices WHERE slug='hamad'");
      const officeId = office.rows[0]?.id;
      if (!officeId) return;
      const b = await c.query('INSERT INTO bookings_purged_backup SELECT * FROM bookings WHERE office_id=$1', [officeId]);
      const e = await c.query('INSERT INTO events_purged_backup SELECT * FROM events WHERE office_id=$1', [officeId]);
      await c.query('DELETE FROM bookings WHERE office_id=$1', [officeId]);
      await c.query('DELETE FROM events WHERE office_id=$1', [officeId]);
      console.log(`hamad: backed up and cleared ${b.rowCount} bookings, ${e.rowCount} events`);
    }
  },
  {
    // حذف تجربة التسليم الأخيرة من لوحة حمد مع حفظ نسخة احتياطية.
    id: '2026-09-29-hamad-purge-delivery-test',
    run: async (c) => {
      await c.query('CREATE TABLE IF NOT EXISTS bookings_purged_backup (LIKE bookings INCLUDING DEFAULTS)');
      await c.query('CREATE TABLE IF NOT EXISTS events_purged_backup (LIKE events INCLUDING DEFAULTS)');
      const office = await c.query("SELECT id FROM offices WHERE slug='hamad'");
      const officeId = office.rows[0]?.id;
      if (!officeId) return;
      const b = await c.query('INSERT INTO bookings_purged_backup SELECT * FROM bookings WHERE office_id=$1', [officeId]);
      const e = await c.query('INSERT INTO events_purged_backup SELECT * FROM events WHERE office_id=$1', [officeId]);
      await c.query('DELETE FROM bookings WHERE office_id=$1', [officeId]);
      await c.query('DELETE FROM events WHERE office_id=$1', [officeId]);
      console.log(`hamad delivery test: backed up and cleared ${b.rowCount} bookings, ${e.rowCount} events`);
    }
  }
];

(async () => {
  const client = await pool.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS data_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    for (const fix of FIXES) {
      await client.query('BEGIN');
      const done = await client.query('SELECT 1 FROM data_migrations WHERE id=$1 FOR UPDATE', [fix.id]);
      if (done.rowCount) { await client.query('ROLLBACK'); continue; }
      await fix.run(client);
      await client.query('INSERT INTO data_migrations (id) VALUES ($1)', [fix.id]);
      await client.query('COMMIT');
      console.log(`Applied data fix ${fix.id}`);
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => { console.error(error); process.exit(1); });
