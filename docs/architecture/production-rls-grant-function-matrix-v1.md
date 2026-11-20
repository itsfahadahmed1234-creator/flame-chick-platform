# Flame Chick Production — RLS, Grants & Function Authorization Matrix V1

**Status:** Target enforcement design for schema review and isolated testing  
**Date:** 2026-11-20  
**Branch:** work/production-source-audit  
**Companion:** production-database-security-reliability-controls-v1.md  
**Production boundary:** No RLS policies, grants, functions, tables or settings are applied by this document.

## 1. Core authorization model

Authorization is enforced in layers. Every layer is required; one does not replace another.

1. **Supabase Auth:** validates the signed user JWT. For a staff command, Edge Function verifies the token with Supabase Auth and derives the user ID from that verified identity.
2. **Role authority:** active records in public.user_roles are the source of business roles. Never authorize from user_metadata, email, frontend state or a caller-supplied role.
3. **Tenant/branch authority:** the verified role must be active for the restaurant and branch of the resource. Server command derives or validates branch membership inside the transaction.
4. **Edge Function action gate:** each handler strictly allowlists methods/actions and validates input size and shape.
5. **Database command gate:** privileged RPC validates actor, role, branch, resource ownership, current state, allowed transition and idempotency in the same transaction.
6. **RLS/grants:** direct Data API reads are filtered by active role/branch and selected columns. High-risk browser DML is revoked.
7. **Audit:** every state-changing action records the verified actor, role snapshot, branch, timestamp, reason where required and request/command ID.

A hidden page, disabled button, CORS rule or frontend route guard is not a security boundary.

## 2. Application principals

| Principal | Identity source | Allowed surface | Data authority |
|---|---|---|---|
| Public guest | No Supabase user JWT; allowlisted publishable key only | Website; published catalog GET; customer website order POST | Published catalog projection and create-only guest website order command |
| Authenticated non-staff | Verified Supabase JWT, no active Flame Chick role | Auth endpoints and own minimal profile where required | No business data |
| Admin | Verified JWT + active admin role | Admin + POS | Full business access; distinct audit identity |
| Owner | Verified JWT + active owner role | Admin + POS | Full business access; distinct audit identity |
| Manager | Verified JWT + active branch-scoped manager role | Restricted POS only | Branch operational orders/status, preparation monitor, rider dispatch/reassignment and physical return confirmation. No Admin app/API, catalog, staff, fees, sensitive settings, delete or unapproved reject/cancel |
| Cashier | Verified JWT + active branch-scoped cashier role | POS only | Order processing, branch active orders, manual rider dispatch/reassignment, reject only newly received/unaccepted orders with reason, and narrow physical-return confirmation. No delete or accepted/in-progress cancellation |
| Rider | Verified JWT + active branch-scoped rider role and active rider profile | Rider portal only | Own pending offers and own active assignment/task fields only |
| service_role | Server-side secret credential used only by Edge Functions | Supabase REST/RPC from server | Technical privilege, not human authority. Every command still validates the verified human actor where required |
| PostgreSQL migration owner | Controlled migration process only | Reviewed migrations | Schema changes only; never used by application clients |

Admin and Owner both have full business authority as owner-confirmed. The current source staff-admin Function is stricter in places (Owner-only role management); align it with the approved Admin + Owner authority before release. Manager remains excluded.

## 3. Table-level read/write matrix

Legend:
- **No** = deny.
- **Own** = only the authenticated user's own rows/limited fields.
- **Branch ops** = branch-scoped operational projection, not all PII/financial/audit columns.
- **Command** = write only through a narrow server command; no direct browser table DML.
- **Full** = authorized business fields, still no physical deletion of order/audit history.
- **Private** = no browser schema access; server-only.

| Table group | Public guest | Non-staff auth | Admin / Owner | Manager | Cashier | Rider | Browser mutation rule |
|---|---|---|---|---|---|---|---|
| restaurants, branches | No raw table; published projection only | No or own branch label only if needed | Full | Own branch basics only | Own branch basics only | Own branch identity basics only | Command for configuration changes |
| user_profiles | No | Own minimal profile only | Full branch staff details | No staff directory | Own minimum profile | Own minimum profile | Profile/admin command; never self-change role or branch |
| user_roles | No | Own active role rows only if needed by app | Full | No | Own role only | Own rider role only | Admin/Owner staff command only; Admin + Owner allowed |
| staff_role_audit | No | No | Full | No | No (only own action receipt) | No | Append-only server command |
| categories, subcategories, products, variants, modifiers and assignments | Published catalog projection only | No raw mutable rows | Full | No | POS projection only | No | Draft/publish command; no direct browser DML |
| deals, components, choices, schedules | Published catalog projection only | No raw mutable rows | Full | No | POS projection only | No | Draft/publish command; no direct browser DML |
| catalog_draft_state, menu_publications, restaurant_catalog_state, publication events | No | No | Full through catalog commands | No | No | No | Immutable publication and transactional pointer command |
| delivery_areas, branch_delivery_settings | Published fee/area projection only | No raw config | Full | No | POS read projection only | Only own offer's area label/fee snapshot | Admin/Owner config command only |
| orders | No | No | Full | Branch ops | Branch POS ops | Only related order summary for own active delivery | Create/status/reject/cancel via Order command; no direct DML or physical DELETE |
| order_items, modifiers, components | No | No | Full | Operational item details needed for preparation/dispatch | POS operational details | Items for own active delivery only | Insert only inside atomic order create; immutable afterwards |
| order_status_history | No | No | Full | Operational history limited to branch task | Own/operational action receipts | Own delivery/order event subset | Append-only command; no UPDATE/DELETE |
| payments, cash/register records | No | No | Full | No reconciliation by default | Only payment collection/receipt fields needed for POS; no secrets | No | Atomic authorized payment command; no direct browser DML |
| delivery_tasks | No | No | Full | Branch dispatch/return fields only | Branch dispatch/return fields only | Own active assignment only | Delivery command; branch and actor validated inside transaction |
| delivery_task_offers | No | No | Operational oversight | Branch dispatch queue, no unnecessary private details | Branch dispatch queue, no unrelated rider offers | Own offer rows only | Delivery command; accept/decline only addressed Rider |
| delivery_assignments | No | No | Full | Branch dispatch fields | Branch dispatch fields | Own current assignment only | Delivery command; row lock/current assignment enforcement |
| delivery_task_events | No | No | Full | Operational event fields | Own/dispatch operational fields | Own event history only | Append-only server command |
| rider_profiles | No | No | Full | Branch active rider/dispatch fields needed | Branch active rider/dispatch fields needed | Own profile and own availability | Rider/Admin command; no changing user_id/branch as self-service |
| settings and security configuration | No | No | Full by setting allowlist | Only explicit safe operational settings if later approved | No sensitive settings | Own notification preference only | Typed Admin/Owner settings commands |
| website_order_rate_limit_events | No | No | No routine table access; aggregate diagnostics only | No | No | No | Private app_private schema; server inserts/reads only |
| app_private.api_rate_limit_buckets | No | No | No raw subject access | No | No | No | Private server-side limiter function only |
| notification_outbox, push subscriptions/config | No | No | No secret access; safe delivery diagnostics only | No | No | Own notification subscription via server command | Private server-side command only |
| webhook secrets, service credentials, internal keys | No | No | No browser disclosure | No | No | No | Supabase/Vercel secret stores only |

RLS is not the only filter. For privileged server reads, the Edge Function must minimize columns and validate requested branch. Rider queries must bind rider_user_id to verified auth.uid() rather than a caller-supplied ID.

## 4. Direct Data API grants

### 4.1 Anon

Allow only:
- Execution of the public catalog GET Edge Function route (not raw mutable catalog table SELECT).
- Invocation of the public customer website order Edge Function route. This does not imply EXECUTE on the underlying service-role-only order RPC.
- Auth endpoints that Supabase Auth itself exposes.

Deny all direct table access to orders, order items, customer records, users/roles, delivery tasks/offers/assignments, payments, audit, mutable catalog drafts, delivery fee config and app_private schemas.

### 4.2 Authenticated

Grant only explicit minimal SELECT access where a current app needs it:
- Own user_roles rows for session/role discovery, filtered to auth.uid() and active rows.
- Own user profile subset.
- Branch-scoped POS operational views/queries for Admin/Owner/Manager/Cashier, with role and branch predicates.
- Rider own profile, own offers, own current assignments/tasks and allowed joined order fields.
- Published catalog projection where useful, not mutable catalog edit tables.

Do not grant browser INSERT/UPDATE/DELETE on orders, order items, payments, status history, delivery events, assignment records, role records, audit tables, catalog publication pointer, private settings, rate-limit tables or outbox. Mutations use narrow commands.

### 4.3 service_role

- Used only from server Edge Functions and controlled maintenance.
- Supabase service_role bypasses RLS; never rely on RLS as the only protection for its calls.
- After the existing Production default privilege hardening, explicitly grant the exact table/function privileges required. Do not grant blanket ALL.
- Edge Function derives and passes verified actor ID; database command rechecks role/branch/current state where that actor is required.
- Private schema remains unavailable through browser Data API.

## 5. Function/action authorization matrix

The exact database RPC names will be normalized during schema implementation, but source action routes and target capability are:

| Function/action | Caller | Required authorization | Database transaction requirements |
|---|---|---|---|
| Catalog GET snapshot/health | Public guest or staff | Allowlisted publishable key; GET only | Read published immutable snapshot only; no mutable draft exposure |
| Order POST create, source=website | Public guest | Public route; server validates payload and phone; no user JWT required | Universal idempotency; website-only 3/1m, 3/10m, 15/1h phone quota; validate server price/fee; create order/items/task/rate event atomically |
| Order POST create, source=pos | Admin/Owner/Manager/Cashier verified JWT and active role for branch | Manager/Cashier allowed to create approved POS orders; non-staff sources denied | Universal idempotency; **bypass website phone quota**; server validates catalog version/price/fee, actor and branch; atomic order writes |
| Order POST create, staff phone/WhatsApp/manual/third-party | Admin/Owner/Manager/Cashier verified JWT and active role | Allow only explicitly approved staff channel and source; never trust source string without staff JWT | Universal idempotency; bypass website-only phone quota; atomic order writes |
| Order GET active board | Admin/Owner/Manager/Cashier as role permits | Verify Auth JWT and active branch role; Manager receives operational fields only | RLS branch scope, strict allowlisted board/status filter, bounded pagination/limit |
| Order status update/accept/prepare/ready | Admin/Owner/Cashier for approved transitions | Manager monitors order/preparation/status and handles approved dispatch/return actions only; do not grant general cashier processing by default | Row lock/compare-and-set; status event + outbox in same transaction; request ID deduplication |
| Order reject | Cashier, Admin, Owner | Cashier only for newly received/unaccepted order; Admin/Owner full business authority. Manager deny unless later approved | Mandatory reason; row lock; append-only audit; idempotent command; reject state only |
| Order cancel | Admin/Owner only by default | Cashier/Manager denied for accepted/in-progress orders unless explicit approval later | Reason, transition validation and audit; no physical delete |
| Delivery GET dispatch | Admin/Owner/Manager/Cashier | Active role, branch; Manager/Cashier see minimum dispatch projection | Paginate/bound tasks, branch-filter and minimize rider/customer PII |
| Delivery GET rider own jobs/offers | Rider | Verified JWT + active rider role/profile; bind query to verified user ID | Only own pending offers and own current assignment; no caller-supplied rider ID |
| Delivery assign/reassign | Admin/Owner/Manager/Cashier | Branch-scoped dispatch capability | Only after task is dispatch-pending/offer returned; immutable offer/assignment history; manual reassignment; deduplicated command |
| Delivery offer accept/decline | Addressed Rider only | Verified JWT, active profile and offer.rider_user_id=auth.uid() | Lock task+offer; server clock; acceptance before expires_at; first valid accept wins; one current assignment |
| Rider arrive/pickup/out_for_delivery/delivered | Assigned Rider only | Verified JWT, own current assignment, allowed state | Lock task/assignment; append event; delivered closes order immediately in same transaction |
| Rider fail/return_reported | Assigned Rider only | Verified JWT, own active assignment, allowed state | Reason/outcome and event; enters return-pending confirmation; cannot self-confirm receipt |
| Delivery confirm_return | Cashier/Manager/Admin/Owner | Verified POS role, branch, return-pending task | Confirm physical receipt; lock state; close as returned; audit actor/role/time/reason; deduplicated command |
| Staff Admin GET | Admin/Owner only | Verified Auth and active Admin or Owner | Branch-scoped members; omit secrets and unnecessary Auth internals |
| Staff invite/role assign/deactivate | Admin/Owner only | Admin/Owner verified JWT; target role allowlist and branch validation | Auth admin operation plus role/audit changes orchestrated safely; audit no duplicate; do not partially assign role |
| Catalog draft/save/publish/rollback | Admin/Owner only | Verified JWT and role; Manager/Cashier denied | Expected draft revision, validate snapshot, immutable publication, pointer+event atomically committed |
| Internal push/outbox processing | Server only | service_role secret, no browser caller | Bounded claims/leases, unique event key, retry metadata, no secrets in response |

### Source compatibility notes

- Current Admin app directly reads/writes catalog and settings REST resources. Replace protected compound operations with transactional commands and preserve a compatible versioned DTO during rollout.
- Current Admin UI allows Manager; target must deny Manager at UI, Admin Edge Function and database/RLS. Manager must still be admitted to restricted POS.
- Current staff-admin Function has Owner-only controls in some places, while approved business authority gives both Admin and Owner full access. Update handler and database function authorization to Admin + Owner.
- Current Order API allows the Kitchen role to read an order board. Kitchen role launch scope is not approved; deny by default until the owner confirms the role and exact fields.
- Current POS and Rider applications make direct RLS-protected REST reads. Preserve narrow reads where safe; never use service_role in those clients.

## 6. RLS policy design rules

- Scope every staff policy by auth.uid(), active user_roles assignment, restaurant_id and branch_id.
- The role assignment itself must not be mutable by the subject. Only Admin/Owner staff commands can change roles.
- A global Owner/Admin role may have restaurant-wide scope, but its effective branch must be resolved and included when a command acts on a branch resource.
- Manager gets only the branch operational read/action policy; no access to Admin data/functions, catalog authoring/publishing, staff/role management, delivery-area fees or sensitive settings.
- Cashier gets branch POS read/action policy; no Admin functions or deletion. Cashier rejection is limited to newly received/unaccepted state; return confirmation is narrow.
- Rider RLS uses current Auth UID plus an active rider profile for branch. Related offer/assignment joins must not accidentally widen visibility to other rider IDs.
- Anonymous customers cannot read an order after creating it. Any order confirmation/status lookup must use a high-entropy, narrowly scoped capability token stored hashed server-side or an authenticated customer account in a separately approved design; do not expose orders by predictable UUID alone.
- Private app_private schema has no USAGE or table grants for anon/authenticated. No PostgREST exposed schema configuration includes it.
- For UPDATE, both USING and WITH CHECK constrain old and new row scope; immutable tenant, branch, owner and actor fields cannot be rewritten.
- Security views should use security_invoker where available and tested. Revoke browser access to sensitive views/functions if their base-table privilege behavior is uncertain.

## 7. Required grant/RLS verification

After each isolated migration:
1. Enumerate public tables, views, functions and sequences and compare to the expected inventory.
2. Assert RLS is enabled for every public application table; identify any view without security_invoker or approved alternative.
3. Inspect exact grants for PUBLIC, anon, authenticated and service_role; no unintended default EXECUTE or DML.
4. Verify app_private cannot be accessed via PostgREST by anon/authenticated.
5. Execute negative tests under real anon/auth JWTs for every role and second branch.
6. Verify service_role can execute only the explicit server commands it needs and commands still reject forged actor/branch/resource/state.
7. Test role deactivation while a JWT is still valid: command must check live user_roles state, not depend solely on token claim refresh.
8. Test role changes and branch changes are audited, and prior access is denied on the next server command.
9. Test RLS on nested PostgREST relationships, not only primary table rows.
10. Keep a machine-readable expected privilege/policy snapshot in docs/operations and compare after each migration.

## 8. Known decisions and safe defaults

- Admin and Owner both have full business access, distinct identity/audit attribution.
- Manager no Admin app/API, no delete, no catalog/staff/fee/settings access; branch operational POS only.
- Cashier POS only; can reject newly received/unaccepted orders with reason, dispatch/reassign riders and confirm physical return; cannot delete or cancel accepted/in-progress orders.
- Rider portal only; own offers and own active assignments. Rider reports return, Cashier/Manager physically confirm.
- Website phone quota only; POS is exempt. Universal order idempotency applies to both Website and POS.
- No normal business app performs hard deletes of orders, financial history or audit records.
- If a capability is not explicitly approved, deny by default and record the missing decision rather than inferring permission.

## 9. Safety status

This is the target permission and RLS/grant design, not applied SQL. Existing live code still contains mismatches called out above. No Production RLS, grants, tables, functions, secrets, Auth users, Storage or deployments have been changed.
