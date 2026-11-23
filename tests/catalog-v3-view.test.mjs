import test from 'node:test';
import assert from 'node:assert/strict';
import contract from '../apps/flame-chick-website/js/catalog-v3.js';
import view from '../apps/flame-chick-website/js/catalog-v3-view.js';
import fixture from './fixtures/catalog-v3-fixture.cjs';

const { IDS, createSnapshot } = fixture;

test('builds menu categories and products only from validated stable IDs', () => {
  const snapshot = createSnapshot();
  const result = view.buildMenuViewModel(snapshot, { fulfilmentType: 'delivery' }, contract);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.schemaVersion, 3);
  assert.equal(result.branchId, IDS.branch);
  assert.deepEqual(result.categories.map(category => category.id), [IDS.menuCategory, IDS.drinkCategory]);
  const burgerCategory = result.categories.find(category => category.id === IDS.menuCategory);
  const drinkCategory = result.categories.find(category => category.id === IDS.drinkCategory);
  assert.ok(burgerCategory);
  assert.ok(drinkCategory);
  assert.equal(burgerCategory.products[0].id, IDS.product);
  assert.equal(burgerCategory.products[0].variants[0].id, IDS.variant);
  assert.equal(burgerCategory.products[0].variants[0].priceMinor, 55000);
  assert.equal(drinkCategory.products[0].id, IDS.drinkProduct);
  assert.equal(drinkCategory.products[0].variants[0].id, IDS.drinkVariant);
});

test('requires explicit branch choice when multiple branches exist', () => {
  const snapshot = createSnapshot();
  snapshot.branches.push({
    ...snapshot.branches[0],
    branchId: '16000000-0000-4000-8000-000000000001',
    branchCode: 'second',
    name: 'Second Branch'
  });
  const result = view.buildMenuViewModel(snapshot, {}, contract);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'BRANCH_SELECTION_REQUIRED');
});

test('rejects invalid fulfilment and marks disabled fulfilment as not orderable', () => {
  const snapshot = createSnapshot();
  assert.equal(view.buildMenuViewModel(snapshot, { fulfilmentType: 'courier' }, contract).code, 'FULFILMENT_INVALID');
  snapshot.branches[0].websiteDeliveryEnabled = false;
  const result = view.buildMenuViewModel(snapshot, { fulfilmentType: 'delivery' }, contract);
  assert.equal(result.ok, true);
  assert.equal(result.orderingEnabled, false);
});

test('omits unavailable products and variants using branch overlays', () => {
  const snapshot = createSnapshot();
  snapshot.branchProductAvailability.push({
    branchId: IDS.branch,
    productId: IDS.product,
    isAvailable: false
  });
  const productResult = view.buildMenuViewModel(snapshot, {}, contract);
  assert.equal(productResult.ok, true);
  assert.deepEqual(productResult.categories.map(category => category.id), [IDS.drinkCategory]);
  assert.equal(productResult.categories[0].products[0].id, IDS.drinkProduct);

  const variantSnapshot = createSnapshot();
  variantSnapshot.branchVariantAvailability.push({
    branchId: IDS.branch,
    productId: IDS.product,
    productVariantId: IDS.variant,
    isAvailable: false
  });
  const variantResult = view.buildMenuViewModel(variantSnapshot, {}, contract);
  assert.equal(variantResult.ok, true);
  assert.deepEqual(variantResult.categories.map(category => category.id), [IDS.drinkCategory]);
  assert.equal(variantResult.categories[0].products[0].id, IDS.drinkProduct);
});

test('retains multiple variants without silently selecting one', () => {
  const snapshot = createSnapshot();
  const secondVariantId = '19000000-0000-4000-8000-000000000001';
  snapshot.productVariants.push({
    ...snapshot.productVariants[0],
    variantId: secondVariantId,
    sizeKey: 'LARGE',
    sizeLabel: 'Large',
    price: 750,
    sortOrder: 2
  });
  snapshot.modifierPriceRules.push({
    ...snapshot.modifierPriceRules[0],
    modifierPriceRuleId: '1a000000-0000-4000-8000-000000000001',
    productVariantId: secondVariantId,
    price: 100
  });
  const result = view.buildMenuViewModel(snapshot, {}, contract);
  assert.equal(result.ok, true);
  assert.equal(result.categories[0].products[0].variants.length, 2);
  assert.deepEqual(result.categories[0].products[0].variants.map(v => v.priceMinor), [55000, 75000]);
});

test('exposes modifier IDs and exact variant price map without calculating a cart total', () => {
  const result = view.buildMenuViewModel(createSnapshot(), {}, contract);
  const group = result.categories[0].products[0].modifierGroups[0];
  assert.equal(group.id, IDS.modifierGroup);
  assert.equal(group.modifiers[0].id, IDS.modifier);
  assert.equal(group.modifiers[0].pricesByVariantId[IDS.variant], 8000);
  assert.equal(Object.hasOwn(result, 'total'), false);
});

test('rejects invalid snapshots and missing validator instead of falling back to legacy data', () => {
  const bad = createSnapshot();
  bad.products[0].nameEn = '<img src=x onerror=alert(1)>';
  const invalid = view.buildMenuViewModel(bad, {}, { validateSnapshot: () => ({ ok: false, code: 'SNAPSHOT_INVALID' }) });
  assert.equal(invalid.ok, false);
  assert.equal(view.buildMenuViewModel(createSnapshot(), {}, {}).code, 'CONTRACT_UNAVAILABLE');
});

test('excludes variants that are not sellable as standalone menu items', () => {
  const snapshot = createSnapshot();
  snapshot.productVariants[0].standaloneSellable = false;
  const result = view.buildMenuViewModel(snapshot, {}, contract);
  assert.equal(result.ok, true);
  assert.deepEqual(result.categories.map(category => category.id), [IDS.drinkCategory]);
  assert.equal(result.categories[0].products[0].id, IDS.drinkProduct);
});

test('formats integer minor units with the publication currency', () => {
  const formatted = view.formatMoney(55000, 'PKR', 'en-PK');
  assert.match(formatted, /550/);
  assert.match(formatted, /PKR|Rs/);
});
