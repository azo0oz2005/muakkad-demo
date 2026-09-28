'use strict';

const crypto = require('crypto');

function toLatinDigits(value) {
  return String(value || '')
    .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660)
    .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06f0);
}

function normalizePhone(raw) {
  let digits = toLatinDigits(raw).replace(/\D/g, '');
  if (digits.startsWith('00966')) digits = digits.slice(5);
  else if (digits.startsWith('966')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return /^5\d{8}$/.test(digits) ? `+966${digits}` : '';
}

function shortRef() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function cleanText(value, max) {
  return String(value || '').trim().replace(/[<>]/g, '').slice(0, max);
}

function validSlug(value) {
  return /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(String(value || ''));
}

module.exports = { toLatinDigits, normalizePhone, shortRef, cleanText, validSlug };
