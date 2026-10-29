'use strict';
const office=window.__OFFICE__, $=id=>document.getElementById(id);
const services={ 'أعمال التوثيق':['الوكالات','إفراغ أرض','إفراغ عقار آخر','توثيق عقود الأفراد والشركات','الإقرارات المالية','رهن العقارات وفك الرهن','سداد الإقرارات المالية','وكالة من مقر التوقيف بالدوادمي'], 'خدمات قانونية':['إعداد لائحة دعوى','حضور جلسة','مراجعة النيابة','مراجعة الشرطة','الاطلاع على ملف قضية بالنيابة','تمثيل جهة أو شركة'] };
let kind='consultation', requestKey=crypto.randomUUID(), submitting=false;
let started=false;
const visitKey='maqbil-visit-session';
const visitSession=sessionStorage.getItem(visitKey)||crypto.randomUUID();sessionStorage.setItem(visitKey,visitSession);
function track(type){if(office.draft)return;fetch('/api/public/maqbil/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type,sessionHash:visitSession})}).catch(()=>{});}
track('visit');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for(const [value,label] of Object.entries(office.caseTypes)) $('caseType').add(new Option(label,value));
for(const [label,items] of Object.entries(services)){const group=document.createElement('optgroup');group.label=label;items.forEach(x=>group.appendChild(new Option(x,x)));$('service').appendChild(group);}
office.times.forEach(x=>$('period').add(new Option(x,x)));
const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Riyadh'});
for(let i=1;i<=30;i++){const d=new Date(today+'T12:00:00+03:00');d.setUTCDate(d.getUTCDate()+i);if(!office.allDays&&[5,6].includes(d.getUTCDay()))continue;$('day').add(new Option(d.toLocaleDateString('ar-SA',{weekday:'long',day:'numeric',month:'long',timeZone:'Asia/Riyadh',calendar:'gregory'}),d.toISOString().slice(0,10)));}
function setKind(value){kind=value;$('consultationFields').hidden=kind!=='consultation';$('serviceFields').hidden=kind!=='service';['caseType','day','period','mode'].forEach(x=>$(x).required=kind==='consultation');$('service').required=kind==='service';$('consultationTab').setAttribute('aria-pressed',String(kind==='consultation'));$('serviceTab').setAttribute('aria-pressed',String(kind==='service'));updatePrice();}
function price(){return kind==='service'?($('service').value==='إفراغ أرض'?500:null):($('caseType').value==='labor'?150:office.price);}
function updatePrice(){const amount=price();$('price').textContent=amount===null?'الأتعاب تُحدد مع المكتب بعد مراجعة الطلب. لا تحوّل مبلغًا قبل الاتفاق.':`${amount} ريال شامل الضريبة${kind==='consultation'?' · ٢٥ دقيقة':''}. التحويل لحساب المكتب مباشرة.`;if(!started&&($('caseType').value||$('service').value)){started=true;track('started');}}
$('consultationTab').onclick=()=>setKind('consultation');$('serviceTab').onclick=()=>setKind('service');$('caseType').onchange=updatePrice;$('service').onchange=updatePrice;
function applyAvailability(o){const paused=o.bookingsPaused||!o.active||o.planStatus==='paused'||o.draft;$('paused').hidden=!paused;if(!$('success').hidden)return;$('booking').hidden=paused;}
async function refreshAvailability(){try{const r=await fetch('/api/public/maqbil/office',{cache:'no-store'});if(r.ok)applyAvailability(await r.json());}catch{}}
$('requestForm').onsubmit=async e=>{e.preventDefault();if(submitting)return;submitting=true;$('submit').disabled=true;$('error').textContent='';try{
 const payload={kind,caseType:$('caseType').value,service:$('service').value,mode:$('mode').value,day:$('day').value,period:$('period').value,clientName:$('clientName').value,clientPhone:$('clientPhone').value,summary:$('summary').value,consent:$('consent').checked,website:$('website').value,requestKey};
 const r=await fetch('/api/public/maqbil/request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const result=await r.json();if(!r.ok)throw Error(result.error||'تعذر حفظ الطلب.');
 $('booking').hidden=true;$('success').hidden=false;$('ref').textContent=result.ref;
 const amount=result.price===undefined?price():result.price;const o=result.office;
 $('bank').innerHTML=amount===null?'<b>الطلب بانتظار مراجعة المكتب وتحديد الأتعاب. لا تحوّل مبلغًا قبل الاتفاق.</b>':`<b>قيمة ${kind==='consultation'?'الاستشارة':'الخدمة'}: ${esc(amount)} ريال شامل الضريبة</b><p>حوّل لحساب المكتب مباشرة. يؤكد المكتب وصول الحوالة.</p><dl><dt>البنك</dt><dd>${esc(o.bankName)}</dd><dt>المستفيد</dt><dd>${esc(o.accountName)}</dd><dt>الآيبان</dt><dd dir="ltr">${esc(o.iban)}</dd></dl><button type="button" class="secondary" id="copyIban">نسخ الآيبان</button>`;
 const copy=$('copyIban');if(copy)copy.onclick=async()=>{try{await navigator.clipboard.writeText(o.iban);copy.textContent='تم النسخ';}catch{copy.textContent=o.iban;}};
 const type=kind==='service'?payload.service:office.caseTypes[payload.caseType];const text=`السلام عليكم، أرسلت طلب ${kind==='service'?'خدمة':'استشارة'} من رابط المكتب.\nرقم الطلب: ${result.ref}\nالاسم: ${payload.clientName}\nالنوع: ${type}${kind==='consultation'?`\nالطريقة: ${payload.mode}\nاليوم: ${payload.day}\nالفترة: ${payload.period}`:''}${amount===null?'\nبانتظار تحديد الأتعاب.':`\nالقيمة: ${amount} ريال.`}`;
 $('whatsapp').href=`https://wa.me/${o.whatsapp}?text=${encodeURIComponent(text)}`;$('successTitle').focus();$('success').scrollIntoView({behavior:'smooth'});
 }catch(error){$('error').textContent=error.message;await refreshAvailability();}finally{submitting=false;$('submit').disabled=false;}};
$('newRequest').onclick=()=>{requestKey=crypto.randomUUID();$('requestForm').reset();$('success').hidden=true;$('booking').hidden=false;setKind('consultation');refreshAvailability();};
setKind('consultation');applyAvailability(office);setInterval(refreshAvailability,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAvailability();});
