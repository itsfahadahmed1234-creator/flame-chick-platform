/* Flame Chick V3 branch and fulfilment selection.
 * Selection is UI context only. Every quote/order API must re-check the current
 * publication, branch and fulfilment support on the server.
 */
(function (root) {
  'use strict';

  var DATABASE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

  function fail(code, message) {
    return { ok: false, code: code, message: message };
  }

  function validDatabaseTime(value) {
    return typeof value === 'string' && DATABASE_TIME_RE.test(value) &&
      Number.isFinite(Date.parse(value));
  }

  function createBranchFulfilmentSelection(snapshot, databaseNow, contract) {
    if (!snapshot || typeof snapshot !== 'object' || snapshot.schemaVersion !== 3 ||
        !Array.isArray(snapshot.branches) || snapshot.branches.length === 0) {
      return fail('BRANCH_CATALOG_INVALID', 'The published catalog does not contain valid branch information.');
    }
    if (!contract || typeof contract.isIsoUtcDateTime !== 'function' || typeof contract.isBranchOrderingEnabled !== 'function') {
      return fail('CATALOG_CONTRACT_REQUIRED', 'The V3 branch availability validator is unavailable.');
    }
    if (!contract.isIsoUtcDateTime(databaseNow)) {
      return fail('DATABASE_TIME_REQUIRED', 'Trusted database time is missing or invalid. Please reload the menu.');
    }

    var branches = snapshot.branches.slice();
    var branchById = Object.create(null);
    for (var i = 0; i < branches.length; i++) {
      var branch = branches[i];
      if (!branch || typeof branch.branchId !== 'string' || branchById[branch.branchId]) {
        return fail('BRANCH_CATALOG_INVALID', 'The published branch list contains invalid or duplicate identifiers.');
      }
      branchById[branch.branchId] = branch;
    }

    var selectedBranchId = branches.length === 1 ? branches[0].branchId : null;
    var fulfilmentType = null;

    function currentBranch() {
      return selectedBranchId ? branchById[selectedBranchId] || null : null;
    }

    function supportedTypes(branch) {
      if (!branch || branch.websiteOrderingEnabled !== true) return [];
      var result = [];
      if (contract.isBranchOrderingEnabled(snapshot, branch.branchId, 'delivery')) result.push('delivery');
      if (contract.isBranchOrderingEnabled(snapshot, branch.branchId, 'pickup')) result.push('pickup');
      return result;
    }

    function selectBranch(branchId) {
      if (typeof branchId !== 'string' || !branchById[branchId]) {
        return fail('BRANCH_INVALID', 'Choose a branch from the current published catalog.');
      }
      selectedBranchId = branchId;
      fulfilmentType = null;
      return { ok: true, state: getState() };
    }

    function selectFulfilment(type) {
      var branch = currentBranch();
      if (!branch) return fail('BRANCH_REQUIRED', 'Choose a branch before selecting delivery or pickup.');
      if (type !== 'delivery' && type !== 'pickup') {
        return fail('FULFILMENT_INVALID', 'Choose delivery or pickup.');
      }
      if (!contract.isBranchOrderingEnabled(snapshot, branch.branchId, type)) {
        return fail('FULFILMENT_UNAVAILABLE', 'This branch does not currently support the selected ordering method.');
      }
      fulfilmentType = type;
      return { ok: true, state: getState() };
    }

    function getState() {
      var branch = currentBranch();
      var available = supportedTypes(branch);
      return {
        selectedBranchId: selectedBranchId,
        branchRequired: selectedBranchId === null,
        selectedBranch: branch ? {
          branchId: branch.branchId,
          branchCode: branch.branchCode,
          name: branch.name,
          timezone: branch.timezone
        } : null,
        availableFulfilmentTypes: available,
        fulfilmentType: fulfilmentType,
        ready: !!branch && available.indexOf(fulfilmentType) >= 0,
        databaseNow: databaseNow
      };
    }

    function getContext() {
      var state = getState();
      if (!state.ready) return fail('BRANCH_FULFILMENT_REQUIRED', 'Select a supported branch and fulfilment method first.');
      return {
        ok: true,
        schemaVersion: 3,
        publicationId: snapshot.publicationId,
        versionId: snapshot.versionId,
        branchId: state.selectedBranchId,
        fulfilmentType: state.fulfilmentType,
        databaseNow: databaseNow,
        timezone: state.selectedBranch.timezone
      };
    }

    function render(container, options) {
      options = options || {};
      var doc = options.document || (root && root.document);
      if (!doc || !container || typeof container.replaceChildren !== 'function') {
        return fail('DOM_TARGET_REQUIRED', 'A document and branch selector container are required.');
      }
      var fragment = doc.createDocumentFragment();
      var state = getState();
      var controls = Object.create(null);

      function el(tag, className, value) {
        var node = doc.createElement(tag);
        if (className) node.className = className;
        if (value !== undefined) node.textContent = String(value);
        return node;
      }

      var branchSet = el('fieldset', 'fc-branch-selection');
      branchSet.appendChild(el('legend', '', 'Choose your branch'));
      if (branches.length === 1) {
        var single = state.selectedBranch;
        branchSet.appendChild(el('p', 'fc-branch-single', single ? single.name : 'Branch unavailable'));
      } else {
        branches.forEach(function (branch) {
          var label = el('label', 'fc-branch-option');
          var radio = el('input');
          radio.type = 'radio';
          radio.name = 'fc-branch-selection';
          radio.value = branch.branchId;
          radio.checked = selectedBranchId === branch.branchId;
          radio.addEventListener('change', function () {
            if (radio.checked) {
              selectBranch(branch.branchId);
              render(container, { document: doc, onChange: options.onChange });
            }
          });
          controls['branch:' + branch.branchId] = radio;
          label.appendChild(radio);
          label.appendChild(el('span', '', branch.name));
          branchSet.appendChild(label);
        });
      }
      fragment.appendChild(branchSet);

      var fulfilmentSet = el('fieldset', 'fc-fulfilment-selection');
      fulfilmentSet.appendChild(el('legend', '', 'Choose delivery or pickup'));
      var selected = currentBranch();
      var availableTypes = supportedTypes(selected);
      [
        { value: 'delivery', label: 'Delivery' },
        { value: 'pickup', label: 'Pickup' }
      ].forEach(function (item) {
        var label = el('label', 'fc-fulfilment-option');
        var radio = el('input');
        radio.type = 'radio';
        radio.name = 'fc-fulfilment-selection';
        radio.value = item.value;
        radio.checked = fulfilmentType === item.value;
        radio.disabled = !selected || availableTypes.indexOf(item.value) < 0;
        radio.addEventListener('change', function () {
          if (radio.checked) {
            selectFulfilment(item.value);
            render(container, { document: doc, onChange: options.onChange });
          }
        });
        controls['fulfilment:' + item.value] = radio;
        label.appendChild(radio);
        label.appendChild(el('span', '', item.label));
        fulfilmentSet.appendChild(label);
      });
      fragment.appendChild(fulfilmentSet);

      var status = el('p', 'fc-branch-status', state.ready
        ? 'Your branch and fulfilment method are selected.'
        : (state.branchRequired ? 'Choose a branch to see available ordering methods.' :
          (availableTypes.length ? 'Choose an available ordering method.' :
            'Online ordering is not currently available for this branch.')));
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      fragment.appendChild(status);

      container.replaceChildren(fragment);
      if (typeof options.onChange === 'function') options.onChange(getState());
      return { ok: true, state: getState() };
    }

    return {
      ok: true,
      selectBranch: selectBranch,
      selectFulfilment: selectFulfilment,
      getState: getState,
      getContext: getContext,
      render: render
    };
  }

  var api = {
    validDatabaseTime: validDatabaseTime,
    createBranchFulfilmentSelection: createBranchFulfilmentSelection
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlameChickBranchFulfilment = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
