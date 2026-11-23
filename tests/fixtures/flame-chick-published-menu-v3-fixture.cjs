'use strict';

const draft = require('../../ops/catalog-drafts/flame-chick-published-menu-2026-11-23.v3-draft.json');
const baseFixture = require('./catalog-v3-fixture.cjs');

function uuid(prefix, index) {
  return prefix + String(index).padStart(12, '0');
}

function createPublishedMenuSnapshot() {
  const snapshot = baseFixture.createSnapshot();
  const categoryIds = new Map();
  const productIds = new Map();
  const variantIds = new Map();
  const dealIds = new Map();
  const dealVariantIds = new Map();

  snapshot.categories = draft.categories.map((category, index) => {
    const categoryId = uuid('21000000-0000-4000-8000-', index + 1);
    categoryIds.set(category.key, categoryId);
    return {
      categoryId,
      legacyId: null,
      categoryKind: category.categoryKind,
      nameEn: category.nameEn,
      nameUr: null,
      sortOrder: index + 1,
      categoryFolderKey: null,
      imageCurrentPath: null,
      imagePreviousPath: null
    };
  });

  let variantCounter = 0;
  const variantRows = [];
  snapshot.products = draft.products.map((product, productIndex) => {
    const productId = uuid('31000000-0000-4000-8000-', productIndex + 1);
    productIds.set(product.key, productId);
    product.variants.forEach((variant, variantIndex) => {
      const variantId = uuid('41000000-0000-4000-8000-', ++variantCounter);
      variantIds.set(product.key + ':' + variant.variantKey, variantId);
      variantRows.push({
        variantId,
        productId,
        legacyId: null,
        sizeKey: variant.variantKey,
        sizeLabel: variant.sizeLabel,
        variantKind: variant.variantKind,
        price: variant.price,
        packQuantity: variant.packQuantity === undefined ? null : variant.packQuantity,
        packUnit: variant.packUnit === undefined ? null : variant.packUnit,
        standaloneSellable: variant.standaloneSellable,
        sortOrder: variantIndex + 1,
        available: true
      });
    });
    return {
      productId,
      categoryId: categoryIds.get(product.categoryKey),
      subcategoryId: null,
      legacyId: null,
      nameEn: product.nameEn,
      nameUr: null,
      descriptionEn: product.descriptionEn === undefined ? null : product.descriptionEn,
      descriptionUr: null,
      imageFolderKey: null,
      imageGroupId: null,
      imagePublished: false,
      imageExtension: null,
      imageCurrentPath: null,
      imagePreviousPath: null,
      imagePreviousExtension: null,
      featured: false,
      sortOrder: productIndex + 1,
      available: true
    };
  });
  snapshot.productVariants = variantRows;

  snapshot.subcategories = [];
  snapshot.modifierGroups = [];
  snapshot.modifiers = [];
  snapshot.modifierGroupAssignments = [];
  snapshot.modifierPriceRules = [];
  snapshot.drinkOptions = [];

  const collectionId = uuid('51000000-0000-4000-8000-', 1);
  snapshot.dealCollections = [{
    dealCollectionId: collectionId,
    categoryId: categoryIds.get(draft.dealCollection.categoryKey),
    scheduleSetId: null,
    nameEn: draft.dealCollection.nameEn,
    nameUr: null,
    sortOrder: 1
  }];

  snapshot.deals = draft.deals.map((deal, dealIndex) => {
    const dealId = uuid('52000000-0000-4000-8000-', dealIndex + 1);
    dealIds.set(deal.key, dealId);
    return {
      dealId,
      dealCollectionId: collectionId,
      legacyId: null,
      title: deal.title,
      titleUr: null,
      descriptionEn: deal.descriptionEn || null,
      descriptionUr: null,
      legacyBundlePrice: null,
      imageCurrentPath: null,
      imagePreviousPath: null,
      featured: false,
      sortOrder: dealIndex + 1,
      available: true
    };
  });

  let dealVariantCounter = 0;
  snapshot.dealVariants = [];
  snapshot.dealComponentGroups = [];
  snapshot.dealComponentOptions = [];
  snapshot.dealVariantComponentOptions = [];

  draft.deals.forEach(deal => {
    const dealId = dealIds.get(deal.key);
    deal.variants.forEach((variant, variantIndex) => {
      const dealVariantId = uuid('61000000-0000-4000-8000-', ++dealVariantCounter);
      dealVariantIds.set(deal.key + ':' + variant.variantKey, dealVariantId);
      snapshot.dealVariants.push({
        dealVariantId,
        dealId,
        variantKey: variant.variantKey,
        labelEn: variant.labelEn,
        labelUr: null,
        pricingMode: 'FIXED_BUNDLE',
        basePrice: variant.basePrice,
        sortOrder: variantIndex + 1
      });

      variant.components.forEach((component, componentIndex) => {
        const groupIndex = snapshot.dealComponentGroups.length + 1;
        const componentGroupId = uuid('71000000-0000-4000-8000-', groupIndex);
        const componentOptionId = uuid('81000000-0000-4000-8000-', groupIndex);
        const mappingId = uuid('91000000-0000-4000-8000-', groupIndex);
        const productId = productIds.get(component.productKey);
        const productVariantId = variantIds.get(component.productKey + ':' + component.variantKey);
        if (!productId || !productVariantId) {
          throw new Error('Draft component reference is missing: ' + deal.key + '/' + component.productKey + '/' + component.variantKey);
        }
        snapshot.dealComponentGroups.push({
          componentGroupId,
          dealId,
          nameEn: component.displayName,
          nameUr: null,
          minUnits: component.quantity,
          maxUnits: component.quantity,
          allowRepeatOption: false,
          maxUnitsPerOption: component.quantity,
          sortOrder: componentIndex + 1
        });
        snapshot.dealComponentOptions.push({
          componentOptionId,
          dealId,
          componentGroupId,
          productId,
          productVariantId,
          sortOrder: 1
        });
        snapshot.dealVariantComponentOptions.push({
          dealVariantComponentOptionId: mappingId,
          dealId,
          dealVariantId,
          componentOptionId,
          pricingTreatment: component.pricingTreatment,
          unitSurcharge: component.unitSurcharge,
          maxQuantityPerDeal: component.quantity,
          sortOrder: 1
        });
      });
    });
  });

  const scheduledDeals = draft.deals.filter(deal => deal.schedule);
  if (scheduledDeals.length) {
    const scheduleSetId = uuid('a1000000-0000-4000-8000-', 1);
    const schedule = scheduledDeals[0].schedule;
    if (!scheduledDeals.every(deal =>
      deal.schedule.timezone === schedule.timezone &&
      deal.schedule.localStart === schedule.localStart &&
      deal.schedule.localEnd === schedule.localEnd
    )) {
      throw new Error('Scheduled draft deals must share the same schedule set in this fixture.');
    }
    snapshot.scheduleSets = [{
      scheduleSetId,
      name: 'Flame Hour daily',
      timezone: schedule.timezone,
      windows: Array.from({ length: 7 }, (_, index) => ({
        windowId: uuid('a2000000-0000-4000-8000-', index + 1),
        windowKind: 'WEEKLY',
        weekdayIso: index + 1,
        localStart: schedule.localStart,
        localEnd: schedule.localEnd,
        isAllDay: false,
        startsAt: null,
        endsAt: null,
        effectiveFrom: null,
        effectiveTo: null
      }))
    }];
    snapshot.dealScheduleAssignments = scheduledDeals.map((deal, index) => ({
      assignmentId: uuid('a3000000-0000-4000-8000-', index + 1),
      dealId: dealIds.get(deal.key),
      branchId: null,
      scheduleSetId
    }));
  } else {
    snapshot.scheduleSets = [];
    snapshot.dealScheduleAssignments = [];
  }

  snapshot.branchProductAvailability = [];
  snapshot.branchVariantAvailability = [];
  snapshot.branchDealAvailability = [];
  snapshot.deliveryAreas = [];
  snapshot.promotions = [];

  return snapshot;
}

module.exports = {
  draft,
  createPublishedMenuSnapshot,
  ids: {
    categoryIds: categoryKey => uuid('21000000-0000-4000-8000-', draft.categories.findIndex(item => item.key === categoryKey) + 1),
    productIds: productKey => uuid('31000000-0000-4000-8000-', draft.products.findIndex(item => item.key === productKey) + 1),
    dealIds: dealKey => uuid('52000000-0000-4000-8000-', draft.deals.findIndex(item => item.key === dealKey) + 1)
  }
};
