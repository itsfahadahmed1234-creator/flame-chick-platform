# Flame Chick Admin

Static administration app.

- Entrypoint: `index.html`
- Client modules: `app.js`, `config.js`, `styles.css`
- Browser code uses only the Production Project URL and publishable key. Never add a service-role or secret key here.
- Staff management uses the `flame-chick-staff-admin` Edge Function and Batch 4 database commands. It does not query staff, role, invitation or audit tables directly.
- Only Admin and Owner accounts can enter this panel. Manager, Cashier and Rider access belongs in their respective operational portals.
- Admin/Owner are restaurant-wide. Manager/Cashier/Rider are assigned to one or more active branches.
- Role deactivation is audited and one-way in this UI. It does not delete the Auth account or order history. Adding branch access is supported; changing a person's role requires deactivation followed by a separately authorized assignment.
- Existing Auth users are not enumerated. They must sign in with the exact confirmed invitation email and accept the invitation through the authenticated acceptance flow.

## Deployment gates

The Staff Admin Edge Function is not deployed by this source update. Before enabling this app in production:
1. Configure `FLAME_CHICK_STAFF_ADMIN_ALLOWED_ORIGINS` with the exact HTTPS Admin app origin(s).
2. Configure `FLAME_CHICK_STAFF_INVITE_REDIRECT_URL` to an HTTPS invitation-acceptance page on an allowed origin.
3. Deploy the Staff Admin function and set/verify its required publishable and secret key environment variables.
4. Implement and test the invitation acceptance screen/route for invited existing and newly created Auth accounts.
5. Complete secure backend APIs for dashboard, orders, menu, deals, delivery, media and settings. Those navigation items remain disabled until their APIs and data contracts are ready.

No secret keys belong in this app. Do not enable the remaining modules by restoring direct browser table access.


## Staff invitation acceptance

The static invitation acceptance page is `/accept-invitation.html`.

- New invited accounts arrive from Supabase Auth's Invite User email with an `invite` session in the URL fragment. The page immediately removes the fragment from browser history, checks the authenticated user and confirmed email, asks the user to set a password, then calls the Staff Admin function's `accept_invitation` action.
- Existing confirmed Auth accounts whose email already exists use the same page's sign-in form. The database command matches the authenticated user's exact confirmed email to a pending invitation; it does not accept a caller-supplied email or invitation ID.
- The Staff Admin database command remains responsible for invitation expiry, issuer authority, role conflict checks, branch assignments and audit. The browser does not assign roles.
- The function must have the final Admin origin in `FLAME_CHICK_STAFF_ADMIN_ALLOWED_ORIGINS` and the exact HTTPS acceptance URL in `FLAME_CHICK_STAFF_INVITE_REDIRECT_URL`. Add that URL to Supabase Auth's allowed redirect URLs. Do this only after the final Admin domain is selected.
- Before live use, verify the Supabase Invite User email template still uses the standard confirmation link flow, then test a new email and an already-existing confirmed account. No secrets belong in this page.
