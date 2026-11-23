import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isValidDatabaseNow } from "../supabase/functions/flame-chick-catalog/publication-read-contract.mjs";

const root = "supabase/functions/";
const names = ["flame-chick-catalog", "flame-chick-order-api", "flame-chick-delivery-api", "flame-chick-staff-admin"];
const sources = Object.fromEntries(names.map((name) => [name, readFileSync(root + name + "/index.ts", "utf8")]));
const paymentMigration=readFileSync("supabase/migrations/20261123173000_flame_chick_payment_collection_v1.sql","utf8");
const deliveryFixture=readFileSync("supabase/tests/flame_chick_delivery_commands_v1.sql","utf8");


test("Edge Function sources contain no retired HFP identifiers", () => {
  const all = Object.values(sources).join("\n");
  const retired = ["H", "F", "P"].join("");
  assert.equal(new RegExp("\\b" + retired + "\\b", "i").test(all), false);
  assert.equal(/hfp_/i.test(all), false);
});

test("catalog function reads the current secret-key map", () => {
  assert.match(sources["flame-chick-catalog"], /SUPABASE_SECRET_KEYS/);
  assert.match(sources["flame-chick-catalog"], /SUPABASE_SECRET_KEY/);
});

test("catalog RPC timestamp metadata is validated in published and unpublished states", () => {
  const source = sources["flame-chick-catalog"];
  const captureIndex = source.indexOf("const databaseNow = result.databaseNow;");
  const validateIndex = source.indexOf("if (!isValidDatabaseNow(databaseNow))");
  const unpublishedIndex = source.indexOf("if (result.published === false)");
  assert.ok(captureIndex >= 0, "catalog source must capture the RPC databaseNow field");
  assert.ok(validateIndex > captureIndex, "catalog source must validate the captured timestamp");
  assert.ok(unpublishedIndex > validateIndex, "timestamp validation must run before the unpublished branch");
  assert.match(source, /databaseNow,\s*snapshot: null/);
  assert.doesNotMatch(source, /databaseNow:\s*typeof result\.databaseNow/);
});

test("database timestamp validator accepts only real UTC timestamps with up to six fractional digits", () => {
  assert.equal(isValidDatabaseNow("2026-11-23T04:05:06Z"), true);
  assert.equal(isValidDatabaseNow("2026-11-23T04:05:06.123456Z"), true);

  for (const value of [
    null,
    undefined,
    "",
    "not-a-time",
    "2026-11-23T04:05:06+00:00",
    "2026-11-23T04:05:06.1234567Z",
    "2026-02-30T04:05:06Z",
    "2026-11-23T25:05:06Z"
  ]) {
    assert.equal(isValidDatabaseNow(value), false, String(value));
  }
});

test("order and delivery RPC contracts use Flame Chick names", () => {
  assert.match(sources["flame-chick-order-api"], /flame_chick_create_order/);
  assert.match(sources["flame-chick-order-api"], /flame_chick_update_order_status/);
  assert.match(sources["flame-chick-order-api"], /flame_chick_check_website_order_rate_limit/);
  assert.match(sources["flame-chick-delivery-api"], /flame_chick_manage_delivery/);
  assert.match(sources["flame-chick-delivery-api"], /flame_chick_accept_delivery_offer/);
  assert.match(sources["flame-chick-delivery-api"], /flame_chick_decline_delivery_offer/);
});

test("delivery API no longer queries or selects the retired arrival step", () => {
  const source = sources["flame-chick-delivery-api"];
  assert.doesNotMatch(source, /arrived_at_restaurant|\barrived_at\b/);
  assert.match(source, /taskQuery\.set\("status", "in\.\(accepted,out_for_delivery,failed\)"\)/);
});

test("Staff Admin continues to use its dedicated command RPCs", () => {
  assert.match(sources["flame-chick-staff-admin"], /flame_chick_staff_admin_command/);
  assert.match(sources["flame-chick-staff-admin"], /flame_chick_staff_admin_system_command/);
});

test("Order and Delivery APIs resolve staff roles through the service-only role projection RPC", () => {
  for (const name of ["flame-chick-order-api", "flame-chick-delivery-api"]) {
    assert.match(sources[name], /flame_chick_get_staff_role_rows/);
    assert.doesNotMatch(sources[name], /readAsService\("user_roles\?/);
  }
});

test("Staff Admin relies on gateway JWT validation plus database actor authorization", () => {
  const config = readFileSync("supabase/config.toml", "utf8");
  assert.match(config, /\[functions\.flame-chick-staff-admin\][\s\S]*?verify_jwt\s*=\s*true/);
  assert.match(sources["flame-chick-staff-admin"], /flame_chick_staff_admin_command/);
  assert.doesNotMatch(sources["flame-chick-staff-admin"], /async function requireUser\s*\(/);
  assert.match(sources["flame-chick-staff-admin"], /if\(!t\)throw new ApiError\("STAFF_AUTH_REQUIRED"/);
});

test("Staff Admin uses exact-origin policy and the dedicated invite callback", () => {
  assert.match(sources["flame-chick-staff-admin"], /parseAllowedOrigins/);
  assert.match(sources["flame-chick-staff-admin"], /isSafeInviteRedirect/);
  assert.match(sources["flame-chick-staff-admin"], /ORIGIN_CONFIG_VALID/);
  assert.match(sources["flame-chick-staff-admin"], /staffCorsHeaders/);
  assert.match(sources["flame-chick-staff-admin"], /verify_jwt/);
});


test("order API resolves roles through the service-only Staff Role Projection RPC", () => {
  const source = sources["flame-chick-order-api"];
  assert.match(source, /async function resolveStaffContext\(userId: string\)/);
  assert.match(source, /\/rest\/v1\/rpc\/flame_chick_get_staff_role_rows/);
  assert.match(source, /p_user_id: userId/);
  assert.match(source, /row\.role_key/);
  assert.match(source, /row\.restaurant_id === restaurant\.id/);
  assert.doesNotMatch(source, /readAsService\("user_roles\?/);
  assert.match(source, /view === "staff_context"/);
  assert.match(source, /query\.set\("branch_id", "eq\." \+ branchId\)/);
});

test("POS browser obtains its own branch role through order API instead of direct private table access", () => {
  const source = readFileSync("apps/flame-chick-pos/index.html", "utf8");
  assert.match(source, /FLAME_CHICK_ALLOWED_POS_ROLES=new Set\(\['owner','admin','manager','cashier'\]\)/);
  assert.match(source, /API_URL\+'\?view=staff_context'/);
  assert.doesNotMatch(source, /FLAME_CHICK_REST_URL\+'\/user_roles/);
  assert.doesNotMatch(source, /'kitchen'/);
});

test("Rider browser obtains its profile through the authenticated delivery API", () => {
  const source = readFileSync("apps/flame-chick-rider/index.html", "utf8");
  assert.match(source, /DELIVERY_API\+'\?view=profile'/);
  assert.match(source, /ORDER_API\+'\?view=staff_context'/);
  assert.doesNotMatch(source, /REST_URL\+'\/user_roles/);
});

test("delivery API checks Rider roles through the restricted projection RPC", () => {
  const source = sources["flame-chick-delivery-api"];
  assert.match(source, /flame_chick_get_staff_role_rows/);
  assert.match(source, /row\.restaurant_id === restaurantId/);
  assert.match(source, /row\.role_key === "rider"/);
  assert.doesNotMatch(source, /readAsService\("user_roles\?/);
  assert.match(source, /view === "profile"/);
  assert.match(source, /readAsService\("rider_profiles\?/);
  assert.doesNotMatch(source, /readAsUser\("user_roles\?/);
});


test("Rider API refuses accounts with ambiguous active branch assignments", () => {
  const source = sources["flame-chick-delivery-api"];
  assert.match(source, /const riderBranches = \[\.\.\.new Set\(riderRoles\.map/);
  assert.match(source, /riderBranches\.length !== 1/);
  assert.match(source, /RIDER_BRANCH_SELECTION_REQUIRED/);
});


test("delivery dispatch resolves branch context through the restricted role projection RPC", () => {
  const source = sources["flame-chick-delivery-api"];
  assert.match(source, /async function resolveDispatchContext\(userId: string\)/);
  assert.match(source, /flame_chick_get_staff_role_rows/);
  assert.match(source, /row\.restaurant_id === restaurantId/);
  assert.match(source, /const staffContext = await resolveDispatchContext\(user\.id\)/);
  assert.match(source, /requestedBranch !== staffContext\.branchId/);
  assert.match(source, /readAsService\("delivery_tasks\?/);
  assert.match(source, /readAsService\("rider_profiles\?/);
  assert.doesNotMatch(source, /readAsUser\(/);
});


test("order API exposes authenticated self staff-context to Rider before restricting POS order-board roles", () => {
  const source=sources["flame-chick-order-api"];
  const getStart=source.indexOf('if (req.method === "GET")');
  const contextAt=source.indexOf('if (view === "staff_context")',getStart);
  const boardGateAt=source.indexOf('const canReadBoard = await verifyStaffRole',getStart);
  assert.ok(getStart>=0&&contextAt>getStart&&boardGateAt>contextAt);
  assert.match(source,/\["owner", "admin", "manager", "cashier"\]/);
  assert.doesNotMatch(source,/\["owner", "admin", "manager", "cashier", "kitchen"\]/);
});


test("Delivery dispatch provides fields POS uses to determine rider availability", () => {
  const source=sources["flame-chick-delivery-api"];
  assert.match(source,/riderQuery\.set\("select", "user_id,rider_code,display_name,phone,availability_status,accepting_jobs,last_seen_at,is_active"\)/);
});

test("Order API keeps delivered orders active until payment collection and exposes returned orders to history", () => {
  const source=sources["flame-chick-order-api"];
  assert.match(source,/active: \["new", "accepted", "preparing", "ready", "out_for_delivery", "delivered"\]/);
  assert.match(source,/all: \[[^\]]*"returned"\]/);
});


test("Order API exposes payment collection only to authenticated POS staff and derives actor from Auth", () => {
  const source=sources["flame-chick-order-api"];
  const start=source.indexOf('if (action === "collect_payment")');
  const end=source.indexOf('if (action === "update_status"',start);
  const route=source.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(route,/verifyStaffUser\(token, apiKey\)/);
  assert.match(route,/verifyStaffRole\(user\.id, token, apiKey, \["owner","admin","manager","cashier"\]\)/);
  assert.match(route,/actor_user_id: user\.id/);
  assert.match(route,/request_id: requestId/);
  assert.match(route,/amount: body\.amount/);
  assert.match(route,/flame_chick_collect_order_payment/);
  assert.doesNotMatch(route,/actor_user_id: body\.|\["rider"\]/);
});

test("Payment collection database command is row-locked, idempotent, branch-authorized and service-role-only", () => {
  assert.match(paymentMigration,/CREATE OR REPLACE FUNCTION public\.flame_chick_collect_order_payment\(p_payload jsonb\)/);
  assert.match(paymentMigration,/SELECT o\.\* INTO v_order[\s\S]*?WHERE o\.id=v_order_id[\s\S]*?FOR UPDATE/);
  assert.match(paymentMigration,/app_private\.flame_chick_delivery_staff_role\(/);
  assert.match(paymentMigration,/idempotency_key=v_request_id::text/);
  assert.match(paymentMigration,/PAYMENT_IDEMPOTENCY_CONFLICT/);
  assert.match(paymentMigration,/PAYMENT_AMOUNT_EXCEEDS_BALANCE/);
  assert.match(paymentMigration,/INSERT INTO public\.payments/);
  assert.match(paymentMigration,/payment_status=CASE WHEN v_complete THEN 'paid' ELSE 'partially_paid' END/);
  assert.match(paymentMigration,/completed_at=CASE WHEN v_complete THEN v_now ELSE NULL END/);
  assert.match(paymentMigration,/GRANT EXECUTE ON FUNCTION public\.flame_chick_collect_order_payment\(jsonb\) TO service_role/);
  assert.match(paymentMigration,/has_function_privilege\('anon',v_oid,'EXECUTE'\)/);
  assert.doesNotMatch(paymentMigration,/GRANT .* ON TABLE public\.payments/);
});

test("Disposable delivery/payment behavior fixture covers partial/full collection and financial boundaries", () => {
  for(const marker of [
    "RIDER_PAYMENT_COLLECTION_NOT_DENIED",
    "PARTIAL_PAYMENT_COLLECTION_FAILED",
    "PAYMENT_AMOUNT_PRECISION_NOT_ENFORCED",
    "PARTIAL_PAYMENT_RETRY_NOT_IDEMPOTENT",
    "PAYMENT_IDEMPOTENCY_CONFLICT_NOT_ENFORCED",
    "PAYMENT_OVER_COLLECTION_NOT_DENIED",
    "FINAL_PAYMENT_COLLECTION_DID_NOT_COMPLETE_ORDER",
    "FINAL_PAYMENT_RETRY_NOT_IDEMPOTENT",
    "RETURNED_ORDER_PAYMENT_COLLECTION_NOT_DENIED"
  ]) assert.ok(deliveryFixture.includes(marker),marker);
});
