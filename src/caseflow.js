'use strict';

const crypto=require('crypto');
const multer=require('multer');
const {rateLimit}=require('express-rate-limit');
const {extractDocument,encrypt,decrypt,normalize,caseKey,validateExtraction}=require('./caseflow-extract');

module.exports=function mountCaseflow(app,{pool,query,requireAuth,requireCsrf,requirePasswordChanged,extract=extractDocument}) {
  const enabled=(_req,res,next)=>process.env.CASEFLOW_ENABLED==='true'?next():res.status(503).json({error:'مساحة الملفات لم تُفعّل لهذا الخادم بعد.'});
  const scoped=(req,res,next)=>{
    if(req.session.user.role!=='lawyer'||!req.session.user.officeId) return res.status(403).json({error:'هذه المساحة خاصة بحساب محامي مرتبط بمكتب.'});
    req.caseflowOffice=req.session.user.officeId;res.set('Cache-Control','no-store');next();
  };
  const base='/api/caseflow';
  const limiter=rateLimit({windowMs:60*60*1000,limit:15,keyGenerator:req=>String(req.caseflowOffice),standardHeaders:'draft-8',legacyHeaders:false});
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:3,fieldSize:60000},fileFilter:(_req,file,cb)=>cb(null,['application/pdf','image/png','image/jpeg','image/webp'].includes(file.mimetype))}).single('file');
  const audit=async(db,req,action,id,payload={})=>db.query('INSERT INTO caseflow_audit(office_id,user_id,action,entity_id,payload) VALUES($1,$2,$3,$4,$5)',[req.caseflowOffice,req.session.user.id,action,id,encrypt(payload)]);
  const interestLimit=rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:'draft-8',legacyHeaders:false});
  app.post(`${base}/interest`,interestLimit,requireCsrf,async(req,res,next)=>{try{
    if(req.body.website)return res.json({ok:true});
    const office=String(req.body.officeName||'').trim().slice(0,120),name=String(req.body.contactName||'').trim().slice(0,100),phone=String(req.body.phone||'').replace(/[\s-]/g,'');
    if(office.length<2||name.length<2||!/^\+?9665\d{8}$|^05\d{8}$/.test(phone)||req.body.consent!==true)return res.status(400).json({error:'أدخل اسم المكتب واسم المسؤول ورقم جوال سعودي، ثم وافق على التواصل.'});
    await query('INSERT INTO caseflow_interest(office_name,contact_name,contact_phone) VALUES($1,$2,$3)',[office,name,phone]);res.json({ok:true});
  }catch(e){next(e)}});
  app.get('/api/admin/caseflow-interest',requireAuth('owner_admin'),requirePasswordChanged,async(_req,res,next)=>{try{const rows=await query('SELECT id,office_name,contact_name,contact_phone,consent_at,source FROM caseflow_interest ORDER BY created_at DESC LIMIT 200');res.set('Cache-Control','no-store').json(rows.rows)}catch(e){next(e)}});
  app.use(base,requireAuth(),requirePasswordChanged,scoped,enabled);
  app.get(`${base}/status`,(_req,res)=>res.json({ready:!!process.env.ANTHROPIC_API_KEY&&/^[a-f0-9]{64}$/i.test(process.env.CASEFLOW_ENCRYPTION_KEY||''),privateDocuments:process.env.CASEFLOW_PRIVATE_DOCUMENTS==='true',reminders:'in-app',model:process.env.CASEFLOW_MODEL||'claude-sonnet-5-5'}));
  app.get(`${base}/workspace`,async(req,res,next)=>{try{
    const [cases,documents,items,audits]=await Promise.all([
      query('SELECT id,payload,created_at FROM caseflow_cases WHERE office_id=$1 ORDER BY created_at DESC LIMIT 200',[req.caseflowOffice]),
      query('SELECT id,payload,approved_at,created_at FROM caseflow_documents WHERE office_id=$1 ORDER BY created_at DESC LIMIT 100',[req.caseflowOffice]),
      query('SELECT id,case_id,document_id,kind,payload,completed_at FROM caseflow_items WHERE office_id=$1 ORDER BY created_at DESC LIMIT 1000',[req.caseflowOffice]),
      query('SELECT action,entity_id,user_id,created_at FROM caseflow_audit WHERE office_id=$1 ORDER BY created_at DESC LIMIT 100',[req.caseflowOffice])]);
    res.json({cases:cases.rows.map(r=>({...r,...decrypt(r.payload),payload:undefined})),documents:documents.rows.map(r=>{const p=decrypt(r.payload);return{id:r.id,approved_at:r.approved_at,created_at:r.created_at,name:p.name,hasOriginal:!!p.original,originalMime:p.original?.mime||'',result:p.result,sourceText:p.sourceText,model:p.model,usage:p.usage,caseId:p.caseId}}),items:items.rows.map(r=>({...r,...decrypt(r.payload),payload:undefined})),audit:audits.rows});
  }catch(e){next(e)}});
  app.get(`${base}/documents/:id/original`,async(req,res,next)=>{try{
    const row=(await query('SELECT payload FROM caseflow_documents WHERE id=$1 AND office_id=$2',[req.params.id,req.caseflowOffice])).rows[0];
    if(!row)return res.status(404).json({error:'المستند غير موجود.'});
    const original=decrypt(row.payload).original;
    if(!original)return res.status(404).json({error:'لا توجد نسخة أصلية محفوظة لهذا المستند.'});
    res.type(original.mime).set('Content-Disposition','inline').set('X-Content-Type-Options','nosniff').send(Buffer.from(original.base64,'base64'));
  }catch(e){next(e)}});
  app.post(`${base}/extract`,requireCsrf,limiter,(req,res,next)=>upload(req,res,error=>error?res.status(400).json({error:'الملف غير مقبول. استخدم PDF أو صورة لا تتجاوز 5 ميغابايت.'}):next()),async(req,res)=>{
    try {
      if(req.body.consent!=='true') return res.status(400).json({error:'أكّد الإذن بمعالجة المستند أولًا.'});
      if(process.env.CASEFLOW_PRIVATE_DOCUMENTS!=='true'&&req.body.publicExample!=='true') return res.status(403).json({error:'النسخة الحالية للنصوص المنشورة أو المصطنعة فقط.'});
      const text=String(req.body.text||'').trim(),file=req.file;
      if((!file&&text.length<10)||text.length>40000) return res.status(400).json({error:'أرفق مستندًا أو نصًا بين 10 و40000 حرف.'});
      if(file){
        const b=file.buffer,valid=file.mimetype==='application/pdf'?b.subarray(0,5).toString()==='%PDF-':file.mimetype==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):file.mimetype==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP';
        if(!valid)return res.status(400).json({error:'محتوى الملف لا يطابق نوعه.'});
      }
      const hash=crypto.createHash('sha256').update(file?file.buffer:text).update(file?text:'').digest('hex');
      const existing=await query('SELECT id,payload,approved_at FROM caseflow_documents WHERE office_id=$1 AND source_hash=$2',[req.caseflowOffice,hash]);
      if(existing.rows[0]){const p=decrypt(existing.rows[0].payload);return res.json({id:existing.rows[0].id,...p,original:undefined,hasOriginal:!!p.original,originalMime:p.original?.mime||'',duplicate:true,approved:!!existing.rows[0].approved_at})}
      const db=await pool.connect();
      try{
        await db.query('BEGIN');await db.query('SELECT id FROM offices WHERE id=$1 FOR UPDATE',[req.caseflowOffice]);
        const count=await db.query("SELECT COUNT(*)::integer AS n FROM caseflow_usage WHERE office_id=$1 AND created_at>NOW()-INTERVAL '1 day'",[req.caseflowOffice]);
        if(count.rows[0].n>=Number(process.env.CASEFLOW_DAILY_LIMIT||20)){await db.query('ROLLBACK');return res.status(429).json({error:'وصل المكتب إلى حد التجربة اليومي.'})}
        await db.query('INSERT INTO caseflow_usage(office_id) VALUES($1)',[req.caseflowOffice]);await db.query('COMMIT');
      }catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}
      const result=await extract({text,file});
      const payload={name:String(file?.originalname||'نص ملصق').slice(0,150),sourceText:text,original:file?{mime:file.mimetype,base64:file.buffer.toString('base64')}:null,result:result.data,model:result.model,promptVersion:result.promptVersion,usage:result.usage};
      const saved=await query('INSERT INTO caseflow_documents(office_id,source_hash,payload) VALUES($1,$2,$3) ON CONFLICT(office_id,source_hash) DO NOTHING RETURNING id',[req.caseflowOffice,hash,encrypt(payload)]);
      if(!saved.rows[0])return res.status(409).json({error:'عولج هذا المستند بالتزامن. حدّث المساحة.'});
      await audit(pool,req,'extracted',saved.rows[0].id,{model:result.model});
      res.json({id:saved.rows[0].id,...payload,original:undefined,hasOriginal:!!file,originalMime:file?.mimetype||''});
    }catch(e){
      if(e.message==='DOCUMENT_TOO_LARGE')return res.status(413).json({error:'المستند طويل لهذه التجربة. ارفع جزءًا أصغر دون تقسيم سياق الموعد أو الإجراء.'});
      const config=['API_NOT_CONFIGURED','ENCRYPTION_NOT_CONFIGURED'].includes(e.message);
      // Never log provider errors: they can contain document text or request headers.
      res.status(config?503:502).json({error:config?'إعداد الخدمة غير مكتمل. راجع مسؤول المكتب.':'لم يكتمل الاستخراج. لم يُعتمد أي موعد أو مهمة. تحقق من الملف أو أعد المحاولة.'});
    }
  });
  app.post(`${base}/documents/:id/approve`,requireCsrf,async(req,res,next)=>{
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      const row=(await db.query('SELECT * FROM caseflow_documents WHERE id=$1 AND office_id=$2 FOR UPDATE',[req.params.id,req.caseflowOffice])).rows[0];
      if(!row){await db.query('ROLLBACK');return res.status(404).json({error:'المستند غير موجود.'})}
      if(row.approved_at){await db.query('ROLLBACK');return res.status(409).json({error:'المستند معتمد مسبقًا.'})}
      const original=decrypt(row.payload),data=req.body.result;
      try{validateExtraction(data,original.sourceText)}catch{await db.query('ROLLBACK');return res.status(400).json({error:'حقول المراجعة غير صالحة.'})}
      if(!normalize(data.caseNumber.value)||data.caseNumber.value.length>100||req.body.reviewed!==true){await db.query('ROLLBACK');return res.status(400).json({error:'حدّد رقم القضية وأكّد مراجعة المصدر.'})}
      // Any ambiguous item requires an explicit user decision, not an inferred date.
      if([...data.events,...data.tasks].some(x=>x.status==='uncertain')){await db.query('ROLLBACK');return res.status(400).json({error:'راجع العناصر الملتبسة وحدّد حالتها أو احذفها قبل الاعتماد.'})}
      const match=crypto.createHash('sha256').update(caseKey(data)).digest('hex');
      let caseId;
      if(req.body.caseId){
        const target=(await db.query('SELECT id,payload FROM caseflow_cases WHERE id=$1 AND office_id=$2',[req.body.caseId,req.caseflowOffice])).rows[0];
        if(!target){await db.query('ROLLBACK');return res.status(404).json({error:'ملف القضية غير موجود.'})}
        if(normalize(decrypt(target.payload).number)!==normalize(data.caseNumber.value)){await db.query('ROLLBACK');return res.status(409).json({error:'رقم المستند لا يطابق رقم الملف المختار.'})}
        caseId=target.id;
      }else{
        const found=(await db.query('SELECT id FROM caseflow_cases WHERE office_id=$1 AND match_key=$2',[req.caseflowOffice,match])).rows[0];
        if(found){await db.query('ROLLBACK');return res.status(409).json({error:'يوجد ملف مطابق. اختره صراحة من قائمة الربط.'})}
        caseId=(await db.query('INSERT INTO caseflow_cases(office_id,match_key,payload) VALUES($1,$2,$3) RETURNING id',[req.caseflowOffice,match,encrypt({number:data.caseNumber.value,court:data.court.value,year:data.caseYear.value})])).rows[0].id;
      }
      const supersedes=Array.isArray(req.body.supersedes)?req.body.supersedes:[];
      const selected=new Set(),newSelected=new Set();
      for(const link of supersedes){
        if(!Number.isInteger(link.newIndex)||link.newIndex<0||link.newIndex>=data.events.length+data.tasks.length||typeof link.oldItemId!=='string'||selected.has(link.oldItemId)||newSelected.has(link.newIndex)){await db.query('ROLLBACK');return res.status(400).json({error:'اختيار التحديث غير صالح.'})}
        const replacement=[...data.events,...data.tasks][link.newIndex];
        if(replacement.status!=='proposed'){await db.query('ROLLBACK');return res.status(400).json({error:'لا يستبدل العنصر السابق إلا موعد أو إجراء جديد معتمد.'})}
        const old=(await db.query('SELECT id,case_id,payload FROM caseflow_items WHERE id=$1 AND office_id=$2 FOR UPDATE',[link.oldItemId,req.caseflowOffice])).rows[0];
        if(!old||old.case_id!==caseId||decrypt(old.payload).status!=='proposed'){await db.query('ROLLBACK');return res.status(409).json({error:'العنصر السابق تغير أو لا يخص هذا الملف.'})}
        selected.add(link.oldItemId);newSelected.add(link.newIndex);
        const before=decrypt(old.payload),after={...before,status:'cancelled'};
        await db.query('UPDATE caseflow_items SET payload=$1 WHERE id=$2',[encrypt(after),old.id]);
        await audit(db,req,'superseded',old.id,{before,after,byDocument:row.id});
      }
      for(const [kind,list] of [['event',data.events],['task',data.tasks]])for(const x of list){
        await db.query('INSERT INTO caseflow_items(office_id,case_id,document_id,kind,payload) VALUES($1,$2,$3,$4,$5)',[req.caseflowOffice,caseId,row.id,kind,encrypt(x)]);
      }
      await db.query('UPDATE caseflow_documents SET payload=$1,approved_at=NOW() WHERE id=$2 AND office_id=$3',[encrypt({...original,result:data,caseId}),row.id,req.caseflowOffice]);
      await audit(db,req,'approved',row.id,{before:original.result,after:data,caseId});
      await db.query('COMMIT');res.json({caseId});
    }catch(e){await db.query('ROLLBACK');next(e)}finally{db.release()}
  });
  app.post(`${base}/items/:id/complete`,requireCsrf,async(req,res,next)=>{try{
    const row=await query("UPDATE caseflow_items SET completed_at=NOW() WHERE id=$1 AND office_id=$2 AND kind='task' RETURNING id",[req.params.id,req.caseflowOffice]);
    if(!row.rows[0])return res.status(404).json({error:'المهمة غير موجودة.'});await audit(pool,req,'completed',req.params.id);res.json({ok:true});
  }catch(e){next(e)}});
  app.post(`${base}/items/:id/cancel`,requireCsrf,async(req,res,next)=>{
    const db=await pool.connect();try{
      await db.query('BEGIN');const row=(await db.query('SELECT payload FROM caseflow_items WHERE id=$1 AND office_id=$2 FOR UPDATE',[req.params.id,req.caseflowOffice])).rows[0];
      if(!row){await db.query('ROLLBACK');return res.status(404).json({error:'العنصر غير موجود.'})}
      const before=decrypt(row.payload),after={...before,status:'cancelled'};
      await db.query('UPDATE caseflow_items SET payload=$1 WHERE id=$2 AND office_id=$3',[encrypt(after),req.params.id,req.caseflowOffice]);
      await audit(db,req,'cancelled',req.params.id,{before,after});await db.query('COMMIT');res.json({ok:true});
    }catch(e){await db.query('ROLLBACK');next(e)}finally{db.release()}
  });
};
