(function () {
  'use strict';

  var byId = function (id) { return document.getElementById(id); };
  var connectionPill = byId('connection-pill');
  var connectionMessage = byId('connection-message');
  var publicationMeta = byId('publication-meta');
  var contextSection = byId('context-section');
  var branchSelector = byId('branch-selector');
  var catalogSection = byId('catalog-section');
  var productNav = byId('product-category-nav');
  var productCatalog = byId('product-catalog');
  var productsEmpty = byId('products-empty');
  var dealsSection = byId('deals-section');
  var dealCatalog = byId('deal-catalog');
  var dealsEmpty = byId('deals-empty');
  var configSection = byId('deal-config-section');
  var configTarget = byId('deal-configurator');
  var configResult = byId('deal-config-result');
  var reloadButton = byId('reload-catalog');
  var closeConfigButton = byId('close-deal-config');

  var app = null;
  var currentPreviewId = null;
  var currentDealConfigurator = null;
  var currentDealId = null;
  var lastValidatedDealSelection = null;

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function setConnection(state, message) {
    connectionPill.className = 'status-pill status-' + state;
    connectionPill.textContent = state === 'ready' ? 'Published catalog verified'
      : state === 'loading' ? 'Loading'
      : state === 'unpublished' ? 'Not published'
      : state === 'error' ? 'Unavailable' : 'Not loaded';
    connectionMessage.textContent = message;
  }

  function formatMoney(minor, currency) {
    try {
      return new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: currency || 'PKR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(minor / 100);
    } catch (_) {
      return (currency || 'PKR') + ' ' + (minor / 100).toFixed(2);
    }
  }

  function currentSelectedCount(group, selections) {
    return selections[group.id] ? selections[group.id].length : 0;
  }

  function availableModifierPrice(modifier, variantId) {
    if (modifier.priceMode === 'FIXED') return modifier.fixedPriceMinor;
    if (modifier.priceMode === 'BY_SIZE' &&
        Object.prototype.hasOwnProperty.call(modifier.pricesByVariantId, variantId)) {
      return modifier.pricesByVariantId[variantId];
    }
    return null;
  }

  function buildProductCard(product, currency) {
    var card = element('article', 'fc-menu-product');
    card.setAttribute('data-product-id', product.id);
    card.appendChild(element('div', 'fc-preview-placeholder', 'Catalog image pending'));
    card.appendChild(element('h3', 'fc-menu-product-name', product.name));
    if (product.description) card.appendChild(element('p', 'fc-menu-product-description', product.description));
    if (product.nameUr) card.appendChild(element('p', 'fc-preview-status', product.nameUr));

    var variantLabel = element('label', 'fc-menu-variant-label', 'Product option');
    var variantSelect = element('select', 'fc-menu-variant-select');
    variantSelect.setAttribute('aria-label', 'Choose an option for ' + product.name);
    variantSelect.appendChild(element('option', '', product.variants.length > 1 ? 'Choose an option' : product.variants[0].label));
    variantSelect.options[0].value = '';
    product.variants.forEach(function (variant) {
      var option = element('option', '', variant.label + ' — ' + formatMoney(variant.priceMinor, currency));
      option.value = variant.id;
      variantSelect.appendChild(option);
    });
    if (product.variants.length === 1) variantSelect.value = product.variants[0].id;
    variantLabel.appendChild(variantSelect);
    card.appendChild(variantLabel);

    var priceLine = element('p', 'fc-preview-price');
    var modifierTarget = element('div', 'fc-preview-product-modifiers');
    var validateButton = element('button', 'button button-secondary fc-preview-validate', 'Validate preview choices');
    validateButton.type = 'button';
    var status = element('p', 'fc-preview-status', 'Choose the product option to inspect its customization choices.');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    function renderModifiers() {
      modifierTarget.replaceChildren();
      var variantId = variantSelect.value;
      var variant = product.variants.find(function (item) { return item.id === variantId; });
      priceLine.textContent = variant
        ? 'Published unit price: ' + formatMoney(variant.priceMinor, currency)
        : 'Choose an option to view its published unit price.';
      validateButton.disabled = !variant;

      if (!variant) {
        status.textContent = 'A product option must be selected before validating choices.';
        status.className = 'fc-preview-status';
        return;
      }

      var activeGroups = product.modifierGroups.map(function (group) {
        var choices = group.modifiers.map(function (modifier) {
          return { modifier: modifier, priceMinor: availableModifierPrice(modifier, variantId) };
        }).filter(function (item) { return item.priceMinor !== null; });
        return { group: group, choices: choices };
      });

      activeGroups.forEach(function (entry) {
        var fieldset = element('fieldset', 'fc-preview-modifiers');
        fieldset.appendChild(element('legend', '', entry.group.name +
          (entry.group.minSelect > 0 ? ' · required' : ' · optional')));
        if (!entry.choices.length) {
          fieldset.appendChild(element('p', 'fc-preview-status', 'No valid price is published for this option.'));
        }
        entry.choices.forEach(function (choice) {
          var label = element('label', 'fc-preview-modifier');
          var input = element('input');
          input.type = 'checkbox';
          input.value = choice.modifier.id;
          input.setAttribute('data-modifier-group', entry.group.id);
          input.setAttribute('data-modifier-id', choice.modifier.id);
          input.setAttribute('aria-label', choice.modifier.name + ' ' + formatMoney(choice.priceMinor, currency));
          label.appendChild(input);
          label.appendChild(element('span', '', choice.modifier.name + ' · ' + formatMoney(choice.priceMinor, currency)));
          fieldset.appendChild(label);
        });
        modifierTarget.appendChild(fieldset);
      });

      status.textContent = product.modifierGroups.length
        ? 'Modifier amounts are shown individually. No combined total is calculated.'
        : 'No customization groups are published for this product.';
      status.className = 'fc-preview-status';
    }

    variantSelect.addEventListener('change', renderModifiers);
    validateButton.addEventListener('click', function () {
      var variant = product.variants.find(function (item) { return item.id === variantSelect.value; });
      if (!variant) {
        status.textContent = 'Choose a valid product option.';
        status.className = 'fc-preview-status is-invalid';
        return;
      }
      var invalidMessage = null;
      product.modifierGroups.forEach(function (group) {
        var checks = modifierTarget.querySelectorAll(
          'input[data-modifier-group="' + group.id + '"]'
        );
        var selected = Array.prototype.filter.call(checks, function (input) { return input.checked; });
        if (!invalidMessage && selected.length < group.minSelect) {
          invalidMessage = 'Select at least ' + group.minSelect + ' option(s) for ' + group.name + '.';
        } else if (!invalidMessage && selected.length > group.maxSelect) {
          invalidMessage = 'Select no more than ' + group.maxSelect + ' option(s) for ' + group.name + '.';
        }
      });
      if (invalidMessage) {
        status.textContent = invalidMessage;
        status.className = 'fc-preview-status is-invalid';
      } else {
        status.textContent = 'Preview choices are valid. Nothing was added to a cart or sent to an order service.';
        status.className = 'fc-preview-status is-valid';
      }
    });

    card.appendChild(priceLine);
    card.appendChild(modifierTarget);
    card.appendChild(validateButton);
    card.appendChild(status);
    renderModifiers();
    return card;
  }

  function renderProducts(model) {
    productNav.replaceChildren();
    productCatalog.replaceChildren();
    var hasProducts = model.categories.length > 0;
    productsEmpty.hidden = hasProducts;
    model.categories.forEach(function (category) {
      var nav = element('button', 'fc-menu-category-link', category.name);
      nav.type = 'button';
      nav.addEventListener('click', function () {
        var target = document.getElementById('preview-category-' + category.id);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      productNav.appendChild(nav);

      var section = element('section', 'fc-menu-category');
      section.id = 'preview-category-' + category.id;
      section.appendChild(element('h3', 'fc-menu-category-title', category.name));
      var grid = element('div', 'fc-menu-product-grid');
      category.products.forEach(function (product) {
        grid.appendChild(buildProductCard(product, model.currencyCode));
      });
      section.appendChild(grid);
      productCatalog.appendChild(section);
    });
  }

  function closeDealConfigurator() {
    currentDealConfigurator = null;
    currentDealId = null;
    lastValidatedDealSelection = null;
    configTarget.replaceChildren();
    configResult.hidden = true;
    configSection.hidden = true;
  }

  function openDealConfigurator(deal, preview) {
    var deps = window.FlameChickCatalogV3DealView;
    var factory = window.FlameChickCatalogV3DealConfigurator;
    if (!deps || !factory) return;
    currentDealId = deal.id;
    lastValidatedDealSelection = null;
    configResult.hidden = true;
    configResult.textContent = '';
    configSection.hidden = false;
    configTarget.replaceChildren();

    var configurator = factory.createDealConfigurator(preview.deals, deal.id, {
      validateModifierSelections: deps.validateModifierSelections
    });
    if (!configurator || configurator.ok !== true) {
      configTarget.appendChild(element('p', 'fc-preview-status is-invalid',
        configurator.message || 'This deal cannot be configured in preview.'));
      return;
    }
    currentDealConfigurator = configurator;
    configurator.render(configTarget, {
      document: document,
      formatMoney: formatMoney,
      completeButtonLabel: 'Validate preview choices',
      onComplete: function (selectionPayload) {
        // Keep the validated identifier-only payload in page memory. Do not
        // persist it, send it to an API, or translate it into an order/cart.
        lastValidatedDealSelection = selectionPayload;
        configResult.textContent = 'Deal choices validated locally. No quote was requested and no order was created.';
        configResult.hidden = false;
        configResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
    configSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderDeals(model, preview) {
    dealCatalog.replaceChildren();
    var count = 0;
    model.collections.forEach(function (collection) {
      var collectionSection = element('section', 'fc-menu-category');
      collectionSection.appendChild(element('h3', 'fc-menu-category-title', collection.name));
      var grid = element('div', 'deal-grid');
      collection.deals.forEach(function (deal) {
        count += 1;
        var card = element('article', 'deal-card');
        card.appendChild(element('div', 'fc-preview-placeholder', 'Deal artwork pending'));
        card.appendChild(element('h3', 'deal-title', deal.title));
        if (deal.description) card.appendChild(element('p', 'deal-description', deal.description));
        var meta = element('div', 'deal-meta');
        var availability = element('span', 'deal-tag ' + (deal.available ? 'available' : 'unavailable'),
          deal.available ? 'Available in selected context' : 'Unavailable in selected context');
        meta.appendChild(availability);
        meta.appendChild(element('span', 'deal-tag',
          deal.scheduleSetId ? (deal.scheduleAvailable ? 'Within schedule' : 'Outside schedule') : 'No schedule restriction'));
        card.appendChild(meta);

        var variantsText = deal.variants.map(function (variant) {
          return variant.label + ' · ' + formatMoney(variant.basePriceMinor, model.currencyCode);
        }).join('  |  ');
        if (variantsText) card.appendChild(element('p', 'fc-preview-variants', variantsText));

        var configure = element('button', 'button button-primary deal-configure', 'Preview deal choices');
        configure.type = 'button';
        configure.disabled = !deal.available;
        configure.addEventListener('click', function () {
          closeDealConfigurator();
          openDealConfigurator(deal, preview);
        });
        card.appendChild(configure);
        grid.appendChild(card);
      });
      collectionSection.appendChild(grid);
      dealCatalog.appendChild(collectionSection);
    });
    dealsEmpty.hidden = count > 0;
  }

  function renderPreview(preview) {
    if (!preview || preview.ok !== true) {
      currentPreviewId = null;
      catalogSection.hidden = true;
      dealsSection.hidden = true;
      closeDealConfigurator();
      return;
    }
    if (currentPreviewId !== preview.previewId) closeDealConfigurator();
    currentPreviewId = preview.previewId;
    catalogSection.hidden = false;
    dealsSection.hidden = false;
    byId('catalog-context-label').textContent =
      (preview.branchId ? 'Branch selected' : 'Branch not selected') + ' · ' +
      (preview.fulfilmentType === 'delivery' ? 'Delivery' : 'Pickup') + ' · ' +
      'Times evaluated in ' + preview.timezone;

    renderProducts(preview.products);
    renderDeals(preview.deals, preview);
    publicationMeta.hidden = false;
    publicationMeta.textContent = 'Publication ' + preview.publicationId +
      ' · Version ' + preview.versionId +
      ' · Database time ' + preview.databaseNow +
      ' · Preview only';
  }

  function renderState(state) {
    if (!state) return;
    if (state.loadState === 'loading') {
      setConnection('loading', 'Verifying the current published catalog and its database timestamp…');
      contextSection.hidden = true;
      renderPreview(null);
      return;
    }
    if (state.loadState === 'unpublished') {
      setConnection('unpublished', state.error ? state.error.message : 'No published catalog is available.');
      contextSection.hidden = true;
      publicationMeta.hidden = true;
      renderPreview(null);
      return;
    }
    if (state.loadState === 'error') {
      setConnection('error', state.error ? state.error.message : 'The catalog preview could not be loaded.');
      contextSection.hidden = true;
      publicationMeta.hidden = true;
      renderPreview(null);
      return;
    }
    if (state.loadState === 'ready') {
      setConnection('ready', 'The published catalog passed V3 validation. Select a branch and fulfilment method to preview availability.');
      contextSection.hidden = false;
    }
  }

  function initialise() {
    if (!window.FlameChickCatalogV3Preview) {
      setConnection('error', 'The preview modules are not available on this page.');
      reloadButton.disabled = true;
      return;
    }

    app = window.FlameChickCatalogV3Preview.createCatalogPreview({
      config: window.FLAME_CHICK_CONFIG
    });
    if (!app || app.ok !== true) {
      setConnection('error', app && app.message ? app.message : 'Preview could not be initialized.');
      reloadButton.disabled = true;
      return;
    }

    app.subscribe(function (state) {
      renderState(state);
      renderPreview(app.getPreview());
    });

    function begin() {
      currentPreviewId = null;
      closeDealConfigurator();
      productCatalog.replaceChildren();
      productNav.replaceChildren();
      dealCatalog.replaceChildren();
      catalogSection.hidden = true;
      dealsSection.hidden = true;
      contextSection.hidden = true;
      setConnection('loading', 'Verifying the current published catalog and its database timestamp…');
      app.start().then(function (result) {
        if (!result || result.state === 'error' || result.state === 'unpublished') {
          renderState(app.getState());
          return;
        }
        contextSection.hidden = false;
        app.renderSelection(branchSelector, {
          document: document,
          onChange: function (selectionState) {
            renderPreview(app.getPreview());
            if (selectionState && selectionState.ready) {
              connectionMessage.textContent = 'Published catalog verified for the selected branch and fulfilment method.';
            } else if (selectionState && selectionState.branchRequired) {
              connectionMessage.textContent = 'Choose a branch to continue. Delivery and pickup will be shown according to its published settings.';
            } else {
              connectionMessage.textContent = 'Choose delivery or pickup to build a branch-specific preview.';
            }
          }
        });
        renderPreview(app.getPreview());
      }).catch(function () {
        renderState(app.getState());
      });
    }

    reloadButton.addEventListener('click', function () {
      reloadButton.disabled = true;
      app.reload().finally(function () { reloadButton.disabled = false; });
    });
    closeConfigButton.addEventListener('click', closeDealConfigurator);
    begin();
  }

  document.addEventListener('DOMContentLoaded', initialise, { once: true });
})();
