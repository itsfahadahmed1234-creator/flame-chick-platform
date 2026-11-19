// Flame Chick order API v1.
// Guest website order creation plus authenticated staff POS status controls.
// All order writes are executed through service-role-only PostgreSQL RPCs.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

function readKeyMap(name: string): Record<string, string> {
  const raw = Deno.env.get(name);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

const PUBLISHABLE_KEY_MAP = readKeyMap("SUPABASE_PUBLISHABLE_KEYS");
const SECRET_KEY_MAP = readKeyMap("SUPABASE_SECRET_KEYS");
const PUBLIC_KEYS = [
  "sb_publishable_89MQIj_drF15IrF05ZLt0w_txUjPMxy",
  ...Object.values(PUBLISHABLE_KEY_MAP),
  Deno.env.get("SUPABASE_ANON_KEY") ?? "",
].map(String).filter(Boolean);
const SERVICE_KEY = String(
  SECRET_KEY_MAP.default ??
  Object.values(SECRET_KEY_MAP)[0] ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  ""
);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, content-type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

function response(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, ...extraHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function rpcErrorStatus(code: string, message: string): number {
  if (code === "23505" || message.startsWith("IDEMPOTENCY_KEY_REUSED")) return 409;
  if (code === "P0002" || message.startsWith("ORDER_NOT_FOUND") || message.startsWith("HFP_BRANCH_NOT_FOUND")) return 404;
  if (code === "42501" || message.startsWith("STAFF_AUTH_REQUIRED") || message.startsWith("STAFF_ROLE_REQUIRED")) return 403;
  if (code === "22023" || code === "22P02") return 400;
  return 500;
}

function safeErrorCode(message: string): string {
  const first = String(message || "").split(":")[0].trim();
  return /^[A-Z0-9_]{3,64}$/.test(first) ? first : "ORDER_API_ERROR";
}

async function verifyStaffUser(token: string, apiKey: string): Promise<{ id: string } | null> {
  if (!token || !apiKey || !SUPABASE_URL) return null;
  const res = await fetch(SUPABASE_URL + "/auth/v1/user", {
    method: "GET",
    headers: { apikey: apiKey, Authorization: "Bearer " + token, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const user = await res.json();
  return isObject(user) && typeof user.id === "string" ? { id: user.id } : null;
}

const FLAME_CHICK_MAIN_BRANCH_ID = Deno.env.get("FLAME_CHICK_MAIN_BRANCH_ID") ?? "";

async function verifyStaffRole(
  userId: string,
  token: string,
  apiKey: string,
  allowedRoles: string[],
): Promise<boolean> {
  if (!userId || !token || !apiKey || !SUPABASE_URL || !FLAME_CHICK_MAIN_BRANCH_ID || allowedRoles.length === 0) return false;
  const query = new URLSearchParams();
  query.set("select", "role,branch_id");
  query.set("user_id", "eq." + userId);
  query.set("is_active", "eq.true");
  query.set("role", "in.(" + allowedRoles.join(",") + ")");
  query.set("or", "(branch_id.is.null,branch_id.eq." + FLAME_CHICK_MAIN_BRANCH_ID + ")");
  query.set("limit", "5");
  const res = await fetch(SUPABASE_URL + "/rest/v1/user_roles?" + query.toString(), {
    method: "GET",
    headers: { apikey: apiKey, Authorization: "Bearer " + token, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return false;
  const rows: unknown = await res.json();
  return Array.isArray(rows) && rows.some((row) =>
    isObject(row) && typeof row.role === "string" && allowedRoles.includes(row.role)
  );
}

function getClientIp(req: Request): string {
  // Best-effort secondary signal only. Do not trust X-Forwarded-For from browser clients.
  const candidate = (req.headers.get("cf-connecting-ip") ?? "").trim();
  return candidate.length <= 45 && /^[0-9a-fA-F:.]+$/.test(candidate) ? candidate : "";
}

async function callRpc(name: "hfp_create_order" | "hfp_update_order_status" | "hfp_check_website_order_rate_limit", payload: Record<string, unknown>) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ p_payload: payload }),
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text.slice(0, 500) }; }
  if (!res.ok) {
    const err = isObject(data) ? data : {};
    const message = String(err.message ?? err.details ?? ("Database request failed (" + res.status + ")"));
    const code = String(err.code ?? "");
    return {
      ok: false as const,
      status: rpcErrorStatus(code, message),
      body: { ok: false, error: { code: safeErrorCode(message), message: message.split(":").slice(1).join(":").trim() || "The order request could not be completed." } },
    };
  }
  return { ok: true as const, data };
}

async function readOrderBoard(token: string, apiKey: string, board: string, limit: number) {
  const allowedBoards: Record<string, string[]> = {
    orders: ["new", "accepted"],
    preparing: ["preparing", "ready"],
    out_for_delivery: ["out_for_delivery"],
    active: ["new", "accepted", "preparing", "ready", "out_for_delivery"],
    all: ["new", "accepted", "preparing", "ready", "out_for_delivery", "delivered", "collected", "served", "completed", "rejected", "cancelled"],
  };
  const statuses = allowedBoards[board];
  if (!statuses) {
    return { ok: false as const, status: 400, body: { ok: false, error: { code: "BOARD_INVALID", message: "Choose orders, preparing, out_for_delivery, active or all." } } };
  }

  const query = new URLSearchParams();
  query.set(
    "select",
    "id,branch_id,order_number,local_order_id,source,source_reference,fulfillment_type,status,customer_name,customer_phone,customer_email,delivery_address,delivery_area_id,delivery_area_name_snapshot,delivery_area_fee_snapshot,delivery_instructions,table_id,table_number_snapshot,subtotal,discount_amount,tax_amount,service_charge,delivery_fee,tip_amount,total,paid_amount,balance_due,currency_code,payment_status,payment_method_summary,notes,internal_notes,placed_at,created_at,updated_at,accepted_at,preparing_at,ready_at,out_for_delivery_at,delivered_at,collected_at,served_at,completed_at,rejected_at,cancelled_at,rejection_reason,cancellation_reason,cashier_id,pos_device_id,register_session_id,last_status_changed_by,last_status_actor_type,last_status_change_reason,order_items(id,line_number,product_id,product_variant_id,deal_id,quantity,product_name_snapshot,variant_label_snapshot,deal_title_snapshot,unit_price_snapshot,discount_amount,tax_amount,line_total,item_notes,item_snapshot,order_item_modifiers(id,order_item_component_id,modifier_group_id,modifier_id,quantity,modifier_group_name_snapshot,modifier_name_snapshot,unit_price_snapshot,total_price_snapshot,modifier_snapshot),order_item_components(id,deal_component_id,component_type,selected_product_id,selected_variant_id,selected_drink_option_id,quantity,name_snapshot,variant_snapshot,volume_snapshot,unit_price_snapshot,component_snapshot,order_item_modifiers(id,modifier_group_id,modifier_id,quantity,modifier_group_name_snapshot,modifier_name_snapshot,unit_price_snapshot,total_price_snapshot,modifier_snapshot))),delivery_tasks(id,status,recipient_name_snapshot,recipient_phone_snapshot,address_snapshot,area_name_snapshot,delivery_fee_snapshot,delivery_instructions_snapshot,dispatch_started_at,assigned_at,picked_up_at,out_for_delivery_at,delivered_at,failed_at,failure_reason)"
  );
  query.set("status", "in.(" + statuses.join(",") + ")");
  query.set("order", "created_at.desc");
  query.set("limit", String(Math.max(1, Math.min(limit, 100))));
  const res = await fetch(SUPABASE_URL + "/rest/v1/orders?" + query.toString(), {
    method: "GET",
    headers: {
      apikey: apiKey,
      Authorization: "Bearer " + token,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const raw = await res.text();
  let data: unknown;
  try { data = raw ? JSON.parse(raw) : []; } catch { data = []; }
  if (!res.ok) {
    const err = isObject(data) ? data : {};
    const msg = String(err.message ?? ("Unable to load HFP orders (" + res.status + ")."));
    return { ok: false as const, status: res.status === 401 ? 401 : res.status === 403 ? 403 : 500, body: { ok: false, error: { code: res.status === 401 ? "SESSION_EXPIRED" : res.status === 403 ? "ORDER_ACCESS_DENIED" : "ORDER_READ_FAILED", message: msg } } };
  }
  return { ok: true as const, data };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  if (!SUPABASE_URL || !SERVICE_KEY || PUBLIC_KEYS.length === 0) {
    return response({ ok: false, error: { code: "CONFIG_MISSING", message: "The HFP order API is not configured." } }, 503);
  }
  const apiKey = req.headers.get("apikey") ?? "";
  if (!PUBLIC_KEYS.includes(apiKey)) {
    return response({ ok: false, error: { code: "API_KEY_INVALID", message: "A valid HFP publishable API key is required." } }, 401);
  }

  if (req.method === "GET") {
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const user = await verifyStaffUser(token, apiKey);
    if (!user) return response({ ok: false, error: { code: "STAFF_AUTH_REQUIRED", message: "Sign in with an HFP staff account to view incoming orders." } }, 401);
    const canReadBoard = await verifyStaffRole(user.id, token, apiKey, ["owner", "admin", "manager", "cashier", "kitchen"]);
    if (!canReadBoard) return response({ ok: false, error: { code: "STAFF_ROLE_REQUIRED", message: "An active HFP staff role is required to view the order board." } }, 403);
    const url = new URL(req.url);
    const board = (url.searchParams.get("board") ?? "active").toLowerCase();
    const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(Math.trunc(requestedLimit), 100)) : 50;
    const result = await readOrderBoard(token, apiKey, board, limit);
    if (!result.ok) return response(result.body, result.status);
    return response({ ok: true, data: result.data });
  }
  if (req.method !== "POST") return response({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST only." } }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || PUBLIC_KEYS.length === 0) {
    return response({ ok: false, error: { code: "CONFIG_MISSING", message: "The HFP order API is not configured." } }, 503);
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > 128000) {
    return response({ ok: false, error: { code: "REQUEST_TOO_LARGE", message: "The order request is too large." } }, 413);
  }

  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 128000) {
      return response({ ok: false, error: { code: "REQUEST_TOO_LARGE", message: "The order request is too large." } }, 413);
    }
    body = JSON.parse(raw);
  } catch {
    return response({ ok: false, error: { code: "INVALID_JSON", message: "Request body must contain valid JSON." } }, 400);
  }
  if (!isObject(body)) {
    return response({ ok: false, error: { code: "INVALID_REQUEST", message: "Request body must be a JSON object." } }, 400);
  }

  const action = String(body.action ?? "create").toLowerCase();

  if (action === "create") {
    const sourceType = String(body.source ?? "website").toLowerCase();
    if (!["website", "pos", "whatsapp", "phone", "third_party", "manual", "other"].includes(sourceType)) {
      return response({ ok: false, error: { code: "INVALID_SOURCE", message: "Unsupported order source." } }, 400);
    }

    let actorId: string | null = null;
    if (sourceType !== "website") {
      const authorization = req.headers.get("authorization") ?? "";
      const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
      const user = await verifyStaffUser(token, apiKey);
      if (!user) {
        return response({ ok: false, error: { code: "STAFF_AUTH_REQUIRED", message: "Sign in with an HFP staff account to create POS or phone orders." } }, 401);
      }
      const canCreateOrder = await verifyStaffRole(user.id, token, apiKey, ["owner", "admin", "manager", "cashier"]);
      if (!canCreateOrder) {
        return response({ ok: false, error: { code: "STAFF_ROLE_REQUIRED", message: "An active HFP cashier, manager, admin or owner role is required to create staff orders." } }, 403);
      }
      actorId = user.id;
    }

    if (sourceType === "website") {
      const limiterPayload: Record<string, unknown> = { ...body, client_ip: getClientIp(req) };
      const rateLimit = await callRpc("hfp_check_website_order_rate_limit", limiterPayload);
      if (!rateLimit.ok) {
        return response({ ok: false, error: { code: "RATE_LIMIT_CHECK_UNAVAILABLE", message: "We could not safely validate this order request. Please try again shortly." } }, 503);
      }
      if (!isObject(rateLimit.data) || rateLimit.data.allowed !== true) {
        const retryAfter = isObject(rateLimit.data)
          ? Math.max(1, Math.min(3600, Number(rateLimit.data.retry_after_seconds) || 60))
          : 60;
        return response(
          { ok: false, error: { code: "RATE_LIMITED", message: "Too many order attempts. Please wait before trying again.", retry_after_seconds: retryAfter } },
          429,
          { "Retry-After": String(retryAfter) },
        );
      }
    }

    const orderPayload: Record<string, unknown> = { ...body, source: sourceType, actor_user_id: actorId };
    delete orderPayload.action;
    const result = await callRpc("hfp_create_order", orderPayload);
    if (!result.ok) return response(result.body, result.status);
    return response(result.data, 201);
  }

  if (action === "update_status" || action === "cancel" || action === "reject") {
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const user = await verifyStaffUser(token, apiKey);
    if (!user) {
      return response({ ok: false, error: { code: "STAFF_AUTH_REQUIRED", message: "Sign in with an HFP staff account to update order statuses." } }, 401);
    }
    // hfp_update_order_status checks the verified actor's active role and the
    // order's branch inside the row-locked database transaction. Avoid a second
    // user_roles REST query here; actor_user_id is derived from Auth, never the
    // client-supplied request body.
    const toStatus = action === "cancel" ? "cancelled" : action === "reject" ? "rejected" : String(body.to_status ?? "").toLowerCase();
    const statusPayload = {
      order_id: body.order_id,
      to_status: toStatus,
      reason: body.reason ?? null,
      actor_user_id: user.id,
    };
    const result = await callRpc("hfp_update_order_status", statusPayload);
    if (!result.ok) return response(result.body, result.status);
    return response(result.data, 200);
  }

  return response({ ok: false, error: { code: "ACTION_NOT_FOUND", message: "Supported actions are create, update_status, cancel and reject." } }, 404);
});
