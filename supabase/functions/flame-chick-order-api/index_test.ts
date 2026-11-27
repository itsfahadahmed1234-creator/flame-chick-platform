import { createRequire } from "node:module";

Deno.env.set("SUPABASE_URL", "https://flame-chick-disposable.supabase.co");
Deno.env.set("SUPABASE_PUBLISHABLE_KEYS", JSON.stringify({ test: "fc-public-test-key" }));
Deno.env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ default: "fc-private-test-value" }));
Deno.env.set("FLAME_CHICK_WEBSITE_QUOTE_HMAC_SECRET", "local-test-quote-hmac-value-longer-than-32-bytes");

const require = createRequire(import.meta.url);
const fixture = require("../../../tests/fixtures/flame-chick-published-menu-v3-fixture.cjs");
const burgerFixture = require("../../../tests/fixtures/catalog-v3-fixture.cjs");
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
function readCommitCount(): number { return commitCount; }
const originalFetch = globalThis.fetch;

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const rawUrl = input instanceof Request ? input.url : String(input);
  const url = new URL(rawUrl);
  const method = (init?.method || "GET").toUpperCase();
  const pathName = url.pathname;

  if (pathName.endsWith("/auth/v1/user") && method === "GET") {
    const authorization = new Headers(init?.headers).get("authorization");
    return authorization === "Bearer synthetic-staff-token"
      ? json({id:"aa000000-0000-4000-8000-000000000001"})
      : json({message:"Unauthorized"},401);
  }
  if (pathName.endsWith("/rpc/flame_chick_get_staff_role_rows") && method === "POST") {
    return json([{
      restaurant_id:restaurantId,role_key:"cashier",branch_id:branchId,is_active:true
    }]);
  }
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

  if (pathName.endsWith("/rpc/flame_chick_sync_pos_order") && method === "POST") {
    const payload = JSON.parse(String(init?.body || "{}")).p_payload;
    if (payload.source !== "pos" || payload.actor_user_id !== "aa000000-0000-4000-8000-000000000001" ||
        payload.branch_id !== branchId || payload.fulfillment_type !== "pickup" ||
        payload.payment_method_summary !== null || payload.total !== payload.subtotal ||
        !/^[0-9a-f]{64}$/.test(String(payload.request_hash))) {
      return json({message:"POS canonical payload invalid"},400);
    }
    commitCount += 1;
    return json({
      ok:true,already_processed:false,order_id:"99000000-0000-4000-8000-000000000099",
      order_number:"FC-261124-0099",local_order_id:payload.local_order_id,
      local_revision:payload.local_revision,status:"new",payment_status:"unpaid",
      fulfillment_type:"pickup",subtotal:payload.subtotal,delivery_fee:0,total:payload.total,
      paid_amount:0,balance_due:payload.total,currency_code:"PKR",created_at:databaseNow
    });
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

Deno.test("Website Order API validates legacy quotes and commits single-request checkout idempotently", async () => {
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
    if (changedFee.status !== 409 || changedFee.body.error?.code !== "WEBSITE_ORDER_QUOTE_STALE" || readCommitCount() !== 0) {
      throw new Error("Changed delivery fee was not rejected: " + JSON.stringify(changedFee));
    }
    deliveryFee = 50;

    const tamperId = "a1000000-0000-4000-8000-000000000002";
    const tamperQuote = await invoke(quoteBody(tamperId));
    const parts = String(tamperQuote.body.quote_token).split(".");
    const changedSignature = (parts[1][0] === "A" ? "B" : "A") + parts[1].slice(1);
    const tampered = await invoke({ ...quoteBody(tamperId), action: "create_website_order", quote_token: parts[0] + "." + changedSignature });
    if (tampered.status !== 409 || tampered.body.error?.code !== "WEBSITE_ORDER_QUOTE_TOKEN_INVALID" || readCommitCount() !== 0) {
      throw new Error("Tampered quote was not rejected: " + JSON.stringify(tampered));
    }

    const expiryId = "a1000000-0000-4000-8000-000000000003";
    const expiryQuote = await invoke(quoteBody(expiryId));
    databaseNow = expiryQuote.body.quote_expires_at;
    const expired = await invoke({ ...quoteBody(expiryId), action: "create_website_order", quote_token: expiryQuote.body.quote_token });
    if (expired.status !== 409 || expired.body.error?.code !== "WEBSITE_ORDER_QUOTE_EXPIRED" || readCommitCount() !== 0) {
      throw new Error("Expired quote was not rejected at the deadline: " + JSON.stringify(expired));
    }

    databaseNow = initialNow;
    const successId = "a1000000-0000-4000-8000-000000000004";
    const successQuote = await invoke(quoteBody(successId));
    const createBody = { ...quoteBody(successId), action: "create_website_order", quote_token: successQuote.body.quote_token };
    const created = await invoke(createBody);
    if (created.status !== 201 || created.body.ok !== true || !created.body.order_id || !created.body.order_number || readCommitCount() !== 1) {
      throw new Error("Valid quote did not commit: " + JSON.stringify(created));
    }

    databaseNow = successQuote.body.quote_expires_at;
    const replay = await invoke(createBody);
    if (replay.status !== 200 || replay.body.already_processed !== true || replay.body.order_id !== created.body.order_id || readCommitCount() !== 1) {
      throw new Error("Retry did not return the original order: " + JSON.stringify(replay));
    }

    const conflict = await invoke({
      ...createBody,
      customer: { name: "Another Customer", phone: "03001234567", email: null }
    });
    if (conflict.status !== 409 || conflict.body.error?.code !== "WEBSITE_ORDER_IDEMPOTENCY_CONFLICT" || readCommitCount() !== 1) {
      throw new Error("Changed facts under a reused request ID were not rejected.");
    }
    const oneStepId = "a1000000-0000-4000-8000-000000000005";
    const oneStepBody = { ...quoteBody(oneStepId), action: "place_website_order" };
    const oneStepCreated = await invoke(oneStepBody);
    if (oneStepCreated.status !== 201 || oneStepCreated.body.ok !== true ||
        oneStepCreated.body.payment_status !== "unpaid" || oneStepCreated.body.fulfillment_type !== "delivery" ||
        !oneStepCreated.body.order_id || readCommitCount() !== 2) {
      throw new Error("Single-request Website checkout did not commit one unpaid order: " + JSON.stringify(oneStepCreated));
    }
    const oneStepReplay = await invoke(oneStepBody);
    if (oneStepReplay.status !== 200 || oneStepReplay.body.already_processed !== true ||
        oneStepReplay.body.order_id !== oneStepCreated.body.order_id || readCommitCount() !== 2) {
      throw new Error("Single-request checkout retry created a duplicate or failed to return the original order.");
    }

    console.log("Website Order API route integration: quote, stale-fee/tamper/expiry rejection, commit and idempotent replay passed.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("authenticated POS sync prices from V3, derives trusted identity and fingerprints changed revisions", async () => {
  const posSyncPayloads: Record<string, any>[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl);
    const pathName = url.pathname;
    if (pathName.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({id:"aa000000-0000-4000-8000-000000000001"}),{status:200});
    }
    if (pathName.endsWith("/rpc/flame_chick_get_staff_role_rows")) {
      return new Response(JSON.stringify([{restaurant_id:restaurantId,role_key:"cashier",branch_id:branchId,is_active:true}]),{status:200});
    }
    if (pathName.endsWith("/rpc/flame_chick_catalog_public_read")) {
      return new Response(JSON.stringify({
        published:true,snapshot,publicationId,publicationNumber,schemaVersion:3,
        snapshotSha256,draftRevision:92,pricingEngineVersion:"flame-chick-pricing-v1",
        publishedAt,databaseNow
      }),{status:200});
    }
    if (pathName.endsWith("/restaurants")) {
      return new Response(JSON.stringify([{id:restaurantId,currency_code:"PKR",timezone:"Asia/Karachi"}]),{status:200});
    }
    if (pathName.endsWith("/branches")) {
      return new Response(JSON.stringify([{id:branchId,branch_code:"main",name:"Main Branch",is_active:true}]),{status:200});
    }
    if (pathName.endsWith("/rpc/flame_chick_sync_pos_order")) {
      const payload = JSON.parse(String(init?.body || "{}")).p_payload;
      posSyncPayloads.push(payload);
      if (payload.source!=="pos" || payload.actor_user_id!=="aa000000-0000-4000-8000-000000000001" ||
          payload.branch_id!==branchId || payload.fulfillment_type!=="pickup" ||
          payload.payment_method_summary!==null || payload.total!==payload.subtotal ||
          !/^[0-9a-f]{64}$/.test(String(payload.request_hash))) {
        return new Response(JSON.stringify({message:"POS canonical payload invalid"}),{status:400});
      }
      return new Response(JSON.stringify({
        ok:true,already_processed:false,order_id:"99000000-0000-4000-8000-000000000099",
        order_number:"FC-261124-0099",local_order_id:payload.local_order_id,
        local_revision:payload.local_revision,status:"new",payment_status:"unpaid",
        fulfillment_type:"pickup",subtotal:payload.subtotal,delivery_fee:0,total:payload.total,
        paid_amount:0,balance_due:payload.total,currency_code:"PKR",created_at:databaseNow
      }),{status:200});
    }
    return new Response(JSON.stringify({message:"Unexpected synthetic request: "+pathName}),{status:500});
  }) as typeof fetch;
  try {
    const localOrderId = "bb000000-0000-4000-8000-000000000001";
    const body = {
      action:"sync_pos_order",
      local_order_id:localOrderId,
      local_revision:1,
      publication_id:publicationId,
      version_id:"sha256:"+snapshotSha256,
      fulfillment_type:"pickup",
      customer:{name:"Walk-in Customer",phone:""},
      items:[{
        kind:"product",productId,productVariantId:variantId,quantity:1,modifiers:[],
        price:0.01,line_total:0.01
      }],
      subtotal:0.01,total:0.01,branch_id:"aa000000-0000-4000-8000-000000000099",
      actor_user_id:"aa000000-0000-4000-8000-000000000098"
    };
    async function invokePos(requestBody: Record<string, unknown>) {
      const request = new Request("https://flame-chick-disposable.supabase.co/functions/v1/flame-chick-order-api",{
        method:"POST",
        headers:{...headers,authorization:"Bearer synthetic-staff-token"},
        body:JSON.stringify(requestBody)
      });
      const response = await handleOrderApiRequest(request);
      return {status:response.status,body:await response.json() as Record<string,any>};
    }
    const first = await invokePos(body);
    if (first.status!==201 || first.body.ok!==true ||
        first.body.order_id!=="99000000-0000-4000-8000-000000000099" ||
        first.body.presentation.subtotal!==Number(standaloneVariant.price) ||
        first.body.total!==Number(standaloneVariant.price)) {
      throw new Error("Authenticated V3 POS sync failed or trusted browser totals: "+JSON.stringify(first));
    }

    const exactRetry = await invokePos(body);
    if (exactRetry.status!==201 || exactRetry.body.ok!==true || Array.from(posSyncPayloads).length!==2 ||
        posSyncPayloads[0].request_hash!==posSyncPayloads[1].request_hash) {
      throw new Error("An identical POS retry did not produce the same canonical request fingerprint.");
    }

    const changedSameRevision = await invokePos({...body,notes:"changed payload at the same local revision"});
    if (changedSameRevision.status!==201 || changedSameRevision.body.ok!==true || Array.from(posSyncPayloads).length!==3 ||
        posSyncPayloads[2].local_order_id!==posSyncPayloads[0].local_order_id ||
        posSyncPayloads[2].local_revision!==posSyncPayloads[0].local_revision ||
        posSyncPayloads[2].request_hash===posSyncPayloads[0].request_hash) {
      throw new Error("A changed POS payload at the same revision did not receive a different canonical fingerprint.");
    }

    console.log("Authenticated POS sync: staff auth, trusted branch, V3 price, exact-retry fingerprint stability and changed-payload fingerprint conflict passed.");
  } finally {
    globalThis.fetch=originalFetch;
  }
});


Deno.test("authenticated POS Delivery sync accepts category-driven Chicken Burger variant IDs", async () => {
  const ids = burgerFixture.IDS;
  const source = burgerFixture.createCategoryBurgerSnapshot({
    quantity: 3,
    allowRepeat: true,
    maxPerChoice: 3
  });
  source.restaurantId = restaurantId;
  source.branches = source.branches.map((row: any) => ({ ...row, branchId }));
  source.publicationId = publicationId;
  source.publicationNumber = publicationNumber;
  source.versionId = "sha256:" + snapshotSha256;
  source.databaseNow = initialNow;

  const burgerGroupId = ids.componentGroup;
  const drinkGroupId = ids.drinkComponentGroup;
  const dealId = ids.deal;
  const dealVariantId = ids.dealVariant;
  const areaIdForTest = "22000000-0000-4000-8000-000000000001";
  const posSyncPayloads: Record<string, any>[] = [];
  const requests = [
    {
      local_order_id: "bb000000-0000-4000-8000-000000000101",
      components: [
        { component_option_id: ids.ogCrunchVariant, product_id: ids.ogCrunchProduct, product_variant_id: ids.ogCrunchVariant, modifiers: [] },
        { component_option_id: ids.injectorVariant, product_id: ids.injectorProduct, product_variant_id: ids.injectorVariant, modifiers: [] },
        { component_option_id: ids.nashvilleFireVariant, product_id: ids.nashvilleFireProduct, product_variant_id: ids.nashvilleFireVariant, modifiers: [] }
      ]
    },
    {
      local_order_id: "bb000000-0000-4000-8000-000000000102",
      // POS sync expands a repeated selection into one component record per burger.
      components: Array.from({ length: 3 }, () => ({
        component_option_id: ids.injectorVariant,
        product_id: ids.injectorProduct,
        product_variant_id: ids.injectorVariant,
        modifiers: []
      }))
    }
  ];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl);
    const pathName = url.pathname;
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();

    if (pathName.endsWith("/auth/v1/user") && method === "GET") {
      return json({ id: "aa000000-0000-4000-8000-000000000001" });
    }
    if (pathName.endsWith("/rpc/flame_chick_get_staff_role_rows")) {
      return json([{ restaurant_id: restaurantId, role_key: "cashier", branch_id: branchId, is_active: true }]);
    }
    if (pathName.endsWith("/rpc/flame_chick_catalog_public_read")) {
      return json({
        published: true, snapshot: source, publicationId, publicationNumber, schemaVersion: 3,
        snapshotSha256, draftRevision: 92, pricingEngineVersion: "flame-chick-pricing-v1",
        publishedAt, databaseNow: initialNow
      });
    }
    if (pathName.endsWith("/restaurants")) {
      return json([{ id: restaurantId, currency_code: "PKR", timezone: "Asia/Karachi" }]);
    }
    if (pathName.endsWith("/branches")) {
      return json([{ id: branchId, branch_code: "main", name: "Main Branch", is_active: true }]);
    }
    if (pathName.endsWith("/delivery_areas")) {
      return json([{ id: areaIdForTest, name: "Synthetic Area", name_ur: null, delivery_fee: 50, sort_order: 1 }]);
    }
    if (pathName.endsWith("/branch_delivery_settings")) {
      return json([{ not_listed_delivery_fee: null }]);
    }
    if (pathName.endsWith("/rpc/flame_chick_sync_pos_order")) {
      const payload = JSON.parse(String(init?.body || "{}")).p_payload;
      posSyncPayloads.push(payload);
      return json({
        ok: true, already_processed: false,
        order_id: "99000000-0000-4000-8000-000000000099",
        order_number: "FC-261125-0099",
        local_order_id: payload.local_order_id,
        local_revision: payload.local_revision,
        status: "new", payment_status: "unpaid", fulfillment_type: "delivery",
        subtotal: payload.subtotal, delivery_fee: payload.delivery_fee, total: payload.total,
        paid_amount: 0, balance_due: payload.total, currency_code: "PKR", created_at: initialNow
      });
    }
    return json({ message: "Unexpected synthetic POS category-burger request: " + method + " " + pathName }, 500);
  }) as typeof fetch;

  try {
    for (const [index, item] of requests.entries()) {
      const body = {
        action: "sync_pos_order",
        local_order_id: item.local_order_id,
        local_revision: 1,
        publication_id: publicationId,
        version_id: "sha256:" + snapshotSha256,
        fulfillment_type: "delivery",
        customer: { name: "Synthetic POS Delivery", phone: "03001234567" },
        delivery: {
          selection_type: "listed_area",
          area_id: areaIdForTest,
          address: "House 12, Synthetic QA Road",
          instructions: "Ring bell"
        },
        items: [{
          kind: "deal",
          deal_id: dealId,
          deal_variant_id: dealVariantId,
          quantity: 1,
          component_groups: [
            { component_group_id: burgerGroupId, components: item.components },
            {
              component_group_id: drinkGroupId,
              components: [{
                component_option_id: ids.drinkComponentOption,
                product_id: ids.drinkProduct,
                product_variant_id: ids.drinkVariant,
                modifiers: []
              }]
            }
          ]
        }]
      };
      const request = new Request("https://flame-chick-disposable.supabase.co/functions/v1/flame-chick-order-api", {
        method: "POST",
        headers: { ...headers, authorization: "Bearer synthetic-staff-token" },
        body: JSON.stringify(body)
      });
      const response = await handleOrderApiRequest(request);
      const result = await response.json() as Record<string, any>;
      if (response.status !== 201 || result.ok !== true || result.local_order_id !== item.local_order_id) {
        throw new Error("Category-driven POS Delivery sync " + index + " failed: " + JSON.stringify(result));
      }
      const expectedBase = Number(source.dealVariants.find((row: any) => row.dealVariantId === dealVariantId)?.basePrice);
      if (Number(result.subtotal) !== expectedBase || Number(result.delivery_fee) !== 50 ||
          Number(result.total) !== expectedBase + 50) {
        throw new Error("Category-driven Burger selection changed the fixed deal price or delivery fee: " + JSON.stringify(result));
      }
      const canonicalDeal = posSyncPayloads[index]?.items?.[0];
      const normalizedBurger = canonicalDeal?.components?.filter((row: any) => row.deal_component_id === burgerGroupId) || [];
      if (normalizedBurger.length !== 3 || normalizedBurger.some((row: any) => Number(row.unit_price_snapshot) !== 0)) {
        throw new Error("The canonical POS order did not retain three INCLUDED zero-surcharge Burger components.");
      }
    }
    console.log("Authenticated POS Delivery sync: dynamic Chicken Burgers allowlist, distinct/repeated selections, fixed deal price and delivery handoff passed.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
