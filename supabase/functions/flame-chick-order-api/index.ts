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
  if (code === "P0002" || message.startsWith("ORDER_NOT_FOUND") || message.startsWith("FLAME_CHICK_BRANCH_NOT_FOUND")) return 404;
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

async function readAsService(path: string): Promise<{ ok: true; data: unknown } | { ok: false; status: number; data: unknown }> {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: "GET",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const raw = await res.text();
  let data: unknown;
  try { data = raw ? JSON.parse(raw) : []; } catch { data = []; }
  return res.ok ? { ok: true, data } : { ok: false, status: res.status, data };
}

type StaffContext = {
  user_id: string;
  role: string;
  branch_id: string;
  restaurant_id: string;
  roles: Array<{ role: string; branch_id: string | null }>;
};

async function resolveStaffContext(userId: string): Promise<StaffContext | null> {
  if (!userId || !SUPABASE_URL || !SERVICE_KEY) return null;

  const restaurantQuery = new URLSearchParams();
  restaurantQuery.set("select", "id");
  restaurantQuery.set("slug", "eq.flame-chick");
  restaurantQuery.set("is_active", "eq.true");
  restaurantQuery.set("limit", "2");
  const restaurantResult = await readAsService("restaurants?" + restaurantQuery.toString());
  if (!restaurantResult.ok || !Array.isArray(restaurantResult.data) || restaurantResult.data.length !== 1) return null;
  const restaurant = restaurantResult.data[0];
  if (!isObject(restaurant) || typeof restaurant.id !== "string") return null;

  const roleResult = await fetch(SUPABASE_URL + "/rest/v1/rpc/flame_chick_get_staff_role_rows", {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ p_user_id: userId }),
    cache: "no-store",
  });
  if (!roleResult.ok) return null;
  const roleData: unknown = await roleResult.json().catch(() => null);
  if (!Array.isArray(roleData)) return null;
  const roleRows = roleData.filter((row): row is Record<string, unknown> =>
    isObject(row) &&
    row.restaurant_id === restaurant.id &&
    typeof row.role_key === "string" &&
    ["owner", "admin", "manager", "cashier", "rider"].includes(row.role_key) &&
    row.is_active === true &&
    (row.branch_id === null || typeof row.branch_id === "string")
  );
  if (!roleRows.length) return null;

  const branchIds = [...new Set(roleRows.map((row) => typeof row.branch_id === "string" ? row.branch_id : null).filter((id): id is string => !!id))];
  const branchQuery = new URLSearchParams();
  branchQuery.set("select", "id,branch_code,is_active");
  branchQuery.set("restaurant_id", "eq." + restaurant.id);
  branchQuery.set("is_active", "eq.true");
  branchQuery.set("order", "branch_code.asc");
  branchQuery.set("limit", "100");
  if (branchIds.length && roleRows.every((row) => row.branch_id !== null)) {
    branchQuery.set("id", "in.(" + branchIds.join(",") + ")");
  }
  const branchResult = await readAsService("branches?" + branchQuery.toString());
  if (!branchResult.ok || !Array.isArray(branchResult.data)) return null;
  const branches = branchResult.data.filter((row): row is Record<string, unknown> =>
    isObject(row) && typeof row.id === "string" && row.is_active === true
  );
  if (!branches.length) return null;

  const globalRoles = roleRows.filter((row) => row.branch_id === null);
  const branchScopedRoles = roleRows.filter((row) => typeof row.branch_id === "string");
  const validBranchRoles = branchScopedRoles.filter((row) => branches.some((branch) => branch.id === row.branch_id));
  const scopedBranchIds = [...new Set(validBranchRoles.map((row) => String(row.branch_id)))];
  const scopedRoleKeys = [...new Set(validBranchRoles.map((row) => String(row.role_key)))];
  if (globalRoles.length && (globalRoles.length !== 1 || branchScopedRoles.length > 0)) return null;
  if (!globalRoles.length && (scopedBranchIds.length !== 1 || scopedRoleKeys.length !== 1)) return null;
  const usableRoles = [...globalRoles, ...validBranchRoles];
  if (!usableRoles.length) return null;

  // This first release is single-branch. Refuse to guess if a global role would
  // need to choose between multiple active branches; branch selection is a later
  // explicit UI feature, not a silent cross-branch default.
  if (globalRoles.length && branches.length !== 1) return null;
  const priority: Record<string, number> = { owner: 1, admin: 2, manager: 3, cashier: 4, rider: 5 };
  usableRoles.sort((a, b) => (priority[String(a.role_key)] ?? 99) - (priority[String(b.role_key)] ?? 99));
  const selected = usableRoles[0];
  const branchId = typeof selected.branch_id === "string" ? selected.branch_id : String(branches[0].id);
  if (!branches.some((branch) => branch.id === branchId)) return null;

  return {
    user_id: userId,
    role: String(selected.role_key),
    branch_id: branchId,
    restaurant_id: String(restaurant.id),
    roles: usableRoles.map((row) => ({
      role: String(row.role_key),
      branch_id: typeof row.branch_id === "string" ? row.branch_id : null,
    })),
  };
}

async function verifyStaffRole(
  userId: string,
  _token: string,
  _apiKey: string,
  allowedRoles: string[],
): Promise<boolean> {
  const context = await resolveStaffContext(userId);
  return !!context && allowedRoles.includes(context.role);
}

function getClientIp(req: Request): string {
  // Best-effort secondary signal only. Do not trust X-Forwarded-For from browser clients.
  const candidate = (req.headers.get("cf-connecting-ip") ?? "").trim();
  return candidate.length <= 45 && /^[0-9a-fA-F:.]+$/.test(candidate) ? candidate : "";
}

async function callRpc(name: "flame_chick_create_order" | "flame_chick_update_order_status" | "flame_chick_check_website_order_rate_limit" | "flame_chick_collect_order_payment", payload: Record<string, unknown>) {
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

async function readOrderBoard(board: string, limit: number, branchId: string, filters: { orderId?: string; source?: string } = {}) {
  const allowedBoards: Record<string, string[]> = {
    orders: ["new", "accepted"],
    preparing: ["preparing", "ready"],
    out_for_delivery: ["out_for_delivery"],
    active: ["new", "accepted", "preparing", "ready", "out_for_delivery", "delivered"],
    all: ["new", "accepted", "preparing", "ready", "out_for_delivery", "delivered", "collected", "served", "completed", "rejected", "cancelled", "returned"],
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
  query.set("branch_id", "eq." + branchId);
  query.set("status", "in.(" + statuses.join(",") + ")");
  if (filters.orderId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filters.orderId)) {
      return { ok:false as const, status:400, body:{ok:false,error:{code:"ORDER_ID_INVALID",message:"A valid order id is required."}} };
    }
    query.set("id", "eq." + filters.orderId);
  }
  if (filters.source && ["website","pos","whatsapp","phone","third_party","manual","other"].includes(filters.source)) {
    query.set("source", "eq." + filters.source);
  }
  query.set("order", "created_at.desc");
  query.set("limit", String(Math.max(1, Math.min(limit, 100))));
  const result = await readAsService("orders?" + query.toString());
  if (!result.ok) {
    const err = isObject(result.data) ? result.data : {};
    const msg = String(err.message ?? ("Unable to load Flame Chick orders (" + result.status + ")."));
    return { ok:false as const, status:500, body:{ok:false,error:{code:"ORDER_READ_FAILED",message:msg}} };
  }
  return { ok:true as const, data:result.data };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  if (!SUPABASE_URL || !SERVICE_KEY || PUBLIC_KEYS.length === 0) {
    return response({ ok: false, error: { code: "CONFIG_MISSING", message: "The Flame Chick order API is not configured." } }, 503);
  }
  const apiKey = req.headers.get("apikey") ?? "";
  if (!PUBLIC_KEYS.includes(apiKey)) {
    return response({ ok: false, error: { code: "API_KEY_INVALID", message: "A valid Flame Chick publishable API key is required." } }, 401);
  }

  if (req.method === "GET") {
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const user = await verifyStaffUser(token, apiKey);
    if (!user) return response({ ok: false, error: { code: "STAFF_AUTH_REQUIRED", message: "Sign in with a Flame Chick staff account." } }, 401);
    const url = new URL(req.url);
    const view = (url.searchParams.get("view") ?? "").toLowerCase();
    // This authenticated self-context endpoint is also used by the Rider app;
    // it deliberately runs before POS-only order-board authorization.
    if (view === "staff_context") {
      const context = await resolveStaffContext(user.id);
      if (!context) return response({ ok: false, error: { code: "STAFF_ROLE_OR_BRANCH_REQUIRED", message: "Your account needs an active Flame Chick staff role and a single authorized branch." } }, 403);
      return response({ ok: true, staff: context });
    }
    const canReadBoard = await verifyStaffRole(user.id, token, apiKey, ["owner", "admin", "manager", "cashier"]);
    if (!canReadBoard) return response({ ok: false, error: { code: "STAFF_ROLE_REQUIRED", message: "An active Flame Chick Admin, Owner, Manager or Cashier role is required to view the order board." } }, 403);
    const context = await resolveStaffContext(user.id);
    if (!context || !["owner", "admin", "manager", "cashier"].includes(context.role)) {
      return response({ ok: false, error: { code: "STAFF_ROLE_REQUIRED", message: "An active Flame Chick POS role is required to view incoming orders." } }, 403);
    }
    const board = (url.searchParams.get("board") ?? "active").toLowerCase();
    const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(Math.trunc(requestedLimit), 100)) : 50;
    const orderId = (url.searchParams.get("order_id") ?? "").trim();
    const source = (url.searchParams.get("source") ?? "").trim().toLowerCase();
    const result = await readOrderBoard(board, limit, context.branch_id, {
      ...(orderId ? {orderId} : {}),
      ...(source ? {source} : {})
    });
    if (!result.ok) return response(result.body, result.status);
    return response({ ok: true, data: result.data });
  }
  if (req.method !== "POST") return response({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST only." } }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || PUBLIC_KEYS.length === 0) {
    return response({ ok: false, error: { code: "CONFIG_MISSING", message: "The Flame Chick order API is not configured." } }, 503);
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
        return response({ ok: false, error: { code: "STAFF_AUTH_REQUIRED", message: "Sign in with an Flame Chick staff account to create POS or phone orders." } }, 401);
      }
      const canCreateOrder = await verifyStaffRole(user.id, token, apiKey, ["owner", "admin", "manager", "cashier"]);
      if (!canCreateOrder) {
        return response({ ok: false, error: { code: "STAFF_ROLE_REQUIRED", message: "An active Flame Chick cashier, manager, admin or owner role is required to create staff orders." } }, 403);
      }
      actorId = user.id;
    }

    if (sourceType === "website") {
      const limiterPayload: Record<string, unknown> = { ...body, client_ip: getClientIp(req) };
      const rateLimit = await callRpc("flame_chick_check_website_order_rate_limit", limiterPayload);
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
    const result = await callRpc("flame_chick_create_order", orderPayload);
    if (!result.ok) return response(result.body, result.status);
    return response(result.data, 201);
  }

  if (action === "collect_payment") {
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const user = await verifyStaffUser(token, apiKey);
    if (!user) {
      return response({ ok:false, error:{ code:"STAFF_AUTH_REQUIRED", message:"Sign in with a Flame Chick staff account to collect payment." } },401);
    }
    const canCollect = await verifyStaffRole(user.id, token, apiKey, ["owner","admin","manager","cashier"]);
    if (!canCollect) {
      return response({ ok:false, error:{ code:"PAYMENT_STAFF_REQUIRED", message:"An active Cashier, Manager, Admin or Owner role is required to collect payment." } },403);
    }
    const requestId = typeof body.request_id === "string"
      ? body.request_id.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      return response({ ok:false, error:{ code:"PAYMENT_REQUEST_ID_REQUIRED", message:"A valid unique payment request ID is required for safe retries." } },400);
    }
    if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0) {
      return response({ ok:false, error:{ code:"PAYMENT_AMOUNT_INVALID", message:"Enter a valid payment amount greater than zero." } },400);
    }
    const paymentMethod = String(body.payment_method ?? "").trim().toLowerCase();
    if (!["cash","card","bank","wallet","other"].includes(paymentMethod)) {
      return response({ ok:false, error:{ code:"PAYMENT_METHOD_INVALID", message:"Choose cash, card, bank, wallet or other." } },400);
    }
    const result = await callRpc("flame_chick_collect_order_payment", {
      order_id: body.order_id,
      actor_user_id: user.id,
      request_id: requestId,
      amount: body.amount,
      payment_method: paymentMethod,
    });
    if (!result.ok) return response(result.body, result.status);
    if (isObject(result.data) && result.data.ok === false) {
      const err = isObject(result.data.error) ? result.data.error : {};
      const code = String(err.code ?? "PAYMENT_COLLECTION_FAILED");
      const status = code === "PAYMENT_ORDER_NOT_FOUND" ? 404 :
        ["PAYMENT_STAFF_REQUIRED"].includes(code) ? 403 :
        ["PAYMENT_ALREADY_SETTLED","PAYMENT_AMOUNT_EXCEEDS_BALANCE","PAYMENT_IDEMPOTENCY_CONFLICT","PAYMENT_ORDER_STATE_INVALID"].includes(code) ? 409 :
        ["PAYMENT_REQUEST_INVALID","PAYMENT_IDENTIFIERS_INVALID","PAYMENT_AMOUNT_INVALID","PAYMENT_METHOD_INVALID"].includes(code) ? 400 : 500;
      return response({ ok:false, error:{ code, message:String(err.message ?? "Payment collection could not be completed.") } },status);
    }
    return response(result.data,200);
  }

  if (action === "update_status" || action === "cancel" || action === "reject") {
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const user = await verifyStaffUser(token, apiKey);
    if (!user) {
      return response({ ok: false, error: { code: "STAFF_AUTH_REQUIRED", message: "Sign in with an Flame Chick staff account to update order statuses." } }, 401);
    }
    // flame_chick_update_order_status checks the verified actor's active role and the
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
    const result = await callRpc("flame_chick_update_order_status", statusPayload);
    if (!result.ok) return response(result.body, result.status);
    return response(result.data, 200);
  }

  return response({ ok: false, error: { code: "ACTION_NOT_FOUND", message: "Supported actions are create, update_status, cancel and reject." } }, 404);
});
