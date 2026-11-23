import test from 'node:test';
import assert from 'node:assert/strict';
import contract from '../apps/flame-chick-website/js/catalog-v3.js';
import deals from '../apps/flame-chick-website/js/catalog-v3-deal-view.js';
import configurator from '../apps/flame-chick-website/js/catalog-v3-deal-configurator.js';
import fixture from './fixtures/catalog-v3-fixture.cjs';

const { IDS, createSnapshot } = fixture;
const monday = '2026-11-23T12:00:00.000Z';

function createView(snapshot = createSnapshot()) {
  return deals.buildDealViewModel(snapshot, {
    branchId: IDS.branch,
    fulfilmentType: 'delivery',
    databaseNow: monday
  }, contract);
}

function create(view = createView(), helpers = {}) {
  return configurator.createDealConfigurator(view, IDS.deal, {
    validateModifierSelections: deals.validateModifierSelections,
    ...helpers
  });
}

test('fails closed for missing deal, unavailable deal and incomplete catalog context', () => {
  const view = createView();
  assert.equal(configurator.createDealConfigurator(view, 'missing', {
    validateModifierSelections: deals.validateModifierSelections
  }).code, 'DEAL_NOT_FOUND');
  view.collections[0].deals[0].branchAvailable = false;
  assert.equal(create(view).code, 'DEAL_UNAVAILABLE');

  const incomplete = createView();
  incomplete.versionId = null;
  assert.equal(create(incomplete).code, 'DEAL_CONTEXT_INVALID');
  assert.equal(configurator.createDealConfigurator(createView(), IDS.deal, {}).code, 'MODIFIER_VALIDATOR_REQUIRED');
});

test('requires explicit deal variant and required component selection', () => {
  const ui = create();
  assert.equal(ui.ok, true);
  assert.equal(ui.validate().code, 'DEAL_VARIANT_REQUIRED');
  assert.equal(ui.toPayload().code, 'DEAL_VARIANT_REQUIRED');

  assert.equal(ui.selectVariant(IDS.dealVariant).ok, true);
  assert.equal(ui.getState().quantities[IDS.componentGroup][IDS.componentOption], 1);
  assert.equal(ui.getState().quantities[IDS.drinkComponentGroup][IDS.drinkComponentOption], 1);
  assert.equal(ui.validate().ok, true);
  assert.equal(ui.toPayload().code, 'COMPONENT_GROUP_BOUNDS');

  assert.equal(ui.setOptionQuantity(IDS.componentGroup, IDS.componentOption, 0).code, 'COMPONENT_QUANTITY_INVALID');
  assert.equal(ui.validate().ok, true);
});

test('rejects variants, component IDs and quantities outside the current deal definition', () => {
  const ui = create();
  ui.selectVariant(IDS.dealVariant);
  assert.equal(ui.selectVariant('ffffffff-ffff-4fff-8fff-ffffffffffff').code, 'DEAL_VARIANT_INVALID');
  assert.equal(ui.setOptionQuantity(IDS.componentGroup, 'ffffffff-ffff-4fff-8fff-ffffffffffff', 1).code, 'COMPONENT_OPTION_INVALID');
  assert.equal(ui.setOptionQuantity(IDS.componentGroup, IDS.componentOption, -1).code, 'COMPONENT_QUANTITY_INVALID');
  assert.equal(ui.setOptionQuantity(IDS.componentGroup, IDS.componentOption, 1.5).code, 'COMPONENT_QUANTITY_INVALID');
  assert.equal(ui.setOptionQuantity(IDS.componentGroup, IDS.componentOption, 2).code, 'COMPONENT_QUANTITY_INVALID');
});

test('emits stable identifiers only and never emits a client-side total', () => {
  const ui = create();
  ui.selectVariant(IDS.dealVariant);
  ui.setOptionQuantity(IDS.componentGroup, IDS.componentOption, 1);
  ui.setOptionQuantity(IDS.drinkComponentGroup, IDS.drinkComponentOption, 1);
  const payload = ui.toPayload();
  assert.equal(payload.ok, undefined);
  assert.deepEqual(payload, {
    schemaVersion: 3,
    publicationId: createView().publicationId,
    versionId: createView().versionId,
    branchId: IDS.branch,
    fulfilmentType: 'delivery',
    dealId: IDS.deal,
    dealVariantId: IDS.dealVariant,
    componentGroups: [{
      componentGroupId: IDS.componentGroup,
      components: [{
        componentOptionId: IDS.componentOption,
        productId: IDS.product,
        productVariantId: IDS.variant,
        modifiers: [{ modifierGroupId: IDS.modifierGroup, modifierIds: [] }]
      }]
    }, {
      componentGroupId: IDS.drinkComponentGroup,
      components: [{
        componentOptionId: IDS.drinkComponentOption,
        productId: IDS.drinkProduct,
        productVariantId: IDS.drinkVariant,
        modifiers: []
      }]
    }]
  });
  assert.equal(Object.hasOwn(payload, 'total'), false);
  assert.equal(Object.hasOwn(payload, 'grandTotal'), false);
  assert.equal(JSON.stringify(payload).includes('Extra Cheese'), false);
});

test('supports separate modifier choices for each repeated component instance', () => {
  const snapshot = createSnapshot();
  snapshot.dealComponentGroups[0].maxUnits = 2;
  snapshot.dealComponentGroups[0].allowRepeatOption = true;
  snapshot.dealVariantComponentOptions[0].maxQuantityPerDeal = 2;
  const view = createView(snapshot);
  assert.equal(view.ok, true);
  const ui = create(view);
  ui.selectVariant(IDS.dealVariant);
  assert.equal(ui.setOptionQuantity(IDS.componentGroup, IDS.componentOption, 2).ok, true);
  assert.equal(ui.setModifierSelection(
    IDS.componentGroup, IDS.componentOption, 0, IDS.modifierGroup, [IDS.modifier]
  ).ok, true);
  assert.equal(ui.setModifierSelection(
    IDS.componentGroup, IDS.componentOption, 1, IDS.modifierGroup, []
  ).ok, true);

  ui.setOptionQuantity(IDS.drinkComponentGroup, IDS.drinkComponentOption, 1);
  const payload = ui.toPayload();
  assert.equal(payload.componentGroups[0].components.length, 2);
  assert.deepEqual(payload.componentGroups[0].components.map(item => item.modifiers), [
    [{ modifierGroupId: IDS.modifierGroup, modifierIds: [IDS.modifier] }],
    [{ modifierGroupId: IDS.modifierGroup, modifierIds: [] }]
  ]);
});

test('rejects modifier groups and modifier IDs not assigned to a selected component', () => {
  const ui = create();
  ui.selectVariant(IDS.dealVariant);
  ui.setOptionQuantity(IDS.componentGroup, IDS.componentOption, 1);
  ui.setOptionQuantity(IDS.drinkComponentGroup, IDS.drinkComponentOption, 1);
  assert.equal(ui.setModifierSelection(
    IDS.componentGroup, IDS.componentOption, 0,
    'ffffffff-ffff-4fff-8fff-ffffffffffff', []
  ).code, 'MODIFIER_GROUP_INVALID');
  assert.equal(ui.setModifierSelection(
    IDS.componentGroup, IDS.componentOption, 2, IDS.modifierGroup, []
  ).code, 'COMPONENT_INSTANCE_INVALID');
  assert.equal(ui.setModifierSelection(
    IDS.componentGroup, IDS.componentOption, 0, IDS.modifierGroup,
    ['ffffffff-ffff-4fff-8fff-ffffffffffff']
  ).code, 'MODIFIER_SELECTION_OPTION_INVALID');
});

test('clearing component quantity also clears customizations for removed instances', () => {
  const snapshot = createSnapshot();
  snapshot.dealComponentGroups[0].maxUnits = 2;
  snapshot.dealComponentGroups[0].allowRepeatOption = true;
  snapshot.dealVariantComponentOptions[0].maxQuantityPerDeal = 2;
  const ui = create(createView(snapshot));
  ui.selectVariant(IDS.dealVariant);
  ui.setOptionQuantity(IDS.componentGroup, IDS.componentOption, 2);
  ui.setOptionQuantity(IDS.drinkComponentGroup, IDS.drinkComponentOption, 1);
  ui.setModifierSelection(IDS.componentGroup, IDS.componentOption, 1, IDS.modifierGroup, [IDS.modifier]);
  ui.setOptionQuantity(IDS.componentGroup, IDS.componentOption, 1);
  assert.equal(ui.toPayload().componentGroups[0].components.length, 1);
  assert.deepEqual(ui.toPayload().componentGroups[0].components[0].modifiers, [
    { modifierGroupId: IDS.modifierGroup, modifierIds: [] }
  ]);
});

test('refuses to render without a DOM target and an explicit completion handler', () => {
  const ui = create();
  assert.equal(ui.render(null, { onComplete() {} }).code, 'DOM_TARGET_REQUIRED');
  assert.equal(ui.render({ replaceChildren() {} }, { document: {} }).code, 'COMPLETION_HANDLER_REQUIRED');
});

test('fixed single-option deal groups are preselected and locked', () => {
  const source = require('node:fs').readFileSync(new URL('../apps/flame-chick-website/js/catalog-v3-deal-configurator.js', import.meta.url), 'utf8');
  assert.match(source, /group\.options\.length === 1\s*\?\s*group\.name/);
  assert.match(source, /quantity\.disabled = readOnly \|\| fixedGroup/);
  const ui = create();
  ui.selectVariant(IDS.dealVariant);
  const state = ui.getState();
  assert.equal(state.quantities[IDS.componentGroup][IDS.componentOption], 1);
  assert.equal(state.quantities[IDS.drinkComponentGroup][IDS.drinkComponentOption], 1);
  assert.equal(ui.validate().ok, true);
  assert.equal(ui.setOptionQuantity(IDS.componentGroup, IDS.componentOption, 0).code, 'COMPONENT_FIXED');
});

test('schedule-closed deal can be opened read-only but cannot emit a payload', () => {
  const view = createView();
  const deal = view.collections[0].deals[0];
  deal.available = false;
  deal.scheduleAvailable = false;
  deal.branchAvailable = true;
  const ui = create(view);
  assert.equal(ui.ok, true);
  assert.equal(ui.selectVariant(IDS.dealVariant).ok, true);
  assert.equal(ui.validate().ok, true);
  assert.equal(ui.toPayload().code, 'DEAL_READ_ONLY');
  assert.equal(ui.setOptionQuantity(IDS.componentGroup, IDS.componentOption, 0).code, 'DEAL_READ_ONLY');
});

test('unavailable or unsatisfiable variants cannot be selected', () => {
  const snapshot = createSnapshot();
  snapshot.branchVariantAvailability.push({
    branchId: IDS.branch, productId: IDS.product, productVariantId: IDS.variant, isAvailable: false
  });
  const view = createView(snapshot);
  assert.equal(view.collections[0].deals[0].available, false);
  assert.equal(create(view).code, 'DEAL_UNAVAILABLE');
});
