/* Flame Chick Website catalog V3 view model and safe DOM renderer.
 *
 * This module accepts only a fully validated V3 publication. It never reads
 * legacy menu arrays, resolves products by display name, or treats client
 * prices as checkout authority. All database text is inserted with textContent.
 */
(function (root) {
  'use strict';

  function fail(code, message) {
    return { ok: false, code: code, message: message };
  }

  function sortRows(rows, key) {
    return rows.slice().sort(function (a, b) {
      var delta = a[key] - b[key];
      return delta || String(a.productId || a.variantId || a.categoryId || a.modifierGroupId || a.modifierId || '')
        .localeCompare(String(b.productId || b.variantId || b.categoryId || b.modifierGroupId || b.modifierId || ''));
    });
  }

  function buildMenuViewModel(snapshot, options, contract) {
    options = options || {};
    contract = contract || (root && root.FlameChickCatalogV3);
    if (!contract || typeof contract.validateSnapshot !== 'function') {
      return fail('CONTRACT_UNAVAILABLE', 'The V3 catalog validator is unavailable.');
    }
    var checked = contract.validateSnapshot(snapshot);
    if (!checked || checked.ok !== true) {
      return fail((checked && checked.code) || 'SNAPSHOT_INVALID', 'The published catalog failed validation.');
    }

    var branches = snapshot.branches;
    var branchId = options.branchId || (branches.length === 1 ? branches[0].branchId : null);
    if (!branchId || !branches.some(function (b) { return b.branchId === branchId; })) {
      return fail('BRANCH_SELECTION_REQUIRED', 'Select a valid branch before viewing branch availability.');
    }
    var fulfilmentType = options.fulfilmentType || null;
    if (fulfilmentType !== null && fulfilmentType !== 'delivery' && fulfilmentType !== 'pickup') {
      return fail('FULFILMENT_INVALID', 'Choose delivery or pickup.');
    }

    // Browsing without a selected fulfilment method is always read-only.
    var orderingEnabled = fulfilmentType !== null &&
      contract.isBranchOrderingEnabled(snapshot, branchId, fulfilmentType);
    var categories = snapshot.categories.filter(function (c) {
      return c.categoryKind === 'menu';
    }).sort(function (a, b) {
      return a.sortOrder - b.sortOrder || a.categoryId.localeCompare(b.categoryId);
    });

    var productsByCategory = new Map();
    categories.forEach(function (category) {
      productsByCategory.set(category.categoryId, []);
    });

    snapshot.products.forEach(function (product) {
      if (!productsByCategory.has(product.categoryId) ||
          !contract.resolveProductAvailability(snapshot, branchId, product.productId)) return;

      var variants = snapshot.productVariants.filter(function (variant) {
        return variant.productId === product.productId &&
          variant.standaloneSellable === true &&
          contract.resolveVariantAvailability(snapshot, branchId, product.productId, variant.variantId);
      }).sort(function (a, b) {
        return a.sortOrder - b.sortOrder || a.variantId.localeCompare(b.variantId);
      });
      if (!variants.length) return;

      var assignments = snapshot.modifierGroupAssignments.filter(function (a) {
        return a.productId === product.productId;
      }).sort(function (a, b) {
        return a.sortOrder - b.sortOrder || a.assignmentId.localeCompare(b.assignmentId);
      });
      var modifierGroups = assignments.map(function (assignment) {
        var group = snapshot.modifierGroups.find(function (g) {
          return g.modifierGroupId === assignment.modifierGroupId;
        });
        if (!group) return null;
        var modifiers = snapshot.modifiers.filter(function (m) {
          return m.modifierGroupId === group.modifierGroupId;
        }).sort(function (a, b) {
          return a.sortOrder - b.sortOrder || a.modifierId.localeCompare(b.modifierId);
        }).map(function (modifier) {
          var prices = snapshot.modifierPriceRules.filter(function (rule) {
            return rule.modifierId === modifier.modifierId &&
              rule.productId === product.productId;
          });
          return {
            id: modifier.modifierId,
            name: modifier.nameEn,
            nameUr: modifier.nameUr,
            priceMode: modifier.priceMode,
            fixedPriceMinor: modifier.fixedPrice === null ? null : contract.minorUnits(modifier.fixedPrice),
            pricesByVariantId: prices.reduce(function (map, rule) {
              map[rule.productVariantId] = contract.minorUnits(rule.price);
              return map;
            }, Object.create(null))
          };
        });
        return {
          id: group.modifierGroupId,
          name: group.nameEn,
          nameUr: group.nameUr,
          selectionMode: group.selectionMode,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          standaloneOnly: group.standaloneOnly,
          modifiers: modifiers
        };
      }).filter(Boolean);

      var productVm = {
        id: product.productId,
        categoryId: product.categoryId,
        subcategoryId: product.subcategoryId,
        name: product.nameEn,
        nameUr: product.nameUr,
        description: product.descriptionEn,
        descriptionUr: product.descriptionUr,
        featured: product.featured,
        imagePath: product.imagePublished ? product.imageCurrentPath : null,
        variants: variants.map(function (variant) {
          return {
            id: variant.variantId,
            key: variant.sizeKey,
            label: variant.sizeLabel,
            kind: variant.variantKind,
            priceMinor: contract.minorUnits(variant.price),
            standaloneSellable: variant.standaloneSellable,
            packQuantity: variant.packQuantity,
            packUnit: variant.packUnit
          };
        }),
        modifierGroups: modifierGroups
      };
      productsByCategory.get(product.categoryId).push(productVm);
    });

    var viewCategories = categories.map(function (category) {
      var products = productsByCategory.get(category.categoryId);
      products.sort(function (a, b) {
        var pa = snapshot.products.find(function (p) { return p.productId === a.id; });
        var pb = snapshot.products.find(function (p) { return p.productId === b.id; });
        return pa.sortOrder - pb.sortOrder || a.id.localeCompare(b.id);
      });
      return {
        id: category.categoryId,
        name: category.nameEn,
        nameUr: category.nameUr,
        sortOrder: category.sortOrder,
        products: products
      };
    }).filter(function (category) { return category.products.length > 0; });

    return {
      ok: true,
      schemaVersion: 3,
      publicationId: snapshot.publicationId,
      versionId: snapshot.versionId,
      branchId: branchId,
      fulfilmentType: fulfilmentType,
      orderingEnabled: orderingEnabled,
      currencyCode: snapshot.settings.currency_code,
      restaurantName: snapshot.settings.restaurant_name,
      categories: viewCategories
    };
  }

  function createElement(doc, tag, className, text) {
    var element = doc.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function formatMoney(minor, currency, locale) {
    return new Intl.NumberFormat(locale || 'en-PK', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(minor / 100);
  }

  function renderMenu(options) {
    options = options || {};
    var doc = options.document || (root && root.document);
    if (!doc || !options.root || !options.categoriesRoot) {
      return fail('DOM_TARGET_REQUIRED', 'Menu root elements and a document are required.');
    }
    var model = buildMenuViewModel(options.snapshot, {
      branchId: options.branchId,
      fulfilmentType: options.fulfilmentType
    }, options.contract);
    if (!model.ok) return model;

    var menuFragment = doc.createDocumentFragment();
    var navFragment = doc.createDocumentFragment();

    model.categories.forEach(function (category) {
      var section = createElement(doc, 'section', 'fc-menu-category');
      section.id = 'fc-category-' + category.id;
      var heading = createElement(doc, 'h3', 'fc-menu-category-title', category.name);
      section.appendChild(heading);

      var navButton = createElement(doc, 'button', 'fc-menu-category-link', category.name);
      navButton.type = 'button';
      navButton.addEventListener('click', function () {
        if (typeof section.scrollIntoView === 'function') {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      navFragment.appendChild(navButton);

      var grid = createElement(doc, 'div', 'fc-menu-product-grid');
      category.products.forEach(function (product) {
        var card = createElement(doc, 'article', 'fc-menu-product');
        card.setAttribute('data-product-id', product.id);
        card.appendChild(createElement(doc, 'h4', 'fc-menu-product-name', product.name));
        if (product.description) {
          card.appendChild(createElement(doc, 'p', 'fc-menu-product-description', product.description));
        }

        var variantLabel = createElement(doc, 'label', 'fc-menu-variant-label', 'Choose option');
        var select = createElement(doc, 'select', 'fc-menu-variant-select');
        select.name = 'variant-' + product.id;
        select.setAttribute('aria-label', 'Choose an option for ' + product.name);
        product.variants.forEach(function (variant) {
          var option = createElement(doc, 'option', '', variant.label + ' — ' +
            formatMoney(variant.priceMinor, model.currencyCode, options.locale));
          option.value = variant.id;
          select.appendChild(option);
        });
        if (product.variants.length > 1) {
          select.selectedIndex = -1;
          select.required = true;
        }
        variantLabel.appendChild(select);
        card.appendChild(variantLabel);

        if (product.modifierGroups.length) {
          card.appendChild(createElement(doc, 'p', 'fc-menu-customization-pending',
            'Customization options are being prepared.'));
        }
        if (!model.orderingEnabled) {
          card.appendChild(createElement(doc, 'p', 'fc-menu-ordering-disabled',
            'Online ordering is not available for this fulfilment method at this branch.'));
        } else if (typeof options.onAdd === 'function' && product.modifierGroups.length === 0) {
          var add = createElement(doc, 'button', 'fc-menu-add', 'Add');
          add.type = 'button';
          add.disabled = product.variants.length > 1;
          select.addEventListener('change', function () { add.disabled = !select.value; });
          add.addEventListener('click', function () {
            if (!select.value) return;
            options.onAdd({
              productId: product.id,
              productVariantId: select.value,
              publicationId: model.publicationId,
              versionId: model.versionId
            });
          });
          card.appendChild(add);
        }
        grid.appendChild(card);
      });
      section.appendChild(grid);
      menuFragment.appendChild(section);
    });

    options.root.replaceChildren(menuFragment);
    options.categoriesRoot.replaceChildren(navFragment);
    return { ok: true, model: model };
  }

  var api = {
    buildMenuViewModel: buildMenuViewModel,
    renderMenu: renderMenu,
    formatMoney: formatMoney
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlameChickCatalogV3View = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
