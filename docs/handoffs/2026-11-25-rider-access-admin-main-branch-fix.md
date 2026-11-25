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

## Production / deployment status — migration applied, previews ready
- **Production migration applied successfully:** `20261125083051_flame_chick_staff_main_branch_rider_provisioning`.
- Remote ledger confirms the exact version and name. Source migration filename matches the recorded Production version.
- Live post-apply verification:
  - Exactly one active branch, Main (`84b1b6dc-4fd1-45fa-8d9b-23d203b36cfd`).
  - Fahad’s existing Rider role remains active.
  - Fahad’s existing Rider profile remains active and matched to Main.
  - New helper exists, is owned by postgres, SECURITY DEFINER, has an empty search_path, and is not executable by anon/authenticated/service_role.
  - Existing business records were not rewritten. Production contained 11 orders and 3 delivery tasks before this migration; preserve all.
  - Security Advisor remains at its prior baseline of 51 INFO `rls_enabled_no_policy` notices and the existing Auth leaked-password-protection warning. This migration did not resolve those findings.
- **Admin Preview:** [Open Admin Preview](https://flame-chick-admin-production-q58bg0vac-fahad-7455.vercel.app/)  
  Deployment: `dpl_7gmNMV1pV2BYXfJJ2Z8h6mjQmvij`, state READY, commit `73da3989d788e503a13f2602e397f676174d3fbc`.
- **Rider Preview:** [Open Rider Preview](https://flame-chick-rider-production-3gs08q1vn-fahad-7455.vercel.app/)  
  Deployment: `dpl_31mGYpGkAvCovuR29Bh33uC9kMKH`, state READY, commit `73da3989d788e503a13f2602e397f676174d3fbc`.
- Both Vercel deployments use the existing Admin/Rider projects and are Preview deployments (`target=null)); no Production aliases were assigned, no deployment was promoted, and existing project production domains remain unchanged.
- Both projects have Vercel SSO protection enabled for deployments other than custom domains. The user may need to authenticate with a Vercel account/team member who has access before opening a Preview link. Do not disable deployment protection unless separately approved.
- Vercel reports both builds completed and READY. The current environment could not fetch either preview page directly, so visual browser sign-in and actual Rider portal entry remain unverified pending the user's test.
- The new migration is applied, but Production is still pre-launch. Do not accept live orders/payments or promote these Preview deployments.

## Next steps — user verification
1. Open the Admin Preview and sign in. Confirm Staff & Riders no longer has branch selection, and the invitation form shows Main (automatic).
2. Open the Rider Preview and sign in using the existing Fahad Rider account. Confirm it reaches the Rider dashboard and loads jobs. If a Vercel SSO gate appears first, authenticate with an account that has access to the Vercel team/project.
3. Do not create another Fahad/Auth account or assign Rider to the Admin account. Use the existing Rider identity.
4. Once both app checks pass, resume the POS delivery rehearsal and verify Rider offer visibility/acceptance and delivery status. No real customer order is authorized.
5. Record the user's test result in this handoff before proceeding to the next release checkpoint.

## Guardrails
- Keep changes on `work/production-source-audit`; do not merge into main.
- Do not create another branch or switch the existing Main branch ID/code.
- Do not add Rider to the Admin account.
- Do not create additional production Auth users or test staff identities.
- Do not re-enable Realtime as a prerequisite for Rider login; the page must still load jobs when Realtime is unavailable.
- Preserve existing role separation: Admin/Owner full authority, Manager POS + return confirmation but no admin panel/delete, Cashier POS/rider assignment/cancel audit no delete, Rider only own delivery offers.
- GST stays deferred. No real customer orders/payments and no production promotion.
