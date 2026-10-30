'use strict';

// Caller owns the transaction. Keep complete, schema-independent snapshots in
// the database before removing any test activity. Never change office or users.
module.exports = async function resetOfficeTestData(client, slug, resetId) {
  const office = (await client.query('SELECT id FROM offices WHERE slug=$1 FOR UPDATE', [slug])).rows[0];
  if (!office) return { bookings: 0, events: 0, calendar_blocks: 0 };
  await client.query(`CREATE TABLE IF NOT EXISTS office_test_reset_backups (
    reset_id TEXT NOT NULL,
    office_id BIGINT NOT NULL,
    source_table TEXT NOT NULL,
    record_id TEXT NOT NULL,
    record_data JSONB NOT NULL,
    backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (reset_id, source_table, record_id)
  )`);
  // Prevent a concurrent write from appearing between its snapshot and delete.
  await client.query('LOCK TABLE bookings, events, calendar_blocks IN SHARE ROW EXCLUSIVE MODE');
  const result = {};
  for (const table of ['bookings', 'events', 'calendar_blocks']) {
    const backup = await client.query(`INSERT INTO office_test_reset_backups
      (reset_id,office_id,source_table,record_id,record_data)
      SELECT $1,$2,$3,source.id::text,to_jsonb(source)
      FROM ${table} AS source WHERE source.office_id=$2 RETURNING record_id`,
      [resetId, office.id, table]);
    const removed = await client.query(`DELETE FROM ${table} WHERE office_id=$1 RETURNING id`, [office.id]);
    if (backup.rowCount !== removed.rowCount) throw new Error(`Backup count mismatch for ${table}`);
    result[table] = removed.rowCount;
  }
  return result;
};
