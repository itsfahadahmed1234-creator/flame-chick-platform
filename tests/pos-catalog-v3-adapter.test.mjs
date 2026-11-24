import test from 'node:test';
import assert from 'node:assert/strict';
import contract from '../apps/flame-chick-pos/catalog-v3.js';
import dealView from '../apps/flame-chick-pos/catalog-v3-deal-view.js';
import adapter from '../apps/flame-chick-pos/catalog-v3-adapter.js';
import fixture from './fixtures/catalog-v3-fixture.cjs';
import { readFileSync } from 'node:fs';

const { IDS, createSnapshot } = fixture;
const now = '2026-11-23T12:00:00.000Z';

test('POS bundles the exact canonical V3 runtime locally and loads it before the adapter', () => {
  const canonicalContract = readFileSync('apps/flame-chick-website/js/catalog-v3.js', 'utf8');
  const posContract = readFileSync('apps/flame-chick-pos/catalog-v3.js', 'utf8');
  const canonicalDealView = readFileSync('apps/flame-chick-website/js/catalog-v3-deal-view.js', 'utf8');
  const posDealView = readFileSync('apps/flame-chick-pos/catalog-v3-deal-view.js', 'utf8');
  const posHtml = readFileSync('apps/flame-chick-pos/index.html', 'utf8');

  assert.equal(posContract, canonicalContract, 'POS V3 contract bundle drifted from canonical website module.');
  assert.equal(posDealView, canonicalDealView, 'POS V3 deal-view bundle drifted from canonical website module.');

  const contractScript = posHtml.indexOf('<script src="./catalog-v3.js"></script>');
  const dealViewScript = posHtml.indexOf('<script src="./catalog-v3-deal-view.js"></script>');
  const adapterScript = posHtml.indexOf('<script src="./catalog-v3-adapter.js"></script>');
  assert.ok(contractScript >= 0 && dealViewScript > contractScript && adapterScript > dealViewScript,
    'POS must load local V3 contract and deal modules before its adapter.');
  assert.doesNotMatch(posHtml, /\.\.\/flame-chick-website\/js\/catalog-v3(?:-deal-view)?\.js/,
    'Standalone POS must not reference runtime assets outside its Vercel project root.');
});



function adapt(snapshot = createSnapshot(), options = {}) {
  snapshot.databaseNow = now;
  return adapter.adapt(snapshot, { contract, dealView, ...options });
}

test('POS renders the V3 deal projection rather than raw snapshot deal rows', () => {
  const html = readFileSync('apps/flame-chick-pos/index.html', 'utf8');
  assert.match(html, /let catalogSnapshot=null,posDeals=\[\];/);
  assert.match(html, /posDeals=adaptFlameChickCatalog\(saved\)\.deals\|\|\[\]/);
  assert.match(html, /posDeals=adapted\.deals\|\|\[\]/);
  assert.match(html, /\(posDeals\|\|\[\]\)\.filter\(d=>d\.Active===true/);
  assert.doesNotMatch(html, /catalogSnapshot\?\.deals/,
    'Raw V3 snapshot deal rows do not have the legacy POS display projection fields.');
});

test('projects published V3 products and category IDs without legacy IDs', () => {
  const result = adapt();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.schemaVersion, 3);
  assert.equal(result.branchId, IDS.branch);
  assert.equal(result.menu.length, 2);
  assert.equal(result.menu[0].ID, IDS.variant);
  assert.equal(result.menu[0].ProductID, IDS.product);
  assert.equal(result.menu[0].CategoryID, IDS.menuCategory);
  assert.equal(result.menu[0].Price, 550);
  assert.equal(result.menu[0].SchemaVersion, 3);
  assert.equal(result.menu.some(row => row.LegacyProductID || row.LegacyVariantID), false);
});

test('uses branch availability and only exposes sellable priced variants', () => {
  const snapshot = createSnapshot();
  snapshot.branchVariantAvailability.push({
    branchId: IDS.branch, productId: IDS.product,
    productVariantId: IDS.variant, isAvailable: false
  });
  const result = adapt(snapshot);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.menu.some(row => row.ID === IDS.variant), false);
  assert.equal(result.menu.some(row => row.ID === IDS.drinkVariant), true);
});

test('does not convert null prices or non-standalone components into standalone POS products', () => {
  const snapshot = createSnapshot();
  snapshot.productVariants[0].price = null;
  snapshot.productVariants[0].standaloneSellable = false;
  const result = adapt(snapshot);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.menu.some(row => row.ID === IDS.variant), false);
});

test('uses the V3 deal view model and exact deal, variant and component option IDs', () => {
  const result = adapt();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.deals.length, 1);
  const deal = result.deals[0];
  assert.equal(deal.DealID, IDS.deal);
  assert.equal(deal.CategoryID, IDS.dealCategory);
  assert.equal(deal.variants[0].id, IDS.dealVariant);
  assert.equal(deal.variants[0].groups[0].options[0].id, IDS.componentOption);
  assert.equal(deal.variants[0].groups[1].options[0].id, IDS.drinkComponentOption);
  assert.equal(deal.BundlePrice, 750);
});

test('marks deals unavailable when schedule, branch or a required component is unavailable', () => {
  const snapshot = createSnapshot();
  snapshot.branchDealAvailability.push({
    branchId: IDS.branch, dealId: IDS.deal, isAvailable: false
  });
  const result = adapt(snapshot);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.deals.length, 1);
  assert.equal(result.deals[0].Available, false);
  assert.equal(result.deals[0].BranchAvailable, false);
});

test('requires explicit branch selection when the published catalog has multiple branches', () => {
  const snapshot = createSnapshot();
  snapshot.branches.push({ ...snapshot.branches[0], branchId: '16000000-0000-4000-8000-000000000001' });
  const result = adapt(snapshot);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CATALOG_BRANCH_REQUIRED');
});

test('rejects V2 snapshots and missing database time rather than falling back to old catalog data', () => {
  const v2 = createSnapshot();
  v2.schemaVersion = 2;
  assert.equal(adapt(v2).code, 'CATALOG_SCHEMA_UNSUPPORTED');
  const noTime = createSnapshot();
  assert.equal(adapter.adapt(noTime, { contract, dealView }).code, 'CATALOG_DATABASE_TIME_REQUIRED');
});
