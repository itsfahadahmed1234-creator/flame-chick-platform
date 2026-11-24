/* Public, read-only Flame Chick V3 menu page.
 * It renders only the current checksum-verified immutable publication.
 * No cart, quote, checkout, order write or branch ordering flag is enabled here.
 */
(function (root) {
  'use strict';

  var $ = function (id) { return root.document.getElementById(id); };
  var snapshot = null;
  var databaseNow = null;

  function setStatus(message, kind) {
    var node = $('menu-status');
    var pill = $('menu-status-pill');
    if (node) node.textContent = String(message || '');
    if (pill) {
      pill.textContent = kind === 'ready' ? 'Published menu verified' : kind === 'loading' ? 'Loading menu' : 'Menu unavailable';
      pill.className = 'status-pill status-' + (kind === 'ready' ? 'ready' : kind === 'loading' ? 'loading' : 'error');
    }
  }

  function node(tag, className, content) {
    var element = root.document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined && content !== null) element.textContent = String(content);
    return element;
  }

  function money(minor, currency) {
    if (!Number.isSafeInteger(minor) || minor < 0) return 'Price confirmed when ordering opens';
    try {
      return new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: currency || 'PKR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(minor / 100);
    } catch (_) {
      return String(currency || 'PKR') + ' ' + (minor / 100).toFixed(2);
    }
  }

  function renderDeals(branchId) {
    var target = $('deal-catalog');
    target.replaceChildren();
    var result = root.FlameChickCatalogV3DealView.buildDealViewModel(
      snapshot,
      { branchId: branchId, databaseNow: databaseNow },
      root.FlameChickCatalogV3
    );
    if (!result || result.ok !== true) {
      throw new Error(result && result.message ? result.message : 'Published deals could not be validated.');
    }

    var dealCount = 0;
    result.collections.forEach(function (collection) {
      var section = node('section', 'public-deal-collection');
      section.appendChild(node('h3', 'public-deal-collection-title', collection.name));
      collection.deals.forEach(function (deal) {
        dealCount += 1;
        var card = node('article', 'public-deal-card');
        card.appendChild(node('h4', 'public-deal-title', deal.title));
        if (deal.description) card.appendChild(node('p', 'public-deal-description', deal.description));
        if (deal.branchAvailable !== true) {
          card.appendChild(node('p', 'public-deal-note', 'Not currently listed for this branch.'));
        } else if (deal.scheduleAvailable === false) {
          card.appendChild(node('p', 'public-deal-note', 'This offer follows a scheduled availability window.'));
        }

        deal.variants.forEach(function (variant) {
          var variantBox = node('div', 'public-deal-variant');
          var priceLabel = variant.pricingMode === 'BASE_PLUS_SELECTED_ITEMS' ? 'Base price' : 'Published price';
          variantBox.appendChild(node('p', 'public-deal-variant-heading',
            variant.label + ' · ' + priceLabel + ': ' + money(variant.basePriceMinor, result.currencyCode)));
          if (variant.pricingMode === 'BASE_PLUS_SELECTED_ITEMS') {
            variantBox.appendChild(node('p', 'public-deal-note',
              'Selected items may add to the base price. Final pricing is verified by Flame Chick before checkout.'));
          }
          variant.groups.forEach(function (group) {
            var groupBox = node('div', 'public-deal-group');
            groupBox.appendChild(node('strong', 'public-deal-group-title',
              group.name + ' · choose ' + group.minUnits + (group.maxUnits === group.minUnits ? '' : '–' + group.maxUnits)));
            var list = node('ul', 'public-deal-options');
            group.options.forEach(function (option) {
              var label = option.productName + (option.variantLabel ? ' — ' + option.variantLabel : '');
              var price = '';
              if (option.pricingTreatment === 'INCLUDED') price = ' · included';
              else if (option.pricingTreatment === 'SURCHARGE') price = ' · surcharge ' + money(option.surchargeMinor, result.currencyCode);
              else if (option.pricingTreatment === 'STANDALONE') price = ' · item price ' + money(option.standalonePriceMinor, result.currencyCode);
              list.appendChild(node('li', '', label + price));
            });
            groupBox.appendChild(list);
            variantBox.appendChild(groupBox);
          });
          card.appendChild(variantBox);
        });
        section.appendChild(card);
      });
      target.appendChild(section);
    });
    $('deals-empty').hidden = dealCount > 0;
    $('deals-empty').textContent = 'There are no deals in this published menu.';
    $('deal-count').textContent = String(dealCount);
  }

  function renderBranch(branchId) {
    var branch = snapshot.branches.find(function (item) { return item.branchId === branchId; });
    if (!branch) throw new Error('Selected branch is not in the published menu.');
    var rendered = root.FlameChickCatalogV3View.renderMenu({
      snapshot: snapshot,
      branchId: branchId,
      root: $('product-catalog'),
      categoriesRoot: $('product-category-nav'),
      contract: root.FlameChickCatalogV3
    });
    if (!rendered || rendered.ok !== true) {
      throw new Error(rendered && rendered.message ? rendered.message : 'Published products could not be rendered.');
    }
    renderDeals(branchId);
    $('selected-branch-name').textContent = branch.name;
    $('product-count').textContent = String(rendered.model.categories.reduce(function (sum, category) {
      return sum + category.products.length;
    }, 0));
    $('category-count').textContent = String(rendered.model.categories.length);
    $('products-empty').hidden = rendered.model.categories.length > 0;
  }

  async function load() {
    setStatus('Checking the current published menu and its checksum…', 'loading');
    $('menu-content').hidden = true;
    try {
      if (!root.FlameChickCatalogV3 || !root.FlameChickCatalogV3Client ||
          !root.FlameChickCatalogV3View || !root.FlameChickCatalogV3DealView ||
          !root.FLAME_CHICK_CONFIG) {
        throw new Error('The published menu modules are not available. Refresh and try again.');
      }
      var result = await root.FlameChickCatalogV3Client.load();
      if (!result || result.state !== 'ready' || !result.snapshot) {
        throw new Error(result && result.error && result.error.message ?
          result.error.message : 'No published menu is available.');
      }
      snapshot = result.snapshot;
      databaseNow = result.databaseNow;
      if (!Array.isArray(snapshot.branches) || snapshot.branches.length === 0) {
        throw new Error('The published menu has no branch information.');
      }
      var selector = $('branch-select');
      selector.replaceChildren();
      snapshot.branches.forEach(function (branch) {
        var option = node('option', '', branch.name);
        option.value = branch.branchId;
        selector.appendChild(option);
      });
      selector.hidden = snapshot.branches.length < 2;
      $('selected-branch-label').hidden = snapshot.branches.length > 1;
      $('selected-branch-label').textContent = snapshot.branches[0].name;
      renderBranch(snapshot.branches[0].branchId);
      selector.addEventListener('change', function () {
        try { renderBranch(selector.value); }
        catch (error) { setStatus(error.message, 'error'); }
      });
      $('publication-number').textContent = String(snapshot.publicationNumber);
      $('publication-date').textContent = snapshot.publishedAt || '';
      $('menu-content').hidden = false;
      setStatus('Menu publication ' + snapshot.publicationNumber + ' passed V3 validation and checksum verification.', 'ready');
    } catch (error) {
      $('product-catalog').replaceChildren();
      $('product-category-nav').replaceChildren();
      $('deal-catalog').replaceChildren();
      $('menu-content').hidden = true;
      setStatus(String(error && error.message || 'The current published menu could not be verified.'), 'error');
    }
  }

  root.addEventListener('DOMContentLoaded', load);
  root.FlameChickPublicMenuV3 = Object.freeze({ load: load });
})(typeof window !== 'undefined' ? window : globalThis);
