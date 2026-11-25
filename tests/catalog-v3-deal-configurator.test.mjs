import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  assert.equal(ui.toPayload().componentGroups.length, 2);

  assert.equal(ui.setOptionQuantity(IDS.componentGroup, IDS.componentOption, 0).code, 'COMPONENT_FIXED');
  assert.equal(ui.validate().ok, true);
});

test('rejects variants, component IDs and quantities outside the current deal definition', () => {
  const ui = create();
  ui.selectVariant(IDS.dealVariant);
  assert.equal(ui.selectVariant('ffffffff-ffff-4fff-8fff-ffffffffffff').code, 'DEAL_VARIANT_INVALID');
  assert.equal(ui.setOptionQuantity(IDS.componentGroup, 'ffffffff-ffff-4fff-8fff-ffffffffffff', 1).code, 'COMPONENT_OPTION_INVALID');
  assert.equal(ui.setOptionQuantity(IDS.componentGroup, IDS.componentOption, -1).code, 'COMPONENT_FIXED');
  assert.equal(ui.setOptionQuantity(IDS.componentGroup, IDS.componentOption, 1.5).code, 'COMPONENT_FIXED');
  assert.equal(ui.setOptionQuantity(IDS.componentGroup, IDS.componentOption, 2).code, 'COMPONENT_FIXED');
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

test('fixed single-option deal groups are preselected and locked', async () => {
  const source = await readFile(new URL('../apps/flame-chick-website/js/catalog-v3-deal-configurator.js', import.meta.url), 'utf8');
  assert.match(source, /group\.options\.length === 1\s*\?\s*group\.name/);
  assert.match(source, /minus\.disabled = readOnly \|\| fixedGroup/);\n  assert.match(source, /plus\.disabled = readOnly \|\| fixedGroup/);
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


test('each customer-facing Burger slot offers every configured choice and respects repeat limits', async () => {
  const source = await readFile(new URL('../apps/flame-chick-website/js/catalog-v3-deal-configurator.js', import.meta.url), 'utf8');
  const slotLoop = source.indexOf('for (let slot = 0; slot < slotCount; slot++)');
  const choiceLoop = source.indexOf('group.options.forEach(function (option) {', slotLoop);
  const optionValue = source.indexOf('optionEl.value = option.id;', choiceLoop);
  const loopEnd = source.indexOf('select.value = slots[activeSlot] || \'\';', choiceLoop);
  assert.ok(slotLoop >= 0, 'A selector must be rendered for every required burger slot.');
  assert.ok(choiceLoop > slotLoop && choiceLoop < loopEnd, 'Each slot must be populated from the full configured Burger choice list.');
  assert.ok(optionValue > choiceLoop && optionValue < loopEnd, 'Each configured choice ID must be selectable from every slot.');
  const slotRenderer = source.slice(slotLoop, loopEnd);
  assert.match(slotRenderer, /!group\.allowRepeatOption\s*&&\s*alreadyUsed/,
    'A choice is only blocked in another slot when repeats are disabled.');
  assert.match(slotRenderer, /selectedQuantity\s*>=\s*optionCap/,
    'The per-choice quantity cap must be respected.');
  assert.match(source, /group\.categoryDriven === true/, 'A category-backed Burger group must render the customer slot picker even when only one variant is currently available.');
  assert.match(slotRenderer, /optionCap\s*=\s*Number\(option\.maxQuantity\)/,
    'Each configured choice must use its own saved maximum-per-choice limit.');
});


test('deal quantity is independent of component quantities and bounded to 1–99', () => {
  const ui = create();
  assert.equal(ui.getState().dealQuantity, 1);
  assert.equal(ui.setDealQuantity(3).ok, true);
  assert.equal(ui.getState().dealQuantity, 3);
  assert.equal(ui.setDealQuantity(0).code, 'DEAL_QUANTITY_INVALID');
  assert.equal(ui.setDealQuantity(100).code, 'DEAL_QUANTITY_INVALID');
  assert.equal(ui.getState().dealQuantity, 3);
});

test('renders a compact one-row burger-slot picker and visible deal quantity stepper', async () => {
  const source = await readFile(new URL('../apps/flame-chick-website/js/catalog-v3-deal-configurator.js', import.meta.url), 'utf8');
  assert.match(source, /fc-deal-burger-tabs/);
  assert.match(source, /fc-deal-burger-tab/);
  assert.match(source, /activeBurgerSlotByGroup/);
  assert.match(source, /slots\[activeSlot\]/);
  assert.match(source, /fc-deal-quantity-stepper/);
  assert.match(source, /fc-deal-quantity-button/);
  assert.match(source, /setDealQuantity: setDealQuantity/);
});
