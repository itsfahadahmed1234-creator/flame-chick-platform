/* Flame Chick V3 public catalog client.
   Fetches only the immutable current publication through the public Edge Function.
   No localStorage/sessionStorage cache: health and catalog must be verified on each load.
   The database RPC independently verifies the PostgreSQL jsonb::text SHA-256 before
   the Edge Function returns a snapshot. This client verifies that the health and
   catalog publication metadata are identical and validates the complete V3 contract. */
(function (root) {
  'use strict';

  var DEFAULT_TIMEOUT_MS = 10000;
  var DEFAULT_RETRIES = 1;
  var MAX_RESPONSE_BYTES = 4 * 1024 * 1024 + 8192;

  function isRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function fail(code, message) {
    return { ok: false, code: code, message: message };
  }

  function byteLength(value) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
    return unescape(encodeURIComponent(value)).length;
  }

  function responseError(code, message, retryable) {
    var error = new Error(message);
    error.code = code;
    error.retryable = retryable === true;
    return error;
  }

  function requestJson(url, options) {
    options = options || {};
    var fetchImpl = options.fetchImpl;
    var timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    var retries = options.retries === undefined ? DEFAULT_RETRIES : options.retries;
    var delay = options.retryDelayMs || 250;
    var sleep = options.sleep || function (ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    };

    if (typeof fetchImpl !== 'function') {
      return Promise.reject(responseError('FETCH_UNAVAILABLE', 'Browser network access is unavailable.', false));
    }

    function once() {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = null;
      if (controller && timeoutMs > 0) {
        timer = setTimeout(function () { controller.abort(); }, timeoutMs);
      }
      var init = {
        method: 'GET',
        cache: 'no-store',
        redirect: 'error',
        headers: options.headers || {}
      };
      if (controller) init.signal = controller.signal;

      return Promise.resolve().then(function () {
        return fetchImpl(url, init);
      }).then(function (response) {
        if (!response || typeof response.ok !== 'boolean') {
          throw responseError('BAD_HTTP_RESPONSE', 'Catalog server returned an invalid HTTP response.', false);
        }
        if (!response.ok) {
          var status = Number(response.status) || 0;
          throw responseError('HTTP_' + status, 'Catalog request failed with HTTP ' + status + '.', status === 429 || status >= 500);
        }
        var contentType = response.headers && typeof response.headers.get === 'function'
          ? String(response.headers.get('content-type') || '').toLowerCase() : '';
        if (contentType && contentType.indexOf('application/json') !== 0) {
          throw responseError('CONTENT_TYPE_INVALID', 'Catalog server did not return JSON.', false);
        }
        return response.text().then(function (text) {
          if (typeof text !== 'string' || byteLength(text) > MAX_RESPONSE_BYTES) {
            throw responseError('RESPONSE_TOO_LARGE', 'Published catalog response exceeds the size limit.', false);
          }
          try { return JSON.parse(text); }
          catch (error) {
            throw responseError('BAD_JSON', 'Catalog server returned invalid JSON.', false);
          }
        });
      }).catch(function (error) {
        if (error && error.name === 'AbortError') {
          throw responseError('TIMEOUT', 'Catalog request timed out.', true);
        }
        if (error && error.code) throw error;
        throw responseError('NETWORK', 'Could not reach the published catalog service.', true);
      }).then(function (value) {
        if (timer) clearTimeout(timer);
        return value;
      }, function (error) {
        if (timer) clearTimeout(timer);
        throw error;
      });
    }

    var attempt = 0;
    function run() {
      return once().catch(function (error) {
        if (error.retryable && attempt < retries) {
          attempt++;
          return sleep(delay * attempt).then(run);
        }
        throw error;
      });
    }
    return run();
  }

  function validateCatalogEnvelope(payload, health, contract) {
    if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) {
      var e = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
      return fail(e.code || 'CATALOG_ENVELOPE_INVALID', e.message || 'Published catalog response envelope is invalid.');
    }

    var snapshot = payload.data;
    var validation = contract.validateSnapshot(snapshot);
    if (!validation || validation.ok !== true) {
      return fail((validation && validation.code) || 'SNAPSHOT_INVALID', 'Published catalog did not pass V3 validation.');
    }

    var same =
      snapshot.schemaVersion === health.schemaVersion &&
      snapshot.publicationId === health.publicationId &&
      snapshot.publicationNumber === health.publicationNumber &&
      snapshot.draftRevision === health.draftRevision &&
      snapshot.snapshotSha256 === health.snapshotSha256 &&
      snapshot.publishedAt === health.publishedAt &&
      snapshot.versionId === health.versionId;

    if (typeof snapshot.databaseNow !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(snapshot.databaseNow) ||
        !Number.isFinite(Date.parse(snapshot.databaseNow))) {
      return fail('DATABASE_TIME_INVALID', 'Catalog response did not include a valid database timestamp.');
    }

    if (!same) {
      return fail('PUBLICATION_MISMATCH', 'Health and catalog responses refer to different publication versions.');
    }

    return { ok: true, snapshot: snapshot, databaseNow: snapshot.databaseNow };
  }

  function load(deps) {
    deps = deps || {};
    var config = deps.config || (typeof FLAME_CHICK_CONFIG !== 'undefined' ? FLAME_CHICK_CONFIG : null);
    var contract = deps.contract || (root && root.FlameChickCatalogV3);
    var fetchImpl = deps.fetchImpl || (root && typeof root.fetch === 'function' ? root.fetch.bind(root) : null);

    if (!config || typeof config.apiBase !== 'string' || !/^https:\/\//.test(config.apiBase)) {
      return Promise.resolve({ state: 'error', error: fail('CONFIG_INVALID', 'Published catalog API is not configured securely.') });
    }
    if (!config.publishableKey || typeof config.publishableKey !== 'string') {
      return Promise.resolve({ state: 'error', error: fail('CONFIG_INVALID', 'Public API key is missing.') });
    }
    if (!contract || contract.SCHEMA_VERSION !== 3 ||
        typeof contract.validateHealth !== 'function' || typeof contract.validateSnapshot !== 'function') {
      return Promise.resolve({ state: 'error', error: fail('CONTRACT_UNAVAILABLE', 'V3 catalog validator is unavailable.') });
    }

    var options = {
      fetchImpl: fetchImpl,
      timeoutMs: deps.timeoutMs || config.requestTimeoutMs || DEFAULT_TIMEOUT_MS,
      retries: deps.retries === undefined ? DEFAULT_RETRIES : deps.retries,
      retryDelayMs: deps.retryDelayMs || 250,
      sleep: deps.sleep,
      headers: {
        apikey: config.publishableKey,
        Accept: 'application/json'
      }
    };

    function get(action) {
      return requestJson(config.apiBase + '?action=' + action, options);
    }

    return get('health').then(function (healthPayload) {
      var health = contract.validateHealth(healthPayload);
      if (!health || health.ok !== true) {
        return { state: 'error', error: fail((health && health.code) || 'HEALTH_INVALID',
          (health && health.message) || 'Catalog health validation failed.') };
      }
      if (health.published === false) {
        return { state: 'unpublished', error: fail('CATALOG_NOT_PUBLISHED', 'No published menu is available yet.') };
      }
      return get('catalog').then(function (catalogPayload) {
        var result = validateCatalogEnvelope(catalogPayload, health, contract);
        if (!result.ok) return { state: 'error', error: result };
        return { state: 'ready', snapshot: result.snapshot, versionId: health.versionId, databaseNow: result.databaseNow };
      });
    }).catch(function (error) {
      return {
        state: 'error',
        error: fail((error && error.code) || 'CATALOG_LOAD_FAILED',
          (error && error.message) || 'Published menu could not be verified.')
      };
    });
  }

  var api = {
    MAX_RESPONSE_BYTES: MAX_RESPONSE_BYTES,
    requestJson: requestJson,
    validateCatalogEnvelope: validateCatalogEnvelope,
    load: load
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlameChickCatalogV3Client = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
