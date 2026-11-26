'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const test = require('node:test');
const { extractFirstCertificatePem, verifyQzSignature } = require('../api/qz/certificate-utils');

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
  assert.equal(payload.endsWith('\n'), true);
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

test('first public signing certificate is extracted correctly from the two-certificate PEM bundle', function () {
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
