import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const adminApp = readFileSync("apps/flame-chick-admin/app.js", "utf8");
const adminHtml = readFileSync("apps/flame-chick-admin/index.html", "utf8");
const riderHtml = readFileSync("apps/flame-chick-rider/index.html", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261125083051_flame_chick_staff_main_branch_rider_provisioning.sql",
  "utf8"
);

test("Admin staff invitation no longer requires a branch selector or manual reason", () => {
  assert.doesNotMatch(adminHtml, /id="staffBranch"/);
  assert.doesNotMatch(adminHtml, /id="staffReason"/);
  assert.match(adminHtml, /Main \(automatic\)/);
  assert.match(adminApp, /function staffBranchIds\(roleKey\)/);
  assert.match(adminApp, /branch_code\|\|""\)\.toLowerCase\(\)==="main"/);
  assert.doesNotMatch(adminApp, /selectedStaffBranches|data-staff-scope/);
  assert.match(adminApp, /const reason="Invited via Admin panel"/);
});

test("Rider availability renderer does not reference a removed pending variable", () => {
  assert.doesNotMatch(riderHtml, /\bpending\s*\?/);
  assert.match(riderHtml, /function renderRiderAvailability\(\)/);
  assert.match(riderHtml, /const label=effectiveStatus===/);
  assert.match(riderHtml, /btn\.textContent=effectiveStatus===/);
});

test("Rider job loading does not wait for Realtime to initialize", () => {
  assert.match(
    riderHtml,
    /startRiderRealtime\(\)\.catch\([\s\S]*?await loadJobs\(true\)/
  );
  assert.doesNotMatch(riderHtml, /await startRiderRealtime\(\);\s*await loadJobs\(true\)/);
});

test("database enforces Main and rejects multi-branch staff assignments", () => {
  assert.match(migration, /lower\(pg_catalog\.btrim\(b\.branch_code\)\)='main'/);
  assert.match(migration, /STAFF_MAIN_BRANCH_FIXED/);
  assert.match(migration, /jsonb_array_length\(coalesce\(v_payload->'branch_ids','\[\]'::jsonb\)\)>1/);
  assert.match(migration, /STAFF_MAIN_BRANCH_UNAVAILABLE/);
});

test("Rider role activation provisions the matching profile atomically", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION app_private\.flame_chick_ensure_rider_profile/);
  assert.equal((migration.match(/PERFORM app_private\.flame_chick_ensure_rider_profile\(/g) || []).length, 2);
  assert.match(migration, /ON CONFLICT\(user_id,branch_id\) DO UPDATE/);
  assert.match(migration, /availability_status=CASE[\s\S]*WHEN NOT rp\.is_active THEN 'offline'/);
});

test("Rider deactivation cannot strand an active delivery and disables offers", () => {
  assert.match(migration, /RIDER_HAS_ACTIVE_DELIVERY/);
  assert.match(migration, /SET is_active=false,availability_status='offline',accepting_jobs=false/);
  assert.match(migration, /dt\.return_confirmed_at IS NULL/);
});
