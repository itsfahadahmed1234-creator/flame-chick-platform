# 2026-11-21 — Catalog command ledger and first authoring slice

Branch: `work/production-source-audit`

## Applied to Flame Chick project
- `20261121133607_flame_chick_catalog_commands_v1` — applied successfully through Supabase CLI v3.2.0.
- Workflow: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44911173008
- The migration added private `app_private.catalog_command_idempotency`, a restaurant/request keyed ledger storing command, SHA-256 payload hash and original success response.
- Added Admin/Owner restaurant-wide actor resolver based on `auth.uid()`, active profile, active user, active restaurant and active restaurant-wide role.
- Added bounded category/subcategory draft reads, category upsert and subcategory upsert, per-restaurant draft revision lock, optimistic revision check, immutable audit insert, same-request/same-payload replay and different-payload key reuse rejection.
- Public wrappers are SECURITY INVOKER with empty search_path. Internal command/read functions are postgres-owned SECURITY DEFINER with empty search_path and explicit grants.
- Idempotency ledger has RLS enabled and no direct app-role table privileges.

## Verified after application
- Remote migration ledger has both `20261121125542` and `20261121133607`.
- Idempotency table is postgres-owned, RLS-enabled and empty.
- Function owners, SECURITY DEFINER flags, empty search_path and EXECUTE grants were queried directly.
- anon cannot execute public command wrappers.
- authenticated has no direct SELECT on idempotency ledger; service_role also has no direct SELECT.
- Categories, subcategories, products, variants, draft state, audit and idempotency tables all remain empty.
- A negative authorization test executed with no authenticated JWT context and confirmed both command and draft-read reject with `CATALOG_ADMIN_FORBIDDEN`.

## QA findings and forward-only correction
- First application attempt was safely rejected by a workflow guard that incorrectly matched the local migration column; no schema DDL ran in that attempt.
- After fixing the guard to inspect only the remote column, migration applied.
- The successful migration revealed a parser error in the name-length expression. Corrected it before successful application.
- A post-application code review found two edge cases: null action values could fall through to subcategory handling, and empty draft pages could yield a null items field. Applied migration file was restored to its exact applied content; no applied migration was rewritten.
- A separate forward-only migration `20261121140000_flame_chick_catalog_commands_v1_qa_fixes.sql` was created to reject null actions and normalize empty read items to [] without duplicating the read call.
- Forward-fix workflow: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44913431083
- At handoff creation time, that workflow was still running at the remote migration ledger inspection step. Do not assume the forward fix is applied until the workflow completes and remote ledger is verified.

## Explicitly not yet implemented
- Product and variant aggregate commands.
- Category/subcategory archive commands.
- Modifier group/assignment/pricing commands.
- Deals, component group/options commands.
- Publication compiler/publish/rollback commands.
- Edge Function action router and Admin UI integration.
- Full authenticated positive-role, concurrency and replay tests (no staff/restaurant fixtures have been seeded).
- No menu, restaurant, branch, staff or Auth user records were seeded. No Edge Function deployed.

## Important implementation limits
This first slice supports categories/subcategories only. Do not claim product/variant commands are available yet.
The idempotency table currently retains request records permanently; revisit a safe retention/partitioning policy only if catalog command volume justifies it. Catalog authoring is expected to be low volume.
A single restaurant draft revision row intentionally serializes Admin catalog writes. Revisit only if actual Admin collaboration/lock contention demonstrates a need; do not prematurely shard revision state.

## Next steps
1. Confirm forward-only QA migration `20261121140000` completed and verify its remote ledger row/function definitions.
2. Test category/subcategory commands with a dedicated authenticated Admin fixture and a denied Manager/Cashier/Rider/customer fixture, then remove fixtures in the same controlled test transaction where feasible.
3. Add product + variant aggregate command as a separate migration, including same-tenant category/subcategory checks, exact allowed variant kinds, nullable vs zero price validation, and explicit patch semantics.
4. Build the Edge Function router only after all RPC contracts and authorization tests are complete.
