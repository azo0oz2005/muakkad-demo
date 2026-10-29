'use strict';
// Preview only: no request submission or payment is enabled.
(() => {
  document.addEventListener('change', (event) => {
    if (event.target.name !== 'caseType') return;
    OFFICE.price = event.target.value === 'labor' ? 150 : 200;
    document.querySelectorAll('[data-price]').forEach((node) => { node.textContent = OFFICE.price; });
    updateSummary();
  }, true);
  const services = document.getElementById('servicePreview');
  const consultation = document.getElementById('workspace');
  const title = document.getElementById('formTitle');
  function chooseService(selected) {
    services.hidden = !selected;
    consultation.hidden = selected;
    title.hidden = selected;
    document.getElementById('serviceTab').setAttribute('aria-pressed', String(selected));
    document.getElementById('consultationTab').setAttribute('aria-pressed', String(!selected));
  }
  document.getElementById('serviceTab').addEventListener('click', () => chooseService(true));
  document.getElementById('consultationTab').addEventListener('click', () => chooseService(false));
  document.getElementById('startBtn').addEventListener('click', () => chooseService(false));
  document.getElementById('serviceChoice').addEventListener('change', (event) => {
    document.getElementById('servicePrice').textContent = event.target.value === 'إفراغ أرض'
      ? '٥٠٠ ريال شامل الضريبة.' : 'تُحدد الأتعاب بعد مراجعة الطلب حسب الخدمة المطلوبة.';
  });
})();
