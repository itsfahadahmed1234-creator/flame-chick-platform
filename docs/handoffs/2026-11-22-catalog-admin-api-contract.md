# Flame Chick — Catalog Admin API contract handoff

Date: 2026-11-22  
Branch: `work/production-source-audit`  
Status: implementation committed; isolated contract QA workflow added; CI result and runtime integration not yet verified

## Goal and boundary

Expose the existing database-backed catalog draft commands through the already deployed `flame-chick-staff-admin` Edge Function. This avoids introducing an extra Edge Function and preserves the agreed compact domain-function architecture.

The catalog command path is available only to signed-in users whose database identity is resolved by `app_private.flame_chick_catalog_actor()` as an active restaurant-wide Admin or Owner. Manager, Cashier, Rider and unauthenticated callers are denied by the database, regardless of client input.

## Implemented in source

- Added `supabase/functions/flame-chick-staff-admin/catalog-actions.mjs` with a finite action-to-RPC map. Client input cannot select an arbitrary RPC name.
- Extended `supabase/functions/flame-chick-staff-admin/index.ts` to route `catalog_*` actions through that map and invoke the named public RPC using the caller's publishable key plus their Bearer user JWT.
- Catalog RPC calls do not use `SECRET_KEY` or service-role credentials. Existing secret-key use remains confined to the staff-invitation/Auth system path.
- The function keeps exact-origin CORS from `FLAME_CHICK_STAFF_ADMIN_ALLOWED_ORIGINS`; the function configuration still has `verify_jwt=true`.
- Request bodies are capped at 256 KiB; each catalog mutation payload is capped at 65,536 UTF-8 bytes, matching the database catalog command context ceiling. Writes require a UUID request ID and non-negative expected draft revision. Read cursors, IDs and limits are type/bounds checked.
- Database RPC remains the authority for actor/role/tenant, relationship, field, revision, idempotency and transactional validation. No table grants or RLS policies were widened.

## Supported draft/read actions

Reads:
- `catalog_categories_list`, `catalog_subcategories_list`
- `catalog_products_list`, `catalog_modifier_groups_list`, `catalog_modifier_assignments_read`
- `catalog_deal_collections_list`, `catalog_deals_list`, `catalog_deal_detail_read`
- `catalog_schedule_sets_list`, `catalog_schedule_detail_read`
- `catalog_publication_history`

Draft mutations:
- `catalog_category_upsert`, `catalog_subcategory_upsert`, `catalog_product_upsert`
- `catalog_modifier_group_upsert`, `catalog_modifier_assignment_upsert`
- `catalog_deal_collection_upsert`, `catalog_deal_upsert`, `catalog_deal_components_upsert`, `catalog_deal_variant_options_upsert`
- `catalog_deal_schedule_assignment_upsert`, `catalog_deal_branch_availability_upsert`, `catalog_schedule_set_upsert`

Unsupported by design in this slice:
- `catalog_publish` and `catalog_rollback` are deliberately rejected. Publication must stay gated until the customer Website schema-v3 DTO / compatibility review and launch-readiness approval are complete.
- No delivery-area, promotion/coupon redemption, restaurant settings, media upload/delete, or order functionality is added here.
- No direct PostgREST table CRUD is enabled in the Admin UI. Existing Admin catalog navigation remains disabled.

## Test coverage and CI

- Added `tests/catalog-admin-api.test.mjs` for finite read/write mapping, required revision/request ID, input field rejection, UUID/cursor/limit checks, payload bounds, unsupported publish/rollback and user-JWT/no-service-secret routing.
- Added `.github/workflows/qa-catalog-admin-api.yml`, which runs the contract tests under Node 22 without Supabase credentials or production secrets.
- Relevant source commits:
  - `74ed14b667f9977a303bee4f2b5d003ed6532c9b` — add finite RPC map
  - `17397780afc8c0e207734c6be64c82b6618faa61` — route API through authenticated caller context
  - `8781bbacc98ddc62844ff661d30c0aac145eb5a1` — match DB payload ceiling
  - `f62446a0aa8373d23bf93aca9e1edc63ccc471b2` — add payload size test
  - `13e3f19a12969824689b7f324036353a58894688` — remove unused import
- The GitHub combined commit-status endpoint returned no status entries when checked. Therefore the workflow/test result is **not yet verified as passed**. Do not state that CI is green until a run is visible and succeeds.

## Deployment and runtime status

- The currently deployed Supabase `flame-chick-staff-admin` remains version 1 with JWT verification enabled. These new catalog routes are only committed in Git and have **not** been deployed.
- No runtime invocation has yet verified the existing deployed Staff Admin function after its original deployment. The 2026-11-22 post-deploy function log query returned no function entries for the inspected window.
- No Admin UI integration, deployment, preview, invitation, menu seed or publication has been performed by this slice.
- Vercel account currently connected to ChatGPT is the separate HFP workspace `fahad-7455`. It contains HFP projects only. Do not deploy Flame Chick or alter HFP deployments there. Reauthorize the original Flame Chick Vercel workspace before any Flame Chick Vercel action.

## Next gates

1. Observe and pass the new GitHub Actions contract test workflow.
2. Perform a full local Supabase Functions/Deno type check and a request-level test with mocked PostgREST responses.
3. Review the exact Staff Admin function diff against deployed v1, then deploy the expanded function only after QA passes.
4. Exercise a read-only catalog draft read using the existing Admin session from the Admin origin; verify Manager/Cashier/Rider and wrong-origin denials without writing rows or sending invitations.
5. Integrate the disabled Admin catalog UI with these actions, remove or quarantine old direct REST CRUD flows, and retain publish/rollback controls disabled until Website DTO compatibility is resolved.
6. Keep all menu seeding and publication, Website cutover, POS/Rider deployment and Vercel changes behind separate explicit gates.

No Supabase migration, production data write, secret change, Auth setting, Edge Function deployment, Vercel deployment, project transfer or deletion, domain/alias change, Website cutover or menu publication was performed during this implementation slice.
