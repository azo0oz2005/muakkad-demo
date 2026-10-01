'use strict';

// Run once inside Render Shell. Password exists only in memory and the issued output.
const crypto=require('crypto');
const bcrypt=require('bcryptjs');
const {pool}=require('../src/db');
const {DEFAULT_CONFIG}=require('../src/schedule');

(async()=>{
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const office=(await client.query(`INSERT INTO offices (slug,name,whatsapp,price,duration_min,periods,case_types,cancel_policy,workspace_config,trial_ends_at)
      VALUES ('aljaber','مكتب علي محمد إبراهيم آل جابر للمحاماة','966569788664',250,30,'["09:00–17:00"]',
      '{"labor":"عمالية","enforcement":"تنفيذ ومطالبات","commercial":"تجارية","realestate":"عقارية","family":"أحوال شخصية","other":"أخرى"}',
      'السعر والمدة والأوقات تجريبية. تُحدد سياسة الإلغاء والتأجيل مع المكتب قبل تفعيل الدفع.',$1,NOW()+INTERVAL '14 days')
      ON CONFLICT (slug) DO NOTHING RETURNING id`,[JSON.stringify(DEFAULT_CONFIG)])).rows[0]
      || (await client.query("SELECT id FROM offices WHERE slug='aljaber'")).rows[0];
    const email='aljaber@muakkad.sa';
    const exists=(await client.query('SELECT id FROM users WHERE email=$1',[email])).rows[0];
    if(exists){await client.query('ROLLBACK');console.log('Account already exists; password was not changed.');return;}
    const password='Aj-'+crypto.randomBytes(12).toString('base64url');
    const hash=await bcrypt.hash(password,12);
    await client.query("INSERT INTO users (office_id,email,password_hash,role,must_change_password) VALUES ($1,$2,$3,'lawyer',TRUE)",[office.id,email,hash]);
    await client.query('COMMIT');
    console.log(JSON.stringify({url:'https://muakkad-platform.onrender.com/aljaber',login:'https://muakkad-platform.onrender.com/login',email,password}));
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
})().catch(error=>{console.error(error.message);process.exit(1);});
