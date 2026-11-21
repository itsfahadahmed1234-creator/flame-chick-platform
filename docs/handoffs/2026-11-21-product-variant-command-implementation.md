# Catalog Product + Variant Commands — Implementation and QA Handoff

Date: 2026-11-21
Branch: `work/production-source-audit`
Supabase project: `adkrxfnawdiljhjaavnj` (Flame Chick Production, Mumbai, Free plan)

## Applied migrations

1. `20261121144209_flame_chick_catalog_product_commands_v1`
   - GitHub Actions: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44915515192
   - Applied successfully after project identity and exact-single-pending-migration dry-run checks.
2. `20261121145500_flame_chick_catalog_product_commands_v1_qa_fixes`
   - GitHub Actions: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44915684114
   - Applied successfully as a forward-only correction.

## Product command API at database level

Public SECURITY INVOKER wrappers:
- `public.flame_chick_catalog_product_upsert(jsonb,bigint,uuid)`
- `public.flame_chick_catalog_product_draft_read(uuid,integer)`

Internal implementation:
- `app_private.flame_chick_catalog_product_upsert_internal(jsonb,bigint,uuid)`
- `app_private.flame_chick_catalog_product_draft_read_internal(uuid,integer)`

The command uses the existing authenticated actor resolver, per-restaurant catalog draft revision lock, request hash/idempotency ledger and immutable audit table. Product plus any supplied variant upserts are one transaction.

### Product upsert contract
- Product create/update is restricted to the active Flame Chick restaurant and active restaurant-wide Admin/Owner membership, derived from `auth.uid()`.
- Product category must be a menu category within the same restaurant; an optional subcategory must belong to that same category and restaurant.
- Strict allowlisted product and variant fields; bounded JSON payloads and a maximum of 50 variants.
- Product/variant edits use patch semantics. Omitted scalar fields remain unchanged on update.
- If `variants` is omitted, variants are unchanged. If an array is supplied, listed variants are upserted; variants omitted from that array are preserved. The UI must explicitly set `is_active=false` to archive a variant; no implicit hard delete occurs.
- Variant identity is exact ID constrained to the same product/restaurant, or normalized `size_key` for a new/upsert-by-key record.
- Duplicate normalized size keys and (after the forward QA fix) duplicate explicit variant IDs in one request are rejected.
- `variant_kind` is constrained to the existing schema values: standard, portion, flavour, pack, volume.
- Pack variants require positive integer quantity and unit; other variant kinds reject pack metadata.
- Price is NUMERIC(12,2), nonnegative, with at most two decimal places; JSON null remains SQL NULL (TBD/unpriced), while numeric zero remains an explicit zero price.
- Image metadata is deliberately not accepted by this command. Image upload/path/publish metadata needs a separate secure storage-aware command before Admin image management is enabled.
- Incomplete products and variants can be saved as drafts; publication validation must later block unpriced or non-sellable entries.

### Product draft read
- Admin/Owner-only via the shared actor resolver.
- Keyset pagination by UUID, default 25 and hard maximum 50 products per page.
- Each product includes a bounded nested ordered list of variants.
- No `SELECT *` output is returned to clients; response projection is explicit and excludes internal database data not needed by the editor.

## Live verification

Remote migration ledger confirmed all of:
- `20261121125542` menu catalog schema
- `20261121133607` catalog command/idempotency base
- `20261121140000` catalog command QA correction
- `20261121144209` product/variant command
- `20261121145500` product command QA correction

Direct database inspection confirmed:
- Both internal product functions are owned by postgres, SECURITY DEFINER and have `search_path = ''`.
- Both public wrappers are SECURITY INVOKER with `search_path = ''`.
- Authenticated can execute wrappers; anon and service_role cannot execute them.
- Application roles have no direct INSERT/UPDATE grants on products or product_variants and cannot read the idempotency ledger.
- Idempotency ledger remains postgres-owned and RLS-enabled.

## Authenticated transaction QA — passed

A disposable transaction created temporary auth user, Flame Chick restaurant, profile and restaurant-wide Admin role; it then set authenticated JWT claims and exercised the public RPC wrappers. The entire transaction was rolled back.

Passed checks:
1. Authenticated Admin can create a menu category.
2. Same request ID + same payload returns the original result with `idempotent=true`.
3. Reusing the same request ID with a changed payload is rejected.
4. Authenticated Admin can create a product with two variants.
5. Numeric zero is preserved as zero, and NULL price remains NULL.
6. Product request replay returns original response without a second revision increment.
7. Explicit `variants: null` is rejected with `CATALOG_PRODUCT_VARIANTS_INVALID`.
8. Duplicate variant IDs in one patch are rejected with `CATALOG_VARIANT_ID_DUPLICATED`.
9. Stale expected revision is rejected with `CATALOG_REVISION_CONFLICT`.
10. Product draft read returns the product and variants through the protected RPC.
11. A partial patch to one variant preserves the omitted second variant, updates the named variant, and advances revision only once.
12. Direct authenticated table writes and direct SELECT from `product_variants` are denied.

Test-harness notes:
- The initial price assertion assumed JSON array order matched input order; the API intentionally sorts variants by sort_order/size_key. The assertion was corrected to locate variants by size_key and passed.
- A direct authenticated SELECT attempted by an early patch test was denied as designed; the final test checks variant state through the authorized draft-read/command result instead.

After rollback, independent counts confirmed zero temporary auth users, restaurants, categories, products, variants, catalog draft states, audit rows and idempotency rows.

Negative tests without authenticated identity also independently confirmed category/product commands and draft reads reject with `CATALOG_ADMIN_FORBIDDEN`.

## Supabase Advisors

Security Advisor currently reports 30 INFO `rls_enabled_no_policy` findings. These are the intentional deny-by-default tables (including the private idempotency ledger); do not add broad policies to silence these INFO notices.

Performance Advisor reports 52 INFO `unused_index` findings. This is expected at this pre-launch stage with empty business tables and no production workload; do not drop FK or query-path indexes based on zero-usage statistics before representative data and workload exist.

## Not implemented yet

- Owner-role positive test and explicit Manager/Cashier/Rider negative role tests (actor resolver explicitly permits only restaurant-wide Admin/Owner).
- Category archive, product archive dedicated action and subcategory archive command routes.
- Modifier group/assignment/price-rule command APIs.
- Deal collection, deal and component-group command APIs.
- Image/storage metadata command.
- Publication compiler, publish, rollback and branch overlay publication contract.
- Edge Function router and Admin UI integration.
- Product query-plan review using representative non-empty data.
- No Edge Function has been deployed; no catalog Admin screen has been enabled.

## Next step

Continue with secure modifier group + modifier assignment + exact `product_variant_id` price-rule authoring commands, reusing the existing revision/idempotency/audit model. Then implement deal/component commands and publication validation. Only after all command types are complete should the single catalog Edge Function router and Admin UI be enabled. Do not seed the actual menu yet.
