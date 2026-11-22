# Catalog Publish, Immutable Snapshot and Rollback — Implementation Handoff

Date: 2026-11-22
Branch: `work/production-source-audit`
Supabase: `adkrxfnawdiljhjaavnj` (Mumbai, Free)

## Applied Production migration

`20261122031027_flame_chick_catalog_publish_rollback_v1`

Guarded workflow: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44979997907

The workflow verified all earlier catalog, deal and published-read migrations, required this migration to be the only pending change, passed its dry run, applied it and verified the remote migration ledger.

## New database commands

Public Admin/Owner RPCs (authenticated only):
- `public.flame_chick_catalog_publish(p_expected_revision bigint,p_request_id uuid)`
- `public.flame_chick_catalog_rollback(p_target_publication_id uuid,p_expected_revision bigint,p_request_id uuid,p_reason text)`
- `public.flame_chick_catalog_publication_history(p_after_number bigint,p_limit integer)`

Private implementation:
- `app_private.flame_chick_catalog_publication_validate(uuid)` — full draft graph validation, at most 100 structured errors.
- `app_private.flame_chick_catalog_compile_snapshot(uuid,timestamptz)` — deterministic V3 snapshot compile; 4 MiB hard snapshot size cap.
- `app_private.flame_chick_catalog_publish_internal(bigint,uuid)` — idempotent, revision-locked, atomic snapshot insert + current-pointer update.
- `app_private.flame_chick_catalog_rollback_internal(uuid,bigint,uuid,text)` — prior same-restaurant immutable publication check + checksum verification + pointer-only rollback.
- `app_private.flame_chick_catalog_publication_history_internal(bigint,integer)` — bounded metadata-only keyset history.

All internal security-definer functions are owned by `postgres` with empty search_path. Public wrappers are security-invoker, empty search_path and executable only by `authenticated`. The actor resolver permits only active restaurant-wide Admin/Owner. No direct table grants were added to authenticated, anon or service_role.

## Publication model and invariants

- Admin/Owner mutations remain in mutable draft tables.
- Publish locks the restaurant's draft-state row, compares the exact expected revision, validates the complete active menu/deal graph, compiles schema V3, calculates SHA-256 of PostgreSQL `snapshot::text` UTF-8 bytes, inserts immutable history and updates the single current pointer in one transaction.
- Publish does not mutate draft rows or increment the draft revision.
- Validation rejects active products without active priced variants, inactive referenced categories/subcategories/groups, insufficient modifier options, missing exact BY_SIZE product-variant rules, active deals without priced variants, incomplete deal variant choice coverage, pricing mode/treatment incompatibilities, invalid schedule timezone/window configuration and branch timezone/branch-active inconsistencies.
- NULL draft price is never converted to zero. Explicit numeric zero remains a deliberate free price.
- Failed validation/insert/audit/pointer change aborts the transaction; the previous current pointer remains unchanged.
- Rollback requires a target publication, expected draft revision, unique request ID and non-empty operator reason (10–500 chars). It verifies same-restaurant ownership, schema metadata and SHA-256, then updates only `catalog_current_publication`.
- Publication history is never updated/deleted/truncated. A rollback does not mutate draft rows or immutable order snapshots.
- Publish/rollback append actor audit and idempotency response in the same transaction.
- Publication history API returns metadata only; it never returns stored snapshots to the Admin browser.

## V3 snapshot contents

`schemaVersion=3`, `publishedAt`, restaurant identity and settings known in current schema, active branches, categories/subcategories, products/variants, modifier groups/options/assignments/exact variant price rules, drink sizes, deal collections/deals/deal variants/component groups/options/variant-specific pricing maps, reusable schedule sets/windows, deal schedule assignments and branch product/variant/deal availability overlays.

Current Production does not yet have `restaurant_settings`, `delivery_areas` or promotion tables, so V3 snapshot currently returns `deliveryAreas: []` and `promotions: []` and includes only restaurant-name/currency/timezone settings. Do not cut over the current order/checkout Website until delivery/settings structures, branch ordering and promotion requirements are implemented and tested. GST remains deferred.

## Rollback QA — rollback-only, passed

Full migration DDL and test fixture were executed inside one outer transaction and rolled back. Temporary auth user, restaurant, admin role, category, product, variants, two publication history rows, current pointer, audit entries and idempotency entries were not retained.

Test sequence:
1. Authenticated Admin created a menu category, product and priced Regular variant through the existing public authoring RPCs.
2. Published revision 2 as publication 1.
3. Replayed the same publish request and confirmed idempotent response without an additional publication.
4. Edited draft category and published revision 3 as publication 2.
5. Deactivated the category while its product remained active; revision 4 publish was rejected with `CATALOG_PUBLISH_VALIDATION_FAILED` and `ACTIVE_PRODUCT_CATEGORY_INACTIVE`.
6. Confirmed publication history remained exactly two rows and publication 2 remained current after failed publish.
7. Rolled back to publication 1 with a recorded reason. Replayed the same rollback request and confirmed idempotent response.
8. Confirmed publication 1 became current and publication 2 remained immutable/non-current.
9. Confirmed the draft remained in its newer invalid state; rollback did not overwrite draft records.
10. Read through `public.flame_chick_catalog_public_read(text)` and verified the restored snapshot returned the exact original category/product baseline and a verified SHA-256.
11. Confirmed authenticated direct SELECT on `catalog_publications` remains denied.

All temporary data was rolled back. Live Production counts after tests: 0 restaurants, categories, products, deals, draft-state rows, publications, current pointers, catalog audit rows and command idempotency rows.

## Current Production verification

- Migration `20261122031027` is present in `supabase_migrations.schema_migrations`.
- Public publish/rollback/history wrappers: `SECURITY INVOKER`, postgres owner, empty search_path, execute authenticated=true, anon=false, service_role=false.
- Private validation/compile helpers: postgres-owned `SECURITY DEFINER`, empty search_path, not executable by application roles.
- Private publish/rollback/history internals: postgres-owned `SECURITY DEFINER`, empty search_path, callable by authenticated only through the explicit wrapper path and with Admin/Owner actor verification.
- No direct anon/authenticated/service_role table grants on publication, current pointer, draft-state or idempotency tables.
- Public published-read RPC still has execute only for service_role.
- No live restaurant or publication data has been seeded, so published-read still returns `published=false`.
- 33 Security Advisor INFO notices are intentional RLS-enabled/no-policy deny-by-default tables.
- Performance Advisor reports unused-index INFO notices in the empty build-stage database; no unindexed publication/deal FKs were reported.

## Verified old Website rollback target

Legacy Website remains untouched:
- Domain: `flame-chick.vercel.app`
- Vercel project: `flamechicks`
- Project ID: `prj_ldHcRFVX0kadzR8jxVJz7pO1vPz5`
- Verified production deployment: `dpl_4MepX2o8ysrqsnHp7H6H7mVqznGP`
- Production commit: `6ac16abf9195926a5cc7ac153fbd94d0b29c22a2`
- Legacy source ref: `feature/flame-chick-wa-storefront` from `befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS`
- Vercel's alias inventory confirms `flame-chick.vercel.app` is currently assigned to that deployment, state READY, target production.
- Live fetch of the customer domain returned HTTP 200 on 2026-11-22.

New Website project:
- `flame-chick-website-production`, project `prj_jwin4eFY0BXIgZUgcZGAuntybqkI`.
- No deployments and no custom domain attached.

Emergency website rollback after a future domain cutover: Vercel `assign_alias` the exact old deployment ID `dpl_4MepX2o8ysrqsnHp7H6H7mVqznGP` to alias `flame-chick.vercel.app` on team `team_lrFy9ILYEz9umsBy98GCyQjI`. Verify the alias map and live HTTP 200 after action. This alias action has not been performed; it is the documented recovery command.

The database rollback returns to a previous immutable publication once a previous publication exists. Before the first new database publication, no older database publication exists, so the still-live legacy Vercel deployment is the fallback for the first Website cutover.

## Still required before customer Website cutover

1. Implement the Website V3 catalog consumer. The current Website loader validates schema V2; do not send V3 into it or weaken the schema version check.
2. Add delivery areas and public/checkout settings authoring data, and integrate delivery/pickup/branch settings into the V3 snapshot.
3. Implement runtime schedule evaluation and branch-effective availability in the order/quote path.
4. Add promotion schema and pricing only after the approved pricing semantics are implemented and tested.
5. Complete golden pricing/quote/submit tests, stale-revision/idempotency tests, and publication/rollback concurrency tests.
6. Deploy the Edge Function to preview/staging first; it is not deployed now.
7. Test the new Website on `flame-chick-website-production` without the customer domain; verify order submission to POS end to end.
8. Only with explicit owner approval, move `flame-chick.vercel.app` to the new production deployment. Retain the exact old deployment above for emergency `assign_alias` rollback.
