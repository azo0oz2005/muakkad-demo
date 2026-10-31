'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const number = value => new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(value);
  const money = value => `${number(value)} ر.س`;
  const presets = {
    contract: { title: 'مراجعة عقد تجاري', hours: 5, rate: 250, expenses: 250, quote: 2500, included: 'مراجعة عقد واحد حتى ٢٠ صفحة، ملاحظات مكتوبة، وجلسة شرح لمدة ٣٠ دقيقة.', excluded: 'صياغة عقد جديد، التفاوض مع الطرف الآخر، أو التمثيل القضائي.', delivery: '٥ أيام عمل بعد اكتمال المتطلبات' },
    consult: { title: 'استشارة متخصصة', hours: 1.5, rate: 200, expenses: 0, quote: 500, included: 'تحضير للاستشارة وجلسة واحدة لمدة ٤٥ دقيقة، يقدمها المحامي.', excluded: 'صياغة مستندات، المرافعة، أو المتابعة بعد الجلسة.', delivery: 'في الموعد المتفق عليه' },
    retainer: { title: 'باقة استشارات منشآت شهرية', hours: 10, rate: 250, expenses: 200, quote: 4500, included: 'حتى ١٠ ساعات استشارات في الشهر، وملخص استخدام شهري معتمد من المكتب.', excluded: 'التقاضي، الرسوم الحكومية، والساعات فوق الرصيد المتفق عليه.', delivery: 'خلال شهر الخدمة وفق المواعيد المتفق عليها' }
  };
  let latest = null;
  const numericIds = ['hours', 'rate', 'expenses', 'margin', 'quote'];
  function calculate() {
    if (!numericIds.every(id => $(id).value !== '' && $(id).checkValidity())) {
      latest = null;
      ['suggested', 'cost', 'profit', 'total', 'offer-fee', 'offer-total', 'offer-deposit', 'offer-vat'].forEach(id => $(id).textContent = '—');
      $('price-note').textContent = 'أكمل المدخلات بأرقام ضمن الحدود الموضحة.';
      $('use-price').disabled = true;
      return;
    }
    $('use-price').disabled = false;
    const cost = Number($('hours').value) * Number($('rate').value) + Number($('expenses').value);
    const suggested = Math.ceil(cost / (1 - Number($('margin').value) / 100) * 100) / 100;
    const quote = Number($('quote').value);
    const profit = quote - cost;
    const vat = quote * Number($('vat').value) / 100;
    latest = { cost, suggested, quote, profit, vat, total: quote + vat };
    $('suggested').textContent = money(suggested);
    $('cost').textContent = money(cost);
    $('profit').textContent = `${money(profit)} · ${number(profit / quote * 100)}٪`;
    $('total').textContent = money(latest.total);
    $('price-note').textContent = profit < 0 ? 'عرضك أقل من التكلفة المقدرة. راجع النطاق والسعر قبل الاعتماد.' : quote < suggested ? 'عرضك أقل من الهامش المستهدف. يمكنك تعديل الأتعاب أو نطاق العمل.' : 'عرضك يحقق الهامش المستهدف وفق تقديراتك. القرار النهائي لك.';
    updateOffer();
  }
  function updateOffer() {
    $('offer-title').textContent = presets[$('service').value].title;
    ['included', 'excluded', 'delivery'].forEach(id => $('offer-' + id).textContent = $(id).value.trim() || 'يحدده المكتب قبل اعتماد العرض');
    if (!latest) return;
    $('offer-fee').textContent = money(latest.quote);
    $('offer-vat').textContent = money(latest.vat);
    $('offer-total').textContent = money(latest.total);
    $('offer-deposit').textContent = $('deposit').value !== '' && $('deposit').checkValidity() ? money(latest.total * Number($('deposit').value) / 100) : 'أدخل نسبة من ٠ إلى ١٠٠';
  }
  function activate(name, focus = false) {
    document.querySelectorAll('[data-tab]').forEach(button => {
      const active = button.dataset.tab === name;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      $('panel-' + button.dataset.tab).hidden = !active;
      if (active && focus) button.focus();
    });
  }
  const tabs = [...document.querySelectorAll('[data-tab]')];
  tabs.forEach((button, index) => {
    button.addEventListener('click', () => activate(button.dataset.tab));
    button.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); activate(tabs[next].dataset.tab, true); }
    });
  });
  document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => activate(button.dataset.go, true)));
  $('pricing-form').addEventListener('submit', event => event.preventDefault());
  [...numericIds, 'vat'].forEach(id => $(id).addEventListener('input', calculate));
  $('service').addEventListener('change', () => {
    const preset = presets[$('service').value];
    ['hours', 'rate', 'expenses', 'quote', 'included', 'excluded', 'delivery'].forEach(id => $(id).value = preset[id]);
    $('margin').value = 40;
    calculate();
  });
  ['included', 'excluded', 'delivery', 'deposit'].forEach(id => $(id).addEventListener('input', updateOffer));
  $('use-price').addEventListener('click', () => { if (latest) { $('quote').value = latest.suggested; calculate(); } });
  async function copy(text, statusId) {
    try { await navigator.clipboard.writeText(text); $(statusId).textContent = 'تم النسخ. راجعه قبل الإرسال.'; }
    catch { $(statusId).textContent = 'تعذّر النسخ. حدّد النص وانسخه يدويًا.'; }
  }
  $('copy-offer').addEventListener('click', () => {
    if (!latest || !$('deposit').checkValidity() || $('deposit').value === '') { $('copy-status').textContent = 'راجع أرقام التسعير ونسبة الدفعة قبل نسخ العرض.'; return; }
    copy($('printable').innerText, 'copy-status');
  });
  $('print').addEventListener('click', () => {
    if (!latest || !$('deposit').checkValidity() || $('deposit').value === '') { $('copy-status').textContent = 'راجع أرقام التسعير ونسبة الدفعة قبل طباعة العرض.'; return; }
    window.print();
  });
  $('copy-follow').addEventListener('click', () => copy($('follow-message').textContent, 'follow-status'));
  const initial = [
    { ref: 'فرصة ٠٠١', service: 'مراجعة عقد', amount: 2500, status: 'follow' },
    { ref: 'فرصة ٠٠٢', service: 'استشارة منشأة', amount: 1500, status: 'offer' },
    { ref: 'فرصة ٠٠٣', service: 'باقة شهرية', amount: 4500, status: 'paid' }
  ];
  let opportunities = initial.map(item => ({ ...item }));
  const statuses = { offer: 'أُرسل العرض', follow: 'تحتاج متابعة', agreed: 'اتفاق مبدئي', paid: 'سداد كامل تجريبي', lost: 'لم يتم الاتفاق' };
  function metrics() {
    $('open-value').textContent = money(opportunities.filter(item => !['paid', 'lost'].includes(item.status)).reduce((sum, item) => sum + item.amount, 0));
    $('collected').textContent = money(opportunities.filter(item => item.status === 'paid').reduce((sum, item) => sum + item.amount, 0));
    $('follow-count').textContent = number(opportunities.filter(item => item.status === 'follow').length);
  }
  function renderOpportunities() {
    $('opportunities').replaceChildren();
    opportunities.forEach(item => {
      const row = document.createElement('div'); row.className = 'opportunity';
      const identity = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = item.ref;
      const subtitle = document.createElement('small'); subtitle.textContent = item.service;
      identity.append(title, subtitle);
      const amount = document.createElement('span'); amount.textContent = money(item.amount);
      const select = document.createElement('select'); select.setAttribute('aria-label', `حالة ${item.ref}`);
      Object.entries(statuses).forEach(([value, text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); });
      select.value = item.status;
      select.addEventListener('change', () => { item.status = select.value; metrics(); });
      row.append(identity, amount, select); $('opportunities').append(row);
    });
    metrics();
  }
  $('reset').addEventListener('click', () => { opportunities = initial.map(item => ({ ...item })); renderOpportunities(); });
  function extra() {
    if (!['extra-hours', 'extra-rate'].every(id => $(id).value !== '' && $(id).checkValidity())) { $('extra-result').textContent = 'أكمل الساعات والسعر بأرقام صحيحة.'; return null; }
    const remaining = 2;
    const excess = Math.max(0, Number($('extra-hours').value) - remaining);
    const cost = excess * Number($('extra-rate').value);
    $('extra-result').textContent = excess ? `المتبقي ساعتان. عدد الساعات خارج الرصيد: ${number(excess)}، بقيمة ${money(cost)} قبل الضريبة، بعد موافقة العميل.` : 'الطلب داخل الرصيد المتبقي في المثال. لا توجد إضافة مالية.';
    return { excess, cost };
  }
  ['extra-hours', 'extra-rate'].forEach(id => $(id).addEventListener('input', extra));
  $('copy-extra').addEventListener('click', () => {
    const result = extra();
    if (!result || !result.excess) { $('extra-status').textContent = result ? 'لا توجد ساعات إضافية تحتاج عرضًا.' : 'راجع مدخلات الساعات والسعر.'; return; }
    copy(`مسودة عرض إضافة للمراجعة: عدد الساعات المتجاوزة لرصيد الباقة: ${number(result.excess)}. المقابل المقترح ${money(result.cost)} قبل أي ضريبة منطبقة. نوضح تفاصيل النطاق والموعد ونعتمدها معكم قبل بدء العمل الإضافي. السداد لحساب المكتب مباشرة.`, 'extra-status');
  });
  function economics() {
    if (!['job-margin', 'subscription', 'setup-fee'].every(id => $(id).value !== '' && $(id).checkValidity())) {
      $('break-even').textContent = 'أدخل هامشًا واشتراكًا أكبر من صفر، ورسوم إعداد صفرًا أو أكثر.';
      $('first-month-break-even').textContent = '';
      return;
    }
    const margin = Number($('job-margin').value);
    const subscription = Number($('subscription').value);
    const firstMonth = subscription + Number($('setup-fee').value);
    $('break-even').textContent = `التجديد الشهري (${money(subscription)}): ${number(Math.ceil(subscription / margin))} من الأعمال الإضافية لتغطية التكلفة.`;
    $('first-month-break-even').textContent = `الشهر الأول (${money(firstMonth)}): ${number(Math.ceil(firstMonth / margin))} من الأعمال الإضافية لتغطية التكلفة.`;
  }
  ['job-margin', 'subscription', 'setup-fee'].forEach(id => $(id).addEventListener('input', economics));
  calculate(); renderOpportunities(); extra(); economics();
})();
