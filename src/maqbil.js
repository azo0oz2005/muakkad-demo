'use strict';
const {cleanText, normalizePhone, shortRef} = require('./utils');
const SERVICES = {
  notarization: ['الوكالات','إفراغ أرض','إفراغ عقار آخر','توثيق عقود الأفراد والشركات','الإقرارات المالية','رهن العقارات وفك الرهن','سداد الإقرارات المالية','وكالة من مقر التوقيف بالدوادمي'],
  legal: ['إعداد لائحة دعوى','حضور جلسة','مراجعة النيابة','مراجعة الشرطة','الاطلاع على ملف قضية بالنيابة','تمثيل جهة أو شركة']
};
function requestPrice(kind, caseType, service, office) {
  if (kind === 'service') return service === 'إفراغ أرض' ? 500 : null;
  return caseType === 'labor' ? 150 : office.price;
}
function bookingUnavailable(office) {
  return !office || !office.active || office.plan_status === 'paused' || office.preview_only || office.bookings_paused;
}
module.exports = function mountMaqbil(app, {pool, loadOffice, safeOffice, submitLimiter}) {
  app.post('/api/public/maqbil/request', submitLimiter, async (req,res) => {
    if (req.body.website) return res.status(400).json({error:'طلب غير صالح.'});
    const name=cleanText(req.body.clientName,60), phone=normalizePhone(req.body.clientPhone);
    const kind=req.body.kind, caseType=cleanText(req.body.caseType,40), service=cleanText(req.body.service,80);
    const key=cleanText(req.body.requestKey,80), day=String(req.body.day||''), period=cleanText(req.body.period,50);
    const mode=cleanText(req.body.mode,40);
    if(name.length<2 || !phone || !['consultation','service'].includes(kind) || key.length<12 || req.body.consent!==true)
      return res.status(400).json({error:'راجع الاسم والجوال والموافقة.'});
    const c=await pool.connect();
    try {
      await c.query('BEGIN');
      // Serialize pause and request submission against the same office row.
      const office=(await c.query("SELECT * FROM offices WHERE slug='maqbil' FOR UPDATE")).rows[0];
      if(bookingUnavailable(office)) {await c.query('ROLLBACK');return res.status(409).json({error:'المكتب لا يستقبل حجوزات جديدة حاليًا. حاول لاحقًا.'});}
      const existing=(await c.query('SELECT id,ref,quoted_price FROM bookings WHERE office_id=$1 AND session_hash=$2',[office.id,key])).rows[0];
      if(existing) {await c.query('COMMIT');return res.json({...existing,price:existing.quoted_price,office:safeOffice(office)});}
      if(kind==='consultation') {
        const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Riyadh'});
        const date=new Date(day+'T12:00:00+03:00');
        const distance=(date-new Date(today+'T12:00:00+03:00'))/86400000;
        if(!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(distance) || distance<1 || distance>30 || date.toISOString().slice(0,10)!==day ||
          (!office.all_days && [5,6].includes(date.getUTCDay())) || !office.case_types[caseType] || !office.periods.includes(period) || !['حضورية','اتصال هاتفي'].includes(mode)) {
          await c.query('ROLLBACK');return res.status(400).json({error:'راجع نوع القضية واليوم والفترة وطريقة الاستشارة.'});
        }
      } else if(!Object.values(SERVICES).flat().includes(service)) {
        await c.query('ROLLBACK');return res.status(400).json({error:'اختر خدمة من القائمة.'});
      }
      const price=requestPrice(kind,caseType,service,office);
      const rawAnswers=req.body.answers&&typeof req.body.answers==='object'&&!Array.isArray(req.body.answers)?req.body.answers:{};
      const answers=kind==='consultation'? {...Object.fromEntries(Object.entries(rawAnswers).slice(0,10).map(([key,value])=>[cleanText(key,80),cleanText(value,120)])),'طريقة الاستشارة':mode}:{};
      const result=await c.query(`INSERT INTO bookings
        (office_id,ref,request_kind,case_type,service_label,quoted_price,answers,summary,client_name,client_phone,preferred_day,preferred_period,status,last_step,session_hash)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'awaiting_payment',5,$13) RETURNING id,ref`,
        [office.id,shortRef(),kind,kind==='consultation'?caseType:'other',kind==='service'?service:null,price,JSON.stringify(answers),cleanText(req.body.summary,300)||null,name,phone,kind==='consultation'?day:null,kind==='consultation'?period:null,key]);
      await c.query("INSERT INTO events (office_id,type,step,session_hash) VALUES ($1,'submitted',5,$2)",[office.id,key]);
      await c.query('COMMIT');res.status(201).json({...result.rows[0],price,office:safeOffice(office)});
    } catch(error) {await c.query('ROLLBACK');throw error;} finally {c.release();}
  });
};
module.exports.SERVICES=SERVICES;
module.exports.requestPrice=requestPrice;
module.exports.bookingUnavailable=bookingUnavailable;
