'use strict';

const { pool } = require('../src/db');

(async () => {
  try {
    const result = await pool.query(`UPDATE bookings SET
      client_name='محذوف بعد 90 يوم', client_phone=NULL, answers='{}'::jsonb, summary=NULL, quote_note=NULL,
      updated_at=NOW()
      WHERE created_at < NOW() - INTERVAL '90 days'
        AND (client_phone IS NOT NULL OR summary IS NOT NULL OR answers <> '{}'::jsonb)`);
    console.log(`Anonymized ${result.rowCount} bookings`);
  } finally {
    await pool.end();
  }
})().catch((error) => { console.error(error); process.exit(1); });
