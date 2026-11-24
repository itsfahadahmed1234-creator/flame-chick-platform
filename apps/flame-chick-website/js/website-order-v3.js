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
    quote: null, quoteBody: null, quoteToken: null, checkoutRequestId: null,
    checkoutBody: null, checkoutUncertain: false,
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

  function pageStatus(message, kind) {
    $('connection-message').textContent = message;
    $('connection-pill').textContent = kind === 'ready' ? 'Ready' : kind === 'loading' ? 'Loading' : 'Unavailable';
    $('connection-pill').className = 'status-pill status-' + (kind === 'ready' ? 'ready' : kind === 'loading' ? 'loading' : 'error');
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
    var current = new Map(context.branches.map(function (branch) { return [branch.id, branch]; }));
    var branches = snapshot.branches.map(function (branch) {
      var live = current.get(branch.branchId);
      return Object.assign({}, branch, {
        websiteOrderingEnabled: !!live,
        websiteDeliveryEnabled: !!live && live.websiteDeliveryEnabled === true,
        websitePickupEnabled: !!live && live.websitePickupEnabled === true
      });
    });
    return Object.assign({}, snapshot, { branches: branches });
  }

  function currentContext() {
    if (!state.branchSelection) return null;
    var context = state.branchSelection.getContext();
    return context && context.ok ? context : null;
  }

  function liveBranch() {
    var selected = state.branchSelection && state.branchSelection.getState();
    if (!selected || !selected.selectedBranchId) return null;
    return state.websiteContext.branches.find(function (branch) {
      return branch.id === selected.selectedBranchId;
    }) || null;
  }

  function resetQuote(message) {
    state.quote = null;
    state.quoteBody = null;
    state.quoteToken = null;
    if (!state.checkoutUncertain) {
      state.checkoutRequestId = null;
      state.checkoutBody = null;
    }
    $('cart-summary').hidden = true;
    $('place-order').hidden = true;
    $('retry-order').hidden = true;
    $('request-quote').hidden = false;
    $('request-quote').disabled = state.cart.length === 0 || !currentContext() || state.busy || state.checkoutUncertain;
    if (message) status(message);
  }

  function canEdit() { return !state.busy && !state.checkoutUncertain && $('order-success').hidden; }
  function invalidateQuote() {
    if (state.checkoutUncertain || state.busy) return;
    resetQuote('Your changes need a fresh server quote.');
    renderCart();
  }

  function clearCart(reason) {
    if (state.cart.length && reason) status(reason);
    state.cart = [];
    invalidateQuote();
    renderCart();
  }

  function renderCart() {
    var list = $('cart-lines');
    list.replaceChildren();
    var itemCount = state.cart.reduce(function (sum, row) { return sum + row.quantity; }, 0);
    $('cart-count').textContent = '(' + itemCount + ')';
    if ($('badge')) $('badge').textContent = String(itemCount);
    $('cart-empty').hidden = state.cart.length > 0;
    $('request-quote').disabled = state.cart.length === 0 || !currentContext() || state.busy || state.checkoutUncertain;

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
        invalidateQuote();
      });
      var quantity = document.createElement('input');
      quantity.type = 'number'; quantity.min = '1'; quantity.max = '99'; quantity.value = String(row.quantity);
      quantity.setAttribute('aria-label', 'Quantity for ' + row.label);
      quantity.disabled = !canEdit();
      quantity.addEventListener('change', function () {
        if (!canEdit()) return;
        var value = Number(quantity.value);
        if (!Number.isSafeInteger(value) || value < 1 || value > 99) {
          quantity.value = String(row.quantity); return;
        }
        row.quantity = value; invalidateQuote();
      });
      var increment = document.createElement('button');
      increment.type = 'button'; increment.textContent = '+'; increment.disabled = !canEdit() || row.quantity >= 99;
      increment.addEventListener('click', function () {
        if (!canEdit() || row.quantity >= 99) return;
        row.quantity += 1; invalidateQuote();
      });
      var remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = 'Remove'; remove.disabled = !canEdit();
      remove.addEventListener('click', function () {
        if (!canEdit()) return;
        state.cart.splice(index, 1); invalidateQuote();
      });
      controls.append(decrement, quantity, increment, remove);
      article.append(name, meta, controls);
      list.appendChild(article);
    });
  }

  function renderCatalog() {
    var context = currentContext();
    if (!context || !state.snapshot) {
      $('catalog-section').hidden = true;
      $('cats').hidden = true;
      $('deals-section').hidden = true;
      $('details-section').hidden = true;
      $('catalog-context-label').textContent = 'Select a supported branch and order type to see the menu.';
      return;
    }
    $('catalog-section').hidden = false;
    $('cats').hidden = false;
    $('deals-section').hidden = false;
    $('details-section').hidden = false;
    var live = liveBranch();
    $('catalog-context-label').textContent = (live ? live.name : '') + ' · ' +
      (context.fulfilmentType === 'delivery' ? 'Delivery' : 'Pickup');
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
  }

  function productArtworkSource(product, categoryName) {
    if (product && typeof product.imagePath === 'string' && product.imagePath) {
      if (/^https:\/\//i.test(product.imagePath)) return product.imagePath;
      var base = String((root.FLAME_CHICK_CONFIG || {}).imagesBaseUrl || '').replace(/\/$/, '');
      if (base) return base + '/' + product.imagePath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    }
    var name = String(product && product.name || '').toLowerCase();
    var category = String(categoryName || '').toLowerCase();
    var files = [
      [/fresh mint/, 'fresh-mint.png'],
      [/strawberry blaze/, 'strawberry-blaze.png'],
      [/peach kick/, 'peach-kick.png'],
      [/berry burst/, 'berry-burst.png'],
      [/blue flame/, 'blue-flame.png'],
      [/fire wings|injected wings|wings/, 'fire-wings.png'],
      [/wrap/, 'flame-chick-wrap.png'],
      [/broast|simple injected|cheetos butter/, 'chicken-broast.webp'],
      [/og crunch/, 'flame-chick-burger.png'],
      [/injector|nashville fire|smash|marrow|burger|chick special/, 'flame-chick-burger-2.png'],
      [/classic chick/, 'flame-chick.png']
    ];
    for (var i = 0; i < files.length; i++) {
      if (files[i][0].test(name) || (i === 7 && category.indexOf('broast') >= 0)) {
        return 'media/products/' + files[i][1];
      }
    }
    return '';
  }

  function appendProductArtwork(target, product, categoryName) {
    var source = productArtworkSource(product, categoryName);
    if (source) {
      var image = document.createElement('img');
      image.src = source;
      image.alt = product.name;
      image.width = 320; image.height = 320; image.loading = 'lazy';
      target.appendChild(image);
      return;
    }
    var name = String(product.name || '').toLowerCase();
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 96 96');
    svg.setAttribute('aria-hidden', 'true');
    var art = '';
    if (/nugget/.test(name)) {
      art = '<g fill="#F4B53F" stroke="#C9811C" stroke-width="2"><rect x="12" y="38" width="32" height="27" rx="12" transform="rotate(-14 28 51)"/><rect x="48" y="28" width="32" height="27" rx="12" transform="rotate(12 64 41)"/><rect x="32" y="54" width="34" height="27" rx="12" transform="rotate(-4 49 67)"/></g><g fill="#C9811C" opacity=".55"><circle cx="22" cy="48" r="2"/><circle cx="35" cy="57" r="2"/><circle cx="58" cy="38" r="2"/><circle cx="69" cy="45" r="2"/><circle cx="45" cy="69" r="2"/></g>';
    } else if (/fries/.test(name)) {
      art = '<path d="M19 42h58l-7 43H27z" fill="#B91E27"/><g fill="#F7C34D"><rect x="26" y="16" width="9" height="45" rx="4" transform="rotate(-9 26 16)"/><rect x="40" y="10" width="9" height="48" rx="4"/><rect x="54" y="14" width="9" height="46" rx="4" transform="rotate(7 54 14)"/><rect x="68" y="23" width="8" height="38" rx="4" transform="rotate(12 68 23)"/></g>';
    } else if (/water/.test(name)) {
      art = '<rect x="38" y="8" width="20" height="10" rx="3" fill="#2C8FD6"/><path d="M36 20h24l5 12v50a6 6 0 0 1-6 6H37a6 6 0 0 1-6-6V32z" fill="#DDF3FF" stroke="#fff" stroke-width="2"/><rect x="32" y="46" width="32" height="22" fill="#2C8FD6"/><path d="M40 57h16" stroke="#fff" stroke-width="3" stroke-linecap="round"/>';
    } else if (/drink|juice|cold/.test(name)) {
      art = '<path d="M26 32h44l-6 50H32z" fill="#DB382A"/><rect x="22" y="26" width="52" height="9" rx="4.5" fill="#fff"/><path d="M57 26L65 7" stroke="#7A0A0F" stroke-width="5" stroke-linecap="round"/><g fill="#fff" opacity=".55"><rect x="36" y="41" width="9" height="9" rx="2"/><rect x="51" y="57" width="9" height="9" rx="2"/></g>';
    } else {
      art = '<path d="M16 44C16 26 32 15 48 15s32 11 32 29z" fill="#E8A33D"/><path d="M13 48q8-9 16 0t16 0 16 0 16 0v7H13z" fill="#69C23A"/><rect x="14" y="55" width="68" height="12" rx="6" fill="#D98A1C"/><path d="M16 69h64v5a9 9 0 0 1-9 9H25a9 9 0 0 1-9-9z" fill="#E0902F"/>';
    }
    svg.innerHTML = art;
    target.appendChild(svg);
  }

  function cardPrice(minor) {
    return 'Rs ' + (Number(minor || 0) / 100).toLocaleString('en-PK', {
      minimumFractionDigits: 0, maximumFractionDigits: 2
    });
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

        var foot = document.createElement('div'); foot.className = 'foot';
        var price = document.createElement('span'); price.className = 'price';
        var firstVariant = product.variants[0];
        price.textContent = firstVariant ? cardPrice(firstVariant.priceMinor) : 'Price unavailable';
        var controls = document.createElement('div'); controls.className = 'ctl fc-home-product-controls';
        var selector = null;
        if (product.variants.length > 1) {
          selector = document.createElement('select'); selector.className = 'fc-home-variant-select';
          selector.setAttribute('aria-label', 'Choose size or option for ' + product.name);
          var placeholder = document.createElement('option');
          placeholder.value = ''; placeholder.textContent = 'Choose size / option';
          selector.appendChild(placeholder);
          product.variants.forEach(function (variant) {
            var option = document.createElement('option');
            option.value = variant.id;
            option.textContent = variant.label + ' · ' + cardPrice(variant.priceMinor);
            selector.appendChild(option);
          });
          selector.selectedIndex = 0;
          selector.addEventListener('change', function () {
            var selected = product.variants.find(function (variant) { return variant.id === selector.value; });
            if (selected) price.textContent = cardPrice(selected.priceMinor);
            else price.textContent = 'Choose an option';
            add.disabled = !selected || !canEdit();
          });
          controls.appendChild(selector);
        } else if (firstVariant) {
          var variantLabel = document.createElement('span');
          variantLabel.className = 'fc-home-single-variant';
          variantLabel.textContent = firstVariant.label;
          controls.appendChild(variantLabel);
        }

        var add = document.createElement('button');
        add.type = 'button'; add.className = 'add';
        add.textContent = product.modifierGroups.length ? 'Customize & add' : 'Add';
        add.disabled = !firstVariant || (product.variants.length > 1) || !canEdit();
        add.addEventListener('click', function () {
          if (!canEdit()) return;
          var variantId = selector ? selector.value : (firstVariant ? firstVariant.id : '');
          if (variantId) openProductCustomizer(product, variantId);
        });
        controls.appendChild(add);
        foot.append(price, controls);
        body.appendChild(foot);
        card.append(art, body);
        grid.appendChild(card);
      });
      section.appendChild(grid);
      rootNode.appendChild(section);
    });
  }
  function openProductCustomizer(product, variantId) {
    var variant = product.variants.find(function (row) { return row.id === variantId; });
    if (!variant || !canEdit()) return;
    var groups = root.FlameChickCatalogV3DealView.buildProductModifierGroups(
      state.snapshot, product.id, variantId, root.FlameChickCatalogV3
    );
    var selections = Object.create(null);
    groups.forEach(function (group) { selections[group.id] = []; });
    var body = $('product-dialog-content');
    body.replaceChildren();
    var heading = document.createElement('h2'); heading.textContent = product.name + ' · ' + variant.label;
    var basePrice = document.createElement('p'); basePrice.className = 'order-hint';
    basePrice.textContent = 'Published base price: ' + money(variant.priceMinor / 100) + '. Final item pricing is verified at checkout.';
    body.append(heading, basePrice);

    groups.forEach(function (group) {
      var fieldset = document.createElement('fieldset'); fieldset.className = 'order-modifier-group';
      var legend = document.createElement('legend');
      legend.textContent = group.name + ' (' + group.minSelect + '–' + group.maxSelect + ')';
      fieldset.appendChild(legend);
      if (group.branchSatisfiable === false) {
        var unavailable = document.createElement('p'); unavailable.textContent = 'This option is currently unavailable.';
        fieldset.appendChild(unavailable);
      }
      group.modifiers.forEach(function (modifier) {
        var label = document.createElement('label'); label.className = 'order-modifier-option';
        var input = document.createElement('input');
        input.type = group.selectionMode === 'SINGLE' ? 'radio' : 'checkbox';
        input.name = 'product-modifier-' + group.id;
        input.value = modifier.id;
        input.addEventListener('change', function () {
          if (input.type === 'radio') selections[group.id] = input.checked ? [modifier.id] : [];
          else if (input.checked) selections[group.id].push(modifier.id);
          else selections[group.id] = selections[group.id].filter(function (id) { return id !== modifier.id; });
        });
        var textNode = document.createElement('span');
        textNode.textContent = modifier.name + ' · ' + money(modifier.priceMinor / 100);
        label.append(input, textNode); fieldset.appendChild(label);
      });
      body.appendChild(fieldset);
    });

    var quantityField = document.createElement('div'); quantityField.className = 'order-field';
    var quantityLabel = document.createElement('label'); quantityLabel.textContent = 'Quantity';
    var quantity = document.createElement('input'); quantity.type = 'number'; quantity.min = '1'; quantity.max = '99'; quantity.value = '1';
    quantityField.append(quantityLabel, quantity); body.appendChild(quantityField);
    var add = document.createElement('button'); add.type = 'button'; add.className = 'order-primary'; add.textContent = 'Add to cart';
    add.addEventListener('click', function () {
      var validation = root.FlameChickCatalogV3DealView.validateModifierSelections(groups, selections);
      if (!validation || validation.ok !== true) { status(validation?.message || 'Check the modifier selections.', 'error'); return; }
      var qty = Number(quantity.value);
      if (!Number.isSafeInteger(qty) || qty < 1 || qty > 99) { status('Choose a quantity from 1 to 99.', 'error'); return; }
      state.cart.push({
        kind: 'product', label: product.name + ' · ' + variant.label,
        quantity: qty,
        payload: {
          kind: 'product', productId: product.id, productVariantId: variantId,
          quantity: qty, modifiers: validation.selections
        }
      });
      $('product-dialog').close();
      invalidateQuote(); status('Product added to your cart.');
    });
    body.appendChild(add);
    if (typeof $('product-dialog').showModal === 'function') $('product-dialog').showModal();
    else $('product-dialog').setAttribute('open', '');
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
        button.className = 'add'; button.textContent = deal.available ? 'Configure deal' : 'Unavailable';
        button.disabled = !deal.available || !canEdit();
        button.addEventListener('click', function () { if (canEdit()) openDealConfigurator(deal); });
        foot.append(label, button);
        body.append(name, info, foot);
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
    $('deal-config-section').hidden = false;
    $('deal-configurator').replaceChildren();
    configurator.render($('deal-configurator'), {
      onComplete: function (payload) {
        // The V3 configurator returns the selection object itself on success;
        // only validation failures carry ok:false.
        if (!payload || payload.ok === false) {
          if(payload && payload.message) status(payload.message,'error');
          return;
        }
        var item = payload;
        item.kind = 'deal';
        item.quantity = 1;
        state.cart.push({
          kind: 'deal',
          label: deal.title + (payload.dealVariantLabel ? ' · ' + payload.dealVariantLabel : ''),
          quantity: 1,
          payload: item
        });
        $('deal-config-section').hidden = true;
        invalidateQuote(); status('Deal added to your cart.');
      }
    });
    $('deal-config-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function populateDeliveryAreas(branch) {
    var select = $('delivery-area'); select.replaceChildren();
    var placeholder = document.createElement('option');
    placeholder.value = ''; placeholder.textContent = 'Choose your area'; select.appendChild(placeholder);
    (branch?.deliveryAreas || []).forEach(function (area) {
      var option = document.createElement('option'); option.value = area.id;
      option.textContent = area.name + ' — ' + money(area.deliveryFee); select.appendChild(option);
    });
    var other = document.createElement('option'); other.value = 'not_listed';
    other.textContent = branch && branch.notListedDeliveryFee !== null
      ? 'Not Listed / Other — ' + money(branch.notListedDeliveryFee)
      : 'Not Listed / Other — fee not configured';
    other.disabled = !branch || branch.notListedDeliveryFee === null;
    select.appendChild(other);
    $('not-listed-confirm-row').hidden = true;
    $('other-locality-field').hidden = true;
    $('delivery-address').value = '';
    $('delivery-instructions').value = '';
    $('other-locality').value = '';
    $('not-listed-confirm').checked = false;
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
        address: $('delivery-address').value.trim(),
        instructions: $('delivery-instructions').value.trim() || null
      };
    }
    return {
      selection_type: 'listed_area', area_id: selection,
      address: $('delivery-address').value.trim(),
      instructions: $('delivery-instructions').value.trim() || null
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
      action: 'quote_website_order',
      schema_version: 3,
      publication_id: context.publicationId,
      version_id: context.versionId,
      branch_id: context.branchId,
      fulfillment_type: context.fulfilmentType,
      customer: { name: name, phone: phone, email: email || null },
      notes: $('order-notes').value.trim() || null,
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
    $('request-quote').disabled = locked || state.cart.length === 0 || !currentContext();
    $('place-order').disabled = locked;
    $('retry-order').disabled = state.busy;
    ['customer-name','customer-phone','customer-email','delivery-area','delivery-address',
      'delivery-instructions','other-locality','not-listed-confirm','order-notes'].forEach(function (id) {
      if ($(id)) $(id).disabled = locked;
    });
    document.querySelectorAll('#branch-selector button, #branch-selector select, #branch-selector input').forEach(function (node) {
      node.disabled = locked;
    });
  }

  async function requestQuote() {
    if (state.busy || state.checkoutUncertain) return;
    try {
      var body = buildRequestBody();
      setBusy(true); status('Checking the current menu, availability and delivery fee…');
      var result = await orderApi('POST', '', body);
      if (!result.quote || result.quote.publicationId !== state.snapshot.publicationId) {
        throw new Error('The published menu changed. Refresh and review your cart before ordering.');
      }
      if (typeof result.quote_token !== 'string' || !result.quote_token ||
          typeof result.quote_expires_at !== 'string' || !Number.isFinite(Date.parse(result.quote_expires_at))) {
        throw new Error('The server did not provide a secure, time-limited quote. Please try again.');
      }
      state.quote = result.quote;
      state.quoteToken = result.quote_token;
      state.quoteBody = body;
      // Only a random request UUID is stored, never customer or cart details.
      state.checkoutRequestId = state.checkoutRequestId || readPendingRequestId();
      state.checkoutBody = null;
      $('cart-summary').hidden = false;
      $('cart-total').textContent = money(result.quote.total);
      $('cart-quote-detail').textContent = 'Items ' + money(result.quote.subtotal) +
        (result.quote.fulfillmentType === 'delivery' ? ' · Delivery ' + money(result.quote.deliveryFee) : ' · Pickup');
      $('request-quote').hidden = true;
      $('place-order').hidden = false;
      $('place-order').disabled = false;
      $('retry-order').hidden = true;
      status('Your server-verified total is ready. Review your details and place the order.', 'success');
    } catch (error) {
      state.quote = null; state.quoteBody = null; state.quoteToken = null;
      status(error.message || 'Could not verify your order total.', 'error');
      $('cart-summary').hidden = true;
      $('request-quote').hidden = false;
    } finally { setBusy(false); }
  }

  async function submitOrder(retry) {
    if (state.busy) return;
    if (!state.quoteBody || !state.quoteToken) { status('Get a fresh secure server quote before placing the order.', 'error'); return; }
    if (!retry && state.checkoutUncertain) { status('Retry the same checkout request to verify whether it was received.', 'error'); return; }
    if (!state.checkoutRequestId) {
      if (!root.crypto || typeof root.crypto.randomUUID !== 'function') {
        status('This browser cannot create a secure checkout request ID. No order has been submitted.', 'error');
        return;
      }
      state.checkoutRequestId = root.crypto.randomUUID();
    }
    if (!savePendingRequestId(state.checkoutRequestId)) {
      status('This browser cannot preserve secure retry protection for this session. Enable session storage and try again. No order has been submitted.', 'error');
      return;
    }
    if (!state.checkoutBody) {
      state.checkoutBody = clone(state.quoteBody);
      state.checkoutBody.action = 'create_website_order';
      state.checkoutBody.request_id = state.checkoutRequestId;
      state.checkoutBody.quote_token = state.quoteToken;
    }
    state.checkoutUncertain = true;
    setBusy(true);
    $('place-order').hidden = true;
    $('retry-order').hidden = false;
    status('Submitting your order securely…');
    try {
      var result = await orderApi('POST', '', state.checkoutBody);
      if (!result.order_id || !result.order_number) throw new Error('The server did not return a confirmed order reference.');
      state.checkoutUncertain = false;
      clearPendingRequestId();
      state.checkoutBody = null;
      state.checkoutRequestId = null;
      state.quote = null;
      state.quoteBody = null;
      state.quoteToken = null;
      state.cart = [];
      renderCart();
      $('cart-summary').hidden = true;
      $('retry-order').hidden = true;
      $('request-quote').hidden = true;
      $('place-order').hidden = true;
      $('order-success').hidden = false;
      $('success-order-number').textContent = result.order_number;
      $('success-order-message').textContent = 'Your order is with Flame Chick POS. Payment is due ' +
        (result.fulfillment_type === 'delivery' ? 'in cash on delivery.' : 'when you collect your pickup.');
      status('Order confirmed.', 'success');
      $('order-success').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      var uncertain = !error.status || error.status >= 500;
      state.checkoutUncertain = uncertain;
      if (uncertain) {
        status('We could not confirm the response. Your request ID is preserved; retry without changing your order.', 'error');
        $('retry-order').hidden = false;
        $('retry-order').disabled = false;
      } else {
        clearPendingRequestId();
        state.checkoutBody = null;
        state.checkoutRequestId = null;
        state.checkoutUncertain = false;
        state.quoteToken = null;
        $('retry-order').hidden = true;
        $('place-order').hidden = false;
        $('place-order').disabled = false;
        status(error.message + (error.retryAfter ? ' Try again in ' + error.retryAfter + ' seconds.' : ''), 'error');
        if (error.status === 409 || error.status === 429) {
          state.quote = null; state.quoteBody = null;
          $('cart-summary').hidden = true;
          $('request-quote').hidden = false;
          $('place-order').hidden = true;
        }
      }
    } finally {
      setBusy(false);
      if (state.checkoutUncertain) {
        $('retry-order').hidden = false;
        $('retry-order').disabled = false;
      }
    }
  }

  function bindEvents() {
    $('reload-catalog').addEventListener('click', function () {
      location.reload();
    });
    $('close-product-dialog').addEventListener('click', function () { $('product-dialog').close(); });
    $('close-deal-config').addEventListener('click', function () { $('deal-config-section').hidden = true; });
    $('request-quote').addEventListener('click', requestQuote);
    $('place-order').addEventListener('click', function () { submitOrder(false); });
    $('retry-order').addEventListener('click', function () { submitOrder(true); });
    $('delivery-area').addEventListener('change', function () {
      var other = $('delivery-area').value === 'not_listed';
      $('other-locality-field').hidden = !other;
      $('not-listed-confirm-row').hidden = !other;
      if (other) $('not-listed-confirm-text').textContent =
        'I understand the Not Listed delivery fee (' + money(liveBranch().notListedDeliveryFee) + ') and want the restaurant to confirm my locality.';
      invalidateQuote();
    });
    [
      'customer-name','customer-phone','customer-email','delivery-address','delivery-instructions',
      'other-locality','not-listed-confirm','order-notes'
    ].forEach(function (id) {
      $(id).addEventListener('input', invalidateQuote);
      $(id).addEventListener('change', invalidateQuote);
    });
    $('continue-ordering').addEventListener('click', function () {
      $('order-success').hidden = true;
      $('customer-name').value = ''; $('customer-phone').value = '';
      $('customer-email').value = ''; $('order-notes').value = '';
      $('delivery-address').value = ''; $('delivery-instructions').value = '';
      $('delivery-area').value = ''; $('other-locality').value = '';
      $('not-listed-confirm').checked = false;
      $('request-quote').hidden = false; $('request-quote').disabled = true;
      status('Your cart is empty. Choose more items when you are ready.');
      renderCatalog();
    });
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
      if (!selection || selection.ok !== true) throw new Error(selection?.message || 'Branch selection could not be initialized.');
      state.branchSelection = selection;
      selection.render($('branch-selector'), { onChange: function () {
        if (state.cart.length) clearCart('Branch or fulfilment changed. Review your cart again.');
        resetQuote();
        renderCatalog();
      }});
      state.loaded = true;
      $('publication-meta').hidden = false;
      $('publication-meta').textContent = 'Published menu #' + state.websiteContext.publicationNumber +
        ' · ' + state.websiteContext.publicationId + ' · verified using current database time.';
      pageStatus('Published menu verified. Choose your branch and order type.', 'ready');
      renderCart();
      if (selection.getState().selectedBranchId && selection.getState().availableFulfilmentTypes.length === 1) {
        selection.selectFulfilment(selection.getState().availableFulfilmentTypes[0]);
        selection.render($('branch-selector'), { onChange: function () { renderCatalog(); } });
        renderCatalog();
      }
    } catch (error) {
      pageStatus(error.message || 'Online ordering is unavailable. No order has been submitted.', 'error');
      status(error.message || 'Could not load the published menu.', 'error');
    }
  }

  bindEvents();
  renderCart();
  start();
})(window);
