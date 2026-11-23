import test from 'node:test';
import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { createLocalCatalogPreviewServer } from '../scripts/local-catalog-preview-fixture.mjs';
import contract from '../apps/flame-chick-website/js/catalog-v3.js';

async function withServer(run) {
  const server = createLocalCatalogPreviewServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(address.address, '127.0.0.1');
  const base = 'http://127.0.0.1:' + address.port;
  try {
    await run(base);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('local harness binds only to IPv4 loopback and labels the page synthetic', async () => {
  await withServer(async (base) => {
    const response = await fetch(base + '/catalog-preview');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const html = await response.text();
    assert.match(html, /LOCAL SYNTHETIC FIXTURE/);
    assert.match(html, /LOCAL TEST DATA ONLY/);
    assert.match(html, /artificial test data only/);
    assert.match(html, /__local-preview-config\.js/);
    assert.match(html, /__local-preview-loader\.js/);
    assert.doesNotMatch(html, /js\/config\.js/);
    assert.doesNotMatch(html, /supabase\.co/);
    assert.doesNotMatch(html, /publishable_89MQ/);
    assert.doesNotMatch(html, /index\.html/);
  });
});

test('local fixture is valid V3 synthetic data and has no production identifiers', async () => {
  await withServer(async (base) => {
    const response = await fetch(base + '/__local-preview-fixture.json', {
      headers: { Accept: 'application/json' }
    });
    assert.equal(response.status, 200);
    const snapshot = await response.json();
    const checked = contract.validateSnapshot(snapshot);
    assert.equal(checked.ok, true, JSON.stringify(checked.errors || []));
    assert.equal(snapshot.databaseNow, '2026-11-23T10:00:00.000Z');
    assert.equal(snapshot.settings.restaurant_name, 'Flame Chick');
    assert.equal(snapshot.branches.length, 1);
    assert.equal(snapshot.products.length, 1);
    assert.equal(snapshot.deals.length, 1);
    assert.equal(snapshot.scheduleSets[0].windows.length, 7);
    assert.deepEqual(snapshot.scheduleSets[0].windows.map((window) => window.weekdayIso), [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(snapshot.restaurantId, '14000000-0000-4000-8000-000000000001');
    assert.equal(snapshot.publicationId, '15000000-0000-4000-8000-000000000001');
  });
});

test('local harness replaces production network configuration and client loader', async () => {
  await withServer(async (base) => {
    const [configResponse, loaderResponse, pageControllerResponse] = await Promise.all([
      fetch(base + '/__local-preview-config.js'),
      fetch(base + '/__local-preview-loader.js'),
      fetch(base + '/js/catalog-preview-page.js')
    ]);
    assert.equal(configResponse.status, 200);
    assert.equal(loaderResponse.status, 200);
    assert.equal(pageControllerResponse.status, 200);
    const config = await configResponse.text();
    const loader = await loaderResponse.text();
    const pageController = await pageControllerResponse.text();
    assert.match(config, /LOCAL_FIXTURE_ONLY/);
    assert.match(config, /LOCAL_FIXTURE_ONLY_DISABLED/);
    assert.doesNotMatch(config, /https?:\/\//);
    assert.doesNotMatch(config, /supabase\.co/);
    assert.match(loader, /__local-preview-fixture\.json/);
    assert.match(loader, /validateSnapshot/);
    assert.match(pageController, /Synthetic fixture validated/);
    assert.match(pageController, /The synthetic fixture passed V3 validation/);
  });
});

test('only an explicit preview asset allowlist is served; production config and storefront are denied', async () => {
  await withServer(async (base) => {
    for (const route of ['/js/config.js', '/index.html', '/__blocked', '/robots.txt', '/../../.env']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 404, route);
    }
    const css = await fetch(base + '/css/catalog-preview.css');
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);
    const notListed = await fetch(base + '/js/staging-guard.js');
    assert.equal(notListed.status, 404);
  });
});

test('local harness rejects a host header that does not match its bound port', async () => {
  await withServer(async (base) => {
    const target = new URL(base + '/catalog-preview');
    const response = await new Promise((resolve, reject) => {
      const request = httpRequest({
        hostname: target.hostname,
        port: Number(target.port),
        path: target.pathname,
        method: 'GET',
        headers: { Host: '127.0.0.1:65500' }
      }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, body, headers: res.headers }));
      });
      request.once('error', reject);
      request.end();
    });
    assert.equal(response.statusCode, 421);
    assert.match(response.body, /assigned port/);
  });
});

test('local harness rejects state-changing methods and emits security headers', async () => {
  await withServer(async (base) => {
    const response = await fetch(base + '/catalog-preview', { method: 'POST' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  });
});
