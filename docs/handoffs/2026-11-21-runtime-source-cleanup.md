# Flame Chick handoff — runtime source branding and static checks

Date: 2026-11-21
Repository: `itsfahadahmed1234-creator/flame-chick-platform`
Branch: `work/production-source-audit`

## Source cleanup completed

- Deleted the inactive, unreferenced `apps/flame-chick-website/js/app.js` containing historical HFP/Pizza Bite configuration and staging URLs.
- Removed its README reference and updated the Website README to describe only active Flame Chick scripts.
- Renamed active Website globals to `FLAME_CHICK_CONFIG`, `FlameChickCatalog`, `FlameChickPricing`, `FLAME_CHICK_I18N`, and `FlameChickHeroSlider`.
- Replaced old `pizza_bite_*` browser storage keys with `flame_chick_*` keys.
- Changed Website order reference prefix to `FC-` and updated old Pizza Bite/Waisa copy to Flame Chick-neutral copy.
- Changed Admin-created legacy ID prefixes to Flame Chick-specific IDs.
- Renamed HFP-prefixed local identifiers in POS/Admin/Rider source; Rider Realtime channel namespace is `flame-chick-rider-ops-`.

## CI evidence

- Admin static tests: [passed](https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/44881645889).
- Website syntax, inline script and source hygiene checks: [passed](https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/44881563119).
- POS/Rider inline JavaScript and source hygiene checks: [passed](https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/44881805138).

These checks are static validation only; they do not replace live API/auth/checkout/delivery tests.

## Outstanding API compatibility work

The local source identifiers `flame_chick_admin_dashboard` and `flame_chick_admin_reassign_delivery` are names for future production server contracts. They are not implemented by the currently applied SQL migrations yet. Keep the related Admin dashboard and POS delivery-reassignment operations disabled until their secure backend commands exist and are tested.

No database migration, Production data change, Edge Function deployment, Vercel deployment, secrets, or domains were changed by this cleanup.

## Next work

Continue catalog schema and API reconciliation using `docs/architecture/production-field-level-schema-v1.md`, `database-application-contract-map.md`, and `source-schema-consistency-audit-v1.md`. Preserve existing client DTOs where possible, but route production writes through authenticated server commands. The full Website security audit remains a mandatory stop-gate before attaching the Website to live database ordering.
