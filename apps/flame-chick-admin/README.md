# Flame Chick Admin

Static administration app.

## Current continuation — 2026-11-28

The next Admin work is Catalog V3 authoring and secure image/media management. Read `docs/handoffs/2026-11-28-admin-catalog-and-media-continuation.md` from the repository root before editing or enabling Admin modules.

Ownership clarification: the Website work was being handled with the user in the prior conversation; the separate concurrent chat owns POS and Supabase Edge Function/backend optimization. This Admin task must not interfere with Website, POS or Rider deployments.

Mandatory resource boundary: the specific Supabase log query exceeded 102 GB and must not be repeated; Log Ingestion usage was separately 0.10 GB out of 1 GB. Do not access Logs Explorer or Log Ingestion for this Admin work.

- Entrypoint: `index.html`
- Client modules: `app.js`, `config.js`, `styles.css`
- Browser code uses only the Production Project URL and publishable key. Never add a service-role or secret key here.
- Staff management uses the `flame-chick-staff-admin` Edge Function and Batch 4 database commands. It does not query staff, role, invitation or audit tables directly.
- Only Admin and Owner accounts can enter this panel. Manager, Cashier and Rider access belongs in their respective operational portals.
- Admin/Owner are restaurant-wide. Manager/Cashier/Rider are assigned to one or more active branches.
- Role deactivation is audited and one-way in this UI. It does not delete the Auth account or order history. Adding branch access is supported; changing a person's role requires deactivation followed by a separately authorized assignment.
- Existing Auth users are not enumerated. They must sign in with the exact confirmed invitation email and accept the invitation through `/accept-invitation.html`.

## Deployment gates

The Staff Admin Edge Function is already deployed to Production. The canonical Cloudflare Pages Admin origin is now pinned in its exact-origin CORS allowlist, while the existing Vercel origin and approved preview hosts remain preserved. Before enabling staff invitations and other live Admin workflows:
1. Configure `FLAME_CHICK_STAFF_ADMIN_ALLOWED_ORIGINS` with the exact HTTPS Admin app origin(s).
2. Configure `FLAME_CHICK_STAFF_INVITE_REDIRECT_URL` to an HTTPS invitation-acceptance page on an allowed origin.
3. Deploy the Staff Admin function and set/verify its required publishable and secret key environment variables.
4. The invitation acceptance screen/route is now implemented at `/accept-invitation.html`; complete the live new-user and existing-user Auth tests after redirect/origin configuration.
5. Complete secure backend APIs for dashboard, orders, menu, deals, delivery, media and settings. Those navigation items remain disabled until their APIs and data contracts are ready.

No secret keys belong in this app. Do not enable the remaining modules by restoring direct browser table access.


## Staff invitation acceptance

The static invitation acceptance page is `/accept-invitation.html`.

- New invited accounts arrive from Supabase Auth's Invite User email with an `invite` session in the URL fragment. The page immediately removes the fragment from browser history, checks the authenticated user and confirmed email, asks the user to set a password, then calls the Staff Admin function's `accept_invitation` action.
- Existing confirmed Auth accounts whose email already exists use the same page's sign-in form. The database command matches the authenticated user's exact confirmed email to a pending invitation; it does not accept a caller-supplied email or invitation ID.
- The Staff Admin database command remains responsible for invitation expiry, issuer authority, role conflict checks, branch assignments and audit. The browser does not assign roles.
- The function must have the final Admin origin in `FLAME_CHICK_STAFF_ADMIN_ALLOWED_ORIGINS` and the exact HTTPS acceptance URL in `FLAME_CHICK_STAFF_INVITE_REDIRECT_URL`. Add that URL to Supabase Auth's allowed redirect URLs. Do this only after the final Admin domain is selected.
- Before live use, verify the Supabase Invite User email template still uses the standard confirmation link flow, then test a new email and an already-existing confirmed account. No secrets belong in this page.


Cloudflare Pages production hosting is configured separately as `flamechickadmin.pages.dev`. This branch is the isolated Admin hosting release line; the Admin application source is unchanged from the reviewed `work/production-source-audit` baseline.
