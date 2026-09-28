'use strict';

// إصلاحات بيانات تُنفَّذ مرة واحدة فقط (تُسجَّل في data_migrations).
const { pool } = require('../src/db');

const FIXES = [
  {
    // حمد طلب الأوقات مفتوحة: كل أيام الأسبوع
    id: '2026-09-28-hamad-all-days',
    run: (c) => c.query("UPDATE offices SET all_days=TRUE, updated_at=NOW() WHERE slug='hamad'")
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
