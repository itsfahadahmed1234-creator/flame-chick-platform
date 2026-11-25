import test from 'node:test';
import assert from 'node:assert/strict';
import guard from '../apps/flame-chick-website/js/preview-checkout-guard.js';

test('allows order writes only on exact verified Flame Chick Production hosts', () => {
  for (const host of [
    'flamechic.vercel.app',
    'flame-chick-website-production-six.vercel.app',
    'flame-chick-website-production-fahad-7455.vercel.app',
    'flame-chick-website-production-wnkr3bp6s-fahad-7455.vercel.app'
  ]) {
    assert.equal(guard.canSubmitOrders(host), true, host);
    assert.equal(guard.shouldBlockOrderApiWrite('POST', host), false, host);
  }
});

test('blocks every non-GET Order API request from Vercel Preview hostnames', () => {
  for (const host of [
    'flame-chick-website-production-git-work-website-parallel.vercel.app',
    'flame-chick-website-visual-review-l7zuhblsr-fahad-7455.vercel.app',
    'localhost',
    '127.0.0.1',
    'preview.example.com',
    '',
    null
  ]) {
    assert.equal(guard.canSubmitOrders(host), false);
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

test('normalizes hostname case and trailing dot, but rejects deceptive suffixes', () => {
  assert.equal(guard.canSubmitOrders('FLAMECHIC.VERCEL.APP'), true);
  assert.equal(guard.canSubmitOrders('flamechic.vercel.app.'), true);
  assert.equal(guard.canSubmitOrders('evil-flamechic.vercel.app'), false);
  assert.equal(guard.canSubmitOrders('flamechic.vercel.app.attacker.invalid'), false);
});
