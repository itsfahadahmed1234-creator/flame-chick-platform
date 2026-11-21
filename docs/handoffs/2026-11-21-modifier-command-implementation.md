# Modifier Authoring Commands — Implementation and QA Handoff

Date: 2026-11-21
Branch: `work/production-source-audit`
Supabase project: `adkrxfnawdiljhjaavnj` (Mumbai, Free plan)

## Applied migration
- `20261121150452_flame_chick_catalog_modifier_commands_v1`
- GitHub Actions: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44917875677
- The guarded workflow confirmed the target project, required prior catalog/product migration versions, dry-ran the remote push and applied this migration as the only pending migration.

## New public database command wrappers
- `public.flame_chick_catalog_modifier_draft_read(uuid,integer)`
- `public.flame_chick_catalog_modifier_assignment_draft_read(uuid)`
- `public.flame_chick_catalog_modifier_group_upsert(jsonb,bigint,uuid)`
- `public.flame_chick_catalog_modifier_assignment_upsert(jsonb,bigint,uuid)`

All wrappers are SECURITY INVOKER, postgres-owned, use `SET search_path = ''`, and are executable by `authenticated` only. Internal implementation functions are postgres-owned SECURITY DEFINER with empty search_path and explicit authenticated EXECUTE grants. The shared actor resolver requires active Flame Chick restaurant, active user/profile and active restaurant-wide Admin or Owner membership derived from `auth.uid()`.

## Data model and command semantics

### Group + modifier options
- Group and its modifier options are one atomic aggregate.
- Supports group name EN/UR, `standalone_only`, selection mode, min/max selection, sort order and active flag.
- Selection modes: `ONE_OPTIONAL`, `ONE_REQUIRED`, `MULTIPLE_OPTIONAL`, `MULTIPLE_REQUIRED`; min/max bounds are validated against existing table constraints before write.
- Modifier options support names EN/UR, legacy ID, sort order, active flag and pricing modes `FREE`, `FIXED`, `BY_SIZE`.
- FIXED requires explicit nonnegative NUMERIC(12,2) fixed_price; FREE and BY_SIZE require fixed_price NULL. Zero fixed price is valid.
- New/update option list is patch semantics: omitted options are preserved; options are archived explicitly by `is_active=false`. No implicit deletion.
- A BY_SIZE modifier cannot change to FREE/FIXED while any exact variant price rows still exist. Admin must explicitly remove rules through the assignment editor first, avoiding silent price-data loss.
- Incomplete groups/options are allowed in draft; publication validation must enforce the required active option count and valid configurations.

### Product assignment + exact-variant price rules
- An aggregate assignment links one group to one product. Unique (restaurant, group, product) constraint remains authoritative.
- Assignment includes active flag, sort order and optional legacy ID.
- Exact BY_SIZE rules use `modifier_id + product_variant_id`; option must belong to assigned group and variant must belong to assigned product and same restaurant.
- Rule price uses NUMERIC(12,2), nonnegative, max two decimal places. Missing BY_SIZE rules are permitted in draft but must block publication/quote for a selectable configuration unless separately specified as non-required.
- `price_rules` is a patch-upsert list. Omitted rules remain unchanged.
- Explicit `remove_price_rules` list removes only the named (modifier, exact variant) entries, with same-group/same-product validation.
- Rules for FREE or FIXED options are rejected.
- Duplicate rule keys and duplicate/conflicting removal keys within a request are rejected.
- One product assignment and its rule changes are one transaction, one draft revision increment and one immutable actor audit event.

## Performance choices
- Modifier group draft list is keyset-paginated (default 25, maximum 50), grouped with a bounded nested option projection.
- Added index `modifier_groups_restaurant_id_id_idx (restaurant_id,id)` specifically for the tenant-scoped UUID keyset page query; no duplicate/redundant index was added.
- Product assignment read aggregates exact-variant price rules and modifier options set-wise rather than performing repeated per-modifier rule queries.
- Assignment rules are bounded to 200 add/remove entries per command; group options to 50; request bodies bounded to 64 KiB.
- No Realtime was added for catalog draft modifications.

## QA passed — all fixtures rolled back
The migration was first executed inside a temporary schema transaction and rolled back for parser/privilege validation. Authenticated behavior test used temporary Auth user, Flame Chick restaurant, profile and Admin role inside a transaction; it then called the actual public RPCs as `authenticated`. Checks passed:
1. Create menu category and a product with Regular and Large variants.
2. Create a modifier group with FREE, FIXED and BY_SIZE options.
3. Create a product assignment and exact variant prices for Regular and Large.
4. Retry same assignment command/key/payload and receive original idempotent result without incrementing the draft revision again.
5. Read product assignments/options/price rules through the protected set-based reader.
6. Attempt BY_SIZE -> FREE while rules exist; rejected with `CATALOG_MODIFIER_PRICE_RULES_MUST_BE_REMOVED_FIRST`.
7. Explicitly remove both exact-variant rules.
8. Change BY_SIZE option to FREE after rule removal.
9. Read modifier draft groups and verify expected final revision.
10. Direct authenticated read of modifier_groups is denied.

No live restaurant, Auth user, category, product, modifier group, modifier, assignment, price rule, audit or idempotency record was left behind. Independent counts after rollback were zero.

A test exposed an early implementation issue where rule-removal target checks ran before resolving the actor's restaurant. This was corrected before apply; checks now run inside the authorized mutation path. The final set-based assignment reader was included and re-tested before deployment.

## Live verification after apply
- Remote migration ledger includes `20261121150452_flame_chick_catalog_modifier_commands_v1`.
- Four internal modifier functions are postgres-owned SECURITY DEFINER, empty search_path.
- Four public wrappers are postgres-owned SECURITY INVOKER, empty search_path.
- All wrappers: authenticated EXECUTE true; anon and service_role EXECUTE false.
- Authenticated has no SELECT/INSERT/UPDATE on modifier groups, assignments or price rule table, and no direct idempotency table access.
- New pagination index exists.
- Catalog and modifier tables remain empty.

## Supabase Advisors
- Security Advisor: 30 INFO `rls_enabled_no_policy` findings. These reflect intentional deny-by-default tables; do not add broad RLS policies to clear INFO.
- Performance Advisor: 47 INFO unused-index findings. This is expected in a pre-launch project with no workload. Do not drop FK/query indexes on the basis of zero usage before representative data and workload exist. Indexes should be reevaluated after representative workload observation.

## Not yet implemented
- Deal collection/deal/component group/eligible choice authoring commands.
- Image/storage metadata command.
- Product archive/category archive and assignment archive dedicated routes (entities can be soft-archived with `is_active=false` where command payload currently supports it; standalone archive UX still needs explicit API design).
- Publication compiler validation for BY_SIZE rules, selection bounds, active options and assignments.
- Catalog Edge Function action router.
- Admin UI integration and removal of direct REST writes.
- Positive Owner role and explicit Manager/Cashier/Rider denial tests (shared actor resolver is reused and permits only Admin/Owner, but role matrix QA still required).
- No Edge Function deployed and no Admin catalog screen enabled.

## Next
Implement deal authoring commands for deal collections, deals, component groups and eligible exact product variants; support INCLUDED, SURCHARGE and STANDALONE pricing treatments with the approved V1 limits. Follow with publication validation/compiler and then a single domain Edge Function router. Keep Admin direct-write paths disabled until API + UI end-to-end tests pass.
