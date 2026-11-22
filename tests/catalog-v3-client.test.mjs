import test from 'node:test';
import assert from 'node:assert/strict';
import client from '../apps/flame-chick-website/js/catalog-v3-client.js';
import contract from '../apps/flame-chick-website/js/catalog-v3.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSnapshot } = require('./fixtures/catalog-v3-fixture.cjs');

const config = {
  apiBase: 'https://example.supabase.co/functions/v1/flame-chick-catalog',
  publishableKey: 'sb_publishable_test_key',
  requestTimeoutMs: 1000,
  retries: 0
};

function healthFor(snapshot, published = true) {
  return {
    ok: true,
    data: {
      schemaVersion: 3,
      published,
      publicationId: published ? snapshot.publicationId : null,
      publicationNumber: published ? snapshot.publicationNumber : null,
      draftRevision: published ? snapshot.draftRevision : null,
      snapshotSha256: published ? snapshot.snapshotSha256 : null,
      publishedAt: published ? snapshot.publishedAt : null
    }
  };
}

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null },
    text: async () => JSON.stringify(value)
  };
}

function makeFetch(snapshot, options = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('?action=health')) {
      if (options.healthError) throw options.healthError;
      return jsonResponse(healthFor(snapshot, options.published !== false), options.healthStatus || 200);
    }
    if (url.endsWith('?action=catalog')) {
      if (options.catalogError) throw options.catalogError;
      const data = { ...(options.catalogData || snapshot), databaseNow: (options.catalogData || snapshot).databaseNow || '2026-11-23T12:00:00.123456Z' };
      return jsonResponse(options.catalogPayload || { ok: true, data }, options.catalogStatus || 200);
    }
    throw new Error('Unexpected URL: ' + url);
  };
  return { fetchImpl, calls };
}

test('loads a valid current V3 publication after health verification', async () => {
  const snapshot = createSnapshot();
  const mock = makeFetch(snapshot);
  const result = await client.load({ config, contract, fetchImpl: mock.fetchImpl });
  assert.equal(result.state, 'ready');
  assert.equal(result.snapshot.publicationId, snapshot.publicationId);
  assert.equal(result.versionId, snapshot.versionId);
  assert.equal(result.databaseNow, '2026-11-23T12:00:00.123456Z');
  assert.equal(mock.calls.length, 2);
  for (const call of mock.calls) {
    assert.equal(call.init.method, 'GET');
    assert.equal(call.init.cache, 'no-store');
    assert.equal(call.init.redirect, 'error');
    assert.equal(call.init.headers.apikey, config.publishableKey);
    assert.equal('Authorization' in call.init.headers, false);
  }
});

test('unpublished health returns closed state without requesting catalog', async () => {
  const snapshot = createSnapshot();
  const mock = makeFetch(snapshot, { published: false });
  const result = await client.load({ config, contract, fetchImpl: mock.fetchImpl });
  assert.equal(result.state, 'unpublished');
  assert.equal(mock.calls.length, 1);
});

test('health transport failure never falls back to cached or unverified data', async () => {
  const snapshot = createSnapshot();
  const mock = makeFetch(snapshot, { healthError: new Error('offline') });
  const result = await client.load({ config, contract, fetchImpl: mock.fetchImpl, retries: 0 });
  assert.equal(result.state, 'error');
  assert.equal(result.error.code, 'NETWORK');
  assert.equal(mock.calls.length, 1);
});

test('rejects catalog metadata that differs from the verified health publication', async () => {
  const snapshot = createSnapshot();
  const changed = { ...snapshot, publicationNumber: snapshot.publicationNumber + 1 };
  const mock = makeFetch(snapshot, { catalogData: changed });
  const result = await client.load({ config, contract, fetchImpl: mock.fetchImpl });
  assert.equal(result.state, 'error');
  assert.equal(result.error.code, 'PUBLICATION_MISMATCH');
});

test('rejects malformed catalog envelopes and unsupported schema', async () => {
  const snapshot = createSnapshot();
  const badEnvelope = makeFetch(snapshot, { catalogPayload: { ok: true, data: [] } });
  const envelopeResult = await client.load({ config, contract, fetchImpl: badEnvelope.fetchImpl });
  assert.equal(envelopeResult.state, 'error');
  assert.equal(envelopeResult.error.code, 'CATALOG_ENVELOPE_INVALID');

  const unsupported = { ...snapshot, schemaVersion: 2 };
  const badSchema = makeFetch(snapshot, { catalogData: unsupported });
  const schemaResult = await client.load({ config, contract, fetchImpl: badSchema.fetchImpl });
  assert.equal(schemaResult.state, 'error');
  assert.equal(schemaResult.error.code, 'SCHEMA_UNSUPPORTED');
});

test('does not retry permanent HTTP errors and retries transient server errors once', async () => {
  let permanentCalls = 0;
  const permanent = await client.requestJson('https://example.test/catalog', {
    fetchImpl: async () => { permanentCalls++; return jsonResponse({}, 404); },
    retries: 2,
    sleep: async () => {}
  }).catch(error => error);
  assert.equal(permanent.code, 'HTTP_404');
  assert.equal(permanentCalls, 1);

  let transientCalls = 0;
  const transient = await client.requestJson('https://example.test/catalog', {
    fetchImpl: async () => {
      transientCalls++;
      return transientCalls === 1 ? jsonResponse({}, 503) : jsonResponse({ ok: true });
    },
    retries: 1,
    sleep: async () => {}
  });
  assert.deepEqual(transient, { ok: true });
  assert.equal(transientCalls, 2);
});

test('rejects responses larger than the bounded response size', async () => {
  const error = await client.requestJson('https://example.test/catalog', {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => ' '.repeat(client.MAX_RESPONSE_BYTES + 1)
    }),
    retries: 0
  }).catch(value => value);
  assert.equal(error.code, 'RESPONSE_TOO_LARGE');
});

test('rejects non-HTTPS configuration and missing V3 validator', async () => {
  const insecure = await client.load({
    config: { ...config, apiBase: 'http://example.test' },
    contract,
    fetchImpl: async () => { throw new Error('must not call'); }
  });
  assert.equal(insecure.state, 'error');
  assert.equal(insecure.error.code, 'CONFIG_INVALID');

  const missingContract = await client.load({ config, contract: {}, fetchImpl: async () => {} });
  assert.equal(missingContract.state, 'error');
  assert.equal(missingContract.error.code, 'CONTRACT_UNAVAILABLE');
});

test('rejects a catalog response without trusted database time', async () => {
  const snapshot = createSnapshot();
  const mock = makeFetch(snapshot, { catalogData: { ...snapshot, databaseNow: 'not-a-time' } });
  const result = await client.load({ config, contract, fetchImpl: mock.fetchImpl });
  assert.equal(result.state, 'error');
  assert.equal(result.error.code, 'DATABASE_TIME_INVALID');
});
