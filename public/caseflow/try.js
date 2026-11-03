'use strict';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const code=params.get('code');
if(code&&/^[a-f0-9]{64}$/i.test(code)){sessionStorage.setItem('caseflowTrialCode',code);history.replaceState(null,'',location.pathname)}
const token=sessionStorage.getItem('caseflowTrialCode')||'';
const node=(tag,value)=>{const x=document.createElement(tag);x.textContent=String(value??'');return x};
let csrf='';
async function request(path,options={}){
  const response=await fetch('/api/caseflow/trial'+path,{...options,headers:{authorization:'Bearer '+token,'x-csrf-token':csrf,...options.headers},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'تعذر إكمال الطلب.');
  return data;
}
function renderItems(id,items){
  const box=$(id);box.replaceChildren();
  if(!items?.length){box.append(node('p','لا توجد عناصر مستخرجة.'));return}
  for(const item of items){const article=node('article','');article.className='trial-item';article.append(node('strong',item.title||'عنصر غير مسمى'),node('p',[item.date,item.time,item.calendar].filter(Boolean).join(' · ')),node('blockquote',`صفحة ${item.page}: ${item.evidence||'لا يوجد دليل واضح'}`));box.append(article)}
}
function render(data){
  $('trial-result').hidden=false;
  const fields=$('trial-fields');fields.replaceChildren();
  for(const [label,field] of [['نوع المستند',{value:data.documentType}],['رقم القضية',data.caseNumber],['المحكمة',data.court],['السنة',data.caseYear]]){
    const article=node('article','');article.className='trial-item';article.append(node('strong',label),node('p',field?.value||'غير واضح'));
    if(field?.evidence)article.append(node('blockquote',`صفحة ${field.page}: ${field.evidence}`));fields.append(article);
  }
  fields.append(node('p',data.summary||''));
  renderItems('trial-events',data.events);renderItems('trial-tasks',data.tasks);
  const warnings=$('trial-warnings');warnings.replaceChildren();for(const warning of data.warnings||[])warnings.append(node('p',warning));if(!warnings.childNodes.length)warnings.append(node('p','لا تنبيهات إضافية.'));
  $('trial-result').scrollIntoView({behavior:'smooth'});
}
$('trial-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('trial-submit');button.disabled=true;$('trial-message').textContent='جارٍ قراءة المستند…';$('trial-result').hidden=true;
  try{
    const form=new FormData();form.set('text',$('trial-text').value);form.set('consent',String($('trial-consent').checked));form.set('deidentified',String($('trial-consent').checked));if($('trial-file').files[0])form.set('file',$('trial-file').files[0]);
    const result=await request('/extract',{method:'POST',body:form});render(result.result);$('trial-state').textContent=`المتبقي اليوم: ${result.remaining} من 20. يتجدد الرصيد عند منتصف الليل بتوقيت الرياض.`;$('trial-message').textContent='اكتمل الاستخراج. راجع الأدلة قبل استخدام أي معلومة.';
  }catch(error){$('trial-message').textContent=error.message;try{const status=await request('/status');$('trial-state').textContent=`المتبقي اليوم: ${status.remaining} من 20. يتجدد الرصيد عند منتصف الليل بتوقيت الرياض.`}catch{}}
  finally{button.disabled=false}
});
(async()=>{try{if(!token)throw Error('الرابط غير صالح. اطلب رابط تجربة خاصًا من مؤكد.');const response=await fetch('/api/csrf');csrf=(await response.json()).token;const status=await request('/status');$('trial-state').textContent=`المتبقي اليوم: ${status.remaining} من 20. يتجدد الرصيد عند منتصف الليل بتوقيت الرياض.`;$('trial-work').hidden=false}catch(error){$('trial-state').textContent=error.message}})();
