Deno.test("Delivery API keeps browser preflight, Auth verification, database role checks, and fail-closed push", async () => {
  const envNames = ["SUPABASE_URL", "SUPABASE_SECRET_KEYS", "SUPABASE_PUBLISHABLE_KEYS"];
  const previous = new Map(envNames.map(name => [name, Deno.env.get(name)]));
  const originalFetch = globalThis.fetch;
  const baseUrl = "https://flame-chick-disposable.supabase.co";
  const publishableKey = "sb_publishable_test_key";
  const serviceKey = "server-only-test-service-key";
  const userId = "aa000000-0000-4000-8000-000000000001";
  const branchId = "bb000000-0000-4000-8000-000000000001";
  const restaurantId = "cc000000-0000-4000-8000-000000000001";
  const validToken = "synthetic-valid-user-token";
  const authTokens: string[] = [];
  const requestedPaths: string[] = [];

  try {
    Deno.env.set("SUPABASE_URL", baseUrl);
    Deno.env.set("SUPABASE_PUBLISHABLE_KEYS", JSON.stringify({ default: publishableKey }));
    Deno.env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ default: serviceKey }));
    const { handleDeliveryApiRequest } = await import("./index.ts");

    const options = await handleDeliveryApiRequest(new Request(baseUrl + "/functions/v1/flame-chick-delivery-api", {
      method: "OPTIONS",
      headers: {
        origin: "https://flamechickrider.pages.dev",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization,apikey,content-type",
      },
    }));
    if (options.status !== 200 || !options.headers.get("Access-Control-Allow-Origin")) {
      throw new Error("Browser CORS preflight must be answered without a user bearer token.");
    }

    const disabledPush = await handleDeliveryApiRequest(new Request(baseUrl + "/functions/v1/flame-chick-delivery-api", {
      method: "POST",
      headers: { "x-flame-chick-push-hook": "test-hook-token", "content-type": "application/json" },
      body: JSON.stringify({ offer_id: "00000000-0000-4000-8000-000000000001" }),
    }));
    const disabledPushBody = await disabledPush.json();
    if (disabledPush.status !== 503 || disabledPushBody?.error?.code !== "PUSH_NOT_CONFIGURED") {
      throw new Error("Disabled internal push hook did not keep its fail-closed behavior.");
    }

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = input instanceof Request ? input.url : String(input);
      const url = new URL(rawUrl);
      requestedPaths.push(url.pathname);

      if (url.pathname.endsWith("/auth/v1/user")) {
        const headers = new Headers(init?.headers);
        const token = (headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
        authTokens.push(token);
        if (token !== validToken) return new Response(JSON.stringify({ message: "Invalid user token" }), { status: 401 });
        return new Response(JSON.stringify({ id: userId }), { status: 200 });
      }
      if (url.pathname.endsWith("/rpc/flame_chick_get_staff_context")) {
        return new Response(JSON.stringify({
          restaurant_id: restaurantId,
          role_rows: [{ restaurant_id: restaurantId, role_key: "cashier", branch_id: branchId, is_active: true }],
          branches: [{ id: branchId, branch_code: "main", is_active: true }],
        }), { status: 200 });
      }
      if (url.pathname.endsWith("/rpc/flame_chick_expire_delivery_offers")) {
        return new Response(JSON.stringify({ ok: true, expired: 0 }), { status: 200 });
      }
      if (url.pathname.endsWith("/delivery_tasks") || url.pathname.endsWith("/rider_profiles")) {
        return new Response("[]", { status: 200 });
      }
      return new Response(JSON.stringify({ message: "Unexpected mocked request: " + url.pathname }), { status: 500 });
    }) as typeof fetch;

    const invalid = await handleDeliveryApiRequest(new Request(baseUrl + "/functions/v1/flame-chick-delivery-api?view=dispatch", {
      method: "GET",
      headers: { apikey: publishableKey, authorization: "Bearer invalid-token" },
    }));
    if (invalid.status !== 401) throw new Error("An invalid bearer token was accepted.");

    const dispatch = await handleDeliveryApiRequest(new Request(baseUrl + "/functions/v1/flame-chick-delivery-api?view=dispatch", {
      method: "GET",
      headers: { apikey: publishableKey, authorization: "Bearer " + validToken },
    }));
    const dispatchBody = await dispatch.json();
    if (dispatch.status !== 200 || dispatchBody?.ok !== true || dispatchBody?.view !== "dispatch") {
      throw new Error("A valid Auth user did not reach normal dispatch: " + JSON.stringify(dispatchBody));
    }
    if (authTokens.length !== 2 || authTokens[0] !== "invalid-token" || authTokens[1] !== validToken) {
      throw new Error("Delivery Auth verification no longer makes exactly one Auth /user request per protected request.");
    }
    if (!requestedPaths.some(p => p.endsWith("/rpc/flame_chick_get_staff_context")) ||
        !requestedPaths.some(p => p.endsWith("/rpc/flame_chick_expire_delivery_offers"))) {
      throw new Error("Database role/context or expiry checks were not preserved.");
    }
    console.log("Delivery API OPTIONS preflight, Auth user verification, database role context, and fail-closed push passed.");
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of envNames) {
      const value = previous.get(name);
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});
