# Flame Chick Admin authentication deployment configuration

Status: configuration contract prepared; no secret-bearing deployment performed.

## Canonical application origins

- Admin: https://flamechicadmin.vercel.app
- Customer Website: https://flamechick.vercel.app
- Rider portal: https://flamechicrider.vercel.app

Only the Admin origin is allowed to call the Staff Admin Edge Function from a browser. Website and Rider origins must be denied. Do not add preview wildcard origins or the old legacy Admin host.

## Supabase Auth URL configuration

Set the Auth Site URL to:

`https://flamechicadmin.vercel.app`

Add this exact redirect URL:

`https://flamechicadmin.vercel.app/accept-invitation.html`

Keep the allowlist minimal. Add local loopback URLs only during an explicitly scoped local development session, then remove them before launch. Do not add `*.vercel.app`, Website, Rider, or unrelated preview URLs.

## Staff Admin Edge Function secrets

Configure these as Supabase Edge Function secrets (server-side only):

- `FLAME_CHICK_STAFF_ADMIN_ALLOWED_ORIGINS=https://flamechicadmin.vercel.app`
- `FLAME_CHICK_STAFF_INVITE_REDIRECT_URL=https://flamechicadmin.vercel.app/accept-invitation.html`
- Supabase project URL and publishable key through the platform-provided function environment.
- Supabase secret key through the platform-provided server-side secret environment only.

Never put a Supabase secret/service-role key in Vercel client-visible variables, HTML, JavaScript, GitHub, or URL parameters. The browser must use only the publishable key and the signed-in user's JWT.

## Required verification before deployment

1. Confirm the three Vercel hostnames are attached to the intended new projects and HTTPS is active.
2. Configure the Auth Site URL and exact redirect allowlist above.
3. Configure the Edge Function secrets above, using the current Supabase secret-key format supported by the project.
4. Deploy `flame-chick-staff-admin` with JWT verification enabled.
5. Verify the Admin origin succeeds; Website, Rider, legacy Admin, preview and arbitrary origins receive no CORS allow-origin header and cannot invoke browser requests.
6. Verify invite redirects only to the exact Admin acceptance page.
7. Test Admin and Owner allow paths; Manager, Cashier, Rider, anonymous, expired-session and forged-role denial paths.
8. Test invitation acceptance, existing-account acceptance, retry-finalize, duplicate request idempotency and recovery from Auth/database partial failure.
9. Confirm all non-Staff Admin modules remain disabled until their secure command APIs replace legacy direct REST/storage operations.

## Current blocker

The project has no deployed Edge Functions. Available project controls in this work session do not expose Supabase Auth URL configuration or Edge Function secret-management operations. Do not deploy a function with missing configuration: its current implementation deliberately fails closed when origin configuration is absent, and invitation commands require the server-only secret. Complete the platform dashboard configuration before deployment. No plan upgrade is required for this step.

## Security note

Admin/Owner authorization is enforced by the Staff Admin database command and must remain authoritative. CORS is browser isolation, not authentication. Hiding the Admin URL or UI is not an access control. Passwords must be unique and stored in a password manager; require MFA for Admin and Owner when available. Supabase leaked-password screening is a Pro-tier feature, so the Free plan does not provide that built-in check.
