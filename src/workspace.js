'use strict';

const { normalizePhone, cleanText, shortRef } = require('./utils');
const { slotsFor, validDay, normalizeConfig } = require('./schedule');

module.exports = function mountWorkspace(app, { pool, query, loadOffice, safeOffice, requireAuth, requireCsrf, submitLimiter }) {
  async function occupied(db, officeId, day) {
    const result = await db.query(`SELECT appointment_at AS starts_at,appointment_end AS ends_at FROM bookings
      WHERE office_id=$1 AND appointment_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Riyadh')
      AND appointment_at < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Riyadh')
      AND status IN ('awaiting_payment','paid','confirmed')
      UNION ALL SELECT starts_at,ends_at FROM calendar_blocks WHERE office_id=$1 AND released_at IS NULL
      AND starts_at < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Riyadh') AND ends_at > ($2::date::timestamp AT TIME ZONE 'Asia/Riyadh')`, [officeId,day]);
    return result.rows;
  }
  app.get('/api/public/:slug/slots', async (req,res) => {
    const office = await loadOffice(req.params.slug); const day = String(req.query.day || '');
    if (!office?.active || !office.workspace_config?.enabled || !validDay(day)) return res.status(400).json({error:'اختر يومًا متاحًا خلال 30 يومًا.'});
    res.json(slotsFor(office,day,await occupied(pool,office.id,day)));
  });
  app.post('/api/public/:slug/request', submitLimiter, async (req,res) => {
    if (req.body.website) return res.status(400).json({error:'طلب غير صالح.'});
    const name = cleanText(req.body.clientName,60); const phone = normalizePhone(req.body.clientPhone);
    const sessionHash = cleanText(req.body.sessionHash,80); const kind = req.body.kind;
    if (name.length < 2 || !phone || sessionHash.length < 12 || req.body.consent !== true || !['consultation','service'].includes(kind)) return res.status(400).json({error:'راجع الاسم والجوال والموافقة.'});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const office = (await client.query('SELECT * FROM offices WHERE slug=$1 FOR UPDATE',[req.params.slug])).rows[0];
      if (!office?.active || office.preview_only || !office.workspace_config?.enabled) { await client.query('ROLLBACK'); return res.status(404).json({error:'الخدمة غير متاحة.'}); }
      const requestKey = cleanText(req.body.requestKey,80);
      if (requestKey.length < 12) { await client.query('ROLLBACK'); return res.status(400).json({error:'حدّث الصفحة وأعد المحاولة.'}); }
      const existing = (await client.query('SELECT id,ref FROM bookings WHERE office_id=$1 AND session_hash=$2',[office.id,requestKey])).rows[0];
      if (existing) { await client.query('COMMIT'); return res.json(existing); }
      const caseType = cleanText(req.body.caseType,40); const service = cleanText(req.body.service,60);
      let slot = null;
      if (kind === 'consultation') {
        const day = String(req.body.day || '');
        if (!office.case_types[caseType] || !validDay(day)) { await client.query('ROLLBACK'); return res.status(400).json({error:'راجع نوع القضية واليوم.'}); }
        slot = slotsFor(office,day,await occupied(client,office.id,day)).find(x=>x.time === req.body.time && x.available);
        if (!slot) { await client.query('ROLLBACK'); return res.status(409).json({error:'الوقت حُجز أو لم يعد متاحًا. اختر وقتًا آخر.'}); }
      } else if (!office.workspace_config.services.includes(service)) { await client.query('ROLLBACK'); return res.status(400).json({error:'اختر خدمة من القائمة.'}); }
      const result = await client.query(`INSERT INTO bookings (office_id,ref,case_type,summary,client_name,client_phone,preferred_day,preferred_period,
        appointment_at,appointment_end,request_kind,service_label,quoted_price,is_test,status,last_step,session_hash)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'awaiting_payment',5,$15) RETURNING id,ref`,
        [office.id,shortRef(),kind==='consultation'?caseType:'other',cleanText(req.body.summary,300)||null,name,phone,kind==='consultation'?req.body.day:null,slot?.time||null,
          slot?.start||null,slot?.end||null,kind,kind==='service'?service:null,kind==='consultation'?office.price:null,!!office.workspace_config.testMode,requestKey]);
      await client.query("INSERT INTO events (office_id,type,step,session_hash) VALUES ($1,'submitted',5,$2)",[office.id,sessionHash]);
      await client.query('COMMIT'); res.status(201).json(result.rows[0]);
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally {client.release();}
  });

  const auth = requireAuth('lawyer');
  async function owned(req,res,next) {
    const office = (await query('SELECT * FROM offices WHERE id=$1',[req.session.user.officeId])).rows[0];
    if (!office?.workspace_config?.enabled) return res.status(404).json({error:'اللوحة غير متاحة.'});
    req.office = office; next();
  }
  app.use('/api/workspace', auth, owned);
  app.get('/api/workspace', async (req,res) => {
    const bookings = await query(`SELECT id,ref,request_kind,case_type,service_label,summary,client_name,client_phone,appointment_at,appointment_end,
      quoted_price,quote_note,is_test,status,paid_at,created_at FROM bookings WHERE office_id=$1 AND request_kind IN ('consultation','service')
      ORDER BY created_at DESC LIMIT 500`,[req.office.id]);
    const blocks = await query('SELECT id,starts_at,ends_at FROM calendar_blocks WHERE office_id=$1 AND released_at IS NULL AND ends_at>NOW() ORDER BY starts_at',[req.office.id]);
    res.json({office:safeOffice(req.office),bookings:bookings.rows,blocks:blocks.rows});
  });
  app.patch('/api/workspace/settings', requireCsrf, async (req,res) => {
    const config = normalizeConfig(req.body,req.office.workspace_config);
    const price = Number(req.body.price); const duration = Number(req.body.duration);
    const whatsapp = normalizePhone(req.body.whatsapp).replace('+',''); const iban=cleanText(req.body.iban,34).replace(/\s/g,'').toUpperCase();
    if (!config || !Number.isInteger(price) || price < 0 || price > 100000 || !Number.isInteger(duration) || duration < 10 || duration > 240 || !whatsapp || (iban && !/^SA\d{22}$/.test(iban))) return res.status(400).json({error:'راجع السعر والمدة والأوقات والآيبان.'});
    if (!config.testMode && !iban) return res.status(400).json({error:'أضف آيبان المكتب قبل تفعيل الدفع الفعلي.'});
    await query(`UPDATE offices SET workspace_config=$1,price=$2,duration_min=$3,whatsapp=$4,bank_name=$5,account_name=$6,iban=$7,cancel_policy=$8,updated_at=NOW() WHERE id=$9`,
      [JSON.stringify(config),price,duration,whatsapp,cleanText(req.body.bankName,80),cleanText(req.body.accountName,100),iban,cleanText(req.body.cancelPolicy,600),req.office.id]);
    res.json({ok:true});
  });
  app.patch('/api/workspace/requests/:id', requireCsrf, async (req,res) => {
    const status = ['paid','confirmed','cancelled','no_show'].includes(req.body.status)?req.body.status:null;
    const quote = req.body.quote !== undefined ? Number(req.body.quote) : null;
    if ((!status && quote === null) || (quote !== null && (!Number.isInteger(quote) || quote < 0 || quote > 1000000))) return res.status(400).json({error:'راجع الحالة أو الأتعاب.'});
    const client=await pool.connect();
    try {
      await client.query('BEGIN'); await client.query('SELECT id FROM offices WHERE id=$1 FOR UPDATE',[req.office.id]);
      const booking=(await client.query('SELECT * FROM bookings WHERE id=$1 AND office_id=$2 FOR UPDATE',[req.params.id,req.office.id])).rows[0];
      if(!booking) {await client.query('ROLLBACK');return res.status(404).json({error:'الطلب غير موجود.'});}
      if(status && ['cancelled','no_show'].includes(booking.status)) {await client.query('ROLLBACK');return res.status(400).json({error:'الطلب مغلق. أنشئ حجزًا جديدًا.'});}
      if(quote!==null && booking.request_kind!=='service') {await client.query('ROLLBACK');return res.status(400).json({error:'الأتعاب تخص طلبات الخدمات.'});}
      if(status==='paid' && booking.quoted_price===null && quote===null) {await client.query('ROLLBACK');return res.status(400).json({error:'حدد الأتعاب أولًا.'});}
      await client.query(`UPDATE bookings SET status=COALESCE($1,status),quoted_price=COALESCE($2,quoted_price),quote_note=CASE WHEN $2::integer IS NULL THEN quote_note ELSE $3 END,
        paid_at=CASE WHEN $1='paid' THEN COALESCE(paid_at,NOW()) ELSE paid_at END,updated_at=NOW() WHERE id=$4`,[status,quote,cleanText(req.body.note,300),booking.id]);
      await client.query('COMMIT');res.json({ok:true});
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  });
  app.post('/api/workspace/blocks',requireCsrf,async(req,res)=>{
    const day=String(req.body.day||''); const client=await pool.connect();
    try {
      await client.query('BEGIN');const office=(await client.query('SELECT * FROM offices WHERE id=$1 FOR UPDATE',[req.office.id])).rows[0];
      const slot=slotsFor(office,day,validDay(day)?await occupied(client,office.id,day):[]).find(x=>x.time===req.body.time&&x.available);
      if(!slot){await client.query('ROLLBACK');return res.status(409).json({error:'اختر وقتًا متاحًا.'});}
      await client.query('INSERT INTO calendar_blocks (office_id,starts_at,ends_at) VALUES ($1,$2,$3)',[office.id,slot.start,slot.end]);
      await client.query('COMMIT');res.status(201).json({ok:true});
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  });
  app.patch('/api/workspace/blocks/:id',requireCsrf,async(req,res)=>{
    // تحرير الحظر دون حذف بيانات.
    await query('UPDATE calendar_blocks SET released_at=NOW() WHERE id=$1 AND office_id=$2',[req.params.id,req.office.id]);
    res.json({ok:true});
  });
};
