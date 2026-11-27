# Flame Chick Website — 27 November 2026 UI Reliability Handoff

**Purpose:** Continue the exact Website reliability work after the completed OpenCode Playwright audit. This is a handoff and implementation plan, not permission to deploy or change Production.

## Start here in the next ChatGPT session

Read these files in this order before proposing or changing anything:

1. `README.md` — repository entry point and project-wide safety instructions.
2. `PROJECT_HANDOFF.md` — overall Flame Chick architecture, history, production decisions, shared backend dependencies and role/business rules. It is historical and large; use its dated headings and prefer the newest Website checkpoint below over older Website status.
3. `docs/handoffs/WEBSITE_PARALLEL_CONTEXT_INDEX.md` — Website-specific read-first index and active branch/environment links.
4. **This file** — newest Website task checkpoint and pending corrections.
5. `docs/operations/2026-11-26-new-vercel-website-production-handoff.md` — selected Website environment/hosting history; older project IDs and hostnames in other notes may be superseded.
6. `docs/handoffs/2026-11-25-website-parallel-audit.md` — Website architecture, source map and previous parallel-development decisions.
7. `docs/audits/FLAME_CHICK_WEBSITE_AUDIT_2026-11-27.md` — source/catalogue/order API audit and cleanup record.
8. `docs/operations/2026-11-27-cloudflare-hosting-transition-handoff.md` — newest hosting target, failed initial Worker build, four Pages plan and verified Vercel Production deployment.

Do not treat an older statement in a historical handoff as current if a newer dated checkpoint supersedes it. After reading, give the user a short summary of the active project, active branch, live deployment, previous work and remaining tasks before editing source.

## User's current working arrangement

- The user is on ChatGPT Web Free and cannot use ChatGPT Work mode for interactive browser control.
- The user has **OpenCode with DeepSeek 4.1 Flash** available and used it with Playwright/Chrome to complete the live UI audit below.
- Continue collaborating with the user step by step. Use OpenCode for active browser/Playwright testing when requested; ChatGPT should review its evidence, guide fixes, inspect repository/handoffs and help verify results.
- The user wants continuity, not a rebuild or a fresh architecture. Read all handoffs first, preserve established decisions, explain dependencies and avoid assumptions.
- User-authorized work in this handoff is documentation only. The pending source fixes below are the next implementation scope; do not interpret this handoff as permission to deploy, submit a real order, change Production data, or change shared backend infrastructure.

## Latest hosting and release status — 27 November 2026

The user has directed the project to move the four frontend apps to Cloudflare Pages and, after the correct Pages projects are configured, deploy the latest intended/reviewed changes to Cloudflare Production so the apps remain current. This is a hosting transition, not a Supabase/backend migration. Read `docs/operations/2026-11-27-cloudflare-hosting-transition-handoff.md` for the full current checkpoint and exact next steps.

- Cloudflare account is connected as `itsfahadahmed1234@gmail.com`; the GitHub repository connection to `itsfahadahmed1234-creator/flame-chick-platform` is confirmed through Workers Builds.
- The initial Cloudflare dashboard flow created a Worker named `flame-chick-platform`, **not Pages**. It failed because it ran `npx wrangler deploy` at repository root and could not detect a static assets directory. Pages inventory still had zero projects.
- Create four separate Pages projects with roots: `apps/flame-chick-website`, `apps/flame-chick-pos`, `apps/flame-chick-admin`, `apps/flame-chick-rider`. Inspect each app's actual configuration to select valid build/output settings; do not copy the failed root Worker configuration.
- Latest verified Vercel Website Production remains C57: deployment `dpl_7EzwXVHFsjG91oGixcWbrfWkFSiy`, source commit `c57be50d1674e597693117d1f39867c4c042f43a`, branch `work/website-parallel-development`, READY/Production. A newer project-level Vercel deployment is merely a Preview from `work/production-source-audit`, not Production.
- Newer Website reliability candidate `9bd5f81ca59d80da7192c96d6aa8e694bfbb03e5` on `work/website-reliability-phase1-review` passed its matching Website Static Checks, but was not deployed to Vercel Production. Compare and reconcile that candidate with current source and outstanding UI findings before choosing Cloudflare's production branch/commit.
- Keep Vercel available as fallback until all four Cloudflare Pages applications pass smoke tests; do not disconnect Vercel, delete projects or cut over DNS during setup.

## Repository, branch and deployment context

- Repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Website source branch: `work/website-parallel-development`
- Source branch checkpoint used to create this handoff: `6fccc8c958463ccc789a7b506faf6df95b10a37e` (`ci(website): watch all order api function files`)
- Documentation-only handoff branch: `handoff/website-ui-reliability-2026-11-27`. It was created from the source branch checkpoint above so this handoff can be reviewed independently. For application changes, continue on `work/website-parallel-development`, not the handoff branch, unless the user explicitly asks otherwise.
- Keep `work/production-source-audit` separate. Do not merge, reset, rebase, cherry-pick or overwrite it without discussing the exact dependency and receiving approval.
- Customer site audited: https://flame-chick-website-production.vercel.app
- The prior deployment inspection identified the live customer page as commit `c57be50d1674e597693117d1f39867c4c042f43a`. The live Playwright snapshots/source copies were saved in OpenCode's audit workspace as `live/index-c57.html` and `live/website-order-v3-c57.js`; evidence was saved under `evidence/`. These paths may be local to OpenCode and are not assumed to exist in the Git repository.
- The checked-in source branch has newer cleanup than the deployed C57 snapshot. **Do not assume a source-branch fix has reached the live site.** Verify the exact live deployment commit and current branch HEAD independently before each test/release.
- The current source branch's latest recorded Vercel Preview deployment at this checkpoint was READY, target Preview (`target: null`), deployment `dpl_9p95MCrGM1oTh75HMKnmEciVR3zd`, source commit `6fccc8c958463ccc789a7b506faf6df95b10a37e`. This is not proof of a safe write-isolated test backend. Do not use a Production-backed Preview for order submission.
- A Git push may automatically create Vercel deployments. Keep changes grouped, check branch/path triggers, and do not trigger manual/API/CLI deployments, promote deployments or change aliases/domains without explicit approval. A docs-only handoff branch is not a reason to deploy the Website.

## Flame Chick platform context to preserve

This is one integrated Flame Chick platform, not a standalone storefront rebuild:

- Apps: customer Website, POS, Admin panel and Rider portal, all in `apps/`.
- Shared backend: Supabase Production project `adkrxfnawdiljhjaavnj`, Mumbai (`ap-south-1`), Free plan.
- Current Website source: `apps/flame-chick-website/`; customer entrypoint `index.html`; active V3 modules include catalogue client/view, branch/fulfilment, deal view/configurator, Preview guard and `website-order-v3.js`.
- Production Order API: `flame-chick-order-api`, deployed v11 at the time of the prior backend audit. The v11 entrypoint was synchronized into the two named source branches during the earlier cleanup. Re-check deployed version/source before changing it.
- The customer Website consumes the published V3 catalogue and current operational branch/fulfilment context. It must never trust browser-submitted prices or delivery fees. The server recalculates prices/availability/fees and the database transaction validates the order.
- Website order creation is one-step through the Order API. The client sends product/deal identifiers, explicit choices, fulfilment and customer information plus an idempotency request ID. An uncertain retry must reuse the exact same request body and request ID.
- The DB quota observed in the backend audit is per restaurant/phone digest: 3 successful orders in 1 minute, 3 in 10 minutes, 15 in 1 hour. This is not IP/bot protection; phone rotation can bypass these quotas.
- The Edge Function had wildcard CORS at the time of source audit. CORS is not authentication. Review CORS and layered abuse controls as a separate hardening task; do not apply a simplistic origin restriction without inventorying legitimate Website/POS/Admin/approved Preview origins.
- Existing Website pricing, deal validation, quote/order and POS integrations are shared dependencies. Keep fixes Website-local unless a demonstrated shared-backend defect requires coordination.
- Do not independently change POS, Admin, Rider, shared pricing/catalogue modules, Edge Functions, migrations or database schema as a side effect of Website cleanup.
- **GST/tax implementation is deliberately deferred.** Do not add tax fields, tax calculation or checkout tax collection. The wording “exclusive of applicable GST” needs a separate copy review because the current Website does not calculate GST.
- Flame Chick must remain pre-launch until the complete approved rehearsal/release gates are met. A visually working Place Order button is not proof of production readiness.

## Catalogue and business values at the previous audit

Read-only audit state at 27 November 2026:

- Published V3 publication: 2.
- Published snapshot: 25 products, 28 variants, 8 categories, 6 deals.
- 20 standalone-sellable product cards appeared in the rendered menu; internal component products are not standalone customer cards.
- Draft revision: 108; published snapshot revision: 92. The intervening edits were Flame Feast deal/component/variant-option edits and had not been published at audit time. Never publish a draft as a Website fix without explicit user review/approval.
- Draft-vs-published product variant price/availability comparison returned no differences at that audit.
- Main branch Website ordering, Delivery and Takeaway were enabled. Comsats University delivery fee was Rs 0; Not Listed/Other default fee was Rs 100. The Order API/database independently validate current delivery configuration.
- Previous source/backend audit found no mismatch between published product variant prices and the draft at that point.
- Whole Chicken Broast remains three separate products (Simple Injected Rs 2,499, Nashville Rs 2,699, Cheetos Butter Rs 2,799), not one flavour-variant product.
- Keep all published prices and business decisions sourced from the catalogue/database. Do not hardcode audit prices in the UI.

## OpenCode Playwright audit — completed, read-only

**Audit:** 27 November 2026.  
**Browser:** Chrome via Playwright, isolated fresh contexts.  
**Viewports:** 1440×900 desktop; 390×844, 360×800 and 320×568 mobile.  
**Safety:** No source files changed; no cookies/storage altered; no Place Order/Retry clicked; no order submitted; no non-GET request observed. This was UI/browser testing, not a backend write/security test.

### Confirmed defects from the live C57 copies

| ID | Severity | Confirmed finding | Likely source/root cause from audit |
|---|---|---|---|
| C1 | Medium | “Checking the published menu and current branch settings...” stays in the empty-cart footer after catalogue/context load | In live `website-order-v3-c57.js`, `start()` sets the checking message, then the success path calls no-op `pageStatus()`; no final status/clear occurs |
| C2 | Medium | Status success/error styling never applies; computed background/padding/radius are absent | `status()` overwrites class with `order-status`, while CSS styles `.fc-home-order-status` and its success/error modifiers |
| C3 | Medium | Two uncaught legacy inline-script errors occur on page load | Legacy `renderCart` writes `el.cbCount.textContent` when removed V2 nodes are null; legacy `spy` reads `chips[idx].offsetLeft` when old category chips are absent |
| C4 | High | 20/20 visible product cards have no `<img>`; all use emoji fallbacks and some are wrong for the product | All 25 published products had `imagePublished:false` and `imageCurrentPath:null`; emoji fallback maps burgers such as The Smash/The Marrow to fries |
| C5 | Medium | All six deal cards use the same generic burger image | `renderDeals()` hardcodes `media/products/flame-chick-burger-2.png` |
| C6 | High | Deal cards and one-variant deal configurators show no price or live total before add-to-cart | Base deal price/total is missing from card/configurator; the cost becomes visible only after adding to cart |
| C7 | Medium | Invalid checkout fields silently keep Place Order disabled without inline messages, `aria-invalid` or field-level explanation | `checkoutReady()` only returns false and `renderCart()` disables the CTA |
| C8 | High accessibility | Cart drawer has `aria-modal=true` but no focus trap/background inert state; Tab and Shift+Tab reach obscured background controls | `openCartDrawer()` focuses close button but does not contain focus; close always restores to header cart, not the actual opener |
| C9 | Low | Flame Feast CTA bottom is clipped at 320×568 until the dialog is scrolled | Dialog content is 389px high against 369px client height; bottom at 503px while viewport ends at 493px |
| C10 | Low | Deal validation wording is awkward (“Choose between 2 and 2 item(s) for Burger”, “0/2 required selected”) | Generic min/max validation copy is used when min=max |

**Important source-version caveat:** These code locations/line numbers refer to the live C57 copies, not necessarily the newer source branch. The previous source cleanup removed the no-op `pageStatus` wrapper/calls, unused `loadWebsiteContext`, a duplicated Preview guard assignment and stale cache configuration, and corrected the V3 catalogue error target. It did **not** implement all the UI fixes above. Before editing, compare the current branch source with the C57 snapshots and fix the current branch implementation, not line numbers copied from the live snapshot.

### Other suspected/secondary issues

1. At 320×568, the cart sticky footer geometrically overlaps part of the delivery-area field on first open until the drawer is scrolled. Confirm the actual user experience and add proper scroll padding/affordance if reproducible.
2. Whether the unpublished product imagery/emoji fallback is intentional is unknown. The absence of published image paths is confirmed; content intent is not.
3. The production Website host is write-enabled so genuine customers can place orders. This is expected for the customer host, but it makes it unsafe as an automated QA target. Do not disable legitimate customer checkout merely to make testing safe; isolate QA using a read-only UI/mock or a separately approved server-side synthetic environment.
4. The live HTML response had HSTS but the audit did not see CSP (including `frame-ancestors`), X-Content-Type-Options, Referrer-Policy or Permissions-Policy. Review these headers and framing/clickjacking exposure as a hardening task; no framing attack was attempted.

### Tests that passed

- Catalogue loaded: publication 2, 25 products, 28 variants, 8 categories, 6 deals.
- 20 standalone-sellable product cards and 8 category chips rendered; all 6 deal cards rendered, 4 available.
- Flame Hour deals were correctly unavailable outside their 3–5 PM schedule at the audit time (08:47 PKT).
- The Smash: required variant behaviour was correct; Double Patty = Rs 999; quantity 2 = Rs 1,998.
- Water: Regular = Rs 99; quantity stepper, line totals, increment/decrement/remove recalculation all correct.
- Flame Duo: two burger slots, same burger allowed twice, required 2/2, Rs 2,099 per deal; quantity 2 = Rs 4,198 line.
- Flame Feast: three burger slots, required 3/3, Rs 3,599.
- Mini Flame = Rs 399; Little Crunch = Rs 999.
- Four-deal subtotal = Rs 9,195; after increasing Flame Feast quantity to 2, subtotal = Rs 12,794; after removing Mini Flame, subtotal = Rs 12,395. All checked line and subtotal calculations matched the published values.
- Five Delivery↔Takeaway cycles preserved cart items, customer fields, address and selected delivery area. Delivery fields hid on Takeaway and reappeared on Delivery.
- Delivery payment copy correctly stated Cash on Delivery; Takeaway copy correctly stated Cash at takeaway collection.
- Comsats University fee Rs 0; Not Listed fee Rs 100; fee/total changed correctly. Not Listed required locality plus explicit confirmation. A no-match search cleared selected area/fee.
- Blank name and short address disabled Place Order; the problem is missing explanation/accessible feedback rather than failure to disable.
- No horizontal overflow at 390, 360 or 320px. Product dialogs fit/scroll correctly and their Add button remained visible. Deal configurators fit 390/360; 320 required scroll with the minor CTA clipping noted above.
- Cart opens and focuses close button; Escape closes and scroll lock is removed. Native product/deal dialogs contained focus in tested cycles; the cart drawer did not.
- No failed requests or HTTP >=400 responses were seen. No non-GET requests were observed.

### Not tested / not possible with this published catalogue

- Product modifiers/required modifier choices/price rules: published catalogue had zero modifier groups, modifiers, group assignments and modifier price rules.
- Deal substitutions: all published deal options were `INCLUDED`; there were no substitutions/standalone options.
- Repeat-limit overflow beyond published max: configured slot counts matched option caps, so beyond-cap selection could not be reached.
- Published-vs-draft Flame Feast comparison: no Admin/draft workflow was used in this read-only pass.
- Order submit, confirmation and retry: deliberately not clicked.
- Non-cash payments: only cash instructions exist.
- Real mobile virtual keyboard, Safari/Firefox and screen reader: Chrome headless only; keyboard shrink was simulated.
- Server-side price, delivery-area, quota and idempotency enforcement: browser test was GET-only. Backend source/SQL was audited separately; this Playwright run did not exercise writes or runtime guarantees.

## Prioritized correction plan

### Phase 0 — QA safety (before any further automated checkout rehearsal)

- Treat `flame-chick-website-production.vercel.app` as a real, order-writable customer site. Never click Place Order or Retry Order during QA.
- Do not weaken real customer checkout on Production to suppress QA writes. Build/use a genuinely isolated, read-only browser target or a synthetic/mock order backend with no route to Production writes. A client-only disabled button is not a server-side security boundary.
- Before using any Preview for an interactive checkout path, trace its exact config/Order API destination and prove it cannot write to Production. No orders during this task without a separately approved rehearsal plan.

### Phase 1 — Core UI reliability/accessibility (first source-fix batch)

1. **C3:** remove or safely guard the obsolete legacy `renderCart` and `spy` runtime paths. Prefer removing dead V2 markup/handlers only after mapping every event/selector dependency; do not blindly delete the whole inline script.
2. **C8:** implement a proper modal focus trap for the V3 cart drawer; make obscured background content inert while open; restore focus to the actual opener (header cart or mobile cart bar). Preserve Escape and scroll locking.
3. **C1/C2:** make the status lifecycle accurate (clear or set a final verified message after successful load) and preserve the intended base CSS class when applying success/error states. Ensure loading, success and error messages are not stale.
4. **C6:** show published deal base prices on each deal card and a live, accurate configurable total in the configurator, using the returned/published price model—not hardcoded prices. Make the total visible before adding the deal to cart.

### Phase 2 — Customer-facing clarity and presentation

5. **C7:** add inline field validation, human-readable error text, required indicators and accessible `aria-invalid` / error associations. Keep authoritative server validation unchanged.
6. **C4:** improve incorrect emoji mappings immediately and establish the approved product-image publishing flow. Do not invent or upload product photography without approved assets/content.
7. **C5:** use deal-specific approved artwork or a consistent neutral deal image; remove the single hardcoded burger image for every deal.
8. **C9:** remove CTA clipping at 320×568; ensure dialog actions remain visible/reachable and scrolling is obvious.
9. **C10:** replace min=max generic copy with natural wording such as “Choose 2 burgers” and “2 of 2 selected”.

### Phase 3 — Hardening and regression tests

10. Add CSP with suitable `frame-ancestors`, X-Content-Type-Options, Referrer-Policy and Permissions-Policy; test legitimate Vercel/Supabase asset/API loading and avoid breaking checkout.
11. Review wildcard CORS and add layered anti-automation/IP/bot protections in a backend-coordinated task. Do not claim per-phone quotas are bot protection.
12. Add automated browser regression checks for: no uncaught exceptions on load; final status text/class; deal prices/totals before add; correct image fallback; inline checkout validation/accessibility; cart focus trap/restore; 320px CTA and sticky footer geometry.
13. Re-run the same Playwright matrix after fixes, preferably against a safe isolated UI/test target. Include the same desktop and 390/360/320 mobile viewports.

## Implementation rules for the next session

- Work on `work/website-parallel-development` only for Website corrections. First inspect current branch files and exact CI/workflow triggers; do not base fixes solely on live C57 line numbers.
- Start with one scoped source-only batch (Phase 1) and related tests. Before each edit, explain the intended behaviour and any interaction/dependency risk. Make no speculative redesigns.
- Do not rebuild the Website, change its visual identity, replace the catalogue architecture, or change working cart/price/fulfilment logic just to address the confirmed defects.
- Do not alter product/deal prices, availability, publication/draft data, DB tables/RPCs, secrets, CORS, RLS, POS, Admin or Rider as part of the first UI batch.
- Preserve source and deployment separation. A code fix on the source branch is not a Production fix until the exact deployed commit is verified.
- Run targeted local tests and Website Static Checks. A CI pass is not proof of browser correctness; re-run Playwright.
- No Production deployments, Preview promotion, domain/alias changes, Supabase writes, migrations, Edge Function deployments, publication changes, test orders, or live checkout submissions without the user's explicit approval.
- The user expects a clear progress note, evidence-backed conclusions, and handoffs updated after a meaningful completed stage.
- If a task requires a shared backend change, stop and explain the cross-app impact before editing it. Keep the Free-plan constraints in mind.

## Exact continuation instruction

The next ChatGPT session should read the project handoffs listed at the top, then say:

> “I have read the Flame Chick project and Website handoffs. The current task is to fix the confirmed 27 November Playwright findings on `work/website-parallel-development`, beginning with legacy page-load errors, cart focus management, status lifecycle/styling and deal-price visibility. The live C57 site remains the reference for the reported defects, but source fixes must target the current branch and be verified against its actual code. No production deployment, order submission, database change or publication change is authorized. I will work through the corrections with you and use OpenCode for the browser regression pass.”

Wait for the user to review the project overview and confirm the first source-fix batch before making application-code changes.


---

## Superseding hosting/release checkpoint — flamechick.pages.dev — 27 November 2026

The Customer Website is now deployed to Cloudflare Pages Production at https://flamechick.pages.dev/.

- Pages project flamechick; project ID 5daf4460-c018-4115-af98-3093e2b280ef.
- Production deployment 07297e8b-e79d-46ae-9696-78be7f28c7f8; URL https://07297e8b.flamechick.pages.dev/; Cloudflare reports all stages SUCCESS and this deployment canonical.
- Release branch work/website-reliability-phase1-review; source SHA 2a63046e1e5d81ced272acc08b17c1a3021b779d.
- Commit extends the strict checkout allowlist with flamechick.pages.dev. It retains the exact former flame-chick-website.pages.dev host and continues blocking all other Pages preview/deployment hosts.
- Website Static Checks run 45981432738 passed for this exact commit.
- Build root apps/flame-chick-website; blank build command; output directory .; Git owner itsfahadahmed1234-creator; repository flame-chick-platform; production auto-deploy enabled; preview branch work/website-parallel-development; build-watch include apps/flame-chick-website/*.
- Pages environment variables: none. Browser config uses the existing Supabase Production URL and public publishable key only.
- Previous Pages project is preserved as flamechick-legacy at flame-chick-website.pages.dev; automatic production/preview builds are disabled. Vercel C57 is still online and unchanged as fallback.

The new Pages deployment passed Cloudflare's API stages. The user subsequently confirmed that flamechick.pages.dev interactions work and that submitted Website orders reach POS. This is user-reported operational verification; the assistant did not independently inspect POS order records. No further test order is needed for this checkpoint. No Supabase data, schema, functions, Realtime, orders, payments, DNS, Vercel aliases or projects were modified. POS is controlled by the separate conversation; Admin/Rider hosting are pending.


## User-confirmed live Website-to-POS verification — 27 November 2026

The user reports they personally tested the Cloudflare Production Website at https://flamechick.pages.dev/, confirmed that its interactions work, and confirmed that submitted Website orders reach the POS. Record this as **user-verified Website-to-POS operational behaviour**. This supersedes the earlier statement that signed-in interaction and order handoff had not yet been checked.

The verification is user-reported in chat; the assistant did not independently open POS order records or inspect order IDs. Do not describe this as an independently reproduced test. No additional test order, Retry, schema change, Edge Function change, DNS change or Vercel cutover is implied by this confirmation. Keep Vercel C57 intact as fallback until the user approves any cutover.
