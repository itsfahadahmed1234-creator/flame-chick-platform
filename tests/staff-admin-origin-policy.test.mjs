import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isAllowedRequestOrigin,
  isSafeInviteRedirect,
  parseAllowedOrigins,
  parseStaffAdminOrigins,
  PRODUCTION_STAFF_ADMIN_ORIGIN,
  PREVIEW_STAFF_ADMIN_ORIGINS,
  staffCorsHeaders
} from "../supabase/functions/flame-chick-staff-admin/origin-policy.mjs";

const adminOrigin = "https://admin.example.test";
const allowed = parseAllowedOrigins(adminOrigin);

test("parses exact configured origins and trims input", () => {
  assert.deepEqual([...parseAllowedOrigins(" https://admin.example.test, https://preview.example.test ")],
    ["https://admin.example.test", "https://preview.example.test"]);
});

test("allows HTTP only for explicit loopback development origins", () => {
  const local = parseAllowedOrigins("http://localhost:8080, http://127.0.0.1:4173");
  assert.equal(local.has("http://localhost:8080"), true);
  assert.equal(local.has("http://127.0.0.1:4173"), true);
  assert.throws(() => parseAllowedOrigins("http://admin.example.test"), /exact HTTPS origins/);
});

test("rejects wildcard, paths, query, fragment, credentials and invalid values", () => {
  for (const value of [
    "", "*", "https://*.example.test", "https://admin.example.test/",
    "https://admin.example.test/path", "https://admin.example.test?next=/",
    "https://admin.example.test#fragment", "https://user:secret@admin.example.test", "not a url"
  ]) assert.throws(() => parseAllowedOrigins(value), undefined, value);
});

test("checks Origin values with exact matching", () => {
  assert.equal(isAllowedRequestOrigin(adminOrigin, allowed), true);
  assert.equal(isAllowedRequestOrigin("https://evil.example.test", allowed), false);
  assert.equal(isAllowedRequestOrigin("https://admin.example.test.evil.test", allowed), false);
  assert.equal(isAllowedRequestOrigin(null, allowed), true);
});

test("accepts only the exact HTTPS invitation callback on an allowed origin", () => {
  assert.equal(isSafeInviteRedirect(adminOrigin + "/accept-invitation.html", allowed), true);
  for (const value of [
    "http://admin.example.test/accept-invitation.html", adminOrigin + "/",
    adminOrigin + "/admin.html", adminOrigin + "/accept-invitation.html/",
    adminOrigin + "/accept-invitation.html?next=/", adminOrigin + "/accept-invitation.html#token",
    "https://evil.example.test/accept-invitation.html",
    "https://admin.example.test.evil.test/accept-invitation.html",
    "https://user:secret@admin.example.test/accept-invitation.html", "not a url"
  ]) assert.equal(isSafeInviteRedirect(value, allowed), false, value);
});

test("CORS reflects only explicitly allowed origins without wildcard or credentials", () => {
  const allowedHeaders = staffCorsHeaders(adminOrigin, allowed);
  assert.equal(allowedHeaders["Access-Control-Allow-Origin"], adminOrigin);
  assert.equal(allowedHeaders["Access-Control-Allow-Methods"], "GET, POST, OPTIONS");
  assert.equal(allowedHeaders["Access-Control-Allow-Credentials"], undefined);
  assert.equal(staffCorsHeaders("https://evil.example.test", allowed)["Access-Control-Allow-Origin"], undefined);
  assert.equal(staffCorsHeaders(null, allowed)["Access-Control-Allow-Origin"], undefined);
});

test("the production Edge Function imports and enforces the tested origin policy", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("supabase/functions/flame-chick-staff-admin/index.ts", "utf8");
  assert.match(source, /isAllowedRequestOrigin/);
  assert.match(source, /isSafeInviteRedirect/);
  assert.match(source, /parseStaffAdminOrigins/);
  assert.match(source, /if\(!isAllowedRequestOrigin\(origin,ORIGINS\)\)/);
});

test("production Admin and pinned preview origins remain allowed when optional env allowlist is unset", () => {
  const configured = parseStaffAdminOrigins("");
  assert.deepEqual([...configured], [PRODUCTION_STAFF_ADMIN_ORIGIN, ...PREVIEW_STAFF_ADMIN_ORIGINS]);
  for (const origin of [PRODUCTION_STAFF_ADMIN_ORIGIN, ...PREVIEW_STAFF_ADMIN_ORIGINS]) {
    assert.equal(isAllowedRequestOrigin(origin, configured), true);
    assert.equal(staffCorsHeaders(origin, configured)["Access-Control-Allow-Origin"], origin);
  }
});

test("production Admin origin is merged with explicitly configured exact origins", () => {
  const configured = parseStaffAdminOrigins("https://localhost.example.test");
  assert.equal(configured.has(PRODUCTION_STAFF_ADMIN_ORIGIN), true);
  assert.equal(configured.has("https://localhost.example.test"), true);
  assert.throws(() => parseStaffAdminOrigins("*"));
});

const productionAdminOrigin = "https://flamechicadmin.vercel.app";
const productionAllowed = parseAllowedOrigins(productionAdminOrigin);

test("production Admin origin is the sole browser origin for Staff Admin", () => {
  assert.equal(productionAllowed.size, 1);
  assert.equal(isAllowedRequestOrigin(productionAdminOrigin, productionAllowed), true);
  for (const origin of [
    "https://flamechic.vercel.app",
    "https://flamechicrider.vercel.app",
    "https://flame-chick-admin-production.vercel.app",
    "https://evil.example.test"
  ]) {
    assert.equal(isAllowedRequestOrigin(origin, productionAllowed), false, origin);
    assert.equal(staffCorsHeaders(origin, productionAllowed)["Access-Control-Allow-Origin"], undefined);
  }
});

test("production invitation callback is pinned to the Admin domain", () => {
  assert.equal(isSafeInviteRedirect(
    productionAdminOrigin + "/accept-invitation.html",
    productionAllowed
  ), true);
  assert.equal(isSafeInviteRedirect(
    "https://flamechic.vercel.app/accept-invitation.html",
    productionAllowed
  ), false);
  assert.equal(isSafeInviteRedirect(
    "https://flamechicrider.vercel.app/accept-invitation.html",
    productionAllowed
  ), false);
});


test("Staff Admin preview CORS allows only the exact current and branch-stable preview origins", () => {
  const configured = parseStaffAdminOrigins("");
  assert.equal(PREVIEW_STAFF_ADMIN_ORIGINS.length, 3);
  assert.ok(PREVIEW_STAFF_ADMIN_ORIGINS.includes(
    "https://flame-chick-admin-production-q58bg0vac-fahad-7455.vercel.app"
  ));
  for (const origin of PREVIEW_STAFF_ADMIN_ORIGINS) {
    assert.equal(configured.has(origin), true);
    assert.equal(isAllowedRequestOrigin(origin, configured), true);
    assert.equal(staffCorsHeaders(origin, configured)["Access-Control-Allow-Origin"], origin);
  }
  for (const origin of [
    "https://flame-chick-admin-production-other.vercel.app",
    "https://flame-chick-admin-production-q58bg0vac-fahad-7455.vercel.app.evil.test",
    "https://evil.example.test"
  ]) {
    assert.equal(isAllowedRequestOrigin(origin, configured), false, origin);
    assert.equal(staffCorsHeaders(origin, configured)["Access-Control-Allow-Origin"], undefined);
  }
});
