import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

test("Delivery API keeps gateway JWT off, but validates Auth and database role context", () => {
  const config = read("supabase/config.toml");
  const source = read("supabase/functions/flame-chick-delivery-api/index.ts");
  assert.match(config, /\[functions\.flame-chick-delivery-api\][\s\S]*?verify_jwt\s*=\s*false/);
  assert.match(source, /verifyStaffUser\(token, apiKey\)/);
  assert.match(source, /\/auth\/v1\/user/);
  assert.match(source, /flame_chick_get_staff_context/);
  assert.match(source, /flame_chick_manage_delivery/);
  assert.match(source, /if \(req\.method === "OPTIONS"\)/);
});

test("Order API overlaps independent reads and keeps all failures fail-closed", () => {
  const source = read("supabase/functions/flame-chick-order-api/index.ts");
  assert.match(source, /const \[areas,settings\] = await Promise\.all\(\[[\s\S]*?delivery_areas[\s\S]*?branch_delivery_settings/);
  assert.match(source, /const \[catalog,restaurant\] = await Promise\.all\(\[[\s\S]*?readPublishedV3Catalog\(\)[\s\S]*?readFlameChickRestaurant\(\)/);
  assert.match(source, /const branchResults = await Promise\.all\(branchRead\.branches\.map/);
  assert.match(source, /branchResults\.some\(result=>!result\.ok\)/);
  assert.match(source, /verifyWebsiteOrderQuoteToken/);
  assert.match(source, /flame_chick_create_website_order/);
  const quoteToken = read("supabase/functions/flame-chick-order-api/website-order-quote-token.mjs");
  assert.match(quoteToken, /WEBSITE_ORDER_QUOTE_STALE/);
});

test("Staff Admin source includes deployed v10 dashboard handler and Cloudflare origin", () => {
  const config = read("supabase/config.toml");
  const source = read("supabase/functions/flame-chick-staff-admin/index.ts");
  const helper = read("supabase/functions/flame-chick-staff-admin/dashboard-actions.mjs");
  const origins = read("supabase/functions/flame-chick-staff-admin/origin-policy.mjs");
  assert.match(config, /\[functions\.flame-chick-staff-admin\][\s\S]*?verify_jwt\s*=\s*true/);
  assert.match(source, /buildDashboardRpcCall/);
  assert.match(source, /dashboardSummary/);
  assert.match(helper, /export function buildDashboardRpcCall/);
  assert.match(helper, /flame_chick_admin_dashboard/);
  assert.match(helper, /ISO_UTC = \/\^\\d\{4\}/);
  assert.match(origins, /https:\/\/flamechickadmin\.pages\.dev/);
});

test("Rider uses one authenticated presence-and-jobs sync cycle and action snapshots", () => {
  const api = read("supabase/functions/flame-chick-delivery-api/index.ts");
  const rider = read("apps/flame-chick-rider/index.html");
  assert.match(api, /if \(action === "sync"\)/);
  assert.match(api, /setRiderPresence\(user\.id, riderScope\.branchId, online, false\)/);
  assert.match(api, /readRiderState\(user\.id, riderScope\.branchId\)/);
  assert.match(api, /delivery_tasks\?" \+ query\.toString\(\)/);
  assert.match(api, /delivery_task_offers\?" \+ offersQuery\.toString\(\)/);
  assert.match(api, /payload\.rider_state = \{ data:state\.data, offers:state\.offers, profile:state\.profile \}/);
  assert.match(rider, /action:'sync',online:riderWantsOnline/);
  assert.match(rider, /riderSyncTimer=setInterval\(\(\)=>syncRiderState\(false\),120000\)/);
  assert.match(rider, /applyRiderSnapshot\(result\.rider_state\|\|\{\}\)/);
  assert.doesNotMatch(rider, /riderRealtimeFallbackTimer=setInterval\(\(\)=>\{[\s\S]{0,150}?\},120000\)/);
});
