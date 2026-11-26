/* Fail-closed browser guard for the customer Website's Production Order API.
 * Public catalogue/context GET requests remain available on all Preview hosts.
 * Order writes are allowed only on the canonical public Production host and the
 * two exact hosts for the explicitly authorized live-Production rehearsal Preview.
 * Never wildcard-match Vercel Preview hostnames.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlameChickWebsitePreviewGuard = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var PRODUCTION_ORDER_HOSTS = Object.freeze(['flamechick.vercel.app']);
  var TEST_CHECKOUT_PREVIEW_HOSTS = Object.freeze([
    'flame-chick-website-production-git-work-ecbe0f-befahad1234-7050.vercel.app',
    'flame-chick-website-production-pnfd5wg08-befahad1234-7050.vercel.app'
  ]);

  function normalizedHost(hostname) {
    if (typeof hostname !== 'string') return '';
    return hostname.trim().toLowerCase().replace(/\.$/, '');
  }

  function isTestCheckoutPreview(hostname) {
    var host = normalizedHost(hostname);
    return !!host && TEST_CHECKOUT_PREVIEW_HOSTS.indexOf(host) !== -1;
  }

  function canSubmitOrders(hostname) {
    var host = normalizedHost(hostname);
    return !!host && (
      PRODUCTION_ORDER_HOSTS.indexOf(host) !== -1 ||
      isTestCheckoutPreview(host)
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
