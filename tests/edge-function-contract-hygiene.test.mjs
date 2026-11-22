import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
