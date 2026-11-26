'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

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
