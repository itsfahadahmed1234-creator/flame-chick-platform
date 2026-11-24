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
