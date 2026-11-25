import test from 'node:test';
import assert from 'node:assert/strict';
import contract from '../apps/flame-chick-website/js/catalog-v3.js';
import menuView from '../apps/flame-chick-website/js/catalog-v3-view.js';
import dealView from '../apps/flame-chick-website/js/catalog-v3-deal-view.js';
import dealConfigurator from '../apps/flame-chick-website/js/catalog-v3-deal-configurator.js';
import fixture from './fixtures/flame-chick-published-menu-v3-fixture.cjs';

const { draft, createPublishedMenuSnapshot, ids } = fixture;
const MAIN_BRANCH_ID = '10000000-0000-4000-8000-000000000001';
const DURING_FLAME_HOUR = '2026-11-23T11:00:00.000Z'; // Monday 16:00 Asia/Karachi
const AFTER_FLAME_HOUR = '2026-11-23T12:00:00.000Z'; // Monday 17:00 Asia/Karachi

function buildDeals(snapshot, databaseNow) {
  return dealView.buildDealViewModel(snapshot, {
    branchId: MAIN_BRANCH_ID,
    fulfilmentType: 'delivery',
    databaseNow
  }, contract);
}

test('the review-only draft describes 20 standalone products, five deal-only products and six offers', () => {
  const snapshot = createPublishedMenuSnapshot();
  assert.equal(draft.status, 'REVIEW_ONLY_NOT_IMPORTED');
  assert.equal(snapshot.categories.length, 8);
  assert.equal(snapshot.products.length, 25);
  assert.equal(snapshot.productVariants.length, 28);
  assert.equal(snapshot.products.filter(product =>
    snapshot.productVariants.some(variant => variant.productId === product.productId && variant.standaloneSellable)
  ).length, 20);
  assert.equal(snapshot.products.filter(product =>
    snapshot.productVariants.some(variant => variant.productId === product.productId && !variant.standaloneSellable)
  ).length, 5);
  assert.equal(snapshot.deals.length, 6);
  assert.equal(snapshot.dealVariants.length, 6);
  assert.equal(snapshot.dealComponentGroups.length, 18);
  assert.equal(snapshot.dealComponentOptions.length, 18);
  assert.equal(snapshot.dealVariantComponentOptions.length, 18);
});

test('the complete draft is a valid V3 publication snapshot', () => {
  const snapshot = createPublishedMenuSnapshot();
  const result = contract.validateSnapshot(snapshot);
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
});

test('every deal-only product is unpriced, non-standalone and linked into a fixed deal', () => {
  const snapshot = createPublishedMenuSnapshot();
  const dealOnlyVariants = snapshot.productVariants.filter(variant => !variant.standaloneSellable);
  assert.equal(dealOnlyVariants.length, 5);
  for (const variant of dealOnlyVariants) {
    assert.equal(variant.price, null);
    const linkedOption = snapshot.dealComponentOptions.find(option =>
      option.productId === variant.productId && option.productVariantId === variant.variantId
    );
    assert.ok(linkedOption, 'Missing deal component link for ' + variant.variantId);
    const mapping = snapshot.dealVariantComponentOptions.find(item =>
      item.componentOptionId === linkedOption.componentOptionId
    );
    assert.ok(mapping, 'Missing active deal-variant mapping for ' + variant.variantId);
    assert.equal(mapping.pricingTreatment, 'INCLUDED');
    assert.equal(mapping.unitSurcharge, 0);
  }
  assert.ok(snapshot.productVariants.filter(variant => variant.standaloneSellable)
    .every(variant => typeof variant.price === 'number'));
});

test('standalone product menu excludes all five deal-only products', () => {
  const snapshot = createPublishedMenuSnapshot();
  const result = menuView.buildMenuViewModel(snapshot, { fulfilmentType: 'delivery' }, contract);
  assert.equal(result.ok, true, JSON.stringify(result));
  const visibleProducts = result.categories.flatMap(category => category.products);
  assert.equal(visibleProducts.length, 20);
  assert.ok(visibleProducts.every(product => product.variants.every(variant => variant.standaloneSellable)));
  assert.equal(visibleProducts.some(product => product.name === 'Burger'), false);
  assert.equal(visibleProducts.some(product => product.name === 'Classic Nuggets (6 pcs)'), false);
  assert.equal(visibleProducts.some(product => product.name === 'Fries'), false);
  assert.equal(visibleProducts.some(product => product.name === 'Juice'), false);
  assert.equal(visibleProducts.some(product => product.name === '1L Drink'), false);
});

test('standalone menu prices, packs and The Smash variants match the newly published menu', () => {
  const snapshot = createPublishedMenuSnapshot();
  const menu = menuView.buildMenuViewModel(snapshot, {}, contract);
  assert.equal(menu.ok, true);

  const findProduct = name => menu.categories.flatMap(category => category.products).find(product => product.name === name);
  const nuggets = findProduct('Classic Nuggets');
  assert.deepEqual(nuggets.variants.map(variant => [variant.label, variant.priceMinor, variant.packQuantity, variant.packUnit]),
    [['12 pcs', 69900, 12, 'pcs']]);
  const injectedNuggets = findProduct('Injected Nuggets');
  assert.deepEqual(injectedNuggets.variants.map(variant => [variant.priceMinor, variant.packQuantity]), [[74900, 12]]);
  const smash = findProduct('The Smash');
  assert.equal(smash.variants.length, 2);
  assert.deepEqual(smash.variants.map(variant => [variant.label, variant.priceMinor]),
    [['Single Patty', 79900], ['Double Patty', 99900]]);
  const water = findProduct('Water');
  assert.deepEqual(water.variants.map(variant => [variant.label, variant.priceMinor]),
    [['Regular', 9900], ['1.5 Ltr', 15000]]);
  const coldDrink = findProduct('Cold Drink');
  assert.deepEqual(coldDrink.variants.map(variant => [variant.label, variant.priceMinor]),
    [['Regular', 12000], ['1.5 Ltr', 25000]]);
  assert.equal(findProduct('Platter').description, null);
});

test('all six current offers have exact base prices and fixed INCLUDED compositions', () => {
  const snapshot = createPublishedMenuSnapshot();
  const result = buildDeals(snapshot, DURING_FLAME_HOUR);
  assert.equal(result.ok, true, JSON.stringify(result));
  const deals = result.collections.flatMap(collection => collection.deals);
  assert.equal(deals.length, 6);

  const expected = {
    'Flame Hour — The Injector + Cold Drink': [
      { price: 69900, components: [['The Injector', 1], ['Cold Drink', 1]] }
    ],
    'Flame Hour — Quarter Broast + Burger + Cold Drink': [
      { price: 159900, components: [['Quarter Broast', 1], ['Burger', 1], ['Cold Drink', 1]] }
    ],
    'Flame Duo': [
      { price: 209900, components: [['Burger', 2], ['Quarter Broast', 1], ['Cold Drink', 2]] }
    ],
    'Flame Feast': [
      { price: 359900, components: [['Half Broast', 1], ['Burger', 3], ['1L Drink', 1]] }
    ],
    'Mini Flame': [
      { price: 39900, components: [['Classic Nuggets (6 pcs)', 1], ['Fries', 1], ['Juice', 1]] }
    ],
    'Little Crunch': [
      { price: 99900, components: [['Classic Nuggets (6 pcs)', 1], ['OG Crunch', 1], ['Fries', 1], ['Cold Drink', 1]] }
    ]
  };

  let offerCount = 0;
  for (const [dealTitle, variantsExpected] of Object.entries(expected)) {
    const deal = deals.find(item => item.title === dealTitle);
    assert.ok(deal, 'Missing deal ' + dealTitle);
    assert.equal(deal.variants.length, variantsExpected.length);
    for (let i = 0; i < variantsExpected.length; i++) {
      offerCount++;
      const actual = deal.variants[i];
      const exp = variantsExpected[i];
      assert.equal(actual.basePriceMinor, exp.price, dealTitle + ' fixed base price');
      assert.equal(actual.pricingMode, 'FIXED_BUNDLE');
      assert.equal(actual.groups.length, exp.components.length);
      const actualComponents = actual.groups.map(group => [group.name, group.minUnits]);
      assert.deepEqual(actualComponents, exp.components, dealTitle + ' component names/quantities');
      for (const group of actual.groups) {
        assert.equal(group.minUnits, group.maxUnits);
        if (group.categoryDriven === true) {
          assert.equal(group.name, 'Burger');
          assert.equal(group.categoryId, snapshot.categories.find(category => category.nameEn === 'Chicken Burgers').categoryId);
          assert.deepEqual(group.options.map(option => option.productName), ['OG Crunch', 'The Injector', 'Nashville Fire']);
        } else {
          assert.equal(group.options.length, 1);
        }
        assert.ok(group.options.length >= 1);
        assert.ok(group.options.every(option => option.pricingTreatment === 'INCLUDED'));
        assert.ok(group.options.every(option => option.surchargeMinor === 0));
        assert.ok(group.options.every(option => option.standalonePriceMinor === null));
        assert.ok(group.options.every(option => option.maxQuantity >= group.minUnits));
      }
    }
  }
  assert.equal(offerCount, 6);
});

test('generic Burger slots expand from Chicken Burgers and exclude the hidden deal-only placeholder', () => {
  const snapshot = createPublishedMenuSnapshot();
  const result = buildDeals(snapshot, DURING_FLAME_HOUR);
  assert.equal(result.ok, true);
  const deals = result.collections[0].deals;
  const dealBurgerId = ids.productIds('deal_burger');
  const ogCrunchId = ids.productIds('og_crunch');
  const burgerCategoryId = snapshot.categories.find(category => category.nameEn === 'Chicken Burgers').categoryId;

  const burgerGroups = [];
  for (const deal of deals) {
    for (const variant of deal.variants) {
      for (const group of variant.groups.filter(item => item.name === 'Burger')) {
        burgerGroups.push(group);
      }
    }
  }
  assert.equal(burgerGroups.length, 3);
  for (const group of burgerGroups) {
    assert.equal(group.categoryDriven, true);
    assert.equal(group.categoryId, burgerCategoryId);
    assert.deepEqual(group.options.map(option => option.productName), ['OG Crunch', 'The Injector', 'Nashville Fire']);
    assert.ok(group.options.every(option => option.productId !== dealBurgerId));
    assert.ok(group.options.every(option => option.pricingTreatment === 'INCLUDED' && option.surchargeMinor === 0));
  }

  const littleCrunch = deals.find(deal => deal.title === 'Little Crunch');
  const namedOgCrunch = littleCrunch.variants[0].groups.find(group => group.name === 'OG Crunch');
  assert.ok(namedOgCrunch);
  assert.equal(namedOgCrunch.options[0].productId, ogCrunchId);
  assert.equal(namedOgCrunch.categoryDriven, false);
});

test('Flame Hour is scheduled every day from 15:00 inclusive to 17:00 exclusive in Asia/Karachi', () => {
  const snapshot = createPublishedMenuSnapshot();
  const schedule = snapshot.scheduleSets[0];
  assert.equal(schedule.timezone, 'Asia/Karachi');
  assert.equal(schedule.windows.length, 7);
  assert.deepEqual(schedule.windows.map(window => window.weekdayIso), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(schedule.windows.every(window =>
    window.localStart === '15:00:00' && window.localEnd === '17:00:00' && !window.isAllDay
  ));

  const open = buildDeals(snapshot, DURING_FLAME_HOUR);
  assert.equal(open.ok, true);
  const openDeals = open.collections[0].deals.filter(deal => deal.title.startsWith('Flame Hour —'));
  assert.equal(openDeals.length, 2);
  assert.ok(openDeals.every(deal => deal.branchAvailable && deal.available));

  const closed = buildDeals(snapshot, AFTER_FLAME_HOUR);
  assert.equal(closed.ok, true);
  const closedDeals = closed.collections[0].deals.filter(deal => deal.title.startsWith('Flame Hour —'));
  assert.equal(closedDeals.length, 2);
  assert.ok(closedDeals.every(deal =>
    deal.branchAvailable && !deal.available && !deal.scheduleAvailable
  ));
});

test('fixed non-Burger deal components stay locked while category-backed Burger slots require customer selection', () => {
  const snapshot = createPublishedMenuSnapshot();
  const result = buildDeals(snapshot, DURING_FLAME_HOUR);
  assert.equal(result.ok, true);
  for (const deal of result.collections[0].deals) {
    const ui = dealConfigurator.createDealConfigurator(result, deal.id, {
      validateModifierSelections: dealView.validateModifierSelections
    });
    assert.equal(ui.ok, true, deal.title);
    for (const variant of deal.variants) {
      assert.equal(ui.selectVariant(variant.id).ok, true, deal.title);
      for (const group of variant.groups) {
        if (group.categoryDriven === true) {
          const initial = ui.getState().quantities[group.id] || {};
          assert.equal(Object.values(initial).reduce((sum, quantity) => sum + Number(quantity || 0), 0), 0);
          assert.ok(group.options.some(option => option.productName === 'The Injector'));
          if (group.allowRepeatOption) {
            assert.equal(ui.setOptionQuantity(group.id, group.options[0].id, group.minUnits).ok, true);
          } else {
            for (const option of group.options.slice(0, group.minUnits)) {
              assert.equal(ui.setOptionQuantity(group.id, option.id, 1).ok, true);
            }
          }
          assert.equal(ui.validate().ok, true, deal.title);
        } else {
          assert.equal(ui.getState().quantities[group.id][group.options[0].id], group.minUnits);
          assert.equal(ui.setOptionQuantity(group.id, group.options[0].id, 0).code, 'COMPONENT_FIXED');
        }
      }
    }
  }
});

test('Flame Hour popup is read-only and cannot emit a payload outside its schedule', () => {
  const snapshot = createPublishedMenuSnapshot();
  const result = buildDeals(snapshot, AFTER_FLAME_HOUR);
  assert.equal(result.ok, true);
  const flameHourDeals = result.collections[0].deals.filter(deal => deal.title.startsWith('Flame Hour —'));
  assert.equal(flameHourDeals.length, 2);
  for (const flameHour of flameHourDeals) {
    const ui = dealConfigurator.createDealConfigurator(result, flameHour.id, {
      validateModifierSelections: dealView.validateModifierSelections
    });
    assert.equal(ui.ok, true);
    assert.equal(ui.selectVariant(flameHour.variants[0].id).ok, true);
    assert.equal(ui.toPayload().code, 'DEAL_READ_ONLY');
  }
});

