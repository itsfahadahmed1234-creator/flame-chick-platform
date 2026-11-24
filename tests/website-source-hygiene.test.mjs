import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = "apps/flame-chick-website";
const activeFiles = ["index.html", "order-online-v3.html", "js/catalog.js", "js/config.js", "js/hero-slider.js", "js/i18n.js", "js/pricing.js", "js/store.js", "js/website-order-v3.js"];
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


test("website keeps a missing listed-area fee separate from explicitly configured Rs. 0", () => {
  const html=source["index.html"];
  assert.match(html,/rawFee === null \|\| rawFee === undefined \|\| rawFee === '' \? null : Number\(rawFee\)/);
  assert.match(html,/Number\.isFinite\(parsedFee\) && parsedFee >= 0 \? parsedFee : null/);
  assert.match(html,/Fee not configured/);
  assert.match(html,/selectedAreaForCheckout\.fee === null/);
  assert.doesNotMatch(html,/Math\.max\(0, Number\(area\.Fee[\s\S]{0,60}\|\| 0\)/);
});


test("Dedicated V3 order page is separate from legacy storefront and remains unindexed until release", () => {
  const html=source["order-online-v3.html"];
  assert.match(html,/<meta name="robots" content="noindex,nofollow,noarchive">/);
  assert.match(html,/js\/catalog-v3-client\.js/);
  assert.match(html,/js\/branch-fulfilment-v3\.js/);
  assert.match(html,/js\/catalog-v3-deal-configurator\.js/);
  assert.match(html,/js\/website-order-v3\.js/);
  assert.match(html,/id="branch-selector"/);
  assert.match(html,/id="product-catalog"/);
  assert.match(html,/id="deal-catalog"/);
  assert.match(html,/id="cart-lines"/);
  assert.match(html,/id="request-quote"/);
  assert.match(html,/id="place-order"/);
  assert.match(html,/id="retry-order"/);
  assert.match(html,/id="order-success"/);
  assert.doesNotMatch(html,/service_role|service_role_key|supabase_service_role/i);
});

test("Customer ordering page sends published IDs for quote and commit, never browser-calculated prices", () => {
  const js=source["js/website-order-v3.js"];
  assert.match(js,/FlameChickCatalogV3Client\.load/);
  assert.match(js,/FlameChickCatalogV3View\.buildMenuViewModel/);
  assert.match(js,/FlameChickCatalogV3DealView\.buildDealViewModel/);
  assert.match(js,/FlameChickCatalogV3DealConfigurator\.createDealConfigurator/);
  assert.match(js,/action: 'quote_website_order'/);
  assert.match(js,/state\.checkoutBody\.action = 'create_website_order'/);
  assert.match(js,/productVariantId: variantId/);
  assert.match(js,/item\.quantity = row\.quantity/);
  assert.match(js,/delivery: delivery/);
  assert.doesNotMatch(js,/unit_price_snapshot|line_total|price_minor|subtotal_minor|delivery_fee:/);
  assert.doesNotMatch(js,/localStorage|indexedDB/);
  assert.match(js,/PENDING_CHECKOUT_STORAGE_KEY = 'flame-chick-v3-pending-checkout-id'/);
  assert.match(js,/savePendingRequestId\(state\.checkoutRequestId\)/);
  assert.match(js,/sessionStorage\.setItem\(PENDING_CHECKOUT_STORAGE_KEY, value\)/);
  assert.match(js,/sessionStorage\.removeItem\(PENDING_CHECKOUT_STORAGE_KEY\)/);
});

test("Customer order page uses server quote and preserves the exact checkout ID/body after uncertain responses", () => {
  const js=source["js/website-order-v3.js"];
  assert.match(js,/orderApi\('POST', '', body\)/);
  assert.match(js,/result\.quote\.publicationId !== state\.snapshot\.publicationId/);
  assert.match(js,/state\.checkoutRequestId = root\.crypto\.randomUUID\(\)/);
  assert.match(js,/state\.checkoutBody = clone\(state\.quoteBody\)/);
  assert.match(js,/state\.checkoutBody\.request_id = state\.checkoutRequestId/);
  assert.match(js,/var uncertain = !error\.status \|\| error\.status >= 500/);
  assert.match(js,/retry-order/);
  assert.match(js,/state\.checkoutUncertain = uncertain/);
  assert.match(js,/var locked = state\.busy \|\| state\.checkoutUncertain/);
  assert.match(js,/Retry the same checkout request to verify whether it was received/);
  assert.doesNotMatch(js,/function canEdit\(\) \{ return[^\n]*&& !\$\('order-success'\)\.hidden/);
});

test("Customer checkout sends the signed server quote and fails closed without session retry persistence", () => {
  const js=source["js/website-order-v3.js"];
  assert.match(js,/typeof result\.quote_token !== 'string'/);
  assert.match(js,/state\.quoteToken = result\.quote_token/);
  assert.match(js,/state\.checkoutBody\.quote_token = state\.quoteToken/);
  assert.match(js,/Get a fresh secure server quote/);
  assert.match(js,/!savePendingRequestId\(state\.checkoutRequestId\)/);
  assert.match(js,/root\.crypto\.randomUUID/);
  assert.doesNotMatch(js,/localStorage|indexedDB/);
});

test("Customer order context keeps Not Listed delivery fee distinct from unconfigured NULL", () => {
  const js=source["js/website-order-v3.js"];
  assert.match(js,/branch\.notListedDeliveryFee !== null/);
  assert.match(js,/if \(!\$\('not-listed-confirm'\)\.checked\)/);
  assert.match(js,/selection_type: 'not_listed'/);
  assert.match(js,/selection_type: 'listed_area'/);
  assert.match(js,/branch && branch\.notListedDeliveryFee !== null/);
  assert.match(js,/other\.disabled = !branch \|\| branch\.notListedDeliveryFee === null/);
});
