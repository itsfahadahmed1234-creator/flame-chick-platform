import test from 'node:test';
import assert from 'node:assert/strict';
import contract from '../apps/flame-chick-website/js/catalog-v3.js';
import selector from '../apps/flame-chick-website/js/branch-fulfilment-v3.js';
import fixture from './fixtures/catalog-v3-fixture.cjs';

const { IDS, createSnapshot } = fixture;
const trustedNow = '2026-11-23T12:00:00.123456Z';

function create(snapshot = createSnapshot(), now = trustedNow) {
  return selector.createBranchFulfilmentSelection(snapshot, now, contract);
}

test('auto-selects only a single published branch and still requires explicit fulfilment', () => {
  const flow = create();
  assert.equal(flow.ok, true);
  assert.equal(flow.getState().selectedBranchId, IDS.branch);
  assert.equal(flow.getState().fulfilmentType, null);
  assert.equal(flow.getContext().code, 'BRANCH_FULFILMENT_REQUIRED');
  assert.equal(flow.selectFulfilment('delivery').ok, true);
  assert.equal(flow.getContext().branchId, IDS.branch);
  assert.equal(flow.getContext().fulfilmentType, 'delivery');
  assert.equal(flow.getContext().databaseNow, trustedNow);
});

test('requires an explicit branch choice when multiple branches are published', () => {
  const snapshot = createSnapshot();
  snapshot.branches.push({
    ...snapshot.branches[0],
    branchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    branchCode: 'second',
    name: 'Second Branch'
  });
  const flow = create(snapshot);
  assert.equal(flow.ok, true);
  assert.equal(flow.getState().branchRequired, true);
  assert.equal(flow.selectFulfilment('delivery').code, 'BRANCH_REQUIRED');
  assert.equal(flow.getContext().code, 'BRANCH_FULFILMENT_REQUIRED');
  assert.equal(flow.selectBranch(snapshot.branches[1].branchId).ok, true);
  assert.equal(flow.getState().selectedBranch.name, 'Second Branch');
  assert.equal(flow.getState().fulfilmentType, null);
});

test('rejects branch IDs outside the current publication and clears fulfilment on branch change', () => {
  const snapshot = createSnapshot();
  snapshot.branches.push({
    ...snapshot.branches[0],
    branchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    branchCode: 'second',
    name: 'Second Branch',
    websiteDeliveryEnabled: false
  });
  const flow = create(snapshot);
  flow.selectFulfilment('delivery');
  assert.equal(flow.selectBranch('ffffffff-ffff-4fff-8fff-ffffffffffff').code, 'BRANCH_INVALID');
  assert.equal(flow.selectBranch(snapshot.branches[1].branchId).ok, true);
  assert.equal(flow.getState().fulfilmentType, null);
  assert.equal(flow.selectFulfilment('delivery').code, 'FULFILMENT_UNAVAILABLE');
  assert.equal(flow.selectFulfilment('pickup').ok, true);
});

test('disables both methods when website ordering is disabled', () => {
  const snapshot = createSnapshot();
  snapshot.branches[0].websiteOrderingEnabled = false;
  const flow = create(snapshot);
  assert.equal(flow.getState().availableFulfilmentTypes.length, 0);
  assert.equal(flow.selectFulfilment('delivery').code, 'FULFILMENT_UNAVAILABLE');
  assert.equal(flow.selectFulfilment('pickup').code, 'FULFILMENT_UNAVAILABLE');
  assert.equal(flow.getContext().code, 'BRANCH_FULFILMENT_REQUIRED');
});

test('fails closed for missing, malformed or non-UTC database time', () => {
  for (const value of [null, '', '2026-11-23T12:00:00', 'not-a-date', '2026-02-30T12:00:00Z']) {
    assert.equal(create(createSnapshot(), value).code, 'DATABASE_TIME_REQUIRED');
  }
  assert.equal(selector.validDatabaseTime(trustedNow), true);
  assert.equal(selector.validDatabaseTime('2026-11-23T12:00:00+05:00'), false);
});

test('rejects missing/empty branch catalog, duplicate IDs and missing availability contract', () => {
  const empty = createSnapshot();
  empty.branches = [];
  assert.equal(create(empty).code, 'BRANCH_CATALOG_INVALID');

  const duplicate = createSnapshot();
  duplicate.branches.push({ ...duplicate.branches[0] });
  assert.equal(create(duplicate).code, 'BRANCH_CATALOG_INVALID');

  assert.equal(selector.createBranchFulfilmentSelection(createSnapshot(), trustedNow, {}).code,
    'CATALOG_CONTRACT_REQUIRED');
});

test('branch selection source has no dependency on the customer device clock', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../apps/flame-chick-website/js/branch-fulfilment-v3.js', import.meta.url), 'utf8');
  assert.equal(source.includes('Date.now('), false);
  assert.equal(source.includes('new Date('), false);
});
