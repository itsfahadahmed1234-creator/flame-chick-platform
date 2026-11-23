# Project handoff addendum — local synthetic catalog preview (2026-11-23)

This addendum records the next checkpoint after the separate V3 non-ordering catalog preview page. Keep the original [PROJECT_HANDOFF.md](../../PROJECT_HANDOFF.md) as the main project history; this addendum supplements its latest-stage status.

## Source checkpoint

- Repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Working branch: `work/production-source-audit`
- Work was based on the previously verified branch head `1f9c45101e4b07cce0b4aaca6666c2d586e442d6`.
- New isolated local harness: `scripts/local-catalog-preview-fixture.mjs`
- Automated tests: `tests/local-catalog-preview-fixture.test.mjs`
- Test catalog source: `tests/fixtures/catalog-v3-fixture.cjs`
- User instructions: see [local fixture runbook](local-catalog-preview-fixture.md).

## What changed

A Node.js 22 HTTP server now provides an isolated browser review of the existing `catalog-preview.html` page, using a synthetic catalog fixture and the real V3 validator/view-model/rendering code.

Safety boundaries:
- The server binds to `127.0.0.1` only, requires loopback local and remote socket addresses, and requires a Host header matching the actual listener port.
- It serves a strict allowlist of preview assets; it does not serve the live storefront `index.html`, production `js/config.js`, arbitrary repository paths, or business APIs.
- It transforms the HTML to use a local-only config and mock catalog client. The config has an invalid API base, so accidentally falling back to the real catalog client cannot make a production request.
- The fixture loader fetches only `/__local-preview-fixture.json` from the same local origin and validates it with `FlameChickCatalogV3.validateSnapshot`.
- The page is explicitly labelled LOCAL SYNTHETIC FIXTURE / LOCAL TEST DATA ONLY. The sample data is artificial and is not the approved or published business menu.
- The sample deal has all-day windows for all seven weekdays.
- Responses use no-store and restrictive security headers. Only GET/HEAD are accepted; no mutation, cart, quote, checkout, payment or order operation exists.
- The harness file is outside `apps/flame-chick-website`, the Website Vercel project root, so the local server is not part of that deployed static root.

## Verification scope

CI now syntax-checks the local server and runs its automated integration tests. The checks cover loopback binding, exact host/port matching, synthetic page labels, V3 fixture validity, absence of Production API configuration, route allowlisting, method rejection and response security headers.

These tests do not substitute for the human visual browser review. The runbook explains how to start the server and review the desktop/mobile layout, branch/fulfilment controls, modifier selection and deal configurator.

## Explicitly unchanged / not done

- Customer storefront `index.html` unchanged.
- The current Vercel preview gate remains disabled; no Vercel deployment or domain operation.
- No Supabase migration applied, no Edge Function deployed, no catalog seeded or published, no storage bucket created.
- No order, quote, checkout, payment or rider/POS flow enabled.
- No edits to GitHub `main`.

## Next action

Run CI and resolve any failures. Then perform a human visual/interaction review using the local fixture on desktop and mobile viewport sizes. Only after that should the team move to the separate production backend/catalog readiness tasks; this fixture does not authorize deployment or publication.
