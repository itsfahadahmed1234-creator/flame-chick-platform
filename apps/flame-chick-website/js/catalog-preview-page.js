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
  var productDialog = byId('product-detail-dialog');
  var productDialogContent = byId('product-detail-content');
  var closeProductButton = byId('close-product-detail');

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

  function closeProductDetail() {
    if (productDialog && productDialog.open) productDialog.close();
    if (productDialogContent) productDialogContent.replaceChildren();
  }

  function openProductDetail(product, currency) {
    if (!productDialog || typeof productDialog.showModal !== 'function' || !productDialogContent) return;
    productDialogContent.replaceChildren();
    productDialog.setAttribute('aria-labelledby', 'product-detail-heading');

    var art = element('div', 'fc-preview-placeholder product-detail-art', 'Catalog image pending');
    var title = element('h2', 'product-detail-title', product.name);
    title.id = 'product-detail-heading';
    productDialogContent.appendChild(art);
    productDialogContent.appendChild(title);
    if (product.description) productDialogContent.appendChild(element('p', 'product-detail-description', product.description));
    if (product.nameUr) productDialogContent.appendChild(element('p', 'product-detail-name-ur', product.nameUr));

    var variantLabel = element('label', 'fc-menu-variant-label product-detail-variant-label',
      product.variants.length > 1 ? 'Choose an option' : 'Published option');
    var variantSelect = element('select', 'fc-menu-variant-select');
    variantSelect.name = 'product-detail-variant-' + product.id;
    variantSelect.setAttribute('aria-label', 'Choose an option for ' + product.name);
    if (product.variants.length > 1) {
      var placeholderOption = element('option', '', 'Choose an option');
      placeholderOption.value = '';
      variantSelect.appendChild(placeholderOption);
    }
    product.variants.forEach(function (variant) {
      var option = element('option', '', variant.label + ' — ' + formatMoney(variant.priceMinor, currency));
      option.value = variant.id;
      variantSelect.appendChild(option);
    });
    if (product.variants.length === 1) variantSelect.value = product.variants[0].id;
    else variantSelect.selectedIndex = 0;
    variantLabel.appendChild(variantSelect);
    productDialogContent.appendChild(variantLabel);

    var priceLine = element('p', 'fc-preview-price product-detail-price');
    var modifierTarget = element('div', 'fc-preview-product-modifiers');
    var validateButton = element('button', 'button button-secondary fc-preview-validate product-detail-validate',
      'Validate preview choices');
    validateButton.type = 'button';
    var status = element('p', 'fc-preview-status product-detail-status',
      'Choose a product option to inspect its published price and customization choices.');
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
        status.className = 'fc-preview-status product-detail-status';
        return;
      }

      product.modifierGroups.forEach(function (group) {
        var choices = group.modifiers.map(function (modifier) {
          return { modifier: modifier, priceMinor: availableModifierPrice(modifier, variantId) };
        }).filter(function (item) { return item.priceMinor !== null; });
        var fieldset = element('fieldset', 'fc-preview-modifiers');
        fieldset.appendChild(element('legend', '', group.name +
          (group.minSelect > 0 ? ' · required' : ' · optional')));
        if (!choices.length) {
          fieldset.appendChild(element('p', 'fc-preview-status', 'No valid price is published for this option.'));
        }
        choices.forEach(function (choice) {
          var label = element('label', 'fc-preview-modifier');
          var input = element('input');
          input.type = 'checkbox';
          input.value = choice.modifier.id;
          input.setAttribute('data-modifier-group', group.id);
          input.setAttribute('data-modifier-id', choice.modifier.id);
          input.setAttribute('aria-label', choice.modifier.name + ' ' + formatMoney(choice.priceMinor, currency));
          label.appendChild(input);
          label.appendChild(element('span', '', choice.modifier.name + ' · ' + formatMoney(choice.priceMinor, currency)));
          fieldset.appendChild(label);
        });
        modifierTarget.appendChild(fieldset);
      });

      status.textContent = product.modifierGroups.length
        ? 'Customization prices are shown individually. No combined total is calculated.'
        : 'No customization groups are published for this product.';
      status.className = 'fc-preview-status product-detail-status';
    }

    variantSelect.addEventListener('change', renderModifiers);
    validateButton.addEventListener('click', function () {
      var variant = product.variants.find(function (item) { return item.id === variantSelect.value; });
      if (!variant) {
        status.textContent = 'Choose a valid product option.';
        status.className = 'fc-preview-status is-invalid product-detail-status';
        return;
      }
      var invalidMessage = null;
      product.modifierGroups.forEach(function (group) {
        var checks = modifierTarget.querySelectorAll('input[data-modifier-group="' + group.id + '"]');
        var selected = Array.prototype.filter.call(checks, function (input) { return input.checked; });
        if (!invalidMessage && selected.length < group.minSelect) {
          invalidMessage = 'Select at least ' + group.minSelect + ' option(s) for ' + group.name + '.';
        } else if (!invalidMessage && selected.length > group.maxSelect) {
          invalidMessage = 'Select no more than ' + group.maxSelect + ' option(s) for ' + group.name + '.';
        }
      });
      if (invalidMessage) {
        status.textContent = invalidMessage;
        status.className = 'fc-preview-status is-invalid product-detail-status';
      } else {
        status.textContent = 'Product choices validated locally. No item was added to a cart, no quote was requested and no order was created.';
        status.className = 'fc-preview-status is-valid product-detail-status';
      }
    });

    productDialogContent.appendChild(priceLine);
    productDialogContent.appendChild(modifierTarget);
    productDialogContent.appendChild(validateButton);
    productDialogContent.appendChild(status);
    renderModifiers();
    productDialog.showModal();
    if (closeProductButton) closeProductButton.focus();
  }

  function buildProductCard(product, currency) {
    var card = element('article', 'fc-menu-product');
    card.setAttribute('data-product-id', product.id);
    card.appendChild(element('div', 'fc-preview-placeholder', 'Catalog image pending'));
    card.appendChild(element('h3', 'fc-menu-product-name', product.name));
    if (product.description) card.appendChild(element('p', 'fc-menu-product-description', product.description));
    if (product.nameUr) card.appendChild(element('p', 'fc-preview-status', product.nameUr));
    var summary = product.variants.length > 1
      ? product.variants.length + ' published options'
      : (product.variants.length ? product.variants[0].label + ' · ' +
        formatMoney(product.variants[0].priceMinor, currency) : 'No published option');
    card.appendChild(element('p', 'fc-preview-variants', summary));
    var open = element('button', 'button button-secondary fc-menu-product-open',
      product.variants.length > 1 ? 'View options' : 'View details');
    open.type = 'button';
    open.addEventListener('click', function () { openProductDetail(product, currency); });
    card.appendChild(open);
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
      showVariantBasePrice: false,
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
        var card = element('article', 'deal-card' + (deal.available ? '' : ' is-unavailable'));
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
          return variant.label;
        }).join('  |  ');
        if (variantsText) card.appendChild(element('p', 'fc-preview-variants', variantsText));

        var configure = element('button', 'button button-primary deal-configure',
          deal.available ? 'Preview deal choices' : 'View deal details');
        configure.type = 'button';
        configure.disabled = !deal.branchAvailable;
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
      closeProductDetail();
      return;
    }
    if (currentPreviewId !== preview.previewId) {
      closeDealConfigurator();
      closeProductDetail();
    }
    currentPreviewId = preview.previewId;
    catalogSection.hidden = false;
    dealsSection.hidden = false;
    var fulfilmentLabel = preview.fulfilmentType === 'delivery' ? 'Delivery' :
      (preview.fulfilmentType === 'pickup' ? 'Pickup' : 'Menu browsing only');
    var orderingLabel = preview.orderingEnabled
      ? 'Online ordering available'
      : (preview.fulfilmentType
        ? 'Online ordering unavailable for this fulfilment method'
        : (preview.availableFulfilmentTypes.length
          ? 'Read-only until a fulfilment method is selected'
          : 'Read-only; website ordering is disabled for this branch'));
    byId('catalog-context-label').textContent =
      (preview.branchId ? 'Branch selected' : 'Branch not selected') + ' · ' +
      fulfilmentLabel + ' · ' + orderingLabel + ' · ' +
      'Times evaluated in ' + preview.timezone;

    renderProducts(preview.products);
    renderDeals(preview.deals, preview);
    publicationMeta.hidden = false;
    // Reveal only after both product and deal view models have rendered.
    catalogSection.hidden = false;
    dealsSection.hidden = false;
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
      setConnection('ready', 'The published catalog passed V3 validation. Select a branch to browse the menu; choose an available fulfilment method to check online ordering.');
      contextSection.hidden = false;
    }
  }

  function renderBranchSelector() {
    return app.renderSelection(branchSelector, {
      document: document,
      onChange: function (selectionState) {
        renderPreview(app.getPreview());
        if (selectionState && selectionState.ready) {
          connectionMessage.textContent = 'Published catalog verified for the selected branch and fulfilment method.';
        } else if (selectionState && selectionState.branchRequired) {
          connectionMessage.textContent = 'Choose a branch to browse its published menu and see its ordering options.';
        } else if (selectionState && selectionState.selectedBranchId &&
                   selectionState.availableFulfilmentTypes.length === 0) {
          connectionMessage.textContent = 'The published menu is available for browsing, but website ordering is disabled for this branch.';
        } else {
          connectionMessage.textContent = 'The menu is displayed read-only until you choose an available fulfilment method.';
        }
      }
    });
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
        var selectionRender = renderBranchSelector();
        if (!selectionRender || selectionRender.ok !== true) {
          setConnection('error', selectionRender && selectionRender.message
            ? selectionRender.message : 'Branch and fulfilment controls could not be rendered.');
          return;
        }
        renderPreview(app.getPreview());
      }).catch(function () {
        renderState(app.getState());
      });
    }

    reloadButton.addEventListener('click', function () {
      reloadButton.disabled = true;
      app.reload().then(function (result) {
        if (!result || result.state === 'error' || result.state === 'unpublished') {
          renderState(app.getState());
          return;
        }
        // Reload creates a new selection controller. Re-render its controls so
        // radio handlers do not retain the previous, invalidated controller.
        contextSection.hidden = false;
        var selectionRender = renderBranchSelector();
        if (!selectionRender || selectionRender.ok !== true) {
          catalogSection.hidden = true;
          dealsSection.hidden = true;
          setConnection('error', selectionRender && selectionRender.message
            ? selectionRender.message : 'Branch and fulfilment controls could not be rendered after reload.');
          return;
        }
        renderPreview(app.getPreview());
      }).catch(function () {
        renderState(app.getState());
      }).finally(function () {
        reloadButton.disabled = false;
      });
    });
    closeConfigButton.addEventListener('click', closeDealConfigurator);
    if (closeProductButton) closeProductButton.addEventListener('click', closeProductDetail);
    if (productDialog) productDialog.addEventListener('close', function () {
      if (productDialogContent) productDialogContent.replaceChildren();
    });
    begin();
  }

  document.addEventListener('DOMContentLoaded', initialise, { once: true });
})();
