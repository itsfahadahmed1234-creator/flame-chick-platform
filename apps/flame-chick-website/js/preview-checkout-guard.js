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

  function canSubmitOrders(hostname) {
    if (typeof hostname !== 'string') return false;
    var host = hostname.trim().toLowerCase().replace(/\.$/, '');
    return PRODUCTION_ORDER_HOSTS.indexOf(host) !== -1;
  }

  function shouldBlockOrderApiWrite(method, hostname) {
    var verb = typeof method === 'string' ? method.trim().toUpperCase() : '';
    return verb !== 'GET' && !canSubmitOrders(hostname);
  }

  return Object.freeze({
    canSubmitOrders: canSubmitOrders,
    shouldBlockOrderApiWrite: shouldBlockOrderApiWrite,
    productionHosts: PRODUCTION_ORDER_HOSTS
  });
});
