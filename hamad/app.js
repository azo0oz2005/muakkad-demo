'use strict';

/* ================= إعدادات المكتب ================= */
// كل ما يخص المكتب هنا. غيّر القيم ثم ارفع الملف.
const OFFICE = window.__OFFICE__ || {
  name: 'مكتب حمد بن عواد الشريف للمحاماة والاستشارات القانونية',
  whatsapp: '966510090456',          // رقم استقبال الطلبات (دولي بدون +)
  price: 250,                         // حسب المكتب
  duration: 30,                       // بالدقائق (لم يحددها المكتب بعد)
  // الأوقات مفتوحة حسب المكتب: العميل يختار الفترة المفضلة والمكتب يثبت الساعة
  times: ['صباحًا (9–12)', 'ظهرًا (12–4)', 'مساءً (4–9)', 'أي وقت'],
  allDays: true,                      // كل أيام الأسبوع
  // طريقة الدفع: اترك الاثنين فارغين حتى يرسلها المكتب
  payLink: '',                        // رابط دفع (ميسر / Paylink / Tap)
  iban: 'SA5536031016043771844027',   // تحويل بنكي
  bankName: 'بنك D360',
  accountName: 'حمد عواد الشريف',
  cancelPolicy: 'الإلغاء قبل الموعد بـ 24 ساعة: استرداد كامل أو إعادة جدولة. أقل من 24 ساعة أو عدم الحضور: لا يُسترد المبلغ.',
  draft: false,
  // إحصاءات الزوار (GoatCounter): اسم الحساب فقط، مثل 'muakkad'. فارغ = بدون إحصاء
  goatcounter: ''                        // يُظهر شريط «نسخة مبدئية» — اجعله false عند التسليم
};

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const STEP_NAMES = ['نوع القضية', 'أسئلة الفرز', 'اختيار الموعد', 'بيانات التواصل', 'مراجعة وإرسال'];

const CASE_TYPES = {
  labor: 'عمالية',
  enforcement: 'تنفيذ ومطالبات',
  commercial: 'تجارية',
  realestate: 'عقارية',
  family: 'أحوال شخصية',
  other: 'أخرى'
};

const DEADLINE_Q = { id: 'deadline', label: 'هل توجد مهلة أو جلسة قريبة؟', options: ['لا', 'خلال أسبوع', 'خلال شهر', 'لا أعرف'] };

const SCREENING = {
  labor: [
    { id: 'ended', label: 'هل انتهت علاقة العمل؟', options: ['نعم', 'لا', 'أُبلغت بالإنهاء'] },
    { id: 'when', label: 'متى انتهت؟', options: ['أقل من شهر', '1–6 أشهر', '6–12 شهرًا', 'أكثر من سنة', 'لم تنتهِ'] },
    { id: 'amicable', label: 'هل قدمت طلبًا في التسوية الودية؟', options: ['نعم', 'لا', 'لا أعرف'] },
    DEADLINE_Q
  ],
  enforcement: [
    { id: 'sanad', label: 'هل يوجد سند تنفيذي؟', options: ['نعم', 'لا', 'غير متأكد'] },
    { id: 'amount', label: 'هل المبلغ محدد؟', options: ['نعم', 'لا'] },
    { id: 'started', label: 'هل بدأت إجراءات التنفيذ؟', options: ['نعم', 'لا'] },
    DEADLINE_Q
  ],
  commercial: [
    { id: 'role', label: 'وضعك في النزاع؟', options: ['مطالِب', 'مطالَب', 'لم يبدأ نزاع'] },
    { id: 'contract', label: 'هل يوجد عقد مكتوب؟', options: ['نعم', 'لا', 'جزئيًا'] },
    DEADLINE_Q
  ],
  realestate: [
    { id: 'kind', label: 'نوع الموضوع؟', options: ['إيجار', 'إخلاء', 'ملكية', 'مقاولات'] },
    { id: 'contract', label: 'هل العقد موثق؟', options: ['نعم', 'لا', 'لا يوجد عقد'] },
    DEADLINE_Q
  ],
  family: [
    { id: 'kind', label: 'نوع الموضوع؟', options: ['نفقة', 'حضانة وزيارة', 'تركات', 'أخرى'] },
    { id: 'filed', label: 'هل رُفعت دعوى؟', options: ['نعم', 'لا'] },
    DEADLINE_Q
  ],
  other: [
    { id: 'kind', label: 'أقرب وصف؟', options: ['مراجعة عقد', 'اعتراض على مخالفة', 'استفسار عام'] },
    DEADLINE_Q
  ]
};

/* ================= أدوات ================= */
const $ = (id) => document.getElementById(id);
const radio = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value || '';

function toLatinDigits(s) {
  return String(s)
    .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660)
    .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06F0);
}

/** 05xxxxxxxx / 5xxxxxxxx / +9665… / أرقام عربية ← 05xxxxxxxx أو '' */
function normalizePhone(raw) {
  let d = toLatinDigits(raw).replace(/\D/g, '');
  if (d.startsWith('00966')) d = d.slice(5);
  else if (d.startsWith('966')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return /^5[0-9]{8}$/.test(d) ? '0' + d : '';
}

/** أيام العمل القادمة (الأحد–الخميس) ابتداءً من الغد */
function workingDays(from, count) {
  const out = [];
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  while (out.length < count) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (!OFFICE.allDays && (wd === 5 || wd === 6)) continue;
    out.push({ weekday: DAY_NAMES[wd], day: d.getDate(), month: MONTHS[d.getMonth()] });
  }
  return out;
}

/* ================= تعبئة إعدادات المكتب ================= */
document.querySelectorAll('[data-price]').forEach((el) => { el.textContent = OFFICE.price; });
document.querySelectorAll('[data-duration]').forEach((el) => { el.textContent = OFFICE.duration; });
$('cancelPolicy').textContent = OFFICE.cancelPolicy + ' (قد يحدد المكتب سياسة مختلفة عند تأكيد الموعد.)';
$('draftRibbon').hidden = !OFFICE.draft;
$('times').insertAdjacentHTML('beforeend', OFFICE.times
  .map((t) => `<label><input type="radio" name="time" value="${t}"><span>${t}</span></label>`).join(''));

function payInfoHtml() {
  if (OFFICE.payLink) {
    return `<p><b>الدفع:</b> بعد إرسال الطلب، ادفع قيمة الاستشارة من <a href="${OFFICE.payLink}" target="_blank" rel="noopener">رابط الدفع</a> (مدى / Apple Pay) ليتأكد موعدك.</p>`;
  }
  if (OFFICE.iban) {
    return `<p><b>الدفع بتحويل بنكي:</b> حوّل ${OFFICE.price} ر.س إلى حساب المكتب، ويتأكد موعدك بعد وصول الحوالة.</p>
      <dl class="bank">
        <div><dt>البنك</dt><dd>${OFFICE.bankName}</dd></div>
        <div><dt>اسم المستفيد</dt><dd>${OFFICE.accountName}</dd></div>
        <div><dt>الآيبان</dt><dd class="iban" dir="ltr">${OFFICE.iban}</dd></div>
      </dl>
      <button type="button" class="secondary small" id="copyIban">نسخ الآيبان</button>`;
  }
  return '<p><b>الدفع:</b> بعد استلام طلبك يرسل لك المكتب طريقة الدفع، ويتأكد موعدك بعد استلام قيمة الاستشارة.</p>';
}
$('payInfo').innerHTML = payInfoHtml();
$('payInfo').addEventListener('click', async (e) => {
  if (e.target.id !== 'copyIban') return;
  try { await navigator.clipboard.writeText(OFFICE.iban); e.target.textContent = 'تم النسخ ✓'; }
  catch (err) { e.target.textContent = OFFICE.iban; }
});

/* ================= إحصاءات (بدون كوكيز ولا بيانات شخصية) ================= */
const PAGE_KEY = window.__OFFICE_SLUG__ || 'hamad';
const SESSION_KEY = `muakkad-session-${PAGE_KEY}`;
let sessionHash = sessionStorage.getItem(SESSION_KEY);
if (!sessionHash) {
  sessionHash = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  sessionStorage.setItem(SESSION_KEY, sessionHash);
}
async function api(path, options = {}) {
  const response = await fetch(`/api/public/${PAGE_KEY}${path}`, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'تعذر حفظ الطلب.');
  return response.status === 204 ? null : response.json();
}
function track(type, step = null) {
  api('/event', { method:'POST', body:JSON.stringify({ type, step, sessionHash }) }).catch(() => {});
}
if (window.__OFFICE__) track('visit');
let startedTracked = false;

/* ================= حالة الرحلة ================= */
const form = $('intakeForm');
const steps = [...document.querySelectorAll('.step')];
let current = 1;
let selectedDay = '';
let bookingId = '';
let bookingRef = '';

const slotText = () => (selectedDay && radio('time') ? `${selectedDay}، ${radio('time')}` : '');

function renderScreening() {
  const qs = SCREENING[radio('caseType')] || [];
  $('screening').innerHTML = qs.map((q) => `
    <fieldset class="q" aria-describedby="err-${q.id}">
      <legend>${q.label}</legend>
      <div class="chips">
        ${q.options.map((o) => `<label><input type="radio" name="q-${q.id}" value="${o}"><span>${o}</span></label>`).join('')}
      </div>
      <p class="error" id="err-${q.id}" role="alert"></p>
    </fieldset>`).join('');
}

function renderDays() {
  const box = $('days');
  box.innerHTML = '';
  workingDays(new Date(), OFFICE.allDays ? 7 : 5).forEach((d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'day';
    b.dataset.value = `${d.weekday} ${d.day} ${d.month}`;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<small>${d.weekday}</small><b>${d.day}</b><small>${d.month}</small>`;
    b.addEventListener('click', () => {
      box.querySelectorAll('.day').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      selectedDay = b.dataset.value;
      setError('dayError', '');
      updateSummary();
    });
    box.appendChild(b);
  });
}

function setError(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.classList.toggle('show', !!msg);
  const field = document.querySelector(`[aria-describedby~="${id}"]`);
  if (field) field.setAttribute('aria-invalid', msg ? 'true' : 'false');
}

function validate() {
  if (current === 1) {
    const ok = !!radio('caseType');
    setError('typeError', ok ? '' : 'اختر نوع القضية.');
    return ok;
  }
  if (current === 2) {
    let first = null;
    (SCREENING[radio('caseType')] || []).forEach((q) => {
      const ok = !!radio('q-' + q.id);
      setError('err-' + q.id, ok ? '' : 'اختر إجابة.');
      if (!ok && !first) first = document.querySelector(`input[name="q-${q.id}"]`);
    });
    if (first) first.focus();
    return !first;
  }
  if (current === 3) {
    const okDay = !!selectedDay;
    const okTime = !!radio('time');
    setError('dayError', okDay ? '' : 'اختر اليوم.');
    setError('timeError', okTime ? '' : 'اختر الوقت.');
    return okDay && okTime;
  }
  if (current === 4) {
    const okName = $('name').value.trim().length >= 2;
    const okPhone = !!normalizePhone($('phone').value);
    const okConsent = $('consent').checked;
    setError('nameError', okName ? '' : 'اكتب اسمك.');
    setError('phoneError', okPhone ? '' : 'رقم الجوال غير صحيح. مثال: 0501234567');
    setError('consentError', okConsent ? '' : 'الموافقة مطلوبة لإكمال الحجز.');
    const bad = !okName ? $('name') : !okPhone ? $('phone') : !okConsent ? $('consent') : null;
    if (bad) bad.focus();
    return !bad;
  }
  return true;
}

function buildMessage() {
  const answers = (SCREENING[radio('caseType')] || [])
    .map((q) => `- ${q.label} ${radio('q-' + q.id)}`).join('\n');
  const summary = $('caseDetails').value.trim();
  return [
    'السلام عليكم، طلب حجز استشارة:',
    bookingRef ? `رقم الطلب: ${bookingRef}` : '',
    '',
    `الاسم: ${$('name').value.trim()}`,
    `الجوال: ${normalizePhone($('phone').value)}`,
    `نوع الاستشارة: ${CASE_TYPES[radio('caseType')]}`,
    `الموعد المطلوب: ${slotText()}`,
    '',
    'إجابات الفرز:',
    answers,
    summary ? `\nملخص: ${summary}` : '',
    '',
    `(قيمة الاستشارة ${OFFICE.price} ر.س — سأحوّلها على الآيبان وأرسل الإيصال هنا)`
  ].filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}

const waUrl = () => `https://wa.me/${OFFICE.whatsapp}?text=${encodeURIComponent(buildMessage())}`;

function render(focus = true) {
  steps.forEach((x) => x.classList.toggle('active', Number(x.dataset.step) === current));
  const inFlow = current <= 5;
  $('actions').hidden = current === 6;
  $('nextBtn').hidden = current === 5;
  $('backBtn').disabled = current === 1;
  $('nextBtn').textContent = current === 4 ? 'راجع الطلب' : 'التالي';
  $('stepLabel').textContent = inFlow ? `الخطوة ${current} من 5` : 'اكتمل الطلب';
  $('stepName').textContent = inFlow ? STEP_NAMES[current - 1] : '';
  $('progressBar').style.width = `${inFlow ? (current - 1) * 20 + 10 : 100}%`;
  if (current === 5) {
    $('revType').textContent = CASE_TYPES[radio('caseType')];
    $('revSlot').textContent = slotText();
    $('revName').textContent = $('name').value.trim();
  }
  updateSummary();
  if (window.__OFFICE__ && bookingId && current > 1 && current <= 5) {
    api('/progress', { method:'PATCH', body:JSON.stringify({ bookingId, sessionHash, step:current }) }).catch(() => {});
  }
  if (focus) {
    const h = document.querySelector('.step.active h2');
    $('live').textContent = inFlow ? `الخطوة ${current} من 5: ${STEP_NAMES[current - 1]}` : h.textContent;
    h.focus({ preventScroll: true });
    $('workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function updateSummary() {
  const type = CASE_TYPES[radio('caseType')] || '';
  const slot = selectedDay ? selectedDay + (radio('time') ? `، ${radio('time')}` : '') : '';
  $('sumType').textContent = type || 'لم يُحدد';
  $('sumSlot').textContent = slot || 'لم يُحدد';
  const mini = $('miniSummary');
  mini.hidden = !type || current === 6;
  mini.textContent = [type, slot, type ? `${OFFICE.price} ر.س` : ''].filter(Boolean).join(' · ');
}

function resetForm() {
  form.reset();
  current = 1;
  selectedDay = '';
  bookingId = '';
  bookingRef = '';
  $('charCount').textContent = '0';
  $('screening').innerHTML = '';
  document.querySelectorAll('.day').forEach((x) => x.setAttribute('aria-pressed', 'false'));
  document.querySelectorAll('.error').forEach((x) => { x.textContent = ''; x.classList.remove('show'); });
  document.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
  render();
}

/* ================= أحداث ================= */
$('startBtn').addEventListener('click', () => {
  $('workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelector('input[name="caseType"]').focus({ preventScroll: true });
});
$('nextBtn').addEventListener('click', () => { if (validate()) { current += 1; render(); } });
$('backBtn').addEventListener('click', () => { if (current > 1) { current -= 1; render(); } });
$('sendBtn').addEventListener('click', async () => {
  const button = $('sendBtn');
  button.disabled = true;
  button.textContent = 'جاري حفظ الطلب…';
  try {
    if (window.__OFFICE__) {
      const answers = Object.fromEntries((SCREENING[radio('caseType')] || []).map((q) => [q.id, radio('q-' + q.id)]));
      const result = await api('/submit', { method:'POST', body:JSON.stringify({
        bookingId, sessionHash, caseType:radio('caseType'), answers,
        summary:$('caseDetails').value.trim(), clientName:$('name').value.trim(), clientPhone:$('phone').value,
        preferredDay:selectedDay, preferredPeriod:radio('time'), consent:$('consent').checked, website:$('website')?.value || ''
      }) });
      bookingId = result.id;
      bookingRef = result.ref;
    } else track('sent');
    const url = waUrl();
    $('resendLink').href = url;
    window.open(url, '_blank', 'noopener');
    current = 6;
    render();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'أرسل الطلب للمكتب عبر واتساب';
  }
});
$('restart').addEventListener('click', resetForm);

form.addEventListener('change', async (e) => {
  if (e.target.name === 'caseType') {
    renderScreening();
    setError('typeError', '');
    if (!startedTracked) {
      startedTracked = true;
      if (window.__OFFICE__) {
        try {
          const result = await api('/start', { method:'POST', body:JSON.stringify({ sessionHash, caseType:radio('caseType') }) });
          bookingId = result.id; bookingRef = result.ref;
        } catch (error) { console.error(error); }
      } else track('started');
    }
  }
  if (e.target.name === 'time') setError('timeError', '');
  if (e.target.name && e.target.name.startsWith('q-')) setError('err-' + e.target.name.slice(2), '');
  if (e.target.id === 'consent' && e.target.checked) setError('consentError', '');
  updateSummary();
});
form.addEventListener('input', (e) => {
  if (e.target.id === 'caseDetails') $('charCount').textContent = e.target.value.length;
});
form.addEventListener('submit', (e) => e.preventDefault());

/* نوافذ */
let lastFocus = null;
document.addEventListener('click', (e) => {
  const opener = e.target.closest('[data-open]');
  if (opener) {
    e.preventDefault();
    lastFocus = document.activeElement;
    const d = $(opener.dataset.open);
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    return;
  }
  const closer = e.target.closest('[data-close]');
  if (closer) {
    const d = closer.closest('dialog');
    if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
    if (lastFocus) lastFocus.focus();
  }
});

renderDays();
render(false);

// للاختبار فقط
window.__hamad = { buildMessage, normalizePhone, workingDays };
