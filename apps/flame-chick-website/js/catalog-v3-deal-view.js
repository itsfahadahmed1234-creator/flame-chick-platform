/* Flame Chick V3 deal-choice and schedule helpers.
 *
 * These functions consume only a fully validated immutable V3 publication.
 * Schedule evaluation requires an explicit instant supplied by a trusted
 * server response. Never substitute Date.now() or the customer's device clock.
 * This module produces choice constraints and display metadata, not a price
 * total. Checkout must revalidate every selected ID and recalculate on server.
 */
(function (root) {
  'use strict';

  function fail(code, message) {
    return { ok: false, code: code, message: message };
  }

  function isRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function find(rows, key, value) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][key] === value) return rows[i];
    }
    return null;
  }

  function sortByOrder(rows, idKey) {
    return rows.slice().sort(function (a, b) {
      return a.sortOrder - b.sortOrder || String(a[idKey]).localeCompare(String(b[idKey]));
    });
  }

  function parseTimeSeconds(value) {
    if (typeof value !== 'string') return null;
    var match = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/.exec(value);
    if (!match) return null;
    var fraction = match[4] ? Number('0.' + match[4]) : 0;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + fraction;
  }

  function localParts(instant, timezone) {
    var date = instant instanceof Date ? instant : new Date(instant);
    if (!Number.isFinite(date.getTime())) return null;
    var formatter;
    try {
      formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        calendar: 'iso8601',
        numberingSystem: 'latn',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      });
    } catch (error) {
      return null;
    }
    var parts = formatter.formatToParts(date);
    var values = Object.create(null);
    parts.forEach(function (part) {
      if (part.type !== 'literal') values[part.type] = part.value;
    });
    var year = Number(values.year), month = Number(values.month), day = Number(values.day);
    var hour = Number(values.hour), minute = Number(values.minute), second = Number(values.second);
    if (![year, month, day, hour, minute, second].every(Number.isInteger)) return null;
    var dateKey = String(year).padStart(4, '0') + '-' +
      String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    var weekdayDate = new Date(Date.UTC(year, month - 1, day));
    var weekdayIso = weekdayDate.getUTCDay() || 7;
    return {
      date: dateKey,
      weekdayIso: weekdayIso,
      secondsOfDay: hour * 3600 + minute * 60 + second
    };
  }

  function previousDate(dateKey) {
    var parts = dateKey.split('-').map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] - 1));
    return date.toISOString().slice(0, 10);
  }

  function inEffectiveDateRange(window, dateKey) {
    if (window.effectiveFrom !== null && dateKey < window.effectiveFrom) return false;
    if (window.effectiveTo !== null && dateKey > window.effectiveTo) return false;
    return true;
  }

  function weeklyWindowMatches(window, parts) {
    var start = parseTimeSeconds(window.localStart);
    var end = parseTimeSeconds(window.localEnd);
    if (window.isAllDay) {
      return parts.weekdayIso === window.weekdayIso &&
        inEffectiveDateRange(window, parts.date);
    }
    if (start === null || end === null || start === end) return false;

    if (end > start) {
      return parts.weekdayIso === window.weekdayIso &&
        inEffectiveDateRange(window, parts.date) &&
        parts.secondsOfDay >= start && parts.secondsOfDay < end;
    }

    // Overnight window: weekday/effective date belong to the starting day.
    if (parts.weekdayIso === window.weekdayIso &&
        inEffectiveDateRange(window, parts.date) &&
        parts.secondsOfDay >= start) return true;

    if (parts.secondsOfDay < end) {
      var startDate = previousDate(parts.date);
      var startWeekday = new Date(startDate + 'T00:00:00Z').getUTCDay() || 7;
      return startWeekday === window.weekdayIso &&
        inEffectiveDateRange(window, startDate);
    }
    return false;
  }

  function evaluateScheduleSet(scheduleSet, instant) {
    if (!isRecord(scheduleSet) || typeof scheduleSet.timezone !== 'string' ||
        !Array.isArray(scheduleSet.windows) || scheduleSet.windows.length === 0) {
      return { ok: false, available: false, code: 'SCHEDULE_INVALID' };
    }
    if (instant === undefined || instant === null) {
      return { ok: false, available: false, code: 'TRUSTED_TIME_REQUIRED' };
    }
    var date = instant instanceof Date ? instant : new Date(instant);
    if (!Number.isFinite(date.getTime())) {
      return { ok: false, available: false, code: 'TRUSTED_TIME_INVALID' };
    }
    var now = date.getTime();
    var parts = localParts(date, scheduleSet.timezone);
    if (!parts) return { ok: false, available: false, code: 'TIMEZONE_INVALID' };

    var matched = scheduleSet.windows.some(function (window) {
      if (window.windowKind === 'ONE_OFF') {
        var starts = Date.parse(window.startsAt);
        var ends = Date.parse(window.endsAt);
        return Number.isFinite(starts) && Number.isFinite(ends) && now >= starts && now < ends;
      }
      if (window.windowKind === 'WEEKLY') return weeklyWindowMatches(window, parts);
      return false;
    });

    return { ok: true, available: matched, localDate: parts.date, timezone: scheduleSet.timezone };
  }

  function resolveDealSchedule(snapshot, branchId, dealId) {
    var deal = find(snapshot.deals, 'dealId', dealId);
    if (!deal) return fail('DEAL_NOT_FOUND', 'Deal does not exist in this publication.');
    var collection = find(snapshot.dealCollections, 'dealCollectionId', deal.dealCollectionId);
    if (!collection) return fail('DEAL_COLLECTION_NOT_FOUND', 'Deal collection is missing.');
    var assignments = snapshot.dealScheduleAssignments.filter(function (item) {
      return item.dealId === dealId;
    });
    var branchAssignment = find(assignments, 'branchId', branchId);
    var globalAssignment = find(assignments, 'branchId', null);
    var source = branchAssignment ? 'branch' : (globalAssignment ? 'global' : (collection.scheduleSetId ? 'collection' : 'none'));
    var scheduleSetId = branchAssignment ? branchAssignment.scheduleSetId :
      (globalAssignment ? globalAssignment.scheduleSetId : collection.scheduleSetId);
    var scheduleSet = scheduleSetId ? find(snapshot.scheduleSets, 'scheduleSetId', scheduleSetId) : null;
    if (scheduleSetId && !scheduleSet) return fail('SCHEDULE_NOT_FOUND', 'Assigned schedule is missing from this publication.');
    return { ok: true, source: source, scheduleSetId: scheduleSetId || null, scheduleSet: scheduleSet };
  }

  function resolveOptionCap(group, mapping) {
    if (mapping.maxQuantityPerDeal !== null) return mapping.maxQuantityPerDeal;
    if (group.maxUnitsPerOption !== null) return group.maxUnitsPerOption;
    return group.allowRepeatOption ? group.maxUnits : 1;
  }

  function buildDealViewModel(snapshot, options, contract) {
    options = options || {};
    contract = contract || (root && root.FlameChickCatalogV3);
    if (!contract || typeof contract.validateSnapshot !== 'function') {
      return fail('CONTRACT_UNAVAILABLE', 'The V3 catalog validator is unavailable.');
    }
    var checked = contract.validateSnapshot(snapshot);
    if (!checked || checked.ok !== true) {
      return fail((checked && checked.code) || 'SNAPSHOT_INVALID', 'The published catalog failed validation.');
    }
    var branchId = options.branchId;
    if (!branchId || !snapshot.branches.some(function (branch) { return branch.branchId === branchId; })) {
      return fail('BRANCH_SELECTION_REQUIRED', 'A valid branch must be selected.');
    }
    if (options.fulfilmentType !== 'delivery' && options.fulfilmentType !== 'pickup') {
      return fail('FULFILMENT_REQUIRED', 'Choose delivery or pickup before loading branch-specific deal availability.');
    }
    var instant = options.databaseNow;
    if (instant === undefined || instant === null || !Number.isFinite(new Date(instant).getTime())) {
      return fail('TRUSTED_TIME_REQUIRED', 'A trusted database timestamp is required for scheduled deal availability.');
    }
    var orderingEnabled = contract.isBranchOrderingEnabled(snapshot, branchId, options.fulfilmentType);
    var collections = sortByOrder(snapshot.dealCollections, 'dealCollectionId').map(function (collection) {
      var category = find(snapshot.categories, 'categoryId', collection.categoryId);
      var deals = snapshot.deals.filter(function (deal) {
        return deal.dealCollectionId === collection.dealCollectionId;
      }).sort(function (a, b) {
        return a.sortOrder - b.sortOrder || a.dealId.localeCompare(b.dealId);
      }).map(function (deal) {
        var schedule = resolveDealSchedule(snapshot, branchId, deal.dealId);
        var scheduleResult = schedule.ok && schedule.scheduleSet
          ? evaluateScheduleSet(schedule.scheduleSet, instant)
          : { ok: true, available: true };
        var isAvailable = orderingEnabled &&
          contract.resolveDealAvailability(snapshot, branchId, deal.dealId) &&
          schedule.ok && scheduleResult.ok && scheduleResult.available;
        var variants = sortByOrder(snapshot.dealVariants.filter(function (variant) {
          return variant.dealId === deal.dealId;
        }), 'dealVariantId').map(function (variant) {
          var groups = sortByOrder(snapshot.dealComponentGroups.filter(function (group) {
            return group.dealId === deal.dealId;
          }), 'componentGroupId').map(function (group) {
            var optionsForGroup = snapshot.dealComponentOptions.filter(function (option) {
              return option.dealId === deal.dealId && option.componentGroupId === group.componentGroupId;
            }).map(function (option) {
              var mapping = snapshot.dealVariantComponentOptions.find(function (item) {
                return item.dealVariantId === variant.dealVariantId &&
                  item.componentOptionId === option.componentOptionId && item.dealId === deal.dealId;
              });
              if (!mapping) return null;
              if (!contract.resolveProductAvailability(snapshot, branchId, option.productId) ||
                  !contract.resolveVariantAvailability(snapshot, branchId, option.productId, option.productVariantId)) return null;
              var product = find(snapshot.products, 'productId', option.productId);
              var productVariant = find(snapshot.productVariants, 'variantId', option.productVariantId);
              return {
                id: option.componentOptionId,
                productId: option.productId,
                productVariantId: option.productVariantId,
                productName: product.nameEn,
                variantLabel: productVariant.sizeLabel,
                optionLabel: product.nameEn + ' — ' + productVariant.sizeLabel,
                pricingTreatment: mapping.pricingTreatment,
                surchargeMinor: contract.minorUnits(mapping.unitSurcharge),
                standalonePriceMinor: mapping.pricingTreatment === 'STANDALONE'
                  ? contract.minorUnits(productVariant.price) : null,
                maxQuantity: resolveOptionCap(group, mapping),
                sortOrder: option.sortOrder
              };
            }).filter(Boolean).sort(function (a, b) {
              return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
            });
            var capacity = optionsForGroup.reduce(function (sum, item) {
              return sum + item.maxQuantity;
            }, 0);
            return {
              id: group.componentGroupId,
              name: group.nameEn,
              nameUr: group.nameUr,
              minUnits: group.minUnits,
              maxUnits: group.maxUnits,
              allowRepeatOption: group.allowRepeatOption,
              maxUnitsPerOption: group.maxUnitsPerOption,
              options: optionsForGroup,
              branchSatisfiable: capacity >= group.minUnits
            };
          });
          var groupsSatisfiable = groups.every(function (group) {
            return group.branchSatisfiable;
          });
          return {
            id: variant.dealVariantId,
            key: variant.variantKey,
            label: variant.labelEn,
            labelUr: variant.labelUr,
            pricingMode: variant.pricingMode,
            basePriceMinor: contract.minorUnits(variant.basePrice),
            groups: groups,
            branchSatisfiable: groupsSatisfiable
          };
        });
        var variantsSatisfiable = variants.some(function (variant) { return variant.branchSatisfiable; });
        return {
          id: deal.dealId,
          collectionId: collection.dealCollectionId,
          title: deal.title,
          titleUr: deal.titleUr,
          description: deal.descriptionEn,
          descriptionUr: deal.descriptionUr,
          imagePath: deal.imageCurrentPath,
          featured: deal.featured,
          scheduleSource: schedule.ok ? schedule.source : 'invalid',
          scheduleSetId: schedule.ok ? schedule.scheduleSetId : null,
          scheduleAvailable: schedule.ok && scheduleResult.ok && scheduleResult.available,
          available: isAvailable && variantsSatisfiable,
          variants: variants
        };
      });
      return {
        id: collection.dealCollectionId,
        categoryId: collection.categoryId,
        categoryName: category ? category.nameEn : '',
        name: collection.nameEn,
        nameUr: collection.nameUr,
        scheduleSetId: collection.scheduleSetId,
        deals: deals
      };
    }).filter(function (collection) { return collection.deals.length > 0; });

    return {
      ok: true,
      schemaVersion: 3,
      publicationId: snapshot.publicationId,
      versionId: snapshot.versionId,
      branchId: branchId,
      fulfilmentType: options.fulfilmentType,
      databaseNow: new Date(instant).toISOString(),
      orderingEnabled: orderingEnabled,
      currencyCode: snapshot.settings.currency_code,
      collections: collections
    };
  }

  function validateDealSelections(dealVariant, selections) {
    if (!isRecord(dealVariant) || !Array.isArray(dealVariant.groups) || !isRecord(selections)) {
      return fail('SELECTION_INPUT_INVALID', 'Deal selection input is invalid.');
    }
    var allowedGroupIds = Object.create(null);
    var canonical = [];
    for (var groupIndex = 0; groupIndex < dealVariant.groups.length; groupIndex++) {
      var group = dealVariant.groups[groupIndex];
      allowedGroupIds[group.id] = true;
      var selected = selections[group.id] || [];
      if (!Array.isArray(selected)) return fail('SELECTION_GROUP_INVALID', 'Component group selections must be arrays.');
      var allowed = Object.create(null);
      group.options.forEach(function (option) { allowed[option.id] = option; });
      var seen = Object.create(null);
      var units = 0;
      var groupSelections = [];
      for (var i = 0; i < selected.length; i++) {
        var item = selected[i];
        if (!isRecord(item) || typeof item.componentOptionId !== 'string' ||
            !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
          return fail('SELECTION_ITEM_INVALID', 'Each selected option needs a valid ID and positive integer quantity.');
        }
        var option = allowed[item.componentOptionId];
        if (!option || seen[item.componentOptionId]) {
          return fail('SELECTION_OPTION_INVALID', 'An option is not allowed or is duplicated in this component group.');
        }
        if (item.quantity > option.maxQuantity) {
          return fail('SELECTION_QUANTITY_INVALID', 'A selected option exceeds its per-deal quantity limit.');
        }
        seen[item.componentOptionId] = true;
        units += item.quantity;
        groupSelections.push({ componentOptionId: item.componentOptionId, quantity: item.quantity });
      }
      if (units < group.minUnits || units > group.maxUnits) {
        return fail('SELECTION_GROUP_BOUNDS', 'The selected quantity does not satisfy this component group.');
      }
      canonical.push({ componentGroupId: group.id, selections: groupSelections });
    }
    var extraGroupIds = Object.keys(selections).filter(function (id) { return !allowedGroupIds[id]; });
    if (extraGroupIds.length) return fail('SELECTION_GROUP_UNKNOWN', 'A selection references a group outside this deal variant.');
    return { ok: true, selections: canonical };
  }

  var api = {
    evaluateScheduleSet: evaluateScheduleSet,
    resolveDealSchedule: resolveDealSchedule,
    buildDealViewModel: buildDealViewModel,
    validateDealSelections: validateDealSelections,
    resolveOptionCap: resolveOptionCap
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlameChickCatalogV3DealView = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
