import test from 'node:test';
import assert from 'node:assert/strict';
import guard from '../apps/flame-chick-website/js/preview-checkout-guard.js';

test('allows order writes on canonical Production and exact allow-listed live-test Preview hosts', () => {
  assert.equal(guard.canSubmitOrders('flamechick.vercel.app'), true);
  assert.equal(guard.canSubmitOrders('FLAMECHICK.VERCEL.APP.'), true);
  assert.equal(guard.shouldBlockOrderApiWrite('POST', 'flamechick.vercel.app'), false);
  assert.equal(guard.canSubmitOrders('flame-chick-website-production-git-work-ecbe0f-befahad1234-7050.vercel.app'), true);
  assert.equal(guard.canSubmitOrders('flame-chick-website-production-pnfd5wg08-befahad1234-7050.vercel.app'), true);
  assert.equal(guard.isTestCheckoutPreview('flame-chick-website-production-git-work-ecbe0f-befahad1234-7050.vercel.app'), true);
  assert.equal(guard.isTestCheckoutPreview('flame-chick-website-production-pnfd5wg08-befahad1234-7050.vercel.app'), true);
  assert.equal(guard.shouldBlockOrderApiWrite('POST', 'flame-chick-website-production-git-work-ecbe0f-befahad1234-7050.vercel.app'), false);
  assert.equal(guard.canSubmitOrders('flamechic.vercel.app'), false);
});
test('blocks order writes on every Preview and retired Vercel hostname', () => {
  for (const host of [
    'flame-chick-website-production-git-work-websi-ecbe0f-fahad-7455.vercel.app',
    'flame-chick-website-production-git-work-website-parallel.vercel.app',
    'flame-chick-website-production-git-work-ecbe0f-befahad1234-7050.vercel.app.attacker.invalid',
    'flame-chick-website-production-pnfd5wg08-befahad1234-7050.vercel.app.attacker.invalid',
    'flame-chick-website-production-six.vercel.app',
    'flame-chick-website-production-fahad-7455.vercel.app',
    'flame-chick-website-production-wnkr3bp6s-fahad-7455.vercel.app',
    'localhost', '127.0.0.1', 'preview.example.com', '', null
  ]) {
    assert.equal(guard.canSubmitOrders(host), false, String(host));
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
      assert.equal(guard.shouldBlockOrderApiWrite(method, host), true, method + ' ' + host);
    }
  }
});

test('allows read-only GET requests on Preview without granting write access', () => {
  assert.equal(guard.shouldBlockOrderApiWrite('GET', 'flame-chick-preview.vercel.app'), false);
  assert.equal(guard.shouldBlockOrderApiWrite('get', 'localhost'), false);
  assert.equal(guard.canSubmitOrders('flame-chick-preview.vercel.app'), false);
});

test('fails closed for malformed hosts and unrecognized methods', () => {
  for (const value of [undefined, null, '', {}, 123]) {
    assert.equal(guard.canSubmitOrders(value), false);
    assert.equal(guard.shouldBlockOrderApiWrite('POST', value), true);
  }
  assert.equal(guard.shouldBlockOrderApiWrite('', 'flame-chick-preview.vercel.app'), true);
});

test('normalizes hostname case and trailing dot but rejects lookalike and deceptive suffixes', () => {
  assert.equal(guard.canSubmitOrders('FLAMECHICK.VERCEL.APP'), true);
  assert.equal(guard.canSubmitOrders('flamechick.vercel.app.'), true);
  assert.equal(guard.canSubmitOrders('evil-flamechick.vercel.app'), false);
  assert.equal(guard.canSubmitOrders('flamechick.vercel.app.attacker.invalid'), false);
  assert.equal(guard.canSubmitOrders('flamechic.vercel.app'), false);
  assert.equal(guard.isTestCheckoutPreview('flame-chick-preview.vercel.app'), false);
  assert.equal(guard.isTestCheckoutPreview('flame-chick-website-production-git-work-website-parallel.vercel.app'), false);
  assert.equal(guard.isTestCheckoutPreview('flame-chick-website-production-git-work-ecbe0f-befahad1234-7050.vercel.app.evil'), false);
});
