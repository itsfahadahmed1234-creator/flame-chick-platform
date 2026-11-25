/* Flame Chick POS unified V3 order-sync contract.
 * Pure client adapter: never sends browser-computed prices or totals as authority.
 * The Order API prices product/variant/modifier/deal selections from the immutable
 * published V3 catalog and derives the staff actor + branch from the Auth session.
 */
(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlameChickPosSyncV3 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const FULFILMENT = Object.freeze({
    delivery: 'delivery', pickup: 'pickup', takeaway: 'pickup',
    dinein: 'dine_in', 'dine-in': 'dine_in', dine_in: 'dine_in'
  });

  function fail(message, code) {
    const error = new Error(message);
    error.code = code || 'POS_SYNC_INVALID';
    return error;
  }
  function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  function uuidFrom(cryptoSource) {
    const source = cryptoSource || (typeof crypto !== 'undefined' ? crypto : null);
    if (!source || typeof source.randomUUID !== 'function') {
      throw fail('This device cannot generate a secure POS sync identity. Update the browser before syncing.', 'POS_UUID_UNAVAILABLE');
    }
    return source.randomUUID();
  }
  function ensureIdentity(order, uuidFactory) {
    if (!isRecord(order)) throw fail('A local POS order is required.');
    const next = { ...order };
    if (!UUID_RE.test(String(next.syncOrderId || ''))) {
      next.syncOrderId = typeof uuidFactory === 'function' ? uuidFactory() : uuidFrom();
    }
    if (!UUID_RE.test(String(next.syncOrderId))) throw fail('The local POS sync identity is not a valid UUID.', 'POS_UUID_INVALID');
    const revision = Number(next.localRevision);
    next.localRevision = Number.isSafeInteger(revision) && revision >= 1 ? revision : 1;
    return next;
  }
  function nextRevision(order, previous) {
    const current = Number(order && order.localRevision) || 0;
    const prior = Number(previous && previous.localRevision) || 0;
    return Math.max(current, prior) + 1;
  }
  function normalizeFulfillment(value) {
    const key = String(value || '').trim().toLowerCase();
    const mapped = FULFILMENT[key];
    if (!mapped) throw fail('Choose Delivery, Takeaway or Dine-in before saving this POS order.', 'POS_FULFILLMENT_INVALID');
    return mapped;
  }
  function findBy(rows, key, value) {
    return (Array.isArray(rows) ? rows : []).find(row => String(row && row[key]) === String(value)) || null;
  }
  function productLine(line, snapshot, contract, dealView) {
    const quantity = Math.trunc(Number(line.quantity) || 1);
    if (quantity < 1 || quantity > 99) throw fail('An item has an invalid quantity.', 'POS_ITEM_QUANTITY_INVALID');
    const variantId = String(line.variantId || line.itemId || '').trim();
    const variant = findBy(snapshot.productVariants, 'variantId', variantId);
    const productId = String(line.productId || variant && variant.productId || '').trim();
    const product = findBy(snapshot.products, 'productId', productId);
    if (!UUID_RE.test(productId) || !UUID_RE.test(variantId) || !product || !variant ||
        String(variant.productId) !== productId || variant.standaloneSellable !== true) {
      throw fail('An item in this order is not a valid standalone product/size in the saved V3 menu. Re-add the item from the current menu.', 'POS_ITEM_CATALOG_MISMATCH');
    }
    const groups = dealView.buildProductModifierGroups(snapshot, productId, variantId, contract);
    if (!Array.isArray(groups)) throw fail('The V3 modifier groups could not be loaded.', 'POS_MODIFIER_CATALOG_INVALID');
    const selected = new Map();
    for (const row of Array.isArray(line.modifiers) ? line.modifiers : []) {
      const groupId = String(row.groupId || row.modifierGroupId || row.modifier_group_id || '');
      const modifierId = String(row.modifierId || row.modifier_id || '');
      if (!groupId || !modifierId) throw fail('An extra on an item is incomplete. Remove and reselect it.', 'POS_MODIFIER_SELECTION_INVALID');
      if (!selected.has(groupId)) selected.set(groupId, []);
      selected.get(groupId).push(modifierId);
    }
    const modifiers = groups.map(group => ({
      modifier_group_id: group.id,
      modifier_ids: selected.get(group.id) || []
    }));
    for (const groupId of selected.keys()) {
      if (!groups.some(group => String(group.id) === groupId)) {
        throw fail('An extra belongs to a different product or size. Remove and reselect it.', 'POS_MODIFIER_GROUP_MISMATCH');
      }
    }
    return {
      kind: 'product',
      product_id: productId,
      product_variant_id: variantId,
      quantity,
      notes: String(line.note || line.notes || '').trim().slice(0, 500),
      modifiers
    };
  }
  function dealLine(line, dealViewModel) {
    const quantity = Math.trunc(Number(line.quantity) || 1);
    const dealId = String(line.dealId || line.itemId || '').trim();
    const deal = (dealViewModel.collections || []).flatMap(collection => collection.deals || []).find(row => String(row.id) === dealId);
    if (!UUID_RE.test(dealId) || !deal || deal.available !== true) {
      throw fail('This deal is not available in the saved V3 publication. Refresh the menu before syncing.', 'POS_DEAL_UNAVAILABLE');
    }
    const variantId = String(line.dealVariantId || (deal.variants && deal.variants.length === 1 ? deal.variants[0].id : '') || '').trim();
    const variant = findBy(deal.variants, 'id', variantId);
    if (!UUID_RE.test(variantId) || !variant || variant.branchSatisfiable !== true) {
      throw fail('Choose a valid option for this deal before syncing.', 'POS_DEAL_VARIANT_INVALID');
    }
    if (quantity < 1 || quantity > 99) throw fail('A deal has an invalid quantity.', 'POS_ITEM_QUANTITY_INVALID');

    const savedGroups = Array.isArray(line.componentGroups) ? line.componentGroups : [];
    const component_groups = variant.groups.map(group => {
      const saved = savedGroups.find(row => String(row.componentGroupId || row.component_group_id || row.groupId || '') === String(group.id));
      let selected = saved && Array.isArray(saved.components) ? saved.components : [];
      if (!saved && group.categoryDriven !== true && group.options.length === 1 && Number(group.minUnits) > 0) {
        // Fixed components are unambiguous in V3; repeat the exact published
        // option to satisfy the group's required unit count.
        const option = group.options[0];
        selected = Array.from({ length: Number(group.minUnits) }, () => ({
          componentOptionId: option.id,
          productId: option.productId,
          productVariantId: option.productVariantId,
          quantity: 1,
          modifiers: []
        }));
      }
      const components = [];
      for (const item of selected) {
        const optionId = String(item.componentOptionId || item.component_option_id || '');
        const option = findBy(group.options, 'id', optionId);
        const productId = String(item.productId || item.product_id || '');
        const productVariantId = String(item.productVariantId || item.product_variant_id || '');
        const itemQuantity = Math.trunc(Number(item.quantity) || 1);
        if (!option || option.productId !== productId || option.productVariantId !== productVariantId ||
            !UUID_RE.test(optionId) || !UUID_RE.test(productId) || !UUID_RE.test(productVariantId) ||
            itemQuantity < 1 || itemQuantity > 20) {
          throw fail('A deal component no longer matches the published V3 option. Review the deal selection.', 'POS_DEAL_COMPONENT_INVALID');
        }
        const optionModifiers = Array.isArray(item.modifiers) ? item.modifiers : [];
        for (let i = 0; i < itemQuantity; i++) {
          components.push({
            component_option_id: optionId,
            product_id: productId,
            product_variant_id: productVariantId,
            modifiers: option.modifierGroups.map(modifierGroup => {
              const match = optionModifiers.find(row => String(row.modifierGroupId || row.modifier_group_id) === String(modifierGroup.id));
              const ids = match && Array.isArray(match.modifierIds || match.modifier_ids)
                ? (match.modifierIds || match.modifier_ids) : [];
              return { modifier_group_id: modifierGroup.id, modifier_ids: ids.map(String) };
            })
          });
        }
      }
      const counts = new Map();
      components.forEach(component => counts.set(component.component_option_id, (counts.get(component.component_option_id) || 0) + 1));
      const units = components.length;
      if (units < Number(group.minUnits || 0) || units > Number(group.maxUnits || 0)) {
        throw fail('Complete every required deal component choice before synchronizing.', 'POS_DEAL_COMPONENT_SELECTION_INCOMPLETE');
      }
      for (const [optionId, count] of counts.entries()) {
        const option = findBy(group.options, 'id', optionId);
        if (!option || count > Number(option.maxQuantity || group.maxUnits || 1) ||
            (group.allowRepeatOption !== true && count > 1)) {
          throw fail('A deal component exceeds its published repeat limit.', 'POS_DEAL_COMPONENT_REPEAT_LIMIT');
        }
      }
      return { component_group_id: group.id, components };
    });
    const unknownGroups = savedGroups.filter(row => !variant.groups.some(group =>
      String(group.id) === String(row.componentGroupId || row.component_group_id || row.groupId || '')));
    if (unknownGroups.length) throw fail('This deal contains a component group that is not in the selected V3 deal option.', 'POS_DEAL_GROUP_MISMATCH');
    return { kind: 'deal', deal_id: dealId, deal_variant_id: variantId, quantity, component_groups };
  }
  function buildSyncPayload(order, snapshot, branchId, dependencies) {
    dependencies = dependencies || {};
    const contract = dependencies.contract;
    const dealView = dependencies.dealView;
    if (!isRecord(snapshot) || snapshot.schemaVersion !== 3 ||
        !contract || typeof contract.validateSnapshot !== 'function' ||
        !dealView || typeof dealView.buildDealViewModel !== 'function') {
      throw fail('A verified published V3 catalog is required before a POS order can sync.', 'POS_CATALOG_UNAVAILABLE');
    }
    const checked = contract.validateSnapshot(snapshot);
    if (!checked || checked.ok !== true) throw fail('The saved V3 catalog failed validation.', 'POS_CATALOG_INVALID');
    const branch = findBy(snapshot.branches, 'branchId', branchId);
    if (!branch) throw fail('Your signed-in staff branch is not present in this saved V3 menu.', 'POS_BRANCH_CATALOG_MISMATCH');
    const identity = ensureIdentity(order, dependencies.uuidFactory);
    if (!identity.catalogPublicationId || String(identity.catalogPublicationId) !== String(snapshot.publicationId) ||
        (identity.catalogVersion !== undefined && Number(identity.catalogVersion) !== Number(snapshot.publicationNumber))) {
      throw fail('This order was saved against a different or older menu publication. Refresh the menu and review the items before syncing.', 'POS_CATALOG_STALE');
    }
    const fulfillment_type = normalizeFulfillment(identity.fulfillmentType);
    const customerName = String(identity.customerName || '').trim();
    const customerPhone = String(identity.phone || '').trim();
    if (!customerName || customerName.length > 160 ||
        (customerPhone && (customerPhone.length < 3 || customerPhone.length > 32)) ||
        (fulfillment_type === 'delivery' && customerPhone.length < 3)) {
      throw fail('Enter a valid customer name and phone number. Delivery requires a phone number.', 'POS_CUSTOMER_INVALID');
    }
    const localLines = Array.isArray(identity.items) ? identity.items : [];
    if (!localLines.length || localLines.length > 40) throw fail('A POS order must contain between 1 and 40 items.', 'POS_ORDER_ITEMS_INVALID');
    const dealModel = dealView.buildDealViewModel(snapshot, {
      branchId,
      fulfilmentType: fulfillment_type,
      databaseNow: snapshot.databaseNow,
      staffPos: true
    }, contract);
    if (!dealModel || dealModel.ok !== true) throw fail('The V3 deal catalogue could not be validated for this order.', 'POS_DEAL_CATALOG_INVALID');
    const items = localLines.map(line => line && line.dealId
      ? dealLine(line, dealModel)
      : productLine(line || {}, snapshot, contract, dealView));
    let delivery = null;
    if (fulfillment_type === 'delivery') {
      const address = String(identity.address || '').trim();
      if (address.length < 5 || address.length > 1000) throw fail('Enter a complete delivery address.', 'POS_DELIVERY_ADDRESS_INVALID');
      const areaChoice = String(identity.area || '').trim();
      const notListed = areaChoice.toLowerCase() === 'not listed' || areaChoice.toLowerCase() === 'not listed / other';
      if (notListed) {
        const locality = String(identity.deliveryLocality || identity.otherLocality || '').trim();
        if (!locality || locality.length > 120) throw fail('Enter the locality for a Not Listed delivery before saving it.', 'POS_DELIVERY_LOCALITY_REQUIRED');
        delivery = { selection_type: 'not_listed', area_id: null, other_locality: locality, address, instructions: '' };
      } else {
        const areaId = String(identity.deliveryAreaId || identity.areaId || '').trim();
        if (!UUID_RE.test(areaId)) {
          throw fail('Choose an active listed delivery area loaded from your Production branch settings.', 'POS_DELIVERY_AREA_REQUIRED');
        }
        delivery = {
          selection_type: 'listed_area',
          area_id: areaId,
          other_locality: null,
          address,
          instructions: String(identity.deliveryInstructions || '').trim()
        };
      }
    }
    const kitchenTiming = fulfillment_type === 'dine_in'
      ? (String(identity.kitchenTiming || '').toLowerCase() === 'schedule' ? 'schedule' : 'now')
      : null;
    const payload = {
      action: 'sync_pos_order',
      local_order_id: identity.syncOrderId,
      local_revision: identity.localRevision,
      publication_id: snapshot.publicationId,
      version_id: snapshot.versionId,
      fulfillment_type,
      customer: { name: customerName, phone: customerPhone || null },
      notes: String(identity.notes || '').trim(),
      items
    };
    if (isRecord(identity.pendingPayment)) {
      if (fulfillment_type === 'delivery') {
        throw fail('Delivery payment must be collected by the Cashier after the Rider marks the order Delivered.', 'POS_PAYMENT_FULFILLMENT_INVALID');
      }
      const payment = identity.pendingPayment;
      const requestId = String(payment.requestId || payment.request_id || '');
      const amount = Number(payment.amount);
      const method = String(payment.method || payment.payment_method || '').toLowerCase();
      if (!UUID_RE.test(requestId) || !Number.isFinite(amount) || amount <= 0 ||
          !['cash','card','bank','wallet','other'].includes(method)) {
        throw fail('The saved payment collection request is invalid. Reopen the receipt and choose the payment method again.', 'POS_PAYMENT_REQUEST_INVALID');
      }
      payload.payment = { request_id: requestId, amount, payment_method: method };
    }
    if (delivery) payload.delivery = delivery;
    if (fulfillment_type === 'dine_in') {
      payload.table_reference = String(identity.tableId || identity.tableReference || '').trim() || null;
      payload.table_label_snapshot = String(identity.tableNumber || identity.tableLabel || '').trim() || null;
      payload.kitchen_timing = kitchenTiming;
      if (kitchenTiming === 'schedule') {
        payload.scheduled_for = identity.arrivalTime || null;
        payload.prepare_at = identity.prepareAt || null;
      }
    }
    return payload;
  }
  function acknowledgementMatches(request, response) {
    return !!response && response.ok === true &&
      String(response.local_order_id || '') === String(request.local_order_id || '') &&
      Number(response.local_revision) === Number(request.local_revision) &&
      typeof response.order_id === 'string' && UUID_RE.test(response.order_id);
  }
  function isRecoverableHttpStatus(status) {
    const value = Number(status);
    return !Number.isFinite(value) || value === 0 || value === 408 || value === 425 || value === 429 || value >= 500;
  }

  return Object.freeze({
    UUID_RE, ensureIdentity, nextRevision, normalizeFulfillment,
    buildSyncPayload, acknowledgementMatches, isRecoverableHttpStatus
  });
});
