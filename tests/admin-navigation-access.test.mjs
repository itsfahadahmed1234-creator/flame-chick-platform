import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const adminSource = readFileSync("apps/flame-chick-admin/app.js", "utf8");
const bootstrapStart = adminSource.indexOf("async function bootstrap()");
const bootstrapEnd = adminSource.indexOf("\nasync function loadAll()", bootstrapStart);
const bootstrap = adminSource.slice(bootstrapStart, bootstrapEnd);

test("Admin and Owner bootstrap enables Dashboard, Staff, Catalog V3 and Delivery only", () => {
  assert.ok(bootstrapStart >= 0 && bootstrapEnd > bootstrapStart);
  assert.match(bootstrap, /!\["admin","owner"\]\.includes\(context\.actor_role\)/);
  assert.match(bootstrap, /const allowed=\["dashboard","staff","catalog-v3","delivery"\]\.includes\(button\.dataset\.page\);/);
  assert.match(bootstrap, /nav\("dashboard"\)/);
  assert.match(adminSource, /if\(p==="dashboard"\)loadDashboard\(\)\.catch/);
});

test("unfinished Admin modules remain gated", () => {
  assert.match(bootstrap, /const allowed=\["dashboard","staff","catalog-v3","delivery"\]\.includes\(button\.dataset\.page\);/);
  for (const page of ["orders", "menu", "categories", "deals", "media", "settings"]) {
    assert.ok(!["dashboard", "staff", "catalog-v3", "delivery"].includes(page), page + " remains disabled");
  }
});

test("dashboard reads use the authenticated Staff Admin action", () => {
  const start = adminSource.indexOf("async function loadDashboard()");
  const end = adminSource.indexOf("\nfunction percentChange", start);
  assert.ok(start >= 0 && end > start);
  const route = adminSource.slice(start, end);
  assert.match(route, /staffApi\("POST",null,\{action:"dashboard_summary",payload:body\}\)/);
  assert.doesNotMatch(route, /db\("rpc\//);
});

test("delivery-area editor refreshes only protected delivery configuration after saving", () => {
  const editorStart = adminSource.indexOf("function openEditor(");
  const editorEnd = adminSource.indexOf("\nfunction closeEditor", editorStart);
  const areaStart = adminSource.indexOf("function editArea(id)");
  const areaEnd = adminSource.indexOf("\nasync function saveSettings", areaStart);
  assert.ok(editorStart >= 0 && editorEnd > editorStart);
  assert.ok(areaStart >= 0 && areaEnd > areaStart);
  const editor = adminSource.slice(editorStart, editorEnd);
  const area = adminSource.slice(areaStart, areaEnd);
  assert.match(editor, /refreshAfterSave=loadAll/);
  assert.match(editor, /await refreshAfterSave\(\);/);
  assert.match(area, /deliveryConfigCommand\("area_upsert",payload\)/);
  assert.match(area, /\},loadDeliveryConfig\);/);
  assert.doesNotMatch(area, /loadAll/);
  assert.match(area, /branch_id:S\.branch\.id/);
  assert.match(area, /delivery_fee:Number\(fd\.get\("fee"\)\)/);
});
