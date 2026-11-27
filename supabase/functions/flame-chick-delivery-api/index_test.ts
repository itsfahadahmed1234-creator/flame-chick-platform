Deno.test("Delivery API trusts gateway-verified JWT subjects and avoids Auth /user round-trips", async () => {
  const envNames = ["SUPABASE_URL", "SUPABASE_SECRET_KEYS", "SUPABASE_PUBLISHABLE_KEYS"];
  const previous = new Map(envNames.map(name => [name, Deno.env.get(name)]));
  const originalFetch = globalThis.fetch;
  const baseUrl = "https://flame-chick-disposable.supabase.co";
  const publishableKey = "sb_publishable_test_key";
  const serviceKey = "server-only-test-service-key";
  const userId = "aa000000-0000-4000-8000-000000000001";
  const branchId = "bb000000-0000-4000-8000-000000000001";
  const restaurantId = "cc000000-0000-4000-8000-000000000001";

  try {
    Deno.env.set("SUPABASE_URL", baseUrl);
    Deno.env.set("SUPABASE_PUBLISHABLE_KEYS", JSON.stringify({ default: publishableKey }));
    Deno.env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ default: serviceKey }));

    const { handleDeliveryApiRequest } = await import("./index.ts");

    const options = await handleDeliveryApiRequest(new Request(baseUrl + "/functions/v1/flame-chick-delivery-api", {
      method: "OPTIONS",
    }));
    if (options.status !== 200) throw new Error("CORS preflight must remain available.");

    const disabledPush = await handleDeliveryApiRequest(new Request(baseUrl + "/functions/v1/flame-chick-delivery-api", {
      method: "POST",
      headers: { "x-flame-chick-push-hook": "test-hook-token", "content-type": "application/json" },
      body: JSON.stringify({ offer_id: "00000000-0000-4000-8000-000000000001" }),
    }));
    const disabledPushBody = await disabledPush.json();
    if (disabledPush.status !== 503 || disabledPushBody?.error?.code !== "PUSH_NOT_CONFIGURED") {
      throw new Error("Disabled internal push hook did not keep its fail-closed behavior.");
    }

    const invalid = await handleDeliveryApiRequest(new Request(baseUrl + "/functions/v1/flame-chick-delivery-api?view=dispatch", {
      method: "GET",
      headers: { apikey: publishableKey, authorization: "Bearer malformed-token" },
    }));
    if (invalid.status !== 401) throw new Error("Malformed JWT was not rejected.");

    // This unit test calls the handler directly, so the signature is synthetic.
    // In production the Supabase gateway validates signature/expiry first
    // because this function's verify_jwt setting is true.
    const encodeBase64Url = (value: unknown) => btoa(JSON.stringify(value))
      .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const token = "synthetic-header." + encodeBase64Url({
      sub: userId,
      role: "authenticated",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 300,
    }) + ".synthetic-signature";

    const requestedPaths: string[] = [];
    let authUserCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = input instanceof Request ? input.url : String(input);
      const url = new URL(rawUrl);
      requestedPaths.push(url.pathname);

      if (url.pathname.endsWith("/auth/v1/user")) {
        authUserCalls++;
        return new Response(JSON.stringify({ message: "Auth /user must not be called by the Delivery API." }), { status: 500 });
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

    const dispatch = await handleDeliveryApiRequest(new Request(baseUrl + "/functions/v1/flame-chick-delivery-api?view=dispatch", {
      method: "GET",
      headers: { apikey: publishableKey, authorization: "Bearer " + token },
    }));
    const dispatchBody = await dispatch.json();
    if (dispatch.status !== 200 || dispatchBody?.ok !== true || dispatchBody?.view !== "dispatch") {
      throw new Error("Gateway-authenticated staff JWT did not reach normal dispatch: " + JSON.stringify(dispatchBody));
    }
    if (authUserCalls !== 0 || requestedPaths.some(path => path.endsWith("/auth/v1/user"))) {
      throw new Error("Delivery API made a redundant Auth /user request after gateway JWT validation.");
    }
    if (!requestedPaths.some(path => path.endsWith("/rpc/flame_chick_get_staff_context")) ||
        !requestedPaths.some(path => path.endsWith("/rpc/flame_chick_expire_delivery_offers"))) {
      throw new Error("Database role/context or expiry checks were not preserved.");
    }

    console.log("Delivery API JWT subject extraction, CORS, fail-closed push, DB role context, and no Auth /user round-trip passed.");
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of envNames) {
      const value = previous.get(name);
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});
