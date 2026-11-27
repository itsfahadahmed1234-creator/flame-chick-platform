import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("Delivery API requires gateway JWT verification and retains database authorization", () => {
  const config = read("supabase/config.toml");
  const source = read("supabase/functions/flame-chick-delivery-api/index.ts");
  assert.match(config, /\[functions\.flame-chick-delivery-api\][\s\S]*?verify_jwt\s*=\s*false/);
  assert.match(source, /verifyStaffUser\(token, apiKey\)/);
  assert.match(source, /\/auth\/v1\/user/);
  assert.match(source, /flame_chick_get_staff_context/);
  assert.match(source, /flame_chick_manage_delivery/);
  assert.match(source, /if \(req\.method === "OPTIONS"\)[\s\S]*?status: 200/);
});

test("Website order configuration reads run concurrently and remain fail-closed", () => {
  const source = read("supabase/functions/flame-chick-order-api/index.ts");
  assert.match(source, /const \[areas,settings\] = await Promise\.all\(\[[\s\S]*?delivery_areas[\s\S]*?branch_delivery_settings/);
  assert.match(source, /const \[catalog,restaurant\] = await Promise\.all\(\[[\s\S]*?readPublishedV3Catalog\(\)[\s\S]*?readFlameChickRestaurant\(\)/);
  assert.match(source, /const branchResults = await Promise\.all\(branchRead\.branches\.map/);
  assert.match(source, /branchResults\.some\(result=>!result\.ok\)/);
  assert.match(source, /WEBSITE_ORDER_QUOTE_STALE/);
  assert.match(source, /flame_chick_create_website_order/);
});

test("Staff Admin source parity includes deployed dashboard read-RPC helper", () => {
  const source = read("supabase/functions/flame-chick-staff-admin/index.ts");
  const helper = read("supabase/functions/flame-chick-staff-admin/dashboard-actions.mjs");
  assert.match(source, /buildDashboardRpcCall/);
  assert.match(helper, /export function buildDashboardRpcCall/);
  assert.match(helper, /flame_chick_admin_dashboard/);
});
