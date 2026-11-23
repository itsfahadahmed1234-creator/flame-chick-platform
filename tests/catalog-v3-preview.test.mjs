import test from 'node:test';
import assert from 'node:assert/strict';
import contract from '../apps/flame-chick-website/js/catalog-v3.js';
import clientModule from '../apps/flame-chick-website/js/catalog-v3-client.js';
import branchModule from '../apps/flame-chick-website/js/branch-fulfilment-v3.js';
import productModule from '../apps/flame-chick-website/js/catalog-v3-view.js';
import dealModule from '../apps/flame-chick-website/js/catalog-v3-deal-view.js';
import previewModule from '../apps/flame-chick-website/js/catalog-v3-preview.js';
import fixture from './fixtures/catalog-v3-fixture.cjs';

const { IDS, createSnapshot } = fixture;
const databaseNow = '2026-11-23T12:00:00.123456Z';
const secondBranchId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function createDependencies(snapshot = createSnapshot(), overrides = {}) {
  const catalogSnapshot = { ...snapshot, databaseNow };
  return {
    config: {},
    client: {
      load: async () => ({
        state: 'ready',
        snapshot: catalogSnapshot,
        versionId: catalogSnapshot.versionId,
        databaseNow: databaseNow
      })
    },
    contract,
    branchModule,
    productModule,
    dealModule,
    ...overrides
  };
}

function createPreview(snapshot = createSnapshot(), overrides = {}) {
  return previewModule.createCatalogPreview(createDependencies(snapshot, overrides));
}

test('allows read-only menu browsing after branch verification and requires fulfilment for ordering', async () => {
  const app = createPreview();
  assert.equal(app.ok, true);
  const loaded = await app.start();
  assert.equal(loaded.state, 'ready');
  assert.equal(loaded.selection.selectedBranchId, IDS.branch);
  assert.equal(loaded.selection.fulfilmentType, null);
  assert.ok(app.getPreview());
  assert.equal(app.getPreview().fulfilmentType, null);
  assert.equal(app.getPreview().orderingEnabled, false);
  assert.equal(app.getPreview().products.orderingEnabled, false);
  assert.equal(app.getPreview().deals.orderingEnabled, false);

  const built = app.selectFulfilment('delivery');
  assert.equal(built.ok, true);
  assert.equal(built.preview.mode, 'non-ordering-preview');
  assert.equal(built.preview.canAddToCart, false);
  assert.equal(built.preview.canCheckout, false);
  assert.equal(built.preview.canSubmitOrder, false);
  assert.equal(built.preview.branchId, IDS.branch);
  assert.equal(built.preview.fulfilmentType, 'delivery');
  assert.equal(built.preview.databaseNow, databaseNow);
  assert.equal(built.preview.products.branchId, IDS.branch);
  assert.equal(built.preview.products.fulfilmentType, 'delivery');
  assert.equal(built.preview.deals.branchId, IDS.branch);
  assert.equal(built.preview.deals.fulfilmentType, 'delivery');
  assert.equal('addToCart' in app, false);
  assert.equal('checkout' in app, false);
  assert.equal('submitOrder' in app, false);
});

test('requires branch selection for multiple branches and rebuilds read-only view on branch change', async () => {
  const snapshot = createSnapshot();
  snapshot.branches.push({
    ...snapshot.branches[0],
    branchId: secondBranchId,
    branchCode: 'second',
    name: 'Second Branch',
    websiteDeliveryEnabled: false,
    websitePickupEnabled: true
  });
  const app = createPreview(snapshot);
  const loaded = await app.start();
  assert.equal(loaded.state, 'ready');
  assert.equal(loaded.selection.branchRequired, true);
  assert.equal(app.getPreview(), null);
  assert.equal(app.selectFulfilment('delivery').code, 'BRANCH_REQUIRED');

  const firstBrowse = app.selectBranch(IDS.branch);
  assert.equal(firstBrowse.ok, true);
  assert.ok(firstBrowse.preview);
  assert.equal(firstBrowse.preview.fulfilmentType, null);
  const first = app.selectFulfilment('delivery');
  assert.equal(first.ok, true);
  const firstPreview = first.preview;
  assert.equal(firstPreview.branchId, IDS.branch);
  assert.equal(firstPreview.fulfilmentType, 'delivery');

  const changed = app.selectBranch(secondBranchId);
  assert.equal(changed.ok, true);
  assert.equal(changed.state.selection.selectedBranchId, secondBranchId);
  assert.equal(changed.state.selection.fulfilmentType, null);
  assert.equal(changed.state.selection.ready, false);
  assert.ok(changed.preview);
  assert.equal(changed.preview.fulfilmentType, null);
  assert.equal(changed.preview.orderingEnabled, false);
  assert.equal(app.getState().previewReady, true);

  assert.equal(app.selectFulfilment('delivery').code, 'FULFILMENT_UNAVAILABLE');
  const second = app.selectFulfilment('pickup');
  assert.equal(second.ok, true);
  assert.notEqual(second.preview.previewId, firstPreview.previewId);
  assert.notEqual(second.preview, firstPreview);
  assert.equal(second.preview.branchId, secondBranchId);
  assert.equal(second.preview.fulfilmentType, 'pickup');
  assert.equal(second.preview.products.branchId, secondBranchId);
  assert.equal(second.preview.deals.branchId, secondBranchId);
});

test('switching fulfilment rebuilds product and deal view models for the same branch', async () => {
  const app = createPreview();
  await app.start();
  const delivery = app.selectFulfilment('delivery');
  assert.equal(delivery.ok, true);
  const pickup = app.selectFulfilment('pickup');
  assert.equal(pickup.ok, true);
  assert.notEqual(pickup.preview.previewId, delivery.preview.previewId);
  assert.equal(pickup.preview.branchId, IDS.branch);
  assert.equal(pickup.preview.fulfilmentType, 'pickup');
  assert.equal(pickup.preview.products.fulfilmentType, 'pickup');
  assert.equal(pickup.preview.deals.fulfilmentType, 'pickup');
});

test('rejects unpublished, failed and inconsistent catalog load results', async () => {
  const unpublished = createPreview(createSnapshot(), {
    client: { load: async () => ({ state: 'unpublished', error: { code: 'CATALOG_NOT_PUBLISHED', message: 'No menu' } }) }
  });
  assert.equal((await unpublished.start()).state, 'unpublished');
  assert.equal(unpublished.getPreview(), null);

  const failed = createPreview(createSnapshot(), {
    client: { load: async () => ({ state: 'error', error: { code: 'NETWORK', message: 'Offline' } }) }
  });
  assert.equal((await failed.start()).state, 'error');
  assert.equal(failed.getState().error.code, 'NETWORK');

  const missingDatabaseTime = createPreview(createSnapshot(), {
    client: { load: async () => ({ state: 'ready', snapshot: createSnapshot(), versionId: createSnapshot().versionId }) }
  });
  assert.equal((await missingDatabaseTime.start()).error.code, 'PREVIEW_CATALOG_CONTEXT_INVALID');

  const mismatchedDatabaseTime = createPreview(createSnapshot(), {
    client: { load: async () => ({
      state: 'ready',
      snapshot: { ...createSnapshot(), databaseNow: databaseNow },
      versionId: createSnapshot().versionId,
      databaseNow: '2026-11-23T13:00:00Z'
    }) }
  });
  assert.equal((await mismatchedDatabaseTime.start()).error.code, 'PREVIEW_CATALOG_CONTEXT_INVALID');

  const mismatchedVersion = createPreview(createSnapshot(), {
    client: { load: async () => ({
      state: 'ready', snapshot: { ...createSnapshot(), databaseNow },
      versionId: 'sha256:' + 'c'.repeat(64), databaseNow
    }) }
  });
  assert.equal((await mismatchedVersion.start()).error.code, 'PREVIEW_CATALOG_CONTEXT_INVALID');
});

test('fails closed if either branch-scoped view model cannot be built', async () => {
  const app = createPreview(createSnapshot(), {
    productModule: {
      buildMenuViewModel: () => ({ ok: true, categories: [] })
    },
    dealModule: {
      buildDealViewModel: () => ({ ok: false, code: 'DEAL_VIEW_FAILED', message: 'Rejected' })
    }
  });
  const result = await app.start();
  assert.equal(result.state, 'error');
  assert.equal(result.error.code, 'DEAL_VIEW_FAILED');
  assert.equal(app.getState().loadState, 'error');
  assert.equal(app.getPreview(), null);
});

test('notifies observers on loading, branch selection, and completed preview transitions', async () => {
  const app = createPreview();
  const observed = [];
  const subscription = app.subscribe(state => observed.push({
    loadState: state.loadState,
    previewReady: state.previewReady,
    selectedBranchId: state.selection && state.selection.selectedBranchId,
    fulfilmentType: state.selection && state.selection.fulfilmentType
  }));
  await app.start();
  app.selectFulfilment('delivery');
  app.selectBranch(IDS.branch);
  app.selectFulfilment('pickup');
  subscription.unsubscribe();
  const last = observed[observed.length - 1];
  assert.equal(last.previewReady, true);
  assert.equal(last.fulfilmentType, 'pickup');
  const count = observed.length;
  app.selectBranch('ffffffff-ffff-4fff-8fff-ffffffffffff');
  assert.equal(observed.length, count);
});

test('reload invalidates the previous preview before requesting the catalog again', async () => {
  let loadCount = 0;
  const snapshot = createSnapshot();
  const app = createPreview(snapshot, {
    client: {
      load: async () => {
        loadCount += 1;
        return { state: 'ready', snapshot: { ...snapshot, databaseNow }, versionId: snapshot.versionId, databaseNow };
      }
    }
  });
  await app.start();
  assert.ok(app.getPreview());
  assert.equal(app.getPreview().fulfilmentType, null);
  assert.equal(app.selectFulfilment('delivery').ok, true);
  assert.ok(app.getPreview());
  const result = await app.reload();
  assert.equal(result.state, 'ready');
  assert.equal(loadCount, 2);
  assert.ok(app.getPreview());
  assert.equal(app.getPreview().fulfilmentType, null);
  assert.equal(app.getSelectionState().fulfilmentType, null);
});

test('re-renders branch and fulfilment controls after a successful catalog reload', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../apps/flame-chick-website/js/catalog-preview-page.js', import.meta.url),
    'utf8'
  );
  assert.match(source, /function renderBranchSelector\(\)/);
  const reloadStart = source.indexOf("reloadButton.addEventListener('click'");
  const reloadEnd = source.indexOf("closeConfigButton.addEventListener", reloadStart);
  assert.ok(reloadStart >= 0 && reloadEnd > reloadStart, 'reload handler must exist');
  const reloadHandler = source.slice(reloadStart, reloadEnd);
  assert.match(reloadHandler, /app\.reload\(\)\.then/);
  assert.match(reloadHandler, /renderBranchSelector\(\)/);
  assert.match(reloadHandler, /Re-render its controls/);
});

test('does not depend on customer device time or persistent browser storage', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../apps/flame-chick-website/js/catalog-v3-preview.js', import.meta.url), 'utf8');
  for (const forbidden of ['Date.now(', 'localStorage', 'sessionStorage', 'innerHTML', 'orderApiBase']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
