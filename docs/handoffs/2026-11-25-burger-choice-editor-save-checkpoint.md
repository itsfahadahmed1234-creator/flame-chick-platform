# Flame Chick — Burger Choice Editor Save Checkpoint (2026-11-25)

This is the latest continuation handoff for the Flame Chick production project. It supersedes earlier handoff instructions where they conflict with the exact catalog draft state below. Continue on the existing project; do not restart or rebuild.

## Project and code state

- Repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Working branch: `work/production-source-audit`
- Application source commit at this checkpoint: `68dcbab806a511640f458bd1febdfb5e36b95b12`
- Admin static checks for that application commit: GitHub Actions run `45531200000` — SUCCESS.
- Supabase Production project: `adkrxfnawdiljhjaavnj`, Mumbai `ap-south-1`, Free plan.
- Admin Preview branch alias: https://flame-chick-admin-production-git-work-product-0d7cc4-fahad-7455.vercel.app/
- Latest Admin Preview deployment: `dpl_F1u84RnNLBKBEiEeveRiXEedspUj`, READY; unique deployment URL https://flame-chick-admin-production-lqfe44ejl-fahad-7455.vercel.app. The stable branch alias above is the intended user-facing/CORS-allowlisted Preview origin.
- No production alias was promoted or changed.

## What the user intended

Configure the Burger component group in these fixed-price deals with these three real burger products, all Regular:
1. OG Crunch — product `1b68da9e-cccb-45da-9807-7e62c1d8b47d`, variant `ad3af56e-4233-4574-abee-fa560a0ce6e7`.
2. The Injector — product `abad7e2a-8e25-4512-8714-6bfb2c4cf966`, variant `15245c40-963c-4c1f-a6a6-f2a0962cc0c2`.
3. Nashville Fire — product `d2a34e43-f7f4-417a-a5bd-7fbd298fd398`, variant `7ed57037-98fb-4a54-8b2b-bbb7b428dad6`.

They are multiple choices inside one Burger component group, not three separate groups. Every option must be `INCLUDED`, with a zero surcharge, and deal base prices must remain unchanged.

Intended Burger group constraints:

| Deal | Required quantity | Allow same choice more than once | Maximum per individual choice |
|---|---:|---|---:|
| Flame Hour — Quarter Broast + Burger + Cold Drink | 1 | No | 1 |
| Flame Duo | 2 | Yes | 2 |
| Flame Feast | 3 | Yes | 3 |

The separate deal **Flame Hour — The Injector + Cold Drink** must remain untouched.

## What happened in the last user save

The user followed instructions intended for the Flame Hour deal, but the connected Admin browser state showed the editor open on **Flame Feast**. The user said “saved”.

Read-only Production database inspection and the audit log confirm the save succeeded on **Flame Feast**:

- Deal ID: `90899197-8bf3-4b1e-af73-9c358b678def`
- Variant ID: `fc9001cd-8bf7-4670-bccc-be2a2b2ac465`
- Fixed price: Rs. 3,599, unchanged.
- Deal `is_active=true`, `is_available=true`; its variant is active again.
- Burger group ID: `ac3ffad5-340e-471a-9f48-08da7145f3e3`
- Group required quantity is 3, and repeat selection is enabled.
- **Incorrect group `max_units_per_option=1`; intended value is 3.**
- Current active choices are OG Crunch — Regular, The Injector — Regular, and **Nashville — Regular**.
- **Critical product error:** the third option is product Nashville (whole chicken broast; product ID `bd03cc1a-6db5-434e-91a2-35ba4fe2e258`), not Nashville Fire burger.
- All three active choices currently map as `INCLUDED` with zero surcharge, but each variant-option mapping has `max_quantity_per_deal=1`. These limits must be corrected together with the group-level limit.
- Other Flame Feast component groups Half Broast and 1L Drink were preserved.
- No change was made to the deal price or availability.

Audit-log sequence for the save:
- Draft revision 92 → 93: temporary deactivation while editing.
- 93 → 94: `deal.components_upsert`.
- 94 → 95: `deal.variant_options_upsert`.
- 95 → 96: final `deal.upsert` restored active state.
- Audit timestamps: 2026-11-25 02:23:56–02:23:57 UTC.
- Current draft revision: **96**.

## Publication state — verified unchanged

A read-only query confirmed:
- Draft revision: **96**
- Current published catalog revision: **92**
- The save is draft-only.
- No catalog publication occurred; customer Website/POS published snapshots were not changed by this save.

## Exact next task — do not make another catalog save yet

Investigate and repair the Admin Catalog V3 deal editor workflow before asking the user to save again.

Use the current repository and existing Preview deployment. Reproduce/trace:
1. Why the editor opened Flame Feast when the user was guided to Flame Hour — Quarter Broast + Burger + Cold Drink. Verify each deal card's Edit handler passes and retains the correct deal ID.
2. Why the UI allowed the third product to be Nashville (whole chicken broast), rather than Nashville Fire burger. Confirm filtering is by the correct Chicken Burgers category and valid variants.
3. Why the submitted Burger group's `max_units_per_option` persisted as 1 when the desired Flame Feast constraint is 3.
4. Whether the maximum-per-choice input is populated/rendered, collected on form submit, passed through the secure component-group command, and verified on read-back.
5. Whether each option-to-deal-variant mapping gets the right `max_quantity_per_deal` (3 for Flame Feast, 2 for Flame Duo, 1 for single Flame Hour).
6. Whether the final read-back verifier strictly rejects incorrect product IDs, missing choices, mismatched group limits, mismatched mapping limits, incorrect INCLUDED pricing/surcharge, altered fixed price or altered activation/availability/schedule.

The connected Browser inspection at the stopping point showed the page had the Admin editor modal open on Flame Feast, with the three Burger choices visibly loaded as OG Crunch, The Injector, and Nashville. The Admin page context extraction showed the numeric inputs with blank HTML `value` attributes; do not infer root cause from this alone. The saved database/audit state above is authoritative. Diagnose the actual source behavior and add regression tests.

After source repair:
- Run all relevant Admin Catalog V3 static checks and deal-editor regression tests.
- Deploy a fresh Admin **Preview only** from the verified exact commit.
- Do not change Vercel preview gates, project settings, production aliases, or use a production target.
- Guide the user to perform one controlled correction only after the correct deal identity and values are clearly visible.
- After each save, verify via read-only Production SQL and audit log before proceeding.
- First correct Flame Feast to OG Crunch, The Injector, Nashville Fire; required quantity 3, repeat true, max per choice 3, all option mappings max 3, INCLUDED, zero surcharge, price Rs. 3,599, other groups unchanged.
- Then, only after verified successful correction, proceed to Flame Duo (2 / repeat yes / max per option 2) and finally the Flame Hour deal (1 / repeat no / max 1).
- Never edit the separate “Flame Hour — The Injector + Cold Drink” deal.

## Safety and project boundaries

- Free Supabase plan only; no paid plan upgrade unless explicitly approved.
- No GST/tax implementation.
- Never publish the catalog without explicit user approval.
- Never promote a Preview to Production or change production aliases without explicit user approval.
- Never write catalog tables directly with SQL or service-role access. Use the authenticated Admin/Owner Catalog V3 command API and verify its read-back.
- Do not ask the user for passwords, session tokens or private credentials.
- Preserve the existing Website, POS, Admin and Rider apps; do not rebuild them.
- Do not create real customer orders or accept real operations as a side effect of this catalog editor work.
- Keep this file and root `PROJECT_HANDOFF.md` updated at each completed stage.

## User interaction

The user wants direct, practical, step-by-step instructions and expects continuity. Do not ask them to repeat facts recorded here. Start by acknowledging this exact saved state. The immediate work is to investigate and fix the editor before any further user save. The system remains unpublished at draft revision 96 / published revision 92.
