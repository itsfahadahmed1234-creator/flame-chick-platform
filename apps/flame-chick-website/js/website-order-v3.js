/* Flame Chick customer Website V3 order page.
 * The browser only submits catalog IDs and explicit choices. The Order API
 * recalculates every item, validates current branch/area settings, and commits
 * the order and per-phone quota atomically. No customer details are persisted.
 */
(function (root) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var PENDING_CHECKOUT_STORAGE_KEY = 'flame-chick-v3-pending-checkout-id';
  function validRequestId(value) {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
  function readPendingRequestId() {
    try {
      var value = root.sessionStorage.getItem(PENDING_CHECKOUT_STORAGE_KEY);
      return validRequestId(value) ? value : null;
    } catch (_) { return null; }
  }
  function savePendingRequestId(value) {
    if (!validRequestId(value)) return false;
    try {
      root.sessionStorage.setItem(PENDING_CHECKOUT_STORAGE_KEY, value);
      return root.sessionStorage.getItem(PENDING_CHECKOUT_STORAGE_KEY) === value;
    } catch (_) { return false; }
  }
  function clearPendingRequestId() {
    try { root.sessionStorage.removeItem(PENDING_CHECKOUT_STORAGE_KEY); } catch (_) {}
  }

  var state = {
    snapshot: null, databaseNow: null, websiteContext: null,
    branchSelection: null, preview: null, cart: [],
    checkoutRequestId: null, checkoutBody: null, checkoutUncertain: false,
    productDialog: null, dealConfigurator: null,
    busy: false, loaded: false
  };
  var money = function (value) {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency', currency: state.websiteContext?.currencyCode || 'PKR',
      maximumFractionDigits: 2
    }).format(Number(value) || 0);
  };
  var text = function (value) { return String(value === null || value === undefined ? '' : value); };
  var clone = function (value) { return JSON.parse(JSON.stringify(value)); };

  function status(message, kind) {
    var node = $('order-status');
    node.textContent = message;
    node.className = 'order-status' + (kind ? ' ' + kind : '');
  }

  function pageStatus() {
    /* Catalog status UI intentionally removed; failures remain visible in the menu/cart context. */
  }

  function orderWritesAllowed() {
    var guard = root.FlameChickWebsitePreviewGuard;
    return !!guard && typeof guard.canSubmitOrders === 'function' &&
      guard.canSubmitOrders(root.location && root.location.hostname);
  }

  function isTestCheckoutPreview() {
    var guard = root.FlameChickWebsitePreviewGuard;
    return !!guard && typeof guard.isTestCheckoutPreview === 'function' &&
      guard.isTestCheckoutPreview(root.location && root.location.hostname);
  }

  function syncCatalogDialogState() {
    var productDialog = $('product-dialog');
    var dealDialog = $('deal-dialog');
    document.body.classList.toggle('fc-catalog-dialog-open',
      !!((productDialog && productDialog.open) || (dealDialog && dealDialog.open)));
  }

  function applyPreviewReadOnlyMode() {
    var testPreview = isTestCheckoutPreview();
    var preview = !orderWritesAllowed();
    document.body.classList.toggle('fc-website-preview-readonly', preview);
    document.body.classList.toggle('fc-website-preview-test-checkout', testPreview);
    $('fc-preview-checkout-notice').hidden = !(preview || testPreview);
    if (testPreview) {
      $('fc-preview-checkout-notice').textContent =
        'TEST CHECKOUT PREVIEW: a successful submission creates a clearly marked test order in the Flame Chick database and POS. Do not prepare, dispatch or collect payment.';
    } else if (preview) {
      $('fc-preview-checkout-notice').textContent =
        'Preview mode is read-only here. Cart and catalogue review are available, but checkout writes are disabled.';
      $('place-order').disabled = true;
      $('retry-order').disabled = true;
    }
    return preview;
  }

  function apiConfig() {
    var config = root.FLAME_CHICK_CONFIG || {};
    if (typeof config.orderApiBase !== 'string' || !/^https:\/\//.test(config.orderApiBase) ||
        typeof config.publishableKey !== 'string' || !config.publishableKey) {
      throw new Error('Website order API is not configured.');
    }
    return config;
  }

  async function orderApi(method, query, body) {
    if (String(method || '').toUpperCase() !== 'GET' && !orderWritesAllowed()) {
      throw new Error('Checkout is disabled on this Website Preview. Your cart and menu are available for review only.');
    }
    var config = apiConfig();
    var url = config.orderApiBase + (query ? (config.orderApiBase.indexOf('?') >= 0 ? '&' : '?') + query : '');
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 18000) : null;
    try {
      var response = await fetch(url, {
        method: method,
        cache: 'no-store',
        redirect: 'error',
        signal: controller ? controller.signal : undefined,
        headers: {
          apikey: config.publishableKey,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
      var result;
      try { result = await response.json(); }
      catch (_) { throw new Error('Flame Chick returned an invalid response.'); }
      if (!response.ok || !result || result.ok !== true) {
        var error = result && result.error ? result.error : {};
        var failure = new Error(error.message || 'The request could not be completed.');
        failure.code = error.code || 'ORDER_API_ERROR';
        failure.status = response.status;
        failure.retryAfter = Number(error.retry_after_seconds) || Number(response.headers.get('Retry-After')) || 0;
        throw failure;
      }
      return result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function loadWebsiteContext() {
    var result = await orderApi('GET', 'view=website_context');
    if (!result.data || result.data.schemaVersion !== 3 ||
        !Array.isArray(result.data.branches) || !result.data.branches.length ||
        typeof result.data.publicationId !== 'string' || typeof result.data.versionId !== 'string' ||
        typeof result.data.databaseNow !== 'string') {
      throw new Error('Branch ordering context is incomplete.');
    }
    return result.data;
  }

  function overlayCurrentBranches(snapshot, context) {
    if (!Array.isArray(context.branches) || context.branches.length !== 1) {
      throw new Error('Flame Chick online ordering currently requires exactly one enabled branch.');
    }
    var active = context.branches[0];
    var published = snapshot.branches.find(function (branch) { return branch.branchId === active.id; });
    if (!published) throw new Error('The enabled branch is not present in the current published menu.');
    var branch = Object.assign({}, published, {
      websiteOrderingEnabled: true,
      websiteDeliveryEnabled: active.websiteDeliveryEnabled === true,
      websitePickupEnabled: active.websitePickupEnabled === true
    });
    return Object.assign({}, snapshot, { branches: [branch] });
  }

  function currentContext() {
    if (!state.branchSelection) return null;
    var context = state.branchSelection.getContext();
    return context && context.ok ? context : null;
  }

  function liveBranch() {
    var selected = state.branchSelection && state.branchSelection.getState();
    if (!selected || !selected.selectedBranchId || !state.websiteContext) return null;
    return state.websiteContext.branches.find(function (branch) {
      return branch.id === selected.selectedBranchId;
    }) || null;
  }

  function syncFulfilmentControls() {
    var selected = state.branchSelection && state.branchSelection.getState();
    var available = selected ? selected.availableFulfilmentTypes : [];
    $('fulfilment-delivery').disabled = state.busy || state.checkoutUncertain || available.indexOf('delivery') < 0;
    $('fulfilment-pickup').disabled = state.busy || state.checkoutUncertain || available.indexOf('pickup') < 0;
    $('fulfilment-delivery').checked = !!selected && selected.fulfilmentType === 'delivery';
    $('fulfilment-pickup').checked = !!selected && selected.fulfilmentType === 'pickup';
  }

  function itemCountLabel() {
    var count = state.cart.reduce(function (sum, row) { return sum + row.quantity; }, 0);
    return count + (count === 1 ? ' item' : ' items');
  }

  function replayAnimation(node, className) {
    if (!node) return;
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
  }

  function animateCartAdded() {
    var rows = $('cart-lines');
    replayAnimation(rows && rows.lastElementChild, 'is-added');
    ['cart-count', 'badge', 'fc-v3-cartbar'].forEach(function (id) {
      replayAnimation($(id), 'is-bumped');
    });
  }

  function checkoutMotion(stage) {
    var footer = document.querySelector('.fc-v3-cart-footer');
    if (!footer) return;
    footer.classList.remove('is-checking', 'is-ready', 'is-ordering', 'is-confirmed', 'has-error');
    if (stage) footer.classList.add(stage);
    if ($('place-order')) $('place-order').classList.toggle('is-ready', stage === 'is-ready');
    if ($('retry-order')) $('retry-order').classList.toggle('is-ordering', stage === 'is-ordering');
  }

  function clearCheckoutMotionLater() {
    window.setTimeout(function () { checkoutMotion(null); }, 1800);
  }

  function openCartDrawer() {
    if (state.busy || state.checkoutUncertain) return;
    var drawer = $('fc-v3-cart-drawer');
    drawer.inert = false;
    drawer.setAttribute('aria-hidden', 'false');
    drawer.classList.add('on');
    $('fc-v3-cart-scrim').classList.add('on');
    $('headCart').setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('lock');
    window.setTimeout(function () { $('close-fc-v3-cart').focus(); }, 60);
  }

  function closeCartDrawer() {
    var drawer = $('fc-v3-cart-drawer');
    if (!drawer || state.busy || state.checkoutUncertain) return;
    drawer.classList.remove('on');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;
    $('fc-v3-cart-scrim').classList.remove('on');
    $('headCart').setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('lock');
    $('headCart').focus();
  }

  function resetCheckout(message) {
    if (state.checkoutUncertain || state.busy) return;
    state.checkoutRequestId = null;
    state.checkoutBody = null;
    clearPendingRequestId();
    $('place-order').hidden = false;
    $('retry-order').hidden = true;
    $('place-order').disabled = !orderWritesAllowed() || state.cart.length === 0 ||
      !currentContext();
    if (message) status(message);
  }

  function canEdit() { return !state.busy && !state.checkoutUncertain && $('order-success').hidden; }
  function invalidateCheckout() {
    if (state.checkoutUncertain || state.busy) return;
    resetCheckout('Your changes are ready. Place your order when you are finished.');
    renderCart();
  }

  function clearCart(reason) {
    if (state.cart.length && reason) status(reason);
    state.cart = [];
    invalidateCheckout();
    renderCart();
  }

  function renderCart() {
    var list = $('cart-lines');
    list.replaceChildren();
    var itemCount = state.cart.reduce(function (sum, row) { return sum + row.quantity; }, 0);
    $('cart-count').textContent = '(' + itemCount + ')';
    if ($('badge')) $('badge').textContent = String(itemCount);
    $('cart-empty').hidden = state.cart.length > 0;
    $('fc-v3-cartbar').hidden = state.cart.length === 0;
    $('fc-v3-cartbar-count').textContent = itemCountLabel();
    $('place-order').disabled = !orderWritesAllowed() || state.cart.length === 0 ||
      !currentContext() || state.busy || state.checkoutUncertain;

    state.cart.forEach(function (row, index) {
      var article = document.createElement('article');
      article.className = 'order-cart-row';
      var name = document.createElement('strong');
      name.textContent = row.label;
      var meta = document.createElement('span');
      meta.className = 'order-hint';
      meta.textContent = row.kind === 'deal' ? 'Deal selection' : 'Product selection';
      var controls = document.createElement('div');
      controls.className = 'order-cart-controls';
      var decrement = document.createElement('button');
      decrement.type = 'button'; decrement.textContent = '−'; decrement.disabled = !canEdit();
      decrement.addEventListener('click', function () {
        if (!canEdit()) return;
        if (row.quantity <= 1) state.cart.splice(index, 1);
        else row.quantity -= 1;
        invalidateCheckout();
      });
      var quantity = document.createElement('output');
      quantity.className = 'order-cart-quantity';
      quantity.textContent = String(row.quantity);
      quantity.setAttribute('aria-label', 'Quantity ' + row.quantity + ' for ' + row.label);
      var increment = document.createElement('button');
      increment.type = 'button'; increment.textContent = '+'; increment.disabled = !canEdit() || row.quantity >= 99;
      increment.addEventListener('click', function () {
        if (!canEdit() || row.quantity >= 99) return;
        row.quantity += 1; invalidateCheckout();
      });
      var remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = 'Remove'; remove.disabled = !canEdit();
      remove.addEventListener('click', function () {
        if (!canEdit()) return;
        state.cart.splice(index, 1); invalidateCheckout();
      });
      controls.append(decrement, quantity, increment, remove);
      article.append(name, meta, controls);
      list.appendChild(article);
    });
    syncFulfilmentControls();
  }

  function renderCatalog() {
    var context = currentContext();
    if (!context || !state.snapshot) {
      $('catalog-section').hidden = true;
      $('cats').hidden = true;
      $('deals-section').hidden = true;
      $('details-section').hidden = true;
      status('Online ordering is unavailable for the configured branch.', 'error');
      return;
    }
    $('catalog-section').hidden = false;
    $('cats').hidden = false;
    $('deals-section').hidden = false;
    $('details-section').hidden = false;
    var live = liveBranch();
    $('delivery-fields').hidden = context.fulfilmentType !== 'delivery';
    populateDeliveryAreas(live);

    var model = root.FlameChickCatalogV3View.buildMenuViewModel(
      state.snapshot, { branchId: context.branchId, fulfilmentType: context.fulfilmentType }, root.FlameChickCatalogV3
    );
    if (!model || model.ok !== true) {
      status(model?.message || 'The published product menu could not be built.', 'error');
      $('product-catalog').replaceChildren();
      $('product-category-nav').replaceChildren();
      return;
    }
    state.productModel = model;
    renderProducts(model);

    var deals = root.FlameChickCatalogV3DealView.buildDealViewModel(
      state.snapshot,
      { branchId: context.branchId, fulfilmentType: context.fulfilmentType, databaseNow: state.databaseNow },
      root.FlameChickCatalogV3
    );
    if (!deals || deals.ok !== true) {
      $('deal-catalog').replaceChildren();
      $('deals-empty').hidden = false;
      $('deals-empty').textContent = deals?.message || 'Published deals could not be evaluated.';
      return;
    }
    state.dealModel = deals;
    renderDeals(deals);
    var hasDeals = (deals.collections || []).some(function (collection) {
      return Array.isArray(collection.deals) && collection.deals.length > 0;
    });
    if (hasDeals) {
      var dealsJump = document.createElement('button');
      dealsJump.type = 'button';
      dealsJump.className = 'chip fc-deals-category-chip';
      dealsJump.textContent = 'Deals';
      dealsJump.setAttribute('aria-label', 'Jump to Deals');
      dealsJump.addEventListener('click', function () {
        var target = $('deals-section');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      $('catsIn').appendChild(dealsJump);
    }
  }

  function cardPrice(priceMinor) {
    var view = root.FlameChickCatalogV3View;
    if (!view || typeof view.formatMoney !== 'function') {
      throw new Error('The catalog price formatter is unavailable.');
    }
    var currency = state.websiteContext && state.websiteContext.currencyCode
      ? state.websiteContext.currencyCode : 'PKR';
    return view.formatMoney(priceMinor, currency, 'en-PK');
  }

  function appendProductArtwork(container, product, categoryName) {
    var imagePath = typeof product.imagePath === 'string' ? product.imagePath.trim() : '';
    if (imagePath) {
      var config = root.FLAME_CHICK_CONFIG || {};
      var base = typeof config.imagesBaseUrl === 'string' ? config.imagesBaseUrl.replace(/\/+$/, '') : '';
      if (base && /^https:\/\//i.test(base)) {
        var safePath = imagePath.split('/').filter(Boolean).map(function (part) {
          return encodeURIComponent(part);
        }).join('/');
        var img = document.createElement('img');
        img.alt = product.name || '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.src = base + '/' + safePath;
        img.onerror = function () {
          img.remove();
          container.textContent = '🍗';
          container.setAttribute('aria-label', product.name || categoryName || 'Flame Chick menu item');
        };
        container.appendChild(img);
        return;
      }
    }
    var label = String(product.name || categoryName || '').toLowerCase();
    var icon = /drink|juice|water|soda/.test(label) ? '🥤' :
      /pizza/.test(label) ? '🍕' : /burger|sandwich/.test(label) ? '🍔' :
      /nugget|wing|broast|chicken/.test(label) ? '🍗' : '🍟';
    container.textContent = icon;
    container.style.display = 'grid';
    container.style.placeItems = 'center';
    container.style.fontSize = 'clamp(42px, 10vw, 72px)';
    container.setAttribute('aria-label', product.name || categoryName || 'Flame Chick menu item');
  }

  function renderProducts(model) {
    var nav = $('catsIn'), rootNode = $('menuRoot');
    nav.replaceChildren(); rootNode.replaceChildren();
    $('products-empty').hidden = model.categories.length > 0;
    model.categories.forEach(function (category) {
      var jump = document.createElement('button');
      jump.type = 'button'; jump.className = 'chip'; jump.textContent = category.name;
      jump.addEventListener('click', function () {
        var target = document.getElementById('fc-order-category-' + category.id);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      nav.appendChild(jump);

      var section = document.createElement('section');
      section.className = 'cat';
      section.id = 'fc-order-category-' + category.id;
      var heading = document.createElement('div'); heading.className = 'cat-head';
      var headingText = document.createElement('h3'); headingText.className = 'cat-pill';
      headingText.textContent = category.name;
      var line = document.createElement('span'); line.className = 'cat-line'; line.setAttribute('aria-hidden', 'true');
      heading.append(headingText, line);
      section.appendChild(heading);

      var grid = document.createElement('div'); grid.className = 'items';
      category.products.forEach(function (product) {
        var card = document.createElement('article');
        card.className = 'card fc-home-product-card';
        card.setAttribute('data-product-id', product.id);
        card.setAttribute('role', 'group');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', product.name + '. Open product details.');
        card.setAttribute('aria-haspopup', 'dialog');

        var art = document.createElement('div'); art.className = 'art';
        var name = String(product.name || '').toLowerCase();
        if (/drink|juice|water/.test(name)) { art.style.setProperty('--t1', '#58B6EA'); art.style.setProperty('--t2', '#1565C0'); }
        else if (/broast|wing|nugget/.test(name) || String(category.name).toLowerCase().indexOf('broast') >= 0) {
          art.style.setProperty('--t1', '#F2B24D'); art.style.setProperty('--t2', '#B84A12');
        } else { art.style.setProperty('--t1', '#FF8A1F'); art.style.setProperty('--t2', '#A9000C'); }
        appendProductArtwork(art, product, category.name);

        var body = document.createElement('div'); body.className = 'body';
        var title = document.createElement('h3'); title.textContent = product.name;
        body.appendChild(title);
        if (product.description) {
          var description = document.createElement('p'); description.className = 'desc';
          description.textContent = product.description; body.appendChild(description);
        }

        var firstVariant = product.variants[0] || null;
        if (product.variants.length > 1 || !firstVariant) {
          var variantMeta = document.createElement('span');
          variantMeta.className = 'fc-home-single-variant';
          variantMeta.textContent = product.variants.length > 1 ? 'Multiple options' : 'Unavailable';
          body.appendChild(variantMeta);
        }

        var foot = document.createElement('div'); foot.className = 'foot';
        var price = document.createElement('span'); price.className = 'price';
        price.textContent = firstVariant ? cardPrice(firstVariant.priceMinor) : 'Price unavailable';
        var controls = document.createElement('div'); controls.className = 'ctl fc-home-product-controls';
        var add = document.createElement('button');
        add.type = 'button'; add.className = 'add';
        var directVariant = product.variants.length === 1 ? firstVariant : null;
        var directValidation = directVariant
          ? root.FlameChickCatalogV3DealView.validateModifierSelections(
              root.FlameChickCatalogV3DealView.buildProductModifierGroups(
                state.snapshot, product.id, directVariant.id, root.FlameChickCatalogV3
              ), Object.create(null))
          : null;
        var canDirectAdd = !!(directVariant && directValidation && directValidation.ok === true);
        add.textContent = canDirectAdd ? 'Add' : 'Choose options';
        add.disabled = !firstVariant || !canEdit();
        add.addEventListener('click', function (event) {
          event.stopPropagation();
          if (!canEdit()) return;
          if (canDirectAdd) addProductDirectly(product, directVariant.id);
          else openProductCustomizer(product, null);
        });

        foot.append(price, add);
        body.appendChild(foot);
        card.append(art, body);
        function openDetails() { openProductCustomizer(product, null); }
        card.addEventListener('click', function (event) {
          if (event.target && event.target.closest && event.target.closest('button,select,input,a')) return;
          openDetails();
        });
        card.addEventListener('keydown', function (event) {
          if ((event.key === 'Enter' || event.key === ' ') && event.target === card) {
            event.preventDefault(); openDetails();
          }
        });
        grid.appendChild(card);
      });
      section.appendChild(grid);
      rootNode.appendChild(section);
    });
  }

  function productModifierGroups(product, variantId) {
    return root.FlameChickCatalogV3DealView.buildProductModifierGroups(
      state.snapshot, product.id, variantId, root.FlameChickCatalogV3
    );
  }

  function addProductDirectly(product, variantId) {
    if (!canEdit()) return;
    var groups = productModifierGroups(product, variantId);
    var validation = root.FlameChickCatalogV3DealView.validateModifierSelections(groups, Object.create(null));
    if (!validation || validation.ok !== true) {
      openProductCustomizer(product, variantId);
      return;
    }
    var variant = product.variants.find(function (row) { return row.id === variantId; });
    if (!variant) return;
    state.cart.push({
      kind: 'product',
      label: product.name + ' · ' + variant.label,
      quantity: 1,
      payload: {
        kind: 'product', productId: product.id, productVariantId: variantId,
        quantity: 1, modifiers: validation.selections
      }
    });
    invalidateCheckout();
    animateCartAdded();
    status(product.name + ' added to your cart.');
  }

  function openProductCustomizer(product, initialVariantId) {
    if (!canEdit()) return;
    var dialog = $('product-dialog');
    var content = $('product-dialog-content');
    var selectedVariantId = initialVariantId ||
      (product.variants.length === 1 ? product.variants[0].id : null);

    function renderVariant() {
      content.replaceChildren();
      var variant = product.variants.find(function (row) { return row.id === selectedVariantId; }) || null;
      var top = document.createElement('div'); top.className = 'fc-product-popup-top';
      var art = document.createElement('div'); art.className = 'art fc-product-popup-art';
      appendProductArtwork(art, product, '');
      var intro = document.createElement('div'); intro.className = 'fc-product-popup-intro';
      var heading = document.createElement('h2'); heading.textContent = product.name;
      var description = document.createElement('p'); description.className = 'fc-product-popup-description';
      description.textContent = product.description || 'Choose your preferred option and customize your order.';
      intro.append(heading, description);
      top.append(art, intro); content.appendChild(top);

      if (product.variants.length > 1) {
        var variantField = document.createElement('div'); variantField.className = 'fc-product-popup-field';
        var variantLabel = document.createElement('label');
        variantLabel.textContent = 'Choose size / option';
        var variantSelect = document.createElement('select');
        variantSelect.setAttribute('aria-label', 'Choose size or option for ' + product.name);
        var placeholder = document.createElement('option');
        placeholder.value = ''; placeholder.textContent = 'Select an option';
        variantSelect.appendChild(placeholder);
        product.variants.forEach(function (row) {
          var option = document.createElement('option');
          option.value = row.id;
          option.textContent = row.label + ' · ' + cardPrice(row.priceMinor);
          variantSelect.appendChild(option);
        });
        variantSelect.value = selectedVariantId || '';
        variantSelect.addEventListener('change', function () {
          selectedVariantId = variantSelect.value || null;
          renderVariant();
        });
        variantField.append(variantLabel, variantSelect);
        content.appendChild(variantField);
      }

      var priceRow = document.createElement('div'); priceRow.className = 'fc-product-popup-price';
      var priceCaption = document.createElement('span'); priceCaption.textContent = 'Published price';
      var priceValue = document.createElement('strong');
      priceValue.textContent = variant ? cardPrice(variant.priceMinor) : 'Choose an option';
      priceRow.append(priceCaption, priceValue); content.appendChild(priceRow);

      if (!variant) {
        var prompt = document.createElement('p'); prompt.className = 'fc-product-popup-prompt';
        prompt.textContent = 'Select a size or option to continue.';
        content.appendChild(prompt);
        var waiting = document.createElement('button'); waiting.type = 'button';
        waiting.className = 'fc-product-popup-add'; waiting.disabled = true;
        waiting.textContent = 'Add to cart';
        content.appendChild(waiting);
        return;
      }

      var groups = productModifierGroups(product, variant.id);
      var selections = Object.create(null);
      groups.forEach(function (group) { selections[group.id] = []; });
      var groupInputs = [];
      groups.forEach(function (group) {
        var groupDetails = document.createElement('details'); groupDetails.className = 'fc-product-popup-group';
        var groupSummary = document.createElement('summary');
        groupSummary.textContent = group.name + (group.minSelect > 0
          ? ' · Required ' + group.minSelect + '–' + group.maxSelect
          : ' · Optional');
        groupDetails.appendChild(groupSummary);
        var fieldset = document.createElement('fieldset'); fieldset.className = 'order-modifier-group';
        var legend = document.createElement('legend');
        legend.textContent = group.name;
        fieldset.appendChild(legend);
        if (group.branchSatisfiable === false) {
          var unavailable = document.createElement('p'); unavailable.className = 'fc-product-popup-prompt';
          unavailable.textContent = 'These options are currently unavailable for this product size.';
          fieldset.appendChild(unavailable);
        }
        group.modifiers.forEach(function (modifier) {
          var label = document.createElement('label'); label.className = 'order-modifier-option';
          var input = document.createElement('input');
          input.type = group.selectionMode === 'SINGLE' ? 'radio' : 'checkbox';
          input.name = 'product-modifier-' + group.id;
          input.value = modifier.id;
          input.disabled = group.branchSatisfiable === false;
          input.addEventListener('change', function () {
            if (input.type === 'radio') selections[group.id] = input.checked ? [modifier.id] : [];
            else if (input.checked) {
              if (selections[group.id].length >= group.maxSelect) {
                input.checked = false;
                status('Choose no more than ' + group.maxSelect + ' options for ' + group.name + '.', 'error');
                return;
              }
              selections[group.id].push(modifier.id);
            } else {
              selections[group.id] = selections[group.id].filter(function (id) { return id !== modifier.id; });
            }
            updateAddState();
          });
          var textNode = document.createElement('span');
          textNode.textContent = modifier.name + ' · ' + cardPrice(modifier.priceMinor);
          label.append(input, textNode); fieldset.appendChild(label);
          groupInputs.push(input);
        });
        groupDetails.appendChild(fieldset);
        content.appendChild(groupDetails);
      });

      var quantityField = document.createElement('div'); quantityField.className = 'fc-product-popup-quantity-row';
      var quantityLabel = document.createElement('span'); quantityLabel.className = 'fc-product-popup-quantity-label';
      quantityLabel.textContent = 'Quantity';
      var quantity = 1;
      var quantityControl = document.createElement('div'); quantityControl.className = 'fc-product-popup-stepper';
      var quantityMinus = document.createElement('button'); quantityMinus.type = 'button';
      quantityMinus.className = 'fc-product-popup-step'; quantityMinus.textContent = '−';
      quantityMinus.setAttribute('aria-label', 'Decrease quantity'); quantityMinus.disabled = true;
      var quantityValue = document.createElement('output'); quantityValue.className = 'fc-product-popup-quantity-value';
      quantityValue.textContent = '1';
      var quantityPlus = document.createElement('button'); quantityPlus.type = 'button';
      quantityPlus.className = 'fc-product-popup-step'; quantityPlus.textContent = '+';
      quantityPlus.setAttribute('aria-label', 'Increase quantity');
      quantityMinus.addEventListener('click', function () {
        quantity = Math.max(1, quantity - 1);
        quantityValue.textContent = String(quantity);
        quantityMinus.disabled = quantity <= 1;
        quantityPlus.disabled = quantity >= 99;
      });
      quantityPlus.addEventListener('click', function () {
        quantity = Math.min(99, quantity + 1);
        quantityValue.textContent = String(quantity);
        quantityMinus.disabled = quantity <= 1;
        quantityPlus.disabled = quantity >= 99;
      });
      quantityControl.append(quantityMinus, quantityValue, quantityPlus);
      quantityField.append(quantityLabel, quantityControl);
      content.appendChild(quantityField);
      var validationMessage = document.createElement('p'); validationMessage.className = 'fc-product-popup-prompt';
      validationMessage.setAttribute('role', 'status'); validationMessage.setAttribute('aria-live', 'polite');
      var add = document.createElement('button'); add.type = 'button';
      add.className = 'fc-product-popup-add'; add.textContent = 'Add to cart';
      add.addEventListener('click', function () {
        var validation = root.FlameChickCatalogV3DealView.validateModifierSelections(groups, selections);
        if (!validation || validation.ok !== true) {
          validationMessage.textContent = validation?.message || 'Complete the required options.';
          return;
        }
        var qty = quantity;
        state.cart.push({
          kind: 'product', label: product.name + ' · ' + variant.label,
          quantity: qty,
          payload: {
            kind: 'product', productId: product.id, productVariantId: variant.id,
            quantity: qty, modifiers: validation.selections
          }
        });
        dialog.close();
        invalidateCheckout();
        animateCartAdded();
        status(product.name + ' added to your cart.');
      });
      content.append(validationMessage, add);

      function updateAddState() {
        var validation = root.FlameChickCatalogV3DealView.validateModifierSelections(groups, selections);
        add.disabled = !validation || validation.ok !== true || !canEdit();
        validationMessage.textContent = validation && validation.ok
          ? 'Selections are ready.' : (validation?.message || 'Complete the required options.');
      }
      updateAddState();
    }

    renderVariant();
    if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
    else if (!dialog.open) dialog.setAttribute('open', '');
    syncCatalogDialogState();
  }

  function renderDeals(model) {
    var rootNode = $('deal-catalog');
    rootNode.replaceChildren();
    var count = 0;
    (model.collections || []).forEach(function (collection) {
      var section = document.createElement('section');
      section.className = 'fc-home-deal-collection';
      var heading = document.createElement('div'); heading.className = 'cat-head';
      var headingText = document.createElement('h3'); headingText.className = 'cat-pill';
      headingText.textContent = collection.title;
      var line = document.createElement('span'); line.className = 'cat-line'; line.setAttribute('aria-hidden', 'true');
      heading.append(headingText, line); section.appendChild(heading);
      var grid = document.createElement('div'); grid.className = 'items';
      (collection.deals || []).forEach(function (deal) {
        count += 1;
        var card = document.createElement('article'); card.className = 'card fc-home-deal-card';
        var art = document.createElement('div'); art.className = 'art';
        art.style.setProperty('--t1', '#F7A53B'); art.style.setProperty('--t2', '#8A0010');
        var image = document.createElement('img'); image.src = 'media/products/flame-chick-burger-2.png';
        image.alt = deal.title; image.width = 320; image.height = 320; image.loading = 'lazy';
        art.appendChild(image);
        var body = document.createElement('div'); body.className = 'body';
        var name = document.createElement('h3'); name.textContent = deal.title;
        var info = document.createElement('p'); info.className = 'desc';
        info.textContent = deal.description || (deal.available ? 'Choose your combo options.' : (deal.unavailableReason || 'Not orderable at this time.'));
        var foot = document.createElement('div'); foot.className = 'foot';
        var label = document.createElement('span'); label.className = 'fc-deal-label';
        label.textContent = deal.available ? 'Published deal' : 'Unavailable';
        var button = document.createElement('button'); button.type = 'button';
        button.className = 'add'; button.textContent = deal.available ? 'Choose deal' : 'Unavailable';
        button.disabled = !deal.available || !canEdit();
        button.addEventListener('click', function (event) {
          event.stopPropagation();
          if (canEdit()) openDealConfigurator(deal);
        });
        foot.append(label, button);
        body.append(name, info, foot);
        card.setAttribute('role', 'group');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', deal.title + '. Open deal choices.');
        card.setAttribute('aria-haspopup', 'dialog');
        card.addEventListener('click', function (event) {
          if (event.target && event.target.closest && event.target.closest('button,a,input,select')) return;
          if (deal.available && canEdit()) openDealConfigurator(deal);
        });
        card.addEventListener('keydown', function (event) {
          if ((event.key === 'Enter' || event.key === ' ') && event.target === card) {
            event.preventDefault();
            if (deal.available && canEdit()) openDealConfigurator(deal);
          }
        });
        card.append(art, body); grid.appendChild(card);
      });
      section.appendChild(grid); rootNode.appendChild(section);
    });
    $('deals-empty').hidden = count > 0;
  }
  function openDealConfigurator(deal) {
    var configurator = root.FlameChickCatalogV3DealConfigurator.createDealConfigurator(
      state.dealModel, deal.id,
      { validateModifierSelections: root.FlameChickCatalogV3DealView.validateModifierSelections }
    );
    if (!configurator || configurator.ok !== true) {
      status(configurator?.message || 'This deal could not be configured.', 'error'); return;
    }
    state.dealConfigurator = configurator;
    var availableVariants = (deal.variants || []).filter(function (variant) {
      return variant.branchSatisfiable === true;
    });
    if (availableVariants.length === 1) configurator.selectVariant(availableVariants[0].id);
    $('deal-configurator').replaceChildren();
    configurator.render($('deal-configurator'), {
      formatMoney: function (minor) { return cardPrice(minor); },
      completeButtonLabel: 'Add deal to cart',
      onComplete: function (payload) {
        if (!payload || payload.ok === false) {
          if (payload && payload.message) status(payload.message, 'error');
          return;
        }
        var item = payload;
        var chosenDealQuantity = configurator.getState().dealQuantity || 1;
        item.kind = 'deal';
        item.quantity = chosenDealQuantity;
        state.cart.push({
          kind: 'deal',
          label: deal.title,
          quantity: chosenDealQuantity,
          payload: item
        });
        $('deal-dialog').close();
        invalidateCheckout();
        animateCartAdded();
        status('Deal added to your cart.');
      }
    });
    var dialog = $('deal-dialog');
    if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
    else if (!dialog.open) dialog.setAttribute('open', '');
    syncCatalogDialogState();
  }

  function renderDeliveryAreaResults(query) {
    var input = $('delivery-area-search');
    var select = $('delivery-area');
    var results = $('delivery-area-results');
    var search = String(query || '').trim().toLocaleLowerCase();
    results.replaceChildren();
    Array.from(select.options).forEach(function (option) {
      if (!option.value) return;
      var searchText = String(option.dataset.searchText || option.textContent).toLocaleLowerCase();
      if (search && searchText.indexOf(search) < 0) return;
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'fc-delivery-area-result';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', select.value === option.value ? 'true' : 'false');
      item.disabled = option.disabled;
      item.textContent = option.textContent;
      item.addEventListener('click', function () {
        if (option.disabled) return;
        select.value = option.value;
        input.value = option.textContent;
        results.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      results.appendChild(item);
    });
    if (!results.children.length) {
      var empty = document.createElement('p');
      empty.className = 'fc-delivery-area-no-results';
      empty.textContent = 'No matching delivery areas.';
      results.appendChild(empty);
    }
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function populateDeliveryAreas(branch) {
    var select = $('delivery-area');
    var input = $('delivery-area-search');
    var results = $('delivery-area-results');
    select.replaceChildren();
    var placeholder = document.createElement('option');
    placeholder.value = ''; placeholder.textContent = 'Choose your area'; select.appendChild(placeholder);
    (branch?.deliveryAreas || []).forEach(function (area) {
      var option = document.createElement('option');
      option.value = area.id;
      option.dataset.searchText = area.name;
      option.textContent = area.name + ' — ' + money(area.deliveryFee);
      select.appendChild(option);
    });
    var other = document.createElement('option');
    other.value = 'not_listed';
    other.dataset.searchText = 'Not Listed / Other';
    other.textContent = branch && branch.notListedDeliveryFee !== null
      ? 'Not Listed / Other — ' + money(branch.notListedDeliveryFee)
      : 'Not Listed / Other — fee not configured';
    other.disabled = !branch || branch.notListedDeliveryFee === null;
    select.appendChild(other);
    input.value = '';
    results.replaceChildren();
    results.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    $('not-listed-confirm-row').hidden = true;
    $('other-locality-field').hidden = true;
    $('delivery-address').value = '';
    $('other-locality').value = '';
    $('not-listed-confirm').checked = false;
  }

  function handleDeliveryAreaChange() {
    var other = $('delivery-area').value === 'not_listed';
    $('other-locality-field').hidden = !other;
    $('not-listed-confirm-row').hidden = !other;
    if (other) $('not-listed-confirm-text').textContent =
      'I understand the Not Listed delivery fee (' + money(liveBranch().notListedDeliveryFee) + ') and want the restaurant to confirm my locality.';
    invalidateCheckout();
  }

  function deliverySelection() {
    var branch = liveBranch();
    var selection = $('delivery-area').value;
    if (!selection) throw new Error('Choose a delivery area.');
    if (selection === 'not_listed') {
      if (!branch || branch.notListedDeliveryFee === null) throw new Error('Not Listed delivery is not configured for this branch.');
      if (!$('not-listed-confirm').checked) throw new Error('Confirm that you understand the Not Listed delivery fee.');
      var locality = $('other-locality').value.trim();
      if (!locality || locality.length > 120) throw new Error('Enter your locality for a Not Listed delivery.');
      return {
        selection_type: 'not_listed', other_locality: locality,
        address: $('delivery-address').value.trim()
      };
    }
    return {
      selection_type: 'listed_area', area_id: selection,
      address: $('delivery-address').value.trim()
    };
  }

  function buildRequestBody() {
    var context = currentContext();
    if (!context) throw new Error('Choose a branch and delivery or pickup first.');
    var name = $('customer-name').value.trim();
    var phone = $('customer-phone').value.trim();
    var email = $('customer-email').value.trim();
    if (!name || !phone) throw new Error('Enter your name and phone number.');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address.');
    if (!state.cart.length) throw new Error('Add at least one product or deal.');
    var delivery = context.fulfilmentType === 'delivery' ? deliverySelection() : null;
    return {
      action: 'place_website_order',
      schema_version: 3,
      publication_id: context.publicationId,
      version_id: context.versionId,
      branch_id: context.branchId,
      fulfillment_type: context.fulfilmentType,
      customer: {
        name: isTestCheckoutPreview() ? ('[WEBSITE QA TEST] ' + name).slice(0, 160) : name,
        phone: phone,
        email: email || null
      },
      notes: isTestCheckoutPreview()
        ? ('[WEBSITE PREVIEW QA TEST — DO NOT PREPARE / DISPATCH / COLLECT PAYMENT] ' +
            $('order-notes').value.trim()).slice(0, 500)
        : ($('order-notes').value.trim() || null),
      delivery: delivery,
      items: state.cart.map(function (row) {
        var item = clone(row.payload);
        item.quantity = row.quantity;
        return item;
      })
    };
  }

  function setBusy(value) {
    state.busy = value === true;
    var locked = state.busy || state.checkoutUncertain;
    $('place-order').disabled = !orderWritesAllowed() || locked ||
      state.cart.length === 0 || !currentContext();
    $('retry-order').disabled = !state.checkoutUncertain || state.busy;
    ['customer-name','customer-phone','customer-email','delivery-area-search','delivery-area','delivery-address',
      'other-locality','not-listed-confirm','order-notes'].forEach(function (id) {
      if ($(id)) $(id).disabled = locked;
    });
    syncFulfilmentControls();
  }

  async function submitOrder(retry) {
    if (!orderWritesAllowed()) {
      status('Preview mode: the menu is available for review, but order submission is disabled.', 'error');
      return;
    }
    if (state.busy) return;
    if (retry && (!state.checkoutUncertain || !state.checkoutBody || !state.checkoutRequestId)) {
      status('There is no pending order request to retry.', 'error');
      return;
    }
    if (!retry && state.checkoutUncertain) {
      status('Your previous order response is uncertain. Retry the same request before making changes.', 'error');
      return;
    }

    if (!state.checkoutBody) {
      try {
        var body = buildRequestBody();
        state.checkoutRequestId = state.checkoutRequestId || readPendingRequestId();
        if (!validRequestId(state.checkoutRequestId)) {
          if (!root.crypto || typeof root.crypto.randomUUID !== 'function') {
            throw new Error('This browser cannot create a secure order request ID. No order has been submitted.');
          }
          state.checkoutRequestId = root.crypto.randomUUID();
        }
        body.action = 'place_website_order';
        body.request_id = state.checkoutRequestId;
        if (!savePendingRequestId(state.checkoutRequestId)) {
          throw new Error('This browser cannot preserve safe order retry protection. Enable session storage and try again. No order has been submitted.');
        }
        state.checkoutBody = body;
      } catch (error) {
        status(error.message || 'Please check your order details and try again.', 'error');
        return;
      }
    }

    state.checkoutUncertain = true;
    setBusy(true);
    checkoutMotion('is-ordering');
    $('place-order').hidden = true;
    $('retry-order').hidden = false;
    status('Placing your order securely. Prices, availability and delivery fees are being checked by Flame Chick…');
    try {
      var result = await orderApi('POST', '', state.checkoutBody);
      if (!result.order_id || !result.order_number) {
        throw new Error('The server did not return a confirmed order reference.');
      }
      state.checkoutUncertain = false;
      clearPendingRequestId();
      state.checkoutBody = null;
      state.checkoutRequestId = null;
      state.cart = [];
      renderCart();
      $('retry-order').hidden = true;
      $('place-order').hidden = true;
      $('order-success').hidden = false;
      $('order-success').classList.add('is-confirmed');
      checkoutMotion('is-confirmed');
      $('success-order-number').textContent = result.order_number;
      var totalText = Number.isFinite(Number(result.total))
        ? 'Order total: ' + money(result.total) + '. ' : '';
      $('success-order-message').textContent = totalText + 'Your order is with Flame Chick POS. Payment is due ' +
        (result.fulfillment_type === 'delivery' ? 'in cash on delivery.' : 'when you collect your takeaway.');
      status('Order confirmed and sent to Flame Chick POS.', 'success');
      $('order-success').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      checkoutMotion('has-error');
      var uncertain = !error.status || error.status >= 500;
      state.checkoutUncertain = uncertain;
      if (uncertain) {
        status('We could not confirm the response. Your request ID is preserved; retry the same order without changing it.', 'error');
        $('retry-order').hidden = false;
        $('retry-order').disabled = false;
      } else {
        clearPendingRequestId();
        state.checkoutBody = null;
        state.checkoutRequestId = null;
        state.checkoutUncertain = false;
        $('retry-order').hidden = true;
        $('place-order').hidden = false;
        status(error.message + (error.retryAfter ? ' Try again in ' + error.retryAfter + ' seconds.' : ''), 'error');
      }
    } finally {
      setBusy(false);
      clearCheckoutMotionLater();
      if (state.checkoutUncertain) {
        $('retry-order').hidden = false;
        $('retry-order').disabled = false;
      } else {
        $('place-order').hidden = $('order-success').hidden === false;
      }
    }
  }

  function bindEvents() {

    $('product-dialog').addEventListener('close', syncCatalogDialogState);
    $('deal-dialog').addEventListener('close', syncCatalogDialogState);
    $('close-product-dialog').addEventListener('click', function () { $('product-dialog').close(); });
    $('close-deal-dialog').addEventListener('click', function () { $('deal-dialog').close(); });
    $('place-order').addEventListener('click', function () { submitOrder(false); });
    $('retry-order').addEventListener('click', function () { submitOrder(true); });
    $('headCart').addEventListener('click', openCartDrawer);
    $('fc-v3-cartbar-open').addEventListener('click', openCartDrawer);
    $('close-fc-v3-cart').addEventListener('click', closeCartDrawer);
    $('fc-v3-cart-scrim').addEventListener('click', closeCartDrawer);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && $('fc-v3-cart-drawer').classList.contains('on')) closeCartDrawer();
    });
    $('fulfilment-delivery').addEventListener('change', function () { changeFulfilment('delivery'); });
    $('fulfilment-pickup').addEventListener('change', function () { changeFulfilment('pickup'); });
    $('delivery-area').addEventListener('change', handleDeliveryAreaChange);
    $('delivery-area-search').addEventListener('focus', function () {
      renderDeliveryAreaResults($('delivery-area-search').value);
    });
    $('delivery-area-search').addEventListener('input', function () {
      var selected = $('delivery-area').value;
      if (selected) {
        $('delivery-area').value = '';
        handleDeliveryAreaChange();
      }
      renderDeliveryAreaResults($('delivery-area-search').value);
    });
    $('delivery-area-search').addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        $('delivery-area-results').hidden = true;
        $('delivery-area-search').setAttribute('aria-expanded', 'false');
      } else if (event.key === 'ArrowDown') {
        var first = $('delivery-area-results').querySelector('button:not(:disabled)');
        if (first) { event.preventDefault(); first.focus(); }
      }
    });
    document.addEventListener('click', function (event) {
      var picker = $('delivery-area-search').closest('.fc-delivery-area-picker');
      if (picker && !picker.contains(event.target)) {
        $('delivery-area-results').hidden = true;
        $('delivery-area-search').setAttribute('aria-expanded', 'false');
      }
    });
    [
      'customer-name','customer-phone','customer-email','delivery-address','delivery-area-search',
      'other-locality','not-listed-confirm','order-notes'
    ].forEach(function (id) {
      $(id).addEventListener('input', invalidateCheckout);
      $(id).addEventListener('change', invalidateCheckout);
    });
    $('continue-ordering').addEventListener('click', function () {
      $('order-success').hidden = true;
      $('customer-name').value = ''; $('customer-phone').value = '';
      $('customer-email').value = ''; $('order-notes').value = '';
      $('delivery-address').value = ''; $('delivery-area-search').value = ''; $('delivery-area').value = ''; $('delivery-area-results').hidden = true;
      $('delivery-area').value = ''; $('other-locality').value = '';
      $('not-listed-confirm').checked = false;
      $('place-order').hidden = false; $('place-order').disabled = true;
      $('retry-order').hidden = true;
      state.checkoutBody = null; state.checkoutRequestId = null; state.checkoutUncertain = false;
      clearPendingRequestId();
      status('Your cart is empty. Choose more items when you are ready.');
      closeCartDrawer();
      renderCatalog();
      renderCart();
    });
  }

  function changeFulfilment(type) {
    if (!state.branchSelection || state.busy || state.checkoutUncertain || !canEdit()) return;
    var before = state.branchSelection.getState();
    if (before.fulfilmentType === type) return;
    var changed = state.branchSelection.selectFulfilment(type);
    if (!changed || changed.ok !== true) {
      status(changed?.message || 'That order type is not available.', 'error');
      syncFulfilmentControls();
      return;
    }
    resetCheckout('Order type changed. Review your cart and place your order when ready.');
    renderCatalog();
    renderCart();
  }

  async function start() {
    pageStatus('Loading and verifying published menu…', 'loading');
    status('Checking the published menu and current branch settings…');
    try {
      var results = await Promise.all([
        root.FlameChickCatalogV3Client.load({
          config: root.FLAME_CHICK_CONFIG,
          contract: root.FlameChickCatalogV3,
          fetchImpl: window.fetch.bind(window)
        }),
        orderApi('GET', 'view=website_context')
      ]);
      state.checkoutRequestId = readPendingRequestId();
      var catalog = results[0], contextEnvelope = results[1];
      if (!catalog || catalog.state !== 'ready') {
        throw new Error(catalog?.error?.message || 'The currently published menu is unavailable.');
      }
      if (!contextEnvelope.data || contextEnvelope.data.publicationId !== catalog.snapshot.publicationId ||
          contextEnvelope.data.versionId !== catalog.versionId) {
        throw new Error('The current menu and branch ordering context do not match. Reload the page.');
      }
      state.websiteContext = contextEnvelope.data;
      state.databaseNow = catalog.databaseNow;
      state.snapshot = overlayCurrentBranches(catalog.snapshot, contextEnvelope.data);
      var selection = root.FlameChickBranchFulfilment.createBranchFulfilmentSelection(
        state.snapshot, state.databaseNow, root.FlameChickCatalogV3
      );
      if (!selection || selection.ok !== true) throw new Error(selection?.message || 'Ordering context could not be initialized.');
      state.branchSelection = selection;
      var availableTypes = selection.getState().availableFulfilmentTypes;
      var initialType = availableTypes.indexOf('delivery') >= 0 ? 'delivery' :
        (availableTypes.indexOf('pickup') >= 0 ? 'pickup' : null);
      if (!initialType || selection.selectFulfilment(initialType).ok !== true) {
        throw new Error('Neither Delivery nor Takeaway is currently enabled for the single Flame Chick branch.');
      }
      state.loaded = true;
      if ($('publication-meta')) $('publication-meta').hidden = true;
      var previewReadOnly = applyPreviewReadOnlyMode();
      pageStatus(isTestCheckoutPreview()
        ? 'Published menu verified · controlled QA checkout enabled.'
        : (previewReadOnly ? 'Published menu verified · Preview only · checkout disabled.' : 'Published menu verified.'), 'ready');
      renderCatalog();
      renderCart();
      syncFulfilmentControls();
    } catch (error) {
      pageStatus(error.message || 'Online ordering is unavailable. No order has been submitted.', 'error');
      status(error.message || 'Could not load the published menu.', 'error');
    }
  }

  bindEvents();
  renderCart();
  start();
})(window);
