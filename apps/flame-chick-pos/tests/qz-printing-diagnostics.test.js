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
  const certificateBlocks = bundle.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];

  assert.equal(certificateBlocks.length, 1, 'public POS certificate file must contain only the leaf certificate');

  const leaf = new crypto.X509Certificate(certificateBlocks[0]);
  assert.match(leaf.subject, /Flame Chick POS QZ Signing Certificate/);
  assert.match(leaf.issuer, /Flame Chick QZ Signing Root CA/);
});

test('QZ signer origin policy accepts the intended production hostname and only approved HTTPS Preview hosts', function () {
  assert.equal(qzSigner.isAllowedOrigin('https://flamechick-pos.vercel.app'), true);
  assert.equal(qzSigner.isAllowedOrigin('https://flame-chick-pos-development-git-work-production-source-audit-faha-d.vercel.app'), true);
  assert.equal(qzSigner.isAllowedOrigin('https://flame-chick-pos-development-a1b2c3d4-faha-d.vercel.app'), true);
  assert.equal(qzSigner.isAllowedOrigin('https://flamechicpos.vercel.app'), true);

  assert.equal(qzSigner.isAllowedOrigin('https://flamechick-pos.vercel.com'), false);
  assert.equal(qzSigner.isAllowedOrigin('http://flame-chick-pos-development-git-work-production-source-audit-faha-d.vercel.app'), false);
  assert.equal(qzSigner.isAllowedOrigin('https://flame-chick-pos-development-git-work-production-source-audit-other-team.vercel.app'), false);
  assert.equal(qzSigner.isAllowedOrigin('https://flame-chick-pos-development-git-work-production-source-audit-faha-d.vercel.app:8443'), false);
  assert.equal(qzSigner.isAllowedOrigin('https://flame-chick-pos-development.vercel.app'), false);
});


test('restaurant receipt payload preserves dine-in layout and does not print service surcharge rows', function () {
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
    paidAmount: 3998,
    subtotal: 3998,
    surcharge: 350,
    total: 3998,
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
    'Price', 'Grand Total', 'Easypaisa', 'PAID'
  ].forEach(function (value) {
    assert.ok(readable.includes(value), 'receipt should contain ' + value);
  });
  assert.match(readable, /Half Broast @1,599\s+Rs 1,599/);
  assert.match(readable, /Full Broast @2,399\s+Rs 2,399/);
  assert.equal(readable.includes('Surcharge'), false);
});

test('delivery receipt prints delivery charges and customer delivery information only for delivery orders', function () {
  const helpers = loadQzHelpers();
  const payload = helpers.buildReceiptPayload({
    serverOrderNumber: 'FC-TEST-DELIVERY',
    fulfillmentType: 'Delivery',
    customerName: 'Ayesha Khan',
    phone: '03001234567',
    address: 'House 12, Street 4, Main Kamra Road',
    area: 'Kamra Road',
    deliveryLocality: 'Shamsabad',
    deliveryInstructions: 'Call on arrival',
    paymentMethod: 'Cash',
    paymentStatus: 'Unpaid',
    subtotal: 1200,
    deliveryFee: 150,
    discount: 50,
    total: 1300,
    items: [{ itemName: 'Chicken Broast', quantity: 1, price: 1200, lineTotal: 1200 }]
  });
  const readable = helpers.formatEscPosPayload(payload);
  [
    'DELIVERY', 'Customer: Ayesha Khan', 'Phone: 03001234567',
    'Address: House 12, Street 4, Main Kamra Road', 'Area: Kamra Road',
    'Locality: Shamsabad', 'Delivery Instructions: Call on arrival',
    'Delivery Charges', 'Rs 150', 'Grand Total', 'Rs 1,300', 'Balance Due'
  ].forEach(function (value) {
    assert.ok(readable.includes(value), 'delivery receipt should contain ' + value);
  });
  assert.equal(readable.includes('Surcharge'), false);
});

test('delivery charge row remains explicit at zero and does not leak to takeaway or dine-in', function () {
  const helpers = loadQzHelpers();
  const freeDelivery = helpers.formatEscPosPayload(helpers.buildReceiptPayload({
    fulfillmentType: 'Delivery', subtotal: 500, deliveryFee: 0, total: 500,
    items: [{ itemName: 'Fries', quantity: 1, price: 500, lineTotal: 500 }]
  }));
  assert.ok(freeDelivery.includes('Delivery Charges'));
  assert.ok(freeDelivery.includes('Rs 0'));

  const takeaway = helpers.formatEscPosPayload(helpers.buildReceiptPayload({
    fulfillmentType: 'Takeaway', subtotal: 500, deliveryFee: 150, total: 500,
    items: [{ itemName: 'Fries', quantity: 1, price: 500, lineTotal: 500 }]
  }));
  assert.equal(takeaway.includes('Delivery Charges'), false);
  assert.equal(takeaway.includes('Delivery'), false);
});

test('QZ logo helper builds an ESC/POS image job from the existing monochrome logo raster', function () {
  const helpers = loadQzHelpers();
  const entry = helpers.buildReceiptImageEntry('UE5HREFUQQ==');
  assert.deepEqual(JSON.parse(JSON.stringify(entry)), {
    type: 'raw',
    format: 'image',
    flavor: 'base64',
    data: 'UE5HREFUQQ==',
    options: { language: 'ESCPOS', dotDensity: 'double' }
  });
  assert.equal(helpers.buildReceiptImageEntry(''), null);
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


test('QZ receipt data places the existing logo image between ESC/POS commands', async function () {
  function FakeImage() { this.naturalWidth = 33; this.naturalHeight = 38; }
  Object.defineProperty(FakeImage.prototype, 'src', { set() { this.onload(); } });
  const context = { clearRect() {}, drawImage() {} };
  const sandbox = {
    window: { Image: FakeImage },
    document: { createElement(name) {
      assert.equal(name, 'canvas');
      return { width: 0, height: 0, getContext() { return context; },
        toDataURL() { return 'data:image/png;base64,UE5HREFUQQ=='; } };
    } }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'qz-printing.js' });
  const data = await sandbox.window.FlameChickQZ.diagnostics.buildReceiptData({
    serverOrderNumber: 'FC-QZ-LOGO-001', fulfillmentType: 'Delivery',
    customerName: 'Restaurant Test', phone: '03001234567',
    address: 'Main Kamra Road', area: 'Kamra', subtotal: 500,
    deliveryFee: 100, total: 600, paymentStatus: 'Unpaid',
    items: [{ itemName: 'Broast', quantity: 1, price: 500, lineTotal: 500 }]
  }, 'Counter Receipt');
  assert.equal(data.length, 4);
  assert.equal(data[0], '\x1B\x40\x1B\x61\x01');
  assert.equal(data[1].type, 'raw');
  assert.equal(data[1].format, 'image');
  assert.equal(data[1].flavor, 'base64');
  assert.equal(data[1].data, 'UE5HREFUQQ==');
  assert.equal(data[2], '\n');
  assert.ok(data[3].includes('Delivery Charges'));
  assert.ok(data[3].includes('Customer: Restaurant Test'));
});

test('nullable subtotal and total fall back to item and delivery amounts', function () {
  const helpers = loadQzHelpers();
  const readable = helpers.formatEscPosPayload(helpers.buildReceiptPayload({
    fulfillmentType: 'Delivery', subtotal: null, deliveryFee: 100, total: null,
    paymentStatus: 'Unpaid',
    items: [{ itemName: 'Broast', quantity: 1, price: 500, lineTotal: 500 }]
  }));
  assert.match(readable, /Price\s+Rs 500/);
  assert.match(readable, /Delivery Charges\s+Rs 100/);
  assert.match(readable, /Grand Total\s+Rs 600/);
});

test('receipt wrapping never emits a text row wider than the requested column count', function () {
  const helpers = loadQzHelpers();
  const cases = [
    { value: 'Delivery instructions: ' + 'A'.repeat(70), width: 48 },
    { value: 'House 19 Street 4 ' + 'B'.repeat(57) + ' Attock', width: 32 },
    { value: 'A'.repeat(97), width: 48 },
    { value: 'Short text', width: 0 }
  ];

  cases.forEach(function (entry) {
    const rows = helpers.wrap(entry.value, entry.width);
    const expectedWidth = Math.max(1, Math.floor(entry.width) || 1);
    assert.ok(rows.length > 0);
    rows.forEach(function (row) {
      assert.ok(row.length <= expectedWidth,
        'row must stay within ' + expectedWidth + ' columns: ' + row);
    });
  });
});

test('long delivery address and instructions stay within the 48-column ESC/POS receipt width', function () {
  const helpers = loadQzHelpers();
  const payload = helpers.buildReceiptPayload({
    serverOrderNumber: 'FC-LONG-ADDRESS-001',
    fulfillmentType: 'Delivery',
    customerName: 'Customer With A Long Display Name',
    phone: '03001234567',
    address: 'House 19 Street 4 ' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    area: 'Main Kamra Road',
    deliveryInstructions: 'Please call on arrival ' + 'ABCDEFGHIJKLMN'.repeat(5),
    paymentMethod: 'Cash',
    paymentStatus: 'Unpaid',
    subtotal: 500,
    deliveryFee: 100,
    total: 600,
    items: [{
      itemName: 'Extra Long Product Name ' + 'ABCDEFGHIJKLMN'.repeat(4),
      quantity: 2,
      price: 250,
      lineTotal: 500,
      contents: ['Extra long selected option ' + 'ZYXWVUTSRQPONMLK'.repeat(3)]
    }]
  });
  const textRows = payload
    .replace(/\x1B[\x40\x45\x61\x74\x21]/g, '')
    .replace(/\x1D[\x56\x21]/g, '')
    .split('\n')
    .filter(function (row) { return row.length > 0; });

  textRows.forEach(function (row) {
    assert.ok(row.length <= 48, 'printable row exceeds 48 columns: ' + row);
  });
  const readable = helpers.formatEscPosPayload(payload);
  assert.ok(readable.includes('Delivery Instructions'));
  assert.ok(readable.includes('Extra Long Product Name'));
  assert.ok(readable.includes('Grand Total'));
  assert.equal(readable.includes('Surcharge'), false);
  assert.equal(payload.slice(-4), '\x1D\x56\x42\x00');
});
