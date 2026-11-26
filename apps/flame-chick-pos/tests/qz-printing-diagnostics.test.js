'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const test = require('node:test');
const { extractFirstCertificatePem, verifyQzSignature } = require('../api/qz/certificate-utils');
const qzSigner = require('../api/qz/sign');

const source = fs.readFileSync(path.join(__dirname, '..', 'qz-printing.js'), 'utf8');

function loadQzHelpers() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'qz-printing.js' });
  return sandbox.window.FlameChickQZ.diagnostics;
}

test('synthetic QZ test payload contains the expected ESC/POS initialization and no customer data', function () {
  const helpers = loadQzHelpers();
  const payload = helpers.buildTestPayload();
  assert.ok(payload.startsWith('\x1B\x40'));
  assert.ok(payload.includes('\x1B\x74\x00'));
  assert.ok(payload.includes('QZ TRAY TEST PRINT'));
  assert.ok(payload.includes('POS direct thermal print connection OK'));
  assert.equal(/[^\x00-\x7F]/.test(payload), false);
  assert.equal(payload.slice(-4), '\x1D\x56\x42\x00');
  assert.match(payload.slice(0, -4), /\n{4,}$/);
});

test('synthetic QZ test payload includes a partial paper cut after the feed lines', function () {
  const helpers = loadQzHelpers();
  const payload = helpers.buildTestPayload();
  assert.equal(payload.slice(-4), '\x1D\x56\x42\x00');
  assert.match(payload.slice(0, -4), /\n{4,}$/);
});

test('CP437 byte output exactly matches the ASCII bytes passed in the synthetic QZ payload', function () {
  const helpers = loadQzHelpers();
  const payload = helpers.buildTestPayload();
  const bytes = helpers.encodeCp437Ascii(payload);
  assert.equal(bytes.length, payload.length);
  assert.deepEqual(Array.from(bytes), Array.from(payload, function (character) {
    return character.charCodeAt(0);
  }));
});

test('human-readable ESC/POS output visibly labels control bytes and line feeds', function () {
  const helpers = loadQzHelpers();
  const readable = helpers.formatEscPosPayload('\x1B@\x1D\x0A\rA');
  assert.equal(readable, '<ESC>@<GS><LF>\n<CR>A');
});

test('CP437 diagnostic byte encoding fails closed for characters outside the verified ASCII subset', function () {
  const helpers = loadQzHelpers();
  assert.throws(function () {
    helpers.encodeCp437Ascii('Flame Chick £');
  }, /non-ASCII character/);
});

test('first public signing certificate is extracted correctly from the leaf-only PEM file', function () {
  const bundlePath = path.join(__dirname, '..', 'qz', 'digital-certificate.txt');
  const bundle = fs.readFileSync(bundlePath, 'utf8');
  const firstPem = extractFirstCertificatePem(bundle);
  assert.ok(firstPem);
  assert.ok(firstPem.startsWith('-----BEGIN CERTIFICATE-----'));
  assert.ok(firstPem.endsWith('-----END CERTIFICATE-----'));
  assert.equal((firstPem.match(/-----BEGIN CERTIFICATE-----/g) || []).length, 1);

  const certificate = new crypto.X509Certificate(firstPem);
  assert.match(certificate.subject, /Flame Chick POS QZ Signing Certificate/);
});

test('RSA-SHA512 verification rejects a signature made by a different key', function () {
  const bundle = fs.readFileSync(path.join(__dirname, '..', 'qz', 'digital-certificate.txt'), 'utf8');
  const firstPem = extractFirstCertificatePem(bundle);
  const otherKeyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const request = 'synthetic QZ signing verification test';
  const signature = crypto.sign('RSA-SHA512', Buffer.from(request, 'utf8'), otherKeyPair.privateKey);
  assert.equal(verifyQzSignature(request, signature, firstPem), false);
});


test('public QZ certificate file contains only the signing leaf and leaves root CA trust external', function () {
  const bundlePath = path.join(__dirname, '..', 'qz', 'digital-certificate.txt');
  const bundle = fs.readFileSync(bundlePath, 'utf8');
  const certificateBlocks = bundle.match(/-----BEGIN CERTIFICATE-----[\\s\\S]*?-----END CERTIFICATE-----/g) || [];

  assert.equal(certificateBlocks.length, 1, 'public POS certificate file must contain only the leaf certificate');

  const leaf = new crypto.X509Certificate(certificateBlocks[0]);
  assert.match(leaf.subject, /Flame Chick POS QZ Signing Certificate/);
  assert.match(leaf.issuer, /Flame Chick QZ Signing Root CA/);
});

test('QZ signer origin policy accepts only HTTPS Preview hosts for the new POS project and team', function () {
  assert.equal(qzSigner.isAllowedOrigin('https://flame-chick-pos-development-git-work-production-source-audit-faha-d.vercel.app'), true);
  assert.equal(qzSigner.isAllowedOrigin('https://flame-chick-pos-development-a1b2c3d4-faha-d.vercel.app'), true);
  assert.equal(qzSigner.isAllowedOrigin('https://flamechicpos.vercel.app'), true);

  assert.equal(qzSigner.isAllowedOrigin('http://flame-chick-pos-development-git-work-production-source-audit-faha-d.vercel.app'), false);
  assert.equal(qzSigner.isAllowedOrigin('https://flame-chick-pos-development-git-work-production-source-audit-other-team.vercel.app'), false);
  assert.equal(qzSigner.isAllowedOrigin('https://flame-chick-pos-development-git-work-production-source-audit-faha-d.vercel.app:8443'), false);
  assert.equal(qzSigner.isAllowedOrigin('https://flame-chick-pos-development.vercel.app'), false);
});


test('restaurant receipt payload contains branding, invoice, dine-in details, line prices and paid total', function () {
  const helpers = loadQzHelpers();
  const payload = helpers.buildReceiptPayload({
    serverOrderNumber: 'FC-TEST-001',
    createdAt: '2026-11-25T15:20:00.000Z',
    fulfillmentType: 'Dine-in',
    cashierName: 'Hanzala',
    guestsServed: 1,
    tableNumber: 'G3',
    paymentMethod: 'Easypaisa',
    paymentStatus: 'Paid',
    paidAmount: 4348,
    subtotal: 3998,
    surcharge: 350,
    total: 4348,
    items: [
      { itemName: 'Half Broast', quantity: 1, price: 1599, lineTotal: 1599 },
      { itemName: 'Full Broast', quantity: 1, price: 2399, lineTotal: 2399 }
    ]
  });
  const readable = helpers.formatEscPosPayload(payload);
  assert.equal(payload.slice(-4), '\x1D\x56\x42\x00');
  [
    'FLAME CHICK', 'ORIGINAL BILL', 'Invoice #FC-TEST-001', 'DINE-IN',
    'Cashier', 'Hanzala', 'Guests Served', 'Table', 'G3', 'Half Broast', 'Full Broast',
    'Price', 'Surcharge', 'Grand Total', 'Easypaisa', 'PAID'
  ].forEach(function (value) {
    assert.ok(readable.includes(value), 'receipt should contain ' + value);
  });
  assert.match(readable, /Half Broast @1,599\s+Rs 1,599/);
  assert.match(readable, /Full Broast @2,399\s+Rs 2,399/);
});

test('receipt payload omits cashier, guest and surcharge details when not supplied', function () {
  const helpers = loadQzHelpers();
  const readable = helpers.formatEscPosPayload(helpers.buildReceiptPayload({
    serverOrderNumber: 'FC-TEST-002',
    fulfillmentType: 'Delivery',
    paymentMethod: 'COD',
    paymentStatus: 'Unpaid',
    subtotal: 899,
    deliveryFee: 100,
    total: 999,
    items: [{ itemName: 'Quarter Broast', quantity: 1, price: 899, lineTotal: 899 }]
  }));
  ['Invoice #FC-TEST-002', 'DELIVERY', 'Delivery', 'Quarter Broast', 'Balance Due', 'UNPAID'].forEach(function (value) {
    assert.ok(readable.includes(value), 'receipt should contain ' + value);
  });
  ['Cashier', 'Guests Served', 'Surcharge'].forEach(function (value) {
    assert.equal(readable.includes(value), false, 'receipt should omit unavailable ' + value);
  });
});
