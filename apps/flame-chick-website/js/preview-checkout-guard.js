/* Fail-closed browser guard for the customer Website's Production Order API.
 * Public catalogue/context GET requests remain available on all Preview hosts.
 * Order writes are allowed only on the canonical customer hostname and the
 * exact Production hosts (Vercel aliases and the Cloudflare Pages hostname). Random
 * deployment and Preview URLs are never promoted into the Production allow-list.
 * Never wildcard-match Vercel Preview hostnames.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlameChickWebsitePreviewGuard = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var PRODUCTION_ORDER_HOSTS = Object.freeze([
    'flamechick.vercel.app',
    'flame-chick-website-production.vercel.app',
    'flame-chick-website-production-faha-d.vercel.app',
    'flame-chick-website.pages.dev'
  ]);
  var TEST_CHECKOUT_PREVIEW_HOSTS = Object.freeze([
    'flame-chick-website-production-p6r1gdef2-fahad-7455.vercel.app',
    'flame-chick-website-production-git-work-websi-ecbe0f-fahad-7455.vercel.app',
    'flame-chick-website-production-git-work-website-r-07b9f9-faha-d.vercel.app'
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
