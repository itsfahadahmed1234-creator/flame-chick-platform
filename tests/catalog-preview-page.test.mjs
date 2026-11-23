import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../apps/flame-chick-website/', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('preview is a separate no-index entry and leaves the customer storefront untouched', async () => {
  const page = await read('catalog-preview.html');
  const storefront = await read('index.html');
  assert.match(page, /<meta name="robots" content="noindex,nofollow,noarchive">/);
  assert.match(page, /Private catalog preview/);
  assert.match(page, /No cart, checkout, payment, order submission/);
  assert.doesNotMatch(storefront, /catalog-preview\.html/);
});

test('preview loads only the V3 preview stack in dependency order', async () => {
  const page = await read('catalog-preview.html');
  const scripts = [...page.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);
  assert.deepEqual(scripts, [
    'js/config.js',
    'js/catalog-v3.js',
    'js/catalog-v3-client.js',
    'js/branch-fulfilment-v3.js',
    'js/catalog-v3-view.js',
    'js/catalog-v3-deal-view.js',
    'js/catalog-v3-deal-configurator.js',
    'js/catalog-v3-preview.js',
    'js/catalog-preview-page.js'
  ]);
  for (const file of scripts) {
    await read(file);
  }
});

test('preview page has explicit status, branch, product, deal and validation targets', async () => {
  const page = await read('catalog-preview.html');
  for (const id of [
    'connection-pill', 'connection-message', 'reload-catalog', 'branch-selector',
    'product-category-nav', 'product-catalog', 'products-empty',
    'deal-catalog', 'deals-empty', 'deal-configurator', 'deal-config-result',
    'close-deal-config'
  ]) {
    assert.match(page, new RegExp('id="' + id + '"'));
  }
});

test('preview renderer uses safe DOM text nodes and has no order or persistence calls', async () => {
  const source = await read('js/catalog-preview-page.js');
  for (const forbidden of [
    'innerHTML', 'insertAdjacentHTML', 'localStorage', 'sessionStorage',
    'service_role', 'orderApiBase', 'WA_PHONE', 'createOrder', 'submitOrder',
    'fetch(', 'XMLHttpRequest'
  ]) {
    assert.equal(source.includes(forbidden), false, 'unexpected preview capability: ' + forbidden);
  }
  assert.match(source, /textContent/);
  assert.match(source, /createDealConfigurator/);
  assert.match(source, /Validate preview choices/);
  assert.match(source, /No quote was requested and no order was created/);
});

test('product cards do not expose an add-to-cart operation or compute a combined total', async () => {
  const source = await read('js/catalog-preview-page.js');
  assert.match(source, /Validate preview choices/);
  assert.match(source, /Published unit price/);
  assert.doesNotMatch(source, /onAdd/);
  assert.doesNotMatch(source, /grandTotal/);
  assert.doesNotMatch(source, /cartTotal/);
  assert.doesNotMatch(source, /subtotal/);
  assert.doesNotMatch(source, /basePriceMinor/);
  assert.match(source, /showVariantBasePrice: false/);
});

test('single-variant product selector does not render a duplicate placeholder choice', async () => {
  const source = await read('js/catalog-preview-page.js');
  assert.match(source, /if \(product\.variants\.length > 1\)\s*\{\s*var placeholderOption/);
  assert.match(source, /if \(product\.variants\.length === 1\) variantSelect\.value = product\.variants\[0\]\.id/);
});

test('preview CSS has responsive product/deal layouts and explicitly hides legacy add controls', async () => {
  const css = await read('css/catalog-preview.css');
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /fc-menu-product-grid/);
  assert.match(css, /deal-grid/);
  assert.match(css, /\.fc-menu-add\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test('deal configurator supports preview labels without representing a partial base price as a final deal price', async () => {
  const source = await read('js/catalog-v3-deal-configurator.js');
  assert.match(source, /showVariantBasePrice !== false/);
  assert.match(source, /options\.completeButtonLabel/);
});
