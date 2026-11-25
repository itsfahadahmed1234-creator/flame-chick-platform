# Flame Chick Website — Parallel Branch Context Index

> **Purpose:** This is the entry point for resuming the isolated Flame Chick customer Website work. Read this index first, then read the full handoff linked below before inspecting or changing code.

## Dedicated branch

- Repository: [itsfahadahmed1234-creator/flame-chick-platform](https://github.com/itsfahadahmed1234-creator/flame-chick-platform)
- Branch: `work/website-parallel-development`
- Branch URL: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/tree/work/website-parallel-development

## Authoritative Website handoff

[Open the full Website parallel-development handoff](./2026-11-25-website-parallel-audit.md)

Direct URL:
https://github.com/itsfahadahmed1234-creator/flame-chick-platform/blob/work/website-parallel-development/docs/handoffs/2026-11-25-website-parallel-audit.md

The full handoff is the source of truth for:
- Website architecture and file map
- Implemented homepage, catalogue, product/deal popup, Burger selection, cart and checkout changes
- Branch isolation and Production protection rules
- Shared-backend dependencies requiring coordination
- Test results, deployment records and remaining manual checks

## Latest recorded Website checkpoint

- Implementation commit recorded in the handoff: `df04dc6f02014145edfee29ca10d3923de18f923`
- Preview URL recorded in the handoff: https://flame-chick-website-production-10vo2ei33-fahad-7455.vercel.app
- Vercel project: `flame-chick-website-production`
- Preview only. Do not promote it or assume checkout is safe.

The linked handoff contains later-stage details and must be checked against the actual branch head and Vercel deployment before relying on these checkpoint values.

## Resume instructions

1. Check out or inspect only `work/website-parallel-development`.
2. Read this index and the complete Website handoff.
3. Verify the branch's current HEAD, changed files, latest CI results and Preview deployment commit.
4. Continue from the existing Website implementation; do not rebuild it.
5. Keep the customer Website isolated from the separate Production/POS work.

## Non-negotiable isolation and safety

- Do not commit to or modify `work/production-source-audit`.
- Do not merge, cherry-pick, rebase, reset or overwrite the other chat's work.
- Do not independently modify POS, Admin, Rider, shared APIs, shared catalogue/deal validation, migrations or database schema.
- Do not publish catalogue data, create real orders/payments, change Production aliases, deploy Edge Functions, or exercise Production-backed checkout.
- Use safe Preview/mock data. The normal Website configuration may point at Production order services; never assume a Preview checkout is isolated.
- Coordinate any shared-backend dependency with the Production/POS coordinator first.

**Scope:** Existing Flame Chick customer Website only. GST/tax implementation remains deferred.
