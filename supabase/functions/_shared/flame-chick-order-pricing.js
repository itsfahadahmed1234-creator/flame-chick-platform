// Trusted V3 order pricing shared by the Flame Chick Order Edge Function and
// Node contract tests. All amounts are integer minor units until serialization.
// The browser sends IDs and choices only; this module resolves every price from
// the current immutable published V3 snapshot supplied by the server.
const MAX_MINOR_UNITS = 999999999999;
const MAX_ORDER_LINES = 100;
const MAX_COMPONENTS_PER_DEAL = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code, message) {
  return { ok: false, error: { code, message } };
}

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function find(rows, key, value) {
  if (!Array.isArray(rows)) return null;
  return rows.find(row => row && row[key] === value) || null;
}

function minorToMoney(value) {
  return Number((value / 100).toFixed(2));
}

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function validQuantity(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 99;
}

function validateModifierInput(groups, input, dealView) {
  if (!Array.isArray(input)) return fail("MODIFIER_SELECTION_INVALID", "Modifier selections must be an array.");
  if (input.length > 50) return fail("MODIFIER_SELECTION_LIMIT", "Too many modifier groups were submitted.");

  const selections = Object.create(null);
  for (const row of input) {
    if (!isRecord(row) || !isUuid(row.modifier_group_id) ||
        !Array.isArray(row.modifier_ids) || row.modifier_ids.length > 20 ||
        Object.prototype.hasOwnProperty.call(selections, row.modifier_group_id)) {
      return fail("MODIFIER_SELECTION_INVALID", "A modifier group selection is malformed or repeated.");
    }
    if (row.modifier_ids.some(id => !isUuid(id))) {
      return fail("MODIFIER_SELECTION_INVALID", "A modifier identifier is invalid.");
    }
    selections[row.modifier_group_id] = row.modifier_ids.slice();
  }

  const checked = dealView.validateModifierSelections(groups, selections);
  if (!checked || checked.ok !== true) {
    return fail(checked?.code || "MODIFIER_SELECTION_INVALID",
      checked?.message || "Modifier choices do not match the published menu.");
  }

  const entries = [];
  let totalMinor = 0;
  for (const group of groups) {
    const selected = selections[group.id] || [];
    for (const modifierId of selected) {
      const modifier = find(group.modifiers, "id", modifierId);
      if (!modifier || !Number.isSafeInteger(modifier.priceMinor) || modifier.priceMinor < 0) {
        return fail("MODIFIER_PRICE_UNAVAILABLE", "A selected modifier has no valid published price.");
      }
      totalMinor += modifier.priceMinor;
      if (!Number.isSafeInteger(totalMinor) || totalMinor > MAX_MINOR_UNITS) {
        return fail("ORDER_TOTAL_INVALID", "The order total exceeds the supported amount.");
      }
      entries.push({
        modifier_group_id: group.id,
        modifier_id: modifier.id,
        modifier_group_name_snapshot: group.name,
        modifier_name_snapshot: modifier.name,
        unit_price_snapshot: minorToMoney(modifier.priceMinor),
        unit_price_minor: modifier.priceMinor,
        modifier_snapshot: {
          modifierGroupId: group.id,
          modifierId: modifier.id,
          priceMode: modifier.priceMode
        }
      });
    }
  }
  return { ok: true, entries, totalMinor, selections };
}

function buildModifierGroups(snapshot, productId, productVariantId, dealView, excludeStandaloneOnly) {
  return dealView.buildProductModifierGroups(snapshot, productId, productVariantId, undefined, {
    excludeStandaloneOnly: excludeStandaloneOnly === true
  });
}

function validateProductLine(snapshot, branchId, item, quantity, contract, dealView) {
  if (!isUuid(item.product_id) || !isUuid(item.product_variant_id)) {
    return fail("PRODUCT_SELECTION_INVALID", "Choose a valid product and size from the published menu.");
  }
  const product = find(snapshot.products, "productId", item.product_id);
  const variant = find(snapshot.productVariants, "variantId", item.product_variant_id);
  if (!product || !variant || variant.productId !== product.productId ||
      variant.standaloneSellable !== true ||
      !contract.resolveProductAvailability(snapshot, branchId, product.productId) ||
      !contract.resolveVariantAvailability(snapshot, branchId, product.productId, variant.variantId)) {
    return fail("PRODUCT_UNAVAILABLE", "A selected product or size is not available at this branch.");
  }
  const baseMinor = contract.minorUnits(variant.price);
  if (!Number.isSafeInteger(baseMinor) || baseMinor < 0) {
    return fail("PRODUCT_PRICE_INVALID", "A selected product size has no valid published price.");
  }
  const modifierGroups = buildModifierGroups(snapshot, product.productId, variant.variantId, dealView, false);
  const modifierResult = validateModifierInput(modifierGroups, item.modifiers ?? [], dealView);
  if (!modifierResult.ok) return modifierResult;

  const unitMinor = baseMinor + modifierResult.totalMinor;
  const lineMinor = unitMinor * quantity;
  if (!Number.isSafeInteger(lineMinor) || lineMinor > MAX_MINOR_UNITS) {
    return fail("ORDER_TOTAL_INVALID", "The order total exceeds the supported amount.");
  }
  return {
    ok: true,
    line: {
      line_kind: "product",
      product_id: product.productId,
      product_variant_id: variant.variantId,
      deal_id: null,
      quantity,
      product_name_snapshot: product.nameEn,
      variant_label_snapshot: variant.sizeLabel,
      deal_title_snapshot: null,
      unit_price_snapshot: minorToMoney(baseMinor),
      line_total: minorToMoney(lineMinor),
      item_notes: typeof item.notes === "string" ? item.notes.trim().slice(0, 500) : null,
      item_snapshot: {
        schemaVersion: 3,
        publicationId: snapshot.publicationId,
        productId: product.productId,
        productVariantId: variant.variantId,
        productName: product.nameEn,
        variantLabel: variant.sizeLabel,
        baseUnitPriceMinor: baseMinor,
        modifiers: modifierResult.entries.map(row => ({
          modifierGroupId: row.modifier_group_id,
          modifierId: row.modifier_id,
          unitPriceMinor: row.unit_price_minor
        }))
      },
      modifiers: modifierResult.entries.map(row => ({
        ...row,
        quantity,
        total_price_snapshot: minorToMoney(row.unit_price_minor * quantity)
      })),
      components: []
    },
    lineMinor
  };
}

function validateDealLine(snapshot, branchId, item, quantity, dealViewModel, contract, dealView) {
  if (!isUuid(item.deal_id) || !isUuid(item.deal_variant_id)) {
    return fail("DEAL_SELECTION_INVALID", "Choose a valid published deal option.");
  }
  const deal = dealViewModel.collections.flatMap(collection => collection.deals)
    .find(row => row.id === item.deal_id);
  if (!deal || deal.available !== true) {
    return fail("DEAL_UNAVAILABLE", "This deal is not currently orderable at the selected branch.");
  }
  const variant = find(deal.variants, "id", item.deal_variant_id);
  if (!variant || variant.branchSatisfiable !== true ||
      !Number.isSafeInteger(variant.basePriceMinor) || variant.basePriceMinor < 0) {
    return fail("DEAL_VARIANT_UNAVAILABLE", "This deal option is not available at the selected branch.");
  }
  if (!Array.isArray(item.component_groups)) {
    return fail("DEAL_COMPONENT_SELECTION_INVALID", "Complete the published deal component choices.");
  }

  const selectionMap = Object.create(null);
  const componentMap = new Map();
  let suppliedComponentCount = 0;
  for (const groupInput of item.component_groups) {
    if (!isRecord(groupInput) || !isUuid(groupInput.component_group_id) ||
        !Array.isArray(groupInput.components) || Object.prototype.hasOwnProperty.call(selectionMap, groupInput.component_group_id)) {
      return fail("DEAL_COMPONENT_SELECTION_INVALID", "A deal component group is malformed or repeated.");
    }
    const components = groupInput.components;
    if (components.length > MAX_COMPONENTS_PER_DEAL) {
      return fail("DEAL_COMPONENT_LIMIT", "A deal contains too many component selections.");
    }
    const counts = new Map();
    for (const component of components) {
      if (!isRecord(component) || !isUuid(component.component_option_id) ||
          !isUuid(component.product_id) || !isUuid(component.product_variant_id)) {
        return fail("DEAL_COMPONENT_SELECTION_INVALID", "A selected deal component is malformed.");
      }
      counts.set(component.component_option_id, (counts.get(component.component_option_id) || 0) + 1);
      suppliedComponentCount += 1;
    }
    selectionMap[groupInput.component_group_id] = Array.from(counts.entries()).map(([componentOptionId, count]) => ({
      componentOptionId,
      quantity: count
    }));
    componentMap.set(groupInput.component_group_id, components);
  }
  if (suppliedComponentCount > MAX_COMPONENTS_PER_DEAL) {
    return fail("DEAL_COMPONENT_LIMIT", "A deal contains too many component selections.");
  }

  const checkedSelections = dealView.validateDealSelections(variant, selectionMap);
  if (!checkedSelections || checkedSelections.ok !== true) {
    return fail(checkedSelections?.code || "DEAL_COMPONENT_SELECTION_INVALID",
      checkedSelections?.message || "Deal choices do not match this published deal option.");
  }

  let unitComponentMinor = 0;
  const normalizedComponents = [];
  for (const group of variant.groups) {
    const selectedRows = componentMap.get(group.id) || [];
    const countByOption = new Map();
    for (const selected of selectedRows) {
      countByOption.set(selected.component_option_id, (countByOption.get(selected.component_option_id) || 0) + 1);
    }
    for (const selected of selectedRows) {
      const option = find(group.options, "id", selected.component_option_id);
      if (!option || selected.product_id !== option.productId ||
          selected.product_variant_id !== option.productVariantId) {
        return fail("DEAL_COMPONENT_IDENTITY_MISMATCH", "A deal component does not match its published option.");
      }
      let contributionMinor = 0;
      if (option.pricingTreatment === "INCLUDED") {
        contributionMinor = 0;
      } else if (option.pricingTreatment === "SURCHARGE") {
        contributionMinor = option.surchargeMinor;
      } else if (option.pricingTreatment === "STANDALONE" && variant.pricingMode === "BASE_PLUS_SELECTED_ITEMS") {
        contributionMinor = option.standalonePriceMinor;
      } else {
        return fail("DEAL_PRICING_TREATMENT_UNSUPPORTED", "This deal option has an unsupported pricing treatment.");
      }
      if (!Number.isSafeInteger(contributionMinor) || contributionMinor < 0) {
        return fail("DEAL_COMPONENT_PRICE_INVALID", "A selected deal component has no valid published price.");
      }
      const modifierGroups = option.modifierGroups || [];
      const modifierResult = validateModifierInput(modifierGroups, selected.modifiers ?? [], dealView);
      if (!modifierResult.ok) return modifierResult;
      const componentUnitMinor = contributionMinor + modifierResult.totalMinor;
      unitComponentMinor += componentUnitMinor;
      if (!Number.isSafeInteger(unitComponentMinor) || unitComponentMinor > MAX_MINOR_UNITS) {
        return fail("ORDER_TOTAL_INVALID", "The deal total exceeds the supported amount.");
      }
      const drink = find(snapshot.drinkOptions, "productVariantId", option.productVariantId);
      const product = find(snapshot.products, "productId", option.productId);
      const productVariant = find(snapshot.productVariants, "variantId", option.productVariantId);
      normalizedComponents.push({
        deal_component_id: group.id,
        component_type: drink ? "drink" : "product",
        selected_product_id: option.productId,
        selected_variant_id: option.productVariantId,
        selected_drink_option_id: drink ? drink.drinkOptionId : null,
        quantity: 1,
        name_snapshot: option.productName,
        variant_snapshot: option.variantLabel,
        volume_snapshot: drink ? drink.displayName : null,
        unit_price_snapshot: minorToMoney(contributionMinor),
        component_snapshot: {
          schemaVersion: 3,
          componentGroupId: group.id,
          componentOptionId: option.id,
          pricingTreatment: option.pricingTreatment,
          priceContributionMinor: contributionMinor
        },
        modifiers: modifierResult.entries.map(row => ({
          ...row,
          // A single component instance is represented by a row; deal quantity
          // is applied by the order writer when it records modifier quantities.
          quantity: 1,
          total_price_snapshot: minorToMoney(row.unit_price_minor)
        }))
      });
    }
  }

  const unitMinor = variant.basePriceMinor + unitComponentMinor;
  const lineMinor = unitMinor * quantity;
  if (!Number.isSafeInteger(lineMinor) || lineMinor > MAX_MINOR_UNITS) {
    return fail("ORDER_TOTAL_INVALID", "The order total exceeds the supported amount.");
  }
  const dealRow = find(snapshot.deals, "dealId", deal.id);
  return {
    ok: true,
    lineMinor,
    line: {
      line_kind: "deal",
      product_id: null,
      product_variant_id: null,
      deal_id: deal.id,
      quantity,
      product_name_snapshot: null,
      variant_label_snapshot: null,
      deal_title_snapshot: deal.title,
      unit_price_snapshot: minorToMoney(variant.basePriceMinor),
      line_total: minorToMoney(lineMinor),
      item_notes: typeof item.notes === "string" ? item.notes.trim().slice(0, 500) : null,
      item_snapshot: {
        schemaVersion: 3,
        publicationId: snapshot.publicationId,
        dealId: deal.id,
        dealVariantId: variant.id,
        dealTitle: deal.title,
        dealVariantLabel: variant.label,
        baseUnitPriceMinor: variant.basePriceMinor,
        componentTotalMinor: unitComponentMinor,
        componentCount: normalizedComponents.length
      },
      modifiers: [],
      components: normalizedComponents
    }
  };
}

export function calculateWebsiteOrder(snapshot, request, dependencies = {}) {
  const contract = dependencies.contract;
  const dealView = dependencies.dealView;
  const databaseNow = dependencies.databaseNow ?? snapshot?.databaseNow;
  if (!contract || typeof contract.validateSnapshot !== "function" ||
      !dealView || typeof dealView.buildDealViewModel !== "function" ||
      typeof dealView.buildProductModifierGroups !== "function" ||
      typeof dealView.validateModifierSelections !== "function" ||
      typeof dealView.validateDealSelections !== "function") {
    return fail("ORDER_PRICING_DEPENDENCIES_MISSING", "The trusted V3 order pricing modules are not available.");
  }
  if (!isRecord(request) || request.schema_version !== 3 ||
      !isUuid(request.publication_id) || !isUuid(request.branch_id) ||
      typeof request.version_id !== "string" ||
      !["delivery", "pickup"].includes(request.fulfillment_type)) {
    return fail("ORDER_REQUEST_INVALID", "The V3 order request is missing required publication, branch or fulfilment details.");
  }
  const checkedSnapshot = contract.validateSnapshot(snapshot);
  if (!checkedSnapshot || checkedSnapshot.ok !== true) {
    return fail(checkedSnapshot?.code || "CATALOG_INVALID", "The current published menu could not be safely verified.");
  }
  if (request.publication_id !== snapshot.publicationId ||
      request.version_id !== snapshot.versionId) {
    return fail("CATALOG_PUBLICATION_CHANGED", "The published menu changed. Refresh the menu and review your cart again.");
  }
  if (!contract.isBranchOrderingEnabled(snapshot, request.branch_id, request.fulfillment_type)) {
    return fail("BRANCH_FULFILMENT_UNAVAILABLE", "Online ordering is not enabled for this branch and fulfilment method.");
  }
  if (!isRecord(request.customer) ||
      typeof request.customer.name !== "string" ||
      request.customer.name.trim().length < 1 || request.customer.name.trim().length > 160 ||
      typeof request.customer.phone !== "string" ||
      request.customer.phone.trim().length < 3 || request.customer.phone.trim().length > 32 ||
      (request.customer.email !== undefined && request.customer.email !== null &&
        (typeof request.customer.email !== "string" || request.customer.email.length > 254))) {
    return fail("CUSTOMER_DETAILS_INVALID", "Enter a valid customer name and phone number.");
  }
  if (request.notes !== undefined && request.notes !== null &&
      (typeof request.notes !== "string" || request.notes.length > 1000)) {
    return fail("ORDER_NOTES_INVALID", "Order notes must be 1,000 characters or fewer.");
  }
  if (!Array.isArray(request.items) || request.items.length < 1 || request.items.length > MAX_ORDER_LINES) {
    return fail("ORDER_ITEMS_INVALID", "An order must contain between 1 and 100 item lines.");
  }

  const menu = dealView.buildDealViewModel(snapshot, {
    branchId: request.branch_id,
    fulfilmentType: request.fulfillment_type,
    databaseNow
  }, contract);
  if (!menu || menu.ok !== true || menu.orderingEnabled !== true) {
    return fail(menu?.code || "BRANCH_FULFILMENT_UNAVAILABLE",
      menu?.message || "The selected branch is not accepting online orders for this fulfilment method.");
  }

  const outputItems = [];
  let subtotalMinor = 0;
  for (let index = 0; index < request.items.length; index++) {
    const item = request.items[index];
    if (!isRecord(item) || !validQuantity(item.quantity)) {
      return fail("ORDER_ITEM_QUANTITY_INVALID", "Each order line must have a quantity from 1 to 99.");
    }
    const result = item.kind === "product"
      ? validateProductLine(snapshot, request.branch_id, item, item.quantity, contract, dealView)
      : item.kind === "deal"
        ? validateDealLine(snapshot, request.branch_id, item, item.quantity, menu, contract, dealView)
        : fail("ORDER_ITEM_KIND_INVALID", "Choose a published product or deal.");
    if (!result.ok) return result;
    subtotalMinor += result.lineMinor;
    if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor > MAX_MINOR_UNITS) {
      return fail("ORDER_TOTAL_INVALID", "The order total exceeds the supported amount.");
    }
    outputItems.push(result.line);
  }

  return {
    ok: true,
    data: {
      schema_version: 3,
      publication_id: snapshot.publicationId,
      catalog_version: snapshot.publicationNumber,
      branch_id: request.branch_id,
      fulfillment_type: request.fulfillment_type,
      currency_code: snapshot.settings.currency_code,
      customer_name: request.customer.name.trim(),
      customer_phone: request.customer.phone.trim(),
      customer_email: typeof request.customer.email === "string" ? request.customer.email.trim() || null : null,
      notes: typeof request.notes === "string" ? request.notes.trim() || null : null,
      subtotal: minorToMoney(subtotalMinor),
      subtotal_minor: subtotalMinor,
      discount_amount: 0,
      items: outputItems
    }
  };
}
