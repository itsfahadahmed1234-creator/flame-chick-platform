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

## 2. Owner-confirmed principals and application boundaries

The owner supplied the following role model on 2026-11-20. These rules replace the earlier proposed access matrix wherever they conflict.

| Principal | Allowed application(s) | Confirmed authority |
|---|---|---|
| Admin (the owner-designated administrator) | Admin panel + POS + operational tools | Full Flame Chick business access, equivalent to Owner. Separate identity and audit actor. |
| Owner | Admin panel + POS + operational tools | Full Flame Chick business access, equivalent to Admin. |
| Manager | **POS only; no Admin panel** | Restricted operational supervisor: view/monitor branch operations, monitor preparation/status, dispatch oversight and rider assignment/reassignment, confirm physical returned deliveries and record return outcomes. No menu/pricing, staff, settings, deletion or other Admin-panel powers. |
| Cashier | POS only | Process POS work, assign/reassign riders and reject orders. Cannot delete orders or other records. Rejections/cancellations must be audited. |
| Rider | Rider portal only | Can see and respond to their own offers and manage their own assigned deliveries. Cannot view another rider's offers, assignments or private delivery data. |
| Public customer / guest | Customer website | Read the published catalog projection and submit an order through the rate-limited Order API. No general order/table reads. |
| Authenticated non-staff | No business application by default | Valid Supabase authentication without an active Flame Chick role grants no business access. |
| service_role | Server-side functions only | Technical privileged credential, never a human role or proof of actor authorization. |

### Global invariants

- Admin and Owner are equivalent for business capabilities, but must have distinct account IDs so audits identify the actual person.
- Manager must be denied the Admin application at the API/data layer, not just hidden from the login screen. Manager deletion rights are denied.
- Cashier is restricted to the POS application. Cashier must never be granted catalog administration, staff-role management or system settings access.
- Rider is restricted to the Rider application. A rider's offers are rows addressed to that authenticated rider, not a branch-wide list filtered only in the browser.
- Orders are not physically deleted through normal business applications. Rejection, cancellation, void/correction and other state changes preserve the original order plus an append-only audit trail. This is the recommended rule for all roles, including Admin/Owner, to prevent accidental loss of financial and operational history.
- Every protected action derives the actor from the verified JWT. Never accept a browser-supplied actor ID as proof of identity.
- UI role checks are only a usability layer. Edge Functions, RPCs, SQL privileges and RLS enforce the actual permission.

## 3. Owner-confirmed access matrix

| Capability | Admin | Owner | Manager | Cashier | Rider |
|---|---|---|---|---|---|
| Enter Admin panel | Yes | Yes | **No** | No | No |
| Enter POS | Yes | Yes | **Yes — restricted operational scope** | Yes | No |
| Enter Rider portal | No business need | No business need | No | No | Yes |
| Full menu/category/product editing | Yes | Yes | No (no Admin panel) | No | No |
| Change product/variant/deal prices | Yes | Yes | No | No | No |
| Publish or roll back menu | Yes | Yes | No | No | No |
| Change listed delivery areas and Not Listed default fee | Yes | Yes | No | No | No |
| Manage staff roles/invitations | Yes | Yes | No | No | No |
| View branch operational orders | Yes | Yes | **Yes — operational fields only** | POS operational scope | Only own active delivery orders |
| Accept/process POS orders | Yes | Yes | **Supervise/monitor; no cashier processing assumed** | Yes | No |
| Reject incoming orders | Yes | Yes | Not confirmed; do not grant by default | Yes — newly received/unaccepted only, with reason | No |
| Cancel accepted/in-progress orders | Yes | Yes | Pending authority | **Not yet approved** | No |
| Assign/reassign riders | Yes | Yes | **Yes — operational dispatch** | Yes | No |
| Accept/reject a rider offer | No | No | No | No | Own offer only |
| Pickup and delivery status actions | No | No | No | No | Own assigned delivery only |
| View another rider's offers/assignments | Full operational oversight only | Full operational oversight only | Not yet specified | Dispatch-only minimum data | **Never** |
| Hard-delete an order | No (audit-preserving state changes only) | No (audit-preserving state changes only) | No | **No** | No |
| Hard-delete catalog records | Yes, only when unreferenced and policy permits; otherwise archive | Same as Admin | No | No | No |
| Read audit history | Full | Full | Not yet specified | Own/operational action receipts only | Own delivery events only |

**Audit requirement for order rejection/cancellation:** persist the order ID, action (`rejected` / `cancelled` / other approved state), previous and new state, authenticated actor user ID, actor role at the time, server timestamp, mandatory reason where applicable, and request/correlation ID. Append an immutable event and update the order's current state in one database transaction. Do not let users rewrite or delete the event.

**Important distinction:** Rejecting a newly received order and cancelling an order already accepted/preparing are different business actions. Cashier rejection is confirmed; cashier cancellation after acceptance is not yet approved. Until clarified, deny cashier cancellation of an accepted/in-progress order.

**Rider isolation:** Rider list/lookup functions, SQL policies, offer acceptance/rejection RPCs, and Realtime filters must bind to `auth.uid()`. The API must return only offers sent to that rider and assignments linked to that rider. Knowing another rider's UUID or offer/task UUID must not expand access. Customer address and phone are visible only for that rider's current offered/assigned delivery, for the duration needed to complete it.

## 3A. Remaining role details to confirm

1. Should Manager have POS access for supervision, order-status oversight and dispatch, while still being blocked from Admin? If yes, specify whether Manager can assign/reassign riders and reject/cancel orders.
2. Can Cashier reject only a newly received order before it is accepted, or also reject an already accepted order? Cashier cancellation of accepted/preparing orders is denied by default until approved.
3. Should Riders retain the complete existing delivery cycle: accept/decline offer, arrive at restaurant, confirm pickup, mark delivered, and report failed delivery/physical return? The return should require Manager/Admin/Owner confirmation rather than rider-side cancellation.
4. Do you need a Kitchen-only staff role/app in V1, or should kitchen staff use the POS with a restricted role? No Kitchen role should inherit full POS or Admin privileges automatically.
5. For order rejection, should a reason be mandatory every time? Recommendation: yes, with a short controlled reason plus optional note.
## 4. Current source behavior versus target

### Existing Admin

- Current source presently allows owner, admin and manager into the Admin panel and exposes menu/product/deal/delivery-area editing to those roles. This conflicts with the user's new Production policy that Manager must have no Admin panel access. Treat this as a known migration gap: update the Admin login/role guard and independently deny all manager Admin APIs/RPCs in the Production authorization layer before releasing the new role model. Do not assume the current UI already enforces the new policy.
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

## 8. Outstanding decisions and conservative defaults

Owner has confirmed the main role boundaries and restricted Manager POS access. These remaining details still affect authorization policy and app behavior:

2. **Cashier rejection/cancellation boundary:** Cashier can reject orders. Distinguish rejecting a newly received order from cancelling an accepted/preparing/ready order. Default: Cashier may reject only a new/unaccepted order with a mandatory reason; cannot cancel an order after acceptance unless Owner approves that authority.
3. **Rider lifecycle:** Recommended full rider workflow is accept/decline own offer, arrive at restaurant, confirm pickup, mark delivered, and report failed delivery/physical return. Rider reports return; Manager/Admin/Owner confirms the physical return and final order cancellation. Confirm that this existing lifecycle is retained.
4. **Reason requirement:** Recommended mandatory rejection/cancellation reason (controlled reason code plus optional short note).
5. **Kitchen:** The user has not yet confirmed whether a Kitchen-only role is required at launch. Do not grant the Kitchen role broad POS access by default.
6. **Cashier order visibility:** Recommended branch active-order queue and dispatch details needed for POS, but no payment reconciliation, staff management, full audit or private settings.
7. **Manager financial visibility:** Recommended no payment reconciliation or sensitive financial settings by default; only the operational fields needed for approved POS work.
8. **Multi-branch:** Confirm whether one branch is the only branch at launch. All policies must still be branch-scoped even if one branch is initially seeded.

Do not let these open items block implementation of already-confirmed boundaries: Admin/Owner full business access, Manager denied from Admin app and all deletion, Cashier POS only with rider assignment and order rejection, Rider portal only with own-offer/job isolation.
## 9. Safety status

This is a proposed access-control design, not RLS SQL. No Production policies, grants, tables, functions, secrets, Storage or users have been changed.


## Owner decision — Manager restricted POS access confirmed (2026-11-20)

The user approved the restricted Manager POS model. This supersedes all earlier "Manager POS access pending" wording.

- Manager may log into the POS application, but must be denied access to the Admin panel at both UI and server/database authorization layers.
- Manager may view and supervise branch operational orders and preparation/status, oversee dispatch, assign/reassign riders, and confirm physical returned deliveries with a recorded return outcome.
- Manager may not manage menu/catalog/prices, publish/rollback menus, manage staff/roles, change delivery areas/default fees, edit sensitive settings, or delete orders/records.
- Manager order rejection/cancellation authority is not granted by this decision; retain the conservative deny-by-default rule until explicitly approved.
- Manager sees only the operational and branch-scoped fields needed for these duties, not full financial reconciliation or unrelated rider/customer records.
- Cashier remains POS-only and may process orders, assign/reassign riders and reject newly received/unaccepted orders with an audit reason; cashier cannot delete orders. Do not silently extend cashier cancellation authority to accepted/in-progress orders.
- Riders remain Rider-portal-only and may act only on offers/assignments addressed to their authenticated rider identity.
- All order deletion remains prohibited through normal business applications for every role, including Admin and Owner. Use audited status transitions, correction/void events and immutable order history instead.
- Return confirmation must be a transactional, audited action: delivery task/order references, previous and resulting states, confirming actor from verified JWT, role, server timestamp, return reason/outcome, and correlation/request ID. The rider may report a failed delivery/return; Manager confirms the physical return. No client-supplied actor identity is trusted.
- Update the authorization matrix, RLS/API tests, POS route guards, manager UI and database command policies to match this scope before release.
