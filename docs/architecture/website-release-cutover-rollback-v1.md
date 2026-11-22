# Flame Chick — Website Cutover and Old-Menu Rollback Runbook

Date: 2026-11-22
Branch: `work/production-source-audit`
Supabase project: `adkrxfnawdiljhjaavnj` (Mumbai, Free)
Vercel team: `team_lrFy9ILYEz9umsBy98GCyQjI`

## Non-negotiable deployment rule

The new Admin draft menu and published catalog must not replace the existing customer Website merely because a database publish succeeded. Database publication and Website release/cutover are separate operations. The old Website remains the emergency rollback target until the new Website has passed its release gate.

## Verified old live Website rollback target

The currently served domain and old Vercel deployment were inspected on 2026-11-22:

- Customer domain: `flame-chick.vercel.app`
- Legacy Vercel project: `flamechicks`
- Legacy Vercel project ID: `prj_ldHcRFVX0kadzR8jxVJz7pO1vPz5`
- Verified production deployment: `dpl_4MepX2o8ysrqsnHp7H6H7mVqznGP`
- Deployment URL: `flamechicks-l7koi5zml-befahad1234-7050.vercel.app`
- Production Git commit: `6ac16abf9195926a5cc7ac153fbd94d0b29c22a2`
- Source ref: `feature/flame-chick-wa-storefront`
- Git source: legacy repo `befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS`
- Vercel reports the deployment state `READY`, target `production`, and `flame-chick.vercel.app` is currently assigned to this deployment.
- A live fetch of `https://flame-chick.vercel.app` returned HTTP 200 on 2026-11-22.

This is the exact deployment/alias to restore if a new Website cutover needs to be reversed. Do not disconnect, delete, rename, redeploy over, or otherwise modify this project as part of the new production build.

## New production Website project

- Project: `flame-chick-website-production`
- Project ID: `prj_jwin4eFY0BXIgZUgcZGAuntybqkI`
- Verified inventory on 2026-11-22: no deployments, no project domains and no custom domain attached.

The new production project is separate and does not currently serve the customer domain. No cutover was performed by the work recorded here.

## Emergency Website rollback command

If the customer domain has already been aliased to a new Website deployment and it needs immediate restoration, reassign the verified alias directly to the legacy deployment:

- Vercel team ID: `team_lrFy9ILYEz9umsBy98GCyQjI`
- Deployment ID: `dpl_4MepX2o8ysrqsnHp7H6H7mVqznGP`
- Alias: `flame-chick.vercel.app`

Use Vercel's `assign_alias` action with the exact deployment ID and alias. This reassigns the host to the known-good old deployment and does not require rebuilding the legacy source or changing DNS. The operator must verify the action result, then fetch `https://flame-chick.vercel.app` and confirm HTTP 200 and the expected old-menu content. Do not claim rollback succeeded until the alias mapping and live response are independently checked.

This runbook records the rollback target only; no alias reassignment was executed.

## Database publication rollback

The database-side release history is separate from Vercel deployments:

- Draft changes remain mutable and never alter a published snapshot.
- Successful publish creates a new immutable publication and atomically moves `catalog_current_publication`.
- A failed validation or transaction leaves the previous pointer untouched.
- Admin/Owner may inspect publication history using `public.flame_chick_catalog_publication_history`.
- To restore a prior database catalog, Admin/Owner calls `public.flame_chick_catalog_rollback(target_publication_id, expected_draft_revision, request_id, reason)`.
- Rollback requires a reason, verifies same-restaurant ownership and snapshot SHA-256, changes only the current pointer, and records an immutable actor audit/idempotency result.
- The draft is intentionally not reverted by a publication rollback. It remains available for correction.
- A rollback to a previously published catalog requires that the target publication already exists. On the very first release there is no older database publication yet; until a previous snapshot has been published, the old Vercel Website above is the fallback.

## Mandatory release gates before Website cutover

1. Full catalog publication validation and publish/rollback commands applied and independently verified.
2. Golden tests pass for category/product/variant/modifier/deal/schedule/branch snapshot contents, failed publish, stale revision, idempotency and rollback.
3. The new Website client supports the exact published snapshot schema version. The current Website loader is schema V2; the new snapshot compiler emits V3. Do not send V3 to the V2 loader or weaken schema checks. Update the consumer with a versioned V3 adapter and test it separately.
4. New Website preview on `flame-chick-website-production` is tested without attaching `flame-chick.vercel.app`.
5. Public reads use only the current immutable publication; no query parameter or preview route exposes arbitrary drafts.
6. Verify product selection, exact server prices, deal variant selection, modifiers, branch selection, delivery/pickup rules, order submission and POS receipt end to end.
7. Record the new deployment ID and current old deployment ID in the release record.
8. Only after the owner explicitly approves cutover, assign `flame-chick.vercel.app` to the verified new production deployment.
9. Immediately test the public domain, a customer menu read, checkout and POS order receipt. If any critical gate fails, use the emergency alias rollback above.

## Cache rules

- Public catalog cache identity must include `publicationId` and `snapshotSha256`, not restaurant slug alone.
- Branch overlays must add branch ID plus their own revision/identity to cache keys.
- Never cache an unpublished state as a successful menu response.
- Current Edge Function response uses `Cache-Control: no-store`; caching can be optimized later only with publication-aware invalidation.

## Current verified status

- Database has no publication rows or current publication pointer yet; no actual menu was seeded by publish/rollback QA.
- Published-only database read RPC exists and returns `published=false` when there is no pointer.
- Edge Function source uses only the published-read RPC and remains undeployed.
- The new Website V3 consumer is not yet ready; current consumer validates V2.
- Legacy Website domain and rollback deployment remain untouched and assigned.
- New Website-production project has no domain or deployment.
- Therefore, the existing customer Website and its old menu remain unchanged.

## Next

Finish the guarded database migration and verify Production signatures/grants. Then implement the V3 Website consumer and order/checkout contract behind preview-only testing. Do not cut over the customer domain as part of database publication work.
