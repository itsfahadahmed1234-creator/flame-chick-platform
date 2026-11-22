import test from 'node:test';
import assert from 'node:assert/strict';
import contract from '../apps/flame-chick-website/js/catalog-v3.js';
import deals from '../apps/flame-chick-website/js/catalog-v3-deal-view.js';
import fixture from './fixtures/catalog-v3-fixture.cjs';

const { IDS, createSnapshot } = fixture;
const monday = '2026-11-23T12:00:00.000Z'; // Monday 17:00 in Asia/Karachi
const sunday = '2026-11-22T12:00:00.000Z'; // Sunday 17:00 in Asia/Karachi

function build(snapshot = createSnapshot(), overrides = {}) {
  return deals.buildDealViewModel(snapshot, {
    branchId: IDS.branch,
    fulfilmentType: 'delivery',
    databaseNow: monday,
    ...overrides
  }, contract);
}

test('evaluates weekly all-day and one-off windows using the declared IANA timezone', () => {
  const snapshot = createSnapshot();
  const schedule = snapshot.scheduleSets[0];
  assert.deepEqual(deals.evaluateScheduleSet(schedule, monday), {
    ok: true, available: true, localDate: '2026-11-23', timezone: 'Asia/Karachi'
  });
  schedule.windows[0].weekdayIso = 7;
  assert.equal(deals.evaluateScheduleSet(schedule, monday).available, false);
  assert.equal(deals.evaluateScheduleSet(schedule, sunday).available, true);

  const oneOff = {
    timezone: 'Asia/Karachi',
    windows: [{
      windowKind: 'ONE_OFF',
      startsAt: '2026-11-23T11:00:00.000Z',
      endsAt: '2026-11-23T13:00:00.000Z'
    }]
  };
  assert.equal(deals.evaluateScheduleSet(oneOff, '2026-11-23T11:00:00.000Z').available, true);
  assert.equal(deals.evaluateScheduleSet(oneOff, '2026-11-23T13:00:00.000Z').available, false);
});

test('weekly timed windows use start-inclusive and end-exclusive bounds', () => {
  const schedule = {
    timezone: 'Asia/Karachi',
    windows: [{
      windowKind: 'WEEKLY', weekdayIso: 1, localStart: '16:00:00',
      localEnd: '18:00:00', isAllDay: false, effectiveFrom: null, effectiveTo: null
    }]
  };
  assert.equal(deals.evaluateScheduleSet(schedule, '2026-11-23T11:00:00Z').available, true);
  assert.equal(deals.evaluateScheduleSet(schedule, '2026-11-23T13:00:00Z').available, false);
  assert.equal(deals.evaluateScheduleSet(schedule, '2026-11-23T10:59:59Z').available, false);
});

test('overnight weekly windows continue after midnight and retain the starting weekday', () => {
  const schedule = {
    timezone: 'Asia/Karachi',
    windows: [{
      windowKind: 'WEEKLY', weekdayIso: 5, localStart: '22:00:00',
      localEnd: '02:00:00', isAllDay: false, effectiveFrom: null, effectiveTo: null
    }]
  };
  assert.equal(deals.evaluateScheduleSet(schedule, '2026-11-27T18:30:00Z').available, true);
  assert.equal(deals.evaluateScheduleSet(schedule, '2026-11-27T21:30:00Z').available, true);
  assert.equal(deals.evaluateScheduleSet(schedule, '2026-11-27T22:00:00Z').available, false);
});

test('fails closed when trusted time or timezone is invalid', () => {
  const schedule = createSnapshot().scheduleSets[0];
  assert.equal(deals.evaluateScheduleSet(schedule).code, 'TRUSTED_TIME_REQUIRED');
  assert.equal(deals.evaluateScheduleSet(schedule, 'not-a-date').code, 'TRUSTED_TIME_INVALID');
  assert.equal(deals.evaluateScheduleSet({ ...schedule, timezone: 'Not/AZone' }, monday).code, 'TIMEZONE_INVALID');
});

test('branch schedule overrides global schedule, which overrides collection fallback', () => {
  const snapshot = createSnapshot();
  const secondSchedule = {
    scheduleSetId: '1b000000-0000-4000-8000-000000000001',
    name: 'Sunday only', timezone: 'Asia/Karachi',
    windows: [{ ...snapshot.scheduleSets[0].windows[0], windowId: '1c000000-0000-4000-8000-000000000001', weekdayIso: 7 }]
  };
  snapshot.scheduleSets.push(secondSchedule);
  snapshot.dealScheduleAssignments = [
    { assignmentId: IDS.dealSchedule, dealId: IDS.deal, branchId: null, scheduleSetId: IDS.schedule },
    { assignmentId: '1d000000-0000-4000-8000-000000000001', dealId: IDS.deal, branchId: IDS.branch, scheduleSetId: secondSchedule.scheduleSetId }
  ];
  let resolved = deals.resolveDealSchedule(snapshot, IDS.branch, IDS.deal);
  assert.equal(resolved.source, 'branch');
  assert.equal(resolved.scheduleSetId, secondSchedule.scheduleSetId);
  snapshot.dealScheduleAssignments.pop();
  resolved = deals.resolveDealSchedule(snapshot, IDS.branch, IDS.deal);
  assert.equal(resolved.source, 'global');
  assert.equal(resolved.scheduleSetId, IDS.schedule);
  snapshot.dealScheduleAssignments = [];
  resolved = deals.resolveDealSchedule(snapshot, IDS.branch, IDS.deal);
  assert.equal(resolved.source, 'collection');
});

test('builds deals only from exact mapped option IDs and respects branch/time availability', () => {
  const snapshot = createSnapshot();
  const result = build(snapshot);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.collections.length, 1);
  assert.equal(result.collections[0].id, IDS.dealCollection);
  const deal = result.collections[0].deals[0];
  assert.equal(deal.id, IDS.deal);
  assert.equal(deal.available, true);
  const variant = deal.variants[0];
  assert.equal(variant.id, IDS.dealVariant);
  assert.equal(variant.basePriceMinor, 75000);
  const group = variant.groups[0];
  assert.equal(group.id, IDS.componentGroup);
  assert.equal(group.options[0].id, IDS.componentOption);
  assert.equal(group.options[0].productVariantId, IDS.variant);
  assert.equal(group.options[0].pricingTreatment, 'INCLUDED');
  assert.equal(group.options[0].surchargeMinor, 0);
});

test('a missing variant-option mapping is never treated as included or free', () => {
  const snapshot = createSnapshot();
  snapshot.dealVariantComponentOptions = [];
  const result = build(snapshot);
  assert.equal(result.ok, false); // malformed publication rejected by strict contract
  const validSnapshot = createSnapshot();
  validSnapshot.dealVariantComponentOptions = [];
  const permissiveContract = { ...contract, validateSnapshot: () => ({ ok: true }), isBranchOrderingEnabled: contract.isBranchOrderingEnabled,
    resolveDealAvailability: contract.resolveDealAvailability, resolveProductAvailability: contract.resolveProductAvailability,
    resolveVariantAvailability: contract.resolveVariantAvailability, minorUnits: contract.minorUnits };
  const view = deals.buildDealViewModel(validSnapshot, {
    branchId: IDS.branch, fulfilmentType: 'delivery', databaseNow: monday
  }, permissiveContract);
  assert.equal(view.ok, true);
  assert.equal(view.collections[0].deals[0].available, false);
  assert.equal(view.collections[0].deals[0].variants[0].groups[0].options.length, 0);
});

test('branch-disabled deals and unavailable component variants cannot be selected', () => {
  const snapshot = createSnapshot();
  snapshot.branchDealAvailability.push({ branchId: IDS.branch, dealId: IDS.deal, isAvailable: false });
  let result = build(snapshot);
  assert.equal(result.ok, true);
  assert.equal(result.collections[0].deals[0].available, false);

  const second = createSnapshot();
  second.branchVariantAvailability.push({
    branchId: IDS.branch, productId: IDS.product, productVariantId: IDS.variant, isAvailable: false
  });
  result = build(second);
  assert.equal(result.ok, true);
  assert.equal(result.collections[0].deals[0].available, false);
});

test('requires branch, fulfilment and database time; rejects disabled branch ordering', () => {
  const snapshot = createSnapshot();
  assert.equal(deals.buildDealViewModel(snapshot, { fulfilmentType: 'delivery', databaseNow: monday }, contract).code, 'BRANCH_SELECTION_REQUIRED');
  assert.equal(deals.buildDealViewModel(snapshot, { branchId: IDS.branch, databaseNow: monday }, contract).code, 'FULFILMENT_REQUIRED');
  assert.equal(deals.buildDealViewModel(snapshot, { branchId: IDS.branch, fulfilmentType: 'delivery' }, contract).code, 'TRUSTED_TIME_REQUIRED');
  snapshot.branches[0].websiteDeliveryEnabled = false;
  const result = build(snapshot);
  assert.equal(result.ok, true);
  assert.equal(result.orderingEnabled, false);
  assert.equal(result.collections[0].deals[0].available, false);
});

test('validates required, optional, max quantity and allow-listed component selections', () => {
  const result = build();
  const variant = result.collections[0].deals[0].variants[0];
  assert.equal(deals.validateDealSelections(variant, {}).code, 'SELECTION_GROUP_BOUNDS');
  const accepted = deals.validateDealSelections(variant, {
    [IDS.componentGroup]: [{ componentOptionId: IDS.componentOption, quantity: 1 }]
  });
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.selections, [{
    componentGroupId: IDS.componentGroup,
    selections: [{ componentOptionId: IDS.componentOption, quantity: 1 }]
  }]);
  assert.equal(deals.validateDealSelections(variant, {
    [IDS.componentGroup]: [{ componentOptionId: IDS.componentOption, quantity: 2 }]
  }).code, 'SELECTION_QUANTITY_INVALID');
  assert.equal(deals.validateDealSelections(variant, {
    [IDS.componentGroup]: [{ componentOptionId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', quantity: 1 }]
  }).code, 'SELECTION_OPTION_INVALID');
  assert.equal(deals.validateDealSelections(variant, {
    [IDS.componentGroup]: [{ componentOptionId: IDS.componentOption, quantity: 1 }],
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee': []
  }).code, 'SELECTION_GROUP_UNKNOWN');
});

test('does not calculate or expose a browser-side deal total', () => {
  const result = build();
  const deal = result.collections[0].deals[0];
  assert.equal(Object.hasOwn(deal, 'total'), false);
  assert.equal(Object.hasOwn(deal.variants[0], 'total'), false);
  assert.equal(Object.hasOwn(result, 'grandTotal'), false);
});
