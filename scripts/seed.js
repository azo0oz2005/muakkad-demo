'use strict';

const { pool } = require('../src/db');

const caseTypes = {
  labor: 'عمالية', enforcement: 'تنفيذ ومطالبات', commercial: 'تجارية',
  realestate: 'عقارية', family: 'أحوال شخصية', other: 'أخرى'
};

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const office = await client.query(`
      INSERT INTO offices
        (slug,name,logo_url,brand_colors,whatsapp,price,duration_min,periods,all_days,case_types,bank_name,account_name,iban,cancel_policy,trial_ends_at,plan_status)
      VALUES
        ('hamad','مكتب حمد بن عواد الشريف للمحاماة والاستشارات القانونية','/hamad/logo-mark.png',
         '{"ink":"#1f2a4f","accent":"#5a6690"}'::jsonb,'966510090456',250,30,
         '["صباحًا (9–12)","ظهرًا (12–4)","مساءً (4–9)","أي وقت"]'::jsonb,TRUE,$1,
         'بنك D360','حمد عواد الشريف','SA5536031016043771844027',
         'الإلغاء قبل الموعد بـ 24 ساعة: استرداد كامل أو إعادة جدولة. أقل من 24 ساعة أو عدم الحضور: لا يُسترد المبلغ.',
         NOW() + INTERVAL '14 days','trial')
      ON CONFLICT (slug) DO UPDATE SET updated_at=NOW()
      RETURNING id`, [JSON.stringify(caseTypes)]);

    const officeId = office.rows[0].id;
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD_HASH) {
      await client.query(`INSERT INTO users (office_id,email,password_hash,role,must_change_password)
        VALUES (NULL,LOWER($1),$2,'owner_admin',TRUE)
        ON CONFLICT (email) DO NOTHING`, [process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD_HASH]);
    }
    if (process.env.HAMAD_EMAIL && process.env.HAMAD_PASSWORD_HASH) {
      await client.query(`INSERT INTO users (office_id,email,password_hash,role,must_change_password)
        VALUES ($1,LOWER($2),$3,'lawyer',TRUE)
        ON CONFLICT (email) DO NOTHING`, [officeId, process.env.HAMAD_EMAIL, process.env.HAMAD_PASSWORD_HASH]);
    }
    await client.query('COMMIT');
    console.log('Seed complete');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => { console.error(error); process.exit(1); });
