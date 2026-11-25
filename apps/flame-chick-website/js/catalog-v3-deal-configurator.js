/* Accessible Flame Chick V3 deal configurator.
 *
 * Renders explicit deal-variant, component and per-component modifier choices.
 * It emits identifiers and quantities only. No browser-side deal/cart total is
 * calculated or treated as authoritative. The caller sends the resulting
 * selection to a future trusted quote/order API.
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

  function own(map, key) {
    return Object.prototype.hasOwnProperty.call(map, key);
  }

  function findDeal(viewModel, dealId) {
    if (!isRecord(viewModel) || !Array.isArray(viewModel.collections)) return null;
    for (var i = 0; i < viewModel.collections.length; i++) {
      var collection = viewModel.collections[i];
      if (!collection || !Array.isArray(collection.deals)) continue;
      for (var j = 0; j < collection.deals.length; j++) {
        if (collection.deals[j].id === dealId) return collection.deals[j];
      }
    }
    return null;
  }

  function formatAmount(minor, currency, formatter) {
    if (typeof formatter === 'function') return formatter(minor, currency);
    try {
      return new Intl.NumberFormat('en-PK', {
        style: 'currency', currency: currency,
        minimumFractionDigits: 2, maximumFractionDigits: 2
      }).format(minor / 100);
    } catch (error) {
      return currency + ' ' + (minor / 100).toFixed(2);
    }
  }

  function makeElement(doc, tag, className, text) {
    var element = doc.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function createDealConfigurator(viewModel, dealId, helpers) {
    helpers = helpers || {};
    var deal = findDeal(viewModel, dealId);
    if (!deal) return fail('DEAL_NOT_FOUND', 'This deal is not in the current published catalog.');
    if (deal.branchAvailable !== true) return fail('DEAL_UNAVAILABLE', 'This deal is not available at the selected branch.');
    if (!Array.isArray(deal.variants) || deal.variants.length === 0) {
      return fail('DEAL_VARIANTS_MISSING', 'This deal has no purchasable options.');
    }
    if (typeof viewModel.publicationId !== 'string' || typeof viewModel.versionId !== 'string' ||
        typeof viewModel.branchId !== 'string' ||
        (viewModel.fulfilmentType !== 'delivery' && viewModel.fulfilmentType !== 'pickup')) {
      return fail('DEAL_CONTEXT_INVALID', 'The published catalog, branch or fulfilment context is incomplete.');
    }
    if (typeof helpers.validateModifierSelections !== 'function') {
      return fail('MODIFIER_VALIDATOR_REQUIRED', 'The product modifier selection validator is unavailable.');
    }

    var variants = deal.variants;
    // A deal can be opened for read-only details when its schedule is closed
    // or the selected fulfilment context is not order-enabled. It must never
    // emit a selection payload in that state.
    var readOnly = deal.available !== true;
    var selectedVariantId = null;
    var quantities = Object.create(null);
    var customizations = Object.create(null);
    var burgerSlotValues = Object.create(null);
    var expandedBurgerGroupId = null;
    var lastError = null;

    function key(groupId, optionId) {
      return groupId + ':' + optionId;
    }

    function unitKey(groupId, optionId, unitIndex, modifierGroupId) {
      return key(groupId, optionId) + ':' + unitIndex + ':' + modifierGroupId;
    }

    function isFixedGroup(group) {
      return group && group.categoryDriven !== true && group.options.length === 1 &&
        group.minUnits > 0 && group.minUnits === group.maxUnits &&
        group.options[0].maxQuantity >= group.minUnits;
    }

    function selectedVariant() {
      for (var i = 0; i < variants.length; i++) {
        if (variants[i].id === selectedVariantId) return variants[i];
      }
      return null;
    }

    function findGroup(variant, groupId) {
      if (!variant) return null;
      for (var i = 0; i < variant.groups.length; i++) {
        if (variant.groups[i].id === groupId) return variant.groups[i];
      }
      return null;
    }

    function findOption(group, optionId) {
      if (!group) return null;
      for (var i = 0; i < group.options.length; i++) {
        if (group.options[i].id === optionId) return group.options[i];
      }
      return null;
    }

    function groupQuantity(group) {
      return group.options.reduce(function (sum, option) {
        return sum + (quantities[key(group.id, option.id)] || 0);
      }, 0);
    }

    function selectedCount(group, option) {
      return quantities[key(group.id, option.id)] || 0;
    }

    function currentModifierSelection(groupId, optionId, unitIndex, modifierGroupId) {
      return customizations[unitKey(groupId, optionId, unitIndex, modifierGroupId)] || [];
    }

    function selectVariant(variantId) {
      var variant = variants.find(function (item) { return item.id === variantId; });
      if (!variant) return fail('DEAL_VARIANT_INVALID', 'Choose a deal option from this published deal.');
      if (variant.branchSatisfiable !== true) {
        return fail('DEAL_VARIANT_UNAVAILABLE', 'This deal option cannot be fulfilled at the selected branch.');
      }
      selectedVariantId = variantId;
      quantities = Object.create(null);
      customizations = Object.create(null);
      burgerSlotValues = Object.create(null);
      expandedBurgerGroupId = null;
      // Fixed one-option groups are canonicalized immediately. The UI locks
      // them; the server still validates every emitted product/variant ID.
      variant.groups.forEach(function (group) {
        if (isFixedGroup(group)) quantities[key(group.id, group.options[0].id)] = group.minUnits;
      });
      lastError = null;
      return { ok: true };
    }

    function setOptionQuantity(groupId, optionId, quantity) {
      if (readOnly) return fail('DEAL_READ_ONLY', 'This deal is visible for information only and cannot be ordered now.');
      var variant = selectedVariant();
      var group = findGroup(variant, groupId);
      var option = findOption(group, optionId);
      if (!option) return fail('COMPONENT_OPTION_INVALID', 'This component is not allowed for the selected deal option.');
      if (isFixedGroup(group)) return fail('COMPONENT_FIXED', 'This deal component is fixed and cannot be changed.');
      if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > option.maxQuantity) {
        return fail('COMPONENT_QUANTITY_INVALID', 'Enter a whole-number quantity within this option limit.');
      }
      var nextTotal = groupQuantity(group) - selectedCount(group, option) + quantity;
      if (nextTotal > group.maxUnits) {
        return fail('COMPONENT_GROUP_MAX', 'This component group has reached its maximum number of selections.');
      }

      var qKey = key(groupId, optionId);
      var previous = quantities[qKey] || 0;
      quantities[qKey] = quantity;
      if (quantity < previous) {
        Object.keys(customizations).forEach(function (storedKey) {
          var prefix = qKey + ':';
          if (storedKey.indexOf(prefix) !== 0) return;
          var parts = storedKey.slice(prefix.length).split(':');
          var unitIndex = Number(parts[0]);
          if (Number.isInteger(unitIndex) && unitIndex >= quantity) delete customizations[storedKey];
        });
      }
      lastError = null;
      return { ok: true };
    }

    function setModifierSelection(groupId, optionId, unitIndex, modifierGroupId, modifierIds) {
      var variant = selectedVariant();
      var componentGroup = findGroup(variant, groupId);
      var option = findOption(componentGroup, optionId);
      if (!option || !Number.isSafeInteger(unitIndex) || unitIndex < 0 ||
          unitIndex >= selectedCount(componentGroup, option)) {
        return fail('COMPONENT_INSTANCE_INVALID', 'Choose an existing component before customizing it.');
      }
      if (!Array.isArray(modifierIds) || typeof modifierGroupId !== 'string') {
        return fail('MODIFIER_SELECTION_INVALID', 'Modifier selections are invalid.');
      }
      var modifierGroup = option.modifierGroups.find(function (item) {
        return item.id === modifierGroupId;
      });
      if (!modifierGroup) return fail('MODIFIER_GROUP_INVALID', 'This modifier group is not assigned to the selected component.');
      var selections = Object.create(null);
      selections[modifierGroupId] = modifierIds.slice();
      var validation = helpers.validateModifierSelections([modifierGroup], selections);
      if (!validation || validation.ok !== true) {
        return fail((validation && validation.code) || 'MODIFIER_SELECTION_INVALID',
          (validation && validation.message) || 'Modifier selection did not pass validation.');
      }
      customizations[unitKey(groupId, optionId, unitIndex, modifierGroupId)] = modifierIds.slice();
      lastError = null;
      return { ok: true };
    }

    function validate() {
      var variant = selectedVariant();
      if (!variant) return fail('DEAL_VARIANT_REQUIRED', 'Choose a deal option.');
      if (variant.branchSatisfiable !== true) return fail('DEAL_VARIANT_UNAVAILABLE', 'This deal option is unavailable.');

      for (var g = 0; g < variant.groups.length; g++) {
        var group = variant.groups[g];
        var total = groupQuantity(group);
        if (total < group.minUnits || total > group.maxUnits) {
          return fail('COMPONENT_GROUP_BOUNDS',
            'Choose between ' + group.minUnits + ' and ' + group.maxUnits + ' item(s) for ' + group.name + '.');
        }
        for (var o = 0; o < group.options.length; o++) {
          var option = group.options[o];
          var count = selectedCount(group, option);
          if (count > option.maxQuantity) {
            return fail('COMPONENT_QUANTITY_INVALID', 'A component exceeds its allowed quantity.');
          }
          for (let unit = 0; unit < count; unit++) {
            var modifierSelections = Object.create(null);
            option.modifierGroups.forEach(function (modifierGroup) {
              modifierSelections[modifierGroup.id] =
                currentModifierSelection(group.id, option.id, unit, modifierGroup.id);
            });
            var result = helpers.validateModifierSelections(option.modifierGroups, modifierSelections);
            if (!result || result.ok !== true) {
              return fail((result && result.code) || 'MODIFIER_SELECTION_INVALID',
                (result && result.message) || 'Complete the selected component customizations.');
            }
          }
        }
      }
      return { ok: true };
    }

    function toPayload() {
      if (readOnly) return fail('DEAL_READ_ONLY', 'This deal is visible for information only and cannot be ordered now.');
      var result = validate();
      if (!result.ok) return result;
      var variant = selectedVariant();
      var componentGroups = variant.groups.map(function (group) {
        var components = [];
        group.options.forEach(function (option) {
          var quantity = selectedCount(group, option);
          for (var unit = 0; unit < quantity; unit++) {
            var modifierSelections = option.modifierGroups.map(function (modifierGroup) {
              return {
                modifierGroupId: modifierGroup.id,
                modifierIds: currentModifierSelection(group.id, option.id, unit, modifierGroup.id).slice()
              };
            });
            components.push({
              componentOptionId: option.id,
              productId: option.productId,
              productVariantId: option.productVariantId,
              modifiers: modifierSelections
            });
          }
        });
        return { componentGroupId: group.id, components: components };
      });
      return {
        schemaVersion: 3,
        publicationId: viewModel.publicationId,
        versionId: viewModel.versionId,
        branchId: viewModel.branchId,
        fulfilmentType: viewModel.fulfilmentType,
        dealId: deal.id,
        dealVariantId: variant.id,
        componentGroups: componentGroups
      };
    }

    function getState() {
      var variant = selectedVariant();
      var groupState = Object.create(null);
      if (variant) {
        variant.groups.forEach(function (group) {
          var optionState = Object.create(null);
          group.options.forEach(function (option) {
            optionState[option.id] = selectedCount(group, option);
          });
          groupState[group.id] = optionState;
        });
      }
      return {
        selectedVariantId: selectedVariantId,
        quantities: groupState,
        validation: validate(),
        lastError: lastError
      };
    }

    function render(container, options) {
      options = options || {};
      var doc = options.document || (root && root.document);
      if (!doc || !container || typeof container.replaceChildren !== 'function') {
        return fail('DOM_TARGET_REQUIRED', 'A document and configurator container are required.');
      }
      if (typeof options.onComplete !== 'function') {
        return fail('COMPLETION_HANDLER_REQUIRED', 'A selection callback is required before showing the continue action.');
      }

      var focusKey = options.restoreFocusKey || null;
      var controls = Object.create(null);
      var fragment = doc.createDocumentFragment();

      fragment.appendChild(makeElement(doc, 'h3', 'fc-deal-config-title', deal.title));
      if (deal.description) fragment.appendChild(makeElement(doc, 'p', 'fc-deal-config-description', deal.description));
      if (readOnly) fragment.appendChild(makeElement(doc, 'p', 'fc-deal-config-status', 'This deal is currently outside its orderable context. Details are shown for information only.'));

      var variantSet = makeElement(doc, 'fieldset', 'fc-deal-variants');
      variantSet.appendChild(makeElement(doc, 'legend', '', 'Choose a deal option'));
      variants.forEach(function (variant) {
        var label = makeElement(doc, 'label', 'fc-deal-variant');
        var input = makeElement(doc, 'input');
        input.type = 'radio';
        input.name = 'fc-deal-variant-' + deal.id;
        input.value = variant.id;
        input.checked = selectedVariantId === variant.id;
        input.disabled = variant.branchSatisfiable !== true;
        var controlKey = 'variant:' + variant.id;
        input.setAttribute('data-control-key', controlKey);
        controls[controlKey] = input;
        input.addEventListener('change', function () {
          if (input.checked) {
            var changed = selectVariant(variant.id);
            if (!changed.ok) lastError = changed;
            render(container, { document: doc, onComplete: options.onComplete, restoreFocusKey: controlKey,
              formatMoney: options.formatMoney, completeButtonLabel: options.completeButtonLabel, showVariantBasePrice: options.showVariantBasePrice });
          }
        });
        label.appendChild(input);
        var variantText = variant.label;
        if (options.showVariantBasePrice !== false) {
          variantText += ' — ' + formatAmount(variant.basePriceMinor, viewModel.currencyCode, options.formatMoney);
        }
        label.appendChild(makeElement(doc, 'span', '', variantText));
        if (variant.branchSatisfiable !== true) {
          label.appendChild(makeElement(doc, 'span', 'fc-deal-unavailable', 'Unavailable'));
        }
        variantSet.appendChild(label);
      });
      fragment.appendChild(variantSet);

      var validation = validate();
      var variant = selectedVariant();
      if (variant) {
        variant.groups.forEach(function (group) {
          var burgerChoiceGroup = group.categoryDriven === true ||
            (/burger/i.test(String(group.name || '')) && group.options.length > 1);
          var groupSet = makeElement(doc, 'fieldset', 'fc-deal-component-group' + (burgerChoiceGroup ? ' fc-deal-burger-group' : ''));
          if (!burgerChoiceGroup) {
            groupSet.appendChild(makeElement(doc, 'legend', '', group.name + ' — choose ' +
              group.minUnits + ' to ' + group.maxUnits));
          }

          var burgerDetails = null;
          var burgerDetailsContent = null;
          if (burgerChoiceGroup) {
            var slotCount = Math.max(Number(group.maxUnits) || 0, Number(group.minUnits) || 0, 1);
            var slots = burgerSlotValues[group.id];
            if (!Array.isArray(slots) || slots.length !== slotCount) {
              slots = Array.from({ length: slotCount }, function () { return ''; });
              burgerSlotValues[group.id] = slots;
            }
            var pickedNames = slots.map(function (optionId) {
              var selectedOption = findOption(group, optionId);
              return selectedOption ? selectedOption.productName : '';
            }).filter(Boolean);
            burgerDetails = makeElement(doc, 'details', 'fc-deal-burger-picker');
            burgerDetails.open = expandedBurgerGroupId === group.id;
            burgerDetails.addEventListener('toggle', function () {
              expandedBurgerGroupId = burgerDetails.open ? group.id :
                (expandedBurgerGroupId === group.id ? null : expandedBurgerGroupId);
            });
            var summary = makeElement(doc, 'summary', 'fc-deal-burger-summary');
            var summaryCopy = makeElement(doc, 'span', 'fc-deal-burger-summary-copy');
            var requiredText = group.minUnits === group.maxUnits
              ? 'Choose ' + slotCount + ' burgers'
              : 'Choose ' + group.minUnits + '–' + group.maxUnits + ' burgers';
            summaryCopy.appendChild(makeElement(doc, 'strong', '', requiredText));
            summaryCopy.appendChild(makeElement(doc, 'small', '', pickedNames.length
              ? pickedNames.length + '/' + slotCount + ' selected · ' + pickedNames.join(' + ')
              : 'No burgers selected yet'));
            summary.appendChild(summaryCopy);
            summary.appendChild(makeElement(doc, 'span', 'fc-deal-burger-edit', 'Edit'));
            burgerDetails.appendChild(summary);
            burgerDetailsContent = makeElement(doc, 'div', 'fc-deal-burger-content');
            var burgerSlots = makeElement(doc, 'div', 'fc-deal-burger-slots');
            for (let slot = 0; slot < slotCount; slot++) {
              var slotLabel = makeElement(doc, 'label', 'fc-deal-burger-slot');
              slotLabel.appendChild(makeElement(doc, 'span', '', 'Burger ' + (slot + 1)));
              let select = makeElement(doc, 'select');
              let controlKey = 'burger-slot:' + group.id + ':' + slot;
              select.setAttribute('data-control-key', controlKey);
              select.setAttribute('aria-label', 'Choose burger ' + (slot + 1));
              controls[controlKey] = select;
              var placeholder = makeElement(doc, 'option', '', 'Select a burger');
              placeholder.value = '';
              select.appendChild(placeholder);
              group.options.forEach(function (option) {
                var alreadyUsed = slots.some(function (optionId, index) {
                  return index !== slot && optionId === option.id;
                });
                var selectedQuantity = selectedCount(group, option);
                var optionCap = Number(option.maxQuantity) || Number(group.maxUnits) || 1;
                var disabled = readOnly ||
                  (!group.allowRepeatOption && alreadyUsed) ||
                  (selectedQuantity >= optionCap && slots[slot] !== option.id);
                var optionEl = makeElement(doc, 'option', '',
                  option.productName + (option.variantLabel ? ' — ' + option.variantLabel : ''));
                optionEl.value = option.id;
                optionEl.disabled = disabled;
                select.appendChild(optionEl);
              });
              select.value = slots[slot] || '';
              select.addEventListener('change', function () {
                var nextSlots = slots.slice();
                nextSlots[slot] = select.value || '';
                var desired = Object.create(null);
                nextSlots.forEach(function (optionId) {
                  if (optionId) desired[optionId] = (desired[optionId] || 0) + 1;
                });
                var failure = null;
                group.options.forEach(function (option) {
                  var currentQuantity = selectedCount(group, option);
                  var targetQuantity = desired[option.id] || 0;
                  if (!failure && currentQuantity > 0 && targetQuantity !== currentQuantity) {
                    var cleared = setOptionQuantity(group.id, option.id, 0);
                    if (!cleared.ok) failure = cleared;
                  }
                });
                group.options.forEach(function (option) {
                  var targetQuantity = desired[option.id] || 0;
                  if (!failure && targetQuantity > 0 && selectedCount(group, option) !== targetQuantity) {
                    var changed = setOptionQuantity(group.id, option.id, targetQuantity);
                    if (!changed.ok) failure = changed;
                  }
                });
                if (failure) {
                  lastError = failure;
                } else {
                  burgerSlotValues[group.id] = nextSlots;
                  expandedBurgerGroupId = group.id;
                  lastError = null;
                }
                render(container, { document: doc, onComplete: options.onComplete,
                  restoreFocusKey: controlKey, formatMoney: options.formatMoney,
                  completeButtonLabel: options.completeButtonLabel,
                  showVariantBasePrice: options.showVariantBasePrice });
              });
              slotLabel.appendChild(select);
              burgerSlots.appendChild(slotLabel);
            }
            burgerDetailsContent.appendChild(burgerSlots);
            burgerDetails.appendChild(burgerDetailsContent);
            groupSet.appendChild(burgerDetails);
          }

          group.options.forEach(function (option) {
            var optionLabel = group.options.length === 1
              ? group.name
              : option.productName + ' — ' + option.variantLabel;
            var fixedGroup = isFixedGroup(group);
            if (!burgerChoiceGroup) {
              var optionRow = makeElement(doc, 'div', 'fc-deal-component-option');
              var priceLabel = option.pricingTreatment === 'INCLUDED'
                ? 'Included'
                : (option.pricingTreatment === 'SURCHARGE'
                  ? 'Additional ' + formatAmount(option.surchargeMinor, viewModel.currencyCode, options.formatMoney) + ' per item'
                  : 'Standalone item ' + formatAmount(option.standalonePriceMinor, viewModel.currencyCode, options.formatMoney));
              optionRow.appendChild(makeElement(doc, 'span', 'fc-deal-component-label', optionLabel + ' (' + priceLabel + ')'));
              var quantity = makeElement(doc, 'input', 'fc-deal-component-quantity');
              quantity.type = option.maxQuantity === 1 ? 'checkbox' : 'number';
              var quantityKey = 'quantity:' + group.id + ':' + option.id;
              quantity.setAttribute('data-control-key', quantityKey);
              controls[quantityKey] = quantity;
              if (quantity.type === 'checkbox') {
                quantity.checked = selectedCount(group, option) === 1;
              } else {
                quantity.min = '0';
                quantity.max = String(option.maxQuantity);
                quantity.step = '1';
                quantity.value = String(selectedCount(group, option));
                quantity.inputMode = 'numeric';
              }
              quantity.setAttribute('aria-label', 'Quantity of ' + optionLabel);
              quantity.disabled = readOnly || fixedGroup;
              quantity.addEventListener('change', function () {
                var next = quantity.type === 'checkbox' ? (quantity.checked ? 1 : 0) : Number(quantity.value);
                var changed = setOptionQuantity(group.id, option.id, next);
                if (!changed.ok) lastError = changed;
                render(container, { document: doc, onComplete: options.onComplete, restoreFocusKey: quantityKey,
                  formatMoney: options.formatMoney, completeButtonLabel: options.completeButtonLabel,
                  showVariantBasePrice: options.showVariantBasePrice });
              });
              optionRow.appendChild(quantity);
              groupSet.appendChild(optionRow);
            }

            var count = selectedCount(group, option);
            for (let unit = 0; unit < count; unit++) {
              var unitSet = makeElement(doc, 'fieldset', 'fc-deal-component-customization');
              unitSet.appendChild(makeElement(doc, 'legend', '', 'Customize ' + optionLabel + ' — item ' + (unit + 1)));
              option.modifierGroups.forEach(function (modifierGroup) {
                var modifierSet = makeElement(doc, 'fieldset', 'fc-deal-modifier-group');
                modifierSet.appendChild(makeElement(doc, 'legend', '', modifierGroup.name +
                  (modifierGroup.minSelect > 0 ? ' (required)' : ' (optional)')));
                modifierGroup.modifiers.forEach(function (modifier) {
                  var modifierLabel = makeElement(doc, 'label', 'fc-deal-modifier');
                  var check = makeElement(doc, 'input');
                  check.type = 'checkbox';
                  check.value = modifier.id;
                  check.checked = currentModifierSelection(group.id, option.id, unit, modifierGroup.id)
                    .indexOf(modifier.id) >= 0;
                  var modifierKey = 'modifier:' + group.id + ':' + option.id + ':' + unit + ':' + modifierGroup.id;
                  check.setAttribute('data-control-key', modifierKey);
                  controls[modifierKey] = check;
                  check.addEventListener('change', function () {
                    var current = currentModifierSelection(group.id, option.id, unit, modifierGroup.id).slice();
                    var position = current.indexOf(modifier.id);
                    if (check.checked && position < 0) current.push(modifier.id);
                    if (!check.checked && position >= 0) current.splice(position, 1);
                    if (current.length > modifierGroup.maxSelect) {
                      lastError = fail('MODIFIER_SELECTION_BOUNDS', 'Choose no more than ' + modifierGroup.maxSelect + ' option(s) for ' + modifierGroup.name + '.');
                    } else {
                      var changed = setModifierSelection(group.id, option.id, unit, modifierGroup.id, current);
                      if (!changed.ok) lastError = changed;
                    }
                    render(container, { document: doc, onComplete: options.onComplete, restoreFocusKey: modifierKey,
                      formatMoney: options.formatMoney, completeButtonLabel: options.completeButtonLabel, showVariantBasePrice: options.showVariantBasePrice });
                  });
                  modifierLabel.appendChild(check);
                  modifierLabel.appendChild(makeElement(doc, 'span', '', modifier.name + ' — ' +
                    formatAmount(modifier.priceMinor, viewModel.currencyCode, options.formatMoney)));
                  modifierSet.appendChild(modifierLabel);
                });
                unitSet.appendChild(modifierSet);
              });
              if (burgerChoiceGroup) burgerDetailsContent.appendChild(unitSet);
              else groupSet.appendChild(unitSet);
            }
          });
          fragment.appendChild(groupSet);
        });
      }

      validation = validate();
      var status = makeElement(doc, 'p', 'fc-deal-config-status', lastError
        ? lastError.message
        : (validation.ok ? 'Selections are complete.' : validation.message));
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      fragment.appendChild(status);

      var continueButton = makeElement(doc, 'button', 'fc-deal-config-continue', options.completeButtonLabel || 'Continue');
      continueButton.type = 'button';
      continueButton.disabled = readOnly || !validation.ok;
      continueButton.addEventListener('click', function () {
        var payload = toPayload();
        // Successful payloads are identifier-only objects and intentionally do
        // not contain an "ok" field. Only explicit failure results carry ok:false.
        if (!payload || payload.ok === false) {
          lastError = payload;
          render(container, { document: doc, onComplete: options.onComplete, formatMoney: options.formatMoney,
            completeButtonLabel: options.completeButtonLabel, showVariantBasePrice: options.showVariantBasePrice });
          return;
        }
        options.onComplete(payload);
      });
      fragment.appendChild(continueButton);
      container.replaceChildren(fragment);
      if (focusKey && controls[focusKey] && typeof controls[focusKey].focus === 'function') {
        controls[focusKey].focus({ preventScroll: true });
      }
      return { ok: true, valid: validation.ok, error: validation.ok ? null : validation };
    }

    return {
      ok: true,
      dealId: deal.id,
      selectVariant: selectVariant,
      setOptionQuantity: setOptionQuantity,
      setModifierSelection: setModifierSelection,
      validate: validate,
      toPayload: toPayload,
      getState: getState,
      render: render
    };
  }

  var api = {
    createDealConfigurator: createDealConfigurator
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlameChickCatalogV3DealConfigurator = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
