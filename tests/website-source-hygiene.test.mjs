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

test("homepage checkout prices the cart from the loaded V3 catalog and submits one server-validated order", () => {
  assert.match(order, /FlameChickCatalogV3Client\.load/);
  assert.match(order, /FlameChickCatalogV3View\.buildMenuViewModel/);
  assert.match(order, /FlameChickCatalogV3DealView\.buildDealViewModel/);
  assert.match(order, /action: 'place_website_order'/);
  assert.match(order, /function calculateCartPricing\(\)/);
  assert.match(order, /function calculateProductLine\(row\)/);
  assert.match(order, /function calculateDealLine\(row\)/);
  assert.match(order, /function selectedDeliveryFeeMinor\(\)/);
  assert.match(order, /cardPrice\(pricing\.subtotalMinor\)/);
  assert.match(order, /cardPrice\(pricing\.deliveryFeeMinor\)/);
  assert.match(order, /state\.checkoutBody\.request_id = state\.checkoutRequestId/);
  assert.ok(order.includes("phone.replace(/\\D/g, '')"));
  assert.doesNotMatch(order, /quote_website_order|create_website_order|quote_token|unit_price_snapshot\s*:|line_total\s*:|delivery_fee\s*:/);
  assert.match(html, /id="cart-subtotal"/);
  assert.match(html, /id="cart-delivery-fee"/);
  assert.match(html, /id="cart-total"/);
  assert.match(html, /id="place-order"/);
  assert.doesNotMatch(html, /Get verified total|id="request-quote"|id="quote-lines"|id="cart-quote-detail"/);
});
test("checkout shows cash payment instructions that follow the selected fulfilment method", () => {
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

test("Place Order sends an idempotent ID-only request and retries the exact same body", () => {
  assert.match(order, /PENDING_CHECKOUT_STORAGE_KEY = 'flame-chick-v3-pending-checkout-id'/);
  assert.match(order, /action: 'place_website_order'/);
  assert.match(order, /state\.checkoutBody\.request_id = state\.checkoutRequestId/);
  assert.match(order, /root\.crypto\.randomUUID/);
  assert.match(order, /savePendingRequestId\(state\.checkoutRequestId\)/);
  assert.match(order, /Retry this exact order/);
  assert.match(order, /sessionStorage\.setItem/);
  assert.doesNotMatch(order, /quote_website_order|create_website_order|quote_token|localStorage|indexedDB/);
  assert.match(html, /id="place-order"/);
  assert.match(html, /id="retry-order"/);
  assert.doesNotMatch(html, /Get verified total|id="request-quote"/);
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
  for (const id of ["details-section","customer-name","customer-phone","delivery-fields","delivery-area-search","delivery-address","place-order"]) {
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
  assert.doesNotMatch(order, /checkoutMotion\('is-checking'\)/);
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


test("checkout host guard retains canonical Production and exact selected review host allow-lists", () => {
  const guardSource = readFileSync(join(root, "js/preview-checkout-guard.js"), "utf8");
  assert.match(guardSource, /PRODUCTION_ORDER_HOSTS = Object\.freeze\(\[/);
  assert.match(guardSource, /'flamechick\.vercel\.app'/);
  assert.match(guardSource, /'flame-chick-website-production\.vercel\.app'/);
  assert.match(guardSource, /'flame-chick-website-production-faha-d\.vercel\.app'/);
  assert.match(guardSource, /TEST_CHECKOUT_PREVIEW_HOSTS = Object\.freeze\(\[/);
  assert.match(guardSource, /flame-chick-website-production-git-work-website-r-07b9f9-faha-d\.vercel\.app/);
  assert.match(guardSource, /function isTestCheckoutPreview\(hostname\)/);
  assert.match(order, /function orderWritesAllowed\(\)/);
  assert.match(order, /if \(String\(method \|\| ''\)\.toUpperCase\(\) !== 'GET' && !orderWritesAllowed\(\)\)/);
  assert.doesNotMatch(order, /TEST ORDER - ADMIN DELETE|TEST CHECKOUT ENABLED|PRODUCTION REHEARSAL ORDER|confirmProductionRehearsal|isProductionRehearsalPreview/);
  assert.doesNotMatch(html, /fc-preview-checkout-notice|Preview checkout status/);
});

test("optional customer email validation accepts standard addresses in both checkout gates", () => {
  const helper = order.match(/function isValidEmail\(value\) \{[\s\S]*?\n  \}/);
  assert.ok(helper, "A shared optional-email validator must be present.");
  const literal = helper[0].match(/return !value \|\| (\/[^;]+?\/)\.test\(value\);/);
  assert.ok(literal, "The shared validator must use one standard email pattern.");
  const pattern = literal[1];
  const lastSlash = pattern.lastIndexOf("/");
  const validator = new RegExp(pattern.slice(1, lastSlash), pattern.slice(lastSlash + 1));
  assert.equal(validator.test("customer@example.com"), true);
  assert.equal(validator.test("not-an-email"), false);
  assert.match(order, /if \(!isValidEmail\(email\)\) errors\['customer-email'\] =/);
  assert.match(order, /if \(!isValidEmail\(email\)\) throw new Error\('Enter a valid email address\.'\);/);
});

test("delivery area, address and Not Listed details survive fulfilment redraws on the same branch", () => {
  const populationStart = order.indexOf("function populateDeliveryAreas(branch)");
  const populationEnd = order.indexOf("function handleDeliveryAreaChange()", populationStart);
  assert.ok(populationStart >= 0 && populationEnd > populationStart);
  const populate = order.slice(populationStart, populationEnd);
  assert.match(order, /deliveryAreasBranchId: null/);
  assert.match(populate, /var sameBranch = !!branchId && state\.deliveryAreasBranchId === branchId/);
  assert.match(populate, /sameBranch && select\.options\.length > 1/);
  assert.match(populate, /var previousSelection = select\.value/);
  assert.match(populate, /var previousSearch = input\.value/);
  assert.match(populate, /var previousAddress = \$\('delivery-address'\)\.value/);
  assert.match(populate, /var previousLocality = \$\('other-locality'\)\.value/);
  assert.match(populate, /var previousConfirmation = \$\('not-listed-confirm'\)\.checked/);
  assert.match(populate, /select\.value = retainedOption \? previousSelection : ''/);
  assert.match(populate, /input\.value = retainedOption \? retainedOption\.textContent : \(previousSelection \? '' : previousSearch\)/);
  assert.match(populate, /\$\('delivery-address'\)\.value = previousAddress/);
  assert.match(populate, /var retainedOption = sameBranch \?/);
  assert.match(populate, /retainNotListedDetails = sameBranch/);
  assert.match(populate, /state\.deliveryAreasBranchId = branchId/);
});

test("the retired standalone ordering URL redirects into the primary homepage V3 checkout", () => {
  const standalone = readFileSync(join(root, "order-online-v3.html"), "utf8");
  assert.match(standalone, /http-equiv="refresh" content="0; url=index\.html#menu"/);
  assert.match(standalone, /location\.replace\('index\.html#menu'\)/);
  assert.equal(standalone.includes('js/website-order-v3.js'), false);
});


test("catalog-model failure clears real V3 containers and leaves a visible recovery message", () => {
  assert.match(order, /\$\('catsIn'\)\.replaceChildren\(\)/);
  assert.match(order, /\$\('menuRoot'\)\.replaceChildren\(\)/);
  assert.match(order, /\$\('products-empty'\)\.hidden = false/);
  assert.doesNotMatch(order, /\$\('product-catalog'\)|\$\('product-category-nav'\)/);
});

test("removed V3 no-op/dead helpers and duplicate guard statements stay removed", () => {
  assert.doesNotMatch(order, /function pageStatus\(|pageStatus\(/);
  assert.doesNotMatch(order, /function loadWebsiteContext\(/);
  assert.equal((order.match(/\$\('place-order'\)\.disabled = true;/g) || []).length, 2);
});

test("production Website Order API uses server-only HKDF phone-key derivation, not the retired secret", () => {
  const api = readFileSync("supabase/functions/flame-chick-order-api/index.ts", "utf8");
  assert.match(api, /name: "HKDF"/);
  assert.match(api, /async function hmacPhoneDigest\(/);
  assert.match(api, /action==="place_website_order"/);
  assert.doesNotMatch(api, /FLAME_CHICK_ORDER_PHONE_HMAC_SECRET/);
});


test("legacy V2 homepage code safely no-ops when retired cart and category elements are absent", () => {
  assert.match(html, /if \(!el\.cbCount \|\| !el\.cbTotal\) return;/);
  assert.match(html, /if \(!menuEl \|\| !chipsEl \|\| !chips\.length \|\| !secs\.length\) return;/);
  assert.match(html, /if \(s && typeof s\.getBoundingClientRect === 'function'/);
  assert.match(html, /idx >= 0 && chips\[idx\] && typeof chipsEl\.scrollTo === 'function'/);
});

test("cart drawer traps focus, isolates the background and restores the actual opener", () => {
  assert.match(html, /id="fc-v3-cart-drawer"[^>]*tabindex="-1"/);
  assert.match(html, /id="fc-v3-cartbar-open"[^>]*aria-controls="fc-v3-cart-drawer"[^>]*aria-expanded="false"/);
  assert.match(order, /var cartDrawerOpener = null/);
  assert.match(order, /event && event\.currentTarget/);
  assert.match(order, /function cartDrawerFocusableElements\(\)/);
  assert.match(order, /function setCartDrawerBackgroundInert\(shouldInert\)/);
  assert.match(order, /entry\.element\.inert = true/);
  assert.match(order, /entry\.element\.inert = entry\.wasInert/);
  assert.match(order, /function handleCartDrawerKeydown\(event\)/);
  assert.match(order, /event\.shiftKey/);
  assert.match(order, /function keepCartDrawerFocusInside\(event\)/);
  assert.match(order, /document\.addEventListener\('focusin', keepCartDrawerFocusInside\)/);
  assert.match(order, /restoreTarget\.focus\(\{ preventScroll: true \}\)/);
  assert.match(order, /cartDrawerIsOpen = false/);
});

test("order status preserves the visual base class and exits the loading state after successful initialization", () => {
  assert.match(order, /node\.className = 'fc-home-order-status' \+ \(kind \? ' ' \+ kind : ''\)/);
  assert.match(order, /status\('Menu loaded\. Add items to start your order\.'\)/);
  assert.match(order, /var catalogRendered = renderCatalog\(\)/);
  assert.match(order, /if \(catalogRendered\) status\(/);
  assert.match(order, /status\(deals\?\.message \|\| 'Published deals could not be evaluated\.', 'error'\)/);
  assert.match(html, /\.fc-home-order-status\.success/);
  assert.match(html, /\.fc-home-order-status\.error/);
});

test("deal cards display published base prices and configurator prices remain estimates outside the payload", () => {
  const configurator = readFileSync(join(root, "js/catalog-v3-deal-configurator.js"), "utf8");
  assert.match(order, /fc-deal-base-price/);
  assert.match(order, /Number\.isSafeInteger\(variant\.basePriceMinor\)/);
  assert.match(order, /Price unavailable/);
  assert.match(configurator, /function getPriceEstimate\(\)/);
  assert.match(configurator, /fc-deal-price-summary/);
  assert.match(configurator, /priceEstimate\.complete \? \('Total for ' \+ priceEstimate\.dealQuantity/);
  assert.match(configurator, /getPriceEstimate: getPriceEstimate/);
  const payloadStart = configurator.indexOf("function toPayload()");
  const estimateStart = configurator.indexOf("function getPriceEstimate()", payloadStart);
  assert.ok(payloadStart >= 0 && estimateStart > payloadStart);
  assert.doesNotMatch(configurator.slice(payloadStart, estimateStart), /totalMinor\s*:/);
});


test('checkout action stays clickable with a cart and shows inline validation instead of silently disabling for missing fields', () => {
  assert.match(order, /function validateCheckoutForm\(\)/);
  assert.match(order, /function renderCheckoutFieldErrors\(validation\)/);
  assert.match(order, /Complete the highlighted checkout details before placing your order/);
  assert.match(order, /state\.checkoutAttempted = true/);
  assert.match(order, /firstInvalid\.focus\(\{ preventScroll: true \}\)/);
  assert.match(order, /disabled = !checkoutReady\(\)/);
  assert.match(html, /id="customer-name-error"/);
  assert.match(html, /id="customer-phone-error"/);
  assert.match(html, /id="delivery-area-error"/);
  assert.match(html, /id="delivery-address-error"/);
  assert.match(html, /id="not-listed-confirm-error"/);
});

test('checkout uses the standard Order API and preserves request idempotency without customer-facing rehearsal copy', () => {
  assert.match(order, /var result = await orderApi\('POST', '', state\.checkoutBody\)/);
  assert.match(order, /state\.checkoutBody\.request_id = state\.checkoutRequestId/);
  assert.match(order, /notes: \$\('order-notes'\)\.value\.trim\(\) \|\| null/);
  assert.doesNotMatch(order, /TEST ORDER - ADMIN DELETE|PRODUCTION REHEARSAL ORDER|TEST CHECKOUT ENABLED/);
});

test('product and deal artwork use published images and category-appropriate fallbacks', () => {
  assert.match(order, /function fallbackArtworkIcon\(value\)/);
  assert.match(order, /function appendPublishedArtwork\(container, item, fallbackLabel, altText\)/);
  assert.match(order, /function appendDealArtwork\(container, deal\)/);
  assert.match(order, /appendDealArtwork\(art, deal\)/);
  assert.doesNotMatch(order, /flame-chick-burger-2\.png/);
});
