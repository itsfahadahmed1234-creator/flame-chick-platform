# Flame Chick — Draft vs Live Published Catalog Separation

Date: 2026-11-21
Branch: `work/production-source-audit`
Production project: `adkrxfnawdiljhjaavnj` (Mumbai, Free)

## Non-negotiable invariant

**Saving, editing, importing, previewing or validating a draft must never alter the menu served to customers.** The live Website/POS catalog changes only after a successful explicit publish operation commits a new immutable snapshot and atomically changes the restaurant's current-publication pointer.

The system has two distinct states:

- **Draft:** mutable rows edited only through authenticated Admin/Owner authoring commands. Draft revision increments on every successful command.
- **Live:** one immutable snapshot identified by `catalog_current_publication`. Customer read paths use this selected snapshot only.

Never union, overlay, merge or fall back from the live snapshot to mutable draft tables.

## Production implementation already applied

Migration: `20261121155900_flame_chick_catalog_public_snapshot_read_v1`

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

The function has **not** been deployed. Supabase reports zero deployed Edge Functions. Do not deploy it until the publish compiler/commands and snapshot DTO are complete and tested.

## Publish transaction — required design

The publish command is Admin/Owner-only and must execute entirely in one database transaction:

1. Acquire the restaurant's draft-state row lock and capture the exact current draft revision.
2. Validate the entire graph: restaurant/categories/products/variants, NULL-vs-zero price semantics, modifiers and exact variant pricing, deals/deal variants/component groups/options/variant maps, all required/min/max quantities, branch availability, schedule/timezone correctness and any DTO requirements.
3. Reject missing prices, unavailable or archived referenced products/variants, invalid option maps, incompatible deal pricing treatments, invalid schedule windows and incomplete required choice groups. Return actionable errors; do not auto-fix or silently default to free.
4. Compile a deterministic, self-contained snapshot with stable sort orders, explicit DTO schema version and pricing-engine version.
5. Compute the checksum using the exact SHA-256 contract above.
6. Confirm the draft revision is still the revision validated. If not, abort with a revision conflict.
7. Insert a new `catalog_publications` row with a monotonically increasing restaurant-scoped publication number, captured draft revision, schema version, pricing engine version, snapshot, checksum and actor.
8. Atomically upsert `catalog_current_publication` to point to the new publication in the same transaction.
9. Append publish audit and idempotency response in that transaction. If any statement fails, the transaction rolls back and the old live pointer remains in place.

No snapshot is visible until the transaction commits. Never write to the existing publication row.

## Rollback contract

Rollback is a separate Admin/Owner command. It must verify the target publication belongs to the same restaurant and its immutable checksum is valid, then atomically move only the current pointer back to that prior publication. It must not change snapshot history, draft data or order snapshots. The actor, reason, previous pointer and new pointer must be audited.

## Required automated release tests

- Active restaurant with no pointer: public response is unpublished and contains no draft rows.
- Draft changes before first publish: still no public menu.
- Publish valid snapshot: public response exactly matches stored publication.
- Edit draft after publish: public response, publication ID and checksum remain byte-for-byte stable.
- Invalid draft / failed compiler / failed insert / stale revision: old pointer and old public snapshot remain unchanged.
- Successful second publish: old publication remains immutable; only pointer switches to the new row.
- Rollback: pointer moves to the previous immutable publication; its snapshot is returned exactly.
- Corrupt snapshot/hash or orphaned pointer: return an error/fail closed; never fall back to draft.
- Public caller cannot invoke Admin commands, read draft RPCs or select publication tables.
- Website response retains existing schema-v2 DTO and uses publication ID/hash in cache identity.
- Branch-specific availability is a separately versioned overlay. It may filter the live base snapshot but must not change base menu prices or use unpublished draft values.

## Website cutover rule

The existing running Website must remain on its current data source until:
1. the snapshot compiler, publish and rollback commands are implemented;
2. golden publication/read/rollback tests pass;
3. the deployed Edge Function is verified against a known published fixture;
4. the Website is explicitly configured to use that published-only endpoint;
5. a rollback path to the previous Website data source is verified.

Creating or editing drafts must never trigger this cutover. A preview URL or public query parameter that serves arbitrary draft revisions is prohibited. Any future Admin preview must be authenticated and separate from the customer catalog read endpoint.

## Current state (verified 2026-11-21)

- Migration `20261121155900` is applied and recorded.
- `flame_chick_catalog_public_read(text)` is postgres-owned SECURITY DEFINER with empty search_path.
- Only `service_role` can execute it; `anon` and `authenticated` cannot.
- Service role has no direct SELECT on publication or pointer tables.
- Rollback-only tests confirmed no-pointer fail-closed, exact stored-snapshot response, no effect from later draft revision changes, and publication-history immutability.
- All test fixtures rolled back.
- Production currently has zero publication rows, zero live pointers and zero draft-state rows.
- `flame-chick-catalog` Edge Function source now uses only the published-read RPC, passed static checks and is not deployed.
- No Vercel or live Website cutover was performed.

## Next stage

Implement the snapshot compiler, full graph validation, publish command, rollback command and golden test suite. Only then deploy the Edge Function and perform a separately verified Website cutover.
