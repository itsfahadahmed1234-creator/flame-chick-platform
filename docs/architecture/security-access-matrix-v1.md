# Flame Chick Production — Security Access Matrix (V1 Proposal)

**Status:** Security design proposal for review; not RLS SQL  
**Prepared:** 2026-11-20  
**Production changes:** None

## 1. Core security rules

1. A Supabase authenticated JWT is not, by itself, a Flame Chick staff role.
2. Authorization comes from an active server-controlled user_roles row scoped to the restaurant and branch. Do not use user-editable Auth user_metadata for authorization.
3. Browser clients use only a publishable key plus the signed-in user's access token. A publishable key is public and not an authorization control.
4. service_role and secret keys are used only in server-side Edge Functions/controlled server operations. Never place them in website, Admin, POS, Rider HTML/JS or browser-visible environment variables.
5. Server-side code must derive the actor from a verified JWT. Do not trust actor_user_id, role, branch_id, prices, totals, delivery fees or workflow state supplied by the client.
6. Every exposed table gets explicit RLS and least-privilege SQL grants. A table grant and an RLS policy are separate controls; both must be correct.
7. Private schemas hold sensitive internal data and should have no browser-role USAGE or table access unless an explicit, reviewed requirement exists.
8. Public customers see a narrow allowlisted published catalog API response, never raw mutable catalog, customer, staff, payment, rider or settings tables.
9. Every query/write is tenant- and branch-scoped. Composite foreign keys enforce relationships; RPCs repeat authorization at transaction time.
10. SECURITY DEFINER functions are privileged endpoints. Prefer SECURITY INVOKER; where definer is unavoidable, set an empty/fixed search_path, schema-qualify objects, use a safe owner, verify actor/role/branch inside the function, and grant EXECUTE only to the required caller.

## 2. Principals

| Principal | How identified | Base access |
|---|---|---|
| Public customer / guest | No staff session | Read published catalog projection; submit a website order through rate-limited Order API |
| Authenticated non-staff | Valid Supabase user, no active Flame Chick role | No business data by default; may use only explicit self-service Auth/profile functions if later required |
| Owner | Active owner role, restaurant-wide or branch-scoped | Highest business authority within assigned restaurant/branch scope |
| Admin | Active admin role | Admin operations within assigned branch scope |
| Manager | Active manager role | Routine branch operations and menu work within assigned branch scope |
| Cashier | Active cashier role | POS orders, permitted payment/order actions and dispatch actions within assigned branch scope |
| Kitchen | Active kitchen role | Minimum order/item data and permitted kitchen status transitions |
| Rider | Active rider role plus active rider profile | Own offers, own active assignments, and customer/delivery fields required for those jobs only |
| service_role | Server-side credential only | Technical row-access bypass where needed; not a human role and never proof that an actor is authorized |

A user with multiple active roles should be resolved deterministically by a server-side authorization helper and an explicit policy. Do not accidentally grant the union of roles if the application expects one selected role/branch.

## 3. Proposed data-access matrix

This is the intended minimum scope. Specific columns and RPCs will be finalized in the field-level schema specification.

| Data / capability | Public customer | Owner | Admin | Manager | Cashier | Kitchen | Rider |
|---|---|---|---|---|---|---|---|
| Published menu projection | Read | Read | Read | Read | Read | Minimum item data | Minimum active-delivery item data |
| Draft catalog | None | Full restaurant scope | Assigned branch/scope | Draft/edit if allowed | None | None | None |
| Product/category/variant edits | None | Full | Edit | Edit within assigned scope | None | None | None |
| Price changes | None | Full | Proposed: edit | Proposed: no price authority unless separately approved | None | None | None |
| Publish / rollback catalog | None | Proposed: allowed | Proposed: owner-approved publish only | No | No | No | No |
| Delivery areas and Not Listed default | None | Full | Edit in assigned scope | Proposed: edit or request change | Read active choice/fee | None | Read own job snapshot |
| Orders | No general order list/read | Assigned branch/restaurant scope | Assigned branch | Assigned branch | Required POS/branch fields | Minimum kitchen fields | Only linked to own active jobs |
| Customer phone/address | None via catalog | Business-required scope | Business-required scope | Business-required scope | Required to process delivery | Exclude unless operationally necessary | Only current offered/assigned deliveries |
| Payments | None | Financial authority | Financial authority if assigned | Limited summary if needed | Create/record permitted POS payments; no reconciliation administration unless approved | None | None |
| Delivery tasks | None | Assigned branch | Assigned branch | Assigned branch | Dispatch-required data | None | Own task/assignment only |
| Offers / assignments | None | Assigned branch | Assigned branch | Assigned branch | Dispatch workflow, branch only | None | Own offers/assignments only |
| Rider profile / presence | None | Assigned branch | Assigned branch | Operational summary | Minimum dispatch availability | None | Own profile/presence |
| Push subscription secrets | None | No direct table access | No direct table access | No direct table access | None | None | Only through own scoped Edge Function operations |
| Staff roles/invitations | None | Manage | Proposed: view only or delegated later | None | None | None | None |
| Security/audit history | None | Read | Narrow read | Narrow read if required | Own operational events only where required | None | Own relevant delivery events only |
| Restaurant-wide system secrets | None | Server-controlled settings actions only | No direct read | No direct read | None | None | None |

**Important:** Proposed price/publish/payment authority is a conservative design recommendation, not yet an owner-approved business rule. Keep those permissions unresolved in the migration spec until confirmed. Do not infer them from whether a button is visible in the current UI.

## 4. Current source behavior versus target

### Existing Admin

- Current Admin allows owner, admin and manager into the Admin panel and loads the selected branch.
- Current menu/product/deal/delivery-area editing is available through the Admin UI to those roles.
- Current permanent catalog delete controls are limited to owner/admin; referenced products/variants/deals are archived to preserve order history.
- The current Admin branch resolver selects the first active branch rather than providing a full branch switcher. Production should make branch context explicit if multiple branches are enabled and never combine branch data.
- Current Admin calls PostgREST directly using publishable key + user JWT. Production should move compound writes and sensitive configuration changes to transactional server-side commands; any direct reads left in browser must have narrow grants/RLS.

### Staff administration

- Current staff-admin Edge Function derives the actor from verified Auth and requires owner for invitation and role activation changes.
- Preserve owner-only role assignment until the owner explicitly approves a delegation model.

### POS and order actions

- Current order API verifies staff Auth and active role for non-website orders; accepted role set includes owner/admin/manager/cashier.
- Current status RPC checks role/branch and allows kitchen role only for kitchen workflow statuses such as preparing/ready.
- Production should retain the explicit transition matrix inside a transactional database command. A user must not be able to PATCH an arbitrary order status directly.

### Rider

- Current Rider portal obtains jobs/offers via a Rider Edge Function and rider-specific Realtime filters.
- Production access is own rider profile, own offers, own assignments and only the order/address/contact data required to fulfil those jobs.
- An active rider role does not allow browsing all branch orders or other riders' details.

### Public website

- Current website reads catalog from a public catalog Edge Function and submits orders through a rate-limited Order API.
- Production public catalog endpoint must return only fields required to render the published menu and delivery pricing. It must not return raw settings or hidden/draft products.
- Public order submission is a narrow command, not permission to read or update an order table.

## 5. Row-level security and SQL grants

For each table/view/function:
1. Decide whether it is in an exposed schema.
2. Define the smallest role grants needed (SELECT/INSERT/UPDATE/DELETE/USAGE/EXECUTE).
3. Explicitly enable RLS on every exposed application table. Do not depend on rls_auto_enable.
4. Create role-specific policies whose predicates include auth.uid() and an active server-controlled user_roles lookup for the relevant branch/tenant.
5. For UPDATE, use both USING and WITH CHECK and prevent changing immutable scope columns (restaurant_id, branch_id, owner/user IDs).
6. For INSERT, validate tenant and branch ownership in WITH CHECK or preferably a server-side command.
7. Do not give anon SELECT on mutable catalog tables just because the website needs a menu. Prefer the catalog Edge Function and immutable publication.
8. Revoke direct browser DML on orders, payments, delivery state, audit, publication pointer, internal settings and staff tables. Use narrowly scoped RPCs/Edge Functions.
9. Views: default views can run with creator permissions; use security_invoker = true where appropriate or keep sensitive views unexposed and revoke browser access.
10. Test function EXECUTE grants separately. PostgreSQL grants EXECUTE to PUBLIC by default unless revoked; Production's default privilege hardening removes defaults for postgres-created functions, but future migrations must still verify grants.
11. Do not grant blanket ALL to service_role as a workaround for application errors. Grant the exact object privileges needed by each server function and continue to validate the human actor inside privileged functions.

## 6. Sensitive fields and response minimization

- Customer name, phone, email, full address, delivery instructions and any coordinates are private operational data.
- Rider phone, last-seen/presence, location and push subscription material are private.
- Staff phone/email and role/audit history are private.
- Payment identifiers and reconciliation details are restricted financial data.
- Public catalog should contain product/customer-facing content, prices, published images, availability and branch delivery choice/pricing only.
- Avoid logging raw request/response bodies. Logs and error messages must not reveal credentials, tokens, full addresses, phones or private SQL details.

## 7. Adversarial test matrix (required before Production launch)

Test each attempt with anon, authenticated non-staff, every staff role and another-branch user:

1. Read raw products, variants, categories, deals and settings directly as anon.
2. Read another customer's order, phone, address or instructions by guessing/changing UUID.
3. Read another rider's offers, assignments, phone or delivery address.
4. Access another branch's orders, delivery areas, Not Listed default, riders or menu rows.
5. Change a product price, order total, delivery fee, branch ID, actor ID, role or status from browser DevTools.
6. Call sensitive RPCs directly with missing/invalid JWT, wrong role, wrong branch, expired session and a caller-supplied actor ID.
7. Reassign a row to another restaurant/branch/user through UPDATE; both RLS USING and WITH CHECK must reject it.
8. Call SECURITY DEFINER functions as anon/authenticated and confirm EXECUTE is denied unless specifically intended.
9. Read internal/private schema objects and push secrets from PostgREST.
10. Attempt public Storage list/upload/overwrite/delete of drafts and private files.
11. Attempt to publish or roll back an invalid draft, bypass unpriced validation, or replace a published snapshot.
12. Attempt concurrent price/menu updates and stale POS order confirmation as a different or unauthorized staff actor.

## 8. Open owner decisions

Before final RLS/GRANT policy SQL is authored, confirm:
- Whether Admin can publish and roll back, or only prepare drafts for Owner publication.
- Whether Manager can edit prices or only item content/availability.
- Whether Manager can change listed-area fees and the Not Listed default.
- Whether Admin is allowed to invite/change staff roles, or those remain Owner-only.
- Whether a cashier can view only their own shift/orders or the branch's full active order board.
- Whether payment/reconciliation fields are visible to managers or only Owner/Admin.
- Whether multi-branch operation is active at launch, and whether Owner/Admin need an explicit branch switcher.

## 9. Safety status

This is a proposed access-control design, not RLS SQL. No Production policies, grants, tables, functions, secrets, Storage or users have been changed.
