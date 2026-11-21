/* Flame Chick catalog loader (Phase 2B).
   Flow: health -> published? -> version-aware cache -> catalog fetch ->
   envelope + snapshot validation -> view-model.
   States resolved by load(): {state:'ready'|'unpublished'|'error', ...}.
   Fully injectable (fetchImpl / storageImpl / sleep / config) for Node tests. */
(function (root) {
  'use strict';

  var SCHEMA_VERSION = 2;

  function isPlainObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function isTrue(v) { return v === true || ['true', '1', 'yes'].indexOf(String(v).toLowerCase()) !== -1; }
  function fail(code, message) { return { ok: false, code: code, message: message }; }

  function validateHealth(payload) {
    if (!isPlainObj(payload)) return fail('BAD_PAYLOAD', 'Health response is not an object.');
    if (payload.ok !== true) {
      var he = isPlainObj(payload.error) ? payload.error : {};
      return fail(he.code || 'HEALTH_NOT_OK', he.message || 'Health endpoint reported an error.');
    }
    var d = payload.data;
    if (!isPlainObj(d)) return fail('HEALTH_NO_DATA', 'Health response has no data object.');
    if (Number(d.schemaVersion) !== SCHEMA_VERSION) {
      return fail('SCHEMA_UNSUPPORTED', 'schemaVersion ' + String(d.schemaVersion) + ' is not supported.');
    }
    if (typeof d.published !== 'boolean') return fail('HEALTH_BAD_PUBLISHED', 'Health data has no published flag.');
    if (d.published && (d.versionId === null || d.versionId === undefined || d.versionId === '')) {
      return fail('HEALTH_NO_VERSION', 'Published health data has no versionId.');
    }
    return {
      ok: true,
      published: d.published,
      versionId: d.published ? String(d.versionId) : null,
      schemaVersion: SCHEMA_VERSION
    };
  }

  function validateEnvelope(payload) {
    if (!isPlainObj(payload)) return fail('BAD_PAYLOAD', 'Response payload is not an object.');
    if (payload.ok !== true) {
      var e = isPlainObj(payload.error) ? payload.error : {};
      return fail(e.code || 'NOT_OK', e.message || 'API response was not successful.');
    }
    if (!isPlainObj(payload.data)) return fail('NO_DATA', 'API response has no data object.');
    return { ok: true, data: payload.data };
  }

  function checkElements(arr, keys, label) {
    for (var i = 0; i < arr.length; i++) {
      var el = arr[i];
      if (!isPlainObj(el)) return fail('STRUCTURE_INVALID', label + '[' + i + '] is not an object.');
      for (var k = 0; k < keys.length; k++) {
        if (el[keys[k]] === null || el[keys[k]] === undefined) {
          return fail('STRUCTURE_INVALID', label + '[' + i + '] missing ' + keys[k] + '.');
        }
      }
    }
    return null;
  }

  function validateSnapshot(snap) {
    if (!isPlainObj(snap)) return fail('SNAPSHOT_INVALID', 'Catalog payload is not an object.');
    if (Number(snap.schemaVersion) !== SCHEMA_VERSION) {
      return fail('SCHEMA_UNSUPPORTED', 'schemaVersion ' + String(snap.schemaVersion) + ' is not supported.');
    }
    if (snap.versionId === null || snap.versionId === undefined || snap.versionId === '') {
      return fail('NO_VERSION', 'Catalog payload has no versionId.');
    }
    if (!isPlainObj(snap.settings)) return fail('SETTINGS_MISSING', 'Catalog payload has no settings object.');
    var arrays = [
      'categories', 'products', 'productVariants', 'subcategories', 'deals',
      'dealComponents', 'modifierGroups', 'modifiers', 'modifierPriceRules',
      'modifierGroupAssignments', 'deliveryAreas', 'drinkOptions'
    ];
    for (var i = 0; i < arrays.length; i++) {
      if (!Array.isArray(snap[arrays[i]])) {
        return fail('STRUCTURE_MISSING', 'Catalog payload is missing the ' + arrays[i] + ' array.');
      }
    }
    var bad = checkElements(snap.categories, ['CategoryID', 'NameEn'], 'categories');
    if (bad) return bad;
    bad = checkElements(snap.products, ['ProductID', 'CategoryID', 'NameEn'], 'products');
    if (bad) return bad;
    bad = checkElements(snap.productVariants, ['VariantID', 'ProductID', 'Price'], 'productVariants');
    if (bad) return bad;
    bad = checkElements(snap.subcategories, ['SubcategoryID', 'CategoryID', 'NameEn'], 'subcategories');
    if (bad) return bad;
    bad = checkElements(snap.deals, ['DealID', 'CategoryID', 'Title', 'BundlePrice'], 'deals');
    if (bad) return bad;
    bad = checkElements(snap.dealComponents, ['ComponentID', 'DealID', 'ComponentType', 'RefType'], 'dealComponents');
    if (bad) return bad;
    bad = checkElements(snap.modifierGroups, ['ModifierGroupID', 'NameEn', 'MinSelect', 'MaxSelect'], 'modifierGroups');
    if (bad) return bad;
    bad = checkElements(snap.modifiers, ['ModifierID', 'ModifierGroupID', 'NameEn', 'PriceMode'], 'modifiers');
    if (bad) return bad;
    bad = checkElements(snap.modifierPriceRules, ['ModifierID', 'SizeKey', 'Price'], 'modifierPriceRules');
    if (bad) return bad;
    bad = checkElements(snap.modifierGroupAssignments, ['TargetType', 'TargetID', 'ModifierGroupID'], 'modifierGroupAssignments');
    if (bad) return bad;
    bad = checkElements(snap.deliveryAreas, ['ID', 'AreaName', 'Fee'], 'deliveryAreas');
    if (bad) return bad;
    return { ok: true };
  }

  function buildViewModel(snap) {
    var settings = isPlainObj(snap.settings) ? snap.settings : {};

    var categories = (Array.isArray(snap.categories) ? snap.categories : [])
      .filter(function (c) { return isPlainObj(c) && isTrue(c.Active); })
      .map(function (c) {
        return {
          ID: String(c.CategoryID),
          Name: String(c.NameEn || c.CategoryID),
          NameUr: String(c.NameUr || ''),
          SortOrder: Number(c.SortOrder) || 0,
          Image: String(c.ImagePath || ''),
          Subtitle: ''
        };
      })
      .sort(function (a, b) { return a.SortOrder - b.SortOrder; });

    var activeCat = {};
    categories.forEach(function (c) { activeCat[c.ID] = true; });

    var prodOrder = {};
    var products = (Array.isArray(snap.products) ? snap.products : [])
      .filter(function (p) { return isPlainObj(p) && isTrue(p.Active) && activeCat[String(p.CategoryID)]; })
      .filter(function (p, i) { prodOrder[String(p.ProductID)] = i; return true; });
    var prodById = {};
    products.forEach(function (p) { prodById[String(p.ProductID)] = p; });

    var menu = [];
    (Array.isArray(snap.productVariants) ? snap.productVariants : []).forEach(function (v) {
      if (!isPlainObj(v) || !isTrue(v.Active)) return;
      var p = prodById[String(v.ProductID)];
      if (!p) return;
      menu.push({
        ID: String(v.VariantID),
        ProductID: String(p.ProductID),
        CategoryID: String(p.CategoryID),
        SubcategoryID: String(p.SubcategoryID || ''),
        Name: String(p.NameEn || ''),
        NameUr: String(p.NameUr || ''),
        Description: String(v.SizeLabel || ''),
        Desc: String(p.DescriptionEn || ''),
        DescUr: String(p.DescriptionUr || ''),
        Price: Number(v.Price) || 0,
        Available: isTrue(v.Available) && isTrue(p.Available),
        Active: true,
        Featured: isTrue(p.Featured),
        SortOrder: Number(v.SortOrder) || 0,
        ImageFolderKey: String(p.ImageFolderKey || ''),
        ImageGroupID: String(p.ImageGroupID || ''),
        ImagePublished: isTrue(p.ImagePublished),
        ImageExtension: String(p.ImageExtension || ''),
        ImageCurrentPath: String(p.ImageCurrentPath || '')
      });
    });
    menu.sort(function (a, b) {
      var pa = prodOrder[a.ProductID] || 0;
      var pb = prodOrder[b.ProductID] || 0;
      if (pa !== pb) return pa - pb;
      return a.SortOrder - b.SortOrder;
    });

    var subcategories = (Array.isArray(snap.subcategories) ? snap.subcategories : [])
      .filter(function (s) { return isPlainObj(s) && isTrue(s.Active); })
      .map(function (s) {
        return {
          ID: String(s.SubcategoryID),
          CategoryID: String(s.CategoryID || ''),
          Name: String(s.NameEn || ''),
          NameUr: String(s.NameUr || ''),
          SortOrder: Number(s.SortOrder) || 0,
          Active: true
        };
      })
      .sort(function (a, b) { return a.SortOrder - b.SortOrder; });

    var deals = (Array.isArray(snap.deals) ? snap.deals : [])
      .filter(function (d) { return isPlainObj(d) && isTrue(d.Active); })
      .map(function (d) {
        return {
          DealID: String(d.DealID),
          CategoryID: String(d.CategoryID || ''),
          Title: String(d.Title || ''),
          TitleUr: String(d.TitleUr || ''),
          Description: String(d.Description || ''),
          DescriptionUr: String(d.DescriptionUr || ''),
          Price: Number(d.BundlePrice) || 0,
          ImagePath: String(d.ImagePath || ''),
          available: isTrue(d.available),
          Active: true,
          SortOrder: Number(d.SortOrder) || 0
        };
      })
      .sort(function (a, b) { return a.SortOrder - b.SortOrder; });

    var deliveryAreas = (Array.isArray(snap.deliveryAreas) ? snap.deliveryAreas : [])
      .filter(isPlainObj)
      .map(function (a) {
        var fee = a.Fee !== undefined ? a.Fee
          : (a.DeliveryFee !== undefined ? a.DeliveryFee
            : (a.fee !== undefined ? a.fee : 0));
        return {
          id: String(a.ID || a.AreaID || a.DeliveryAreaID || ''),
          name: String(a.AreaName || a.NameEn || a.Name || ''),
          fee: Number(fee) || 0
        };
      })
      .filter(function (a) { return a.id; });

    return {
      settings: settings,
      categories: categories,
      menu: menu,
      products: products,
      subcategories: subcategories,
      deals: deals,
      deliveryAreas: deliveryAreas
    };
  }

  function fetchJson(url, opts) {
    opts = opts || {};
    var fetchImpl = opts.fetchImpl;
    var timeoutMs = opts.timeoutMs || 0;
    var retries = Math.max(0, opts.retries === undefined ? 2 : opts.retries);
    var retryDelayMs = opts.retryDelayMs || 0;
    var sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

    function once() {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = null;
      if (ctrl && timeoutMs > 0) timer = setTimeout(function () { ctrl.abort(); }, timeoutMs);
      var init = {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
        headers: opts.headers || {}
      };
      if (ctrl) init.signal = ctrl.signal;
      return Promise.resolve()
        .then(function () { return fetchImpl(url, init); })
        .then(function (res) {
          return Promise.resolve(res.text()).then(function (text) {
            if (!res.ok) {
              var err = new Error('HTTP ' + res.status + ' for ' + url);
              err.code = 'HTTP_' + res.status;
              err.retryable = res.status >= 500 || res.status === 429;
              throw err;
            }
            try {
              return JSON.parse(text);
            } catch (e) {
              var je = new Error('Response from ' + url + ' is not valid JSON.');
              je.code = 'BAD_JSON';
              je.retryable = true;
              throw je;
            }
          });
        })
        .catch(function (err) {
          if (err && err.name === 'AbortError') {
            var te = new Error('Request to ' + url + ' timed out.');
            te.code = 'TIMEOUT';
            te.retryable = true;
            throw te;
          }
          if (!err || !err.code) {
            var ne = new Error((err && err.message) || ('Network error for ' + url));
            ne.code = 'NETWORK';
            ne.retryable = true;
            throw ne;
          }
          throw err;
        })
        .then(
          function (v) { if (timer) clearTimeout(timer); return v; },
          function (e) { if (timer) clearTimeout(timer); throw e; }
        );
    }

    var attempt = 0;
    function loop() {
      return once().catch(function (err) {
        if (err && err.retryable && attempt < retries) {
          attempt++;
          return sleep(retryDelayMs * attempt).then(loop);
        }
        throw err;
      });
    }
    return loop();
  }

  function readCache(storage, key, formatVersion) {
    if (!storage) return null;
    try {
      var raw = storage.getItem(key);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (!isPlainObj(entry)) return null;
      if (entry.v !== formatVersion) return null;
      if (entry.versionId === null || entry.versionId === undefined || entry.versionId === '') return null;
      if (!validateSnapshot(entry.snapshot).ok) return null;
      return entry;
    } catch (e) {
      return null;
    }
  }

  function writeCache(storage, key, formatVersion, snapshot) {
    if (!storage) return;
    try {
      storage.setItem(key, JSON.stringify({
        v: formatVersion,
        versionId: String(snapshot.versionId),
        savedAt: Date.now(),
        snapshot: snapshot
      }));
    } catch (e) { /* quota/private mode: caching is best-effort */ }
  }

  function clearCache(storage, key) {
    if (!storage) return;
    try { storage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function healthUrl(config) { return config.apiBase + '?action=health'; }
  function catalogUrl(config) { return config.apiBase + '?action=catalog'; }

  function load(deps) {
    deps = deps || {};
    var conf = deps.config || (typeof FLAME_CHICK_CONFIG !== 'undefined' ? FLAME_CHICK_CONFIG : null);
    if (!conf || !conf.apiBase) {
      return Promise.reject(new Error('Flame Chick catalog API is missing.'));
    }
    var fetchImpl = deps.fetchImpl ||
      (typeof window !== 'undefined' && window.fetch
        ? function (u, o) { return window.fetch(u, o); }
        : (typeof fetch === 'function' ? function (u, o) { return fetch(u, o); } : null));
    if (!fetchImpl) return Promise.reject(new Error('fetch is unavailable.'));
    var storage = Object.prototype.hasOwnProperty.call(deps, 'storageImpl')
      ? deps.storageImpl
      : (typeof localStorage !== 'undefined' ? localStorage : null);
    var sleep = deps.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var timeoutMs = deps.timeoutMs !== undefined ? deps.timeoutMs : (conf.requestTimeoutMs || 12000);
    var retries = deps.retries !== undefined ? deps.retries : (conf.retries !== undefined ? conf.retries : 2);
    var retryDelayMs = deps.retryDelayMs !== undefined ? deps.retryDelayMs : (conf.retryDelayMs || 600);
    var cacheKey = conf.catalogCacheKey || 'flame_chick_catalog_v1';
    var formatVersion = conf.cacheFormatVersion !== undefined ? conf.cacheFormatVersion : 1;

    if (!conf.publishableKey) {
      return Promise.reject(new Error('Flame Chick public API key is missing.'));
    }
    var fetchOpts = {
      fetchImpl: fetchImpl,
      timeoutMs: timeoutMs,
      retries: retries,
      retryDelayMs: retryDelayMs,
      sleep: sleep,
      headers: { apikey: String(conf.publishableKey) }
    };

    function get(url) { return fetchJson(url, fetchOpts); }
    function cacheRead() { return readCache(storage, cacheKey, formatVersion); }

    function readyFromCache(entry, note) {
      var view = buildViewModel(entry.snapshot);
      return { state: 'ready', snapshot: entry.snapshot, view: view, cacheNote: note };
    }

    function unpublished(code) {
      clearCache(storage, cacheKey);
      return {
        state: 'unpublished',
        error: { code: code || 'CATALOG_NOT_PUBLISHED', message: 'The catalog has not been published yet.' }
      };
    }

    return Promise.resolve()
      .then(function () {
        return get(healthUrl(conf)).then(
          function (healthPayload) { return { payload: healthPayload }; },
          function (err) { return { transportError: err }; }
        );
      })
      .then(function (h) {
        if (!h.transportError) {
          var hv = validateHealth(h.payload);
          if (!hv.ok) {
            /* Server answered but the health contract is broken: report it plainly,
               do not hide it behind stale cache. */
            return { state: 'error', error: { code: hv.code, message: hv.message } };
          }
          if (hv.published === false) {
            /* Live says unpublished: cache is never served in this state. */
            return unpublished('CATALOG_NOT_PUBLISHED');
          }
          var entry = cacheRead();
          if (entry && String(entry.versionId) === hv.versionId) {
            try {
              return readyFromCache(entry, 'version-match');
            } catch (e) {
              /* corrupt-but-valid-looking cache: fall through to network */
            }
          }
        }
        /* health transport-failed, or cache miss/stale: fetch the catalog itself */
        return get(catalogUrl(conf)).then(
          function (catPayload) { return { payload: catPayload }; },
          function (err) { return { transportError: err }; }
        ).then(function (c) {
          if (c.transportError) {
            /* Gate 0 (Phase 2C) — fail-closed: the current published version could
               not be verified (health unverified, or version-stale cache), so stale
               cached data must never enable ordering. Cache is kept untouched for a
               later verified attempt. */
            return {
              state: 'error',
              error: {
                code: (c.transportError && c.transportError.code) || 'NETWORK',
                message: (c.transportError && c.transportError.message) || 'Catalog request failed.'
              }
            };
          }
          var ev = validateEnvelope(c.payload);
          if (!ev.ok) {
            if (ev.code === 'CATALOG_NOT_PUBLISHED') return unpublished(ev.code);
            return { state: 'error', error: { code: ev.code, message: ev.message } };
          }
          var sv = validateSnapshot(ev.data);
          if (!sv.ok) return { state: 'error', error: { code: sv.code, message: sv.message } };
          var view;
          try {
            view = buildViewModel(ev.data);
          } catch (err2) {
            return {
              state: 'error',
              error: { code: 'VIEW_FAILED', message: String((err2 && err2.message) || err2) }
            };
          }
          writeCache(storage, cacheKey, formatVersion, ev.data);
          return { state: 'ready', snapshot: ev.data, view: view };
        });
      });
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    load: load,
    validateHealth: validateHealth,
    validateEnvelope: validateEnvelope,
    validateSnapshot: validateSnapshot,
    buildViewModel: buildViewModel,
    fetchJson: fetchJson,
    readCache: readCache,
    writeCache: writeCache,
    clearCache: clearCache,
    healthUrl: healthUrl,
    catalogUrl: catalogUrl
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlameChickCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));