'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('receipt HTML no longer contains the stray History modal text node', function () {
  assert.equal(source.includes('remove old History modal'), false);
});

test('preview and both browser print paths share the same receipt renderer', function () {
  assert.match(source, /function buildReceiptHtml\(order\)/);
  assert.match(source, /\$\('printPreviewBody'\)\.innerHTML=buildReceiptHtml\(o\)/);
  const onlineStart = source.indexOf('async function printReceiptWithLabel(o,label)');
  const localStart = source.indexOf('async function printThermalReceipt(order)');
  const onlineEnd = source.indexOf('function openDB()', onlineStart);
  const localEnd = source.indexOf('async function openLocalOrderDetails', localStart);
  assert.ok(source.slice(onlineStart, onlineEnd).includes('buildReceiptHtml(o)'));
  assert.ok(source.slice(localStart, localEnd).includes('buildReceiptHtml(receiptOrder)'));
});

test('receipt uses the legible business address and verified phone without guessing unclear print', function () {
  assert.match(source, /Flame Chick, Main Kamra Road Opposite to Zellbury, Attock/);
  assert.match(source, /Phone: \+923358044164/);
  assert.match(source, /\*\*\* Original Bill \*\*\*/);
  assert.match(source, /Grand Total/);
  assert.doesNotMatch(source, /P-NTN|hanzlaawanx@gmail\.com|eposmatic\.com/i);
});

test('browser print isolates the receipt at the existing 80 mm page setting', function () {
  assert.match(source, /@page\{size:80mm auto;margin:0\}/);
  assert.match(source, /body,body \*\{visibility:hidden!important\}/);
  assert.match(source, /#printArea,#printArea \*\{visibility:visible!important\}/);
  assert.match(source, /#printArea\{display:block!important;position:static!important;width:72mm!important/);
});
