// Flame Chick delivery dispatch API v1.
// Separate function for Flame Chick rider dispatch and delivery lifecycle.
// All writes go through service-role-only public.flame_chick_manage_delivery(jsonb).
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const staffProjectionCache=new Map<string,{expiresAt:number;value:{restaurantId:string;roleRows:Record<string,unknown>[];branches:Record<string,unknown>[]}}>();
const deliveryExpirySweepByBranch=new Map<string,number>();
const deliveryExpirySweepInFlight=new Map<string,ReturnType<typeof callServiceRpc>>();

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

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
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

async function readAsService(path: string) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: "GET",
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, Accept: "application/json" },
    cache: "no-store",
  });
  const raw = await res.text();
  let data: unknown;
  try { data = raw ? JSON.parse(raw) : []; } catch { data = []; }
  if (!res.ok) {
    const err = isObject(data) ? data : {};
    return {
      ok: false as const,
      status: res.status === 401 ? 401 : res.status === 403 ? 403 : 500,
      body: {
        ok: false,
        error: {
          code: res.status === 401 ? "SESSION_EXPIRED" : res.status === 403 ? "DELIVERY_ACCESS_DENIED" : "DELIVERY_READ_FAILED",
          message: String(err.message ?? "Unable to read Flame Chick delivery data."),
        },
      },
    };
  }
  return { ok: true as const, data };
}

async function setRiderPresence(userId: string, branchId: string, online: boolean, updatePreference = false) {
  const now = new Date().toISOString();
  const taskQuery = new URLSearchParams();
  taskQuery.set("select", "id,delivery_assignments!inner(id,status,rider_user_id,is_current)");
  taskQuery.set("branch_id", "eq." + branchId);
  taskQuery.set("delivery_assignments.rider_user_id", "eq." + userId);
  taskQuery.set("delivery_assignments.is_current", "eq.true");
  taskQuery.set("delivery_assignments.status", "in.(accepted,out_for_delivery,failed)");
  taskQuery.set("status", "in.(accepted,out_for_delivery,failed)");
  taskQuery.set("return_confirmed_at", "is.null");
  taskQuery.set("limit", "1");
  const activeTasks = await readAsService("delivery_tasks?" + taskQuery.toString());
  if (!activeTasks.ok) return { ok:false as const, status:activeTasks.status, message:"Could not verify your active delivery." };
  const busy = Array.isArray(activeTasks.data) && activeTasks.data.length > 0;
  const profileBefore = await readAsService("rider_profiles?select=accepting_jobs&user_id=eq." + userId + "&branch_id=eq." + branchId + "&is_active=eq.true&limit=1");
  if (!profileBefore.ok || !Array.isArray(profileBefore.data) || profileBefore.data.length !== 1) return { ok:false as const, status:409, message:"Your active rider profile was not found for this branch." };
  const acceptingJobs = updatePreference ? online : profileBefore.data[0].accepting_jobs !== false;
  const availability = busy ? "busy" : online && acceptingJobs ? "available" : "offline";
  const profileQuery = new URLSearchParams();
  profileQuery.set("user_id", "eq." + userId);
  profileQuery.set("branch_id", "eq." + branchId);
  profileQuery.set("is_active", "eq.true");
  profileQuery.set("availability_status", "neq.suspended");
  const update = await fetch(SUPABASE_URL + "/rest/v1/rider_profiles?" + profileQuery.toString(), {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ availability_status:availability, accepting_jobs:acceptingJobs, last_seen_at:now, updated_at:now }),
    cache: "no-store",
  });
  const raw = await update.text();
  let data: unknown = [];
  try { data = raw ? JSON.parse(raw) : []; } catch { data = []; }
  if (!update.ok) {
    const err = isObject(data) ? data : {};
    return { ok:false as const, status:update.status, message:String(err.message ?? "Could not update rider presence.") };
  }
  if (!Array.isArray(data) || data.length !== 1) {
    return { ok:false as const, status:409, message:"Your active rider profile was not found for this branch." };
  }
  return { ok:true as const, availability_status:availability, accepting_jobs:acceptingJobs, last_seen_at:now };
}

async function callDeliveryRpc(payload: Record<string, unknown>) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/flame_chick_manage_delivery", {
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
  const raw = await res.text();
  let data: unknown = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { message: raw.slice(0, 500) }; }
  if (!res.ok || (isObject(data) && data.ok === false)) {
    const outer = isObject(data) && isObject(data.error) ? data.error : data;
    const err = isObject(outer) ? outer : {};
    const message = String(err.message ?? err.details ?? ("Delivery action failed (" + res.status + ")."));
    const code = String(err.code ?? "");
    const status = code === "P0002" || code.endsWith("_NOT_FOUND") ? 404 :
      code === "23505" || code === "OFFER_EXPIRED" || code.endsWith("_ALREADY_ASSIGNED") ||
      code.endsWith("_ALREADY_RESOLVED") || code.endsWith("_STATE_INVALID") ||
      code === "RIDER_NOT_AVAILABLE" || code === "DELIVERY_NOT_AWAITING_ASSIGNMENT" ? 409 :
      code === "42501" || code.endsWith("_ROLE_REQUIRED") || code.endsWith("_ACCESS_DENIED") ? 403 :
      code === "22023" || code === "22P02" || code.endsWith("_INVALID") ||
      code.endsWith("_REQUIRED") || code.endsWith("_TOO_LONG") ? 400 : 500;
    return {
      ok: false as const,
      status,
      body: {
        ok: false,
        error: {
          code: message.split(":")[0].match(/^[A-Z0-9_]{3,64}$/)?.[0] ?? "DELIVERY_API_ERROR",
          message: message.split(":").slice(1).join(":").trim() || "The delivery action could not be completed.",
        },
      },
    };
  }
  return { ok: true as const, data };
}


async function callServiceRpc(name: string, args: Record<string, unknown> = {}) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const raw = await res.text();
  let data: unknown = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!res.ok || (isObject(data) && data.ok === false)) {
    const outer = isObject(data) && isObject(data.error) ? data.error : data;
    const err = isObject(outer) ? outer : {};
    const message = String(err.message ?? err.details ?? "A delivery operation failed.");
    const code = String(err.code ?? "");
    const status = code === "P0002" || code.endsWith("_NOT_FOUND") ? 404 :
      code === "23505" || code === "OFFER_EXPIRED" || code.endsWith("_ALREADY_RESOLVED") ||
      code.endsWith("_STATE_INVALID") || code === "RIDER_NOT_AVAILABLE" ? 409 :
      code === "42501" || code.endsWith("_ROLE_REQUIRED") || code.endsWith("_ACCESS_DENIED") ? 403 :
      code === "22023" || code === "22P02" || code.endsWith("_INVALID") ||
      code.endsWith("_REQUIRED") || code.endsWith("_TOO_LONG") ? 400 : 500;
    return { ok:false as const, status, message, data };
  }
  return { ok:true as const, data };
}

async function readStaffContextProjection(userId:string):Promise<{restaurantId:string;roleRows:Record<string,unknown>[];branches:Record<string,unknown>[]} | null> {
  const cached=staffProjectionCache.get(userId);
  if(cached&&cached.expiresAt>Date.now())return cached.value;
  if(cached)staffProjectionCache.delete(userId);
  const result=await callServiceRpc("flame_chick_get_staff_context",{p_user_id:userId});
  if(!result.ok||!isObject(result.data)||typeof result.data.restaurant_id!=="string")return null;
  const restaurantId=result.data.restaurant_id;
  const roleRows=Array.isArray(result.data.role_rows)?result.data.role_rows.filter((row):row is Record<string,unknown> =>
    isObject(row)&&row.restaurant_id===restaurantId&&typeof row.role_key==="string"&&row.is_active===true&&
    (row.branch_id===null||typeof row.branch_id==="string")
  ): [];
  const branches=Array.isArray(result.data.branches)?result.data.branches.filter((row):row is Record<string,unknown> =>
    isObject(row)&&typeof row.id==="string"&&row.is_active===true
  ): [];
  if(!roleRows.length||!branches.length)return null;
  const value={restaurantId,roleRows,branches};
  staffProjectionCache.set(userId,{expiresAt:Date.now()+15_000,value});
  if(staffProjectionCache.size>128)staffProjectionCache.delete(staffProjectionCache.keys().next().value as string);
  return value;
}

async function resolveDispatchContext(userId: string): Promise<{
  ok: true; role: string; branchId: string;
} | { ok: false }> {
  const projection=await readStaffContextProjection(userId);
  if(!projection)return {ok:false};
  const roleRows=projection.roleRows.filter(row=>
    ["owner","admin","manager","cashier"].includes(String(row.role_key))&&row.is_active===true&&
    (row.branch_id===null||typeof row.branch_id==="string")
  );
  const branches=projection.branches;
  const globalRoles = roleRows.filter(row=>row.branch_id===null);
  const scopedRoles = roleRows.filter(row=>typeof row.branch_id==="string" && branches.some(branch=>branch.id===row.branch_id));
  const distinctScopedBranches = [...new Set(scopedRoles.map(row=>String(row.branch_id)))];
  const scopedRoleKeys = [...new Set(scopedRoles.map(row=>String(row.role_key)))];
  if (globalRoles.length && (globalRoles.length!==1 || roleRows.some(row=>row.branch_id!==null))) return { ok:false };
  if (!globalRoles.length && (distinctScopedBranches.length!==1 || scopedRoleKeys.length!==1)) return { ok:false };
  if (globalRoles.length && branches.length!==1) return { ok:false };
  const usable=[...globalRoles,...scopedRoles];
  if (!usable.length) return { ok:false };
  const priority:Record<string,number>={owner:1,admin:2,manager:3,cashier:4};
  usable.sort((a,b)=>(priority[String(a.role_key)]??99)-(priority[String(b.role_key)]??99));
  const selected=usable[0];
  const branchId=typeof selected.branch_id==="string"?selected.branch_id:String(branches[0].id);
  if (!branches.some(branch=>branch.id===branchId)) return { ok:false };
  return {ok:true,role:String(selected.role_key),branchId};
}


async function isActiveRider(userId: string, token: string, apiKey: string) {
  const projection=await readStaffContextProjection(userId);
  if(!projection)return { ok:false as const,status:503,body:{ok:false,error:{code:"RIDER_CONTEXT_UNAVAILABLE",message:"Flame Chick Rider context is unavailable."}}};
  const riderRoles=projection.roleRows.filter(row=>row.restaurant_id===projection.restaurantId&&row.role_key==="rider"&&row.is_active===true&&typeof row.branch_id==="string");
  const riderBranches = [...new Set(riderRoles.map((row) => String(row.branch_id)))];
  if (!riderRoles.length) {
    return { ok:false as const, status:403, body:{ ok:false, error:{ code:"RIDER_ROLE_REQUIRED", message:"This account does not have an active Flame Chick rider role." } } };
  }
  if (riderBranches.length !== 1) {
    return { ok:false as const, status:403, body:{ ok:false, error:{ code:"RIDER_BRANCH_SELECTION_REQUIRED", message:"Your rider account is assigned to multiple branches. Ask the administrator to configure a single Rider branch before signing in." } } };
  }
  const riderRole = riderRoles[0];
  const profileQuery = new URLSearchParams();
  profileQuery.set("select", "user_id,branch_id,is_active");
  profileQuery.set("user_id", "eq." + userId);
  profileQuery.set("branch_id", "eq." + riderRole.branch_id);
  profileQuery.set("is_active", "eq.true");
  const profileResult = await readAsService("rider_profiles?" + profileQuery.toString());
  if (!profileResult.ok) return { ok:false as const, status:profileResult.status, body:profileResult.body };
  const profiles = Array.isArray(profileResult.data) ? profileResult.data : [];
  if (!profiles.some((row) => isObject(row) && row.user_id === userId && row.branch_id === riderRole.branch_id && row.is_active === true)) {
    return { ok:false as const, status:403, body:{ ok:false, error:{ code:"RIDER_PROFILE_REQUIRED", message:"Your active rider profile is missing for this branch." } } };
  }
  return { ok:true as const, branchId:riderRole.branch_id };
}

export async function handleDeliveryApiRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  if (!SUPABASE_URL || !SERVICE_KEY || PUBLIC_KEYS.length === 0) {
    return response({ ok: false, error: { code: "CONFIG_MISSING", message: "The Flame Chick delivery API is not configured." } }, 503);
  }

  // Rider Web Push stays disabled until encrypted subscription persistence,
  // server-only key management, and trusted hook/config RPCs are implemented.
  if (req.method === "POST" && req.headers.has("x-flame-chick-push-hook")) {
    return response({ ok:false, error:{
      code:"PUSH_NOT_CONFIGURED",
      message:"Rider push notifications are temporarily unavailable. Keep the Rider app open and refresh offers."
    } },503);
  }

  const apiKey = req.headers.get("apikey") ?? "";
  if (!PUBLIC_KEYS.includes(apiKey)) {
    return response({ ok: false, error: { code: "API_KEY_INVALID", message: "A valid Flame Chick publishable API key is required." } }, 401);
  }

  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const user = await verifyStaffUser(token, apiKey);
  if (!user) return response({ ok: false, error: { code: "STAFF_AUTH_REQUIRED", message: "Sign in with an Flame Chick staff account to access delivery dispatch." } }, 401);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const view = (url.searchParams.get("view") ?? "dispatch").toLowerCase();

    if (view === "profile") {
      const riderScope = await isActiveRider(user.id, token, apiKey);
      if (!riderScope.ok) return response(riderScope.body, riderScope.status);
      const profileQuery = new URLSearchParams();
      profileQuery.set("select", "user_id,branch_id,rider_code,display_name,phone,availability_status,accepting_jobs,last_seen_at,is_active");
      profileQuery.set("user_id", "eq." + user.id);
      profileQuery.set("branch_id", "eq." + riderScope.branchId);
      profileQuery.set("is_active", "eq.true");
      profileQuery.set("limit", "2");
      const profile = await readAsService("rider_profiles?" + profileQuery.toString());
      if (!profile.ok) return response(profile.body, profile.status);
      if (!Array.isArray(profile.data) || profile.data.length !== 1) {
        return response({ ok:false, error:{ code:"RIDER_PROFILE_REQUIRED", message:"Your active rider profile is missing for this branch." } },403);
      }
      return response({ ok:true, profile:profile.data[0] });
    }

    if (view === "rider") {
      const riderScope = await isActiveRider(user.id, token, apiKey);
      if (!riderScope.ok) return response(riderScope.body, riderScope.status);

      const query = new URLSearchParams();
      query.set("select",
        "id,status,recipient_name_snapshot,recipient_phone_snapshot,address_snapshot,area_name_snapshot,delivery_fee_snapshot,delivery_instructions_snapshot,dispatch_started_at,assigned_at,picked_up_at,out_for_delivery_at,delivered_at,failed_at,failure_reason,return_reported_at,return_confirmed_at,orders!inner(id,order_number,status,fulfillment_type,total,payment_status,customer_name,customer_phone,delivery_address,delivery_instructions,order_items(id,line_number,quantity,product_name_snapshot,variant_label_snapshot,deal_title_snapshot,line_total,item_notes,order_item_modifiers(id,modifier_group_name_snapshot,modifier_name_snapshot,quantity,total_price_snapshot))),delivery_assignments!inner(id,rider_user_id,status,is_current,assigned_at,accepted_at,picked_up_at,delivered_at,created_at)");
      query.set("branch_id", "eq." + riderScope.branchId);
      query.set("delivery_assignments.rider_user_id", "eq." + user.id);
      query.set("delivery_assignments.is_current", "eq.true");
      query.set("delivery_assignments.status", "in.(accepted,out_for_delivery,failed)");
      query.set("return_confirmed_at", "is.null");
      query.set("status", "in.(accepted,out_for_delivery,failed)");
      query.set("orders.fulfillment_type", "eq.delivery");
      query.set("order", "created_at.asc");
      const offersQuery = new URLSearchParams();
      offersQuery.set("select", "id,delivery_task_id,offer_round,offered_at,expires_at,delivery_tasks!inner(id,status,area_name_snapshot,delivery_fee_snapshot,orders!inner(order_number,status))");
      offersQuery.set("rider_user_id", "eq." + user.id);
      offersQuery.set("status", "eq.offered");
      offersQuery.set("expires_at", "gt." + new Date().toISOString());
      offersQuery.set("delivery_tasks.status", "eq.offering");
      offersQuery.set("delivery_tasks.orders.status", "eq.ready");
      const [tasksResult, offersResult] = await Promise.all([
        readAsService("delivery_tasks?" + query.toString()),
        readAsService("delivery_task_offers?" + offersQuery.toString()),
      ]);
      if (!tasksResult.ok) return response(tasksResult.body, tasksResult.status);
      if (!offersResult.ok) return response(offersResult.body, offersResult.status);
      return response({ ok:true, view:"rider", data:tasksResult.data, offers:offersResult.data });
    }

    if (view === "push-config") {
      return response({ ok:false, error:{
        code:"PUSH_NOT_CONFIGURED",
        message:"Rider push notifications are temporarily unavailable. Keep the Rider app open and refresh offers."
      } },503);
    }
    if (view !== "dispatch") {
      return response({ ok: false, error: { code: "DELIVERY_VIEW_INVALID", message: "Choose dispatch or rider." } }, 400);
    }

    const staffContext = await resolveDispatchContext(user.id);
    if (!staffContext.ok) return response({ok:false,error:{code:"DISPATCH_ROLE_OR_BRANCH_REQUIRED",message:"An active Flame Chick Admin, Owner, Manager or Cashier role for one branch is required."}},403);
    const requestedBranch = (url.searchParams.get("branch_id") ?? "").trim();
    if (requestedBranch && requestedBranch !== staffContext.branchId) {
      return response({ok:false,error:{code:"BRANCH_ACCESS_DENIED",message:"You cannot access dispatch data for another branch."}},403);
    }
    const branchId = staffContext.branchId;
    // The server command retains the 60-second offer deadline. Coalesce concurrent
    // refreshes per branch; no background timer or expiry semantics are changed.
    const expiryNow=Date.now();
    const lastSweep=deliveryExpirySweepByBranch.get(branchId)||0;
    if(expiryNow-lastSweep>=15_000){
      let sweep=deliveryExpirySweepInFlight.get(branchId);
      if(!sweep){sweep=callServiceRpc("flame_chick_expire_delivery_offers",{p_branch_id:branchId,p_batch_limit:100});deliveryExpirySweepInFlight.set(branchId,sweep);}
      const expiry=await sweep;
      if(deliveryExpirySweepInFlight.get(branchId)===sweep)deliveryExpirySweepInFlight.delete(branchId);
      if(!expiry.ok)return response({ok:false,error:{code:"DELIVERY_EXPIRY_SWEEP_FAILED",message:"Could not refresh expired rider offers. Please retry."}},503);
      deliveryExpirySweepByBranch.set(branchId,Date.now());
    }

    const taskQuery = new URLSearchParams();
    taskQuery.set("select",
      "id,order_id,branch_id,status,recipient_name_snapshot,recipient_phone_snapshot,address_snapshot,area_name_snapshot,delivery_fee_snapshot,delivery_instructions_snapshot,dispatch_started_at,assigned_at,picked_up_at,out_for_delivery_at,delivered_at,failed_at,failure_reason,return_reported_at,return_confirmed_at,created_at,orders!inner(id,order_number,status,fulfillment_type,total,payment_status,customer_name,customer_phone,delivery_address,delivery_instructions,order_items(id,line_number,quantity,product_name_snapshot,variant_label_snapshot,deal_title_snapshot,line_total,item_notes,order_item_modifiers(id,modifier_group_name_snapshot,modifier_name_snapshot,quantity,total_price_snapshot))),delivery_assignments(id,rider_user_id,status,is_current,assigned_at,accepted_at,picked_up_at,delivered_at,created_at,ended_at,end_reason)");
    taskQuery.set("branch_id", "eq." + branchId);
    taskQuery.set("status", "in.(dispatch_pending,offering,accepted,out_for_delivery,failed)");
    taskQuery.set("orders.fulfillment_type", "eq.delivery");
    taskQuery.set("order", "created_at.asc");
    taskQuery.set("limit", "100");

    const riderQuery = new URLSearchParams();
    riderQuery.set("select", "user_id,rider_code,display_name,phone,availability_status,accepting_jobs,last_seen_at,is_active");
    riderQuery.set("branch_id", "eq." + branchId);
    riderQuery.set("is_active", "eq.true");
    riderQuery.set("order", "display_name.asc");

    const [tasks, riders] = await Promise.all([
      readAsService("delivery_tasks?" + taskQuery.toString()),
      readAsService("rider_profiles?" + riderQuery.toString()),
    ]);
    if (!tasks.ok) return response(tasks.body, tasks.status);
    if (!riders.ok) return response(riders.body, riders.status);
    return response({ ok: true, view: "dispatch", data: { tasks: tasks.data, riders: riders.data } });
  }

  if (req.method !== "POST") return response({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST only." } }, 405);

  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 16000) return response({ ok: false, error: { code: "REQUEST_TOO_LARGE", message: "The delivery request is too large." } }, 413);
    body = JSON.parse(raw);
  } catch {
    return response({ ok: false, error: { code: "INVALID_JSON", message: "Request body must contain valid JSON." } }, 400);
  }
  if (!isObject(body)) return response({ ok: false, error: { code: "INVALID_REQUEST", message: "Request body must be a JSON object." } }, 400);

  const action = String(body.action ?? "").toLowerCase();
  if (action === "presence") {
    const riderScope = await isActiveRider(user.id, token, apiKey);
    if (!riderScope.ok) return response(riderScope.body, riderScope.status);
    const online = body.online !== false;
    const result = await setRiderPresence(user.id, riderScope.branchId, online, body.update_preference === true);
    if (!result.ok) return response({ ok:false, error:{ code:"RIDER_PRESENCE_UPDATE_FAILED", message:result.message } },result.status);
    return response({ ok:true, online, accepting_jobs:result.accepting_jobs, availability_status:result.availability_status, last_seen_at:result.last_seen_at });
  }

  if (action === "accept_offer" || action === "decline_offer") {
    const riderScope = await isActiveRider(user.id, token, apiKey);
    if (!riderScope.ok) return response(riderScope.body, riderScope.status);
    const offerId = String(body.offer_id ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(offerId)) {
      return response({ ok:false, error:{ code:"OFFER_ID_INVALID", message:"A valid delivery offer id is required." } },400);
    }
    const rpcName = action === "accept_offer" ? "flame_chick_accept_delivery_offer" : "flame_chick_decline_delivery_offer";
    const args:Record<string,unknown> = { p_offer_id:offerId, p_rider_user_id:user.id };
    if(action === "decline_offer") args.p_reason = body.reason ?? null;
    const requestId = typeof body.request_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id)
      ? body.request_id : crypto.randomUUID();
    args.p_request_id = requestId;
    const result = await callServiceRpc(rpcName,args);
    if(!result.ok) return response({ ok:false, error:{ code:"DELIVERY_OFFER_ACTION_FAILED", message:result.message.split(":").slice(1).join(":").trim() || "This delivery offer is no longer available." } },result.status);
    return response(result.data,200);
  }

  if (action === "push_subscribe" || action === "push_unsubscribe") {
    return response({ ok:false, error:{
      code:"PUSH_NOT_CONFIGURED",
      message:"Rider push notifications are temporarily unavailable. Keep the Rider app open and refresh offers."
    } },503);
  }

  const allowed = new Set(["assign", "picked_up", "delivered", "reject", "failed", "return_reported", "confirm_return"]);
  if (!allowed.has(action)) {
    return response({ ok: false, error: { code: "DELIVERY_ACTION_INVALID", message: "Supported actions: assign, accept_offer, decline_offer, picked_up, delivered, reject, failed, return_reported, confirm_return." } }, 400);
  }
  const payload: Record<string, unknown> = {
    action,
    delivery_task_id: body.delivery_task_id,
    actor_user_id: user.id,
  };
  if (action === "assign") payload.rider_user_id = body.rider_user_id;
  if (["reject", "failed"].includes(action)) payload.reason = body.reason ?? null;
  payload.request_id = typeof body.request_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id)
    ? body.request_id : crypto.randomUUID();

  const result = await callDeliveryRpc(payload);
  if (!result.ok) return response(result.body, result.status);
  return response(result.data, 200);
}

if (import.meta.main) {
  Deno.serve(handleDeliveryApiRequest);
}
