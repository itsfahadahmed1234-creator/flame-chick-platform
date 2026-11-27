import test from 'node:test';
import assert from 'node:assert/strict';
import guard from '../apps/flame-chick-website/js/preview-checkout-guard.js';

const stableProductionAliases = [
  'flame-chick-website-production.vercel.app',
  'flame-chick-website-production-faha-d.vercel.app'
];
const rehearsalUrl = 'flame-chick-website-production-p6r1gdef2-fahad-7455.vercel.app';
const rehearsalAlias = 'flame-chick-website-production-git-work-websi-ecbe0f-fahad-7455.vercel.app';
const currentReviewAlias = 'flame-chick-website-production-git-work-website-r-07b9f9-faha-d.vercel.app';

test('allows order writes only on canonical Production and stable FahaD project aliases', () => {
  const allowedProductionHosts = ['flamechick.vercel.app', 'FLAMECHICK.VERCEL.APP.', ...stableProductionAliases];
  for (const host of allowedProductionHosts) {
    assert.equal(guard.canSubmitOrders(host), true, host);
    assert.equal(guard.shouldBlockOrderApiWrite('POST', host), false, host);
    assert.equal(guard.isTestCheckoutPreview(host), false, host);
  }
  assert.deepEqual([...guard.productionHosts], [
    'flamechick.vercel.app',
    ...stableProductionAliases
  ]);
});

test('allows the exact current review branch Preview to use tagged Production test checkout', () => {
  assert.equal(guard.canSubmitOrders(currentReviewAlias), true);
  assert.equal(guard.isTestCheckoutPreview(currentReviewAlias), true);
  assert.equal(guard.shouldBlockOrderApiWrite('POST', currentReviewAlias), false);
  assert.equal(guard.canSubmitOrders(currentReviewAlias + '.attacker.invalid'), false);
});

test('keeps the previously approved rehearsal Preview hosts separately recognized', () => {
  assert.equal(guard.canSubmitOrders(rehearsalUrl), true);
  assert.equal(guard.canSubmitOrders(rehearsalAlias), true);
  assert.equal(guard.isTestCheckoutPreview(rehearsalUrl), true);
  assert.equal(guard.isTestCheckoutPreview(rehearsalAlias), true);
  assert.equal(guard.shouldBlockOrderApiWrite('POST', rehearsalUrl), false);
  assert.equal(guard.shouldBlockOrderApiWrite('POST', rehearsalAlias), false);
});

test('blocks order writes on every other Preview and retired Vercel hostname', () => {
  for (const host of [
    'flame-chick-website-production-git-work-ecbe0f-befahad1234-7050.vercel.app',
    'flame-chick-website-production-pnfd5wg08-befahad1234-7050.vercel.app',
    'flame-chick-website-production-git-work-website-parallel.vercel.app',
    'flame-chick-website-production-dsokjzvak-faha-d.vercel.app',
    'flame-chick-website-production-c7mqcl781-faha-d.vercel.app',
    rehearsalUrl + '.attacker.invalid',
    rehearsalAlias + '.attacker.invalid',
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

test('allows read-only GET requests on other Preview hosts without granting write access', () => {
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
  assert.equal(guard.canSubmitOrders('FLAME-CHICK-WEBSITE-PRODUCTION.VERCEL.APP.'), true);
  assert.equal(guard.canSubmitOrders('FLAME-CHICK-WEBSITE-PRODUCTION-FAHA-D.VERCEL.APP.'), true);
  assert.equal(guard.canSubmitOrders('flamechick.vercel.app.'), true);
  assert.equal(guard.canSubmitOrders('evil-flamechick.vercel.app'), false);
  assert.equal(guard.canSubmitOrders('flamechick.vercel.app.attacker.invalid'), false);
  assert.equal(guard.canSubmitOrders('flamechic.vercel.app'), false);
  assert.equal(guard.isTestCheckoutPreview('flame-chick-preview.vercel.app'), false);
  assert.equal(guard.isTestCheckoutPreview('flame-chick-website-production-git-work-website-parallel.vercel.app'), false);
  assert.equal(guard.isTestCheckoutPreview(rehearsalUrl + '.evil'), false);
});
