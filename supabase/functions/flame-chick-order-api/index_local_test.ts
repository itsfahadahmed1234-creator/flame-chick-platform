import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fixture = require("../../../tests/fixtures/catalog-v3-fixture.cjs");
const { IDS } = fixture;

const apiUrl = Deno.env.get("SUPABASE_URL") ?? "";
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const publishableKey = String(Object.values(publishableKeys)[0] ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "");
const serviceKey = String(secretKeys.default ?? Object.values(secretKeys)[0] ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
const databaseUrl = Deno.env.get("DB_URL") ?? "";
const areaId = "17000000-0000-4000-8000-000000000001";

if (!apiUrl || !publishableKey || !serviceKey || !databaseUrl) {
  throw new Error("Local Supabase API URL, publishable key, service-role key and DB_URL are required.");
}
if ((Deno.env.get("FLAME_CHICK_WEBSITE_QUOTE_HMAC_SECRET") ?? "").length < 32 ||
    (Deno.env.get("FLAME_CHICK_ORDER_PHONE_HMAC_SECRET") ?? "").length < 32) {
  throw new Error("Local test HMAC secrets are not configured.");
}

const { handleOrderApiRequest } = await import("./index.ts");

async function updateDeliveryFee(fee: number): Promise<void> {
  const sql = `UPDATE public.delivery_areas
    SET delivery_fee = ${fee}
    WHERE id = '${areaId}'::uuid
      AND restaurant_id = '${fixture.createSnapshot().restaurantId}'::uuid
    RETURNING id`;
  const output = await new Deno.Command("psql", {
    args: [databaseUrl, "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--command", sql],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const stdout = new TextDecoder().decode(output.stdout).trim();
  const stderr = new TextDecoder().decode(output.stderr).trim();
  if (!output.success || stdout !== areaId) {
    throw new Error("Could not update disposable delivery fee through local Postgres. " + stderr + " " + stdout);
  }
}

async function invoke(body: Record<string, unknown>) {
  const request = new Request(new URL("/functions/v1/flame-chick-order-api", apiUrl), {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const response = await handleOrderApiRequest(request);
  return {
    status: response.status,
    body: await response.json() as Record<string, any>,
  };
}

async function readCurrentPublication() {
  const response = await fetch(new URL("/rest/v1/rpc/flame_chick_catalog_public_read", apiUrl), {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ p_restaurant_slug: "flame-chick" }),
    cache: "no-store",
  });
  const body = await response.json() as Record<string, any>;
  if (!response.ok || body.published !== true || !body.snapshotSha256 || !body.databaseNow) {
    throw new Error("The actual local catalog read RPC failed: " + JSON.stringify(body));
  }
  return body;
}

function buildQuoteRequest(snapshotSha256: string) {
  return {
    action: "quote_website_order",
    schema_version: 3,
    publication_id: fixture.createSnapshot().publicationId,
    version_id: "sha256:" + snapshotSha256,
    branch_id: IDS.branch,
    fulfillment_type: "delivery",
    customer: {
      name: "Synthetic Local Route Customer",
      phone: "03001234567",
      email: null,
    },
    notes: null,
    delivery: {
      selection_type: "listed_area",
      area_id: areaId,
      address: "House 12, Synthetic QA Road, Karachi",
      instructions: null,
    },
    items: [{
      kind: "product",
      productId: IDS.product,
      productVariantId: IDS.variant,
      quantity: 1,
      modifiers: [],
    }],
  };
}

Deno.test("actual Website Order API commits to disposable local Postgres and safely replays", async () => {
  let deliveryFeeChanged = false;
  try {
    const publication = await readCurrentPublication();
    if (publication.publicationId !== fixture.createSnapshot().publicationId ||
        publication.publicationNumber !== 2) {
      throw new Error("Local fixture publication metadata does not match the expected publication.");
    }

    // Issue a quote at the DB-configured fee, then change the actual database row.
    // The Order API must reload the real area fee and reject the old signed quote.
    const staleRequestId = "a1000000-0000-4000-8000-000000000051";
    const staleQuote = await invoke(buildQuoteRequest(publication.snapshotSha256));
    if (staleQuote.status !== 200 || staleQuote.body.ok !== true ||
        staleQuote.body.quote.total !== staleQuote.body.quote.subtotal + 50) {
      throw new Error("The actual local quote route did not return the current configured fee: " + JSON.stringify(staleQuote));
    }

    await updateDeliveryFee(75);
    deliveryFeeChanged = true;
    const staleFeeResult = await invoke({
      ...buildQuoteRequest(publication.snapshotSha256),
      action: "create_website_order",
      request_id: staleRequestId,
      quote_token: staleQuote.body.quote_token,
    });
    if (staleFeeResult.status !== 409 ||
        staleFeeResult.body.error?.code !== "WEBSITE_ORDER_QUOTE_STALE") {
      throw new Error("The actual local route accepted a quote after the database delivery fee changed: " + JSON.stringify(staleFeeResult));
    }
    await updateDeliveryFee(50);
    deliveryFeeChanged = false;

    const tamperRequestId = "a1000000-0000-4000-8000-000000000052";
    const tamperQuote = await invoke(buildQuoteRequest(publication.snapshotSha256));
    if (tamperQuote.status !== 200 || tamperQuote.body.ok !== true) {
      throw new Error("Could not issue a quote for tamper test: " + JSON.stringify(tamperQuote));
    }
    const tokenParts = String(tamperQuote.body.quote_token).split(".");
    const badSignature = (tokenParts[1][0] === "A" ? "B" : "A") + tokenParts[1].slice(1);
    const tampered = await invoke({
      ...buildQuoteRequest(publication.snapshotSha256),
      action: "create_website_order",
      request_id: tamperRequestId,
      quote_token: tokenParts[0] + "." + badSignature,
    });
    if (tampered.status !== 409 ||
        tampered.body.error?.code !== "WEBSITE_ORDER_QUOTE_TOKEN_INVALID") {
      throw new Error("The actual local route accepted a tampered signed quote: " + JSON.stringify(tampered));
    }

    const requestId = "a1000000-0000-4000-8000-000000000053";
    const quote = await invoke(buildQuoteRequest(publication.snapshotSha256));
    if (quote.status !== 200 || quote.body.ok !== true ||
        quote.body.quote.total !== quote.body.quote.subtotal + 50 ||
        typeof quote.body.quote_token !== "string") {
      throw new Error("The actual local quote route failed: " + JSON.stringify(quote));
    }

    const createBody = {
      ...buildQuoteRequest(publication.snapshotSha256),
      action: "create_website_order",
      request_id: requestId,
      quote_token: quote.body.quote_token,
    };
    const created = await invoke(createBody);
    if (created.status !== 201 || created.body.ok !== true ||
        typeof created.body.order_id !== "string" ||
        typeof created.body.order_number !== "string" ||
        created.body.status !== "new" ||
        created.body.payment_status !== "unpaid" ||
        created.body.total !== created.body.subtotal + created.body.delivery_fee ||
        created.body.delivery_fee !== 50) {
      throw new Error("The actual local Postgres order commit failed: " + JSON.stringify(created));
    }

    const replay = await invoke(createBody);
    if (replay.status !== 200 || replay.body.ok !== true ||
        replay.body.already_processed !== true ||
        replay.body.order_id !== created.body.order_id) {
      throw new Error("The actual local Postgres idempotent replay failed: " + JSON.stringify(replay));
    }

    const conflict = await invoke({
      ...createBody,
      customer: { name: "Altered QA Customer", phone: "03001234567", email: null },
    });
    if (conflict.status !== 409 ||
        conflict.body.error?.code !== "WEBSITE_ORDER_IDEMPOTENCY_CONFLICT") {
      throw new Error("The actual local Postgres idempotency conflict was not rejected: " + JSON.stringify(conflict));
    }

    console.log("Real local Order API → PostgREST → PostgreSQL: stale fee, tamper, commit, replay and conflict checks passed.");
  } finally {
    if (deliveryFeeChanged) await updateDeliveryFee(50);
  }
});
