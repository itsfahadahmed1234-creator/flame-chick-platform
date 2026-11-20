# Flame Chick Customer Website — Security Threat Model V1

**Status:** Security-first design and verification plan; not an implementation certificate  
**Date:** 2026-11-20  
**Branch:** work/production-source-audit  
**Protected surface:** https://flame-chick.vercel.app/ and its Supabase/API/Storage dependencies  
**Production boundary:** This document changes no live website, database, function, header, secret, policy or deployment.

## 1. Security objective and limits

Treat the customer website as an internet-facing, untrusted-client application. The browser, request body, headers, local/session storage, device clock, customer phone/address, client prices, selected delivery area, order source, and any identifier supplied by a visitor can be manipulated.

The objective is confidentiality, integrity, availability and recoverability of customer and business data—not merely adding the owner-requested order quota. No application can be guaranteed fully secure. Controls require secure implementation, configuration, ongoing patching, monitoring, testing and incident response.

The owner-approved customer phone quota remains exactly scoped:
- 3 successful customer website orders per rolling minute;
- 3 per rolling 10 minutes;
- 15 per rolling hour;
- keyed by server-normalized phone number;
- POS, including POS delivery, is exempt.

That quota is one abuse-control layer, not a complete security system. It does not prove phone ownership, stop a botnet, protect the Edge Function invocation quota from volumetric abuse, or replace validation, authorization and database integrity.

## 2. Assets and security boundaries

Protect:
- Customer names, phones, email, delivery addresses, instructions and order history.
- Menu price, availability, modifiers, deal definitions and published catalog versions.
- Order contents, totals, discounts, delivery fee, status and idempotency records.
- Staff identities, roles, branch membership and audit history.
- Rider offers, assignments, recipient contact/address and notification subscriptions.
- Supabase credentials, HMAC keys, API secrets, deployment tokens and service-role access.
- Website availability, checkout reliability, menu accuracy and order integrity.

Trust boundaries:
1. Visitor/browser → public website.
2. Browser → public catalog/order Edge Function routes.
3. Edge Function → PostgreSQL/RPC/service-role credentials.
4. Website static assets → third-party scripts, fonts, analytics or CDN resources.
5. Admin/POS/Rider identities → authenticated APIs and RLS.
6. Storage upload/download → bucket policies.
7. Database/Storage → backup and restore destinations.

Assume attacker-controlled input at every boundary. Use server-side allowlists and database constraints, not client assertions.

## 3. Threat register and required controls

| Threat | Example impact | Required design/control | Verification |
|---|---|---|---|
| Secret leakage | Attacker obtains service-role/database key from JS, source map, Git or logs | Browser may contain only publishable key and user session token. Server secrets exclusively in Supabase/Vercel secret stores. Scan Git history, build assets and source maps. Rotate exposed credentials. | Secret scanning, built asset/source-map inspection, repository history scan |
| Broken authorization / IDOR | Guest guesses order UUID; Manager/Rider accesses another person's or branch's data | No public raw order reads. High-entropy one-time/expiring capability only if order tracking is later required; hash capability server-side. RLS and server checks for every protected resource. Rider binds to verified auth.uid(). | Change UUIDs/branch/user IDs in requests; verify no data leaks |
| Privilege escalation | Guest sets source=pos or actor=Admin; Manager invokes Admin API | Source route is server-classified and allowlisted. Non-website sources require verified staff JWT and active role/branch. Never accept role, actor, branch or user ID from payload. | Forged-source/role/actor tests across all endpoints |
| Price/fee tampering | Customer edits browser total or fee | Recalculate item, modifier, deal, discounts and delivery fee server-side from authoritative published snapshot/config. Reject unknown IDs, inactive items, invalid combinations and stale versions. Snapshot charged facts at commit. | Modify payload totals, price, variant, area and discount |
| Order duplication/replay | Double click, retry after timeout, malicious replay | Stable idempotency key + server canonical request fingerprint + unique DB constraint + transaction lock. Same key/same request replays original result; same key/different request returns 409. Website and POS both protected. | Parallel replay, timeout-after-commit, changed-payload tests |
| Automated order abuse | Bot floods guest checkout | Website-only rolling phone quota; server normalization/HMAC; optional trusted-IP/device signals only after validation; bounded payload; abuse monitoring; step-up challenge (e.g. Turnstile) only if measured abuse justifies and after server-side verification. | Burst tests, phone variants, shared NAT tests, forged forwarding-header tests |
| Invocation exhaustion | Flood calls public Edge Function, including invalid/429 responses | Minimize calls and duplicate retries; use idempotency; cache reads; maintain only four functions. A DB limiter does not make 429 invocation free. Upstream/WAF/platform mitigation may be needed for volumetric attacks; cost/plan decision required. | Load test and monitor organization/project invocation usage |
| Injection | SQL/HTML/script input reaches DB or page | Parameterized Supabase/PostgREST/RPC calls; strict type/schema/length/enum allowlists; render user text as text, sanitize any intentional rich content; no dynamic SQL concatenation from input. | Injection payload tests on every public field and admin editor |
| XSS / supply-chain script compromise | Malicious menu/customer text or third-party script steals session/data | Contextual escaping; avoid unsafe innerHTML; sanitize rich content; CSP with strict script sources/nonces or hashes where feasible; audit/remove unnecessary third-party scripts; pin/version and integrity-check external assets where supported; review source maps and build dependencies. | Stored/reflected DOM XSS tests, CSP report/violation review, dependency audit |
| CSRF / cross-origin abuse | Browser sends state-changing request using a victim's session | Staff sessions use Authorization bearer token; avoid cookie auth unless CSRF protections are added. Strict CORS allowlist for known origins; validate content type/method; origin checks as defense-in-depth, not authentication. Public guest order POST is intentionally unauthenticated and needs abuse controls. | Cross-origin tests, forged Origin, preflight and content-type tests |
| Order enumeration | Visitor discovers another customer's order | Do not expose GET-by-UUID or predictable order-number status endpoint. If customer tracking is needed, use a high-entropy expiring signed capability, store only its hash, rate-limit lookup and return minimal fields. | Enumeration and brute-force tests |
| PII/log leakage | Phone/address appears in logs, URLs, analytics or error telemetry | Redact request bodies, auth headers and PII. Do not put phone/address in query strings or event metadata. Restrict access to order PII; minimize Rider and POS projections. Retention policy for DB/backups/logs. | Inspect function logs, browser telemetry, analytics and error responses |
| Storage abuse | Malicious/oversized upload overwrites public menu image or exposes private files | Public site is read-only for published assets. Draft uploads require authenticated Admin/Owner, per-user/path constraints, MIME/size checks, generated object names and no overwrite of published versions. Private buckets for internal files. | Upload wrong MIME, oversized file, path traversal, overwrite/delete and list attempts |
| CORS / host abuse | Arbitrary origin reads responses | Exact allowlist of production and approved preview origins; no wildcard with credentials. CORS is not authorization and non-browser clients can call endpoints. | Origin matrix incl. hostile and null origin |
| Webhook replay (future integration) | Replayed payment/notification webhook duplicates financial action | Verify provider signature and timestamp, enforce unique provider event ID, idempotent transaction, bounded clock skew; no webhook integration until provider chosen. | Replay same event and invalid signature |
| Dependency/deployment compromise | Vulnerable library or malicious build workflow | Pin/audit dependencies, minimize third-party scripts, protect GitHub/Vercel permissions/secrets, review PRs, protect Production branch/deploy controls, use reproducible reviewed changes. | Dependency scan, GitHub/Vercel permission review, release checklist |
| Database abuse / exhaustion | Expensive queries, unbounded result sets, lock contention | Bound request sizes, rows, query time and function work; paginate; index real RLS/query paths; pool direct DB connections only when needed; rate-limit high-risk writes; avoid full-table scans and per-request limiter writes on reads. | Load/EXPLAIN tests and quota monitoring |
| Availability / Free-plan pause/quota | Paused project or exhausted storage/egress/invocations disrupts checkout | Budget calls, compress/cache catalog/media, narrow Realtime, external encrypted backups, documented restore/reactivation and manual quota checks. Free plan has no production uptime guarantee. | Simulate outage/restore; review project usage and alert thresholds |
| Audit repudiation | Actor denies rejection, cancellation or return | Actor from verified JWT/system identity; database timestamp; append-only audit with old/new state, reason and request ID. | Attempt forged actor, audit update/delete and concurrent commands |

## 4. Secure public website API contract

### Public catalog
- Expose only approved published catalog fields and delivery-area choices intended for customers.
- No raw mutable catalog, staff data, settings, order records, payment records, audit tables or private schema.
- Use immutable publication version/checksum and cache headers; never cache private/order responses publicly.
- Bound response size and query work.

### Website order creation
- Public route accepts only the website action/source. A visitor cannot select POS or staff source.
- Validate method, content type, maximum body size, JSON shape, field lengths, required values and allowed enum values before database work.
- Normalize phone consistently server-side. HMAC the normalized phone with a server-only key; never use plain SHA-256 phone hash for stored limiter identity.
- Validate delivery address, explicit listed-area vs Not Listed selection and active area/fee server-side. A missing Not Listed default blocks checkout; explicit configured zero is valid.
- Validate every product, variant, modifier, deal component, quantity, availability and menu publication. Do not accept browser-computed money.
- Website quota applies only to source=website. Evaluate all three rolling windows atomically with order creation. POS bypasses quota.
- Return only a safe order confirmation DTO. Never expose internal DB errors, raw rows or customer order lookup by predictable identifier.
- Keep website idempotency key on retry. Cap response time and avoid repeated Edge Function calls.
- Fail closed when required pricing, idempotency or quota enforcement is unavailable; do not silently accept an unchecked order.

### Customer data and tracking
- Do not expose a general public order GET route.
- Do not place PII in URLs, analytics tags, Realtime broadcasts or log messages.
- Customer tracking, if added, requires a separate high-entropy capability design, hashing, expiry, rate limit and minimal response.
- Phone quota is per typed phone, not proof of phone ownership. OTP is a separate product/cost decision, not silently assumed.

## 5. Web security headers and browser hardening

Before release, inspect the actual deployed response headers and add/test the following through the correct Vercel deployment configuration:
- Content-Security-Policy (start with report-only, inventory required script/style/image/connect sources, then enforce a workable least-privilege policy).
- Strict-Transport-Security after HTTPS/domains are confirmed.
- X-Content-Type-Options: nosniff.
- Referrer-Policy: strict-origin-when-cross-origin or stricter based on actual needs.
- Permissions-Policy disabling unused sensors/capabilities.
- frame-ancestors 'none' or the exact required frame policy via CSP; do not rely only on legacy X-Frame-Options.
- No wildcard CORS with credentials.
- Avoid exposing source maps publicly where they contain sensitive source/configuration.

Do not copy a generic CSP without checking inline scripts, Supabase endpoints, fonts, images, payment/analytics providers and current app behavior. Roll out in report-only, inspect violations, then enforce in a reviewed deployment.

## 6. Website quota and layered abuse defense

Owner-approved website-only order quotas:
- 3 committed orders / rolling 1 minute / normalized phone.
- 3 / rolling 10 minutes / normalized phone.
- 15 / rolling 1 hour / normalized phone.
- POS including delivery is exempt.

Count only new website orders that commit. Invalid/rolled-back orders do not count; later restaurant rejection/cancellation does not refund the slot. Exact idempotent retry does not count twice. A 429 from Edge still counts as an invocation.

Additional recommendations, to be assessed rather than blindly deployed:
1. Validate that Supabase ingress overwrites the actual client-IP header; do not trust browser X-Forwarded-For. Test forged headers before using IP limits.
2. Avoid a hard IP cap as the primary person identity because customers share mobile carrier NAT/Wi-Fi. Use IP only as a secondary abuse signal with safe thresholds if trustworthy.
3. Consider Turnstile or another managed challenge only when measured bot abuse justifies its friction and service dependency. Verify server-side token, hostname, action, expiry and replay.
4. Add a temporary challenge/cooldown for repeated malformed requests only if it does not consume successful-order slots; do not make invalid attempts create business orders.
5. Add monitoring for bursts, repeated phone hashes, abnormal failure ratios, suspicious source changes, invocation spikes and repeated idempotency conflicts.
6. Do not claim application rate limiting prevents volumetric invocation exhaustion. Upstream mitigation is required for that threat.

No additional paid service (Redis/Upstash/WAF/OTP/SMS) is assumed. Any such service requires a cost and dependency review.

## 7. Secure implementation and release gates

### Before implementation
- Inspect current website JavaScript for XSS sinks, unsafe DOM writes, third-party scripts, exposed secrets, PII in analytics, local/session storage use and dependency versions.
- Inspect actual Vercel response headers, domains, HTTPS redirects, preview exposure, cache rules and deployed build artifacts.
- Inspect all public Edge Function routes and CORS behavior; test source=pos forgery, JWT omission, action smuggling and oversized bodies.
- Confirm no service-role key or HMAC secret is present in website assets, repo, Git history or source maps.
- Review Supabase RLS, grants, exposed schemas, Storage policies and function execute grants on the isolated test DB.

### Before Production release
- Implement in local/isolated test first, not Production.
- Run RLS/IDOR, API authorization, input validation, injection, stored/reflected XSS, CSRF/CORS, replay/idempotency, order quota concurrency and rate-limit spoof tests.
- Run dependency/secrets scans and review Vercel/GitHub deployment permissions.
- Test CSP in report-only, then enforce after all legitimate resources are inventoried.
- Test rate-limit and API degraded behavior. Website must fail closed when the required order controls or canonical pricing cannot be checked.
- Perform realistic load tests against the Free-plan budgets; monitor Edge invocations, DB size, egress, Storage and Realtime.
- Take and restore-test encrypted database and Storage backups before any Production migration.
- Review findings and residual risks with the owner before enabling the public route.

## 8. Current status

This is a threat model and verification plan only. It does not mean these controls already exist. Current source audit already found important mismatches: Admin frontend admits Manager, current order limiter is a separate preflight design from Demo reference, source/schema fields and states need adapters, Rider return wording is inconsistent, and Admin performs multi-request direct REST writes. A full XSS/header/dependency/live-host security assessment still must be performed before claiming the website is hardened.

No Production database, Edge Function, Storage, secret, Vercel setting, header, domain, deployment or application code was modified by creating this document.
