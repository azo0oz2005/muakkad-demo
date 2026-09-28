'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhone, cleanText, validSlug } = require('../src/utils');

test('normalizes supported Saudi phone formats', () => {
  assert.equal(normalizePhone('0501234567'), '+966501234567');
  assert.equal(normalizePhone('501234567'), '+966501234567');
  assert.equal(normalizePhone('+966501234567'), '+966501234567');
  assert.equal(normalizePhone('٠٥٠١٢٣٤٥٦٧'), '+966501234567');
});

test('rejects invalid phone and slug values', () => {
  assert.equal(normalizePhone('123'), '');
  assert.equal(validSlug('hamad-office'), true);
  assert.equal(validSlug('../admin'), false);
});

test('trims sensitive text safely', () => {
  assert.equal(cleanText(' <hello> ', 20), 'hello');
  assert.equal(cleanText('abcdef', 3), 'abc');
});
