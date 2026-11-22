# Flame Chick — Draft vs Live Published Catalog Separation

Date: 2026-11-22
Branch: `work/production-source-audit`
Production project: `adkrxfnawdiljhjaavnj` (Mumbai, Free)

## Non-negotiable invariant

**Saving, editing, importing, previewing or validating a draft must never alter the menu served to customers.** The live Website/POS catalog changes only after a successful explicit publish operation commits a new immutable snapshot and atomically changes the restaurant's current-publication pointer.

The system has two distinct states:

- **Draft:** mutable rows edited only through authenticated Admin/Owner authoring commands. Draft revision increments on every successful command.
- **Live:** one immutable snapshot identified by `catalog_current_publication`. Customer read paths use this selected snapshot only.

Never union, overlay, merge or fall back from the live snapshot to mutable draft tables.

## Production implementation already applied

Migrations:
- `20261121155900_flame_chick_catalog_public_snapshot_read_v1`
- `20261122031027_flame_chick_catalog_publish_rollback_v1`

It creates `public.flame_chick_catalog_public_read(text)`:
- postgres-owned `SECURITY DEFINER`, `SET search_path = ''`.
- Executable by `service_role` only; not by `anon` or `authenticated`.
- Service role does not receive direct SELECT on `catalog_publications` or `catalog_current_publication`.
- Reads restaurant active state, the current pointer and the referenced immutable publication only.
- Does not query categories, products, variants, modifier groups, deals, draft state, settings or any other editable table.
- No current pointer returns `published=false` and `snapshot=null`.
- Validates snapshot object, schema version, publication metadata and SHA-256. Checksum mismatch fails closed.

The checksum contract for the future publication compiler is exactly:

```sql
encode(
  extensions.digest(
    convert_to(snapshot::text, 'UTF8'),
    'sha256'
  ),
  'hex'
)
```

This is SHA-256 of PostgreSQL's canonical `jsonb::text` form encoded as UTF-8, in lower-case hex. The stored `snapshot_sha256` must match this value.

The immutable publication-history table already rejects UPDATE, DELETE and TRUNCATE. A new publication must be a new history row.

## Public Edge Function

`supabase/functions/flame-chick-catalog/index.ts` has been changed to call only the published-read RPC. It no longer reads editable tables directly. It returns the stored schema-v2 snapshot and publication metadata, or returns `CATALOG_NOT_PUBLISHED` (HTTP 404) when no live pointer exists. It never falls back to mutable drafts.

The source passed the Edge Function static-check workflow:
https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44922820111

The function has **not** been deployed. Supabase reports zero deployed Edge Functions. Static checks pass, but do not deploy it to a customer-facing project until the V3 client adapter and quote/order path are complete and tested.

## Publish transaction — implemented

Public command: `public.flame_chick_catalog_publish(p_expected_revision bigint,p_request_id uuid)`.

1. Resolve active Admin/Owner actor and restaurant.
2. Lock the restaurant's `catalog_draft_state` row and compare the supplied expected revision.
3. Validate the complete active menu/deal graph, pricing, exact modifier variant rules, component selection capacity, schedules, timezones and branch overlays. Validation errors are structured and capped at 100.
4. Compile a deterministic schema-V3 snapshot with stable sort ordering and a fixed pricing-engine version.
5. Compute SHA-256 of PostgreSQL `snapshot::text` as UTF-8 bytes, lower-case hex.
6. Insert a new immutable `catalog_publications` history row with monotonic restaurant-scoped publication number, draft revision, schema version, engine version, snapshot, checksum and actor.
7. Atomically switch `catalog_current_publication` in the same transaction.
8. Append actor audit and idempotency response in the same transaction.

The draft revision and draft rows are not changed by publish. Any validation or transaction failure aborts all statements and leaves the previous pointer untouched.

## Rollback contract — implemented

Public command: `public.flame_chick_catalog_rollback(target_publication_id, expected_draft_revision, request_id, reason)`.

- Admin/Owner only; a reason of 10–500 characters is required.
- Target must exist in the same restaurant, not already be current, and have valid schema metadata/checksum.
- Rollback updates only `catalog_current_publication`, never snapshot history or draft content.
- Actor, reason, previous and restored publication are audited; repeated same request replays idempotently.
- A rollback to a prior database publication is available once at least two publications exist. Before the first database publication, the legacy Website deployment remains the emergency fallback.

Publication history is exposed to Admin/Owner through `public.flame_chick_catalog_publication_history`, a bounded metadata-only read. It does not return stored snapshot JSON to the Admin browser.

## QA performed — rollback-only and passed

- Active restaurant with no publication pointer returns unpublished and NULL snapshot.
- Authenticated Admin created a temporary category, product and priced variant through the existing command RPCs.
- Published publication 1; same request replay did not create a duplicate.
- Edited draft and successfully published publication 2.
- Deactivated the category while a product remained active; publish was rejected with `ACTIVE_PRODUCT_CATEGORY_INACTIVE`.
- Confirmed failed publish left publication 2 current and history remained exactly two immutable rows.
- Rolled back to publication 1; same rollback request replayed idempotently.
- Confirmed publication 1 current, publication 2 immutable/non-current, and the newer invalid draft remained unchanged.
- Published-only read RPC returned the exact publication-1 snapshot and checksum.
- Direct application-role SELECT on publication tables remained denied.
- All temporary users, restaurant, menu data, publications, pointers, audit rows and idempotency rows were rolled back.

## Remaining validation before live Website cutover

- Publish/rollback concurrency test with simultaneous Admin requests and stale draft revisions.
- V3 Website adapter and complete menu rendering tests.
- Server-side quote/checkout pricing integration and historical order snapshot tests.
- Runtime schedule evaluator tests (weekly, overnight, one-off, IANA timezone, DST behavior).
- Delivery areas/settings and promotions domains.
- End-to-end website checkout to POS tests and branch-specific availability.
- Deployment-preview verification and explicit owner approval for custom domain cutover.

## Website cutover rule

The existing running Website must remain on its current data source until:
1. the snapshot compiler, publish and rollback commands are implemented;
2. golden publication/read/rollback tests pass;
3. the deployed Edge Function is verified against a known published fixture;
4. the Website is explicitly configured to use that published-only endpoint;
5. a rollback path to the previous Website data source is verified.

Creating or editing drafts must never trigger this cutover. A preview URL or public query parameter that serves arbitrary draft revisions is prohibited. Any future Admin preview must be authenticated and separate from the customer catalog read endpoint.

## Current state (verified 2026-11-22)

- Migrations `20261121155900` and `20261122031027` are applied and recorded.
- `flame_chick_catalog_public_read(text)` is postgres-owned SECURITY DEFINER with empty search_path.
- Only `service_role` can execute it; `anon` and `authenticated` cannot.
- Service role has no direct SELECT on publication or pointer tables.
- Rollback-only tests confirmed no-pointer fail-closed, exact stored-snapshot response, no effect from later draft revision changes, and publication-history immutability.
- All test fixtures rolled back.
- Production currently has zero publication rows, zero live pointers and zero draft-state rows.
- `flame-chick-catalog` Edge Function source now uses only the published-read RPC, passed static checks, advertises the active publication schema version and is not deployed.
- No Vercel or live Website cutover was performed. The legacy `flame-chick.vercel.app` alias remains assigned to verified production deployment `dpl_4MepX2o8ysrqsnHp7H6H7mVqznGP`; rollback runbook is `docs/architecture/website-release-cutover-rollback-v1.md`.

## Next stage

Implement the V3 Website adapter, delivery/checkout configuration, runtime schedule evaluation and order/quote integration. Then deploy the Edge Function and Website to preview, test end to end, and only with explicit approval cut over. The verified legacy Vercel deployment remains the emergency Website rollback target.
