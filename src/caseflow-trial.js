'use strict';

const crypto=require('crypto');
const multer=require('multer');
const {rateLimit}=require('express-rate-limit');
const {extractDocument}=require('./caseflow-extract');

const hashToken=token=>crypto.createHash('sha256').update(token).digest('hex');
const riyadhDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const validFile=file=>{
  const b=file.buffer;
  if(file.mimetype==='application/pdf')return b.subarray(0,5).toString()==='%PDF-';
  if(file.mimetype==='image/png')return b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(file.mimetype==='image/jpeg')return b[0]===255&&b[1]===216&&b[2]===255;
  if(file.mimetype==='image/webp')return b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP';
  return false;
};

module.exports=function mountCaseflowTrial(app,{pool,query,requireAuth,requirePasswordChanged,requireCsrf,extract=extractDocument}){
  const base='/api/caseflow/trial';
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:2,fieldSize:60000},fileFilter:(_req,file,cb)=>cb(null,['application/pdf','image/png','image/jpeg','image/webp'].includes(file.mimetype))}).single('file');
  const limiter=rateLimit({windowMs:60*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false});
  const tokenFrom=req=>String(req.get('authorization')||'').match(/^Bearer ([a-f0-9]{64})$/i)?.[1]||'';
  const invite=async req=>{
    const token=tokenFrom(req);
    if(!token)return null;
    return (await query('SELECT id,label,expires_at FROM caseflow_trial_invites WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>NOW()',[hashToken(token)])).rows[0]||null;
  };
  const usage=async id=>(await query('SELECT used FROM caseflow_trial_usage WHERE invite_id=$1 AND usage_day=$2',[id,riyadhDay()])).rows[0]?.used||0;
  const disabled=(_req,res,next)=>process.env.CASEFLOW_ENABLED==='true'?next():res.status(503).json({error:'التجربة غير متاحة حاليًا.'});

  app.post('/api/admin/caseflow-trial-invites',requireAuth('owner_admin'),requirePasswordChanged,requireCsrf,async(req,res,next)=>{try{
    const label=String(req.body.label||'').trim().slice(0,120);
    if(label.length<2)return res.status(400).json({error:'أدخل اسمًا يميز رابط التجربة.'});
    const token=crypto.randomBytes(32).toString('hex');
    const row=(await query("INSERT INTO caseflow_trial_invites(label,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days') RETURNING id,label,expires_at",[label,hashToken(token)])).rows[0];
    res.set('Cache-Control','no-store').status(201).json({...row,url:`/platform/caseflow/try.html?code=${token}`});
  }catch(e){next(e)}});
  app.get('/api/admin/caseflow-trial-invites',requireAuth('owner_admin'),requirePasswordChanged,async(_req,res,next)=>{try{
    const rows=await query("SELECT i.id,i.label,i.expires_at,i.revoked_at,COALESCE(u.used,0) AS used_today FROM caseflow_trial_invites i LEFT JOIN caseflow_trial_usage u ON u.invite_id=i.id AND u.usage_day=$1 ORDER BY i.created_at DESC LIMIT 100",[riyadhDay()]);
    res.set('Cache-Control','no-store').json(rows.rows);
  }catch(e){next(e)}});
  app.post('/api/admin/caseflow-trial-invites/:id/revoke',requireAuth('owner_admin'),requirePasswordChanged,requireCsrf,async(req,res,next)=>{try{
    if(!/^[0-9a-f-]{36}$/i.test(req.params.id))return res.status(400).json({error:'الرابط غير صالح.'});
    const row=await query('UPDATE caseflow_trial_invites SET revoked_at=NOW() WHERE id=$1 AND revoked_at IS NULL RETURNING id',[req.params.id]);
    if(!row.rows[0])return res.status(404).json({error:'الرابط غير موجود أو أُلغي.'});
    res.json({ok:true});
  }catch(e){next(e)}});

  app.get(`${base}/status`,disabled,async(req,res,next)=>{try{
    const row=await invite(req);if(!row)return res.status(401).json({error:'رابط التجربة غير صالح أو انتهت صلاحيته.'});
    const used=await usage(row.id);
    res.set('Cache-Control','no-store').json({label:row.label,remaining:Math.max(0,20-used),dailyLimit:20,expiresAt:row.expires_at,reset:'منتصف الليل بتوقيت الرياض'});
  }catch(e){next(e)}});
  app.post(`${base}/extract`,disabled,limiter,requireCsrf,(req,res,next)=>upload(req,res,error=>error?res.status(400).json({error:'الملف غير مقبول. استخدم PDF أو صورة حتى 5 ميغابايت.'}):next()),async(req,res)=>{
    try{
      const row=await invite(req);if(!row)return res.status(401).json({error:'رابط التجربة غير صالح أو انتهت صلاحيته.'});
      if(req.body.process!=='true')return res.status(400).json({error:'أرسل المستند من صفحة التجربة.'});
      const text=String(req.body.text||'').trim(),file=req.file;
      if((!file&&text.length<10)||text.length>40000)return res.status(400).json({error:'أرفق ملفًا أو نصًا بين 10 و40000 حرف.'});
      if(file&&!validFile(file))return res.status(400).json({error:'محتوى الملف لا يطابق نوعه.'});
      // Atomic counter prevents parallel requests from passing the daily cap.
      const count=await query('INSERT INTO caseflow_trial_usage(invite_id,usage_day,used) VALUES($1,$2,1) ON CONFLICT(invite_id,usage_day) DO UPDATE SET used=caseflow_trial_usage.used+1 WHERE caseflow_trial_usage.used<20 RETURNING used',[row.id,riyadhDay()]);
      if(!count.rows[0])return res.status(429).json({error:'اكتملت 20 تجربة اليوم. يتجدد الرصيد عند منتصف الليل بتوقيت الرياض.'});
      const result=await extract({text,file});
      res.set('Cache-Control','no-store').json({result:result.data,remaining:20-count.rows[0].used,notice:'النتيجة للمراجعة فقط. لا يُحفظ المستند أو الناتج في قاعدة مؤكد.'});
    }catch(e){
      if(e.message==='DOCUMENT_TOO_LARGE')return res.status(413).json({error:'المستند طويل لهذه التجربة. استخدم جزءًا أصغر.'});
      // Provider errors may contain source text; do not log them.
      res.status(['API_NOT_CONFIGURED'].includes(e.message)?503:502).json({error:'تعذر استخراج المعلومات. لم يُحفظ المستند؛ المحاولة محسوبة ضمن الحد اليومي.'});
    }
  });
};
