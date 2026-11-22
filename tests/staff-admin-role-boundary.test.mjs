import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const functionSource = readFileSync("supabase/functions/flame-chick-staff-admin/index.ts", "utf8");
const config = readFileSync("supabase/config.toml", "utf8");
const commandMigration = readFileSync(
  "supabase/migrations/20261121053647_flame_chick_staff_admin_commands.sql",
  "utf8"
);
const isolationMigration = readFileSync(
  "supabase/migrations/20261121054852_flame_chick_staff_command_definer_isolation.sql",
  "utf8"
);

test("Staff Admin gateway requires a signed-in JWT", () => {
  assert.match(config, /\[functions\.flame-chick-staff-admin\][\s\S]*?verify_jwt\s*=\s*true/);
  assert.match(functionSource, /if\(!t\)throw new ApiError\("STAFF_AUTH_REQUIRED"/);
});

test("database derives the actor from auth.uid and ignores client-provided role assertions", () => {
  assert.match(commandMigration, /v_actor uuid:=auth\.uid\(\)/);
  assert.match(commandMigration, /ur\.role_key IN \('admin','owner'\) AND ur\.branch_id IS NULL/);
  assert.match(commandMigration, /IF v_action<>'accept_invitation' AND v_actor_role IS NULL THEN\s+RAISE EXCEPTION 'STAFF_ADMIN_FORBIDDEN'/);
  assert.match(functionSource, /Authorization:"Bearer "\+t/);
  assert.doesNotMatch(functionSource, /p_actor_user_id|actor_role|role_key:\s*token/);
});

test("Admin and Owner are restaurant-wide; Manager, Cashier and Rider remain branch-scoped", () => {
  assert.match(commandMigration, /IF v_role IN \('admin','owner'\) THEN[\s\S]*?v_branch_ids:=ARRAY\[NULL::uuid\]/);
  assert.match(commandMigration, /STAFF_ADMIN_BRANCH_IDS_REQUIRED/);
  assert.match(commandMigration, /v_role NOT IN \('admin','owner'\)/);
  assert.match(functionSource, /\["admin","owner","manager","cashier","rider"\]/);
});

test("public wrapper delegates to the private command function", () => {
  assert.match(isolationMigration, /ALTER FUNCTION public\.flame_chick_staff_admin_command\(text,jsonb\) SET SCHEMA app_private/);
  assert.match(isolationMigration, /REVOKE ALL ON FUNCTION app_private\.flame_chick_staff_admin_command_internal/);
  assert.match(isolationMigration, /CREATE FUNCTION public\.flame_chick_staff_admin_command/);
  assert.match(isolationMigration, /SECURITY INVOKER SET search_path=''/);
});

test("service-only invitation finalizer uses the secret key in apikey only", () => {
  assert.match(functionSource, /headers:\{apikey:SECRET_KEY,"Content-Type":"application\/json"/);
  assert.doesNotMatch(functionSource, /Authorization:"Bearer "\+SECRET_KEY/);
});
