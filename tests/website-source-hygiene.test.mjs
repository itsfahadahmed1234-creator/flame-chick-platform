import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = "apps/flame-chick-website";
const activeFiles = ["index.html", "js/catalog.js", "js/config.js", "js/hero-slider.js", "js/i18n.js", "js/pricing.js", "js/store.js"];
const source = Object.fromEntries(activeFiles.map((file) => [file, readFileSync(join(root, file), "utf8")]));

test("active storefront is Flame Chick-branded and has no retired brand/config identifiers", () => {
  const runtimeFiles = Object.entries(source).filter(([file]) => file !== "index.html").map(([, content]) => content);
  const all = runtimeFiles.join("\n");
  const retiredBrand = ["Pizza", "Bite"].join(" ");
  const retiredStorage = ["pizza", "_", "bite"].join("");
  const retiredGlobal = ["H", "F", "P"].join("");
  assert.equal(all.toLowerCase().includes(retiredBrand.toLowerCase()), false);
  assert.equal(all.toLowerCase().includes(retiredStorage), false);
  assert.equal(new RegExp("\\b" + retiredGlobal + "\\b", "i").test(all), false);
  assert.doesNotMatch(source["index.html"], /window\.HFP_CONFIG|window\.HfpCatalog|Pizza Bite/i);
  assert.equal(existsSync(join(root, "js/app.js")), false);
});

test("renamed storefront modules are wired consistently", () => {
  assert.match(source["js/config.js"], /var FLAME_CHICK_CONFIG\s*=/);
  assert.match(source["js/catalog.js"], /FlameChickCatalog/);
  assert.match(source["js/pricing.js"], /FlameChickPricing/);
  assert.match(source["js/i18n.js"], /FLAME_CHICK_I18N/);
  assert.match(source["js/hero-slider.js"], /FlameChickHeroSlider/);
  assert.match(source["js/store.js"], /flame_chick_cart_v1/);
  assert.match(source["index.html"], /window\.FLAME_CHICK_CONFIG/);
  assert.match(source["index.html"], /window\.FlameChickCatalog/);
});

test("all active local script references exist", () => {
  const html = source["index.html"];
  const refs = [...html.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]);
  const local = refs.filter((ref) => !ref.startsWith("http") && !ref.startsWith("//") && !ref.startsWith("data:"));
  for (const ref of local) {
    const clean = ref.split(/[?#]/, 1)[0];
    const normalized = clean.startsWith("./") ? clean.slice(2) : clean;
    assert.equal(existsSync(join(root, normalized)), true, "Missing local script: " + ref);
  }
});

test("storefront menu is hidden until a verified live catalog succeeds", () => {
  const html = source["index.html"];
  assert.match(html, /id="cats" hidden/);
  assert.match(html, /id="menuRoot" hidden/);
  assert.match(html, /id="menuContractNotice" role="status"/);
  assert.match(html, /function fcSetMenuCatalogState\(ready, message\)/);
  assert.match(html, /fcSetMenuCatalogState\(false,/);
  assert.match(html, /fcSetMenuCatalogState\(true\)/);
  assert.match(html, /published menu is unavailable or uses an unsupported format/i);
});


test("website delivery submission carries explicit area selection and no client-authoritative fee", () => {
  const html = source["index.html"];
  assert.match(html,/selection_type:\s*customer\.areaChoice === '__not_listed__' \? 'not_listed' : 'listed_area'/);
  assert.match(html,/area_id:\s*customer\.areaChoice === '__not_listed__' \? null : \(customer\.areaId \|\| null\)/);
  assert.match(html,/address:\s*customer\.address/);
  assert.doesNotMatch(html,/delivery:\s*customer\.mode === 'Takeaway'[\s\S]{0,250}area_name:/);
  assert.doesNotMatch(html,/delivery:\s*customer\.mode === 'Takeaway'[\s\S]{0,250}delivery_fee:/);
});
