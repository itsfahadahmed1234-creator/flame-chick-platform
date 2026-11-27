const ACTION = "dashboard_summary";
const RPC = "flame_chick_admin_dashboard";
const REQUIRED_FIELDS = Object.freeze([
  "p_branch_id", "p_today_start", "p_today_end", "p_period_start", "p_period_end",
  "p_previous_period_start", "p_previous_period_end", "p_week_start", "p_week_end",
  "p_previous_week_start", "p_previous_week_end", "p_rush_start", "p_rush_end"
]);
const OPTIONAL_FIELDS = Object.freeze(["p_include_period_history"]);
const FIELDS = Object.freeze([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

function invalid() {
  const error = new Error("Invalid dashboard request.");
  error.name = "DashboardRequestError";
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validTimestamp(value) {
  if (typeof value !== "string" || !ISO_UTC.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

export function isDashboardAction(action) {
  return action === ACTION;
}

export function buildDashboardRpcCall(input) {
  if (!isObject(input) || input.action !== ACTION) invalid();
  for (const key of Object.keys(input)) if (!["action", "payload"].includes(key)) invalid();
  if (!isObject(input.payload)) invalid();
  const payload = input.payload;
  for (const key of Object.keys(payload)) if (!FIELDS.includes(key)) invalid();
  for (const key of REQUIRED_FIELDS) if (!Object.hasOwn(payload, key)) invalid();
  if (typeof payload.p_branch_id !== "string" || !UUID.test(payload.p_branch_id)) invalid();
  for (const key of REQUIRED_FIELDS.slice(1)) if (!validTimestamp(payload[key])) invalid();
  if (Object.hasOwn(payload, "p_include_period_history") && typeof payload.p_include_period_history !== "boolean") invalid();
  const safePayload = Object.fromEntries(Object.keys(payload).map(key => [key, payload[key]]));
  return { rpc: RPC, args: { p_payload: safePayload }, kind: "read" };
}
