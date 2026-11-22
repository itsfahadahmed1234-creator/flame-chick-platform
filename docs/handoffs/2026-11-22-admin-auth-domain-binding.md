# Handoff — Admin authentication domain binding (2026-11-22)

## Decision confirmed
The user explicitly selected:
- Admin: `https://flamechicadmin.vercel.app`
- Customer Website: `https://flamechic.vercel.app`
- Rider portal: `https://flamechicrider.vercel.app`

These are the intended production hostnames. The Staff Admin API browser-origin allowlist must contain only the Admin origin. Website, Rider, legacy Admin and arbitrary preview hosts are not allowed.

## Work completed in this stage
- Added tests pinning Staff Admin CORS to the exact Admin origin and rejecting Website/Rider/legacy/attacker origins.
- Added tests proving invitation redirect is accepted only at `https://flamechicadmin.vercel.app/accept-invitation.html`.
- Added `docs/operations/admin-auth-deployment-configuration.md` with exact Auth Site URL, redirect allowlist, Edge Function secret names, deployment gates and negative tests.
- Existing invitation acceptance page is present at `apps/flame-chick-admin/accept-invitation.html`.
- `supabase/config.toml` keeps `verify_jwt = true` for `flame-chick-staff-admin`.

## Current limitation / no false completion
The Supabase project has zero deployed Edge Functions. Current tool access does not expose Supabase Auth URL configuration or Edge Function secret-management operations. Therefore the exact Auth settings and secrets were not configured, and the Staff Admin function was not deployed. The function intentionally fails closed without exact origin config and server-side secret. No dummy secret, client-exposed secret, or insecure fallback was introduced.

## Required next actions
1. In Supabase Auth URL Configuration, set Site URL to `https://flamechicadmin.vercel.app`; allow only the exact invitation callback plus approved local loopback URLs for development.
2. Set Edge Function secrets:
   - `FLAME_CHICK_STAFF_ADMIN_ALLOWED_ORIGINS=https://flamechicadmin.vercel.app`
   - `FLAME_CHICK_STAFF_INVITE_REDIRECT_URL=https://flamechicadmin.vercel.app/accept-invitation.html`
   - platform-provided Supabase URL/publishable key and server-side secret key; secret key must never be exposed to browser/Vercel public env.
3. Deploy Staff Admin with JWT verification enabled.
4. Run Admin/Owner success tests; Manager/Cashier/Rider/anonymous/expired JWT/forged-role denial; invite accept, retry-finalize, idempotency and partial-failure recovery tests.
5. Deploy protected Admin preview only after function/auth setup; keep all non-Staff modules disabled until secure APIs replace legacy direct REST/storage operations.

## Unchanged
No Supabase Auth setting, Edge Function deployment, secret, Vercel deployment, DNS/alias, production data, Owner account, or menu publication changed in this stage. Flame Chick remains in production-build phase, not live.
