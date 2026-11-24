import { createRequire } from "node:module";

Deno.env.set("SUPABASE_URL", "https://flame-chick-disposable.supabase.co");
Deno.env.set("SUPABASE_PUBLISHABLE_KEYS", JSON.stringify({ test: "fc-public-test-key" }));
Deno.env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ default: "fc-private-test-value" }));
Deno.env.set("FLAME_CHICK_WEBSITE_QUOTE_HMAC_SECRET", "local-test-quote-hmac-value-longer-than-32-bytes");
Deno.env.set("FLAME_CHICK_ORDER_PHONE_HMAC_SECRET", "local-test-phone-hmac-value-longer-than-32-bytes");

const require = createRequire(import.meta.url);
const fixture = require("../../../tests/fixtures/flame-chick-published-menu-v3-fixture.cjs");
const snapshot = fixture.createPublishedMenuSnapshot();
const branchId = snapshot.branches[0].branchId;
const restaurantId = snapshot.restaurantId;
const publicationId = snapshot.publicationId;
const publicationNumber = 2;
const snapshotSha256 = "c".repeat(64);
const publishedAt = "2026-11-23T10:27:36.307Z";
const areaId = "22000000-0000-4000-8000-000000000001";
const initialNow = "2026-11-24T01:00:00.000Z";
const standaloneVariant = snapshot.productVariants.find((row: any) => row.standaloneSellable === true);
if (!standaloneVariant) throw new Error("No standalone variant in disposable published-menu fixture.");
const productId = standaloneVariant.productId;
const variantId = standaloneVariant.variantId;

snapshot.publicationId = publicationId;
snapshot.publicationNumber = publicationNumber;
snapshot.draftRevision = 92;
snapshot.snapshotSha256 = snapshotSha256;
snapshot.versionId = "sha256:" + snapshotSha256;
snapshot.pricingEngineVersion = "flame-chick-pricing-v1";

const savedOrders = new Map<string, { hash: string; order: Record<string, unknown> }>();
let databaseNow = initialNow;
let deliveryFee = 50;
let commitCount = 0;
let orderSequence = 0;
const originalFetch = globalThis.fetch;

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const rawUrl = input instanceof Request ? input.url : String(input);
  const url = new URL(rawUrl);
  const method = (init?.method || "GET").toUpperCase();
  const pathName = url.pathname;

  if (pathName.endsWith("/rpc/flame_chick_catalog_public_read") && method === "POST") {
    return json({
      published: true, snapshot, publicationId, publicationNumber, schemaVersion: 3,
      snapshotSha256, draftRevision: 92, pricingEngineVersion: "flame-chick-pricing-v1",
      publishedAt, databaseNow
    });
  }
  if (pathName.endsWith("/restaurants")) {
    return json([{ id: restaurantId, currency_code: "PKR", timezone: "Asia/Karachi" }]);
  }
  if (pathName.endsWith("/branches")) {
    return json([{
      id: branchId, branch_code: "main", name: "Main Branch", is_active: true,
      website_ordering_enabled: true, website_delivery_enabled: true, website_pickup_enabled: true
    }]);
  }
  if (pathName.endsWith("/delivery_areas")) {
    return json([{ id: areaId, name: "Synthetic Area", name_ur: null, delivery_fee: deliveryFee, sort_order: 1 }]);
  }
  if (pathName.endsWith("/branch_delivery_settings")) {
    return json([{ not_listed_delivery_fee: null }]);
  }

  if (pathName.endsWith("/rpc/flame_chick_get_website_order_by_idempotency") && method === "POST") {
    const payload = JSON.parse(String(init?.body || "{}")).p_payload;
    const key = payload.branch_id + ":" + payload.idempotency_key;
    const saved = savedOrders.get(key);
    if (!saved) return json({ ok: true, found: false });
    if (saved.hash !== payload.request_hash) {
      return json({ ok: false, error: { code: "WEBSITE_ORDER_IDEMPOTENCY_CONFLICT", message: "Request identifier conflict." } });
    }
    return json({ ok: true, found: true, already_processed: true, ...saved.order });
  }

  if (pathName.endsWith("/rpc/flame_chick_create_website_order") && method === "POST") {
    commitCount += 1;
    const payload = JSON.parse(String(init?.body || "{}")).p_payload;
    const key = payload.branch_id + ":" + payload.idempotency_key;
    const saved = savedOrders.get(key);
    if (saved) return json({ ok: true, already_processed: true, ...saved.order });
    orderSequence += 1;
    const order = {
      ok: true, already_processed: false,
      order_id: "99000000-0000-4000-8000-" + String(orderSequence).padStart(12, "0"),
      order_number: "FC-261124-" + String(orderSequence).padStart(4, "0"),
      status: "new", payment_status: "unpaid", fulfillment_type: payload.fulfillment_type,
      subtotal: payload.subtotal, delivery_fee: payload.delivery_fee, total: payload.total,
      currency_code: payload.currency_code, created_at: databaseNow
    };
    if (!/^[0-9a-f]{64}$/.test(String(payload.phone_digest))) return json({ ok: false, error: { code: "TEST_PHONE_DIGEST_INVALID" } }, 400);
    if (Number(order.total) !== Number(order.subtotal) + Number(order.delivery_fee)) return json({ ok: false, error: { code: "TEST_TOTAL_MISMATCH" } }, 400);
    savedOrders.set(key, { hash: String(payload.request_hash), order });
    return json(order);
  }

  return json({ message: "Unexpected disposable request: " + method + " " + pathName }, 500);
}) as typeof fetch;

const { handleOrderApiRequest } = await import("./index.ts");
const headers = { apikey: "fc-public-test-key", "Content-Type": "application/json" };

function quoteBody(requestId: string) {
  return {
    action: "quote_website_order", schema_version: 3,
    publication_id: publicationId, version_id: "sha256:" + snapshotSha256, branch_id: branchId,
    fulfillment_type: "delivery",
    customer: { name: "Synthetic QA Customer", phone: "03001234567", email: null },
    notes: null,
    delivery: { selection_type: "listed_area", area_id: areaId, address: "House 12, Synthetic QA Road", instructions: null },
    items: [{ kind: "product", productId, productVariantId: variantId, quantity: 1, modifiers: [] }],
    request_id: requestId
  };
}

async function invoke(body: Record<string, unknown>) {
  const request = new Request("https://flame-chick-disposable.supabase.co/functions/v1/flame-chick-order-api", {
    method: "POST", headers, body: JSON.stringify(body)
  });
  const response = await handleOrderApiRequest(request);
  return { status: response.status, body: await response.json() as Record<string, any> };
}

Deno.test("actual Website Order API issues, validates and replays signed quotes", async () => {
  try {
    const staleId = "a1000000-0000-4000-8000-000000000001";
    const issued = await invoke(quoteBody(staleId));
    if (issued.status !== 200 || issued.body.ok !== true) throw new Error("Quote failed: " + JSON.stringify(issued));
    if (issued.body.quote.total !== issued.body.quote.subtotal + 50) throw new Error("Quote omitted current delivery fee.");
    if (issued.body.quote_token.includes("03001234567") || issued.body.quote_token.includes("Synthetic QA Road")) {
      throw new Error("Signed quote leaked customer or address data.");
    }

    deliveryFee = 75;
    const changedFee = await invoke({ ...quoteBody(staleId), action: "create_website_order", quote_token: issued.body.quote_token });
    if (changedFee.status !== 409 || changedFee.body.error?.code !== "WEBSITE_ORDER_QUOTE_STALE" || commitCount !== 0) {
      throw new Error("Changed delivery fee was not rejected: " + JSON.stringify(changedFee));
    }
    deliveryFee = 50;

    const tamperId = "a1000000-0000-4000-8000-000000000002";
    const tamperQuote = await invoke(quoteBody(tamperId));
    const parts = String(tamperQuote.body.quote_token).split(".");
    const changedSignature = (parts[1][0] === "A" ? "B" : "A") + parts[1].slice(1);
    const tampered = await invoke({ ...quoteBody(tamperId), action: "create_website_order", quote_token: parts[0] + "." + changedSignature });
    if (tampered.status !== 409 || tampered.body.error?.code !== "WEBSITE_ORDER_QUOTE_TOKEN_INVALID" || commitCount !== 0) {
      throw new Error("Tampered quote was not rejected: " + JSON.stringify(tampered));
    }

    const expiryId = "a1000000-0000-4000-8000-000000000003";
    const expiryQuote = await invoke(quoteBody(expiryId));
    databaseNow = expiryQuote.body.quote_expires_at;
    const expired = await invoke({ ...quoteBody(expiryId), action: "create_website_order", quote_token: expiryQuote.body.quote_token });
    if (expired.status !== 409 || expired.body.error?.code !== "WEBSITE_ORDER_QUOTE_EXPIRED" || commitCount !== 0) {
      throw new Error("Expired quote was not rejected at the deadline: " + JSON.stringify(expired));
    }

    databaseNow = initialNow;
    const successId = "a1000000-0000-4000-8000-000000000004";
    const successQuote = await invoke(quoteBody(successId));
    const createBody = { ...quoteBody(successId), action: "create_website_order", quote_token: successQuote.body.quote_token };
    const created = await invoke(createBody);
    if (created.status !== 201 || created.body.ok !== true || !created.body.order_id || !created.body.order_number || commitCount !== 1) {
      throw new Error("Valid quote did not commit: " + JSON.stringify(created));
    }

    databaseNow = successQuote.body.quote_expires_at;
    const replay = await invoke(createBody);
    if (replay.status !== 200 || replay.body.already_processed !== true || replay.body.order_id !== created.body.order_id || commitCount !== 1) {
      throw new Error("Retry did not return the original order: " + JSON.stringify(replay));
    }

    const conflict = await invoke({
      ...createBody,
      customer: { name: "Another Customer", phone: "03001234567", email: null }
    });
    if (conflict.status !== 409 || conflict.body.error?.code !== "WEBSITE_ORDER_IDEMPOTENCY_CONFLICT" || commitCount !== 1) {
      throw new Error("Changed facts under a reused request ID were not rejected.");
    }
    console.log("Website Order API route integration: quote, stale-fee/tamper/expiry rejection, commit and idempotent replay passed.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
