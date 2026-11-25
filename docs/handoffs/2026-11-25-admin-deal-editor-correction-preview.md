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
