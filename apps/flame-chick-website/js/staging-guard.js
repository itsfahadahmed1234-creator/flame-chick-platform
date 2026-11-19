/* STAGING ONLY — automated-test safety net, OPT-IN via ?wa_test=1 (2026-10-28).
   --------------------------------------------------------------------------------
   Without the flag this file does nothing: the deployed staging site uses the
   real restaurant destination from js/config.js (the single authoritative
   source, owner-confirmed 2026-10-28) and normal ordering works.

   With ?wa_test=1 every WhatsApp/phone destination this page can produce is
   forced to the test-only number 923000000000 (not a real subscriber) while
   preserving the prefilled ?text= order message, and the Android intent
   hand-off is kept off the test path (waLaunch() sees the flag and returns
   the interceptable window.open mode). Automated runs therefore cannot reach
   the real number even if they forget to intercept, and no order can be sent
   automatically: wa.me click-to-chat links only prefill a message for review.

   The rewrite is generic — any digits after wa.me/ (plain, or percent-encoded
   inside an intent URL's browser fallback) become the test number — so this
   file never embeds the restaurant number itself. */
(function () {
  'use strict';

  function active() {
    return /(?:\?|&)wa_test=1(?:&|$)/.test(String(location.search || ''));
  }
  if (!active()) return; /* production-behaviour: complete no-op */

  var TEST_WA = '923000000000';
  var TEST_TEL = '+923000000000';
  var TEST_DISPLAY = '+923000000000 (STAGING TEST)';

  window.__hfpTestGuard = true; /* marker for automated tests to wait on */

  function forceGlobal(name, value) {
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get: function () { return value; },
        set: function () { /* test mode: ignore any assigned value */ }
      });
      return true;
    } catch (e) {
      try { window[name] = value; } catch (e2) { /* ignore */ }
      return false;
    }
  }

  forceGlobal('WA_PHONE', TEST_WA);
  forceGlobal('PHONE_DISPLAY', TEST_DISPLAY);

  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  /* Generic: rewrite ANY wa.me destination (plain link, or the percent-encoded
     S.browser_fallback_url inside an intent:// URL) to the test number,
     preserving the prefilled text; tel: links become the test line. */
  function normalizeHref(href) {
    if (typeof href !== 'string' || !href) return href;
    var out = href;
    if (/wa\.me/i.test(out)) {
      out = out.replace(/(wa\.me\/)(\d+)/gi, '$1' + TEST_WA);
      out = out.replace(/(wa\.me%2f)(\d+)/gi, '$1' + TEST_WA);
    }
    if (/^tel:/i.test(out)) {
      var m = out.match(/^tel:([^#]*)(#.*)?$/i);
      if (m && digits(m[1]) !== digits(TEST_TEL)) return 'tel:' + TEST_TEL + (m[2] || '');
    }
    return out;
  }

  /* Programmatic sinks, defence in depth (all three ways a destination can
     leave this page): window.open, the intent navigation seam
     (window.hfpNavigate) and HfpPricing.waHref (URL construction itself). */
  function wrapOpen() {
    try {
      var origOpen = window.open;
      if (typeof origOpen !== 'function') return;
      window.open = function () {
        var args = Array.prototype.slice.call(arguments);
        if (typeof args[0] === 'string') args[0] = normalizeHref(args[0]);
        return origOpen.apply(window, args);
      };
    } catch (e) { /* ignore */ }
  }

  function wrapNavigate() {
    try {
      var origNav = window.hfpNavigate;
      if (typeof origNav === 'function') {
        window.hfpNavigate = function (url) { return origNav.call(window, normalizeHref(url)); };
      } else {
        window.hfpNavigate = function (url) { /* no app seam present: swallow */ };
      }
    } catch (e) { /* ignore */ }
  }

  function wrapWaHref() {
    try {
      var hp = window.HfpPricing;
      if (!hp || typeof hp.waHref !== 'function') return;
      var orig = hp.waHref;
      hp.waHref = function (number, msg) { return orig.call(this, TEST_WA, msg); };
    } catch (e) { /* ignore */ }
  }

  wrapOpen();
  wrapNavigate();
  wrapWaHref();

  function fixElement(el) {
    if (!el || el.nodeType !== 1 || !el.getAttribute) return;
    var href = el.getAttribute('href');
    if (!href) return;
    var fixed = normalizeHref(href);
    if (fixed !== href) el.setAttribute('href', fixed);
  }

  function sweep(root) {
    if (!root) return;
    if (root.nodeType === 1) fixElement(root);
    if (root.querySelectorAll) {
      var list = root.querySelectorAll('a[href]');
      for (var i = 0; i < list.length; i++) fixElement(list[i]);
    }
  }

  function start() {
    sweep(document);
    if (typeof MutationObserver !== 'function') return;
    var mo = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === 'attributes') fixElement(r.target);
        else if (r.type === 'childList') {
          for (var j = 0; j < r.addedNodes.length; j++) sweep(r.addedNodes[j]);
        }
      }
    });
    mo.observe(document.documentElement, {
      attributes: true, attributeFilter: ['href'], subtree: true, childList: true
    });

    /* Click-time net: rewrite even elements created in the same tick. */
    document.addEventListener('click', function (e) {
      var t = e.target;
      var a = t && t.closest ? t.closest('a[href]') : (t && t.nodeType === 1 ? t : null);
      if (a && a.getAttribute) {
        var href = a.getAttribute('href');
        var fixed = normalizeHref(href);
        if (fixed !== href) a.setAttribute('href', fixed);
      }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();