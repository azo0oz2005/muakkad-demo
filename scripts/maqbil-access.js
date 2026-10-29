'use strict';
// Read the existing account's one-time setup link. Never log a password.
const {pool}=require('../src/db');
const {activationToken}=require('../src/office-activation');
(async()=>{
 const user=(await pool.query(`SELECT u.id,u.email,u.setup_expires_at,u.setup_used_at FROM users u JOIN offices o ON o.id=u.office_id WHERE o.slug='maqbil' AND u.role='lawyer' ORDER BY u.id LIMIT 1`)).rows[0];
 if(!user)throw Error('Office account is missing.');
 console.log('Login email:',user.email);
 if(user.setup_used_at||!user.setup_expires_at||new Date(user.setup_expires_at)<=new Date()){console.log('Account already activated or setup link expired.');return;}
 if(!process.env.SESSION_SECRET)throw Error('SESSION_SECRET is required.');
 const base=process.env.APP_URL||'https://مؤكد.com';
 console.log('One-time setup:',base.replace(/\/$/,'')+'/activate-office?token='+activationToken(user,process.env.SESSION_SECRET));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
