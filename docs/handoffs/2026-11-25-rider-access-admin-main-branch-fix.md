# Rider access and Admin staff provisioning — Main branch simplification
**Date:** 2026-11-25 (Asia/Karachi)  
**Repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Branch:** `work/production-source-audit`  
**Supabase Production:** `adkrxfnawdiljhjaavnj` (Mumbai, Free)  
**Vercel team:** `team_Rpf9jeGg9r3cmMguFXHtziqz`

## User request
The Rider portal was still inaccessible. The user asked to simplify Admin role creation and remove branch selection because only the Main branch exists. The intended model for this stage is:
- Admin and Owner remain restaurant-wide roles.
- Manager, Cashier and Rider use the one active Main branch automatically.
- The Admin interface has no branch multi-select and no manual audit-reason input for routine invitation creation.
- Backend validation, not just the browser, must reject any operational branch other than Main.

## Production facts before this code change
- Current Production snapshot (read-only, 2026-11-25): 11 orders, 3 delivery tasks, and 0 delivery tasks in accepted/out_for_delivery/failed state. Do not describe the Production database as empty; preserve all current data.
- Production currently has exactly one active branch: Main (`branch_code='main'`, id `84b1b6dc-4fd1-45fa-8d9b-23d203b36cfd`).
- Fahad's Rider account is `bc80d848-382b-4a2e-a325-70d2e60e5d03` with an active Rider role on Main.
- A previous one-time production data repair created the missing Rider profile `R-BC80D848` for that same account. It is active, initially Offline, accepts jobs, and matches the Main branch. No Auth user or role was created by that repair.
- Auth logs show the user's password sign-in succeeded and the Rider profile endpoint returned 200. No subsequent `?view=rider` jobs request appeared. This pointed to the Rider app waiting for Realtime initialization before its first job load.

## Source changes on the working branch
1. `apps/flame-chick-admin/index.html`
   - Removed the staff branch multi-select and manual access-reason field.
   - Replaced them with a visible "Main (automatic)" scope note.
   - Clarified that Admin/Owner are restaurant-wide and operational roles go to Main.
2. `apps/flame-chick-admin/app.js`
   - Removed branch-scope/add-branch action controls.
   - The invite form resolves the active `branch_code='main'` server-visible branch automatically.
   - The UI refuses to send an operational invitation unless exactly one active Main branch is present.
   - A fixed routine audit reason is sent by the Admin invite form.
3. `apps/flame-chick-rider/index.html`
   - Realtime initialization no longer blocks the first jobs request. It starts in the background; `loadJobs(true)` proceeds independently. If Realtime fails, a visible/manual-refresh path remains.
4. `supabase/migrations/20261125083051_flame_chick_staff_main_branch_rider_provisioning.sql`
   - Adds a private SECURITY DEFINER Rider-profile provisioning helper, owned by postgres with direct execute revoked from application roles.
   - The staff command resolves the active Main branch on the server for Manager/Cashier/Rider role assignment and invitation creation; it refuses multi-branch or non-Main choices.
   - Invitation acceptance rejects stale/multi-branch invitations and provisions the Rider profile in the same transaction as the accepted Rider role.
   - Direct Rider role assignment also provisions/reactivates the matching profile.
   - Rider deactivation is blocked while a delivery/physical return remains unresolved, and when safe it turns the Rider profile inactive/offline and stops new offers.
5. Disposable QA fixtures were aligned to the canonical `main` branch where they represent the single-branch Flame Chick tenant. Delivery QA now uses Rider profiles created by `assign_role` and only changes their disposable availability state, rather than inserting duplicate profiles.
6. `tests/staff-main-branch-rider-provisioning.test.mjs` and CI workflow checks cover the UI, Main enforcement, provisioning and deactivation source contract. `supabase/tests/batch4_staff_admin_role_boundary.sql` covers direct role assignment, non-Main rejection, automatic branchless Rider invitation, acceptance/profile creation, role access boundaries and deactivation.

## QA status — complete
- **Full disposable Supabase QA passed** on commit `f8fb97df51464cc122ad56aa10d9e22a6f61632b`, GitHub Actions run `45575145392` (completed successfully).
- Complete migration replay passed.
- Staff Admin ACL/RLS, Admin/Owner/operational role boundaries, branchless Main invitation creation, invitation acceptance, direct Rider assignment/profile provisioning, non-Main rejection, and Rider deactivation lifecycle passed.
- Delivery offer, pickup, delivery and return commands passed.
- Unified POS sync for Dine-in, Takeaway, Delivery and payment idempotency passed.
- Website order/idempotency/phone-quota checks and the local Website Order API/PostgREST integration passed.
- Rider Web Push fail-closed check passed.
- All six concurrency races passed: four delivery accept/decline/expiry scenarios and two payment collection retry/over-collection scenarios.
- Admin static checks run `45573782354` also passed on commit `d7cf4800f9e1350bacdc51c09428d4a0f9df3de9`; that commit included the new `tests/staff-main-branch-rider-provisioning.test.mjs` source-contract tests and app/browser script parse checks.

## Production / deployment status — Realtime enabled; all three apps routed to Production
### Database
- Staff provisioning migration `20261125083051_flame_chick_staff_main_branch_rider_provisioning` remains applied.
- **Private Realtime migration applied successfully:** `20261125092751_flame_chick_private_ops_realtime_broadcasts`.
- Post-apply verification:
  - 1 active branch, Main; existing Fahad Rider role/profile both still active.
  - Existing business data preserved: 11 orders, 3 delivery tasks, 0 unresolved accepted/out-for-delivery/failed tasks.
  - 5 active Realtime trigger bindings are present: orders, delivery_tasks, delivery_task_offers, delivery_assignments, rider_profiles.
  - 1 private-channel SELECT policy is present on `realtime.messages`.
  - Topic authorization helper exists; EXECUTE is granted to authenticated only, not anon or service_role.
  - No broad `supabase_realtime` Postgres Changes publication was enabled. Private Broadcast messages contain record IDs and branch/delivery identifiers only, not customer or rider names, phone numbers or addresses.
- Authorization model:
  - POS topic `fc:branch:<branch UUID>:pos`: active restaurant Admin/Owner and active Manager/Cashier on that exact branch.
  - Rider topic `fc:rider:<auth.uid()>:ops`: only the active Rider account's own user-bound topic and active Rider profile.
  - Riders cannot read POS branch topics or other riders' private topics.
- Security Advisor remains at the previous baseline of 51 INFO `rls_enabled_no_policy` notices and the existing Auth leaked-password warning. This release did not resolve those pre-existing findings.

### Application implementation
- POS listens to private branch Broadcast events `orders_changed` and `delivery_changed`; it refreshes authorized inbox/dispatch data after events and after reconnect. A 30-second poll fallback is used while Realtime is unavailable and a slower 120-second reconcile remains while connected.
- Rider listens to a private Broadcast channel for `delivery_changed` on its own user topic. It reloads jobs through the authenticated Delivery API; it does not treat event payloads as source data.
- Rider Realtime does not block initial sign-in or first jobs loading. It remains connected when the Rider is Busy or Offline so currently assigned work still receives updates; the availability preference controls new offers/presence, not status visibility. A 30-second automatic refresh fallback is retained when disconnected.
- Realtime notification errors are non-fatal to business writes; orders and delivery commands are never rolled back merely because a broadcast is unavailable.

### Validation
- Full disposable Staff Admin / Realtime / delivery / POS / website / concurrency QA passed on commit `c41e9e01417d54276e3f96d09e5117660c8f05dc`, Actions run `45583412377`. The expanded tests checked branch POS-topic visibility, own-Rider topic visibility, rejection of cross-Rider and Rider-to-POS access, and absence of profile/customer PII in broadcast payloads.
- POS/Rider static checks passed on commit `878a4e71a37f6088fb47f0442424586b24b5ea4e`, run `45584213000`, including Rider Busy/Offline socket continuity.
- Admin static checks passed on commit `79b9a49f91613d46024da7134d0ae530c22c7d45`, run `45584204475`.
- Final POS/Rider static checks including the exact Production migration filename reference passed on commit `9c4865204c673ab156b07e8a89e680082650577b`, run `45586021243`.
- Final Staff Admin / Realtime / delivery / POS / website / concurrency QA passed on final filename-aligned release commit `6cff4a250abb1bdeb59fb4bedd90f28e6915210d`, run `45586028686`.
- Catalog publication validation QA passed on that same final commit, run `45586028742`; Catalog V3 menu importer QA also passed on that commit, run `45586028129`.
- Runtime error-cluster queries returned no error clusters for Admin, POS or Rider after routing. Runtime logs had no entries in the short query interval, so actual browser event reception still requires live user verification.

### Production deployments and domain routing
All three applications were built READY from the same final source commit `6cff4a250abb1bdeb59fb4bedd90f28e6915210d` and the existing project Production domains have now been reassigned to those deployments:

- **Admin:** https://flamechicadmin.vercel.app/  
  Deployment `dpl_HhALuZw9UXTercZEN3mN44JSUDUe` — READY.
- **POS:** https://flamechicpos.vercel.app/  
  Deployment `dpl_4QFxTS5gYsN8nei5iW8KCw5Ye8Us` — READY.
- **Rider:** https://flamechickrider.vercel.app/  
  Deployment `dpl_2XDw6cQ4RJReYAE1SpkBUsjhC79y` — READY.

The Vercel promote endpoint returned 422 for these manually created deployments. The existing verified custom domain aliases were then directly reassigned to the corresponding Ready deployment IDs, and read-after-write verification confirmed each domain now maps to the new deployment. Do not characterize the API promotion request itself as successful; live domain routing was confirmed through the alias mappings.
- Production domains are live routes to these new app builds; Vercel deployment metadata continues to show `target=null` because the deploys were created as manual deployments. The aliases, not the target field, are the verification of domain routing.
- No additional Vercel projects were created. Only the three existing application domain aliases were reassigned.
- Vercel runtime error queries for all three projects returned no error clusters in the post-deployment window. Runtime event logs returned no entries for the requested window; therefore this is not proof that users have actively exercised Realtime.
- User sign-in and live event reception have not yet been confirmed in the browser. Require an actual POS/Rider session and one real, controlled state change before claiming end-to-end Realtime is observed.
- Production remains pre-launch: do not place real customer orders, collect payments, or represent the platform as cleared for restaurant operations.

## Next steps — user verification
1. Hard-refresh and sign in to Admin at `https://flamechicadmin.vercel.app/`.
2. Sign in to POS at `https://flamechicpos.vercel.app/`; confirm the live status label reports Realtime connected and the online orders/dispatch refresh automatically.
3. Sign in to Rider at `https://flamechickrider.vercel.app/` using the existing Fahad Rider account. Confirm the delivery dashboard opens. Keep its availability Offline at first; then confirm its own assigned status refreshes without opening another rider's data.
4. Perform only a controlled pre-launch test using a clearly identified test workflow/account, not a real customer order or payment. Verify a POS-visible delivery assignment reaches Rider and a rider state change refreshes POS. Do not invent or create test orders without confirmation of the agreed rehearsal.
5. If a production domain is inaccessible, report the exact URL and screen/error before changing SSO, project protection, or aliases again.


## Guardrails
- Keep changes on `work/production-source-audit`; do not merge into main.
- Do not create another branch or switch the existing Main branch ID/code.
- Do not add Rider to the Admin account.
- Do not create additional production Auth users or test staff identities.
- Do not re-enable Realtime as a prerequisite for Rider login; the page must still load jobs when Realtime is unavailable.
- Preserve existing role separation: Admin/Owner full authority, Manager POS + return confirmation but no admin panel/delete, Cashier POS/rider assignment/cancel audit no delete, Rider only own delivery offers.
- GST stays deferred. No real customer orders/payments and no production promotion.

## Manual browser verification and controlled Realtime rehearsal — 2026-11-25

**Status:** User-confirmed browser checks and a controlled Production rehearsal completed. Flame Chick remains **pre-launch**; this is not launch authorization.

### Browser verification
- Admin: user confirmed sign-in succeeds and the Staff & Riders page is reachable.
- POS: user confirmed sign-in, Online Orders board and delivery dispatch section load. POS status displayed **“Realtime active · event-driven updates”**. A Rider appeared online.
- Rider: user confirmed the existing Fahad Rider account signs in and the dashboard loads. Profile shown as `fahad`, Rider code `R-BC80D848`, availability “Available for delivery”, status **“Live updates”**, with no active delivery before the rehearsal.
- During the controlled delivery flow, the user confirmed that Realtime updates were happening between the POS and Rider screens. This is a user-observed Production browser round trip, not merely a static/CI test.

### Identified Production rehearsal record
The user did not remember the order number but supplied the event window of approximately **15:20–15:30 Asia/Karachi**. A narrow read-only audit of that time window identified the matching order:

- Order: `FC-261125-0003`
- Source / fulfilment: `pos` / `delivery`
- Rider: existing Fahad account, `R-BC80D848`
- Delivery event times (Asia/Karachi):
  - 15:26:43 — dispatch offer created
  - 15:26:50 — Fahad accepted
  - 15:26:56 — Fahad picked up; task moved to `out_for_delivery`
  - 15:27:08 — Fahad marked delivered
- Final order/task: `completed` / `delivered`
- Payment audit: one successful `collection` entry, method `cash`, amount **PKR 599.00**, recorded at 15:27:32; balance due `0.00`; order payment state `paid`.
- The collection entry is attributed in the database to the signed-in Admin actor. This verifies what the application recorded; it does not independently verify physical cash movement.
- The assignment is terminal (`delivered`, `is_current=false`), so it no longer appears as an active Rider delivery. This is expected after completion.
- The task had an earlier offer/decline attempt at approximately 14:07 PKT before the later offer accepted by Fahad. No additional staff identity details are stored here.

### Evidence handling and safeguards
- Evidence came from read-only queries against `delivery_task_events`, `delivery_assignments`, `delivery_tasks`, `orders`, and `payments`; no production rows were modified.
- Only the narrow user-supplied 15:20–15:30 PKT window and the matched order's audit rows were inspected. No broad log ingestion/export was run.
- This handoff preserves the sanitized operational timeline so the event evidence is not repeatedly queried. Customer name, phone, delivery address, auth tokens, and staff UUIDs are intentionally omitted.
- Do not delete, refund, edit, or reclassify the rehearsal order without a separate approved accounting decision. It is a completed paid test record in Production and may appear in sales/payment reports.
- No new Auth user, role, branch, migration, deployment, alias, or schema change was made.

### Remaining pre-launch gates
- The observed POS↔Fahad Realtime round trip is confirmed by the user's browser report. Cross-Rider isolation has been verified in disposable QA and is enforced by the private user-bound topic policy; a second live Rider account was not created for manual testing.
- Keep Production marked **pre-launch** until the complete remaining manual rehearsal covers the required operational permissions and edge cases, with an explicit test plan and accounting treatment for future test transactions.
- Do not create further production test orders or payments merely to repeat the already-observed Realtime round trip.
- GST remains deferred; Free plan and single Main branch remain unchanged.

