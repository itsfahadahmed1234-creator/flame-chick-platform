import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildDashboardRpcCall, isDashboardAction } from "../supabase/functions/flame-chick-staff-admin/dashboard-actions.mjs";

const app = readFileSync("apps/flame-chick-admin/app.js", "utf8");
const edge = readFileSync("supabase/functions/flame-chick-staff-admin/index.ts", "utf8");
const validPayload = {
  p_branch_id: "84b1b6dc-4fd1-45fa-8d9b-23d203b36cfd",
  p_today_start: "2026-11-26T19:00:00.000Z",
  p_today_end: "2026-11-27T19:00:00.000Z",
  p_period_start: "2026-11-20T19:00:00.000Z",
  p_period_end: "2026-11-27T19:00:00.000Z",
  p_previous_period_start: "2026-11-13T19:00:00.000Z",
  p_previous_period_end: "2026-11-20T19:00:00.000Z",
  p_week_start: "2026-11-22T19:00:00.000Z",
  p_week_end: "2026-11-29T19:00:00.000Z",
  p_previous_week_start: "2026-11-15T19:00:00.000Z",
  p_previous_week_end: "2026-11-22T19:00:00.000Z",
  p_rush_start: "2026-11-26T19:00:00.000Z",
  p_rush_end: "2026-11-27T19:00:00.000Z"
};

test("dashboard request maps one finite action to the dedicated read-only RPC", () => {
  assert.equal(isDashboardAction("dashboard_summary"), true);
  assert.equal(isDashboardAction("dashboard"), false);
  const call = buildDashboardRpcCall({ action: "dashboard_summary", payload: validPayload });
  assert.equal(call.rpc, "flame_chick_admin_dashboard");
  assert.equal(call.kind, "read");
  assert.deepEqual(call.args, { p_payload: validPayload });
});

test("dashboard request rejects unknown, missing, or malformed fields", () => {
  assert.throws(() => buildDashboardRpcCall({ action: "dashboard_summary", payload: { ...validPayload, p_actor_id: "spoof" } }), { name: "DashboardRequestError" });
  const missing = { ...validPayload }; delete missing.p_week_end;
  assert.throws(() => buildDashboardRpcCall({ action: "dashboard_summary", payload: missing }), { name: "DashboardRequestError" });
  assert.throws(() => buildDashboardRpcCall({ action: "dashboard_summary", payload: { ...validPayload, p_branch_id: "not-a-uuid" } }), { name: "DashboardRequestError" });
  assert.throws(() => buildDashboardRpcCall({ action: "dashboard_summary", payload: { ...validPayload, p_today_start: "not-a-time" } }), { name: "DashboardRequestError" });
  assert.throws(() => buildDashboardRpcCall({ action: "dashboard_summary", payload: validPayload, actor_user_id: "forged" }), { name: "DashboardRequestError" });
});

test("Staff Admin route invokes the dashboard with caller JWT and no service secret", () => {
  assert.match(edge, /buildDashboardRpcCall/);
  assert.match(edge, /if\(a==="dashboard_summary"\)return await dashboardSummary\(t,b\)/);
  assert.match(edge, /Authorization:"Bearer "\+t/);
  const start = edge.indexOf("async function dashboardSummary");
  const end = edge.indexOf("async function systemRpc", start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(edge.slice(start, end), /SECRET_KEY/);
});

test("Admin dashboard is enabled and loaded through Staff Admin", () => {
  assert.match(app, /const allowed=\["dashboard","staff","catalog-v3","delivery"\]/);
  assert.match(app, /nav\("dashboard"\)/);
  assert.match(app, /action:"dashboard_summary",payload:body/);
  assert.match(app, /const att=d\.attention_orders\|\|\[\],activeCount=num\(d,"attention_count"\)/);
});
