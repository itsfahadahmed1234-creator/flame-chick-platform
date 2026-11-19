/* HFP single pricing engine.
   Pure functions: catalog indexing, variant/modifier/deal line pricing,
   cart totals, cart revalidation and WhatsApp order-message construction.
   No DOM, no storage, no network. Used identically by cart summary,
   sticky mobile cart, checkout summary and the WhatsApp message. */
(function (root) {
'use strict';

var FORMAT_LOCALE = 'en-PK';

function isTrue(v) { return v === true || v === 'true' || v === 1 || v === '1'; }
function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function roundInt(n) { return Math.round(num(n)); }
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function formatPkr(n) {
  return roundInt(n).toLocaleString(FORMAT_LOCALE, { maximumFractionDigits: 0 });
}

/* ---------- catalog index ---------- */

function buildCatalog(snap) {
  if (!isObj(snap)) throw new Error('buildCatalog: snapshot required');
  var ctx = {
    versionId: snap.versionId,
    schemaVersion: snap.schemaVersion,
    settings: isObj(snap.settings) ? snap.settings : {},
    products: {}, productsOrdered: [],
    variants: {}, variantsByProduct: {},
    categories: {}, subcategories: {},
    deals: {}, dealsOrdered: [], componentsByDeal: {},
    modifierGroups: {}, modifiers: {}, modifiersByGroup: {},
    modifierPriceRules: {}, assignmentsByProduct: {},
    deliveryAreas: [],
    waPhone: ''
  };
  ctx.waPhone = String(ctx.settings.wa_phone || '').replace(/[^0-9]/g, '');

  (snap.categories || []).forEach(function (c) { ctx.categories[c.CategoryID] = c; });
  (snap.subcategories || []).forEach(function (s) { ctx.subcategories[s.SubcategoryID] = s; });

  (snap.products || []).forEach(function (p) {
    ctx.products[p.ProductID] = p; ctx.productsOrdered.push(p);
    ctx.variantsByProduct[p.ProductID] = [];
  });
  ctx.productsOrdered.sort(function (a, b) { return num(a.SortOrder) - num(b.SortOrder); });

  (snap.productVariants || []).forEach(function (v) {
    ctx.variants[v.VariantID] = v;
    if (ctx.variantsByProduct[v.ProductID]) ctx.variantsByProduct[v.ProductID].push(v);
  });
  Object.keys(ctx.variantsByProduct).forEach(function (pid) {
    ctx.variantsByProduct[pid].sort(function (a, b) { return num(a.SortOrder) - num(b.SortOrder); });
  });

  (snap.deals || []).forEach(function (d) {
    if (!isTrue(d.Active)) return;
    ctx.deals[d.DealID] = d; ctx.dealsOrdered.push(d);
    ctx.componentsByDeal[d.DealID] = [];
  });
  ctx.dealsOrdered.sort(function (a, b) { return num(a.SortOrder) - num(b.SortOrder); });

  (snap.dealComponents || []).forEach(function (c) {
    if (ctx.componentsByDeal[c.DealID]) ctx.componentsByDeal[c.DealID].push(c);
  });
  Object.keys(ctx.componentsByDeal).forEach(function (did) {
    ctx.componentsByDeal[did].sort(function (a, b) { return num(a.SortOrder) - num(b.SortOrder); });
  });

  (snap.modifierGroups || []).forEach(function (g) { ctx.modifierGroups[g.ModifierGroupID] = g; });
  (snap.modifiers || []).forEach(function (m) {
    if (!isTrue(m.Active)) return;
    ctx.modifiers[m.ModifierID] = m;
    var gid = m.ModifierGroupID;
    if (!ctx.modifiersByGroup[gid]) ctx.modifiersByGroup[gid] = [];
    ctx.modifiersByGroup[gid].push(m);
  });
  Object.keys(ctx.modifiersByGroup).forEach(function (gid) {
    ctx.modifiersByGroup[gid].sort(function (a, b) { return num(a.SortOrder) - num(b.SortOrder); });
  });
  (snap.modifierPriceRules || []).forEach(function (r) {
    var mid = r.ModifierID;
    if (!ctx.modifierPriceRules[mid]) ctx.modifierPriceRules[mid] = {};
    ctx.modifierPriceRules[mid][r.SizeKey] = num(r.Price);
  });
  (snap.modifierGroupAssignments || []).forEach(function (a) {
    if (!isTrue(a.Active)) return;
    if (String(a.TargetType || '').toUpperCase() !== 'PRODUCT') return;
    if (!ctx.assignmentsByProduct[a.TargetID]) ctx.assignmentsByProduct[a.TargetID] = [];
    ctx.assignmentsByProduct[a.TargetID].push({ gid: a.ModifierGroupID, order: num(a.SortOrder) });
  });
  Object.keys(ctx.assignmentsByProduct).forEach(function (pid) {
    ctx.assignmentsByProduct[pid].sort(function (a, b) { return a.order - b.order; });
  });

  ctx.deliveryAreas = (snap.deliveryAreas || []).slice();
  return ctx;
}

/* ---------- modifiers ---------- */

function groupsForProduct(ctx, productId, context) {
  var out = [];
  var p = ctx.products[productId];
  if (!p || !isTrue(p.Active)) return out;
  var assignments = ctx.assignmentsByProduct[productId] || [];
  assignments.forEach(function (a) {
    var g = ctx.modifierGroups[a.gid];
    if (!g || !isTrue(g.Active)) return;
    if (context === 'deal' && isTrue(g.StandaloneOnly)) return;
    var mods = (ctx.modifiersByGroup[g.ModifierGroupID] || []).slice();
    out.push({
      group: g,
      groupId: g.ModifierGroupID,
      name: g.NameEn,
      selectionMode: g.SelectionMode,
      minSelect: num(g.MinSelect),
      maxSelect: Math.max(1, num(g.MaxSelect)),
      standaloneOnly: isTrue(g.StandaloneOnly),
      modifiers: mods.map(function (m) { return { modifier: m, modifierId: m.ModifierID, name: m.NameEn, priceMode: m.PriceMode }; })
    });
  });
  return out;
}

function modifierUnitPrice(ctx, modifierId, sizeKey) {
  var m = ctx.modifiers[modifierId];
  if (!m || !isTrue(m.Active)) return null;
  var mode = String(m.PriceMode || '').toUpperCase();
  if (mode === 'FREE') return 0;
  if (mode === 'FIXED') return roundInt(m.FixedPrice);
  if (mode === 'BY_SIZE') {
    var rules = ctx.modifierPriceRules[modifierId];
    if (!rules || rules[sizeKey] === undefined) return null;
    return roundInt(rules[sizeKey]);
  }
  return null;
}

/* ---------- deals ---------- */

function dealRows(ctx, dealId) { return ctx.componentsByDeal[dealId] || []; }

function choiceOptions(ctx, comp) {
  var pool = String(comp.PoolSubcategoryID || '');
  var size = String(comp.SizeKey || '');
  if (!pool || !size) return [];
  var out = [];
  ctx.productsOrdered.forEach(function (p) {
    if (p.SubcategoryID !== pool) return;
    if (!isTrue(p.Active) || !isTrue(p.Available)) return;
    var vs = ctx.variantsByProduct[p.ProductID] || [];
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (v.SizeKey === size && isTrue(v.Active) && isTrue(v.Available)) {
        out.push({ variantId: v.VariantID, productId: p.ProductID, name: p.NameEn, sizeLabel: v.SizeLabel, price: roundInt(v.Price) });
        break;
      }
    }
  });
  return out;
}

function resolveComponentVariant(ctx, comp) {
  if (comp.RefType === 'FIXED_VARIANT') return ctx.variants[comp.RefID] || null;
  if (comp.RefType === 'FIXED_PRODUCT') {
    var vs = (ctx.variantsByProduct[comp.RefID] || []).filter(function (v) { return isTrue(v.Active); });
    return vs.length ? vs[0] : null;
  }
  return null;
}

function dealSlots(ctx, dealId) {
  return dealRows(ctx, dealId)
    .filter(function (r) { return r.RefType === 'CHOICE_BY_SIZE'; })
    .map(function (r) { return { component: r, componentId: r.ComponentID, sizeKey: r.SizeKey, phrase: r.DescriptionPhrase || r.DisplayName || '', options: choiceOptions(ctx, r) }; });
}

function dealMissingChoices(ctx, dealId, choices) {
  var missing = [];
  dealSlots(ctx, dealId).forEach(function (slot) {
    var chosen = choices ? choices[slot.componentId] : null;
    var ok = chosen && slot.options.some(function (o) { return o.variantId === chosen; });
    if (!ok) missing.push(slot.componentId);
  });
  return missing;
}

function dealAvailabilityIssue(ctx, dealId) {
  var d = ctx.deals[dealId];
  if (!d) return { code: 'DEAL_MISSING', message: 'This deal is no longer on the menu.' };
  if (!isTrue(d.Active)) return { code: 'DEAL_INACTIVE', message: 'This deal is no longer offered.' };
  if (!isTrue(d.available)) return { code: 'DEAL_UNAVAILABLE', message: '“' + d.Title + '” is temporarily unavailable.' };
  return null;
}

/* ---------- pricing ---------- */

function priceLine(ctx, line) {
  if (!isObj(line)) return { ok: false, issues: [{ code: 'LINE_INVALID', message: 'Invalid cart line.' }] };
  var qty = Math.max(1, roundInt(line.quantity));
  var kind = (line.kind === 'deal' || line.isDeal) ? 'deal' : 'product';
  var issues = [];

  if (kind === 'deal') {
    var d = ctx.deals[line.dealId];
    if (!d) issues.push({ code: 'DEAL_MISSING', message: 'This deal is no longer on the menu.' });
    var unit = d ? roundInt(d.BundlePrice) : 0;
    return {
      ok: issues.length === 0, kind: 'deal', key: line.key, dealId: line.dealId,
      name: d ? d.Title : (line.name || ''), qty: qty,
      base: unit, modifierTotal: 0, unitTotal: unit, lineTotal: unit * qty,
      choices: isObj(line.choices) ? line.choices : {},
      detail: { components: d ? dealComponentDescriptions(ctx, d.DealID, line.choices) : [] },
      issues: issues
    };
  }

  var v = ctx.variants[line.itemId];
  if (!v) { issues.push({ code: 'VARIANT_MISSING', message: '“' + (line.name || 'Item') + '” is no longer on the menu.' }); }
  var pid = v ? v.ProductID : line.productId;
  var p = pid ? ctx.products[pid] : null;
  if (v && !isTrue(v.Active)) issues.push({ code: 'VARIANT_INACTIVE', message: '“' + (line.name || 'Item') + '” is no longer offered.' });
  if (v && !isTrue(v.Available)) issues.push({ code: 'VARIANT_UNAVAILABLE', message: '“' + (p ? p.NameEn : (line.name || 'Item')) + '” is currently unavailable.' });
  if (v && !p) issues.push({ code: 'PRODUCT_MISSING', message: '“' + (line.name || 'Item') + '” is no longer on the menu.' });
  if (v && p && !isTrue(p.Active)) issues.push({ code: 'PRODUCT_INACTIVE', message: '“' + p.NameEn + '” is no longer offered.' });
  if (v && p && !isTrue(p.Available)) issues.push({ code: 'PRODUCT_UNAVAILABLE', message: '“' + p.NameEn + '” is currently unavailable.' });

  var base = v ? roundInt(v.Price) : 0;
  var modifierTotal = 0;
  var modsOut = [];
  (line.modifiers || []).forEach(function (m) {
    if (!isObj(m)) return;
    var g = ctx.modifierGroups[m.groupId];
    var eligible = g && isTrue(g.Active) && p && (ctx.assignmentsByProduct[p.ProductID] || []).some(function (a) { return a.gid === g.ModifierGroupID; });
    if (!eligible) { issues.push({ code: 'MODIFIER_NOT_ELIGIBLE', message: '“' + (m.label || m.modifierId) + '” can no longer be added to this item.' }); return; }
    var price = modifierUnitPrice(ctx, m.modifierId, v ? v.SizeKey : null);
    if (price === null) { issues.push({ code: 'MODIFIER_PRICE_MISSING', message: '“' + (m.label || m.modifierId) + '” cannot be priced for this size.' }); return; }
    modifierTotal += price;
    modsOut.push({ groupId: m.groupId, modifierId: m.modifierId, label: m.label, price: price, priceMode: g ? (ctx.modifiers[m.modifierId] || {}).PriceMode : null, sizeKey: v ? v.SizeKey : null });
  });
  modifierTotal = roundInt(modifierTotal);
  var unit = base + modifierTotal;
  return {
    ok: issues.length === 0, kind: 'product', key: line.key, itemId: line.itemId,
    productId: pid, name: p ? p.NameEn : (line.name || ''), sizeLabel: v ? v.SizeLabel : (line.variant || ''),
    qty: qty, base: base, modifierTotal: modifierTotal, unitTotal: unit, lineTotal: unit * qty,
    note: line.note || '', detail: { modifiers: modsOut },
    issues: issues
  };
}

function dealComponentDescriptions(ctx, dealId, choices) {
  return dealRows(ctx, dealId).map(function (r) {
    var phrase = r.DescriptionPhrase || r.DisplayName || '';
    if (r.RefType === 'CHOICE_BY_SIZE') {
      var vid = choices ? choices[r.ComponentID] : null;
      var v = vid ? ctx.variants[vid] : null;
      var pv = v ? ctx.products[v.ProductID] : null;
      if (v && pv) phrase += ': ' + pv.NameEn + ' (' + v.SizeLabel + ')';
      else phrase += ': —';
    } else if (r.RefType === 'DRINK_INCLUDED') {
      phrase += ' (included)';
    }
    return phrase;
  }).filter(function (s) { return !!s; });
}

function deliveryFeeFor(ctx, opts) {
  var ful = String((opts && opts.fulfillment) || 'Delivery').toLowerCase();
  if (ful !== 'delivery') return 0;
  if (!ctx.deliveryAreas || !ctx.deliveryAreas.length) return roundInt(ctx.settings.DefaultDeliveryFee);
  if (opts && opts.areaFee !== undefined && opts.areaFee !== null && opts.areaFee !== '' && isFinite(Number(opts.areaFee))) return roundInt(opts.areaFee);
  return roundInt(ctx.settings.DefaultDeliveryFee);
}

function priceCart(ctx, lines, opts) {
  opts = opts || {};
  var priced = [];
  var subtotal = 0;
  var issues = [];
  (lines || []).forEach(function (line) {
    var p = priceLine(ctx, line);
    priced.push(p);
    if (p.ok) subtotal += p.lineTotal;
    p.issues.forEach(function (i) { issues.push({ key: line && line.key, code: i.code, message: i.message, name: p.name || (line && (line.name || line.dealId)) || 'Item' }); });
  });
  subtotal = roundInt(subtotal);
  var fee = deliveryFeeFor(ctx, opts);
  return {
    lines: priced,
    fulfillment: opts.fulfillment || 'Delivery',
    subtotal: subtotal,
    deliveryFee: fee,
    total: subtotal + fee,
    issues: issues
  };
}

function validateCart(ctx, lines, opts) {
  var cart = priceCart(ctx, lines, opts);
  var items = cart.issues.slice();
  (lines || []).forEach(function (line) {
    var kind = (isObj(line) && (line.kind === 'deal' || line.isDeal)) ? 'deal' : 'product';
    if (!isObj(line) || Math.max(1, roundInt(line.quantity)) < 1) {
      items.push({ key: line && line.key, code: 'QTY_INVALID', message: 'Quantity must be at least 1.', name: (line && line.name) || 'Item' });
      return;
    }
    if (kind !== 'deal') return;
    var avail = dealAvailabilityIssue(ctx, line.dealId);
    if (avail) { avail.key = line.key; avail.name = (ctx.deals[line.dealId] || {}).Title || line.name || 'Deal'; items.push(avail); return; }
    var missing = dealMissingChoices(ctx, line.dealId, line.choices);
    if (missing.length) {
      items.push({ key: line.key, code: 'DEAL_INCOMPLETE', name: ctx.deals[line.dealId].Title, message: 'Your “' + ctx.deals[line.dealId].Title + '” still needs ' + missing.length + ' selection' + (missing.length > 1 ? 's' : '') + '.' });
    }
  });
  var seen = {};
  var unique = items.filter(function (i) { var k = (i.key || '') + '|' + i.code; if (seen[k]) return false; seen[k] = 1; return true; });
  return { ok: unique.length === 0, items: unique, cart: cart };
}

/* ---------- order reference + WhatsApp ---------- */

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function makeOrderRef(now) {
  var d = now instanceof Date ? now : new Date(now || Date.now());
  var yy = String(d.getFullYear()).slice(2);
  var rand = '';
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (var i = 0; i < 4; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'HFP-' + yy + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + rand;
}

function lineMessageLines(priced) {
  var out = [];
  if (priced.kind === 'deal') {
    out.push('*' + priced.name + '* x' + priced.qty + ' — Rs. ' + formatPkr(priced.lineTotal));
    (priced.detail.components || []).forEach(function (c) { out.push('   • ' + c); });
  } else {
    var label = priced.name + (priced.sizeLabel ? ' (' + priced.sizeLabel + ')' : '');
    out.push(label + ' x' + priced.qty + ' — Rs. ' + formatPkr(priced.lineTotal));
    (priced.detail.modifiers || []).forEach(function (m) {
      var s = '   • ' + (m.label || m.modifierId);
      if (m.priceMode === 'BY_SIZE' && priced.sizeLabel) s += ' (' + priced.sizeLabel + ')';
      if (m.price > 0) s += ' + Rs. ' + formatPkr(m.price) + (priced.qty > 1 ? ' each' : '');
      /* Zero-price options (ice-cream flavours) get no suffix: "(Free)"
         was misleading. Delivery-fee Free messaging is separate (keep). */
      out.push(s);
    });
    if (priced.note) out.push('   ✎ ' + priced.note);
  }
  return out;
}

function buildOrderMessage(ctx, order) {
  order = order || {};
  var cart = order.cart || { lines: [], subtotal: 0, deliveryFee: 0, total: 0 };
  var ful = order.fulfillment || cart.fulfillment || 'Delivery';
  var cust = order.customer || {};
  var L = [];
  L.push('🍽️ NEW ORDER — ' + (ctx.settings.restaurant_name || 'Pizza Bite').toUpperCase());
  L.push('━━━━━━━━━━');
  L.push('Order: ' + (order.ref || '—'));
  L.push('Type: ' + (String(ful).toLowerCase() === 'takeaway' ? '🛍️ Takeaway' : '🛵 Delivery'));
  if (cust.name) L.push('Customer: ' + cust.name);
  if (cust.phone) L.push('Phone: ' + cust.phone);
  if (String(ful).toLowerCase() !== 'takeaway' && cust.address) L.push('Address: ' + cust.address);
  if (order.payment) L.push('Payment: ' + order.payment);
  if (order.notes) L.push('Order Notes: ' + order.notes);
  L.push('━━━━━━━━━━');
  L.push('*ITEMS*');
  (cart.lines || []).forEach(function (pl, i) {
    if (!pl || pl.issues.length) return;
    L.push((i + 1) + '. ' + lineMessageLines(pl).join('\n'));
  });
  L.push('━━━━━━━━━━');
  L.push('Subtotal: Rs. ' + formatPkr(cart.subtotal));
  L.push('Delivery Fee: ' + (cart.deliveryFee > 0 ? 'Rs. ' + formatPkr(cart.deliveryFee) : 'Free'));
  L.push('*TOTAL: Rs. ' + formatPkr(cart.total) + '*');
  L.push('━━━━━━━━━━');
  L.push('🕒 ' + (order.timestamp || '') + (order.ref ? ' · Ref: ' + order.ref : ''));
  L.push('Press Send in WhatsApp to place this order. Payment: ' + (order.payment || 'Cash on Delivery') + '.');
  return L.join('\n');
}

function waHref(number, message) {
  var n = String(number || '').replace(/[^0-9]/g, '');
  return 'https://wa.me/' + n + '?text=' + encodeURIComponent(message);
}

var WA_MAX_URL_LENGTH = 8000;

function waUrlSafe(url) { return String(url || '').length <= WA_MAX_URL_LENGTH; }

/* ---------- Android hand-off (official click-to-chat -> WhatsApp Messenger) ---------- */

/* Standard WhatsApp Messenger only. WhatsApp Business uses a different package
   (com.whatsapp.w4b) and must never be targeted. */
var WA_ANDROID_PACKAGE = 'com.whatsapp';

/* Supported hand-off devices: Android Chromium-family browsers (Chrome,
   Samsung Internet, Edge, Opera — all report Chrome/; Firefox Android does
   not). Everywhere else (desktop, iOS, Firefox Android, unknown) the plain
   official wa.me click-to-chat URL is used, which works in any browser that
   can deep-link to WhatsApp. No platform can be forced to open Messenger —
   these are the verified-supported paths, everything else falls back. */
function waIsAndroidChromium(ua) {
  ua = String(ua || '');
  return /Android/i.test(ua) && /Chrome\//i.test(ua) && !/Firefox\//i.test(ua);
}

/* Official wa.me click-to-chat URL -> Android intent URL pinned to WhatsApp
   Messenger, with the same wa.me URL as the browser fallback when the app is
   not installed. Only https://wa.me/<digits> URLs are converted; anything
   else is returned unchanged. */
function waIntentHref(waUrl) {
  waUrl = String(waUrl || '');
  if (!/^https:\/\/wa\.me\/\d/i.test(waUrl)) return waUrl;
  var tail = waUrl.slice('https://'.length); /* wa.me/<digits>?text=... */
  return 'intent://' + tail
    + '#Intent;scheme=https;package=' + WA_ANDROID_PACKAGE
    + ';S.browser_fallback_url=' + encodeURIComponent(waUrl)
    + ';end';
}

/* Decide how a wa.me URL is handed to the platform.
   testMode (?wa_test=1, enforced by staging-guard.js) always returns plain
   mode, so automated tests intercept window.open and never navigate anywhere. */
function waLaunch(waUrl, userAgent, testMode) {
  if (testMode) return { mode: 'plain', url: String(waUrl || '') };
  if (waIsAndroidChromium(userAgent)) return { mode: 'intent', url: waIntentHref(waUrl) };
  return { mode: 'plain', url: String(waUrl || '') };
}

/* ---------- cart persistence (format-versioned, revalidated on restore) ---------- */

var CART_FORMAT_VERSION = 1;

function lineKind(line) { return (isObj(line) && (line.kind === 'deal' || line.isDeal)) ? 'deal' : 'product'; }

function serializeCart(ctx, lines) {
  return JSON.stringify({ v: CART_FORMAT_VERSION, versionId: ctx.versionId, lines: (lines || []).filter(isObj) });
}

function parseCart(ctx, raw) {
  var data;
  try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return { lines: [], dropped: [], versionChanged: false, changed: true, reason: 'CORRUPT' }; }
  if (!isObj(data) || data.v !== CART_FORMAT_VERSION || !Array.isArray(data.lines)) {
    return { lines: [], dropped: [], versionChanged: false, changed: true, reason: 'FORMAT' };
  }
  var kept = [];
  var dropped = [];
  data.lines.forEach(function (line) {
    if (!isObj(line)) { dropped.push({ name: 'Item', message: 'Invalid cart entry removed.' }); return; }
    var name = line.name || (ctx.deals[line.dealId] || {}).Title || (line.dealId || 'Item');
    if (lineKind(line) === 'deal') {
      if (!ctx.deals[line.dealId]) { dropped.push({ name: name, message: '“' + name + '” is no longer on the menu.' }); return; }
    } else if (!ctx.variants[line.itemId]) {
      dropped.push({ name: name, message: '“' + name + '” is no longer on the menu.' });
      return;
    }
    var res = validateCart(ctx, [line], {});
    if (!res.ok) { dropped.push({ name: name, message: res.items[0].message }); return; }
    kept.push(line);
  });
  var versionChanged = data.versionId !== ctx.versionId;
  return { lines: kept, dropped: dropped, versionChanged: versionChanged, changed: versionChanged || dropped.length > 0, reason: null };
}

var HfpPricing = {
  FORMAT_LOCALE: FORMAT_LOCALE,
  WA_MAX_URL_LENGTH: WA_MAX_URL_LENGTH,
  buildCatalog: buildCatalog,
  groupsForProduct: groupsForProduct,
  modifierUnitPrice: modifierUnitPrice,
  dealRows: dealRows,
  choiceOptions: choiceOptions,
  resolveComponentVariant: resolveComponentVariant,
  dealSlots: dealSlots,
  dealMissingChoices: dealMissingChoices,
  dealAvailabilityIssue: dealAvailabilityIssue,
  dealComponentDescriptions: dealComponentDescriptions,
  priceLine: priceLine,
  priceCart: priceCart,
  validateCart: validateCart,
  deliveryFeeFor: deliveryFeeFor,
  formatPkr: formatPkr,
  makeOrderRef: makeOrderRef,
  buildOrderMessage: buildOrderMessage,
  waHref: waHref,
  waUrlSafe: waUrlSafe,
  WA_ANDROID_PACKAGE: WA_ANDROID_PACKAGE,
  waIsAndroidChromium: waIsAndroidChromium,
  waIntentHref: waIntentHref,
  waLaunch: waLaunch,
  CART_FORMAT_VERSION: CART_FORMAT_VERSION,
  serializeCart: serializeCart,
  parseCart: parseCart
};

if (typeof module !== 'undefined' && module.exports) module.exports = HfpPricing;
root.HfpPricing = HfpPricing;
})(typeof window !== 'undefined' ? window : globalThis);