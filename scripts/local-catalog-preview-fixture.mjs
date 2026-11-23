#!/usr/bin/env node
'use strict';

/*
 * Local-only synthetic catalog preview server.
 *
 * This file lives outside apps/flame-chick-website because that directory is
 * the Vercel project root. It serves a transformed copy of catalog-preview.html
 * and synthetic fixture JSON. It deliberately does not load config.js, contact
 * Supabase, serve index.html, or expose order/customer APIs.
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSnapshot } = require('../tests/fixtures/catalog-v3-fixture.cjs');
const contract = require('../apps/flame-chick-website/js/catalog-v3.js');

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEBSITE_ROOT = path.join(REPO_ROOT, 'apps', 'flame-chick-website');
const FIXTURE_DATABASE_NOW = '2026-11-23T10:00:00.000Z';
const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
});

const STATIC_FILES = new Map([
  ['/css/catalog-preview.css', path.join(WEBSITE_ROOT, 'css', 'catalog-preview.css')],
  ['/assets/flame-chick-logo.svg', path.join(WEBSITE_ROOT, 'assets', 'flame-chick-logo.svg')],
  ['/js/catalog-v3.js', path.join(WEBSITE_ROOT, 'js', 'catalog-v3.js')],
  ['/js/catalog-v3-client.js', path.join(WEBSITE_ROOT, 'js', 'catalog-v3-client.js')],
  ['/js/branch-fulfilment-v3.js', path.join(WEBSITE_ROOT, 'js', 'branch-fulfilment-v3.js')],
  ['/js/catalog-v3-view.js', path.join(WEBSITE_ROOT, 'js', 'catalog-v3-view.js')],
  ['/js/catalog-v3-deal-view.js', path.join(WEBSITE_ROOT, 'js', 'catalog-v3-deal-view.js')],
  ['/js/catalog-v3-deal-configurator.js', path.join(WEBSITE_ROOT, 'js', 'catalog-v3-deal-configurator.js')],
  ['/js/catalog-v3-preview.js', path.join(WEBSITE_ROOT, 'js', 'catalog-v3-preview.js')],
  ['/js/catalog-preview-page.js', path.join(WEBSITE_ROOT, 'js', 'catalog-preview-page.js')]
]);

const MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
});

function makeFixtureSnapshot() {
  const snapshot = createSnapshot();
  snapshot.databaseNow = FIXTURE_DATABASE_NOW;
  const checked = contract.validateSnapshot(snapshot);
  if (!checked || checked.ok !== true) {
    const details = checked && Array.isArray(checked.errors)
      ? checked.errors.map((item) => item.path + ':' + item.code).join(', ')
      : 'unknown V3 validation failure';
    throw new Error('Local fixture failed V3 validation: ' + details);
  }
  return snapshot;
}

function replaceExactlyOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0 || source.indexOf(search, first + search.length) >= 0) {
    throw new Error('Preview template changed; expected exactly one ' + label + ' token.');
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

async function buildLocalPreviewHtml() {
  let html = await readFile(path.join(WEBSITE_ROOT, 'catalog-preview.html'), 'utf8');
  html = replaceExactlyOnce(
    html,
    '<script src="js/config.js"></script>',
    '<script src="/__local-preview-config.js"></script>',
    'configuration script'
  );
  html = replaceExactlyOnce(
    html,
    '<script src="js/catalog-preview-page.js"></script>',
    '<script src="/__local-preview-loader.js"></script>\n  <script src="js/catalog-preview-page.js"></script>',
    'preview controller script'
  );
  html = html.replace('<a class="brand" href="index.html"', '<a class="brand" href="#page-title"');
  html = html.replace('<title>Flame Chick — Catalog Preview</title>', '<title>Flame Chick — Local Synthetic Fixture</title>');
  html = html.replace('<span class="preview-label">Private catalog preview</span>', '<span class="preview-label">LOCAL SYNTHETIC FIXTURE</span>');
  html = html.replace(
    'This page reads the currently published catalog. It is separate from the customer storefront and cannot accept or submit orders.',
    'This isolated local harness uses artificial test data only. It does not read the live menu, contact Supabase, or submit orders.'
  );
  html = html.replace(
    '<strong>Preview only</strong>\n        <span>No cart, checkout, payment, order submission or customer data collection is enabled here.</span>',
    '<strong>LOCAL TEST DATA ONLY</strong>\n        <span>Not published menu data. No Supabase, live storefront, cart, checkout, payment, order service or customer data is accessed.</span>'
  );
  html = html.replace(
    'Checking the published catalog is not started yet.',
    'Loading the synthetic fixture from this computer only.'
  );
  html = html.replace('Flame Chick · Internal catalog preview', 'Flame Chick · Local synthetic fixture');
  return html;
}

function localConfigScript(port) {
  return [
    "'use strict';",
    'window.FLAME_CHICK_CONFIG = Object.freeze({',
    "  apiBase: 'http://127.0.0.1:" + port + "/__blocked',",
    "  publishableKey: 'LOCAL_FIXTURE_ONLY',",
    '  requestTimeoutMs: 1000,',
    '  retries: 0',
    '});'
  ].join('\n');
}

function localLoaderScript() {
  return [
    '(function () {',
    "  'use strict';",
    '  window.__FLAME_CHICK_LOCAL_FIXTURE__ = true;',
    '  window.FlameChickCatalogV3Client = Object.freeze({',
    '    load: function () {',
    "      return fetch('/__local-preview-fixture.json', {",
    "        method: 'GET',",
    "        cache: 'no-store',",
    "        credentials: 'omit',",
    "        redirect: 'error',",
    "        headers: { Accept: 'application/json' }",
    '      }).then(function (response) {',
    '        if (!response || response.ok !== true) {',
    "          throw new Error('Local fixture server did not return the test catalog.');",
    '        }',
    '        return response.json();',
    '      }).then(function (snapshot) {',
    '        var validator = window.FlameChickCatalogV3;',
    '        var checked = validator && validator.validateSnapshot(snapshot);',
    '        if (!checked || checked.ok !== true ||',
    "            typeof snapshot.databaseNow !== 'string' ||",
    '            !validator.isIsoUtcDateTime(snapshot.databaseNow)) {',
    '          return {',
    "            state: 'error',",
    '            error: {',
    "              code: 'LOCAL_FIXTURE_INVALID',",
    "              message: 'Synthetic fixture did not pass the V3 contract.'",
    '            }',
    '          };',
    '        }',
    '        return {',
    "          state: 'ready',",
    '          snapshot: snapshot,',
    '          versionId: snapshot.versionId,',
    '          databaseNow: snapshot.databaseNow',
    '        };',
    '      }).catch(function () {',
    '        return {',
    "          state: 'error',",
    '          error: {',
    "            code: 'LOCAL_FIXTURE_UNAVAILABLE',",
    "            message: 'Could not load the synthetic fixture from this local computer.'",
    '          }',
    '        };',
    '      });',
    '    }',
    '  });',
    '})();'
  ].join('\n');
}

function pageControllerForFixture(source) {
  return replaceExactlyOnce(
    replaceExactlyOnce(
      source,
      'Published catalog verified',
      'Synthetic fixture validated',
      'connection success label'
    ),
    'The published catalog passed V3 validation.',
    'The synthetic fixture passed V3 validation.',
    'connection success message'
  );
}

function send(response, status, contentType, body, method) {
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body)
  });
  response.end(method === 'HEAD' ? undefined : body);
}

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::ffff:127.0.0.1';
}

function requestPort(request) {
  const hostHeader = request.headers.host || '';
  const match = /^127\.0\.0\.1:(\d{1,5})$/.exec(hostHeader);
  if (!match) return -1;
  const port = Number(match[1]);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : -1;
}

export function createLocalCatalogPreviewServer() {
  return http.createServer(async (request, response) => {
    try {
      if (!isLoopback(request.socket.remoteAddress) ||
          !isLoopback(request.socket.localAddress)) {
        send(response, 403, 'text/plain; charset=utf-8', 'Local access only.', request.method);
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        send(response, 405, 'text/plain; charset=utf-8', 'Method not allowed.', request.method);
        return;
      }

      const port = requestPort(request);
      if (port < 1) {
        send(response, 421, 'text/plain; charset=utf-8', 'Use the 127.0.0.1 local address.', request.method);
        return;
      }

      const url = new URL(request.url || '/', 'http://127.0.0.1:' + port);
      if (url.pathname === '/' || url.pathname === '/catalog-preview' || url.pathname === '/catalog-preview/') {
        const body = await buildLocalPreviewHtml();
        send(response, 200, 'text/html; charset=utf-8', body, request.method);
        return;
      }

      if (url.pathname === '/__local-preview-config.js') {
        send(response, 200, 'text/javascript; charset=utf-8', localConfigScript(port), request.method);
        return;
      }

      if (url.pathname === '/__local-preview-loader.js') {
        send(response, 200, 'text/javascript; charset=utf-8', localLoaderScript(), request.method);
        return;
      }

      if (url.pathname === '/__local-preview-fixture.json') {
        const body = JSON.stringify(makeFixtureSnapshot());
        send(response, 200, 'application/json; charset=utf-8', body, request.method);
        return;
      }

      const filePath = STATIC_FILES.get(url.pathname);
      if (filePath) {
        let body = await readFile(filePath, 'utf8');
        if (url.pathname === '/js/catalog-preview-page.js') body = pageControllerForFixture(body);
        const extension = path.extname(filePath).toLowerCase();
        send(response, 200, MIME_TYPES[extension] || 'text/plain; charset=utf-8', body, request.method);
        return;
      }

      send(response, 404, 'text/plain; charset=utf-8', 'Not found.', request.method);
    } catch (_) {
      send(response, 500, 'text/plain; charset=utf-8', 'Local fixture server error.', request.method);
    }
  });
}

export function startLocalCatalogPreviewServer(port = 4179) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new TypeError('Port must be an integer from 0 to 65535.');
  }
  const server = createLocalCatalogPreviewServer();
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    process.stdout.write('Local synthetic catalog fixture: http://127.0.0.1:' + address.port + '/catalog-preview\n');
    process.stdout.write('Stop with Ctrl+C. No production API or Supabase connection is used.\n');
  });
  return server;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const suppliedPort = process.env.PORT === undefined ? 4179 : Number(process.env.PORT);
  try {
    startLocalCatalogPreviewServer(suppliedPort);
  } catch (error) {
    process.stderr.write((error && error.message ? error.message : 'Could not start local preview server.') + '\n');
    process.exitCode = 1;
  }
}
