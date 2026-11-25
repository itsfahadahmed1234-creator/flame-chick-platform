# Flame Chick — Admin Deal Editor Correction Preview (2026-11-25)

This is the next continuation checkpoint after the Burger Choice Editor Save checkpoint. It does not change catalog data. Continue from the existing branch and preserve all prior work.

## Project state

- Repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Branch: `work/production-source-audit`
- Admin editor source commit: `dd6151e3bd86d9abd67cfce24b221dd4b5af3f8e`
- Supabase Production project: `adkrxfnawdiljhjaavnj`, Mumbai `ap-south-1`, Free plan.
- Existing Admin Preview deployment before this fix: `dpl_F1u84RnNLBKBEiEeveRiXEedspUj` at commit `68dcbab806a511640f458bd1febdfb5e36b95b12`.
- New Admin Preview deployment: `dpl_7kEfiQME3TzbV69QnA6Pj61nVKAt`, READY, built from exact source commit `dd6151e3bd86d9abd67cfce24b221dd4b5af3f8e`.
- Unique deployment URL: https://flame-chick-admin-production-2iu5qllg8-fahad-7455.vercel.app/
- Stable branch preview alias: https://flame-chick-admin-production-git-work-product-0d7cc4-fahad-7455.vercel.app/
- Vercel deployment target is Preview (`target: null`, not Production). The existing stable branch Preview alias is associated with this Preview deployment. No production alias was promoted or changed.
- The GitHub Preview workflow run `45534385117` was skipped by its existing fail-closed readiness variable. This gate was not changed. A direct Vercel Git-source deployment was used against the existing Admin project, exact branch and exact commit, with the existing app root. No project settings or production target were changed.

## Investigation findings

- Deal cards already passed their own `data-id` to the Edit action. However, the original editor did not assert that the detail response ID/title matched the selected card, did not carry the selected deal ID in the submitted form, and did not protect against overlapping async editor loads. Therefore the source did not prove the prior wrong-deal event was caused by a wrong card click versus stale editor state. The correction adds explicit checks for both; it does not claim the historical click cause is proven.
- Burger selectors originally listed all active products, regardless of category. This allowed the Whole Chicken Broast product “Nashville” to be selected as a Burger. The corrected selector only offers active products with active variants in the active menu category named “Chicken Burgers”.
- Original edit form read the saved `max_units_per_option` and submitted it, but did not enforce the intended Burger-specific rule. The original read-back verifier compared mappings against the value returned by the group itself, so an incorrect value of 1 could pass.
- For repeating Burger groups, the corrected editor draft sets the intended max per choice to the group required quantity, and the component builder, mapping builder and final read-back checks independently enforce that same value.
- Component-group validation now occurs before the edit workflow temporarily deactivates the deal, so invalid form data is rejected before the first catalog command.

## Source changes in commit dd6151e3bd86d9abd67cfce24b221dd4b5af3f8e

- Exact deal ID/title assertions when loading and saving an edit.
- Deal ID carried in the form and checked against the in-memory selected deal before secure command API calls.
- Async editor-load lock and visible selected deal name/ID in the editor.
- Burger product selector filters to Chicken Burgers; it does not silently replace an invalid saved product with another product.
- Burger product and variant are validated again before writes.
- Repeating Burger max per choice is normalized to the required quantity and required in the UI.
- Component builder and mapping builder reject a Burger cap that differs from the required group quantity.
- Read-back verification checks expected deal identity, group repeat flag, group max, each product ID and variant ID, INCLUDED pricing, zero surcharge and per-choice mapping limits.
- Regression tests added for category filtering, identity mismatch, incorrect Burger cap, incorrect product mapping, group cap mismatch, mapping cap mismatch and legacy saved cap normalization.

## Tests

- GitHub Actions Admin static checks: run `45534384936`, workflow `Flame Chick Admin Static Checks`, conclusion SUCCESS, commit `dd6151e3bd86d9abd67cfce24b221dd4b5af3f8e`.
- The Preview workflow run `45534385117` was skipped by the existing readiness gate; no claim that it passed.
- The local Supabase catalog importer QA workflow `45534384955` was still in progress at the last check; check its final status if needed. It is not evidence of catalog writes.
- Vercel deployment `dpl_7kEfiQME3TzbV69QnA6Pj61nVKAt` was verified READY.

## Exact next user-controlled step

Do not make any catalog change yet. Ask the user to open the new Preview (unique deployment URL or stable branch Preview alias), sign in normally, navigate to Catalog V3 draft, and verify the Edit behavior and displayed fields first. The initial controlled check must be on Flame Feast:

- Deal title: Flame Feast
- Deal ID: `90899197-8bf3-4b1e-af73-9c358b678def`
- Variant ID: `fc9001cd-8bf7-4670-bccc-be2a2b2ac465`
- Fixed price: Rs. 3,599
- Burger group ID: `ac3ffad5-340e-471a-9f48-08da7145f3e3`
- Required quantity: 3
- Repeat: enabled
- Maximum quantity per choice: 3
- Burger options:
  1. OG Crunch — Regular; product `1b68da9e-cccb-45da-9807-7e62c1d8b47d`, variant `ad3af56e-4233-4574-abee-fa560a0ce6e7`
  2. The Injector — Regular; product `abad7e2a-8e25-4512-8714-6bfb2c4cf966`, variant `15245c40-963c-4c1f-a6a6-f2a0962cc0c2`
  3. Nashville Fire — Regular; product `d2a34e43-f7f4-417a-a5bd-7fbd298fd398`, variant `7ed57037-98fb-4a54-8b2b-bbb7b428dad6`
- All choices INCLUDED, zero surcharge; each mapping max quantity 3.
- Keep Half Broast and 1L Drink groups unchanged.
- Keep deal price and activation/availability unchanged.
- Do not touch Flame Hour — The Injector + Cold Drink.

Before user saves, ensure the editor visibly identifies Flame Feast and the exact ID, and all the above settings are present. If anything differs, stop and diagnose; do not ask the user to save. After the one controlled save, run read-only Production SQL queries and inspect the audit log. Confirm draft revision and published revision; never publish. Only after Flame Feast read-back passes may the user proceed to Flame Duo and then Flame Hour.

## Boundaries

- No direct catalog table writes or service-role bypass; use authenticated Admin/Owner Catalog V3 command workflow only.
- No catalog publication, production alias promotion, production deployment, paid upgrade, GST/tax implementation or unrelated deal edits.
- Preserve Website, POS, Admin and Rider apps.
- Free Supabase plan only.


---

## 2026-11-25 — Burger selector clarification and placeholder exclusion

This is the latest continuation state and supersedes the preview URL/commit referenced in earlier parts of this handoff.

- Latest source branch: `work/production-source-audit`
- Latest commit: `3b1475a4879931ecb51618a90b8a57d18259a7f5`
- Admin Preview deployment: `dpl_EJwtuE7r5XruzyjcXCCbEWJovm9m`, READY.
- Exact built commit: `3b1475a4879931ecb51618a90b8a57d18259a7f5`.
- Latest unique Preview URL: https://flame-chick-admin-production-k6edsdg4y-fahad-7455.vercel.app/
- The existing branch Preview alias is still the stable URL: https://flame-chick-admin-production-git-work-product-0d7cc4-fahad-7455.vercel.app/
- Vercel reports `target: null` (Preview) and no production target/alias change.

### Customer dropdown behavior confirmed from source

The shared Website configurator already creates one independent dropdown for each required Burger slot. Every slot enumerates the entire configured `group.options` collection. When repeat is enabled, the same configured choice remains selectable in additional slots up to its per-choice max; when repeat is disabled, a choice already used in another slot is disabled. Thus the choices configured in Admin are the alternative burger list shared by Burger 1, Burger 2, and Burger 3—not preassigned slot-to-product mappings.

The same shared deal-view validation code is used by Website and POS. A regression test was added to assert that each slot renders the full configured option list and that repeat and per-choice caps are honoured.

### Placeholder product cleanup

- The product whose exact English name is `Burger` is a placeholder, not a genuine menu burger.
- Admin's eligible Burger choice list now excludes an active product named exactly `Burger`, even if it belongs to Chicken Burgers.
- The existing product record is not deleted or edited; it remains unchanged and may still exist for other system references. Only the Burger-group choice dropdown omits it.
- The filter applies only to Burger component groups; non-Burger groups' product lists are not affected.
- Existing saved option rows that point to this placeholder are not silently replaced during loading. They show as an invalid saved choice and the editor requires the Admin to choose a real burger before saving.

### CI and Preview status

- Admin static check run `45534964386`: SUCCESS on commit `3b1475a4879931ecb51618a90b8a57d18259a7f5`.
- Website static check run `45534888577`: SUCCESS on the prior app/test implementation commit `12b272cc4f84bd3e06bc2e7ce6af5e4bbdeb3245`; the final `3b1475a` commit only corrected a test expectation.
- The first Admin CI run for `12b272c` failed because the non-Burger test expected the Burger-only placeholder filter to apply to all component groups. That expectation was corrected; the corrected run for `3b1475a` passed.
- Latest Preview deployment `dpl_EJwtuE7r5XruzyjcXCCbEWJovm9m` verified READY.
- The existing automatic Preview workflow remained skipped by its fail-closed readiness gate; it was not modified. The unique Preview was created with Vercel's direct Git-source Preview deployment for the exact branch and commit.
- The separate local importer QA workflow on earlier commits is not used as the acceptance signal for this UI change; it is unrelated to customer slot rendering and does not authorize or perform production catalog changes.

### User's next step

Open the latest Admin Preview and inspect Flame Feast. Confirm:

1. The editor header identifies Flame Feast and its exact deal ID `90899197-8bf3-4b1e-af73-9c358b678def`.
2. Burger required quantity is 3 and repeat is enabled.
3. Maximum per choice is 3.
4. The selector contains only the three real Chicken Burgers: OG Crunch — Regular, The Injector — Regular, Nashville Fire — Regular. No plain `Burger` placeholder and no Whole Chicken Broast `Nashville`.
5. Half Broast and 1L Drink are unchanged.
6. Price remains Rs. 3,599.

Do not save until those fields are visually confirmed. After the controlled save, verify via read-only Production SQL/audit log. No direct writes, no publication. Once Flame Feast is verified, continue Flame Duo and then Flame Hour with the approved quantities and limits; keep Flame Hour — The Injector + Cold Drink untouched.

### Boundaries unchanged

No catalog rows were written for this selector fix. No publication, production alias promotion, production app deployment, paid upgrade, GST/tax implementation, or unrelated deal edits. Continue using the authenticated Admin/Owner Catalog V3 commands for all catalog modifications.


---

## 2026-11-25 — Preview access troubleshooting

- The latest one-off Vercel deployment `dpl_EJwtuE7r5XruzyjcXCCbEWJovm9m` is READY at commit `3b1475a4879931ecb51618a90b8a57d18259a7f5`.
- Vercel project SSO protection is enabled for deployment URLs. Password protection and Trusted IP protection are disabled. Do not disable or bypass Vercel SSO as a workaround.
- The new one-off URL `https://flame-chick-admin-production-k6edsdg4y-fahad-7455.vercel.app/` loads the app shell but its Admin page shows `Failed to fetch`. Root cause confirmed in current source: `supabase/functions/flame-chick-staff-admin/origin-policy.mjs` uses an exact-origin allowlist. It includes the prior approved one-off preview and the stable branch Preview alias, but does not include the just-created one-off host. The Staff Admin edge function returns HTTP 403 without CORS allow headers to a non-allowlisted origin, which the browser presents as a generic fetch failure.
- The stable branch Preview alias `https://flame-chick-admin-production-git-work-product-0d7cc4-fahad-7455.vercel.app/` is already in the exact Staff Admin CORS allowlist, and Vercel confirms this alias currently points to the latest READY deployment `dpl_EJwtuE7r5XruzyjcXCCbEWJovm9m` and exact commit `3b1475a4879931ecb51618a90b8a57d18259a7f5`.
- User should use the stable branch Preview alias only, not the one-off `k6edsdg4y` URL. This avoids any origin policy or CORS change. Do not add a wildcard or relax CORS. If Vercel SSO blocks the stable alias in the user's browser, resolve the user's existing team access through normal Vercel SSO; do not create anonymous/shareable bypasses or weaken protection.
- The connected browser's existing stable-alias tab showed the Admin application and an authenticated Admin account, while the latest unique-URL tab showed `Failed to fetch`. No catalog write/save was made during troubleshooting.
- After access is restored, resume the visual Flame Feast pre-save inspection. Do not save until deal ID/title, three burger alternatives, repeat and caps, fixed price and unrelated groups are confirmed.


---

## 2026-11-25 — Flame Duo placeholder option / selectable Burger UX correction

### Database finding (read-only inspection only)

- Flame Duo deal ID: `c2829d2f-f677-4e4f-8975-1d5bec15ecc8`.
- Burger group ID: `cb28b616-e003-4778-b748-79e52850b70b`.
- Burger group quantity 2, repeat enabled, group max-per-choice 2.
- Its only active Burger choice is option ID `c4e1b69a-1e34-467a-99e1-660dfb30a658`, pointing to product ID `5efc245f-66e6-4ae4-913e-fcbe40f1fc50`, product name `Burger`, in active `Chicken Burgers` menu category `0179435d-8f39-4503-904e-091efb5a512c`. This product has an active variant label `Included`; it is the deal-only placeholder, not a selectable burger.
- Read-only SQL confirmed real active Chicken Burgers and regular variants:
  - OG Crunch product `1b68da9e-cccb-45da-9807-7e62c1d8b47d`, Regular variant `ad3af56e-4233-4574-abee-fa560a0ce6e7`.
  - The Injector product `abad7e2a-8e25-4512-8714-6bfb2c4cf966`, Regular variant `15245c40-963c-4c1f-a6a6-f2a0962cc0c2`.
  - Nashville Fire product `d2a34e43-f7f4-417a-a5bd-7fbd298fd398`, Regular variant `7ed57037-98fb-4a54-8b2b-bbb7b428dad6`.
- No INSERT/UPDATE/DELETE or catalog command was run. Flame Duo is unchanged; no save occurred.

### Editor source correction

- Source commit: `e7f3e2bdb50e122371df743218446f099494ea51`.
- The previous invalid-product helper text was generic and misleading. The editor now detects a saved product with exact name `Burger` and explains: “Saved product ‘Burger’ is a placeholder — choose a real burger”.
- Burger product and variant selectors are required and have disabled prompt options rather than a confusing selected prompt that resembles a real choice.
- After a real product is chosen, its active variants populate and the first active variant is selected automatically (user can change it).
- Added inline instructions that "+ Add choice" adds another eligible burger alternative.
- Regression tests added for explicit placeholder guidance, required product/variant controls and variant population.
- Admin static workflow run `45536317355`: SUCCESS on exact source SHA `e7f3e2bdb50e122371df743218446f099494ea51`.

### Latest Preview

- Vercel deployment `dpl_Bnph8psJFixeapqHjiEzXXtmMDLt`: READY, target Preview (`target: null`), exact source commit `e7f3e2bdb50e122371df743218446f099494ea51`.
- Stable branch Preview alias: https://flame-chick-admin-production-git-work-product-0d7cc4-fahad-7455.vercel.app/
- One-off URL `https://flame-chick-admin-production-m5kmabi6z-fahad-7455.vercel.app/` is not on the exact Staff Admin origin allowlist. Do not use it. The stable branch alias is allowlisted and Vercel maps it to the latest Preview deployment.
- User should perform a hard refresh (`Ctrl+Shift+R`) on the stable alias before testing, because their existing tab showed the old copy of the helper text.
- The automatic Preview workflow was skipped by the existing readiness gate; it was not altered. Direct Vercel Preview deployment was used with exact commit and the existing Admin project/root only.

### Controlled next steps — do not save until the user verifies all fields

1. In the latest stable Preview, open Catalog V3 draft and edit Flame Duo (the editor should show the exact deal ID).
2. In Burger component group, find the current row whose saved product is the “Burger” placeholder. In its Choice product selector, select `OG Crunch`; product variant should populate with `Regular`.
3. Click `+ Add choice` twice. In the second row select `The Injector` — `Regular`; in the third select `Nashville Fire` — `Regular`. Each row must show one real active Chicken Burger and correct Regular variant. Do not add the placeholder or Whole Chicken Broast product “Nashville”.
4. Keep group quantity 2, repeat enabled, max-per-choice 2. All three choices are INCLUDED, zero surcharge (the secure command builder supplies these mappings). Keep Quarter Broast and 2 Cold Drink groups untouched. Keep price and availability unchanged.
5. Do not save until the user sees and confirms all three alternatives. After one controlled save through the authenticated Catalog V3 Admin command workflow, verify read-only database state and audit log before moving to the next deal. Do not publish.



---

## 2026-11-25 — Burger choice selector layout fix (screenshot-driven)

- User screenshot showed both dropdowns rendered as very narrow controls, with the guidance text alongside them and a narrow wrapped Remove button.
- Exact layout cause: `.fcv3-choice-row` originally used `grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto`. Its direct children were product label, variant label, inline help `small`, Remove button. The helper text entered the third `auto` grid column and forced that track to expand, squeezing the two selector tracks.
- Latest commit `70d018de8483949d40c1951809696a231a1f873b` updates `apps/flame-chick-admin/catalog-v3-admin.css`: two equal selector columns with 220px minimum tracks, help text spanning both columns, Remove button in its own full-width row; at max-width 800px all controls stack in one column. Added static regression assertions to the Admin test suite.
- Admin static checks: run `45536813430`, SUCCESS.
- Preview deployment: `dpl_2aFHYwqA9i32NuC7j1yQ1ZB9Aevc`, READY, built from exact commit `70d018de8483949d40c1951809696a231a1f873b`, Vercel target `null` (Preview), alias is the stable branch Preview address. The automatic GitHub Preview workflow was skipped by its existing fail-closed gate; this was not changed. A direct Git-source Preview deployment was created from the exact commit in the existing Admin project.
- Stable branch Preview URL: https://flame-chick-admin-production-git-work-product-0d7cc4-fahad-7455.vercel.app/
- Next user action: hard-refresh with Ctrl+Shift+R, reopen Flame Duo, visually verify the product and variant selectors are usable at sensible width. They should occupy equal columns at wider widths and stack vertically on narrower widths. Don't save yet. Continue the controlled Flame Duo option selection only after the user confirms the visible layout is fixed.
- No catalog writes, saves, publication, production alias promotion, or production deployment occurred.


---

## 2026-11-25 — Category-driven Burger selector replaces per-deal product rows

### Latest Preview/source
- Branch `work/production-source-audit`; latest commit `71e1de4dad57b09b3609437acc59634508aa22a4`.
- Admin Preview deployment `dpl_7kJeNYEsvX9xxgkp6xnzZZ2h5kAY`: READY; target Preview (`null`); exact commit verified.
- Stable branch Preview alias `https://flame-chick-admin-production-git-work-product-0d7cc4-fahad-7455.vercel.app/` verified mapped to that deployment. No production alias changed.

### Intended category-driven behavior now in source
- Website and POS deal view builders recognize a single `Burger / Included` deal-only source anchor whose product belongs to the active menu category `Chicken Burgers`.
- The anchor expands at runtime into every active, available, branch-available standalone product variant in that category, excluding the placeholder product named exactly `Burger`.
- Every customer slot is a dropdown initially labelled `Select a burger`. Slots have the same complete menu list; duplicates are enabled/disabled according to group repeat and maximum-per-choice limits.
- Generated options carry actual product and variant IDs. Server-side quote/pricing validates them against the published catalogue snapshot and stores actual selected product/variant snapshots. Burger choice contribution is zero; the deal's fixed base price remains unchanged.
- Admin Burger editor replaces manual product rows with a source panel naming Chicken Burgers; it writes the existing single internal source anchor and preserves required quantity/repeat/max fields. No product list is manually configured per deal.
- A Burger group therefore intentionally has no per-row `Remove choice` button. Remove a burger globally by deactivating the product/variant in Chicken Burgers. Non-Burger manual choices retain individual Remove choice controls; handler reads with `validate:false` before removing, avoiding unrelated validation blocking the click.
- Latest relevant CI: Admin static success (run `45539849543`, commit `3ed78d6`); POS/Rider static success (run `45539849664`, same commit); Website static success (run `45539528562`, commit `8e41d33`); Edge static success (run `45538933371`, commit `e6ed5ce`); importer QA success (run `45540314861`, latest HEAD). Automatic Preview workflows remained skipped by their existing fail-closed gates; direct Vercel Preview was used.

### Current read-only production state — 25 Nov 2026
- Current draft revision `108`; current publication number `2` still references draft revision `92`. This session made no catalog writes and did not publish.
- Audit log shows revisions `97–108` are catalog actions by Admin role on Flame Feast only.
- Flame Duo Burger group: required quantity 2; repeat true; max per choice 2; exactly one active `Burger / Included` placeholder anchor; INCLUDED, zero surcharge. Already category-driven.
- Flame Hour — Quarter Broast + Burger + Cold Drink: required quantity 1; repeat false; exactly one active `Burger / Included` anchor; INCLUDED, zero surcharge. Already category-driven.
- Flame Feast: active, available, price Rs. 3,599; Burger group quantity 3, repeat true, max 3; three current explicit rows (OG Crunch Regular, The Injector Regular, Nashville Fire Regular), all INCLUDED and zero surcharge. These are real product rows but still need one controlled Admin save converting the group to the single category-source anchor. Keep Half Broast and 1L Drink unchanged.
- Flame Hour — The Injector + Cold Drink is separate; do not modify.

### User-visible next step
- User should open the latest stable Admin Preview and hard-refresh.
- Edit Flame Feast and visually check the `Customer burger choices` panel says Chicken Burgers; quantity 3, repeat enabled, max 3; price Rs. 3,599; Half Broast and 1L Drink unchanged.
- Do not add three product choices. Do not look for a Burger `Remove choice` button; category-driven Burger groups don't show product rows. After visually confirming, do one save through authenticated Catalog V3 commands (not direct SQL), then verify DB read-only. No publication.
