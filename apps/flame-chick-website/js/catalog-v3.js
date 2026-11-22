/* Flame Chick published catalog V3 contract.
 *
 * This module validates the exact normalized snapshot produced by
 * flame_chick_catalog_compile_snapshot plus the immutable-publication metadata
 * added by flame-chick-catalog. It intentionally does not coerce V3 into the
 * legacy V2 DTO. A V3 snapshot is usable only after structural, scalar,
 * relationship, publication-metadata and size validation all pass.
 */
(function (root) {
  'use strict';

  var SCHEMA_VERSION = 3;
  var MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;
  var MAX_ERRORS = 50;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  var SHA256_RE = /^[0-9a-f]{64}$/;
  var KEY_RE = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;
  var TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?$/;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var ALLOWED_TOP_LEVEL = [
    'schemaVersion', 'publishedAt', 'restaurantId', 'restaurantSlug', 'settings',
    'branches', 'categories', 'subcategories', 'products', 'productVariants',
    'modifierGroups', 'modifiers', 'modifierGroupAssignments', 'modifierPriceRules',
    'drinkOptions', 'dealCollections', 'deals', 'dealVariants',
    'dealComponentGroups', 'dealComponentOptions', 'dealVariantComponentOptions',
    'scheduleSets', 'dealScheduleAssignments', 'branchProductAvailability',
    'branchVariantAvailability', 'branchDealAvailability', 'deliveryAreas',
    'promotions', 'versionId', 'publicationId', 'publicationNumber',
    'draftRevision', 'pricingEngineVersion', 'snapshotSha256'
  ];

  function isRecord(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function addError(errors, path, code, message) {
    if (errors.length < MAX_ERRORS) errors.push({ path: path, code: code, message: message });
  }

  function utf8ByteLength(value) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
    return unescape(encodeURIComponent(value)).length;
  }

  function exactKeys(obj, specs, path, errors) {
    if (!isRecord(obj)) {
      addError(errors, path, 'OBJECT_REQUIRED', 'Expected a plain JSON object.');
      return false;
    }
    var expected = Object.keys(specs);
    expected.forEach(function (key) {
      if (!hasOwn(obj, key)) addError(errors, path + '.' + key, 'FIELD_MISSING', 'Required field is missing.');
    });
    Object.keys(obj).forEach(function (key) {
      if (!hasOwn(specs, key)) addError(errors, path + '.' + key, 'FIELD_UNKNOWN', 'Field is not part of catalog schema V3.');
    });
    return true;
  }

  function isIsoDateTime(value) {
    return typeof value === 'string' && value.length >= 20 &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
      Number.isFinite(Date.parse(value));
  }

  function isIsoDate(value) {
    if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
    var d = new Date(value + 'T00:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }

  function isTime(value) {
    return typeof value === 'string' && TIME_RE.test(value);
  }

  function isTimezone(value) {
    if (typeof value !== 'string' || value.length < 1 || value.length > 80) return false;
    try {
      new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
      return true;
    } catch (e) {
      return false;
    }
  }

  function minorUnits(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 9999999999.99) return null;
    var scaled = value * 100;
    var rounded = Math.round(scaled);
    if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 0.00001) return null;
    return rounded;
  }

  function validateScalar(value, type, path, errors) {
    var ok = true;
    if (type === 'uuid') ok = typeof value === 'string' && UUID_RE.test(value);
    else if (type === 'nullableUuid') ok = value === null || (typeof value === 'string' && UUID_RE.test(value));
    else if (type === 'string') ok = typeof value === 'string' && value.length > 0 && value.trim() === value;
    else if (type === 'nullableString') ok = value === null || (typeof value === 'string' && value.trim() === value);
    else if (type === 'boolean') ok = typeof value === 'boolean';
    else if (type === 'integer') ok = Number.isSafeInteger(value) && value >= 0;
    else if (type === 'positiveInteger') ok = Number.isSafeInteger(value) && value > 0;
    else if (type === 'nullableInteger') ok = value === null || (Number.isSafeInteger(value) && value > 0);
    else if (type === 'money') ok = minorUnits(value) !== null;
    else if (type === 'nullableMoney') ok = value === null || minorUnits(value) !== null;
    else if (type === 'datetime') ok = isIsoDateTime(value);
    else if (type === 'date') ok = isIsoDate(value);
    else if (type === 'nullableDate') ok = value === null || isIsoDate(value);
    else if (type === 'nullableDatetime') ok = value === null || isIsoDateTime(value);
    else if (type.indexOf('enum:') === 0) ok = type.slice(5).split('|').indexOf(value) >= 0;
    else if (type === 'timezone') ok = isTimezone(value);
    else if (type === 'key') ok = typeof value === 'string' && KEY_RE.test(value);
    else if (type === 'time') ok = isTime(value);
    else if (type === 'nullableTime') ok = value === null || isTime(value);
    else if (type === 'array') ok = Array.isArray(value);
    if (!ok) addError(errors, path, 'FIELD_INVALID', 'Field does not match the V3 ' + type + ' contract.');
  }

  function validateObject(obj, specs, path, errors) {
    if (!exactKeys(obj, specs, path, errors)) return false;
    Object.keys(specs).forEach(function (key) {
      if (hasOwn(obj, key)) validateScalar(obj[key], specs[key], path + '.' + key, errors);
    });
    return true;
  }

  var ROW_SPECS = {
    branches: {
      branchId: 'uuid', branchCode: 'string', name: 'string', address: 'nullableString',
      phone: 'nullableString', timezone: 'timezone', websiteOrderingEnabled: 'boolean',
      websiteDeliveryEnabled: 'boolean', websitePickupEnabled: 'boolean'
    },
    categories: {
      categoryId: 'uuid', legacyId: 'nullableString', categoryKind: 'enum:menu|deal',
      nameEn: 'string', nameUr: 'nullableString', sortOrder: 'integer',
      categoryFolderKey: 'nullableString', imageCurrentPath: 'nullableString',
      imagePreviousPath: 'nullableString'
    },
    subcategories: {
      subcategoryId: 'uuid', categoryId: 'uuid', legacyId: 'nullableString',
      nameEn: 'string', nameUr: 'nullableString', sortOrder: 'integer'
    },
    products: {
      productId: 'uuid', categoryId: 'uuid', subcategoryId: 'nullableUuid',
      legacyId: 'nullableString', nameEn: 'string', nameUr: 'nullableString',
      descriptionEn: 'nullableString', descriptionUr: 'nullableString',
      imageFolderKey: 'nullableString', imageGroupId: 'nullableString',
      imagePublished: 'boolean', imageExtension: 'nullableString',
      imageCurrentPath: 'nullableString', imagePreviousPath: 'nullableString',
      imagePreviousExtension: 'nullableString', featured: 'boolean',
      sortOrder: 'integer', available: 'boolean'
    },
    productVariants: {
      variantId: 'uuid', productId: 'uuid', legacyId: 'nullableString',
      sizeKey: 'key', sizeLabel: 'string',
      variantKind: 'enum:standard|portion|flavour|pack|volume',
      price: 'money', packQuantity: 'nullableInteger', packUnit: 'nullableString',
      standaloneSellable: 'boolean', sortOrder: 'integer', available: 'boolean'
    },
    modifierGroups: {
      modifierGroupId: 'uuid', legacyId: 'nullableString', nameEn: 'string',
      nameUr: 'nullableString', standaloneOnly: 'boolean',
      selectionMode: 'enum:ONE_OPTIONAL|ONE_REQUIRED|MULTIPLE_OPTIONAL|MULTIPLE_REQUIRED',
      minSelect: 'integer', maxSelect: 'positiveInteger', sortOrder: 'integer'
    },
    modifiers: {
      modifierId: 'uuid', modifierGroupId: 'uuid', legacyId: 'nullableString',
      nameEn: 'string', nameUr: 'nullableString', priceMode: 'enum:FREE|FIXED|BY_SIZE',
      fixedPrice: 'nullableMoney', sortOrder: 'integer'
    },
    modifierGroupAssignments: {
      assignmentId: 'uuid', modifierGroupId: 'uuid', productId: 'uuid', sortOrder: 'integer'
    },
    modifierPriceRules: {
      modifierPriceRuleId: 'uuid', modifierId: 'uuid', modifierGroupId: 'uuid',
      productId: 'uuid', productVariantId: 'uuid', price: 'money'
    },
    drinkOptions: {
      drinkOptionId: 'uuid', productVariantId: 'nullableUuid', legacyId: 'nullableString',
      displayName: 'string', displayNameUr: 'nullableString', volumeKey: 'key',
      volumeMl: 'nullableInteger', sortOrder: 'integer'
    },
    dealCollections: {
      dealCollectionId: 'uuid', categoryId: 'uuid', scheduleSetId: 'nullableUuid',
      nameEn: 'string', nameUr: 'nullableString', sortOrder: 'integer'
    },
    deals: {
      dealId: 'uuid', dealCollectionId: 'uuid', legacyId: 'nullableString',
      title: 'string', titleUr: 'nullableString', descriptionEn: 'nullableString',
      descriptionUr: 'nullableString', legacyBundlePrice: 'nullableMoney',
      imageCurrentPath: 'nullableString', imagePreviousPath: 'nullableString',
      featured: 'boolean', sortOrder: 'integer', available: 'boolean'
    },
    dealVariants: {
      dealVariantId: 'uuid', dealId: 'uuid', variantKey: 'key', labelEn: 'string',
      labelUr: 'nullableString', pricingMode: 'enum:FIXED_BUNDLE|BASE_PLUS_SELECTED_ITEMS',
      basePrice: 'money', sortOrder: 'integer'
    },
    dealComponentGroups: {
      componentGroupId: 'uuid', dealId: 'uuid', nameEn: 'string',
      nameUr: 'nullableString', minUnits: 'integer', maxUnits: 'positiveInteger',
      allowRepeatOption: 'boolean', maxUnitsPerOption: 'nullableInteger', sortOrder: 'integer'
    },
    dealComponentOptions: {
      componentOptionId: 'uuid', dealId: 'uuid', componentGroupId: 'uuid',
      productId: 'uuid', productVariantId: 'uuid', sortOrder: 'integer'
    },
    dealVariantComponentOptions: {
      dealVariantComponentOptionId: 'uuid', dealId: 'uuid', dealVariantId: 'uuid',
      componentOptionId: 'uuid',
      pricingTreatment: 'enum:INCLUDED|SURCHARGE|STANDALONE',
      unitSurcharge: 'money', maxQuantityPerDeal: 'nullableInteger', sortOrder: 'integer'
    },
    dealScheduleAssignments: {
      assignmentId: 'uuid', dealId: 'uuid', branchId: 'nullableUuid', scheduleSetId: 'uuid'
    },
    branchProductAvailability: {
      branchId: 'uuid', productId: 'uuid', isAvailable: 'boolean'
    },
    branchVariantAvailability: {
      branchId: 'uuid', productId: 'uuid', productVariantId: 'uuid', isAvailable: 'boolean'
    },
    branchDealAvailability: {
      branchId: 'uuid', dealId: 'uuid', isAvailable: 'boolean'
    }
  };

  var TOP_ARRAYS = [
    'branches', 'categories', 'subcategories', 'products', 'productVariants',
    'modifierGroups', 'modifiers', 'modifierGroupAssignments', 'modifierPriceRules',
    'drinkOptions', 'dealCollections', 'deals', 'dealVariants', 'dealComponentGroups',
    'dealComponentOptions', 'dealVariantComponentOptions', 'scheduleSets',
    'dealScheduleAssignments', 'branchProductAvailability',
    'branchVariantAvailability', 'branchDealAvailability', 'deliveryAreas', 'promotions'
  ];

  function addUnique(map, id, path, errors) {
    if (hasOwn(map, id)) addError(errors, path, 'DUPLICATE_ID', 'Duplicate identifier in this collection.');
    else map[id] = true;
  }

  function lookup(map, id) { return id !== null && hasOwn(map, id); }

  function mapBy(rows, idKey) {
    var map = Object.create(null);
    rows.forEach(function (row) { map[row[idKey]] = row; });
    return map;
  }

  function duplicateCheck(snapshot, key, idKey, errors) {
    var seen = Object.create(null);
    snapshot[key].forEach(function (row, index) {
      addUnique(seen, row[idKey], key + '[' + index + '].' + idKey, errors);
    });
    return seen;
  }

  function checkReference(map, id, path, errors, nullable) {
    if (nullable && id === null) return;
    if (!lookup(map, id)) addError(errors, path, 'REFERENCE_MISSING', 'Referenced row is not present in this publication.');
  }

  function checkComposite(seen, key, path, errors) {
    if (hasOwn(seen, key)) addError(errors, path, 'DUPLICATE_RELATION', 'Duplicate relationship in this publication.');
    else seen[key] = true;
  }

  function validateScheduleWindows(sets, errors) {
    var windowIds = Object.create(null);
    sets.forEach(function (set, setIndex) {
      var rows = set.windows;
      rows.forEach(function (w, index) {
        var path = 'scheduleSets[' + setIndex + '].windows[' + index + ']';
        if (!isRecord(w)) {
          addError(errors, path, 'OBJECT_REQUIRED', 'Expected a schedule window object.');
          return;
        }
        var specs = {
          windowId: 'uuid', windowKind: 'enum:WEEKLY|ONE_OFF',
          weekdayIso: 'nullableInteger', localStart: 'nullableTime', localEnd: 'nullableTime',
          isAllDay: 'boolean', startsAt: 'nullableDatetime', endsAt: 'nullableDatetime',
          effectiveFrom: 'nullableDate', effectiveTo: 'nullableDate'
        };
        validateObject(w, specs, path, errors);
        addUnique(windowIds, w.windowId, path + '.windowId', errors);
        if (w.effectiveFrom !== null && w.effectiveTo !== null &&
            isIsoDate(w.effectiveFrom) && isIsoDate(w.effectiveTo) && w.effectiveFrom > w.effectiveTo) {
          addError(errors, path, 'DATE_RANGE_INVALID', 'effectiveTo must not precede effectiveFrom.');
        }
        if (w.windowKind === 'WEEKLY') {
          if (!(Number.isInteger(w.weekdayIso) && w.weekdayIso >= 1 && w.weekdayIso <= 7) ||
              w.startsAt !== null || w.endsAt !== null) {
            addError(errors, path, 'WEEKLY_WINDOW_INVALID', 'Weekly windows require an ISO weekday and no absolute timestamps.');
          }
          if (w.isAllDay) {
            if (w.localStart !== null || w.localEnd !== null) {
              addError(errors, path, 'WEEKLY_ALL_DAY_INVALID', 'All-day weekly windows must not include local start/end times.');
            }
          } else if (!isTime(w.localStart) || !isTime(w.localEnd) || w.localStart === w.localEnd) {
            addError(errors, path, 'WEEKLY_TIME_INVALID', 'Timed weekly windows require different valid local start/end times.');
          }
        } else if (w.windowKind === 'ONE_OFF') {
          if (w.weekdayIso !== null || w.localStart !== null || w.localEnd !== null ||
              w.isAllDay !== false || w.effectiveFrom !== null || w.effectiveTo !== null ||
              !isIsoDateTime(w.startsAt) || !isIsoDateTime(w.endsAt) ||
              Date.parse(w.endsAt) <= Date.parse(w.startsAt)) {
            addError(errors, path, 'ONE_OFF_WINDOW_INVALID', 'One-off windows require valid absolute timestamps, end > start, and no weekly fields.');
          }
        }
      });
    });
  }

  function validateRelationships(s, errors) {
    var maps = {
      branches: mapBy(s.branches, 'branchId'),
      categories: mapBy(s.categories, 'categoryId'),
      subcategories: mapBy(s.subcategories, 'subcategoryId'),
      products: mapBy(s.products, 'productId'),
      variants: mapBy(s.productVariants, 'variantId'),
      modifierGroups: mapBy(s.modifierGroups, 'modifierGroupId'),
      modifiers: mapBy(s.modifiers, 'modifierId'),
      assignments: mapBy(s.modifierGroupAssignments, 'assignmentId'),
      modifierRules: mapBy(s.modifierPriceRules, 'modifierPriceRuleId'),
      dealCollections: mapBy(s.dealCollections, 'dealCollectionId'),
      deals: mapBy(s.deals, 'dealId'),
      dealVariants: mapBy(s.dealVariants, 'dealVariantId'),
      componentGroups: mapBy(s.dealComponentGroups, 'componentGroupId'),
      componentOptions: mapBy(s.dealComponentOptions, 'componentOptionId'),
      schedules: Object.create(null)
    };
    s.scheduleSets.forEach(function (row) { maps.schedules[row.scheduleSetId] = row; });

    s.subcategories.forEach(function (row, i) {
      var cat = maps.categories[row.categoryId];
      if (!cat || cat.categoryKind !== 'menu') addError(errors, 'subcategories[' + i + '].categoryId', 'CATEGORY_KIND_INVALID', 'Subcategories must reference a menu category.');
    });
    s.products.forEach(function (row, i) {
      var cat = maps.categories[row.categoryId];
      if (!cat || cat.categoryKind !== 'menu') addError(errors, 'products[' + i + '].categoryId', 'CATEGORY_KIND_INVALID', 'Products must reference a menu category.');
      if (row.subcategoryId !== null) {
        var sub = maps.subcategories[row.subcategoryId];
        if (!sub || sub.categoryId !== row.categoryId) addError(errors, 'products[' + i + '].subcategoryId', 'SUBCATEGORY_SCOPE_INVALID', 'Subcategory must belong to the product category.');
      }
    });
    s.productVariants.forEach(function (row, i) {
      checkReference(maps.products, row.productId, 'productVariants[' + i + '].productId', errors);
      if (row.variantKind === 'pack') {
        if (row.packQuantity === null || row.packUnit === null || !row.packUnit.length) addError(errors, 'productVariants[' + i + ']', 'PACK_METADATA_INVALID', 'Pack variants require a positive count and unit.');
      } else if (row.packQuantity !== null || row.packUnit !== null) {
        addError(errors, 'productVariants[' + i + ']', 'PACK_METADATA_INVALID', 'Only pack variants may carry pack count metadata.');
      }
    });
    s.modifiers.forEach(function (row, i) {
      checkReference(maps.modifierGroups, row.modifierGroupId, 'modifiers[' + i + '].modifierGroupId', errors);
      if (row.priceMode === 'FIXED' && row.fixedPrice === null) addError(errors, 'modifiers[' + i + '].fixedPrice', 'FIXED_PRICE_REQUIRED', 'FIXED modifiers require a fixed price.');
      if (row.priceMode !== 'FIXED' && row.fixedPrice !== null) addError(errors, 'modifiers[' + i + '].fixedPrice', 'FIXED_PRICE_FORBIDDEN', 'Only FIXED modifiers may define fixedPrice.');
    });
    s.modifierGroups.forEach(function (row, i) {
      var max = row.maxSelect, min = row.minSelect;
      var valid = min <= max && max <= 50;
      if (row.selectionMode === 'ONE_OPTIONAL') valid = valid && min === 0 && max === 1;
      if (row.selectionMode === 'ONE_REQUIRED') valid = valid && min === 1 && max === 1;
      if (row.selectionMode === 'MULTIPLE_OPTIONAL') valid = valid && min === 0;
      if (row.selectionMode === 'MULTIPLE_REQUIRED') valid = valid && min >= 1;
      if (!valid) addError(errors, 'modifierGroups[' + i + ']', 'MODIFIER_SELECTION_BOUNDS_INVALID', 'Selection mode and min/max bounds are inconsistent.');
    });
    s.modifierGroupAssignments.forEach(function (row, i) {
      checkReference(maps.modifierGroups, row.modifierGroupId, 'modifierGroupAssignments[' + i + '].modifierGroupId', errors);
      checkReference(maps.products, row.productId, 'modifierGroupAssignments[' + i + '].productId', errors);
    });
    var assignmentPairs = Object.create(null);
    s.modifierGroupAssignments.forEach(function (row, i) {
      checkComposite(assignmentPairs, row.modifierGroupId + ':' + row.productId, 'modifierGroupAssignments[' + i + ']', errors);
    });
    var rulePairs = Object.create(null);
    s.modifierPriceRules.forEach(function (row, i) {
      var modifier = maps.modifiers[row.modifierId];
      var variant = maps.variants[row.productVariantId];
      checkReference(maps.modifierGroups, row.modifierGroupId, 'modifierPriceRules[' + i + '].modifierGroupId', errors);
      checkReference(maps.products, row.productId, 'modifierPriceRules[' + i + '].productId', errors);
      if (!modifier || modifier.modifierGroupId !== row.modifierGroupId) addError(errors, 'modifierPriceRules[' + i + '].modifierId', 'MODIFIER_SCOPE_INVALID', 'Modifier must belong to the referenced modifier group.');
      if (!variant || variant.productId !== row.productId) addError(errors, 'modifierPriceRules[' + i + '].productVariantId', 'VARIANT_SCOPE_INVALID', 'Price rule variant must belong to the referenced product.');
      if (!s.modifierGroupAssignments.some(function (a) { return a.productId === row.productId && a.modifierGroupId === row.modifierGroupId; })) {
        addError(errors, 'modifierPriceRules[' + i + ']', 'MODIFIER_ASSIGNMENT_MISSING', 'Price rule requires a product-to-group assignment.');
      }
      if (modifier && modifier.priceMode !== 'BY_SIZE') addError(errors, 'modifierPriceRules[' + i + '].modifierId', 'MODIFIER_PRICE_MODE_INVALID', 'Price rules are allowed only for BY_SIZE modifiers.');
      checkComposite(rulePairs, row.modifierId + ':' + row.productVariantId, 'modifierPriceRules[' + i + ']', errors);
    });
    s.drinkOptions.forEach(function (row, i) {
      checkReference(maps.variants, row.productVariantId, 'drinkOptions[' + i + '].productVariantId', errors, true);
    });
    s.dealCollections.forEach(function (row, i) {
      var cat = maps.categories[row.categoryId];
      if (!cat || cat.categoryKind !== 'deal') addError(errors, 'dealCollections[' + i + '].categoryId', 'CATEGORY_KIND_INVALID', 'Deal collections must reference a deal category.');
      checkReference(maps.schedules, row.scheduleSetId, 'dealCollections[' + i + '].scheduleSetId', errors, true);
    });
    s.deals.forEach(function (row, i) {
      checkReference(maps.dealCollections, row.dealCollectionId, 'deals[' + i + '].dealCollectionId', errors);
    });
    s.dealVariants.forEach(function (row, i) {
      checkReference(maps.deals, row.dealId, 'dealVariants[' + i + '].dealId', errors);
    });
    s.dealComponentGroups.forEach(function (row, i) {
      checkReference(maps.deals, row.dealId, 'dealComponentGroups[' + i + '].dealId', errors);
      if (row.minUnits > row.maxUnits || row.maxUnits > 100 ||
          (row.maxUnitsPerOption !== null && (row.maxUnitsPerOption < 1 || row.maxUnitsPerOption > row.maxUnits))) {
        addError(errors, 'dealComponentGroups[' + i + ']', 'COMPONENT_GROUP_BOUNDS_INVALID', 'Component group quantity bounds are inconsistent.');
      }
    });
    s.dealComponentOptions.forEach(function (row, i) {
      checkReference(maps.deals, row.dealId, 'dealComponentOptions[' + i + '].dealId', errors);
      var group = maps.componentGroups[row.componentGroupId];
      var variant = maps.variants[row.productVariantId];
      checkReference(maps.products, row.productId, 'dealComponentOptions[' + i + '].productId', errors);
      if (!group || group.dealId !== row.dealId) addError(errors, 'dealComponentOptions[' + i + '].componentGroupId', 'COMPONENT_GROUP_SCOPE_INVALID', 'Component group must belong to the same deal.');
      if (!variant || variant.productId !== row.productId) addError(errors, 'dealComponentOptions[' + i + '].productVariantId', 'VARIANT_SCOPE_INVALID', 'Component variant must belong to the referenced product.');
    });
    var dealOptionPairs = Object.create(null);
    s.dealComponentOptions.forEach(function (row, i) {
      checkComposite(dealOptionPairs, row.componentGroupId + ':' + row.productVariantId, 'dealComponentOptions[' + i + ']', errors);
    });
    var dealVariantOptionPairs = Object.create(null);
    s.dealVariantComponentOptions.forEach(function (row, i) {
      var dealVariant = maps.dealVariants[row.dealVariantId];
      var option = maps.componentOptions[row.componentOptionId];
      var deal = maps.deals[row.dealId];
      if (!dealVariant || dealVariant.dealId !== row.dealId) addError(errors, 'dealVariantComponentOptions[' + i + '].dealVariantId', 'DEAL_VARIANT_SCOPE_INVALID', 'Deal variant must belong to the same deal.');
      if (!option || option.dealId !== row.dealId) addError(errors, 'dealVariantComponentOptions[' + i + '].componentOptionId', 'COMPONENT_OPTION_SCOPE_INVALID', 'Component option must belong to the same deal.');
      if (row.pricingTreatment === 'STANDALONE' && dealVariant && dealVariant.pricingMode === 'FIXED_BUNDLE') {
        addError(errors, 'dealVariantComponentOptions[' + i + '].pricingTreatment', 'PRICING_TREATMENT_INVALID', 'FIXED_BUNDLE deal variants cannot add STANDALONE component prices.');
      }
      if (row.pricingTreatment !== 'SURCHARGE' && minorUnits(row.unitSurcharge) !== 0) {
        addError(errors, 'dealVariantComponentOptions[' + i + '].unitSurcharge', 'SURCHARGE_INVALID', 'Only SURCHARGE treatment may carry a non-zero unit surcharge.');
      }
      checkComposite(dealVariantOptionPairs, row.dealVariantId + ':' + row.componentOptionId, 'dealVariantComponentOptions[' + i + ']', errors);
    });
    var windowSets = Object.create(null);
    s.scheduleSets.forEach(function (row, i) {
      if (!isTimezone(row.timezone)) addError(errors, 'scheduleSets[' + i + '].timezone', 'TIMEZONE_INVALID', 'Schedule timezone must be a valid IANA timezone.');
      if (!Array.isArray(row.windows)) addError(errors, 'scheduleSets[' + i + '].windows', 'ARRAY_REQUIRED', 'Schedule windows must be an array.');
      windowSets[row.scheduleSetId] = true;
    });
    validateScheduleWindows(s.scheduleSets, errors);
    s.dealScheduleAssignments.forEach(function (row, i) {
      var deal = maps.deals[row.dealId];
      var schedule = maps.schedules[row.scheduleSetId];
      checkReference(maps.branches, row.branchId, 'dealScheduleAssignments[' + i + '].branchId', errors, true);
      if (!deal) addError(errors, 'dealScheduleAssignments[' + i + '].dealId', 'DEAL_MISSING', 'Schedule assignment deal is missing.');
      if (!schedule) addError(errors, 'dealScheduleAssignments[' + i + '].scheduleSetId', 'SCHEDULE_MISSING', 'Schedule assignment schedule is missing.');
      if (schedule && row.branchId === null && schedule.timezone !== s.settings.timezone) {
        addError(errors, 'dealScheduleAssignments[' + i + '].scheduleSetId', 'SCHEDULE_TIMEZONE_SCOPE_INVALID', 'Global deal schedule timezone must match the restaurant timezone.');
      }
      if (schedule && row.branchId !== null) {
        var branch = maps.branches[row.branchId];
        if (branch && schedule.timezone !== branch.timezone) addError(errors, 'dealScheduleAssignments[' + i + '].scheduleSetId', 'SCHEDULE_TIMEZONE_SCOPE_INVALID', 'Branch deal schedule timezone must match the branch timezone.');
      }
    });
    var availabilityPairs = Object.create(null);
    s.branchProductAvailability.forEach(function (row, i) {
      checkReference(maps.branches, row.branchId, 'branchProductAvailability[' + i + '].branchId', errors);
      checkReference(maps.products, row.productId, 'branchProductAvailability[' + i + '].productId', errors);
      checkComposite(availabilityPairs, row.branchId + ':' + row.productId, 'branchProductAvailability[' + i + ']', errors);
    });
    availabilityPairs = Object.create(null);
    s.branchVariantAvailability.forEach(function (row, i) {
      var variant = maps.variants[row.productVariantId];
      checkReference(maps.branches, row.branchId, 'branchVariantAvailability[' + i + '].branchId', errors);
      checkReference(maps.products, row.productId, 'branchVariantAvailability[' + i + '].productId', errors);
      if (!variant || variant.productId !== row.productId) addError(errors, 'branchVariantAvailability[' + i + '].productVariantId', 'VARIANT_SCOPE_INVALID', 'Availability variant must belong to the referenced product.');
      checkComposite(availabilityPairs, row.branchId + ':' + row.productVariantId, 'branchVariantAvailability[' + i + ']', errors);
    });
    availabilityPairs = Object.create(null);
    s.branchDealAvailability.forEach(function (row, i) {
      checkReference(maps.branches, row.branchId, 'branchDealAvailability[' + i + '].branchId', errors);
      checkReference(maps.deals, row.dealId, 'branchDealAvailability[' + i + '].dealId', errors);
      checkComposite(availabilityPairs, row.branchId + ':' + row.dealId, 'branchDealAvailability[' + i + ']', errors);
    });
    return maps;
  }

  function validateSnapshot(snapshot) {
    var errors = [];
    if (!isRecord(snapshot)) return { ok: false, code: 'SNAPSHOT_INVALID', errors: [{ path: '$', code: 'OBJECT_REQUIRED', message: 'Expected a plain JSON object.' }] };

    var serialized;
    try { serialized = JSON.stringify(snapshot); }
    catch (e) { return { ok: false, code: 'SNAPSHOT_SERIALIZATION_FAILED', errors: [{ path: '$', code: 'SERIALIZATION_FAILED', message: 'Snapshot could not be serialized.' }] }; }
    if (typeof serialized !== 'string' || utf8ByteLength(serialized) > MAX_SNAPSHOT_BYTES + 4096) {
      return { ok: false, code: 'SNAPSHOT_TOO_LARGE', errors: [{ path: '$', code: 'SIZE_LIMIT', message: 'Snapshot exceeds the published catalog size limit.' }] };
    }

    var topSpecs = Object.create(null);
    ALLOWED_TOP_LEVEL.forEach(function (key) { topSpecs[key] = 'present'; });
    exactKeys(snapshot, topSpecs, '$', errors);

    validateScalar(snapshot.schemaVersion, 'integer', '$.schemaVersion', errors);
    if (snapshot.schemaVersion !== SCHEMA_VERSION) addError(errors, '$.schemaVersion', 'SCHEMA_UNSUPPORTED', 'Only catalog schema V3 is supported by this contract.');
    validateScalar(snapshot.publishedAt, 'datetime', '$.publishedAt', errors);
    validateScalar(snapshot.restaurantId, 'uuid', '$.restaurantId', errors);
    if (typeof snapshot.restaurantSlug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(snapshot.restaurantSlug)) {
      addError(errors, '$.restaurantSlug', 'SLUG_INVALID', 'Restaurant slug must be lowercase kebab-case.');
    }
    validateObject(snapshot.settings, {
      restaurant_name: 'string', currency_code: 'string', timezone: 'timezone'
    }, '$.settings', errors);
    if (snapshot.settings && snapshot.settings.currency_code && !/^[A-Z]{3}$/.test(snapshot.settings.currency_code)) {
      addError(errors, '$.settings.currency_code', 'CURRENCY_INVALID', 'Currency must be an uppercase three-letter code.');
    }
    validateScalar(snapshot.versionId, 'string', '$.versionId', errors);
    validateScalar(snapshot.publicationId, 'uuid', '$.publicationId', errors);
    validateScalar(snapshot.publicationNumber, 'positiveInteger', '$.publicationNumber', errors);
    validateScalar(snapshot.draftRevision, 'integer', '$.draftRevision', errors);
    validateScalar(snapshot.pricingEngineVersion, 'string', '$.pricingEngineVersion', errors);
    validateScalar(snapshot.snapshotSha256, 'string', '$.snapshotSha256', errors);
    if (typeof snapshot.snapshotSha256 !== 'string' || !SHA256_RE.test(snapshot.snapshotSha256)) {
      addError(errors, '$.snapshotSha256', 'CHECKSUM_INVALID', 'Snapshot SHA-256 must be 64 lowercase hexadecimal characters.');
    }
    if (snapshot.versionId !== 'sha256:' + snapshot.snapshotSha256) {
      addError(errors, '$.versionId', 'VERSION_ID_MISMATCH', 'versionId must be derived from snapshotSha256.');
    }

    TOP_ARRAYS.forEach(function (key) {
      if (!Array.isArray(snapshot[key])) addError(errors, '$.' + key, 'ARRAY_REQUIRED', 'Published V3 field must be an array.');
      else if (snapshot[key].length > 10000) addError(errors, '$.' + key, 'ARRAY_LIMIT', 'Published collection exceeds 10,000 rows.');
    });
    if (errors.length) return { ok: false, code: errors.some(function (e) { return e.code === 'SCHEMA_UNSUPPORTED'; }) ? 'SCHEMA_UNSUPPORTED' : 'SNAPSHOT_INVALID', errors: errors };

    TOP_ARRAYS.forEach(function (key) {
      var specs = ROW_SPECS[key];
      if (!specs) return;
      snapshot[key].forEach(function (row, index) {
        validateObject(row, specs, key + '[' + index + ']', errors);
      });
    });

    snapshot.scheduleSets.forEach(function (row, index) {
      validateObject(row, { scheduleSetId: 'uuid', name: 'string', timezone: 'timezone', windows: 'array' }, 'scheduleSets[' + index + ']', errors);
    });

    ['deliveryAreas', 'promotions'].forEach(function (key) {
      if (Array.isArray(snapshot[key]) && snapshot[key].length !== 0) {
        addError(errors, '$.' + key, 'FEATURE_NOT_SUPPORTED', key + ' are not implemented in publication schema V3 and must remain empty.');
      }
    });

    if (snapshot.branches.length === 0) addError(errors, '$.branches', 'BRANCH_REQUIRED', 'A published catalog must contain at least one active branch.');
    if (errors.length) return { ok: false, code: 'SNAPSHOT_INVALID', errors: errors };

    var idKeys = {
      branches: 'branchId', categories: 'categoryId', subcategories: 'subcategoryId',
      products: 'productId', productVariants: 'variantId', modifierGroups: 'modifierGroupId',
      modifiers: 'modifierId', modifierGroupAssignments: 'assignmentId',
      modifierPriceRules: 'modifierPriceRuleId', drinkOptions: 'drinkOptionId',
      dealCollections: 'dealCollectionId', deals: 'dealId', dealVariants: 'dealVariantId',
      dealComponentGroups: 'componentGroupId', dealComponentOptions: 'componentOptionId',
      dealVariantComponentOptions: 'dealVariantComponentOptionId',
      dealScheduleAssignments: 'assignmentId'
    };
    Object.keys(idKeys).forEach(function (key) { duplicateCheck(snapshot, key, idKeys[key], errors); });
    duplicateCheck(snapshot, 'scheduleSets', 'scheduleSetId', errors);
    var maps = validateRelationships(snapshot, errors);

    if (errors.length) return { ok: false, code: 'SNAPSHOT_INVALID', errors: errors };
    return {
      ok: true,
      schemaVersion: SCHEMA_VERSION,
      snapshot: snapshot,
      indexes: {
        branches: maps.branches, categories: maps.categories, subcategories: maps.subcategories,
        products: maps.products, variants: maps.variants, modifierGroups: maps.modifierGroups,
        modifiers: maps.modifiers, dealCollections: maps.dealCollections, deals: maps.deals,
        dealVariants: maps.dealVariants, componentGroups: maps.componentGroups,
        componentOptions: maps.componentOptions, schedules: maps.schedules
      },
      money: { minorUnits: minorUnits }
    };
  }

  function validateHealth(payload) {
    if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) {
      return { ok: false, code: 'HEALTH_INVALID', message: 'Catalog health envelope is invalid.' };
    }
    var data = payload.data;
    if (data.schemaVersion !== SCHEMA_VERSION) {
      return { ok: false, code: 'SCHEMA_UNSUPPORTED', message: 'Catalog health schema is not V3.' };
    }
    if (typeof data.published !== 'boolean') {
      return { ok: false, code: 'HEALTH_PUBLISHED_INVALID', message: 'Catalog health response omitted published state.' };
    }
    if (!data.published) return { ok: true, published: false, schemaVersion: SCHEMA_VERSION, versionId: null };
    if (!UUID_RE.test(data.publicationId || '') || !Number.isSafeInteger(data.publicationNumber) ||
        data.publicationNumber < 1 || !Number.isSafeInteger(data.draftRevision) || data.draftRevision < 0 ||
        !SHA256_RE.test(data.snapshotSha256 || '') || !isIsoDateTime(data.publishedAt)) {
      return { ok: false, code: 'HEALTH_METADATA_INVALID', message: 'Published health metadata is incomplete or invalid.' };
    }
    return {
      ok: true, published: true, schemaVersion: SCHEMA_VERSION,
      publicationId: data.publicationId, publicationNumber: data.publicationNumber,
      draftRevision: data.draftRevision, snapshotSha256: data.snapshotSha256,
      publishedAt: data.publishedAt, versionId: 'sha256:' + data.snapshotSha256
    };
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    MAX_SNAPSHOT_BYTES: MAX_SNAPSHOT_BYTES,
    validateSnapshot: validateSnapshot,
    validateHealth: validateHealth,
    minorUnits: minorUnits
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlameChickCatalogV3 = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
