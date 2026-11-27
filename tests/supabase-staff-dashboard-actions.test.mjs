import assert from "node:assert/strict";
import test from "node:test";
import { buildDashboardRpcCall, isDashboardAction } from "../supabase/functions/flame-chick-staff-admin/dashboard-actions.mjs";

const FIELDS = [
  "p_branch_id", "p_today_start", "p_today_end", "p_period_start", "p_period_end",
  "p_previous_period_start", "p_previous_period_end", "p_week_start", "p_week_end",
  "p_previous_week_start", "p_previous_week_end", "p_rush_start", "p_rush_end"
];
const UUID = "bb000000-0000-4000-8000-000000000001";
const TIME = "2026-11-27T12:00:00.000Z";
const valid = () => ({
  action: "dashboard_summary",
  payload: Object.fromEntries(FIELDS.map(field => [field, field === "p_branch_id" ? UUID : TIME])),
});

test("dashboard action maps allowlisted fields to its read-only RPC", () => {
  assert.equal(isDashboardAction("dashboard_summary"), true);
  const input = valid();
  assert.deepEqual(buildDashboardRpcCall(input), {
    rpc: "flame_chick_admin_dashboard",
    args: { p_payload: input.payload },
    kind: "read",
  });
});

test("dashboard action rejects missing, extra and malformed request fields", () => {
  const missing = valid();
  delete missing.payload.p_rush_end;
  assert.throws(() => buildDashboardRpcCall(missing), { name: "DashboardRequestError" });
  assert.throws(() => buildDashboardRpcCall({ ...valid(), user_id: "caller-controlled" }), { name: "DashboardRequestError" });
  assert.throws(() => buildDashboardRpcCall({ ...valid(), payload: { ...valid().payload, user_id: "caller-controlled" } }), { name: "DashboardRequestError" });
  assert.throws(() => buildDashboardRpcCall({ ...valid(), payload: { ...valid().payload, p_today_start: "2026-11-27" } }), { name: "DashboardRequestError" });
  assert.throws(() => buildDashboardRpcCall({ ...valid(), payload: { ...valid().payload, p_branch_id: "not-a-uuid" } }), { name: "DashboardRequestError" });
});
