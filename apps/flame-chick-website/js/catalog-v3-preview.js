/* Flame Chick V3 non-ordering catalog preview orchestrator.
 *
 * Loads only the verified published catalog, creates the branch/fulfilment
 * selector, and derives product/deal view models for the current selection.
 * This module intentionally provides no cart, checkout or order operation.
 */
(function (root) {
  'use strict';

  function fail(code, message) {
    return { ok: false, code: code, message: message };
  }

  function createCatalogPreview(dependencies) {
    dependencies = dependencies || {};
    var client = dependencies.client || (root && root.FlameChickCatalogV3Client);
    var contract = dependencies.contract || (root && root.FlameChickCatalogV3);
    var branchModule = dependencies.branchModule || (root && root.FlameChickBranchFulfilment);
    var productModule = dependencies.productModule || (root && root.FlameChickCatalogV3View);
    var dealModule = dependencies.dealModule || (root && root.FlameChickCatalogV3DealView);
    var config = dependencies.config || (typeof FLAME_CHICK_CONFIG !== 'undefined' ? FLAME_CHICK_CONFIG : null);

    if (!client || typeof client.load !== 'function' ||
        !contract || typeof contract.validateSnapshot !== 'function' ||
        !branchModule || typeof branchModule.createBranchFulfilmentSelection !== 'function' ||
        !productModule || typeof productModule.buildMenuViewModel !== 'function' ||
        !dealModule || typeof dealModule.buildDealViewModel !== 'function') {
      return fail('PREVIEW_DEPENDENCIES_MISSING', 'The verified V3 preview modules are not all available.');
    }

    var loadState = 'idle';
    var loadError = null;
    var snapshot = null;
    var databaseNow = null;
    var selection = null;
    var currentPreview = null;
    var loadPromise = null;
    var previewSequence = 0;
    var listeners = [];
    var loadGeneration = 0;

    function notify() {
      var state = getState();
      listeners.slice().forEach(function (listener) {
        try { listener(state); } catch (_) { /* observers cannot break catalog state */ }
      });
    }

    function clearPreview() {
      currentPreview = null;
      previewSequence += 1;
    }

    function getSelectionState() {
      return selection ? selection.getState() : null;
    }

    function getState() {
      var selectionState = getSelectionState();
      return {
        loadState: loadState,
        error: loadError,
        selection: selectionState,
        previewReady: !!currentPreview,
        previewId: currentPreview ? currentPreview.previewId : null,
        mode: 'non-ordering-preview'
      };
    }

    function buildCurrentPreview() {
      clearPreview();
      if (loadState !== 'ready' || !selection) {
        notify();
        return fail('CATALOG_NOT_READY', 'A verified published catalog is not available.');
      }

      var selectionState = selection.getState();
      var context = selection.getContext();
      if (!context.ok) {
        // A selected branch is sufficient for read-only menu browsing. It is
        // not an order context; no fulfilment method means ordering stays off.
        if (!selectionState || !selectionState.selectedBranchId || !selectionState.selectedBranch) {
          notify();
          return context;
        }
        context = {
          ok: true,
          schemaVersion: 3,
          publicationId: snapshot.publicationId,
          versionId: snapshot.versionId,
          branchId: selectionState.selectedBranchId,
          fulfilmentType: null,
          databaseNow: databaseNow,
          timezone: selectionState.selectedBranch.timezone
        };
      }

      var productResult = productModule.buildMenuViewModel(snapshot, {
        branchId: context.branchId,
        fulfilmentType: context.fulfilmentType
      }, contract);
      if (!productResult || productResult.ok !== true) {
        loadState = 'error';
        loadError = fail((productResult && productResult.code) || 'PRODUCT_VIEW_FAILED',
          (productResult && productResult.message) || 'The product preview could not be built.');
        notify();
        return loadError;
      }

      var dealResult = dealModule.buildDealViewModel(snapshot, {
        branchId: context.branchId,
        fulfilmentType: context.fulfilmentType,
        databaseNow: databaseNow
      }, contract);
      if (!dealResult || dealResult.ok !== true) {
        loadState = 'error';
        loadError = fail((dealResult && dealResult.code) || 'DEAL_VIEW_FAILED',
          (dealResult && dealResult.message) || 'The deal preview could not be built.');
        notify();
        return loadError;
      }

      // These view models are informational only. Do not pass an add-to-cart
      // callback or expose any checkout operation from this orchestrator.
      currentPreview = {
        ok: true,
        mode: 'non-ordering-preview',
        canAddToCart: false,
        canCheckout: false,
        canSubmitOrder: false,
        previewId: previewSequence,
        publicationId: context.publicationId,
        versionId: context.versionId,
        branchId: context.branchId,
        fulfilmentType: context.fulfilmentType,
        availableFulfilmentTypes: selectionState.availableFulfilmentTypes.slice(),
        orderingEnabled: context.fulfilmentType !== null &&
          productResult.orderingEnabled === true && dealResult.orderingEnabled === true,
        databaseNow: context.databaseNow,
        timezone: context.timezone,
        products: productResult,
        deals: dealResult
      };
      loadState = 'ready';
      loadError = null;
      notify();
      return { ok: true, preview: currentPreview };
    }

    function selectBranch(branchId) {
      if (loadState !== 'ready' || !selection) {
        return fail('CATALOG_NOT_READY', 'Load a verified catalog before choosing a branch.');
      }
      var result = selection.selectBranch(branchId);
      if (!result.ok) return result;
      var built = buildCurrentPreview();
      if (!built.ok) return built;
      return { ok: true, state: getState(), preview: built.preview };
    }

    function selectFulfilment(type) {
      if (loadState !== 'ready' || !selection) {
        return fail('CATALOG_NOT_READY', 'Load a verified catalog before choosing delivery or pickup.');
      }
      var result = selection.selectFulfilment(type);
      if (!result.ok) return result;
      return buildCurrentPreview();
    }

    function renderSelection(container, options) {
      options = options || {};
      if (loadState !== 'ready' || !selection) {
        return fail('CATALOG_NOT_READY', 'The branch selector is available after a published catalog loads.');
      }
      var renderOptions = Object.assign({}, options);
      var callerOnChange = renderOptions.onChange;
      renderOptions.onChange = function (selectionState) {
        if (selectionState && selectionState.selectedBranchId) buildCurrentPreview();
        else {
          clearPreview();
          notify();
        }
        if (typeof callerOnChange === 'function') callerOnChange(selectionState);
      };
      return selection.render(container, renderOptions);
    }

    function start() {
      if (loadPromise) return loadPromise;
      if (loadState === 'ready' && snapshot && selection) {
        return Promise.resolve({ state: 'ready', preview: currentPreview, selection: selection.getState() });
      }
      if (loadState === 'loading') {
        return Promise.resolve({ state: 'loading' });
      }

      clearPreview();
      loadState = 'loading';
      loadError = null;
      snapshot = null;
      databaseNow = null;
      selection = null;
      var generation = ++loadGeneration;
      notify();

      loadPromise = Promise.resolve().then(function () {
        return client.load({ config: config, contract: contract });
      }).then(function (result) {
        if (generation !== loadGeneration) return { state: 'superseded' };
        if (!result || result.state !== 'ready' || !result.snapshot) {
          loadState = result && result.state === 'unpublished' ? 'unpublished' : 'error';
          loadError = result && result.error
            ? fail(result.error.code || 'CATALOG_LOAD_FAILED', result.error.message || 'Published catalog could not be loaded.')
            : fail('CATALOG_LOAD_FAILED', 'Published catalog could not be loaded.');
          notify();
          return { state: loadState, error: loadError };
        }

        var checked = contract.validateSnapshot(result.snapshot);
        if (!checked || checked.ok !== true ||
            typeof result.databaseNow !== 'string' ||
            typeof contract.isIsoUtcDateTime !== 'function' ||
            !contract.isIsoUtcDateTime(result.databaseNow) ||
            result.snapshot.databaseNow !== result.databaseNow ||
            result.versionId !== result.snapshot.versionId) {
          loadState = 'error';
          loadError = fail('PREVIEW_CATALOG_CONTEXT_INVALID',
            'Catalog publication or trusted database time did not pass preview validation.');
          notify();
          return { state: 'error', error: loadError };
        }

        snapshot = result.snapshot;
        databaseNow = result.databaseNow;
        var branchResult = branchModule.createBranchFulfilmentSelection(snapshot, databaseNow, contract);
        if (!branchResult || branchResult.ok !== true) {
          snapshot = null;
          databaseNow = null;
          loadState = 'error';
          loadError = fail((branchResult && branchResult.code) || 'BRANCH_SELECTOR_FAILED',
            (branchResult && branchResult.message) || 'Branch selection could not be initialized.');
          notify();
          return { state: 'error', error: loadError };
        }

        selection = branchResult;
        loadState = 'ready';
        loadError = null;
        clearPreview();
        var selectionState = selection.getState();
        if (selectionState.selectedBranchId) buildCurrentPreview();
        else notify();

        return {
          state: 'ready',
          selection: selection.getState(),
          preview: currentPreview
        };
      }).catch(function (error) {
        if (generation !== loadGeneration) return { state: 'superseded' };
        loadState = 'error';
        loadError = fail((error && error.code) || 'PREVIEW_LOAD_FAILED',
          (error && error.message) || 'The published catalog preview could not be initialized.');
        snapshot = null;
        databaseNow = null;
        selection = null;
        currentPreview = null;
        notify();
        return { state: 'error', error: loadError };
      }).finally(function () {
        if (generation === loadGeneration) loadPromise = null;
      });

      return loadPromise;
    }

    function reload() {
      loadGeneration += 1;
      loadPromise = null;
      clearPreview();
      loadState = 'idle';
      loadError = null;
      snapshot = null;
      databaseNow = null;
      selection = null;
      notify();
      return start();
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') return fail('LISTENER_INVALID', 'A state listener function is required.');
      listeners.push(listener);
      return {
        unsubscribe: function () {
          var index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        }
      };
    }

    return {
      ok: true,
      start: start,
      reload: reload,
      selectBranch: selectBranch,
      selectFulfilment: selectFulfilment,
      renderSelection: renderSelection,
      getState: getState,
      getPreview: function () { return currentPreview; },
      getSelectionState: getSelectionState,
      subscribe: subscribe
    };
  }

  var api = { createCatalogPreview: createCatalogPreview };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlameChickCatalogV3Preview = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
