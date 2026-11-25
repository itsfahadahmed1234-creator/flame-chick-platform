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
4. `supabase/migrations/20261125130000_flame_chick_staff_main_branch_rider_provisioning.sql`
   - Adds a private SECURITY DEFINER Rider-profile provisioning helper, owned by postgres with direct execute revoked from application roles.
   - The staff command resolves the active Main branch on the server for Manager/Cashier/Rider role assignment and invitation creation; it refuses multi-branch or non-Main choices.
   - Invitation acceptance rejects stale/multi-branch invitations and provisions the Rider profile in the same transaction as the accepted Rider role.
   - Direct Rider role assignment also provisions/reactivates the matching profile.
   - Rider deactivation is blocked while a delivery/physical return remains unresolved, and when safe it turns the Rider profile inactive/offline and stops new offers.
5. Disposable QA fixtures were aligned to the canonical `main` branch where they represent the single-branch Flame Chick tenant. Delivery QA now uses Rider profiles created by `assign_role` and only changes their disposable availability state, rather than inserting duplicate profiles.
6. `tests/staff-main-branch-rider-provisioning.test.mjs` and CI workflow checks cover the UI, Main enforcement, provisioning and deactivation source contract. `supabase/tests/batch4_staff_admin_role_boundary.sql` covers direct role assignment, non-Main rejection, automatic branchless Rider invitation, acceptance/profile creation, role access boundaries and deactivation.

## QA status at checkpoint
- Admin static checks: passed.
- The revised migration successfully replayed in disposable local Supabase.
- The Staff Admin ACL/RLS and Admin/Owner/Manager/Cashier/Rider role-boundary test passed in disposable local Supabase, including direct Rider profile creation and deactivation behaviour.
- The broader delivery test originally failed because its old fixture branch code was `qa-main`, which correctly failed the new Main-only backend guard. It was changed to `main`.
- A subsequent run passed migration replay and staff-role QA but found the delivery test still manually inserting Rider profiles after the new role command had already created them. That duplicate insert was replaced by an update/verification of the auto-created profiles.
- Final full QA is rerunning on the latest branch commit. Do not consider the broader suite passed until the run on the latest head completes successfully. Inspect and record that run before applying Production changes.

## Production / deployment status
- The new migration has **not** been applied to Production.
- No current task changes have been deployed to the Rider or Admin Vercel production aliases.
- No Production branch data, staff roles, Auth accounts, orders, payments, or delivery records were altered by this source work. The earlier one-off Rider profile repair remains the only Production data change related to this issue.
- Admin project: `prj_kPEqsepRzivOJhNeA32Io3netjav`.
- Rider project: `prj_U3djCTfZK0Ubl808umChQn7MPPNg`.
- Build/test deployments must be Preview only. Do not change production aliases or promote a deployment.
- After final disposable QA passes, apply the migration through the approved Supabase migration mechanism, verify function ACL/security advisor and the single active Main branch plus existing Rider profile, then deploy Admin and Rider previews for the user to test.
- Only after the preview test confirms the Rider portal opens and the Admin panel can create a Rider invitation should the next POS delivery rehearsal proceed. Production remains pre-launch and not cleared for real orders or payments.

## Next steps
1. Confirm latest GitHub Actions Staff Admin QA run passed complete migration replay, staff role tests, delivery tests, POS sync, website order tests, and delivery concurrency checks.
2. Run the new Node source test through CI; check any failure and repair before Production migration.
3. Apply the one migration to Production and immediately verify:
   - Exactly one active Main branch.
   - Helper/function definitions and ownership.
   - No direct helper execute for anon/authenticated/service_role.
   - Existing Fahad Rider role + profile remain active and matched.
   - Main-only branch assignment enforcement and role provisioning behaviour.
   - Security advisor findings against baseline.
4. Create Vercel Preview deployments for Admin and Rider from the latest working-branch SHA only.
5. User tests Rider sign-in and Admin invitation flow. Invitation acceptance should create the profile automatically.
6. Update this handoff with exact CI run, migration version and Preview URLs after those actions; do not claim sign-in works until user confirms.

## Guardrails
- Keep changes on `work/production-source-audit`; do not merge into main.
- Do not create another branch or switch the existing Main branch ID/code.
- Do not add Rider to the Admin account.
- Do not create additional production Auth users or test staff identities.
- Do not re-enable Realtime as a prerequisite for Rider login; the page must still load jobs when Realtime is unavailable.
- Preserve existing role separation: Admin/Owner full authority, Manager POS + return confirmation but no admin panel/delete, Cashier POS/rider assignment/cancel audit no delete, Rider only own delivery offers.
- GST stays deferred. No real customer orders/payments and no production promotion.
