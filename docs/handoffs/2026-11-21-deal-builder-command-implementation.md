# Deal Builder Schema, Commands and QA Handoff

Date: 2026-11-21
Branch: `work/production-source-audit`
Supabase project: `adkrxfnawdiljhjaavnj` (Mumbai, Free plan)

## Applied migrations

1. `20261121152231_flame_chick_deal_builder_schema_v1`
   - Added first-class deal variants, variant-specific component-option pricing maps, explicit schedule timezones, branch-level deal schedule assignments.
   - Applied through guarded workflow: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44919562056
2. `20261121153223_flame_chick_deal_commands_v1`
   - Added Admin/Owner collection, deal, component, variant-option, schedule, schedule-assignment and branch-availability commands and bounded reads.
   - Remote migration ledger confirms applied.
   - Applied through guarded workflow: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44920808589
3. `20261121154711_flame_chick_deal_builder_fk_indexes`
   - Added four child-side composite FK indexes identified by Performance Advisor.
   - Applied through guarded workflow: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44921098028

## Deal pricing model

### Purchasable deal variants
Each deal can have its own variants with:
- Stable `variant_key` (e.g. REGULAR, FAMILY).
- English/Urdu labels.
- `FIXED_BUNDLE` or `BASE_PLUS_SELECTED_ITEMS` pricing mode.
- Nullable NUMERIC(12,2) base price for drafts; publication compiler must require a complete price before publish.
- Active and sort flags.

The old `deals.bundle_price` field remains for backwards compatibility only. New command/API code creates deals with `bundle_price = NULL` and uses `deal_variants.base_price`.

### Per-deal-variant component eligibility and pricing
`deal_variant_component_options` explicitly maps each deal variant to eligible `deal_component_options`. Missing map means the choice is not eligible for that variant.

Pricing treatments:
- `INCLUDED`: no component charge.
- `SURCHARGE`: add explicit nonnegative per-unit surcharge.
- `STANDALONE`: charge the selected product variant's published standalone price; rejected for FIXED_BUNDLE and allowed for BASE_PLUS_SELECTED_ITEMS.

Each map may carry a variant-specific `max_quantity_per_deal`, but the command validates it cannot exceed the component group's max units, max units per option, or repeat policy. Drafts can remain incomplete; publication validation must reject missing/invalid map paths.

Legacy `deal_component_options.pricing_treatment`, `unit_surcharge` and `max_quantity_per_deal` are retained as compatibility columns only. New deal command writes do not use them as pricing source; the variant mapping table is authoritative. New component options initialize old pricing fields to INCLUDED/0/NULL.

## Schedule and branch model
- `catalog_schedule_sets.timezone` is now required, IANA validated and explicitly stored. Existing rows were backfilled from restaurant timezone before NOT NULL was enforced.
- Weekly schedule windows support overnight ranges, optional effective date bounds and all-day windows.
- One-off schedule windows are timestamptz; command inputs require explicit UTC offsets.
- Window arrays are patches; omitted rows remain. Deletion is explicit via `remove_window_ids`.
- Deal schedule precedence: active branch-specific deal assignment > active deal-wide assignment > collection fallback. An inactive assignment is skipped/falls back.
- Branch-specific deal assignment requires schedule timezone = branch timezone, falling back to restaurant timezone. Deal-wide assignment requires restaurant timezone.
- Branch availability is independent from schedule assignment and stored in `branch_deal_availability`.
- No scheduler/cron/Realtime subscription has been added. Runtime evaluation is planned for the catalog snapshot/quote layer.

## Public authenticated API wrappers

Collection:
- `flame_chick_catalog_deal_collection_read(uuid,integer)`
- `flame_chick_catalog_deal_collection_upsert(jsonb,bigint,uuid)`

Deal:
- `flame_chick_catalog_deal_list_read(uuid,uuid,integer)`
- `flame_chick_catalog_deal_detail_read(uuid)`
- `flame_chick_catalog_deal_upsert(jsonb,bigint,uuid)`
- `flame_chick_catalog_deal_components_upsert(jsonb,bigint,uuid)`
- `flame_chick_catalog_deal_variant_options_upsert(jsonb,bigint,uuid)`

Schedules / branch:
- `flame_chick_catalog_schedule_set_read(uuid,integer)`
- `flame_chick_catalog_schedule_detail_read(uuid)`
- `flame_chick_catalog_schedule_set_upsert(jsonb,bigint,uuid)`
- `flame_chick_catalog_deal_schedule_assignment_upsert(jsonb,bigint,uuid)`
- `flame_chick_catalog_deal_branch_availability_upsert(jsonb,bigint,uuid)`

All wrappers are SECURITY INVOKER with empty search_path, EXECUTE authenticated only. Internal mutation/read functions are postgres-owned SECURITY DEFINER with empty search_path. Shared command helpers are non-definer private helpers not executable by application roles; they run from the postgres-owned command functions. Command context serializes each restaurant's catalog writes using the draft revision row and handles same-request/same-payload replay; completion increments one revision, writes append-only audit and saves the idempotency response in the same transaction.

No direct app-role table CRUD/read has been granted. New tables are postgres-owned, RLS-enabled and have no permissive policies.

## Rollback-only QA performed before migration application

### Schema relational test
Temporary restaurant, categories, product, Regular/Large variants, collection, deal, groups/options, Regular/Family deal variants, three pricing treatments, schedule windows and global/branch assignments were inserted inside a transaction and rolled back. Invalid IANA timezone was rejected.

### Authenticated command test
Temporary Auth Admin and branch-scoped Cashier fixtures were created through the valid bootstrap/role-assignment patterns. The authenticated Admin called public RPC wrappers. Verified:
1. Deal category and menu category authoring prerequisites.
2. Product with Regular and Large product variants.
3. Timezone-aware schedule with weekly overnight and one-off windows.
4. Deal collection referencing deal category and schedule.
5. Deal with Regular FIXED_BUNDLE and Family BASE_PLUS_SELECTED_ITEMS variants.
6. Component groups with exact product-variant choices; the same variant can exist in distinct groups.
7. Per-variant map: Regular uses INCLUDED/SURCHARGE; Family uses STANDALONE/SURCHARGE.
8. FIXED_BUNDLE STANDALONE is rejected.
9. Same request/same payload replays; same request/different payload is rejected.
10. Branch-specific + global deal schedule assignments and separate branch availability.
11. Updating a branch assignment with omitted branch_id preserves the existing branch scope.
12. Explicit schedule window removal works and is scoped to the owning schedule set.
13. Bounded collection/deal/schedule library reads and detail reads return expected shapes.
14. Direct deal table SELECT is denied.
15. Authenticated Cashier cannot execute catalog authoring commands.

### Additional final validation tests
- Per-deal-variant max quantity larger than component-group rules is rejected.
- Branch-specific assignment with a different timezone from its branch is rejected.
- Global deal assignment with a different timezone from restaurant is rejected.
- Matching branch/global timezone assignment succeeds.

All temporary users, restaurant, branch, menu/deal rows, draft state, audit rows and idempotency rows were rolled back. Independent live counts after tests are zero for all these records.

## FK index correction
The post-apply Performance Advisor identified four unindexed child-side FKs. Added:
- `deal_schedule_assignments_branch_fk_idx(branch_id,restaurant_id)`
- `deal_schedule_assignments_deal_fk_idx(deal_id,restaurant_id)`
- `deal_variant_component_options_variant_fk_idx(deal_variant_id,deal_id,restaurant_id)`
- `deal_variants_deal_fk_idx(deal_id,restaurant_id)`

The Advisor no longer reports unindexed deal-builder FKs. Additional tenant-scoped keyset indexes:
- `deals_restaurant_collection_id_idx(restaurant_id,collection_id,id)`
- `catalog_schedule_sets_restaurant_id_id_idx(restaurant_id,id)`

## Advisor state
- Security Advisor: 33 INFO `rls_enabled_no_policy` notices. The new deal tables are intentionally RLS-enabled without broad policies and have no app-role direct grants. Do not add broad policies just to silence INFO.
- Performance Advisor: 43 INFO unused-index notices remain in this empty pre-launch project. No unindexed deal-builder FK notices remain. Do not drop indexes until representative workload exists.

## Not implemented / not enabled
- Publication compiler/static validation for the complete menu/deal/modifier graph.
- Runtime schedule evaluation in public catalog snapshot.
- Deterministic immutable publication snapshot, version/checksum and atomic current publication pointer.
- Golden quote/pricing tests for deal variants, component quantities, modifiers, promotions and refund allocations.
- Single catalog Edge Function router and server-side API rate limits.
- Admin UI integration. Existing direct REST writes/catalog Admin modules remain disabled.
- Edge Functions not deployed and no checkout/order pricing uses these deal APIs yet.
- Explicit Owner positive and Manager/Rider negative role matrix tests still required; shared actor resolver only permits active restaurant-wide Admin/Owner.
- GST remains deferred.

## Next
Implement publication compiler + validation and deterministic snapshot/publish/rollback commands. The validator must check required active component groups/options, deal-variant option maps, mode/treatment compatibility, exact product/variant tenant links and sellability, priced STANDALONE variants, surcharge/quantity caps, schedule windows/timezones, branch overrides and availability. Only after publication and quote golden tests pass should public catalog Edge Function and Admin UI integration proceed.
