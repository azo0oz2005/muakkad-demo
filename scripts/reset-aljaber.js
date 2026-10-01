'use strict';
const crypto=require('crypto'),bcrypt=require('bcryptjs');
const {pool}=require('../src/db');
(async()=>{
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const office=(await c.query("SELECT id FROM offices WHERE slug='aljaber' FOR UPDATE")).rows[0];
  if(!office)throw Error('Office missing');
  await c.query('CREATE TABLE IF NOT EXISTS office_reset_backups (reset_id UUID NOT NULL,office_id BIGINT NOT NULL,source_table TEXT NOT NULL,payload JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const resetId=crypto.randomUUID();const counts={};
  for(const table of ['bookings','events','calendar_blocks']){
   const backup=await c.query(`INSERT INTO office_reset_backups (reset_id,office_id,source_table,payload) SELECT $1,$2,$3,to_jsonb(t) FROM ${table} t WHERE office_id=$2`,[resetId,office.id,table]);
   const expected=(await c.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE office_id=$1`,[office.id])).rows[0].count;
   if(backup.rowCount!==expected)throw Error('Backup count mismatch');
   await c.query(`DELETE FROM ${table} WHERE office_id=$1`,[office.id]);counts[table]=expected;
  }
  const password='Aj-'+crypto.randomBytes(12).toString('base64url');
  await c.query("UPDATE users SET password_hash=$1,must_change_password=TRUE,failed_attempts=0,locked_until=NULL WHERE office_id=$2 AND role='lawyer'",[await bcrypt.hash(password,12),office.id]);
  // Invalidate existing office sessions; unrelated office sessions stay intact.
  await c.query(`UPDATE session SET sess=(sess::jsonb-'user')::json WHERE sess->'user'->>'officeId'=$1`,[String(office.id)]);
  await c.query("UPDATE offices SET trial_ends_at=NOW()+INTERVAL '14 days',plan_status='trial',active=TRUE,periods='[\"08:00–23:00\"]',all_days=TRUE,updated_at=NOW() WHERE id=$1",[office.id]);
  await c.query('COMMIT');console.log(JSON.stringify({resetId,backedUp:counts,email:'aljaber@muakkad.sa',password}));
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
