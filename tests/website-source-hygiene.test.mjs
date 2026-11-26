import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = "apps/flame-chick-website";
const activeFiles = [
  "index.html",
  "js/config.js",
  "js/website-order-v3.js",
  "js/catalog-v3.js",
  "js/catalog-v3-client.js",
  "js/branch-fulfilment-v3.js",
  "js/catalog-v3-view.js",
  "js/catalog-v3-deal-view.js",
  "js/catalog-v3-deal-configurator.js"
];
const source = Object.fromEntries(activeFiles.map((file) => [file, readFileSync(join(root, file), "utf8")]));
const html = source["index.html"];
const order = source["js/website-order-v3.js"];

test("active storefront is Flame Chick branded and contains no retired brand/config identifiers", () => {
  const runtimeFiles = Object.entries(source).filter(([file]) => file !== "index.html").map(([, content]) => content);
  const all = runtimeFiles.join("\n");
  const retiredBrand = ["Pizza", "Bite"].join(" ");
  const retiredStorage = ["pizza", "_", "bite"].join("");
  const retiredGlobal = ["H", "F", "P"].join("");
  assert.equal(all.toLowerCase().includes(retiredBrand.toLowerCase()), false);
  assert.equal(all.toLowerCase().includes(retiredStorage), false);
  assert.equal(new RegExp("\\b" + retiredGlobal + "\\b", "i").test(all), false);
  assert.doesNotMatch(html, /window\.HFP_CONFIG|window\.HfpCatalog|Pizza Bite/i);
});

test("V3 catalog and checkout modules load in dependency order on the homepage", () => {
  const refs = [...html.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((match) => match[1]);
  const expected = [
    "js/config.js",
    "js/catalog-v3.js",
    "js/catalog-v3-client.js",
    "js/branch-fulfilment-v3.js",
    "js/catalog-v3-view.js",
    "js/catalog-v3-deal-view.js",
    "js/catalog-v3-deal-configurator.js",
    "js/website-order-v3.js"
  ];
  for (const ref of expected) assert.ok(refs.includes(ref), "Missing homepage script: " + ref);
  assert.deepEqual(refs.filter((ref) => expected.includes(ref)), expected);
  assert.equal(refs.includes("js/catalog.js"), false, "The retired V2 catalog loader must not run on the V3 storefront.");
  for (const ref of refs.filter((value) => !/^https?:/i.test(value) && !value.startsWith("//") && !value.startsWith("data:"))) {
    assert.equal(existsSync(join(root, ref.split(/[?#]/, 1)[0])), true, "Missing local script: " + ref);
  }
});

test("live V3 catalog is embedded immediately below the homepage Menu heading", () => {
  const menu = html.indexOf('<section class="menu" id="menu">');
  const heading = html.indexOf('<h2 class="menu-title">Menu</h2>', menu);
  const catalog = html.indexOf('id="catalog-section"', heading);
  const cart = html.indexOf('id="fc-cart-panel"', catalog);
  assert.ok(menu >= 0 && heading > menu && catalog > heading && cart > catalog);
  assert.match(html, /id="catalog-section" class="fc-home-catalog" hidden/);
  assert.match(html, /id="cats" hidden/);
  assert.match(html, /id="menuRoot"/);
  assert.match(html, /id="deal-catalog"/);
  assert.doesNotMatch(html, /Browse the current published Flame Chick catalog, including current sizes and deals\./);
  assert.doesNotMatch(html, /href="(?:menu|order-online-v3)\.html"/);
  assert.doesNotMatch(html, /window\.location\.assign\(['"](?:menu|order-online-v3)\.html/);
});

test("V2 visual language is used for V3 catalog cards without hard-coded menu prices", () => {
  assert.match(order, /className = 'cat'/);
  assert.match(order, /className = 'cat-pill'/);
  assert.match(order, /className = 'items'/);
  assert.match(order, /className = 'card fc-home-product-card'/);
  assert.match(order, /className = 'art'/);
  assert.match(order, /className = 'body'/);
  assert.match(order, /className = 'foot'/);
  assert.match(order, /appendProductArtwork\(art, product, category\.name\)/);
  assert.match(order, /variant\.priceMinor/);
  assert.match(order, /openProductCustomizer\(product, variantId\)/);
  assert.match(order, /openDealConfigurator\(deal\)/);
  assert.doesNotMatch(order, /unit_price_snapshot\\s*:|price_minor\\s*:|subtotal_minor\\s*:/);
});

test("homepage ordering uses published V3 data and requires a signed quote before committing", () => {
  assert.match(order, /FlameChickCatalogV3Client\.load/);
  assert.match(order, /FlameChickCatalogV3View\.buildMenuViewModel/);
  assert.match(order, /FlameChickCatalogV3DealView\.buildDealViewModel/);
  assert.match(order, /FlameChickCatalogV3DealConfigurator\.createDealConfigurator/);
  assert.match(order, /action: 'quote_website_order'/);
  assert.match(order, /state\.checkoutBody\.action = 'create_website_order'/);
  assert.match(order, /state\.checkoutBody\.quote_token = state\.quoteToken/);
  assert.match(order, /function requestQuote\(\)/);
  assert.match(order, /function renderQuoteSummary\(quote, expiresAt\)/);
  assert.match(order, /quoteExpiresAt/);
  assert.match(order, /quote\.items\.forEach/);
  assert.match(order, /item\.quantity = row\.quantity/);
  assert.match(order, /delivery: delivery/);
  assert.match(order, /amount\\.textContent = money\\(item\\.line_total\\)/);
  assert.doesNotMatch(order, /unit_price_snapshot\\s*:|price_minor\\s*:|subtotal_minor\\s*:|delivery_fee\\s*:/);
});test("checkout shows cash payment instructions that follow the selected fulfilment method", () => {
  assert.match(html, /id="checkout-payment-method"/);
  assert.match(html, /id="checkout-payment-note"/);
  assert.match(order, /function syncPaymentMethod\(\)/);
  assert.match(order, /Cash at takeaway collection/);
  assert.match(order, /Cash on Delivery/);
  assert.match(order, /syncPaymentMethod\(\)/);
});

test("delivery area and locality are sent as customer selections, never as a client fee", () => {
  assert.match(order, /selection_type: 'not_listed'/);
  assert.match(order, /selection_type: 'listed_area'/);
  assert.match(order, /other_locality: locality/);
  assert.match(order, /address: \$\('delivery-address'\)\.value\.trim\(\)/);
  assert.doesNotMatch(order, /delivery_fee:|deliveryFee:/);
});

test("checkout requires customer review, stores only a retry UUID and replays the exact create request", () => {
  assert.match(order, /PENDING_CHECKOUT_STORAGE_KEY = 'flame-chick-v3-pending-checkout-id'/);
  assert.match(order, /action: 'quote_website_order'/);
  assert.match(order, /state\.checkoutBody\.action = 'create_website_order'/);
  assert.match(order, /state\.checkoutBody\.request_id = state\.checkoutRequestId/);
  assert.match(order, /state\.checkoutBody\.quote_token = state\.quoteToken/);
  assert.match(order, /root\.crypto\.randomUUID/);
  assert.match(order, /savePendingRequestId\(state\.checkoutRequestId\)/);
  assert.match(order, /Retry the exact same request/);
  assert.match(order, /quoteToken/);
  assert.match(order, /sessionStorage\.setItem/);
  assert.doesNotMatch(order, /place_website_order|localStorage|indexedDB/);
  assert.match(html, /id="request-quote"/);
  assert.match(html, /id="cart-summary"/);
  assert.match(html, /id="quote-lines"/);
  assert.match(html, /Get verified total/);
  assert.match(html, /Total confirmed by Flame Chick/);
});test("single-branch storefront skips the branch gate and opens fulfilment from the V2-style cart drawer", () => {
  assert.match(html, /id="badge"/);
  assert.match(order, /if \(\$\('badge'\)\)/);
  assert.doesNotMatch(html, /id="branch-selector"|id="catalog-context-label"|Choose your branch/);
  assert.match(html, /class="drawer fc-v3-cart-drawer"[^>]*id="fc-v3-cart-drawer"/);
  assert.match(html, /class="seg fc-v3-fulfilment"/);
  assert.match(html, /id="fulfilment-delivery"[^>]*value="delivery" checked/);
  assert.match(html, /id="fulfilment-pickup"[^>]*value="pickup"/);
  assert.match(html, /id="delivery-area"/);
  assert.match(html, /id="place-order"/);
  assert.match(html, /id="order-success"/);
  assert.match(order, /context\.branches\.length !== 1/);
  assert.match(order, /availableTypes\.indexOf\('delivery'\) >= 0 \? 'delivery'/);
  assert.match(order, /function changeFulfilment\(type\)/);
  assert.match(order, /selectFulfilment\(type\)/);
  assert.match(order, /function openCartDrawer\(\)/);
  assert.match(order, /function closeCartDrawer\(\)/);
  assert.match(order, /websiteDeliveryEnabled/);
  assert.match(order, /websitePickupEnabled/);
  assert.match(order, /fulfillment_type: context\.fulfilmentType/);
});

test("V3 Order API calculates delivery charges from database configuration and supports CORS preflight", () => {
  const api = readFileSync("supabase/functions/flame-chick-order-api/index.ts", "utf8");
  assert.match(api, /if \(req\.method === "OPTIONS"\)/);
  assert.match(api, /readBranchDeliveryConfiguration/);
  assert.match(api, /not_listed_delivery_fee/);
  assert.match(api, /delivery_fee:deliveryFee/);
  assert.match(api, /website_delivery_enabled/);
  assert.match(api, /website_pickup_enabled/);
  assert.match(api, /selectionType === "not_listed"/);
  assert.match(api, /selectionType === "listed_area"/);
  assert.match(api, /action==="create_website_order"\|\|action==="place_website_order"/);
  assert.match(api, /buildWebsiteOrderQuote\(body\)/);
  assert.match(api, /hmacPhoneDigest\(normalizedPhone\)/);
  assert.match(api, /callRpc\("flame_chick_create_website_order",payload\)/);
});


test("every V3 product card opens a product popup while a separate direct Add action remains available", () => {
  assert.match(order, /card\.setAttribute\('role', 'group'\)/);
  assert.match(order, /function openDetails\(\) \{ openProductCustomizer\(product, null\); \}/);
  assert.match(order, /card\.addEventListener\('click'/);
  assert.match(order, /function addProductDirectly\(product, variantId\)/);
  assert.match(order, /addProductDirectly\(product, directVariant\.id\)/);
  assert.match(order, /function openProductCustomizer\(product, initialVariantId\)/);
  assert.match(order, /productModifierGroups\(product, variant\.id\)/);
  assert.match(order, /validateModifierSelections\(groups, selections\)/);
  assert.match(order, /className = 'fc-product-popup-add'/);
  assert.match(order, /product\.variants\.forEach\(function \(row\)/);
  assert.match(order, /cardPrice\(row\.priceMinor\)/);
  assert.match(order, /quantity: qty/);
  assert.ok(order.includes("modifiers: validation.selections"));
});

test("deal choice configurator is hosted inside a modal, not as a separate homepage section", () => {
  assert.match(html, /<dialog id="deal-dialog" class="fc-home-deal-dialog"/);
  assert.match(html, /id="deal-configurator" class="fc-home-dialog-content"/);
  assert.doesNotMatch(html, /id="deal-config-section"/);
  assert.doesNotMatch(html, /id="close-deal-config"/);
  assert.match(order, /function openDealConfigurator\(deal\)/);
  assert.match(order, /configurator\.render\(\$\('deal-configurator'\)/);
  assert.match(order, /\$\('deal-dialog'\)\.close\(\)/);
  assert.match(order, /availableVariants\.length === 1\) configurator\.selectVariant/);
  assert.match(order, /card\.addEventListener\('click'/);
});

test("deal popup preserves POS-style category-driven burger slots, repeat limits and per-item customization", () => {
  const configurator = readFileSync(join(root, "js/catalog-v3-deal-configurator.js"), "utf8");
  assert.match(configurator, /group\.categoryDriven === true/);
  assert.match(configurator, /fc-deal-burger-tabs/);
  assert.match(configurator, /Burger ' \+ \(activeSlot \+ 1\)/);
  assert.match(configurator, /group\.allowRepeatOption/);
  assert.match(configurator, /option\.maxQuantity/);
  assert.match(configurator, /burgerSlotValues\[group\.id\]/);
  assert.match(configurator, /option\.modifierGroups\.forEach/);
  assert.match(configurator, /validate\(\)/);
  assert.match(configurator, /toPayload\(\)/);
  assert.match(order, /FlameChickCatalogV3DealConfigurator\.createDealConfigurator/);
});


test("product and deal popups use compact quantity steppers and one focused burger slot", () => {
  assert.match(order, /fc-product-popup-stepper/);
  assert.match(order, /fc-product-popup-quantity-value/);
  assert.match(order, /quantity = Math\.min\(99, quantity \+ 1\)/);
  assert.match(order, /chosenDealQuantity = configurator\.getState\(\)\.dealQuantity/);
  const configurator = readFileSync(join(root, "js/catalog-v3-deal-configurator.js"), "utf8");
  assert.match(configurator, /fc-deal-burger-tabs/);
  assert.match(configurator, /fc-deal-burger-tab/);
  assert.match(configurator, /activeBurgerSlotByGroup/);
  assert.match(configurator, /slots\[activeSlot\]/);
  assert.match(configurator, /fc-deal-quantity-row/);
  assert.match(configurator, /setDealQuantity: setDealQuantity/);
});

test("sticky category navigation includes a Deals shortcut when published deals are rendered", () => {
  assert.match(order, /fc-deals-category-chip/);
  assert.match(order, /dealsJump\.textContent = 'Deals'/);
  assert.match(order, /target\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
});

test("cart checkout details appear before the cart item list", () => {
  const details = html.indexOf('id="details-section"');
  const items = html.indexOf('id="cart-lines"');
  assert.ok(details >= 0 && items > details, "Checkout details must precede cart lines in the drawer.");
  assert.match(order, /className = 'order-cart-quantity'/);
});


test("delivery area search uses one visible field and retains the selected area ID for validation", () => {
  assert.match(html, /id="delivery-area-search" type="search"/);
  assert.match(html, /id="delivery-area-results"/);
  assert.match(html, /id="delivery-area"[^>]*hidden/);
  assert.match(order, /function renderDeliveryAreaResults\(query\)/);
  assert.match(order, /select\.value = option\.value/);
  assert.match(order, /area_id: selection/);
  assert.doesNotMatch(html, /id="delivery-instructions"/);
  assert.doesNotMatch(order, /delivery-instructions/);
  assert.doesNotMatch(order, /instructions:.*delivery/);
});

test("cart checkout details are unique and the checkout actions stay in a sticky bottom footer", () => {
  for (const id of ["details-section","customer-name","customer-phone","delivery-fields","delivery-area-search","delivery-address","request-quote","place-order"]) {
    assert.equal((html.match(new RegExp('id="' + id + '"', "g")) || []).length, 1, id + " must appear exactly once");
  }
  assert.doesNotMatch(html, /delivery-instructions/);
  assert.match(html, /<footer class="fc-v3-cart-footer">/);
  assert.match(html, /id="place-order"/);
  assert.match(html, /\.fc-v3-cart-drawer \.fc-v3-cart-footer\{position:sticky;bottom:0/);
});

test("cart additions and checkout stages provide motion feedback with reduced-motion support", () => {
  assert.match(order, /function animateCartAdded\(\)/);
  assert.match(order, /replayAnimation\(rows && rows\.lastElementChild, 'is-added'\)/);
  assert.match(order, /animateCartAdded\(\)/);
  assert.match(order, /checkoutMotion\('is-checking'\)/);
  assert.match(order, /checkoutMotion\('is-ready'\)/);
  assert.match(order, /checkoutMotion\('is-ordering'\)/);
  assert.match(order, /checkoutMotion\('is-confirmed'\)/);
  assert.match(html, /@keyframes fcCartRowAdded/);
  assert.match(html, /@keyframes fcCheckoutReady/);
  assert.match(html, /prefers-reduced-motion:reduce/);
});


test("homepage footer copy does not claim that online checkout is disabled", () => {
  assert.match(html, /Browse the current published menu and discover your favourites\./);
  assert.doesNotMatch(html, /Online checkout is not enabled yet\./);
});


test("mobile product-card actions stay inside cards and single-variant products have no redundant size tag", () => {
  assert.match(order, /if \(product\.variants\.length > 1 \|\| !firstVariant\)/);
  assert.match(order, /product\.variants\.length > 1 \? 'Multiple options' : 'Unavailable'/);
  assert.doesNotMatch(order, /firstVariant\.label/);
  assert.match(html, /\.fc-home-product-card \.foot\{[\s\S]*?flex-wrap:wrap/);
  assert.match(html, /\.fc-home-product-card \.add\{[\s\S]*?max-width:100%/);
});

test("Preview header banner is removed while checkout remains read-only outside verified Production hosts", () => {
  assert.doesNotMatch(html, /fc-preview-readonly-banner|Preview mode — live Flame Chick catalogue/);
  assert.doesNotMatch(order, /fc-preview-readonly-banner/);
  assert.match(html, /id="fc-preview-checkout-notice"/);
  assert.match(order, /orderWritesAllowed\(\)/);
  assert.match(order, /Checkout is disabled on this Website Preview/);
  assert.match(order, /String\(method \|\| ''\)\.toUpperCase\(\) !== 'GET'/);
});

test("product and deal dialogs are centered, bounded, scrollable and closed dialogs stay hidden", () => {
  assert.doesNotMatch(html, /Build your deal/);
  assert.match(html, /\.fc-home-product-dialog:not\(\[open\]\)/);
  assert.match(html, /\.fc-home-deal-dialog:not\(\[open\]\)/);
  assert.match(html, /max-height:min\(74dvh,620px\)/);
  assert.match(html, /overflow-y:auto/);
  assert.match(order, /function syncCatalogDialogState\(\)/);
  assert.match(html, /body\.fc-catalog-dialog-open \.ana-sticky/);
});


test("every Website Preview is read-only and only the verified customer hostname may submit orders", () => {
  const guardSource = readFileSync(join(root, "js/preview-checkout-guard.js"), "utf8");
  assert.match(guardSource, /PRODUCTION_ORDER_HOSTS = Object\.freeze\(\['flamechick\.vercel\.app'\]\)/);
  assert.match(guardSource, /TEST_CHECKOUT_PREVIEW_HOSTS = \[\]/);
  assert.match(guardSource, /function isTestCheckoutPreview\(\) \{ return false; \}/);
  assert.match(order, /function orderWritesAllowed\(\)/);
  assert.match(order, /Checkout is disabled on this Website Preview/);
  assert.match(html, /id="fc-preview-checkout-notice"/);
  assert.match(order, /if \(String\(method \|\| ''\)\.toUpperCase\(\) !== 'GET' && !orderWritesAllowed\(\)\)/);
  assert.doesNotMatch(order, /TEST ORDER SENT TO FLAME CHICK POS|WEBSITE PREVIEW QA TEST/);
});

test("the retired standalone ordering URL redirects into the primary homepage V3 checkout", () => {
  const standalone = readFileSync(join(root, "order-online-v3.html"), "utf8");
  assert.match(standalone, /http-equiv="refresh" content="0; url=index\.html#menu"/);
  assert.match(standalone, /location\.replace\('index\.html#menu'\)/);
  assert.equal(standalone.includes('js/website-order-v3.js'), false);
});
