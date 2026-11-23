# Flame Chick — Two-hour release readiness checkpoint

**Date:** 2026-11-23  
**Branch:** `work/production-source-audit`  
**Repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Production project:** `adkrxfnawdiljhjaavnj` — Mumbai `ap-south-1`  
**Status:** Source integration improved; full operational deployment is **NO-GO** until the backend and release prerequisites below are implemented.

## User correction

The POS and Rider apps are existing, substantial apps. They are not being rebuilt. The current sprint is correcting API configuration, access and data paths, then applying small targeted UI fixes. Existing local-first cashier workflow, offline queues, Rider portal workflow and UI are to be preserved.

## Source changes on the working branch

### Staff identity / branch authorization

- Production uses `public.user_roles.role_key`, not a `role` column. The Order and Delivery API lookups now use `role_key`.
- POS obtains its own role/branch context from authenticated `flame-chick-order-api?view=staff_context`; the browser no longer directly reads `user_roles`.
- Rider obtains its active profile from authenticated `flame-chick-delivery-api?view=profile`; invitation completion checks role context through the Order API. The browser no longer directly reads `user_roles` or `rider_profiles`.
- Rider access is rejected when the Rider account has no unique active branch. The current Rider UI has no branch selector, so the server does not guess.
- POS role gate is Admin, Owner, Manager and Cashier. The unsupported `kitchen` role was removed from its client gate.
- Order API staff-context is checked after JWT verification and before POS-only order-board authorization so Rider self-context can work without granting Rider access to the POS board.
- POS order list, order history, canonical status readback and dispatch data now use authenticated Edge APIs rather than direct PostgREST table queries. The browser-side direct REST/RPC helper functions were removed.
- Delivery dispatch reads resolve the caller's branch server-side and use service-side reads under that branch; a caller-supplied branch mismatch is rejected.
- Delivery profile, role and presence checks use `role_key` and server-side profile reads.
- POS rider reassignment now uses the delivery API's `assign` action rather than an old direct legacy RPC.
- Order API board reads use service-side reads after verifying the signed-in staff role and deriving the branch. They accept bounded optional order ID/source filters for history/status readback.
- POS and Website delivery order payloads now send explicit `selection_type: listed_area | not_listed`, and send no client-authoritative delivery fee or display area name. The branch-owned fee remains server/database-resolved under the approved delivery-pricing contract.

These changes preserve the intended deny-by-default RLS design. They do not add browser table policies or expose a service key.

### Deployment workflow target corrections

The four preview workflows now point to the verified Vercel team and projects:

| App | Vercel project | Project ID |
|---|---|---|
| Website | `flame-chick-website-production` | `prj_izBWyrFmPZIm63FHAT4jaLHUTLzu` |
| Admin | `flame-chick-admin-production` | `prj_kPEqsepRzivOJhNeA32Io3netjav` |
| POS | `flame-chick-pos-production` | `prj_gh1UnkZKnFnehWEs5eYhiXa40Xj5` |
| Rider | `flame-chick-rider-production` | `prj_U3djCTfZK0Ubl808umChQn7MPPNg` |

Vercel team: `fahad-7455` / `team_Rpf9jeGg9r3cmMguFXHtziqz`. The Git-linked repo owner is `itsfahadahmed1234-creator`.

Preview workflows remain fail-closed. They require the `flame-chick-preview` GitHub Environment, protected `VERCEL_TOKEN` secret, and app-specific `FLAME_CHICK_*_PREVIEW_DEPLOY_ENABLED=true` repository variable. Those GitHub secrets/variables are not configured through the available connector. Preview workflows were therefore skipped, not deployed. Project details show no deployment history, no custom domains, and SSO protection enabled. Vercel project environment listings were empty. A root-directory update was requested, but the available project-summary response does not expose the setting for independent verification; the workflow commands deploy from their app working directories.

## Current verification

Latest successful checks on this working branch:

- POS and Rider Static Checks #14: passed, including API-only reads and explicit delivery-selection payload assertions — [run](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45148072360)
- Website Static Checks #142: passed, including explicit delivery-selection/fee-trust assertions and inline-script parsing — [run](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45148044799)
- Admin Static Checks #81: passed — [run](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45147902896)
- Edge Function Static Checks #39: passed — [run](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45147768536)

The POS/Rider static suite checks source hygiene and inline JavaScript syntax. Admin static checks also parse POS/Rider inline scripts. Edge checks parse the Edge Function TypeScript and assert the staff/Rider/dispatch API contracts. These are static/source checks, not live endpoint or browser sign-in tests.

## Read-only Production facts verified in this checkpoint

- Project is `ACTIVE_HEALTHY`, PostgreSQL 17.12, Mumbai.
- 24 migrations are applied through `20261122105821`.
- One active Flame Chick restaurant and one active Main branch exist.
- Website ordering, delivery and pickup flags are all `false`.
- Catalog tables exist but category/product/variant/deal/publication/current-publication row counts are all zero.
- The following required operational tables are **absent**: `orders`, `order_items`, `order_status_history`, `payments`, `delivery_tasks`, `delivery_task_offers`, `delivery_assignments`, `delivery_task_events`, `rider_profiles`, `rider_push_subscriptions`, `delivery_areas`.
- No tables are in `supabase_realtime`; no Storage buckets exist.
- Only `flame-chick-staff-admin` is deployed, and it is version 1. Its deployed source predates the current Catalog V3 command implementation.
- The current database function inventory contains catalog/staff functions, but no `flame_chick_create_order`, `flame_chick_update_order_status`, `flame_chick_check_website_order_rate_limit`, `flame_chick_manage_delivery`, `flame_chick_accept_delivery_offer` or `flame_chick_decline_delivery_offer` operational RPCs.
- Security Advisor has 33 intentional RLS-enabled/no-policy informational notices and a warning for disabled leaked-password protection. Do not resolve the informational notices by adding broad table policies.

## Hard blockers to a working release

1. **Operational database/API contract is missing.** The existing order and delivery Edge Function source references order, payment, delivery, rider tables and RPCs that are not present in Production. The source endpoints cannot operate correctly against the current database.
2. **Catalog functions are not deployed.** `flame-chick-catalog` and the current Catalog V3-enabled Staff Admin function are not live. The currently deployed Staff Admin function is version 1, not the latest source.
3. **Catalog is empty and unpublished.** The authoritative menu draft has not been imported to Production or validated/published.
4. **Delivery pricing and branch delivery configuration are not set up.** No delivery areas/default fee tables exist; the confirmed contract requires server-side fee resolution and immutable order snapshots.
5. **Storage and Realtime are not configured.** There are no media buckets or Realtime tables for the apps' live updates; polling must remain the fallback until the correct tables are approved and published.
6. **Staff context and Auth need a live end-to-end check.** The source is aligned, but no new-user/existing-user browser sign-in, role isolation or invitation acceptance test has run against the current app deployment.
7. **Preview release credentials/gates are missing.** The four Vercel projects have no deployments/domains yet; GitHub Environment secret/variables are not available to configure through the current connector.
8. **The customer website security audit remains a hard pre-checkout gate.** It was explicitly deferred until immediately before database cutover and must now be completed before enabling customer ordering.

## Safe next implementation sequence

1. Reconcile and implement an additive Production operations migration set against the current restaurant/branch/staff/catalog schemas. Do not copy the old Demo/HFP baseline wholesale. Implement the tables, composite FKs, RLS/no-direct-client access, audit/idempotency rules and transactional order/delivery RPCs from the approved architecture contracts.
2. Test migration replay, constraints, authorization, idempotency, stale/offline orders, pricing and delivery lifecycle against disposable local PostgreSQL/Supabase first.
3. Align Edge Function payloads/RPC names to the actual new migration contracts; add live integration tests for website create order, POS queue/status, Rider accept/reject/pickup/deliver/return, and Manager/Cashier return-confirmation boundaries.
4. Deploy the Catalog public-read function and updated Staff Admin function only after secret/CORS/Auth settings are verified. Import the authoritative published menu into draft, validate it, and explicitly review before publication.
5. Configure Storage media, Realtime publication, Auth protections, allowed origins, Rider push secrets and branch delivery pricing.
6. Complete website threat-model/security audit and POS/Rider live browser E2E. Only then enable the ordering flags and customer checkout.
7. Configure protected Vercel preview credentials and verify all four app previews. Production deployment/custom domains require separate release approval.

## Release boundary

No Production migrations, seed/import, catalog publication, order data, Edge Function deployment, Auth/Storage/Realtime change, Vercel deployment, custom domain, checkout enablement or paid-plan upgrade was performed during this checkpoint. Only source and documentation files were committed to `work/production-source-audit`; `main` remains untouched. GST/tax remains deferred. Future selectable deal products/flavours and +price upgrades remain deferred; current deal components remain INCLUDED/zero-surcharge.
