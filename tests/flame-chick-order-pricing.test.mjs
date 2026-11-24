import test from "node:test";
import assert from "node:assert/strict";
import contract from "../apps/flame-chick-website/js/catalog-v3.js";
import dealView from "../apps/flame-chick-website/js/catalog-v3-deal-view.js";
import fixture from "./fixtures/catalog-v3-fixture.cjs";
import { calculateWebsiteOrder } from "../supabase/functions/_shared/flame-chick-order-pricing.mjs";

const { IDS, createSnapshot } = fixture;
const databaseNow = "2026-11-23T12:00:00.000Z";

function snapshot() {
  const value = createSnapshot();
  value.versionId = "sha256:" + "a".repeat(64);
  return value;
}

function request(items, changes = {}) {
  const current = snapshot();
  return {
    schemaVersion: 3,
    publicationId: current.publicationId,
    versionId: current.versionId,
    branchId: IDS.branch,
    fulfilmentType: "delivery",
    customer: { name: "QA Customer", phone: "03000000000" },
    items,
    ...changes
  };
}

function price(payload, source = snapshot(), options = {}) {
  return calculateWebsiteOrder(source, payload, {
    contract,
    dealView,
    databaseNow,
    ...options
  });
}

test("prices a standalone product and its exact variant-priced modifier from the published snapshot", () => {
  const result = price(request([{
    kind: "product",
    productId: IDS.product,
    productVariantId: IDS.variant,
    quantity: 2,
    modifiers: [{
      modifierGroupId: IDS.modifierGroup,
      modifierIds: [IDS.modifier]
    }]
  }]));

  assert.equal(result.ok, true);
  assert.equal(result.data.subtotal, 1260);
  assert.equal(result.data.items[0].unit_price_snapshot, 550);
  assert.equal(result.data.items[0].line_total, 1260);
  assert.equal(result.data.items[0].modifiers[0].unit_price_snapshot, 80);
  assert.equal(result.data.items[0].modifiers[0].total_price_snapshot, 160);
  assert.equal(result.data.items[0].item_snapshot.publicationId, IDS.branch === null ? null : snapshot().publicationId);
});

test("ignores all browser-supplied prices and recalculates only from published prices", () => {
  const payload = request([{
    kind: "product",
    productId: IDS.product,
    productVariantId: IDS.variant,
    quantity: 1,
    price: 1,
    unit_price: 1,
    line_total: 1,
    modifiers: []
  }]);
  const result = price(payload);
  assert.equal(result.ok, true);
  assert.equal(result.data.subtotal, 550);
  assert.equal(result.data.items[0].line_total, 550);
});

test("prices a deal from the selected published variant and exact component allowlist", () => {
  const result = price(request([{
    kind: "deal",
    dealId: IDS.deal,
    dealVariantId: IDS.dealVariant,
    quantity: 1,
    componentGroups: [
      {
        componentGroupId: IDS.componentGroup,
        components: [{
          componentOptionId: IDS.componentOption,
          productId: IDS.product,
          productVariantId: IDS.variant,
          modifiers: []
        }]
      },
      {
        componentGroupId: IDS.drinkComponentGroup,
        components: [{
          componentOptionId: IDS.drinkComponentOption,
          productId: IDS.drinkProduct,
          productVariantId: IDS.drinkVariant,
          modifiers: []
        }]
      }
    ]
  }]));

  assert.equal(result.ok, true);
  assert.equal(result.data.subtotal, 750);
  assert.equal(result.data.items[0].line_total, 750);
  assert.equal(result.data.items[0].components.length, 2);
  assert.equal(result.data.items[0].components[0].unit_price_snapshot, 0);
});

test("rejects deal components that are not the published option identity", () => {
  const result = price(request([{
    kind: "deal",
    dealId: IDS.deal,
    dealVariantId: IDS.dealVariant,
    quantity: 1,
    componentGroups: [
      {
        componentGroupId: IDS.componentGroup,
        components: [{
          componentOptionId: IDS.componentOption,
          productId: IDS.drinkProduct,
          productVariantId: IDS.drinkVariant,
          modifiers: []
        }]
      },
      {
        componentGroupId: IDS.drinkComponentGroup,
        components: [{
          componentOptionId: IDS.drinkComponentOption,
          productId: IDS.drinkProduct,
          productVariantId: IDS.drinkVariant,
          modifiers: []
        }]
      }
    ]
  }]));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "DEAL_COMPONENT_IDENTITY_MISMATCH");
});

test("rejects deal lines with missing required component groups", () => {
  const result = price(request([{
    kind: "deal",
    dealId: IDS.deal,
    dealVariantId: IDS.dealVariant,
    quantity: 1,
    componentGroups: [{
      componentGroupId: IDS.componentGroup,
      components: [{
        componentOptionId: IDS.componentOption,
        productId: IDS.product,
        productVariantId: IDS.variant,
        modifiers: []
      }]
    }]
  }]));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SELECTION_GROUP_BOUNDS");
});

test("rejects a product variant marked deal-only in the published menu", () => {
  const source = snapshot();
  source.productVariants[0].standaloneSellable = false;
  const result = price(request([{
    kind: "product",
    productId: IDS.product,
    productVariantId: IDS.variant,
    quantity: 1,
    modifiers: []
  }]), source);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PRODUCT_UNAVAILABLE");
});

test("rejects stale publications and branches that are not accepting the selected fulfilment", () => {
  const stale = request([{
    kind: "product", productId: IDS.product,
    productVariantId: IDS.variant, quantity: 1, modifiers: []
  }]);
  stale.versionId = "sha256:" + "b".repeat(64);
  assert.equal(price(stale).error.code, "CATALOG_PUBLICATION_CHANGED");

  const disabledSnapshot = snapshot();
  disabledSnapshot.branches[0].websiteDeliveryEnabled = false;
  assert.equal(price(request([{
    kind: "product", productId: IDS.product,
    productVariantId: IDS.variant, quantity: 1, modifiers: []
  }]), disabledSnapshot).error.code, "BRANCH_FULFILMENT_UNAVAILABLE");
});

test("trusted POS pricing accepts dine-in without a customer phone or website fulfilment flags", () => {
  const source = snapshot();
  source.branches[0].websiteOrderingEnabled = false;
  source.branches[0].websiteDeliveryEnabled = false;
  source.branches[0].websitePickupEnabled = false;
  const payload = request([{
    kind: "product",
    productId: IDS.product,
    productVariantId: IDS.variant,
    quantity: 1,
    modifiers: []
  }], {
    fulfilmentType: "dine_in",
    customer: { name: "Walk-in Customer" }
  });

  const websiteAttempt = price(payload, source);
  assert.equal(websiteAttempt.ok, false);
  assert.equal(websiteAttempt.error.code, "ORDER_REQUEST_INVALID");

  const posResult = price(payload, source, { staffPos: true });
  assert.equal(posResult.ok, true, JSON.stringify(posResult));
  assert.equal(posResult.data.fulfillment_type, "dine_in");
  assert.equal(posResult.data.customer_phone, null);
  assert.equal(posResult.data.subtotal, 550);
});

test("trusted POS pricing still uses published product and deal availability while ignoring website-only gates", () => {
  const source = snapshot();
  source.branches[0].websiteOrderingEnabled = false;
  source.branches[0].websiteDeliveryEnabled = false;
  source.branches[0].websitePickupEnabled = false;
  const productPayload = request([{
    kind: "product",
    productId: IDS.product,
    productVariantId: IDS.variant,
    quantity: 1,
    modifiers: []
  }], { fulfilmentType: "pickup" });

  const result = price(productPayload, source, { staffPos: true });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.fulfillment_type, "pickup");

  source.branchProductAvailability.push({
    branchId: IDS.branch, productId: IDS.product, isAvailable: false
  });
  const unavailable = price(productPayload, source, { staffPos: true });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.error.code, "PRODUCT_UNAVAILABLE");
});

test("rejects malformed quantities, missing DB time and oversized order lines", () => {
  const badQuantity = request([{
    kind: "product", productId: IDS.product,
    productVariantId: IDS.variant, quantity: 0, modifiers: []
  }]);
  assert.equal(price(badQuantity).error.code, "ORDER_ITEM_QUANTITY_INVALID");

  const noTime = calculateWebsiteOrder(snapshot(), request([{
    kind: "product", productId: IDS.product,
    productVariantId: IDS.variant, quantity: 1, modifiers: []
  }]), { contract, dealView, databaseNow: null });
  assert.equal(noTime.ok, false);
  assert.equal(noTime.error.code, "TRUSTED_TIME_REQUIRED");

  const tooMany = request(Array.from({ length: 101 }, () => ({
    kind: "product", productId: IDS.product,
    productVariantId: IDS.variant, quantity: 1, modifiers: []
  })));
  assert.equal(price(tooMany).error.code, "ORDER_ITEMS_INVALID");
});
