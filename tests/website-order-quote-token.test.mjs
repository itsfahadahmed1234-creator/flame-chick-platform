import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createWebsiteOrderQuoteToken,
  verifyWebsiteOrderQuoteToken,
  WEBSITE_ORDER_QUOTE_TTL_MS,
} from "../supabase/functions/_shared/website-order-quote-token.mjs";

const secret = "test-quote-signing-secret-with-at-least-32-bytes";
const issued = "2026-11-23T12:00:00.000Z";
const quoteId = "33333333-3333-4333-8333-333333333333";
const canonical = {
  branch_id: "11111111-1111-4111-8111-111111111111",
  fulfillment_type: "delivery",
  customer_name: "Test Customer",
  customer_phone: "03001234567",
  delivery: {
    address: "House 12, Sample Road",
    area_id: "22222222-2222-4222-8222-222222222222",
    delivery_fee: 180,
  },
  subtotal: 1250,
  total: 1430,
};

async function issue(overrides = {}) {
  return createWebsiteOrderQuoteToken({
    canonical,
    databaseNow: issued,
    secret,
    quoteId,
    ...overrides,
  });
}

test("signed quote token verifies only for the exact canonical order and database-time window", async () => {
  const created = await issue();
  assert.equal(created.ok, true);
  assert.equal(Date.parse(created.expiresAt) - Date.parse(issued), WEBSITE_ORDER_QUOTE_TTL_MS);

  const verified = await verifyWebsiteOrderQuoteToken({
    token: created.token,
    canonical,
    databaseNow: "2026-11-23T12:00:01.000Z",
    secret,
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.expiresAt, created.expiresAt);
});

test("quote token contains no raw customer or delivery details", async () => {
  const created = await issue();
  assert.equal(created.ok, true);
  assert.equal(created.token.includes("03001234567"), false);
  assert.equal(created.token.includes("Sample Road"), false);
  assert.equal(created.token.includes("Test Customer"), false);
});

test("quote token is rejected when prices, delivery fee, branch or order details change", async () => {
  const created = await issue();
  const changed = structuredClone(canonical);
  changed.delivery.delivery_fee = 250;
  const result = await verifyWebsiteOrderQuoteToken({
    token: created.token,
    canonical: changed,
    databaseNow: "2026-11-23T12:00:01.000Z",
    secret,
  });
  assert.deepEqual(result, { ok: false, code: "WEBSITE_ORDER_QUOTE_STALE" });
});

test("quote token expires at the exact database-time deadline", async () => {
  const created = await issue();
  const result = await verifyWebsiteOrderQuoteToken({
    token: created.token,
    canonical,
    databaseNow: created.expiresAt,
    secret,
  });
  assert.deepEqual(result, { ok: false, code: "WEBSITE_ORDER_QUOTE_EXPIRED" });
});

test("tampered signatures and missing quote tokens are rejected", async () => {
  const created = await issue();
  const [payload, signature] = created.token.split(".");
  const changedSignature = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
  const tampered = await verifyWebsiteOrderQuoteToken({
    token: payload + "." + changedSignature,
    canonical,
    databaseNow: "2026-11-23T12:00:01.000Z",
    secret,
  });
  assert.deepEqual(tampered, { ok: false, code: "WEBSITE_ORDER_QUOTE_TOKEN_INVALID" });

  const missing = await verifyWebsiteOrderQuoteToken({
    token: "",
    canonical,
    databaseNow: "2026-11-23T12:00:01.000Z",
    secret,
  });
  assert.deepEqual(missing, { ok: false, code: "WEBSITE_ORDER_QUOTE_REQUIRED" });
});

test("quote signing fails closed for missing secrets and invalid database time", async () => {
  const noSecret = await issue({ secret: "too-short" });
  assert.deepEqual(noSecret, { ok: false, code: "WEBSITE_ORDER_QUOTE_SIGNING_UNAVAILABLE" });

  const invalidTime = await issue({ databaseNow: "not-a-database-time" });
  assert.deepEqual(invalidTime, { ok: false, code: "WEBSITE_ORDER_QUOTE_TIME_INVALID" });
});
