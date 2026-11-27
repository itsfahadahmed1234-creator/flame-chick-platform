# Flame Chick customer website — current operating notes

Updated: 2026-11-27

## Current source and runtime

- Customer site (Cloudflare Pages Production): https://flamechick.pages.dev/
- Vercel fallback (unchanged Production): https://flame-chick-website-production.vercel.app
- Repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Active Cloudflare Website source branch: work/website-reliability-phase1-review
- Customer entrypoint: `apps/flame-chick-website/index.html`
- Production Supabase project: `adkrxfnawdiljhjaavnj` (Mumbai, `ap-south-1`)
- Production Website Order API: `flame-chick-order-api`, deployed version 11
- The API source in this branch is synchronized to the deployed v11 entrypoint. Phone digests use HKDF key derivation from the server-only Supabase service credential; the retired `FLAME_CHICK_ORDER_PHONE_HMAC_SECRET` is not required.
- The browser contains the Supabase URL and public publishable key only. Never place `service_role`, secret keys, HMAC keys, or database credentials in website assets.

## Published catalogue and current draft

- The public website reads the published V3 catalogue; it does not read the draft directly.
- Published publication: 2 (25 products, 28 product variants, 6 deals at the time of the audit).
- The current draft revision is 108, while the published snapshot is at revision 92.
- The changes after revision 92 are edits to the **Flame Feast** deal and its component/variant choices. They have not been published; customers continue seeing the published snapshot until an authorized publish operation.
- Product-variant price comparison between the current draft and the published snapshot returned no product-price/availability differences at the time of audit.
- The Main branch is active for website orders, Delivery and Takeaway are enabled. Listed area **Comsats University** has a Rs 0 fee; Not Listed uses a Rs 100 fee. The Order API recalculates and validates these values server-side.
- GST calculations remain deliberately deferred. Do not add tax fields, tax computation, or checkout tax collection as part of website cleanup. Customer-facing copy that says prices are “exclusive of applicable GST” should be reviewed separately because tax is not currently calculated by the website.

## Checkout and security invariants

- The customer browser sends catalogue identifiers, selected options, customer data, fulfilment selection, and an idempotency request ID. It does not submit trusted prices or a delivery fee.
- The Order API calculates prices and delivery fee from the active published catalogue and current branch/delivery configuration, and the database transaction validates the request before inserting the order.
- Retrying an uncertain checkout must reuse the exact same request ID and request body. Do not generate a new ID for an uncertain request.
- The database applies per-phone request quotas (3 in 1 minute, 3 in 10 minutes, 15 in 1 hour, as verified in the audit). This is not an IP-level bot defence: rotating phone numbers can bypass per-phone quotas.
- The Edge Function currently returns wildcard CORS. CORS is not authentication, but this broad browser-origin policy and the lack of layered IP/bot controls remain hardening items. Do not make an origin allowlist change without checking all legitimate POS/admin/website origins and preview requirements.
- No live order was submitted during the audit or source cleanup.

## Cleanup completed in this pass

- Synchronized the exact deployed Order API v11 `index.ts` into both `work/website-parallel-development` and `work/production-source-audit`.
- Removed an unused V3 `loadWebsiteContext` helper; startup already fetches catalogue and website context together.
- Removed the no-op `pageStatus` wrapper and its calls.
- Removed unused V2 catalog-cache settings from `js/config.js`; V3 catalogue loading explicitly uses no local/session storage cache.
- Fixed the product-view-model error path to clear the real V3 nodes (`catsIn` and `menuRoot`) and show a visible error rather than dereferencing obsolete V2 element IDs.
- Removed a duplicated Preview guard assignment.
- Removed the obsolete HMAC environment variable from the Edge Function test setup.
- Added static regression assertions for the error path and the HKDF-based API implementation; CI now triggers when the Order API entrypoint changes.

## Intentionally not removed yet

The homepage still contains a legacy, hidden V2 drawer/form and old inline JavaScript, including obsolete cart/customer storage helpers and an unreachable legacy submit block. These are not the V3 checkout path, but removal affects a large inline script and duplicate legacy markup. Keep them untouched until the UI rehearsal confirms the actual live V3 interactions, then remove them in a separate reviewed change. Do not re-enable or extend the V2 order handler.

## OpenCode UI rehearsal — completed 27 November 2026

The read-only Playwright/Chrome customer journey test is complete. It covered 1440×900 desktop and 390×844, 360×800 and 320×568 mobile. No source files, cookies/storage or Production data were changed; no Place Order/Retry action or non-GET request occurred. The audit found confirmed defects C1–C10, including stale/mis-styled status, legacy inline errors, missing images/generic deal art, missing deal prices, silent validation, cart focus escape, 320px clipping and awkward deal copy. The audit also confirmed correct catalogue loading, item/deal/cart calculations, delivery fees and repeated Delivery/Takeaway switching.

**Do not repeat the old checklist above as pending.** The full findings, exact Playwright evidence references, source causes, pass results, test limitations and prioritized correction phases are in [the 27 November UI reliability continuation handoff](../handoffs/2026-11-27-website-ui-reliability-next-session.md). The live site is order-writable, so automated QA must stop before Place Order/Retry. No fixes to C1–C10 are implied by this audit record; they remain pending source work. Continue on `work/website-parallel-development`, compare current branch files to live C57 snapshot before editing, and obtain explicit approval before any deployment, Production write or real order.


## Cloudflare Pages hostname update — 27 November 2026

- Production Pages project flamechick, ID 5daf4460-c018-4115-af98-3093e2b280ef.
- Production URL https://flamechick.pages.dev/; deployment 07297e8b-e79d-46ae-9696-78be7f28c7f8; Cloudflare reports all stages successful and this is the canonical deployment.
- Source branch work/website-reliability-phase1-review; exact deployed commit 2a63046e1e5d81ced272acc08b17c1a3021b779d. Static Checks run 45981432738 passed.
- Exact flamechick.pages.dev was added to the strict checkout host allowlist. The previous hostname flame-chick-website.pages.dev stays allowed during transition; unrecognized Pages previews/deployment hosts stay blocked.
- Old Pages project is preserved as flamechick-legacy at flame-chick-website.pages.dev; its automatic Production/Preview deployments are disabled. Vercel C57 remains untouched as a fallback.
- The user subsequently confirmed that interactions on flamechick.pages.dev work and that submitted Website orders reach POS. This is user-reported verification; the assistant did not independently inspect POS order records. Do not create further Production orders just to repeat this confirmation.
- POS migration is managed by a separate conversation. Admin/Rider still pending. Supabase Production and DNS were not changed.


## User-confirmed live Website-to-POS verification — 27 November 2026

The user reports they personally tested the Cloudflare Production Website at https://flamechick.pages.dev/, confirmed that its interactions work, and confirmed that submitted Website orders reach the POS. Record this as **user-verified Website-to-POS operational behaviour**. This supersedes the earlier statement that signed-in interaction and order handoff had not yet been checked.

The verification is user-reported in chat; the assistant did not independently open POS order records or inspect order IDs. Do not describe this as an independently reproduced test. No additional test order, Retry, schema change, Edge Function change, DNS change or Vercel cutover is implied by this confirmation. Keep Vercel C57 intact as fallback until the user approves any cutover.
