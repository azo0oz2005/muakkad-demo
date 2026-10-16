'use strict';

const AMOUNT_HALALAS = 9900;

function paymentMatchesOrder(payment, order) {
  return payment?.status === 'paid' && payment.amount === order.amount_halalas &&
    payment.currency === 'SAR' && payment.metadata?.subscription_order_id === order.id &&
    payment.source?.type === 'applepay' && typeof payment.id === 'string';
}

async function fetchMoyasarPayment(paymentId, secretKey) {
  const response = await fetch(`https://api.moyasar.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}` },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Moyasar payment lookup failed: ${response.status}`);
  return response.json();
}

module.exports = { AMOUNT_HALALAS, paymentMatchesOrder, fetchMoyasarPayment };
