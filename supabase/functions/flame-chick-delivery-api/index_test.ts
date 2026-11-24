import { handleDeliveryApiRequest } from "./index.ts";

Deno.test("internal push hook fails closed while Rider Web Push is disabled", async () => {
  const previousUrl = Deno.env.get("SUPABASE_URL");
  const previousKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
  Deno.env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ default: "server-only-test-secret" }));
  try {
    const response = await handleDeliveryApiRequest(new Request("https://edge.example/delivery", {
      method: "POST",
      headers: { "x-flame-chick-push-hook": "test-hook-token", "content-type": "application/json" },
      body: JSON.stringify({ offer_id: "00000000-0000-4000-8000-000000000001" }),
    }));
    const body = await response.json();
    if (response.status !== 503 || body?.error?.code !== "PUSH_NOT_CONFIGURED") {
      throw new Error("Disabled internal push hook did not fail closed.");
    }
  } finally {
    if (previousUrl === undefined) Deno.env.delete("SUPABASE_URL"); else Deno.env.set("SUPABASE_URL", previousUrl);
    if (previousKeys === undefined) Deno.env.delete("SUPABASE_SECRET_KEYS"); else Deno.env.set("SUPABASE_SECRET_KEYS", previousKeys);
  }
});
