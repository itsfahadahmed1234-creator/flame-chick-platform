// Flame Chick delivery dispatch API v1.
import { ApplicationServer, importVapidKeys, Urgency } from "jsr:@negrel/webpush@0.5.0";
// Separate function for Flame Chick rider dispatch and delivery lifecycle.
// All writes go through service-role-only public.hfp_manage_delivery(jsonb).
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

async function readAsUser(path: string, token: string, apiKey: string) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: "GET",
    headers: { apikey: apiKey, Authorization: "Bearer " + token, Accept: "application/json" },
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
          message: String(err.message ?? "Unable to read HFP delivery data."),
        },
      },
    };
  }
  return { ok: true as const, data };
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
          message: String(err.message ?? "Unable to read HFP delivery data."),
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
  taskQuery.set("delivery_assignments.status", "in.(assigned,accepted,arrived_at_restaurant,picked_up,out_for_delivery,failed)");
  taskQuery.set("status", "in.(assigned,accepted,arrived_at_restaurant,out_for_delivery,failed)");
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
  const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/hfp_manage_delivery", {
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
  if (!res.ok) {
    const err = isObject(data) ? data : {};
    const message = String(err.message ?? err.details ?? ("Delivery action failed (" + res.status + ")."));
    const code = String(err.code ?? "");
    const status = code === "P0002" ? 404 :
      code === "23505" ? 409 :
      code === "42501" ? 403 :
      code === "22023" || code === "22P02" ? 400 : 500;
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
  if (!res.ok) {
    const err = isObject(data) ? data : {};
    const message = String(err.message ?? err.details ?? "A delivery operation failed.");
    const code = String(err.code ?? "");
    return { ok:false as const, status:code === "P0002" ? 404 : code === "23505" ? 409 : code === "42501" ? 403 : code === "22023" ? 409 : 500, message, data };
  }
  return { ok:true as const, data };
}

async function isActiveRider(userId: string, token: string, apiKey: string) {
  const roleQuery = new URLSearchParams();
  roleQuery.set("select", "role,branch_id,is_active");
  roleQuery.set("user_id", "eq." + userId);
  roleQuery.set("role", "eq.rider");
  roleQuery.set("is_active", "eq.true");
  const roleResult = await readAsUser("user_roles?" + roleQuery.toString(), token, apiKey);
  if (!roleResult.ok) return { ok:false as const, status:roleResult.status, body:roleResult.body };
  const roles = Array.isArray(roleResult.data) ? roleResult.data : [];
  const riderRole = roles.find((row) => isObject(row) && row.role === "rider" && row.is_active === true && typeof row.branch_id === "string");
  if (!riderRole || typeof riderRole.branch_id !== "string") {
    return { ok:false as const, status:403, body:{ ok:false, error:{ code:"RIDER_ROLE_REQUIRED", message:"This account does not have an active Flame Chick rider role." } } };
  }
  const profileQuery = new URLSearchParams();
  profileQuery.set("select", "user_id,branch_id,is_active");
  profileQuery.set("user_id", "eq." + userId);
  profileQuery.set("branch_id", "eq." + riderRole.branch_id);
  profileQuery.set("is_active", "eq.true");
  const profileResult = await readAsUser("rider_profiles?" + profileQuery.toString(), token, apiKey);
  if (!profileResult.ok) return { ok:false as const, status:profileResult.status, body:profileResult.body };
  const profiles = Array.isArray(profileResult.data) ? profileResult.data : [];
  if (!profiles.some((row) => isObject(row) && row.user_id === userId && row.branch_id === riderRole.branch_id && row.is_active === true)) {
    return { ok:false as const, status:403, body:{ ok:false, error:{ code:"RIDER_PROFILE_REQUIRED", message:"Your active rider profile is missing for this branch." } } };
  }
  return { ok:true as const, branchId:riderRole.branch_id };
}

async function sendOfferPushBatch(offerIdsInput: string[]) {
  const offerIds = [...new Set(offerIdsInput.filter((id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))].slice(0, 100);
  if (!offerIds.length) return { sent:0, offers:0, subscriptions:0, skipped:true };

  const offerQuery = new URLSearchParams();
  offerQuery.set("select", "id,rider_user_id,expires_at,delivery_tasks!inner(id,status,area_name_snapshot,delivery_fee_snapshot,orders!inner(order_number,status))");
  offerQuery.set("id", "in.(" + offerIds.join(",") + ")");
  offerQuery.set("status", "eq.offered");
  offerQuery.set("expires_at", "gt." + new Date().toISOString());
  offerQuery.set("delivery_tasks.status", "eq.offering");
  offerQuery.set("delivery_tasks.orders.status", "eq.ready");

  const offers = await readAsService("delivery_task_offers?" + offerQuery.toString());
  if (!offers.ok) return { sent:0, offers:0, subscriptions:0, error:"Could not load delivery offers." };
  const offerRows = Array.isArray(offers.data) ? offers.data.filter(isObject) : [];
  if (!offerRows.length) return { sent:0, offers:0, subscriptions:0, skipped:true };

  const riderIds = [...new Set(offerRows.map((offer) => String(offer.rider_user_id ?? "")).filter((id) => id.length > 0))];
  if (!riderIds.length) return { sent:0, offers:offerRows.length, subscriptions:0, skipped:true };

  const subscriptionQuery = new URLSearchParams();
  subscriptionQuery.set("select", "id,rider_user_id,endpoint,p256dh,auth");
  subscriptionQuery.set("rider_user_id", "in.(" + riderIds.join(",") + ")");
  subscriptionQuery.set("is_active", "eq.true");
  const subResult = await readAsService("rider_push_subscriptions?" + subscriptionQuery.toString());
  if (!subResult.ok) return { sent:0, offers:offerRows.length, subscriptions:0, error:"Could not load rider notification subscriptions." };
  const subscriptions = Array.isArray(subResult.data) ? subResult.data.filter(isObject) : [];
  if (!subscriptions.length) return { sent:0, offers:offerRows.length, subscriptions:0, skipped:true };

  const configResult = await callServiceRpc("hfp_get_rider_push_config", {});
  const config = configResult.ok && isObject(configResult.data) ? configResult.data : null;
  if (!config || !isObject(config.vapid_keys) || typeof config.contact_information !== "string") {
    return { sent:0, offers:offerRows.length, subscriptions:subscriptions.length, error:"Push notification configuration is unavailable." };
  }

  const appServer = await ApplicationServer.new({
    contactInformation: config.contact_information,
    vapidKeys: await importVapidKeys(config.vapid_keys as { publicKey: JsonWebKey; privateKey: JsonWebKey }),
  });

  const subscriptionsByRider = new Map<string, Record<string, unknown>[]>();
  for (const row of subscriptions) {
    const riderId = String(row.rider_user_id ?? "");
    if (!riderId) continue;
    const list = subscriptionsByRider.get(riderId) ?? [];
    list.push(row);
    subscriptionsByRider.set(riderId, list);
  }

  const pushJobs: Array<{
    offerId:string;
    orderNumber:string;
    areaName:string;
    deliveryFee:string;
    subscription:Record<string, unknown>;
  }> = [];
  for (const offer of offerRows) {
    const riderId = String(offer.rider_user_id ?? "");
    const riderSubscriptions = subscriptionsByRider.get(riderId) ?? [];
    const task = Array.isArray(offer.delivery_tasks) ? offer.delivery_tasks[0] : offer.delivery_tasks;
    const order = isObject(task) ? (Array.isArray(task.orders) ? task.orders[0] : task.orders) : null;
    if (!riderId || !isObject(task) || !isObject(order)) continue;
    for (const subscription of riderSubscriptions) {
      if (typeof subscription.endpoint !== "string" || typeof subscription.p256dh !== "string" || typeof subscription.auth !== "string") continue;
      pushJobs.push({
        offerId:String(offer.id),
        orderNumber:String(order.order_number ?? "ready"),
        areaName:String(task.area_name_snapshot ?? "Delivery"),
        deliveryFee:String(task.delivery_fee_snapshot ?? 0),
        subscription,
      });
    }
  }

  let sent = 0;
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= pushJobs.length) return;
      const job = pushJobs[index];
      const row = job.subscription;
      try {
        const subscriber = appServer.subscribe({
          endpoint:String(row.endpoint),
          keys:{ p256dh:String(row.p256dh), auth:String(row.auth) },
        });
        await subscriber.pushTextMessage(JSON.stringify({
          title:"Flame Chick · New delivery offer",
          body:"Order " + job.orderNumber + " · " + job.areaName + " · Rs. " + job.deliveryFee + ". Open the Rider app to accept.",
          offer_id:job.offerId,
          url:"https://flame-chick-rider.vercel.app/",
        }), { urgency:Urgency.High, ttl:25, topic:job.offerId.replace(/-/g,"").slice(0,32) });
        sent++;
      } catch (error) {
        const status = isObject(error) && isObject(error.response) ? Number(error.response.status) : 0;
        if (status === 404 || status === 410) {
          await fetch(SUPABASE_URL + "/rest/v1/rider_push_subscriptions?id=eq." + encodeURIComponent(String(row.id)), {
            method:"PATCH",
            headers:{ apikey:SERVICE_KEY, Authorization:"Bearer "+SERVICE_KEY, "Content-Type":"application/json", Prefer:"return=minimal" },
            body:JSON.stringify({ is_active:false, updated_at:new Date().toISOString() }),
          }).catch(()=>{});
        }
        console.warn("Flame Chick push delivery failed.", status || String(error));
      }
    }
  };
  const workerCount = Math.min(8, pushJobs.length);
  await Promise.all(Array.from({length:workerCount}, () => worker()));
  return { sent, offers:offerRows.length, subscriptions:subscriptions.length };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  if (!SUPABASE_URL || !SERVICE_KEY || PUBLIC_KEYS.length === 0) {
    return response({ ok: false, error: { code: "CONFIG_MISSING", message: "The HFP delivery API is not configured." } }, 503);
  }

  // The database trigger calls this server-to-server hook using a random Vault-stored token.
  // This route is handled before the rider/staff JWT gate and never trusts a client-supplied rider id.
  const pushHook = req.headers.get("x-flame-chick-push-hook") ?? "";
  if (req.method === "POST" && pushHook) {
    let hookBody: unknown;
    try { hookBody = await req.json(); } catch { return response({ ok:false, error:{ code:"INVALID_JSON", message:"Invalid push hook payload." } },400); }
    if (!isObject(hookBody)) return response({ ok:false, error:{ code:"OFFER_IDS_REQUIRED", message:"A delivery offer id or list of offer ids is required." } },400);
    const requestedIds = typeof hookBody.offer_id === "string"
      ? [hookBody.offer_id]
      : Array.isArray(hookBody.offer_ids) ? hookBody.offer_ids.filter((id): id is string => typeof id === "string") : [];
    if (!requestedIds.length || requestedIds.length > 100) return response({ ok:false, error:{ code:"OFFER_IDS_INVALID", message:"Provide between 1 and 100 delivery offer ids." } },400);
    const verified = await callServiceRpc("hfp_verify_delivery_push_webhook", { p_token:pushHook });
    if (!verified.ok || verified.data !== true) return response({ ok:false, error:{ code:"PUSH_HOOK_UNAUTHORIZED", message:"The internal push hook is not authorized." } },401);
    const result = await sendOfferPushBatch(requestedIds);
    return response({ ok:true, ...result });
  }

  const apiKey = req.headers.get("apikey") ?? "";
  if (!PUBLIC_KEYS.includes(apiKey)) {
    return response({ ok: false, error: { code: "API_KEY_INVALID", message: "A valid HFP publishable API key is required." } }, 401);
  }

  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const user = await verifyStaffUser(token, apiKey);
  if (!user) return response({ ok: false, error: { code: "STAFF_AUTH_REQUIRED", message: "Sign in with an HFP staff account to access delivery dispatch." } }, 401);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const view = (url.searchParams.get("view") ?? "dispatch").toLowerCase();

    if (view === "rider") {
      const riderScope = await isActiveRider(user.id, token, apiKey);
      if (!riderScope.ok) return response(riderScope.body, riderScope.status);

      const query = new URLSearchParams();
      query.set("select",
        "id,status,recipient_name_snapshot,recipient_phone_snapshot,address_snapshot,area_name_snapshot,delivery_fee_snapshot,delivery_instructions_snapshot,dispatch_started_at,assigned_at,picked_up_at,out_for_delivery_at,delivered_at,failed_at,failure_reason,return_reported_at,return_confirmed_at,orders!inner(id,order_number,status,fulfillment_type,total,payment_status,customer_name,customer_phone,delivery_address,delivery_instructions,order_items(id,line_number,quantity,product_name_snapshot,variant_label_snapshot,deal_title_snapshot,line_total,item_notes,order_item_modifiers(id,modifier_group_name_snapshot,modifier_name_snapshot,quantity,total_price_snapshot))),delivery_assignments!inner(id,rider_user_id,status,is_current,assigned_at,accepted_at,arrived_at,picked_up_at,delivered_at,created_at)");
      query.set("branch_id", "eq." + riderScope.branchId);
      query.set("delivery_assignments.rider_user_id", "eq." + user.id);
      query.set("delivery_assignments.is_current", "eq.true");
      query.set("delivery_assignments.status", "in.(assigned,accepted,arrived_at_restaurant,out_for_delivery,picked_up,failed)");
      query.set("return_confirmed_at", "is.null");
      query.set("status", "in.(assigned,accepted,arrived_at_restaurant,out_for_delivery,picked_up,failed)");
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
      const riderScope = await isActiveRider(user.id, token, apiKey);
      if (!riderScope.ok) return response(riderScope.body, riderScope.status);
      const pushConfig = await callServiceRpc("hfp_get_rider_push_config", {});
      if (!pushConfig.ok || !isObject(pushConfig.data) || typeof pushConfig.data.vapid_public_key !== "string") {
        return response({ ok:false, error:{ code:"PUSH_NOT_CONFIGURED", message:"Push notifications are not configured." } },503);
      }
      return response({ ok:true, vapid_public_key:pushConfig.data.vapid_public_key });
    }
    if (view !== "dispatch") {
      return response({ ok: false, error: { code: "DELIVERY_VIEW_INVALID", message: "Choose dispatch or rider." } }, 400);
    }

    const branchId = (url.searchParams.get("branch_id") ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(branchId)) {
      return response({ ok: false, error: { code: "BRANCH_REQUIRED", message: "A valid HFP branch_id is required for the dispatch board." } }, 400);
    }

    const taskQuery = new URLSearchParams();
    taskQuery.set("select",
      "id,order_id,branch_id,status,recipient_name_snapshot,recipient_phone_snapshot,address_snapshot,area_name_snapshot,delivery_fee_snapshot,delivery_instructions_snapshot,dispatch_started_at,assigned_at,picked_up_at,out_for_delivery_at,delivered_at,failed_at,failure_reason,return_reported_at,return_confirmed_at,created_at,orders!inner(id,order_number,status,fulfillment_type,total,payment_status,customer_name,customer_phone,delivery_address,delivery_instructions,order_items(id,line_number,quantity,product_name_snapshot,variant_label_snapshot,deal_title_snapshot,line_total,item_notes,order_item_modifiers(id,modifier_group_name_snapshot,modifier_name_snapshot,quantity,total_price_snapshot))),delivery_assignments(id,rider_user_id,status,is_current,assigned_at,accepted_at,arrived_at,picked_up_at,delivered_at,created_at,ended_at,end_reason)");
    taskQuery.set("branch_id", "eq." + branchId);
    taskQuery.set("status", "in.(dispatch_pending,assigned,accepted,arrived_at_restaurant,out_for_delivery,failed)");
    taskQuery.set("orders.fulfillment_type", "eq.delivery");
    taskQuery.set("order", "created_at.asc");
    taskQuery.set("limit", "100");

    const riderQuery = new URLSearchParams();
    riderQuery.set("select", "user_id,rider_code,display_name,phone,availability_status,is_active");
    riderQuery.set("branch_id", "eq." + branchId);
    riderQuery.set("is_active", "eq.true");
    riderQuery.set("order", "display_name.asc");

    const [tasks, riders] = await Promise.all([
      readAsUser("delivery_tasks?" + taskQuery.toString(), token, apiKey),
      readAsUser("rider_profiles?" + riderQuery.toString(), token, apiKey),
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
    const roleQuery = new URLSearchParams();
    roleQuery.set("select", "role,branch_id,is_active");
    roleQuery.set("user_id", "eq." + user.id);
    roleQuery.set("role", "eq.rider");
    roleQuery.set("is_active", "eq.true");
    const rolesResult = await readAsUser("user_roles?" + roleQuery.toString(), token, apiKey);
    if (!rolesResult.ok) return response(rolesResult.body, rolesResult.status);
    const roles = Array.isArray(rolesResult.data) ? rolesResult.data : [];
    const riderRole = roles.find((row) => isObject(row) && row.role === "rider" && row.is_active === true && typeof row.branch_id === "string");
    if (!riderRole || typeof riderRole.branch_id !== "string") {
      return response({ ok:false, error:{ code:"RIDER_ROLE_REQUIRED", message:"This account does not have an active Flame Chick rider role." } },403);
    }
    const profileQuery = new URLSearchParams();
    profileQuery.set("select", "user_id,branch_id,is_active");
    profileQuery.set("user_id", "eq." + user.id);
    profileQuery.set("branch_id", "eq." + riderRole.branch_id);
    profileQuery.set("is_active", "eq.true");
    const profileResult = await readAsUser("rider_profiles?" + profileQuery.toString(), token, apiKey);
    if (!profileResult.ok) return response(profileResult.body, profileResult.status);
    const profiles = Array.isArray(profileResult.data) ? profileResult.data : [];
    if (!profiles.some((row) => isObject(row) && row.user_id === user.id && row.branch_id === riderRole.branch_id && row.is_active === true)) {
      return response({ ok:false, error:{ code:"RIDER_PROFILE_REQUIRED", message:"Your active rider profile is missing for this branch." } },403);
    }
    const online = body.online !== false;
    const result = await setRiderPresence(user.id, riderRole.branch_id, online, body.update_preference === true);
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
    const rpcName = action === "accept_offer" ? "hfp_accept_delivery_offer" : "hfp_decline_delivery_offer";
    const args:Record<string,unknown> = { p_offer_id:offerId, p_rider_user_id:user.id };
    if(action === "decline_offer") args.p_reason = body.reason ?? null;
    const result = await callServiceRpc(rpcName,args);
    if(!result.ok) return response({ ok:false, error:{ code:"DELIVERY_OFFER_ACTION_FAILED", message:result.message.split(":").slice(1).join(":").trim() || "This delivery offer is no longer available." } },result.status);
    return response(result.data,200);
  }

  if (action === "push_subscribe" || action === "push_unsubscribe") {
    const riderScope = await isActiveRider(user.id, token, apiKey);
    if (!riderScope.ok) return response(riderScope.body, riderScope.status);
    if(action === "push_subscribe") {
      const sub = body.subscription;
      if(!isObject(sub) || typeof sub.endpoint !== "string" || typeof sub.p256dh !== "string" || typeof sub.auth !== "string") {
        return response({ ok:false, error:{ code:"PUSH_SUBSCRIPTION_INVALID", message:"The browser notification subscription is invalid." } },400);
      }
      let endpoint:URL;
      try { endpoint=new URL(sub.endpoint); } catch { return response({ ok:false, error:{ code:"PUSH_ENDPOINT_INVALID", message:"The notification endpoint is invalid." } },400); }
      if(endpoint.protocol !== "https:" || sub.endpoint.length>2048 || sub.p256dh.length>256 || sub.auth.length>256) {
        return response({ ok:false, error:{ code:"PUSH_SUBSCRIPTION_INVALID", message:"The notification subscription is not valid." } },400);
      }
      const url=SUPABASE_URL+"/rest/v1/rider_push_subscriptions?on_conflict=endpoint";
      const saved=await fetch(url,{
        method:"POST",
        headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=representation"},
        body:JSON.stringify({rider_user_id:user.id,endpoint:sub.endpoint,p256dh:sub.p256dh,auth:sub.auth,user_agent:String(body.user_agent||"").slice(0,500),is_active:true,last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()}),
        cache:"no-store",
      });
      const savedData=await saved.json().catch(()=>[]);
      if(!saved.ok) return response({ok:false,error:{code:"PUSH_SUBSCRIPTION_SAVE_FAILED",message:"Could not save notification settings."}},500);
      return response({ok:true,subscribed:true});
    } else {
      const endpoint = typeof body.endpoint==="string" ? body.endpoint : "";
      if(!endpoint) return response({ok:false,error:{code:"PUSH_ENDPOINT_REQUIRED",message:"The notification endpoint is required."}},400);
      const disabled=await fetch(SUPABASE_URL+"/rest/v1/rider_push_subscriptions?rider_user_id=eq."+encodeURIComponent(user.id)+"&endpoint=eq."+encodeURIComponent(endpoint),{
        method:"PATCH",
        headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=minimal"},
        body:JSON.stringify({is_active:false,updated_at:new Date().toISOString()}),
        cache:"no-store",
      });
      if(!disabled.ok)return response({ok:false,error:{code:"PUSH_SUBSCRIPTION_REMOVE_FAILED",message:"Could not disable notifications."}},500);
      return response({ok:true,subscribed:false});
    }
  }

  const allowed = new Set(["assign", "accept", "arrive", "picked_up", "delivered", "reject", "failed", "return_reported", "confirm_return"]);
  if (!allowed.has(action)) {
    return response({ ok: false, error: { code: "DELIVERY_ACTION_INVALID", message: "Supported actions: assign, accept, accept_offer, decline_offer, arrive, picked_up, delivered, reject, failed, return_reported, confirm_return." } }, 400);
  }
  const payload: Record<string, unknown> = {
    action,
    delivery_task_id: body.delivery_task_id,
    actor_user_id: user.id,
  };
  if (action === "assign") payload.rider_user_id = body.rider_user_id;
  if (["reject", "failed"].includes(action)) payload.reason = body.reason ?? null;

  const result = await callDeliveryRpc(payload);
  if (!result.ok) return response(result.body, result.status);
  return response(result.data, 200);
});