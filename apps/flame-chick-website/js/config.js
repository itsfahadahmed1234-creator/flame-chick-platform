/* Flame Chick frontend configuration.
   Public values only. Never put secrets, tokens or credentials in this file.
   The Flame Chick site uses the renamed Flame Chick Supabase tenant and its existing catalog/image references.
   WA_PHONE/PHONE_DISPLAY below are the SINGLE AUTHORITATIVE SOURCE for the
   Flame Chick contact destination for this branded showcase — see the note above
   window.WA_PHONE. */
var FLAME_CHICK_CONFIG = {
  /* Flame Chick Supabase catalog Edge Function. Public read-only catalog endpoint. */
  apiBase: 'https://adkrxfnawdiljhjaavnj.supabase.co/functions/v1/flame-chick-catalog',
  orderApiBase: 'https://adkrxfnawdiljhjaavnj.supabase.co/functions/v1/flame-chick-order-api',
  publishableKey: 'sb_publishable_89MQIj_drF15IrF05ZLt0w_txUjPMxy',
  /* Version-aware schema-v2 catalog cache (localStorage, validated on read). */
  catalogCacheKey: 'flame_chick_catalog_v1',
  cacheFormatVersion: 2,
  /* Network behaviour. */
  requestTimeoutMs: 12000,
  retries: 2,
  retryDelayMs: 600,
  /* Copy used for the unavailable-menu inquiry action. */
  inquiryText: 'Hello Flame Chick, I would like to make an inquiry about your menu.',
  unavailableHeading: 'The menu is unavailable right now',
  /* Published product images — staging repo (test images only). */
  imagesBaseUrl: 'https://adkrxfnawdiljhjaavnj.supabase.co/storage/v1/object/public/flame-chick-media',
  /* Supabase Storage for admin-managed Flame Chick product/category/deal images. */
  supabaseUrl: 'https://adkrxfnawdiljhjaavnj.supabase.co',
  mediaBucket: 'flame-chick-media'
};

/* ===== SINGLE AUTHORITATIVE SOURCE — restaurant WhatsApp/phone destination =====
   Flame Chick contact for this demo: +92 335 8044164 (923358044164).
   Every destination on this site derives from these two values: checkout order
   hand-off, menu inquiry, landing "call/message" cards, footer and the order-
   sent screen. The published catalog setting settings.wa_phone no longer
   overrides the site destination (it is informational only).
   AUTOMATED TESTS: load any page with ?wa_test=1 — js/staging-guard.js then
   forces the test-only number 923000000000 (not a real subscriber) on every
   wa.me/tel destination and disables the Android intent hand-off, so automated
   runs can never reach the real number. Nothing is ever auto-sent regardless:
   wa.me click-to-chat links only prefill a message for the customer to review
   and press Send. */
window.WA_PHONE = '923358044164';
window.PHONE_DISPLAY = '+92 335 8044164';

/* Business-hours defaults used before (or without) catalog settings.
   Owner instruction 2026-11-04: the menu bar and the checkout modal show ONE
   merged "Delivery & restaurant hours" section. The headline window is the
   restaurant's 12:00 PM – 1:00 AM; delivery still stops at 10:00 PM and is
   shown as an explicit "Delivery until" note so the site never implies an
   11 PM delivery cutoff (owner-approved 2026-10-22). Overwritten by
   settings.opening_hours / settings.delivery_hours when a catalog provides
   them. */
var OPENING_HOURS = '12:00 PM – 1:00 AM';
var DELIVERY_HOURS = '12:00 PM – 1:00 AM';
var RESTAURANT_HOURS = '12:00 PM – 1:00 AM';