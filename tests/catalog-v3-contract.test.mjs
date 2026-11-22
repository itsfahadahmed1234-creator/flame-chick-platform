

import test from 'node:test';
import assert from 'node:assert/strict';
import contract from '../apps/flame-chick-website/js/catalog-v3.js';
import fixture from './fixtures/catalog-v3-fixture.cjs';
const { IDS, createSnapshot } = fixture;

test('accepts a complete, internally consistent V3 publication', () => {
  const result = contract.validateSnapshot(createSnapshot());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.schemaVersion, 3);
  assert.equal(result.money.minorUnits(550), 55000);
  assert.equal(result.money.minorUnits(0), 0);
});

test('rejects V2 and unknown schema versions without attempting conversion', () => {
  for (const version of [2, 4, '3', null]) {
    const snapshot = createSnapshot();
    snapshot.schemaVersion = version;
    const result = contract.validateSnapshot(snapshot);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => error.code === 'SCHEMA_UNSUPPORTED' || error.path === '$.schemaVersion'));
  }
});

test('rejects unknown and missing fields to detect schema drift', () => {
  const unknown = createSnapshot();
  unknown.unreviewedField = true;
  assert.equal(contract.validateSnapshot(unknown).ok, false);

  const missing = createSnapshot();
  delete missing.productVariants[0].price;
  assert.equal(contract.validateSnapshot(missing).ok, false);
});

test('rejects duplicate identifiers and duplicate relationships', () => {
  const duplicateId = createSnapshot();
  duplicateId.products.push({ ...duplicateId.products[0] });
  assert.ok(contract.validateSnapshot(duplicateId).errors.some(e => e.code === 'DUPLICATE_ID'));

  const duplicateRelation = createSnapshot();
  duplicateRelation.modifierGroupAssignments.push({
    ...duplicateRelation.modifierGroupAssignments[0],
    assignmentId: '71000000-0000-4000-8000-000000000001'
  });
  assert.ok(contract.validateSnapshot(duplicateRelation).errors.some(e => e.code === 'DUPLICATE_RELATION'));
});

test('rejects cross-product, cross-deal and missing references', () => {
  const badVariant = createSnapshot();
  badVariant.dealComponentOptions[0].productVariantId = '40000000-0000-4000-8000-000000000099';
  assert.equal(contract.validateSnapshot(badVariant).ok, false);

  const badDeal = createSnapshot();
  badDeal.dealVariantComponentOptions[0].dealId = 'b0000000-0000-4000-8000-000000000099';
  assert.equal(contract.validateSnapshot(badDeal).ok, false);

  const badCategory = createSnapshot();
  badCategory.products[0].categoryId = IDS.dealCategory;
  assert.equal(contract.validateSnapshot(badCategory).ok, false);
});

test('preserves null versus zero and rejects unsafe monetary precision', () => {
  const snapshot = createSnapshot();
  snapshot.deals[0].legacyBundlePrice = null;
  snapshot.dealVariantComponentOptions[0].unitSurcharge = 0;
  assert.equal(contract.validateSnapshot(snapshot).ok, true);
  assert.equal(contract.minorUnits(0), 0);
  assert.equal(contract.minorUnits(1.005), null);
  assert.equal(contract.minorUnits(-1), null);
  assert.equal(contract.minorUnits(NaN), null);
  assert.equal(contract.minorUnits(Infinity), null);
});

test('validates modifier selection bounds and exact variant pricing references', () => {
  const badBounds = createSnapshot();
  badBounds.modifierGroups[0].selectionMode = 'ONE_REQUIRED';
  badBounds.modifierGroups[0].minSelect = 0;
  assert.equal(contract.validateSnapshot(badBounds).ok, false);

  const wrongMode = createSnapshot();
  wrongMode.modifiers[0].priceMode = 'FIXED';
  assert.ok(contract.validateSnapshot(wrongMode).errors.some(e => e.code === 'MODIFIER_PRICE_MODE_INVALID'));
});

test('validates deal pricing treatment and component limits', () => {
  const fixedStandalone = createSnapshot();
  fixedStandalone.dealVariantComponentOptions[0].pricingTreatment = 'STANDALONE';
  assert.equal(contract.validateSnapshot(fixedStandalone).ok, false);

  const surcharge = createSnapshot();
  surcharge.dealVariantComponentOptions[0].pricingTreatment = 'SURCHARGE';
  surcharge.dealVariantComponentOptions[0].unitSurcharge = 35;
  assert.equal(contract.validateSnapshot(surcharge).ok, true);

  const badGroup = createSnapshot();
  badGroup.dealComponentGroups[0].minUnits = 2;
  badGroup.dealComponentGroups[0].maxUnits = 1;
  assert.equal(contract.validateSnapshot(badGroup).ok, false);
});

test('validates IANA timezone and weekly/one-off schedule shapes', () => {
  const badZone = createSnapshot();
  badZone.settings.timezone = 'Mars/Olympus';
  assert.equal(contract.validateSnapshot(badZone).ok, false);

  const badWindow = createSnapshot();
  badWindow.scheduleSets[0].windows[0].weekdayIso = 8;
  assert.equal(contract.validateSnapshot(badWindow).ok, false);

  const overnight = createSnapshot();
  overnight.scheduleSets[0].windows[0].isAllDay = false;
  overnight.scheduleSets[0].windows[0].localStart = '22:00:00';
  overnight.scheduleSets[0].windows[0].localEnd = '02:00:00';
  assert.equal(contract.validateSnapshot(overnight).ok, true);
});

test('validates sparse branch availability references and duplicate overrides', () => {
  const badBranch = createSnapshot();
  badBranch.branchProductAvailability.push({
    branchId: '10000000-0000-4000-8000-000000000099',
    productId: IDS.product,
    isAvailable: true
  });
  assert.equal(contract.validateSnapshot(badBranch).ok, false);

  const duplicate = createSnapshot();
  const override = { branchId: IDS.branch, productId: IDS.product, isAvailable: true };
  duplicate.branchProductAvailability.push({ ...override }, { ...override });
  assert.ok(contract.validateSnapshot(duplicate).errors.some(e => e.code === 'DUPLICATE_RELATION'));
});

test('fails closed when delivery areas or promotions are unexpectedly populated', () => {
  const snapshot = createSnapshot();
  snapshot.deliveryAreas.push({ id: 'not-yet-supported' });
  assert.equal(contract.validateSnapshot(snapshot).ok, false);
});

test('rejects oversized snapshots before relationship processing', () => {
  const snapshot = createSnapshot();
  snapshot.settings.restaurant_name = 'x'.repeat(4 * 1024 * 1024 + 8192);
  const result = contract.validateSnapshot(snapshot);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SNAPSHOT_TOO_LARGE');
});

test('requires a BY_SIZE price rule for every assigned product variant', () => {
  const snapshot = createSnapshot();
  snapshot.modifierPriceRules = [];
  assert.ok(contract.validateSnapshot(snapshot).errors.some(e => e.code === 'BY_SIZE_PRICE_RULE_MISSING'));
});

test('rejects deal variants whose allowed choices cannot meet required component units', () => {
  const snapshot = createSnapshot();
  snapshot.dealVariantComponentOptions = [];
  assert.ok(contract.validateSnapshot(snapshot).errors.some(e => e.code === 'DEAL_REQUIRED_CHOICES_UNSATISFIABLE'));
});

test('allows standalone deal components only for standalone-sellable variants and base-plus pricing', () => {
  const allowed = createSnapshot();
  allowed.dealVariants[0].pricingMode = 'BASE_PLUS_SELECTED_ITEMS';
  allowed.dealVariantComponentOptions[0].pricingTreatment = 'STANDALONE';
  allowed.productVariants[0].standaloneSellable = true;
  assert.equal(contract.validateSnapshot(allowed).ok, true);

  const forbidden = createSnapshot();
  forbidden.dealVariants[0].pricingMode = 'BASE_PLUS_SELECTED_ITEMS';
  forbidden.dealVariantComponentOptions[0].pricingTreatment = 'STANDALONE';
  forbidden.productVariants[0].standaloneSellable = false;
  assert.ok(contract.validateSnapshot(forbidden).errors.some(e => e.code === 'STANDALONE_VARIANT_INVALID'));
});

test('rejects impossible calendar dates in publication timestamps', () => {
  const snapshot = createSnapshot();
  snapshot.publishedAt = '2026-02-31T10:00:00.000Z';
  assert.equal(contract.validateSnapshot(snapshot).ok, false);
});

test('optional deal component groups may have no options; required groups must be satisfiable', () => {
  const optional = createSnapshot();
  optional.dealComponentGroups[0].minUnits = 0;
  optional.dealVariantComponentOptions = [];
  assert.equal(contract.validateSnapshot(optional).ok, true);

  const required = createSnapshot();
  required.dealVariantComponentOptions = [];
  assert.ok(contract.validateSnapshot(required).errors.some(e => e.code === 'DEAL_REQUIRED_CHOICES_UNSATISFIABLE'));
});

test('branch availability overrides never reactivate globally unavailable products or variants', () => {
  const snapshot = createSnapshot();
  snapshot.branchProductAvailability.push({
    branchId: IDS.branch, productId: IDS.product, isAvailable: true
  });
  snapshot.products[0].available = false;
  assert.equal(contract.resolveProductAvailability(snapshot, IDS.branch, IDS.product), false);

  snapshot.products[0].available = true;
  snapshot.branchProductAvailability[0].isAvailable = false;
  assert.equal(contract.resolveProductAvailability(snapshot, IDS.branch, IDS.product), false);

  snapshot.branchProductAvailability[0].isAvailable = true;
  snapshot.branchVariantAvailability.push({
    branchId: IDS.branch, productId: IDS.product,
    productVariantId: IDS.variant, isAvailable: true
  });
  snapshot.productVariants[0].available = false;
  assert.equal(contract.resolveVariantAvailability(snapshot, IDS.branch, IDS.product, IDS.variant), false);
});

test('branch ordering flags are enforced independently for delivery and pickup', () => {
  const snapshot = createSnapshot();
  assert.equal(contract.isBranchOrderingEnabled(snapshot, IDS.branch, 'delivery'), true);
  assert.equal(contract.isBranchOrderingEnabled(snapshot, IDS.branch, 'pickup'), true);
  snapshot.branches[0].websiteDeliveryEnabled = false;
  assert.equal(contract.isBranchOrderingEnabled(snapshot, IDS.branch, 'delivery'), false);
  assert.equal(contract.isBranchOrderingEnabled(snapshot, IDS.branch, 'pickup'), true);
  snapshot.branches[0].websiteOrderingEnabled = false;
  assert.equal(contract.isBranchOrderingEnabled(snapshot, IDS.branch, 'pickup'), false);
});

test('enforces branch code format from the database contract', () => {
  const snapshot = createSnapshot();
  snapshot.branches[0].branchCode = 'MAIN BRANCH';
  assert.equal(contract.validateSnapshot(snapshot).ok, false);
});

test('requires every published product to have a purchasable variant', () => {
  const snapshot = createSnapshot();
  snapshot.productVariants = [];
  assert.ok(contract.validateSnapshot(snapshot).errors.some(e => e.code === 'PRODUCT_VARIANT_REQUIRED'));
});

test('validates health response for unpublished and published catalogs', () => {
  const empty = contract.validateHealth({ ok: true, data: { schemaVersion: 3, published: false } });
  assert.equal(empty.ok, true);
  assert.equal(empty.published, false);

  const published = contract.validateHealth({
    ok: true,
    data: {
      schemaVersion: 3,
      published: true,
      publicationId: '15000000-0000-4000-8000-000000000001',
      publicationNumber: 1,
      draftRevision: 2,
      snapshotSha256: 'b'.repeat(64),
      publishedAt: '2026-11-22T10:00:00.000Z'
    }
  });
  assert.equal(published.ok, true);
  assert.equal(published.versionId, 'sha256:' + 'b'.repeat(64));

  assert.equal(contract.validateHealth({ ok: true, data: { schemaVersion: 2, published: false } }).ok, false);
});

test('validates database time only when transport metadata is present', () => {
  const publicationSnapshot = createSnapshot();
  assert.equal(contract.validateSnapshot(publicationSnapshot).ok, true);

  const withDatabaseTime = {
    ...publicationSnapshot,
    databaseNow: '2026-11-23T12:00:00.123456Z'
  };
  assert.equal(contract.validateSnapshot(withDatabaseTime).ok, true);

  assert.equal(contract.validateSnapshot({
    ...publicationSnapshot,
    databaseNow: '2026-02-30T12:00:00Z'
  }).ok, false);
  assert.equal(contract.isIsoUtcDateTime('2026-11-23T12:00:00.123456Z'), true);
  assert.equal(contract.isIsoUtcDateTime('2026-11-23T12:00:00+05:00'), false);
  assert.equal(contract.isIsoUtcDateTime('2026-02-30T12:00:00Z'), false);
});
