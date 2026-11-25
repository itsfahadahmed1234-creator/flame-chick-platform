/* Fail-closed browser guard for the customer Website's Production Order API.
 * Published catalogue and website-context GET requests remain available on Preview.
 * Only the verified public Production hostnames may quote or submit orders.
 * This is a UI safety guard; the Order API remains the authoritative security boundary.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlameChickWebsitePreviewGuard = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var PRODUCTION_ORDER_HOSTS = Object.freeze([
    'flamechic.vercel.app',
    'flame-chick-website-production-six.vercel.app',
    'flame-chick-website-production-fahad-7455.vercel.app',
    'flame-chick-website-production-wnkr3bp6s-fahad-7455.vercel.app'
  ]);

  // Exactly one SSO-protected Website branch Preview may submit QA records.
  // Do not add deployment-random URLs or broad *.vercel.app matching.
  var TEST_CHECKOUT_PREVIEW_HOSTS = Object.freeze([
    'flame-chick-website-production-git-work-websi-ecbe0f-fahad-7455.vercel.app'
  ]);

  function normalizedHost(hostname) {
    if (typeof hostname !== 'string') return '';
    return hostname.trim().toLowerCase().replace(/\\.$/, '');
  }

  function isTestCheckoutPreview(hostname) {
    var host = normalizedHost(hostname);
    return !!host && TEST_CHECKOUT_PREVIEW_HOSTS.indexOf(host) !== -1;
  }

  function canSubmitOrders(hostname) {
    var host = normalizedHost(hostname);
    return !!host && (
      PRODUCTION_ORDER_HOSTS.indexOf(host) !== -1 ||
      TEST_CHECKOUT_PREVIEW_HOSTS.indexOf(host) !== -1
    );
  }

  function shouldBlockOrderApiWrite(method, hostname) {
    var verb = typeof method === 'string' ? method.trim().toUpperCase() : '';
    return verb !== 'GET' && !canSubmitOrders(hostname);
  }

  return Object.freeze({
    canSubmitOrders: canSubmitOrders,
    shouldBlockOrderApiWrite: shouldBlockOrderApiWrite,
    productionHosts: PRODUCTION_ORDER_HOSTS,
    testCheckoutPreviewHosts: TEST_CHECKOUT_PREVIEW_HOSTS,
    isTestCheckoutPreview: isTestCheckoutPreview
  });
});
