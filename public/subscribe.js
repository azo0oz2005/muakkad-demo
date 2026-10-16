'use strict';

const form = document.getElementById('subscribeForm');
const message = document.getElementById('formMessage');
const paymentStep = document.getElementById('paymentStep');
const resultStep = document.getElementById('resultStep');
const continueButton = document.getElementById('continueButton');
let csrfToken = '';
let gatewayConfig = null;

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'تعذر إكمال الطلب. حاول مرة ثانية.');
  return body;
}

function showResult(text) {
  form.hidden = true;
  paymentStep.hidden = true;
  resultStep.hidden = false;
  resultStep.textContent = text;
  resultStep.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function initialize() {
  try {
    const [csrf, config] = await Promise.all([
      jsonRequest('/api/csrf'), jsonRequest('/api/subscriptions/config')
    ]);
    csrfToken = csrf.token;
    gatewayConfig = config;
    const callback = new URLSearchParams(location.search);
    if (callback.has('order') && callback.has('id')) {
      showResult('جاري التأكد من الدفع...');
      try {
        const result = await jsonRequest('/api/subscriptions/verify', {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ orderId: callback.get('order'), paymentId: callback.get('id') })
        });
        showResult(result.status === 'paid'
          ? 'تم الدفع وتسجيل طلب اشتراكك. بنتواصل معك لتجهيز رابط مكتبك وبيانات الدخول.'
          : result.status === 'test_paid'
            ? 'نجحت عملية الاختبار في ميسر. هذا دفع تجريبي، وما فعّل اشتراكًا حقيقيًا.'
            : 'تعذر تأكيد هذا الدفع. تواصل معنا ومعك رقم العملية من ميسر.');
      } catch (error) { showResult(error.message); }
      return;
    }
    if (config.test) {
      document.querySelectorAll('[data-test-amount]').forEach((el) => { el.textContent = '200'; });
      document.querySelectorAll('[data-due-label]').forEach((el) => { el.textContent = 'مبلغ تجربة الدفع في ميسر'; });
      document.querySelector('.price-note').textContent = 'سعر الاشتراك الحقيقي ٩٩ ريال شهريًا. الدفع الحقيقي يبدأ بعد تفعيل ميسر.';
      document.querySelector('.renewal').textContent = 'الدفع التجريبي ما يفعّل اشتراكًا ولا يخصم مبلغًا حقيقيًا.';
      message.textContent = 'وضع اختبار ميسر: مبلغ تجربة الدفع ٢٠٠ ريال تجريبي. سعر الاشتراك ٩٩ ريال شهريًا.';
    }
    if (!config.available) {
      continueButton.disabled = true;
      message.textContent = 'الدفع غير متاح الآن. ننتظر تفعيل ميسر وتسجيل نطاق Apple Pay.';
    }
  } catch {
    continueButton.disabled = true;
    message.textContent = 'الدفع غير متاح الآن. ننتظر تفعيل ميسر وربط الموقع.';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  if (!form.reportValidity() || !gatewayConfig?.available) return;
  continueButton.disabled = true;
  continueButton.textContent = 'جاري تجهيز الدفع...';
  try {
    const fields = Object.fromEntries(new FormData(form));
    const order = await jsonRequest('/api/subscriptions/orders', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify(fields)
    });
    if (!window.Moyasar) throw new Error('تعذر تحميل Apple Pay. حدّث الصفحة وحاول مرة ثانية.');
    form.hidden = true;
    paymentStep.hidden = false;
    document.getElementById('paymentIntro').textContent = order.test
      ? 'اختبار Apple Pay بمبلغ ٢٠٠ ريال تجريبي. ما فيه خصم حقيقي.'
      : 'ادفع ٩٩ ريال للشهر الأول عبر Apple Pay. التجديد يدوي.';
    window.Moyasar.init({
      element: '#moyasarForm', language: 'ar', fixed_width: false,
      amount: order.amountHalalas, currency: 'SAR',
      description: `Muakkad subscription ${order.orderId}`,
      metadata: { subscription_order_id: order.orderId },
      publishable_api_key: order.publishableKey,
      callback_url: `${location.origin}/subscribe?order=${encodeURIComponent(order.orderId)}`,
      supported_networks: ['mada', 'visa', 'mastercard'],
      methods: ['applepay'],
      apple_pay: { country: 'SA', label: 'مؤكد', validate_merchant_url: 'https://api.moyasar.com/v1/applepay/initiate' },
      on_completed: async (payment) => {
        if (!payment?.id) return;
        try {
          await jsonRequest('/api/subscriptions/verify', {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
            body: JSON.stringify({ orderId: order.orderId, paymentId: payment.id })
          });
        } catch { /* Redirect callback retries verification and shows result. */ }
      }
    });
    paymentStep.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    form.hidden = false;
    paymentStep.hidden = true;
    message.textContent = error.message;
  } finally {
    continueButton.disabled = false;
    continueButton.textContent = 'متابعة إلى الدفع';
  }
});

initialize();
