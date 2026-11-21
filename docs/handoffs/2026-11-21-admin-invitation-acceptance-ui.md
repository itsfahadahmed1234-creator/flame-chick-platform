# Flame Chick handoff — Admin staff invitation acceptance UI

Date: 2026-11-21
Repository: `itsfahadahmed1234-creator/flame-chick-platform`
Branch: `work/production-source-audit`
Source commit: `0eac38d99286f289f188ef8130e6fe74e15dddd2`
Supabase Production: `adkrxfnawdiljhjaavnj` (Mumbai, Free)

## Implemented

- `apps/flame-chick-admin/accept-invitation.html`
- `apps/flame-chick-admin/accept-invitation.js`
- Admin sign-in link to the invitation acceptance page.
- Staff invite dialog guidance and existing-account message updated.
- Admin app README and deployment guide updated.
- Admin static CI workflow added at `.github/workflows/ci-admin-static.yml`.

## Acceptance behavior

New-user path:
1. Supabase Auth invite redirects to `/accept-invitation.html`.
2. Page reads access/refresh tokens from the redirect fragment and immediately removes the token-bearing fragment from browser history.
3. Page calls Auth `/user` to verify the current identity and requires a confirmed email.
4. Invitee sets a password of at least 12 characters using the authenticated Auth user endpoint.
5. Page calls Staff Admin `accept_invitation` with the invitee's access token.
6. Database derives `auth.uid()`, matches exact confirmed email to the invitation, verifies expiry, inviter still active, role consistency and branch availability, then activates role and audit rows.

Existing-account path:
1. User opens the same page from Admin sign-in.
2. Signs in with the exact confirmed email and current password.
3. Page calls `accept_invitation`; the database matches the authenticated identity, not any browser-supplied user ID or email claim.

If password update succeeds but activation fails, page retains the in-memory session for a retry button. Tokens and passwords are not written to localStorage/sessionStorage by this page; URL fragment is removed.

## Static CI

` .github/workflows/ci-admin-static.yml` runs on pushes to the Admin app folder on this working branch. It checks both Admin JS files with `node --check` and verifies page/script/asset wiring. No Vercel token or Supabase secret is needed for this CI.

## Not yet completed / not claimed

- CI result has not yet been observed.
- No live Supabase Auth invite flow has been tested.
- Production still has zero restaurants, branches, Auth users and staff rows.
- Staff Admin Edge Function remains undeployed.
- Exact Admin origin and invite redirect URL are not selected/configured.
- Supabase Auth allowed redirect list has not been changed.
- No function secrets have been configured.
- No invitation emails or Auth users have been created.
- No Admin bootstrap or Vercel deployment has been performed.

## Required before live test

1. Choose the final Admin HTTPS origin.
2. Set Supabase Auth allowed redirect to the exact `https://<admin-origin>/accept-invitation.html`.
3. Set `FLAME_CHICK_STAFF_ADMIN_ALLOWED_ORIGINS` to the exact allowed Admin origin(s).
4. Set `FLAME_CHICK_STAFF_INVITE_REDIRECT_URL` to the exact acceptance URL.
5. Configure the Edge Function's publishable and secret keys using Supabase Function secrets; never commit or paste secrets into chat.
6. Deploy the Staff Admin Edge Function.
7. Perform the documented postgres-only first Admin bootstrap.
8. Test both new-user and existing-user flows, wrong-email rejection, expired invite, issuer deactivation, branch deactivation and acceptance retry/idempotency.
9. Keep Vercel preview enablement disabled until the Admin app-specific readiness review passes.

No SQL migration or production database mutation was made by this source update.

### Admin static CI verification — passed

- Workflow run: [Flame Chick Admin Static Checks #2](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44880704883).
- `node --check` passed for both `apps/flame-chick-admin/app.js` and `accept-invitation.js`.
- Static page assets, login link, acceptance page script and acceptance action checks passed.
- The first CI attempt failed only because the test asserted a literal `/auth/v1/user` string while the page correctly calls the shared `authRequest("user", "GET")` helper. The assertion was corrected and the rerun passed.
- This is static source validation only; it does not replace live Supabase Auth integration tests.

### Admin invitation acceptance CI — passed

- Workflow: [Flame Chick Admin Static Checks](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44881008259).
- Both Admin JavaScript files pass `node --check`.
- Five automated behavior tests pass: new invite/password activation, existing confirmed account acceptance, unconfirmed-email rejection, password mismatch rejection, and retry after failed activation.
- Static asset and page/script wiring checks pass.
- This validates the browser logic with mocked Auth/Edge Function responses. Live Production Auth and Edge Function integration remain untested because the function/origin/redirect are not configured and Production has no staff fixtures.
