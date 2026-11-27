import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const adminSource = readFileSync("apps/flame-chick-admin/app.js", "utf8");
const bootstrapStart = adminSource.indexOf("async function bootstrap()");
const bootstrapEnd = adminSource.indexOf("\nasync function loadAll()", bootstrapStart);
const bootstrap = adminSource.slice(bootstrapStart, bootstrapEnd);

test("Admin and Owner bootstrap enables Delivery areas alongside Staff and Catalog V3", () => {
  assert.ok(bootstrapStart >= 0 && bootstrapEnd > bootstrapStart, "bootstrap block must exist");
  assert.match(bootstrap, /!\["admin","owner"\]\.includes\(context\.actor_role\)/);
  assert.match(bootstrap, /const allowed=\["staff","catalog-v3","delivery"\]\.includes\(button\.dataset\.page\);/);
  assert.match(adminSource, /if\(p==="delivery"\)loadDeliveryConfig\(\)\.catch/);
});

test("unfinished Admin modules remain gated rather than being exposed by the Delivery change", () => {
  assert.match(bootstrap, /const allowed=\["staff","catalog-v3","delivery"\]\.includes\(button\.dataset\.page\);/);
  for (const page of ["dashboard", "orders", "menu", "categories", "deals", "media", "settings"]) {
    assert.ok(!["staff", "catalog-v3", "delivery"].includes(page), page + " remains disabled until its secure API is complete");
  }
});

test("delivery-area editor refreshes only delivery configuration after its protected save", () => {
  const editorStart = adminSource.indexOf("function openEditor(");
  const editorEnd = adminSource.indexOf("\\nfunction closeEditor", editorStart);
  const areaStart = adminSource.indexOf("function editArea(id)");
  const areaEnd = adminSource.indexOf("\\nasync function saveSettings", areaStart);
  assert.ok(editorStart >= 0 && editorEnd > editorStart, "shared editor block must exist");
  assert.ok(areaStart >= 0 && areaEnd > areaStart, "delivery-area editor block must exist");

  const editor = adminSource.slice(editorStart, editorEnd);
  const area = adminSource.slice(areaStart, areaEnd);
  assert.match(editor, /refreshAfterSave=loadAll/, "other editors retain their existing default refresh");
  assert.match(editor, /await refreshAfterSave\\(\\);/, "the editor awaits its selected refresh");
  assert.match(area, /deliveryConfigCommand\\("area_upsert",payload\\)/, "area creation/update still uses the existing command RPC");
  assert.match(area, /\\},loadDeliveryConfig\\);/, "area editor reloads only the protected delivery configuration");
  assert.doesNotMatch(area, /loadAll/, "area save must not trigger unrelated legacy table reads");
  assert.match(area, /branch_id:S\\.branch\\.id/, "the active branch remains part of the area command");
  assert.match(area, /delivery_fee:Number\\(fd\\.get\\("fee"\\)\\)/, "the entered delivery fee is unchanged");
});
