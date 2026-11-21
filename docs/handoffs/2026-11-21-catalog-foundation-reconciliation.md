# Flame Chick Catalog Foundation — Production Reconciliation Handoff

Date: 2026-11-21
Branch: `work/production-source-audit`
Production project: `adkrxfnawdiljhjaavnj` (Mumbai, PostgreSQL 17.12, Free plan)

## Status

The catalog foundation SQL has been executed directly in Production as the `postgres` migration identity. This was an execution sequencing mistake: the schema transaction committed before appended disposable QA statements ran. The database contains the catalog schema, but its Supabase migration ledger still lists only the previous ten migrations. This drift is documented and must be fixed before further migrations.

**Applied schema source:** `supabase/migrations/20261121061000_flame_chick_catalog_authoring_foundation.sql`
**Staged index follow-up:** `supabase/migrations/20261121062000_flame_chick_catalog_fk_indexes.sql` (not applied)

## Exact supported ledger repair

Supabase documentation: https://supabase.com/docs/reference/cli/supabase-migration-repair

After reviewing `supabase migration list`, confirming exact schema parity, and linking the correct project, run:

```bash
supabase migration repair 20261121061000 --status applied
supabase migration list
```

This official CLI command inserts the missing migration-history record without re-running schema SQL. Do not use raw SQL against `supabase_migrations.schema_migrations`. Do not rerun the 20261121061000 migration; it will fail its existing-relation preflight. Do not run `supabase db push` before local and remote migration lists match.

The current assistant toolset does not include Supabase CLI repair and no CLI/login context is available in the container, so this step remains pending.

## Live schema inventory

Eleven catalog tables exist in `public`:
- `categories`
- `subcategories`
- `products`
- `product_variants`
- `modifier_groups`
- `modifiers`
- `modifier_group_assignments`
- `modifier_price_rules`
- `drink_options`
- `branch_product_availability`
- `branch_variant_availability`

Verified facts:
- All 11 tables are owned by `postgres`.
- RLS is enabled on all 11.
- No policies exist on any of the 11.
- No direct table privileges to `anon`, `authenticated`, or `service_role`.
- No table is in the Realtime publication.
- All 11 have zero rows.
- Existing restaurants and branches also contain zero rows.
- No customer menu content or prices were seeded.
- No catalog RPC, public view, Auth user, deal schema, order schema, or storage policy was created by this foundation.

Batch 4 grants `authenticated` USAGE on `app_private` solely to reach the staff-admin private command via its public invoker wrapper. This is expected. `anon` and `service_role` do not have USAGE.

## DDL model

The schema preserves existing catalog DTO field families and adds:
- Explicit `category_kind` (`menu` / `deal`) rather than special legacy category IDs.
- Restaurant-scoped composite FKs across parent/child rows.
- Product and variant price NULL-vs-zero semantics.
- Existing modifier selection modes: `ONE_OPTIONAL`, `ONE_REQUIRED`, `MULTIPLE_OPTIONAL`, `MULTIPLE_REQUIRED`.
- Existing modifier price modes: `FREE`, `FIXED`, `BY_SIZE`.
- Product-specific modifier price rules requiring a matching assignment and product variant.
- Sparse branch-level product/variant availability overlays. Base item active/available flags still gate effective availability.

The internal timestamp function is invoker-security, owned by postgres, fixed search_path `pg_catalog`, with application-role EXECUTE revoked.

## QA performed

After correcting the private-schema grant preflight to match Batch 4, a disposable test transaction passed. Fixtures were inserted in one explicit transaction and the final statement was `ROLLBACK`. Test coverage:
- NULL versus zero variant pricing.
- Menu/deal category integrity.
- Cross-restaurant category/subcategory protection.
- Modifier-price rule requires an actual matching variant and assigned option group.
- Branch overlay branch/restaurant/product/variant scope.
- Reject negative product price, invalid selection bounds, FREE modifier with fixed price, and zero drink volume.

Post-test count queries verified zero rows in all 11 tables. No disposable QA fixtures remain.

## Advisors

- Security Advisor: 18 INFO `rls_enabled_no_policy` findings, including deliberately deny-by-default catalog tables and earlier foundations. Do not add broad policies to silence these.
- Performance Advisor: 15 INFO unindexed FK findings for catalog tables and 17 INFO unused indexes. Unused-index notices are expected on an empty project; do not delete indexes before usage exists.
- Health Advisor: no findings.

## Follow-up index migration

`20261121062000_flame_chick_catalog_fk_indexes.sql` has 15 targeted composite indexes for the 15 catalog FK column sets. It is committed to the working branch and has not been applied. Wait until ledger repair is complete. Then apply through the normal migration system, verify Performance Advisor findings have cleared for those FKs, and re-check RLS/ACL/Realtime.

## Catalog API and UI are not ready

Do not enable direct Admin PostgREST writes or deploy public catalog API reading mutable drafts. Remaining work:
1. Implement Admin/Owner-authenticated atomic catalog draft commands in the existing four-function architecture.
2. Add append-only actor audit and optimistic draft revision checks.
3. Enforce same-tenant references and validate modifier assignment/prices within commands.
4. Reconcile DTO for product-scoped modifier price rules, explicit category kind and branch overlays.
5. Add immutable publication snapshots, checksum, current pointer, publish validator and rollback pointer.
6. Update public catalog Edge Function to read only current immutable publication and apply branch availability projection.
7. Update Admin UI to replace direct REST mutation with authenticated commands. Manager remains POS-only; Admin and Owner may author/publish.
8. Add tests for stale draft revisions, duplicate/idempotent commands, authorization, rollback and no public draft exposure.

Deals/deal components/curated choice groups and schedules remain a separate phase. Schedule recurrence/timezone/branch scope is unresolved. GST/tax remains deferred.

## Safety boundaries

- Use `postgres`, never `supabase_admin`, for migrations.
- No database branch creation, paid plan upgrades, production menu seeds or deployment until reviewed.
- Keep application table grants revoked until authenticated server commands and public published-snapshot reads are fully tested.
- Preserve existing commits and separate `befahad1234-cmyk` project context; do not transfer or disconnect GitHub accounts.


## Guarded CLI repair workflow prepared

The working branch now contains `.github/workflows/repair-flame-chick-catalog-ledger.yml`. It is a narrowly scoped push-trigger workflow that runs only from `work/production-source-audit` when the dedicated one-time trigger file changes. It pins Supabase CLI v3.2.0, checks the configured project ref and exact already-applied migration file, inspects the remote migration ledger, repairs only `20261121061000` with `--status applied --yes --remote=<project-ref>`, then verifies the list. No SQL migration is executed and no `db push` is used.

Required GitHub Actions repository secrets, which the connected GitHub tool cannot inspect or create: `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`. Keep them in GitHub Actions Secrets only, never in repository files or chat. The one-time trigger is held until those secrets are configured. Current Supabase CLI v3 uses `--remote` (not deprecated `--linked`) and defaults database commands to local unless a remote target is specified.


## Latest workflow run

GitHub Actions run [44890673291](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44890673291) executed the guarded workflow and stopped at the credential pre-check. Both required secrets were empty: `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`. CLI install/link/repair steps were skipped, so no Supabase database action ran. The migration ledger remains unchanged.

Owner must add these two Actions repository secrets at https://github.com/itsfahadahmed1234-creator/flame-chick-platform/settings/secrets/actions, then update `ops/triggers/repair-catalog-ledger.txt` to retrigger. Never disclose secrets in chat or commit them.


## Catalog foundation and FK-index migrations reconciled in Production

Both catalog migrations are now correctly represented in the Production migration ledger:
- `20261121061000_flame_chick_catalog_authoring_foundation`
- `20261121062000_flame_chick_catalog_fk_indexes`

The first migration's SQL had already been applied before its ledger record was repaired using the official Supabase CLI v3 workflow. The repair changed migration history only; it did not rerun DDL.

The FK-index migration was then applied through the official Supabase CLI v3 `db push` workflow after a dry-run confirmed that `20261121062000_flame_chick_catalog_fk_indexes.sql` was the only pending migration. The workflow uses explicit `--remote=<project-ref>`, pinned CLI v3.2.0, the repository Actions secrets, and a non-interactive `--yes` confirmation after the dry-run gate.

GitHub Actions run [44892500555](https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/44892500555) completed successfully. Independent Supabase verification confirms migration versions `20261121061000` and `20261121062000` are recorded, all 15 expected indexes exist in `public`, and all 15 are owned by `postgres`. No catalog business rows were inserted. The index migration did not alter RLS, policies, grants or Realtime publication.

Next: build secure Admin/Owner catalog command APIs, immutable published catalog snapshots, audit/revision controls, and migrate Admin UI away from direct table writes. Keep public catalog reads separate from authenticated writes. Do not seed live menu data until the catalog UI and command validation are ready.

