// Flame Chick staff administration API.
// Auth Admin operations are server-side only; never ship the service-role key to the browser.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ADMIN_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SECRET_KEYS = (() => {
  try {
    const v = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string,string> : {};
  } catch { return {} as Record<string,string>; }
})();
const SERVICE_KEY = ADMIN_KEY || String(SECRET_KEYS.default ?? Object.values(SECRET_KEYS)[0] ?? "");
const PUBLIC_KEYS = [
  "sb_publishable_89MQIj_drF15IrF05ZLt0w_txUjPMxy",
  ...Object.values((() => {
    try {
      const v = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
      return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string,string> : {};
    } catch { return {} as Record<string,string>; }
  })()),
  Deno.env.get("SUPABASE_ANON_KEY") ?? "",
].map(String).filter(Boolean);

const RESTAURANT_SLUG = "flame-chick";
const INVITE_REDIRECT = Deno.env.get("FLAME_CHICK_RIDER_PORTAL_URL") ?? "";
// This endpoint uses explicit API-key + Supabase user-JWT validation and does not use cookies.
// Allow browser previews and the eventual dedicated Flame Chick Admin origin; authorization remains server-enforced.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, content-type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
function isObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function uuid(v: unknown): string | null {
  const s = String(v ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s) ? s : null;
}
function text(v: unknown, max = 180): string {
  return String(v ?? "").trim().slice(0, max);
}
async function serviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(SUPABASE_URL + path, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}
async function serviceRows(path: string): Promise<any[]> {
  const r = await serviceFetch("/rest/v1/" + path);
  const raw = await r.text();
  if (!r.ok) throw new Error("DATABASE_READ_FAILED: " + raw.slice(0, 350));
  const data = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(data)) throw new Error("DATABASE_BAD_RESPONSE");
  return data;
}
async function serviceRpc(name: string, body: unknown): Promise<any> {
  const r = await serviceFetch("/rest/v1/rpc/" + name, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await r.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!r.ok) {
    const message = String(data?.message ?? data?.details ?? data?.hint ?? raw ?? "Role action failed");
    throw new Error(message);
  }
  return data;
}
async function authUserFromToken(token: string, apiKey: string): Promise<{id:string,email?:string}|null> {
  if (!token) return null;
  const r = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: apiKey, Authorization: "Bearer " + token, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) return null;
  const u = await r.json();
  return isObject(u) && typeof u.id === "string" ? { id: u.id, email: u.email } : null;
}
async function requireActor(req: Request): Promise<{id:string,email?:string}|null> {
  const apiKey = req.headers.get("apikey") ?? "";
  if (!PUBLIC_KEYS.includes(apiKey)) return null;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return await authUserFromToken(token, apiKey);
}
async function branchAndRestaurant(branchId: string): Promise<{id:string;name:string}|null> {
  const restaurants = await serviceRows("restaurants?slug=eq." + RESTAURANT_SLUG + "&is_active=eq.true&select=id&limit=1");
  const restaurantId = restaurants[0]?.id;
  if (!restaurantId) return null;
  const branches = await serviceRows(
    "branches?id=eq." + branchId +
    "&restaurant_id=eq." + restaurantId +
    "&is_active=eq.true&select=id,name,branch_code&limit=1"
  );
  return branches[0] ? { id: String(branches[0].id), name: String(branches[0].name ?? "Branch") } : null;
}
async function activeRole(actorId: string, branchId: string): Promise<string|null> {
  const rows = await serviceRows(
    "user_roles?user_id=eq." + actorId +
    "&or=(branch_id.is.null,branch_id.eq." + branchId +
    ")&is_active=eq.true&select=role&limit=10"
  );
  return rows.some(x => x.role === "owner") ? "owner" :
    rows.some(x => x.role === "admin") ? "admin" :
    rows.some(x => x.role === "manager") ? "manager" : null;
}
async function listAuthUsers(): Promise<any[]> {
  if (!SERVICE_KEY) throw new Error("AUTH_ADMIN_NOT_CONFIGURED");
  const all: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(SUPABASE_URL + "/auth/v1/admin/users?page=" + page + "&per_page=1000", {
      headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, Accept: "application/json" },
      cache: "no-store",
    });
    const raw = await r.text();
    if (!r.ok) throw new Error("AUTH_USER_LIST_FAILED: " + raw.slice(0, 300));
    const data = raw ? JSON.parse(raw) : {};
    const users = Array.isArray(data) ? data : Array.isArray(data.users) ? data.users : [];
    all.push(...users);
    if (users.length < 1000) break;
  }
  return all;
}
async function handleList(actor: {id:string}, url: URL): Promise<Response> {
  const restaurantRows = await serviceRows("restaurants?slug=eq." + RESTAURANT_SLUG + "&is_active=eq.true&select=id&limit=1");
  const restaurantId = String(restaurantRows[0]?.id ?? "");
  if (!restaurantId) return json({ ok:false, error:{code:"TENANT_NOT_FOUND",message:"Flame Chick tenant is not active."} },404);
  const branches = await serviceRows(
    "branches?restaurant_id=eq." + restaurantId + "&is_active=eq.true&select=id,name,branch_code&order=created_at.asc"
  );
  const branchId = uuid(url.searchParams.get("branch_id")) ?? String(branches[0]?.id ?? "");
  if (!branchId) return json({ ok:false, error:{code:"BRANCH_NOT_FOUND",message:"No active branch was found."} },404);
  const branch = await branchAndRestaurant(branchId);
  if (!branch) return json({ ok:false, error:{code:"BRANCH_INVALID",message:"That branch is not part of Flame Chick."} },400);
  const role = await activeRole(actor.id, branchId);
  if (!role) return json({ ok:false, error:{code:"STAFF_ADMIN_FORBIDDEN",message:"An active Flame Chick owner, admin or manager role is required."} },403);

  const [roleRows, authUsers, auditRows] = await Promise.all([
    serviceRows("user_roles?branch_id=eq." + branchId + "&select=id,user_id,branch_id,role,is_active,created_at,created_by&order=created_at.asc"),
    listAuthUsers(),
    role === "owner" || role === "admin" || role === "manager"
      ? serviceRows("staff_role_audit?branch_id=eq." + branchId + "&select=id,created_at,action,old_role,new_role,old_is_active,new_is_active,details,actor_user_id,target_user_id&order=created_at.desc&limit=100")
      : Promise.resolve([]),
  ]);
  const ids = [...new Set(roleRows.map(x => String(x.user_id)))];
  const inIds = ids.length ? "in.(" + ids.join(",") + ")" : "eq.00000000-0000-0000-0000-000000000000";
  const [profiles, riderProfiles] = await Promise.all([
    serviceRows("user_profiles?id=" + inIds + "&select=id,full_name,phone,is_active"),
    serviceRows("rider_profiles?branch_id=eq." + branchId + "&user_id=" + inIds + "&select=user_id,rider_code,display_name,phone,availability_status,is_active"),
  ]);
  const authById = new Map(authUsers.map(u => [String(u.id), u]));
  const profileById = new Map(profiles.map(p => [String(p.id), p]));
  const riderById = new Map(riderProfiles.map(p => [String(p.user_id), p]));
  const members = roleRows.map(row => {
    const u = authById.get(String(row.user_id)) ?? {};
    const p = profileById.get(String(row.user_id)) ?? {};
    const rider = riderById.get(String(row.user_id)) ?? null;
    return {
      role_id: row.id,
      user_id: row.user_id,
      branch_id: row.branch_id,
      role: row.role,
      is_active: row.is_active === true,
      created_at: row.created_at,
      full_name: p.full_name ?? u.user_metadata?.full_name ?? "",
      phone: p.phone ?? rider?.phone ?? "",
      email: u.email ?? "",
      email_confirmed: !!u.email_confirmed_at,
      invited_at: u.invited_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      profile_active: p.is_active !== false,
      rider: rider ? {
        rider_code: rider.rider_code,
        display_name: rider.display_name,
        availability_status: rider.availability_status,
        is_active: rider.is_active === true,
      } : null,
    };
  });
  return json({ ok:true, role, branch, branches, members, audit:auditRows });
}
async function findAuthUserByEmail(email: string): Promise<any|null> {
  const users = await listAuthUsers();
  return users.find(u => String(u.email ?? "").toLowerCase() === email.toLowerCase()) ?? null;
}
async function inviteAuthUser(email: string, fullName: string, phone: string): Promise<any> {
  if (!ADMIN_KEY) throw new Error("AUTH_ADMIN_NOT_CONFIGURED");
  if (!INVITE_REDIRECT) throw new Error("AUTH_INVITE_REDIRECT_NOT_CONFIGURED");
  const url = SUPABASE_URL + "/auth/v1/invite?redirect_to=" + encodeURIComponent(INVITE_REDIRECT);
  const r = await fetch(url, {
    method: "POST",
    headers: { apikey: ADMIN_KEY, Authorization: "Bearer " + ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, data: { full_name: fullName, phone } }),
    cache: "no-store",
  });
  const raw = await r.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch {}
  if (!r.ok) throw new Error("AUTH_INVITE_FAILED: " + String(data.msg ?? data.message ?? data.error_description ?? raw).slice(0, 260));
  const user = data.user ?? data;
  if (!user?.id) throw new Error("AUTH_INVITE_BAD_RESPONSE");
  return user;
}
async function handlePost(req: Request, actor: {id:string}): Promise<Response> {
  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > 12000) return json({ok:false,error:{code:"REQUEST_TOO_LARGE",message:"Request is too large."}},413);
    body = JSON.parse(raw);
  } catch { return json({ok:false,error:{code:"INVALID_JSON",message:"A valid JSON request body is required."}},400); }
  if (!isObject(body)) return json({ok:false,error:{code:"INVALID_REQUEST",message:"Request body must be an object."}},400);
  const action = text(body.action,40).toLowerCase();
  const branchId = uuid(body.branch_id);
  if (!branchId) return json({ok:false,error:{code:"BRANCH_REQUIRED",message:"Choose a branch."}},400);
  const branch = await branchAndRestaurant(branchId);
  if (!branch) return json({ok:false,error:{code:"BRANCH_INVALID",message:"That branch is not part of Flame Chick."}},400);
  const actorRole = await activeRole(actor.id, branchId);
  if (actorRole !== "owner") return json({ok:false,error:{code:"OWNER_REQUIRED",message:"Only the Flame Chick owner can invite or change team roles."}},403);

  if (action === "invite") {
    const email = text(body.email,254).toLowerCase();
    const fullName = text(body.full_name,120);
    const phone = text(body.phone,40);
    const role = text(body.role,20).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ok:false,error:{code:"EMAIL_INVALID",message:"Enter a valid email address."}},400);
    if (!fullName) return json({ok:false,error:{code:"NAME_REQUIRED",message:"Enter the staff member's full name."}},400);
    if (!["owner","admin","manager","cashier","kitchen","rider"].includes(role)) return json({ok:false,error:{code:"ROLE_INVALID",message:"Choose a supported role."}},400);
    let authUser = await findAuthUserByEmail(email);
    let invitationSent = false;
    if (!authUser) {
      try {
        authUser = await inviteAuthUser(email, fullName, phone);
        invitationSent = true;
      } catch (error) {
        return json({ok:false,error:{code:"INVITE_FAILED",message:String((error as Error).message).replace(/^AUTH_INVITE_FAILED:\s*/,"")}},400);
      }
    }
    try {
      const result = await serviceRpc("hfp_manage_staff_role", {
        p_payload: {
          action:"assign",
          actor_user_id:actor.id,
          target_user_id:authUser.id,
          branch_id:branchId,
          role,
          full_name:fullName,
          phone,
          invitation_sent:invitationSent,
        },
      });
      return json({
        ok:true,
        invitation_sent:invitationSent,
        existing_auth_user:!invitationSent,
        email,
        email_confirmed:!!authUser.email_confirmed_at,
        user_id:authUser.id,
        result,
        message: invitationSent
          ? "Invitation sent. The team member can set their own password using the email link."
          : "This email already has a Supabase Auth account. Its Flame Chick role has been linked; do not send a duplicate invitation.",
      });
    } catch (error) {
      return json({
        ok:false,
        invitation_sent:invitationSent,
        auth_user_created:invitationSent,
        existing_auth_user:!invitationSent,
        user_id:authUser.id,
        error:{code:"ROLE_SAVE_FAILED",message:String((error as Error).message)},
      },400);
    }
  }

  if (action === "set_active") {
    const targetId = uuid(body.user_id);
    const roleId = uuid(body.role_id);
    if (!targetId || !roleId || typeof body.is_active !== "boolean") {
      return json({ok:false,error:{code:"ROLE_FIELDS_REQUIRED",message:"Select a role and active state."}},400);
    }
    const result = await serviceRpc("hfp_manage_staff_role", {
      p_payload: {
        action:"set_active",
        actor_user_id:actor.id,
        target_user_id:targetId,
        role_id:roleId,
        branch_id:branchId,
        is_active:body.is_active,
      },
    });
    return json({ok:true,result});
  }
  return json({ok:false,error:{code:"ACTION_INVALID",message:"Choose invite or set_active."}},400);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok",{status:200,headers:CORS});
  if (!SUPABASE_URL || !SERVICE_KEY || PUBLIC_KEYS.length === 0) return json({ok:false,error:{code:"CONFIG_MISSING",message:"Staff administration is not configured."}},503);
  if (req.method !== "GET" && req.method !== "POST") return json({ok:false,error:{code:"METHOD_NOT_ALLOWED",message:"GET or POST only."}},405);
  const actor = await requireActor(req);
  if (!actor) return json({ok:false,error:{code:"STAFF_AUTH_REQUIRED",message:"Sign in with a Flame Chick staff account."}},401);
  try {
    if (req.method === "GET") return await handleList(actor,new URL(req.url));
    return await handlePost(req,actor);
  } catch (error) {
    const message = String((error as Error)?.message ?? "Staff request failed");
    const code = message.split(":")[0].match(/^[A-Z0-9_]{3,64}$/)?.[0] ?? "STAFF_API_ERROR";
    const status = /OWNER_REQUIRED|FORBIDDEN|DENIED/.test(code) ? 403 :
      /NOT_FOUND/.test(code) ? 404 :
      /INVALID|REQUIRED|PROTECTED|HAS_ACTIVE/.test(code) ? 400 : 500;
    return json({ok:false,error:{code,message:message.split(":").slice(1).join(":").trim()||message}},status);
  }
});
