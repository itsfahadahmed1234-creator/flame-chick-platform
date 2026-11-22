# Legacy Live Menu Baseline — Preservation Record

Date: 2026-11-22

## Source tied to current live deployment

The old live Website deployment was verified as:

- Domain: `flame-chick.vercel.app`
- Vercel project: `flamechicks` (`prj_ldHcRFVX0kadzR8jxVJz7pO1vPz5`)
- Production deployment: `dpl_4MepX2o8ysrqsnHp7H6H7mVqznGP`
- Production commit: `6ac16abf9195926a5cc7ac153fbd94d0b29c22a2`
- Source repository: `befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS`
- Source path: `apps/flame-chick-website/index.html`
- Source blob at that commit: `daf34b81458f03d9534d81be71f223b5f284d3ed`

The source is preserved in the separate legacy repository. Do not modify or disconnect that repository or its Vercel project during the new build.

## Static legacy menu payload found in the exact production source

The deployment source contains the legacy `var MENU = [...]` menu array with five visible groups and 25 items:
- Starters (5), including Platter.
- Injected Broast (3).
- Wraps (3).
- Burgers (4).
- Drinks (10).

The Platter entry includes a fixed price and a component description. It must be reviewed and represented in the new relational deal model, not flattened into a fake standalone product during import.

This is the code version tied to the old production deployment. It is a reliable legacy rollback/import source, but the separate static menu is not itself a normalized database publication.

## Recommended database baseline sequence before first customer cutover

To enable a true DB-level rollback to the old menu as well as the Vercel emergency fallback:

1. Complete real restaurant and Owner/Admin bootstrap using the intended production Auth identity. Do not invent or seed an owner identity.
2. Import this exact legacy menu payload into normalized draft tables using the secure Admin command path. Map Platter to the new deal/component schema after validating its old component description.
3. Review counts, names, prices, images, availability and checkout compatibility against the live legacy Website.
4. Publish the approved legacy baseline as immutable publication #1.
5. Create the new/upcoming menu separately in Admin drafts; validate and publish it as publication #2.
6. Test rollback from publication #2 to publication #1 and verify the V3 customer response reproduces the old menu.
7. Keep the old Vercel deployment as the outer emergency fallback even after the database baseline exists.

No legacy menu rows, restaurant, Owner, publication or current pointer have been seeded by this preservation work. Production currently remains empty; the legacy Vercel domain remains assigned to the old deployment. The first-release Vercel rollback is immediately available, while database pointer rollback to the legacy menu becomes available after publication #1 is deliberately created.

## Emergency Website rollback

If the new Website domain cutover fails, reassign alias `flame-chick.vercel.app` to deployment `dpl_4MepX2o8ysrqsnHp7H6H7mVqznGP` using Vercel `assign_alias` and then verify the live domain. See `docs/architecture/website-release-cutover-rollback-v1.md`.
