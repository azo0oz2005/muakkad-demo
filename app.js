'use strict';

/* ================= إعدادات ================= */
const FEE = 250;
const HOLD_MINUTES = 15;
const STORE_KEY = 'ofuq-demo-v2';
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const STEP_NAMES = ['نوع القضية', 'أسئلة الفرز', 'اختيار الموعد', 'بيانات التواصل', 'صفحة الدفع'];

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
const now = () => Date.now();
const HOUR = 3600e3;

function toLatinDigits(s) {
  return String(s)
    .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660)
    .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06F0);
}

/** يحوّل 05xxxxxxxx / 5xxxxxxxx / +9665… / أرقام عربية إلى +9665xxxxxxxx أو يرجع '' */
function normalizePhone(raw) {
  let d = toLatinDigits(raw).replace(/\D/g, '');
  if (d.startsWith('00966')) d = d.slice(5);
  else if (d.startsWith('966')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return /^5\d{8}$/.test(d) ? '+966' + d : '';
}

/** أيام العمل القادمة (الأحد–الخميس) ابتداءً من الغد */
function workingDays(from, count) {
  const out = [];
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  while (out.length < count) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd === 5 || wd === 6) continue;
    out.push({ weekday: DAY_NAMES[wd], day: d.getDate(), month: MONTHS[d.getMonth()], wd });
  }
  return out;
}

function timeAgo(ts) {
  const m = Math.round((now() - ts) / 60000);
  if (m < 1) return 'قبل لحظات';
  if (m === 1) return 'منذ دقيقة';
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h === 1) return 'منذ ساعة';
  if (h < 24) return `منذ ${h} ساعة`;
  const days = Math.round(h / 24);
  return days === 1 ? 'منذ يوم' : `منذ ${days} أيام`;
}

function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const money = (n) => n.toLocaleString('en-US') + ' ر.س';

/* ================= التخزين ================= */
function seed() {
  const t = now();
  const paid = [
    { id: 'AF-2081', name: 'أحمد', type: 'labor', slot: 'الأحد 10:00 ص', amount: FEE, createdAt: t - 50 * HOUR },
    { id: 'AF-2079', name: 'نورة', type: 'enforcement', slot: 'الاثنين 4:00 م', amount: FEE, createdAt: t - 74 * HOUR },
    { id: 'AF-2074', name: 'عبدالله', type: 'commercial', slot: 'الثلاثاء 11:30 ص', amount: FEE, createdAt: t - 110 * HOUR },
    { id: 'AF-2070', name: 'ريم', type: 'realestate', slot: 'الأربعاء 6:30 م', amount: FEE, createdAt: t - 140 * HOUR }
  ];
  const incomplete = [
    { id: 'IN-1', name: 'سعد', type: 'labor', stage: 'صفحة الدفع', lastActive: t - 2 * HOUR, status: 'open' },
    { id: 'IN-2', name: '', type: 'enforcement', stage: 'اختيار الموعد', lastActive: t - 5 * HOUR, status: 'open' },
    { id: 'IN-3', name: 'منى', type: 'family', stage: 'بيانات التواصل', lastActive: t - 20 * HOUR, status: 'open' },
    { id: 'IN-4', name: 'خالد', type: 'labor', stage: 'صفحة الدفع', lastActive: t - 28 * HOUR, status: 'open' },
    { id: 'IN-5', name: '', type: 'commercial', stage: 'أسئلة الفرز', lastActive: t - 45 * HOUR, status: 'open' },
    { id: 'IN-6', name: 'هيا', type: 'realestate', stage: 'اختيار الموعد', lastActive: t - 70 * HOUR, status: 'open' }
  ];
  return { stats: { opens: 31, started: 14 }, paid, incomplete };
}

let memoryStore = null; // احتياط لو localStorage غير متاح
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* تجاهل */ }
  if (memoryStore) return memoryStore;
  const s = seed();
  save(s);
  return s;
}
function save(s) {
  memoryStore = s;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* تجاهل */ }
}
function update(fn) { const s = load(); fn(s); save(s); return s; }

function sessionGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function sessionSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* تجاهل */ } }
function sessionDel(k) { try { sessionStorage.removeItem(k); } catch (e) { /* تجاهل */ } }

/* ================= حالة الرحلة ================= */
const form = $('intakeForm');
const steps = [...document.querySelectorAll('.step')];
let current = 1;
let selectedDay = '';
let holdUntil = 0;
let holdTimer = null;
let draftId = sessionGet('ofuq-draft');

function slotText() {
  return selectedDay && radio('time') ? `${selectedDay}، ${radio('time')}` : '';
}

/** يسجل/يحدث الطلب غير المكتمل للجلسة الحالية */
function trackDraft() {
  const type = radio('caseType');
  if (!type) return;
  update((s) => {
    let d = draftId && s.incomplete.find((x) => x.id === draftId);
    if (!d) {
      draftId = 'IN-' + now().toString(36);
      sessionSet('ofuq-draft', draftId);
      s.stats.started += 1;
      d = { id: draftId, status: 'open' };
      s.incomplete.unshift(d);
    }
    Object.assign(d, {
      name: $('name').value.trim(),
      type,
      stage: STEP_NAMES[Math.min(current, 5) - 1],
      lastActive: now()
    });
  });
}

/* ---------- الخطوة 1 و 2 ---------- */
function renderScreening() {
  const type = radio('caseType');
  const qs = SCREENING[type] || [];
  $('screening').innerHTML = qs.map((q) => `
    <fieldset class="q" aria-describedby="err-${q.id}">
      <legend>${q.label}</legend>
      <div class="chips">
        ${q.options.map((o) => `<label><input type="radio" name="q-${q.id}" value="${o}"><span>${o}</span></label>`).join('')}
      </div>
      <p class="error" id="err-${q.id}" role="alert"></p>
    </fieldset>`).join('');
}

/* ---------- الخطوة 3 ---------- */
function renderDays() {
  const box = $('days');
  box.innerHTML = '';
  workingDays(new Date(), 5).forEach((d) => {
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
      if (radio('time')) startHold();
      updateSummary();
    });
    box.appendChild(b);
  });
}

function startHold() {
  holdUntil = now() + HOLD_MINUTES * 60e3;
  $('holdNote').hidden = false;
  clearInterval(holdTimer);
  tickHold();
  holdTimer = setInterval(tickHold, 1000);
}
function tickHold() {
  const left = Math.max(0, holdUntil - now());
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  $('holdTimer').textContent = `${m}:${String(s).padStart(2, '0')}`;
  if (left === 0) {
    stopHold();
    document.querySelectorAll('input[name="time"]').forEach((x) => { x.checked = false; });
    setError('timeError', 'انتهت مدة حفظ الموعد. اختر الوقت مرة ثانية.');
    updateSummary();
  }
}
function stopHold() { clearInterval(holdTimer); holdTimer = null; $('holdNote').hidden = true; }

/* ---------- التحقق ---------- */
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
    const name = $('name').value.trim();
    const okName = name.length >= 2;
    const okPhone = !!normalizePhone($('phone').value);
    const okConsent = $('consent').checked;
    setError('nameError', okName ? '' : 'اكتب اسمك الأول (حرفين على الأقل).');
    setError('phoneError', okPhone ? '' : 'رقم الجوال غير صحيح. مثال: 0501234567');
    setError('consentError', okConsent ? '' : 'الموافقة مطلوبة لإكمال الحجز.');
    const firstBad = !okName ? $('name') : !okPhone ? $('phone') : !okConsent ? $('consent') : null;
    if (firstBad) firstBad.focus();
    return !firstBad;
  }
  return true;
}

/* ---------- العرض ---------- */
function render(focus = true) {
  steps.forEach((x) => x.classList.toggle('active', Number(x.dataset.step) === current));
  const inFlow = current <= 5;
  $('actions').hidden = current === 6;
  $('nextBtn').hidden = current === 5;
  $('backBtn').disabled = current === 1;
  $('nextBtn').textContent = current === 4 ? 'انتقل للدفع' : 'التالي';
  $('stepLabel').textContent = inFlow ? `الخطوة ${current} من 5` : 'اكتمل الطلب';
  $('stepName').textContent = inFlow ? STEP_NAMES[current - 1] : 'تم الدفع';
  $('progressBar').style.width = `${inFlow ? (current - 1) * 20 + 10 : 100}%`;
  if (current === 5) {
    $('payType').textContent = CASE_TYPES[radio('caseType')];
    $('paySlot').textContent = slotText();
  }
  updateSummary();
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
  const parts = [type, slot, type ? money(FEE) : ''].filter(Boolean);
  mini.hidden = !type || current === 6;
  mini.textContent = parts.join(' · ');
}

/* ---------- الدفع ---------- */
function pay() {
  const btn = $('payBtn');
  btn.disabled = true;
  btn.classList.add('loading');
  btn.textContent = 'جارٍ تنفيذ الدفع التجريبي…';
  $('live').textContent = 'جارٍ تنفيذ الدفع التجريبي';
  setTimeout(() => {
    const order = {
      id: 'AF-' + (3000 + Math.floor(Math.random() * 6999)),
      name: $('name').value.trim(),
      phone: normalizePhone($('phone').value),
      type: radio('caseType'),
      slot: slotText(),
      amount: FEE,
      createdAt: now()
    };
    update((s) => {
      s.paid.unshift(order);
      s.incomplete = s.incomplete.filter((x) => x.id !== draftId);
    });
    draftId = null;
    sessionDel('ofuq-draft');
    stopHold();
    $('orderId').textContent = order.id;
    $('confirmText').textContent = `موعدك ${order.slot}. سيتواصل معك المكتب على الرقم ${order.phone.replace('+966', '0')}.`;
    $('lawyerMsg').textContent =
      `طلب استشارة مدفوع ✅\n\nالاسم: ${order.name}\nنوع الاستشارة: ${CASE_TYPES[order.type]}\nالموعد: ${order.slot}\nحالة الدفع: مدفوع (${money(order.amount)})\nرقم الطلب: ${order.id}`;
    $('lawyerMsg').hidden = true;
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = 'الدفع التجريبي بمدى أو Apple Pay';
    current = 6;
    render();
  }, 1000);
}

function resetForm() {
  form.reset();
  current = 1;
  selectedDay = '';
  stopHold();
  $('charCount').textContent = '0';
  $('screening').innerHTML = '';
  document.querySelectorAll('.day').forEach((x) => x.setAttribute('aria-pressed', 'false'));
  document.querySelectorAll('.error').forEach((x) => { x.textContent = ''; x.classList.remove('show'); });
  document.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
  render();
}

/* ---------- أحداث العميل ---------- */
$('startBtn').addEventListener('click', () => {
  $('workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelector('input[name="caseType"]').focus({ preventScroll: true });
});
$('nextBtn').addEventListener('click', () => {
  if (!validate()) return;
  current += 1;
  trackDraft();
  render();
});
$('backBtn').addEventListener('click', () => { if (current > 1) { current -= 1; render(); } });
$('payBtn').addEventListener('click', pay);
$('restart').addEventListener('click', resetForm);
$('lawyerMsgBtn').addEventListener('click', () => { $('lawyerMsg').hidden = !$('lawyerMsg').hidden; });

form.addEventListener('change', (e) => {
  if (e.target.name === 'caseType') { renderScreening(); setError('typeError', ''); trackDraft(); }
  if (e.target.name === 'time') { setError('timeError', ''); startHold(); }
  if (e.target.name && e.target.name.startsWith('q-')) setError('err-' + e.target.name.slice(2), '');
  if (e.target.id === 'consent' && e.target.checked) setError('consentError', '');
  updateSummary();
});
form.addEventListener('input', (e) => {
  if (e.target.id === 'caseDetails') $('charCount').textContent = e.target.value.length;
});
form.addEventListener('submit', (e) => e.preventDefault());
window.addEventListener('pagehide', () => { if (current > 1 && current < 6) trackDraft(); });

/* ================= لوحة المكتب ================= */
const STATUS = {
  open: 'لم تتم المتابعة',
  followed: 'تمت المتابعة',
  not_interested: 'غير مهتم',
  paid_later: 'دفع لاحقًا'
};

function followupText(x) {
  const name = x.name || '';
  return `أهلًا ${name}، لاحظنا إنك بدأت حجز استشارة ${CASE_TYPES[x.type]} وما كملت تأكيد الموعد. إذا ما زلت تحتاج الاستشارة، تقدر تكمل من نفس الرابط. وإذا عندك مشكلة بالحجز علمني.`
    .replace('أهلًا ،', 'أهلًا،');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderOffice() {
  const s = load();
  const paidLater = s.incomplete.filter((x) => x.status === 'paid_later').length;
  const openInc = s.incomplete.filter((x) => x.status === 'open' || x.status === 'followed').length;
  const paidCount = s.paid.length + paidLater;
  const revenue = s.paid.reduce((a, x) => a + x.amount, 0) + paidLater * FEE;
  $('stOpens').textContent = s.stats.opens;
  $('stStarted').textContent = s.stats.started;
  $('stIncomplete').textContent = openInc;
  $('stPaid').textContent = paidCount;
  $('stRevenue').textContent = money(revenue);
  $('stRate').textContent = s.stats.started ? Math.round((paidCount / s.stats.started) * 100) + '%' : '0%';
  $('incCount').textContent = s.incomplete.length;
  $('paidCount').textContent = s.paid.length;

  $('incompleteList').innerHTML = s.incomplete.length ? s.incomplete.map((x) => `
    <article class="card inc status-${x.status}">
      <header><b>${esc(x.name || 'عميل غير مكتمل')}</b><span class="pill">${STATUS[x.status]}</span></header>
      <dl>
        <div><dt>النوع</dt><dd>${CASE_TYPES[x.type]}</dd></div>
        <div><dt>توقف عند</dt><dd>${esc(x.stage)}</dd></div>
        <div><dt>آخر نشاط</dt><dd>${timeAgo(x.lastActive)}</dd></div>
        <div><dt>قيمة محتملة</dt><dd>${money(FEE)}</dd></div>
      </dl>
      <button type="button" class="secondary small" data-preview="${x.id}">معاينة رسالة متابعة</button>
      <div class="status-row" role="group" aria-label="تغيير حالة ${esc(x.name || 'العميل')}">
        ${['followed', 'not_interested', 'paid_later'].map((st) => `<button type="button" class="chip-btn" data-id="${x.id}" data-status="${st}" aria-pressed="${x.status === st}">${STATUS[st]}</button>`).join('')}
      </div>
    </article>`).join('') : '<p class="empty">لا توجد طلبات غير مكتملة.</p>';

  $('paidList').innerHTML = s.paid.length ? s.paid.map((x) => `
    <article class="card paid">
      <header><b>${esc(x.name)}</b><span class="pill ok">مدفوع</span></header>
      <dl>
        <div><dt>النوع</dt><dd>${CASE_TYPES[x.type]}</dd></div>
        <div><dt>الموعد</dt><dd>${esc(x.slot)}</dd></div>
        <div><dt>المبلغ</dt><dd>${money(x.amount)}</dd></div>
        <div><dt>تاريخ الطلب</dt><dd>${fmtDate(x.createdAt)}</dd></div>
      </dl>
    </article>`).join('') : '<p class="empty">لا توجد طلبات مدفوعة بعد.</p>';
}

$('officeView').addEventListener('click', (e) => {
  const prev = e.target.closest('[data-preview]');
  if (prev) {
    const x = load().incomplete.find((i) => i.id === prev.dataset.preview);
    if (x) { $('msgText').textContent = followupText(x); openDialog('msgDialog'); }
    return;
  }
  const st = e.target.closest('[data-status]');
  if (st) {
    update((s) => {
      const x = s.incomplete.find((i) => i.id === st.dataset.id);
      if (x) { x.status = x.status === st.dataset.status ? 'open' : st.dataset.status; }
    });
    renderOffice();
    const again = document.querySelector(`[data-id="${st.dataset.id}"][data-status="${st.dataset.status}"]`);
    if (again) again.focus();
    $('live').textContent = 'تم تحديث الحالة';
  }
});

$('resetBtn').addEventListener('click', () => openDialog('resetDialog'));
$('confirmReset').addEventListener('click', () => {
  try { localStorage.removeItem(STORE_KEY); } catch (e) { /* تجاهل */ }
  memoryStore = null;
  sessionDel('ofuq-draft');
  sessionDel('ofuq-opened');
  draftId = null;
  save(seed());
  closeDialog($('resetDialog'));
  renderOffice();
  $('live').textContent = 'تمت إعادة ضبط البيانات التجريبية';
});

/* ================= النوافذ ================= */
let lastFocus = null;
function openDialog(id) {
  lastFocus = document.activeElement;
  const d = $(id);
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
}
function closeDialog(d) {
  if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
  if (lastFocus) lastFocus.focus();
}
document.addEventListener('click', (e) => {
  const opener = e.target.closest('[data-open]');
  if (opener) { e.preventDefault(); openDialog(opener.dataset.open); return; }
  const closer = e.target.closest('[data-close]');
  if (closer) closeDialog(closer.closest('dialog'));
});
document.querySelectorAll('dialog').forEach((d) => {
  d.addEventListener('click', (e) => { if (e.target === d) closeDialog(d); });
});

/* ================= التوجيه ================= */
const VIEWS = {
  demo: { el: 'demoView', title: 'مؤكّد | من استفسار واتساب إلى موعد مدفوع',
    nav: [['#client', 'واجهة العميل'], ['#office', 'لوحة المكتب']] },
  client: { el: 'clientView', title: 'مكتب أُفق للمحاماة | حجز استشارة', nav: [] },
  office: { el: 'officeView', title: 'لوحة المكتب | مؤكد',
    nav: [['#demo', 'عرض المنتج'], ['#client', 'واجهة العميل']] }
};

function currentView() {
  const key = location.hash.replace('#', '');
  return VIEWS[key] ? key : null;
}

function renderDemoStats() {
  const s = load();
  const paidLater = s.incomplete.filter((x) => x.status === 'paid_later').length;
  const paidCount = s.paid.length + paidLater;
  $('dmOpens').textContent = s.stats.opens;
  $('dmStarted').textContent = s.stats.started;
  $('dmPaid').textContent = paidCount;
  $('dmRevenue').textContent = money(s.paid.reduce((a, x) => a + x.amount, 0) + paidLater * FEE);
}

let lastView = null;
function route() {
  let view = currentView();
  if (!view) {
    // الرابط الأساسي بدون hash ← وضع العرض (بدون إضافة خطوة جديدة في السجل)
    history.replaceState(null, '', '#demo');
    view = 'demo';
  }
  Object.entries(VIEWS).forEach(([k, v]) => { $(v.el).hidden = k !== view; });
  const nav = $('topNav');
  nav.innerHTML = '';
  VIEWS[view].nav.forEach(([href, label]) => {
    const a = document.createElement('a');
    a.className = 'nav-link';
    a.href = href;
    a.textContent = label;
    nav.appendChild(a);
  });
  nav.hidden = !VIEWS[view].nav.length;
  $('brandLink').setAttribute('href', view === 'client' ? '#client' : '#demo');
  $('brandLink').setAttribute('aria-label', view === 'client' ? 'مكتب أفق للمحاماة — واجهة العميل' : 'مؤكّد — عرض المنتج');
  $('brandMark').textContent = view === 'client' ? 'أ' : 'م';
  $('brandName').textContent = view === 'client' ? 'أُفق' : 'مؤكّد';
  $('brandTagline').textContent = view === 'client' ? 'للمحاماة والاستشارات القانونية' : 'من استفسار واتساب إلى موعد مدفوع';
  document.body.dataset.view = view;
  document.title = VIEWS[view].title;
  if (view === 'office') renderOffice();
  if (view === 'demo') renderDemoStats();
  if (view === 'client' && !sessionGet('ofuq-opened')) {
    sessionSet('ofuq-opened', '1');
    update((s) => { s.stats.opens += 1; });
  }
  if (lastView && lastView !== view) window.scrollTo(0, 0);
  lastView = view;
}
window.addEventListener('hashchange', route);

/* تشغيل */
renderDays();
render(false);
route();

// للاختبار فقط
window.__demo = { normalizePhone, workingDays };
