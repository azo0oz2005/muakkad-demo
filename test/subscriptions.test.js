'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { paymentMatchesOrder, AMOUNT_HALALAS } = require('../src/subscriptions');

const order = { id: '2eab2543-e24c-42df-8e2c-d99e118aacd4', amount_halalas: AMOUNT_HALALAS };
const payment = { id: '993ef908-baf9-4f51-a332-32948496fd7e', status: 'paid', amount: AMOUNT_HALALAS,
  currency: 'SAR', metadata: { subscription_order_id: order.id }, source: { type: 'applepay' } };

test('accepts paid Apple Pay only for matching subscription order', () => {
  assert.equal(paymentMatchesOrder(payment, order), true);
  assert.equal(paymentMatchesOrder({ ...payment, status: 'failed' }, order), false);
  assert.equal(paymentMatchesOrder({ ...payment, amount: 20000 }, order), false);
  assert.equal(paymentMatchesOrder({ ...payment, currency: 'USD' }, order), false);
  assert.equal(paymentMatchesOrder({ ...payment, metadata: { subscription_order_id: 'other' } }, order), false);
  assert.equal(paymentMatchesOrder({ ...payment, source: { type: 'creditcard' } }, order), false);
});
