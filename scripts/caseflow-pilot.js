'use strict';
// Loopback-only development harness. Credentials live in memory, never on disk.
const express=require('express'),session=require('express-session'),crypto=require('crypto'),fs=require('fs'),path=require('path');
const {PGlite}=require('@electric-sql/pglite');
const {extractDocument}=require('../src/caseflow-extract');
(async()=>{
 const db=new PGlite();await db.exec(`CREATE TABLE offices(id BIGINT PRIMARY KEY);CREATE TABLE users(id BIGINT PRIMARY KEY);INSERT INTO offices VALUES(1),(2);INSERT INTO users VALUES(1),(2);`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../src/caseflow-schema.sql'),'utf8'));
 const adapter={query:(sql,params)=>db.query(sql,params),connect:async()=>({query:(sql,params)=>db.query(sql,params),release(){}})};
 process.env.CASEFLOW_ENCRYPTION_KEY=crypto.randomBytes(32).toString('hex');process.env.CASEFLOW_ENABLED='true';
 const app=express(),setupToken=crypto.randomBytes(24).toString('hex');let calls=0;
 app.use(express.json({limit:'128kb'}));app.use(express.urlencoded({extended:false,limit:'8kb'}));app.use(session({secret:crypto.randomBytes(32).toString('hex'),resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'strict'}}));
 app.use((req,res,next)=>{if(req.get('origin')&&req.get('origin')!=='http://127.0.0.1:4317')return res.sendStatus(403);next()});
 app.get('/setup',(req,res)=>{if(req.query.token!==setupToken)return res.sendStatus(403);req.session.setup=true;res.send('<html lang="ar" dir="rtl"><meta charset="utf-8"><title>تهيئة تجربة مؤكد المحلية</title><form method="post"><label>مفتاح Claude للتجربة المحلية<input name="key" type="password" autocomplete="off"></label><button>تفعيل الاختبار المحلي</button></form></html>')});
 app.post('/setup',(req,res)=>{if(!req.session.setup||!/^sk-ant-[A-Za-z0-9_-]+$/.test(req.body.key||''))return res.sendStatus(403);process.env.ANTHROPIC_API_KEY=req.body.key;req.session.user={id:1,officeId:1,role:'lawyer'};req.session.csrfToken=crypto.randomBytes(24).toString('hex');delete req.session.setup;res.redirect('/platform/caseflow/')});
 app.get('/api/csrf',(req,res)=>res.json({token:req.session.csrfToken,user:req.session.user||null}));
 require('../src/caseflow')(app,{pool:adapter,query:adapter.query,requireAuth:()=>((req,res,next)=>req.session.user?next():res.sendStatus(401)),requirePasswordChanged:(_q,_s,next)=>next(),requireCsrf:(req,res,next)=>req.get('x-csrf-token')===req.session.csrfToken?next():res.sendStatus(403),extract:async input=>{if(calls>=2)throw Error('PILOT_LIMIT');calls++;return extractDocument({...input,model:'claude-sonnet-5-5'})}});
 app.use('/platform',express.static(path.join(__dirname,'../public')));
 app.get('/test-results',async(req,res)=>{if(!req.session.user)return res.sendStatus(401);const rows=await db.query('SELECT payload FROM caseflow_documents');res.json({calls,documents:rows.rows.map(r=>{const d=require('../src/caseflow-extract').decrypt(r.payload);return{name:d.name,result:d.result,model:d.model,usage:d.usage}})})});
 app.use((error,_req,res,_next)=>{console.error('Pilot error code:',error.code||'unknown');res.status(500).json({error:'تعذر إكمال العملية المحلية.'})});
 app.listen(4317,'127.0.0.1',()=>console.log('Pilot setup: http://127.0.0.1:4317/setup?token='+setupToken));
})();
