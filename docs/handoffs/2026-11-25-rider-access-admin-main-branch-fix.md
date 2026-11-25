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

## Production / deployment status — migration applied, access fixes deployed to Preview
- Database migration `20261125083051_flame_chick_staff_main_branch_rider_provisioning` remains applied and verified in Production.
- Staff Admin Edge Function was redeployed as **version 5**, with `verify_jwt=true`. The deployed `origin-policy.mjs` matches the branch source and explicitly permits the current Admin Preview host `https://flame-chick-admin-production-q58bg0vac-fahad-7455.vercel.app`. The allowlist remains exact-origin only; no wildcard was added.
- Browser reproduction on 2026-11-25 established two separate issues:
  - Admin Preview showed `Failed to fetch`; the current exact preview origin was absent from the Staff Admin CORS allowlist. Supabase logs recorded Staff Admin OPTIONS `403` from the previous preview host before the allowlist fix.
  - Rider Preview displayed `pending is not defined`; `renderRiderAvailability()` referenced an undefined variable twice during session activation.
- Rider source fix removed those two references. New regression coverage asserts the availability renderer has no stale `pending` reference.
- CORS regression test now asserts the current Admin Preview host is in the exact allowlist and that unrelated origins remain blocked.
- Admin static checks passed on final fix commit `fcc7303a7f6927bc0db0cb7d45e88775fb3fd50d`, GitHub Actions run `45580020169`.
- Rider static checks passed on commit `77f97121902f8c795fa75d693ea669efd9859dd9`, run `45579910423`; Staff Admin role-boundary QA also passed on that commit, run `45579910453`.
- **Corrected Admin Preview alias:** [Open Admin Preview](https://flame-chick-admin-production-git-work-product-0d7cc4-fahad-7455.vercel.app/)  
  Current deployment: `dpl_5itZsXDNyDKrMr7iW25m87CByc9D`, READY, source commit `fcc7303a7f6927bc0db0cb7d45e88775fb3fd50d`.
- **Corrected Rider Preview alias:** [Open Rider Preview](https://flame-chick-rider-production-git-work-product-076807-fahad-7455.vercel.app/)  
  Current deployment: `dpl_2Nw8Je29X2je3cxcogc3119NazA9`, READY, source commit `fcc7303a7f6927bc0db0cb7d45e88775fb3fd50d`.
- Both aliases resolve to the corrected Preview deployments. Vercel project Production domains remain unchanged:
  - Admin `flamechicadmin.vercel.app` still points to the prior deployment `dpl_48CK9TiY468Tyvhc6zzMmxbDFWcd`.
  - Rider `flamechickrider.vercel.app` still points to the prior deployment `dpl_AoAJvNZQLsBamhBGNWEspcvv3hRU`.
- No Production alias was changed and no deployment was promoted. Actual user sign-in after this correction is still pending.

## Next steps — user verification
1. Open the corrected Admin Preview alias above in a new tab, or hard-refresh it. Sign in with the existing Admin/Owner account and confirm the Staff & Riders page loads.
2. Open the corrected Rider Preview alias above in a new tab, or hard-refresh it. Sign in with the existing Fahad Rider account and confirm the dashboard loads.
3. Do not create another Auth account or assign Rider to the Admin account. Use the existing separate identities.
4. Once both app checks pass, resume the controlled POS delivery rehearsal. No real customer orders/payments or Production promotion are authorized.
5. Record the actual browser test result before moving forward.


## Guardrails
- Keep changes on `work/production-source-audit`; do not merge into main.
- Do not create another branch or switch the existing Main branch ID/code.
- Do not add Rider to the Admin account.
- Do not create additional production Auth users or test staff identities.
- Do not re-enable Realtime as a prerequisite for Rider login; the page must still load jobs when Realtime is unavailable.
- Preserve existing role separation: Admin/Owner full authority, Manager POS + return confirmation but no admin panel/delete, Cashier POS/rider assignment/cancel audit no delete, Rider only own delivery offers.
- GST stays deferred. No real customer orders/payments and no production promotion.
