import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isValidDatabaseNow } from "../supabase/functions/flame-chick-catalog/publication-read-contract.mjs";

const root = "supabase/functions/";
const names = ["flame-chick-catalog", "flame-chick-order-api", "flame-chick-delivery-api", "flame-chick-staff-admin"];
const sources = Object.fromEntries(names.map((name) => [name, readFileSync(root + name + "/index.ts", "utf8")]));

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

test("Staff Admin continues to use its dedicated command RPCs", () => {
  assert.match(sources["flame-chick-staff-admin"], /flame_chick_staff_admin_command/);
  assert.match(sources["flame-chick-staff-admin"], /flame_chick_staff_admin_system_command/);
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


test("order API resolves private user_roles through the service key using production role_key", () => {
  const source = sources["flame-chick-order-api"];
  assert.match(source, /async function resolveStaffContext\(userId: string\)/);
  assert.match(source, /roleQuery\.set\("select", "role_key,branch_id,is_active"\)/);
  assert.match(source, /roleQuery\.set\("restaurant_id"/);
  assert.match(source, /readAsService\("user_roles\?/);
  assert.match(source, /view === "staff_context"/);
  assert.match(source, /query\.set\("branch_id", "eq\." \+ branchId\)/);
  assert.doesNotMatch(source, /roleQuery\.set\("select", "role,branch_id,is_active"\)/);
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

test("delivery API checks role_key and reads private role/profile rows server-side", () => {
  const source = sources["flame-chick-delivery-api"];
  assert.match(source, /roleQuery\.set\("select", "role_key,branch_id,is_active"\)/);
  assert.match(source, /roleQuery\.set\("role_key", "eq\.rider"\)/);
  assert.match(source, /readAsService\("user_roles\?/);
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


test("delivery dispatch reads are service-side and branch context is derived from role_key", () => {
  const source = sources["flame-chick-delivery-api"];
  assert.match(source, /async function resolveDispatchContext\(userId: string\)/);
  assert.match(source, /role_key,branch_id,is_active/);
  assert.match(source, /readAsService\("user_roles\?/);
  assert.match(source, /const staffContext = await resolveDispatchContext\(user\.id\)/);
  assert.match(source, /requestedBranch !== staffContext\.branchId/);
  assert.match(source, /readAsService\("delivery_tasks\?/);
  assert.match(source, /readAsService\("rider_profiles\?/);
  assert.doesNotMatch(source, /readAsUser\(/);
});
