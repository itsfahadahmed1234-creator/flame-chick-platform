'use strict';

const IDS = Object.freeze({
  branch: '10000000-0000-4000-8000-000000000001',
  menuCategory: '20000000-0000-4000-8000-000000000001',
  dealCategory: '20000000-0000-4000-8000-000000000002',
  product: '30000000-0000-4000-8000-000000000001',
  variant: '40000000-0000-4000-8000-000000000001',
  modifierGroup: '50000000-0000-4000-8000-000000000001',
  modifier: '60000000-0000-4000-8000-000000000001',
  assignment: '70000000-0000-4000-8000-000000000001',
  priceRule: '80000000-0000-4000-8000-000000000001',
  drink: '90000000-0000-4000-8000-000000000001',
  dealCollection: 'a0000000-0000-4000-8000-000000000001',
  deal: 'b0000000-0000-4000-8000-000000000001',
  dealVariant: 'c0000000-0000-4000-8000-000000000001',
  componentGroup: 'd0000000-0000-4000-8000-000000000001',
  componentOption: 'e0000000-0000-4000-8000-000000000001',
  dealVariantOption: 'f0000000-0000-4000-8000-000000000001',
  schedule: '11000000-0000-4000-8000-000000000001',
  window: '12000000-0000-4000-8000-000000000001',
  dealSchedule: '13000000-0000-4000-8000-000000000001'
});

function createSnapshot() {
  const id = IDS;
  return {
    schemaVersion: 3,
    publishedAt: '2026-11-22T10:00:00.000Z',
    restaurantId: '14000000-0000-4000-8000-000000000001',
    restaurantSlug: 'flame-chick',
    settings: {
      restaurant_name: 'Flame Chick',
      currency_code: 'PKR',
      timezone: 'Asia/Karachi'
    },
    branches: [{
      branchId: id.branch, branchCode: 'main', name: 'Main Branch',
      address: null, phone: null, timezone: 'Asia/Karachi',
      websiteOrderingEnabled: true, websiteDeliveryEnabled: true, websitePickupEnabled: true
    }],
    categories: [
      { categoryId: id.menuCategory, legacyId: null, categoryKind: 'menu', nameEn: 'Burgers', nameUr: null, sortOrder: 1, categoryFolderKey: null, imageCurrentPath: null, imagePreviousPath: null },
      { categoryId: id.dealCategory, legacyId: null, categoryKind: 'deal', nameEn: 'Deals', nameUr: null, sortOrder: 2, categoryFolderKey: null, imageCurrentPath: null, imagePreviousPath: null }
    ],
    subcategories: [],
    products: [{
      productId: id.product, categoryId: id.menuCategory, subcategoryId: null,
      legacyId: null, nameEn: 'Classic Burger', nameUr: null,
      descriptionEn: null, descriptionUr: null, imageFolderKey: null, imageGroupId: null,
      imagePublished: false, imageExtension: null, imageCurrentPath: null,
      imagePreviousPath: null, imagePreviousExtension: null, featured: false,
      sortOrder: 1, available: true
    }],
    productVariants: [{
      variantId: id.variant, productId: id.product, legacyId: null,
      sizeKey: 'REGULAR', sizeLabel: 'Regular', variantKind: 'standard',
      price: 550, packQuantity: null, packUnit: null, standaloneSellable: true,
      sortOrder: 1, available: true
    }],
    modifierGroups: [{
      modifierGroupId: id.modifierGroup, legacyId: null, nameEn: 'Cheese',
      nameUr: null, standaloneOnly: false, selectionMode: 'ONE_OPTIONAL',
      minSelect: 0, maxSelect: 1, sortOrder: 1
    }],
    modifiers: [{
      modifierId: id.modifier, modifierGroupId: id.modifierGroup, legacyId: null,
      nameEn: 'Extra Cheese', nameUr: null, priceMode: 'BY_SIZE',
      fixedPrice: null, sortOrder: 1
    }],
    modifierGroupAssignments: [{
      assignmentId: id.assignment, modifierGroupId: id.modifierGroup,
      productId: id.product, sortOrder: 1
    }],
    modifierPriceRules: [{
      modifierPriceRuleId: id.priceRule, modifierId: id.modifier,
      modifierGroupId: id.modifierGroup, productId: id.product,
      productVariantId: id.variant, price: 80
    }],
    drinkOptions: [{
      drinkOptionId: id.drink, productVariantId: id.variant, legacyId: null,
      displayName: 'Regular', displayNameUr: null, volumeKey: 'REGULAR',
      volumeMl: 500, sortOrder: 1
    }],
    dealCollections: [{
      dealCollectionId: id.dealCollection, categoryId: id.dealCategory,
      scheduleSetId: id.schedule, nameEn: 'Meal Deals', nameUr: null, sortOrder: 1
    }],
    deals: [{
      dealId: id.deal, dealCollectionId: id.dealCollection, legacyId: null,
      title: 'Burger Meal', titleUr: null, descriptionEn: null, descriptionUr: null,
      legacyBundlePrice: null, imageCurrentPath: null, imagePreviousPath: null,
      featured: false, sortOrder: 1, available: true
    }],
    dealVariants: [{
      dealVariantId: id.dealVariant, dealId: id.deal, variantKey: 'REGULAR',
      labelEn: 'Regular', labelUr: null, pricingMode: 'FIXED_BUNDLE',
      basePrice: 750, sortOrder: 1
    }],
    dealComponentGroups: [{
      componentGroupId: id.componentGroup, dealId: id.deal,
      nameEn: 'Choose a drink', nameUr: null, minUnits: 1, maxUnits: 1,
      allowRepeatOption: false, maxUnitsPerOption: null, sortOrder: 1
    }],
    dealComponentOptions: [{
      componentOptionId: id.componentOption, dealId: id.deal,
      componentGroupId: id.componentGroup, productId: id.product,
      productVariantId: id.variant, sortOrder: 1
    }],
    dealVariantComponentOptions: [{
      dealVariantComponentOptionId: id.dealVariantOption, dealId: id.deal,
      dealVariantId: id.dealVariant, componentOptionId: id.componentOption,
      pricingTreatment: 'INCLUDED', unitSurcharge: 0,
      maxQuantityPerDeal: 1, sortOrder: 1
    }],
    scheduleSets: [{
      scheduleSetId: id.schedule, name: 'Always', timezone: 'Asia/Karachi',
      windows: [{
        windowId: id.window, windowKind: 'WEEKLY', weekdayIso: 1,
        localStart: null, localEnd: null, isAllDay: true,
        startsAt: null, endsAt: null, effectiveFrom: null, effectiveTo: null
      }]
    }],
    dealScheduleAssignments: [{
      assignmentId: id.dealSchedule, dealId: id.deal, branchId: null,
      scheduleSetId: id.schedule
    }],
    branchProductAvailability: [],
    branchVariantAvailability: [],
    branchDealAvailability: [],
    deliveryAreas: [],
    promotions: [],
    versionId: 'sha256:' + 'a'.repeat(64),
    publicationId: '15000000-0000-4000-8000-000000000001',
    publicationNumber: 1,
    draftRevision: 1,
    pricingEngineVersion: '1',
    snapshotSha256: 'a'.repeat(64)
  };
}

module.exports = { IDS, createSnapshot };
