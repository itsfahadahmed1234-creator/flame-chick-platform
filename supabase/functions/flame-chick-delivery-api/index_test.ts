Deno.test("Delivery API preserves Auth and Rider checks while overlapping presence reads", async () => {
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
  const independentReads: string[] = [];
  let independentInFlight = 0;
  let maxIndependentInFlight = 0;
  let patchCount = 0;

  try {
    Deno.env.set("SUPABASE_URL", baseUrl);
    Deno.env.set("SUPABASE_PUBLISHABLE_KEYS", JSON.stringify({ default: publishableKey }));
    Deno.env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ default: serviceKey }));
    const { handleDeliveryApiRequest } = await import("./index.ts");

    const options = await handleDeliveryApiRequest(new Request(baseUrl + "/functions/v1/flame-chick-delivery-api", {
      method: "OPTIONS",
      headers: {
        origin: "https://flamechickrider.pages.dev",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,apikey,content-type",
      },
    }));
    if (options.status !== 200) throw new Error("Browser OPTIONS preflight must remain available without Auth.");

    const disabledPush = await handleDeliveryApiRequest(new Request(baseUrl + "/functions/v1/flame-chick-delivery-api", {
      method: "POST",
      headers: { "x-flame-chick-push-hook": "test-hook-token", "content-type": "application/json" },
      body: JSON.stringify({ offer_id: "00000000-0000-4000-8000-000000000001" }),
    }));
    const disabledBody = await disabledPush.json();
    if (disabledPush.status !== 503 || disabledBody?.error?.code !== "PUSH_NOT_CONFIGURED") {
      throw new Error("Disabled internal push hook must continue to fail closed.");
    }

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = input instanceof Request ? input.url : String(input);
      const url = new URL(rawUrl);
      const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();

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
          role_rows: [{ restaurant_id: restaurantId, role_key: "rider", branch_id: branchId, is_active: true }],
          branches: [{ id: branchId, branch_code: "main", is_active: true }],
        }), { status: 200 });
      }

      if (url.pathname.endsWith("/rider_profiles") && method === "PATCH") {
        patchCount++;
        return new Response(JSON.stringify([{
          user_id: userId, branch_id: branchId, is_active: true,
          accepting_jobs: true, availability_status: "available",
        }]), { status: 200 });
      }

      if (url.pathname.endsWith("/delivery_tasks") ||
          (url.pathname.endsWith("/rider_profiles") && url.searchParams.get("select") === "accepting_jobs")) {
        independentReads.push(url.pathname + "?" + url.searchParams.toString());
        independentInFlight++;
        maxIndependentInFlight = Math.max(maxIndependentInFlight, independentInFlight);
        try {
          await new Promise(resolve => setTimeout(resolve, 8));
          if (url.pathname.endsWith("/delivery_tasks")) return new Response("[]", { status: 200 });
          return new Response(JSON.stringify([{ accepting_jobs: true }]), { status: 200 });
        } finally {
          independentInFlight--;
        }
      }

      if (url.pathname.endsWith("/delivery_task_offers")) {
        return new Response("[]", { status: 200 });
      }

      if (url.pathname.endsWith("/rider_profiles")) {
        const detailed = url.searchParams.get("select")?.includes("display_name");
        return new Response(JSON.stringify([detailed ? {
          user_id:userId, branch_id:branchId, is_active:true, rider_code:"R-01",
          display_name:"Test Rider", availability_status:"available",
          accepting_jobs:true, last_seen_at:new Date().toISOString(),
        } : { user_id: userId, branch_id: branchId, is_active: true }]), { status: 200 });
      }

      return new Response(JSON.stringify({ message: "Unexpected mocked request: " + method + " " + url.pathname }), { status: 500 });
    }) as typeof fetch;

    const invalid = await handleDeliveryApiRequest(new Request(baseUrl + "/functions/v1/flame-chick-delivery-api", {
      method: "POST",
      headers: { apikey: publishableKey, authorization: "Bearer invalid-token", "content-type": "application/json" },
      body: JSON.stringify({ action: "presence", online: true }),
    }));
    if (invalid.status !== 401) throw new Error("An invalid Auth bearer token was accepted.");

    const presence = await handleDeliveryApiRequest(new Request(baseUrl + "/functions/v1/flame-chick-delivery-api", {
      method: "POST",
      headers: { apikey: publishableKey, authorization: "Bearer " + validToken, "content-type": "application/json" },
      body: JSON.stringify({ action: "presence", online: true }),
    }));
    const body = await presence.json();
    if (presence.status !== 200 || body?.ok !== true || body?.availability_status !== "available") {
      throw new Error("Authorized Rider presence update changed behavior: " + JSON.stringify(body));
    }
    if (authTokens.length !== 2 || authTokens[0] !== "invalid-token" || authTokens[1] !== validToken) {
      throw new Error("Delivery API must validate each protected request through Auth /user.");
    }
    if (independentReads.length !== 2 || maxIndependentInFlight < 2) {
      throw new Error("Active-task and accepting-jobs reads did not overlap.");
    }
    if (patchCount !== 1) throw new Error("Rider presence should perform exactly one profile update.");

    const sync = await handleDeliveryApiRequest(new Request(baseUrl + "/functions/v1/flame-chick-delivery-api", {
      method:"POST",
      headers:{ apikey:publishableKey, authorization:"Bearer "+validToken, "content-type":"application/json" },
      body:JSON.stringify({ action:"sync", online:true }),
    }));
    const syncBody = await sync.json();
    if (sync.status !== 200 || syncBody?.ok !== true || syncBody?.view !== "rider" ||
        !Array.isArray(syncBody?.data) || !Array.isArray(syncBody?.offers) ||
        syncBody?.profile?.user_id !== userId || syncBody?.availability_status !== "available") {
      throw new Error("Authenticated Rider sync must return presence, profile, jobs and offers together: " + JSON.stringify(syncBody));
    }
    if (patchCount !== 2) throw new Error("Combined Rider sync must update server-timestamped presence exactly once.");
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of envNames) {
      const value = previous.get(name);
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});
