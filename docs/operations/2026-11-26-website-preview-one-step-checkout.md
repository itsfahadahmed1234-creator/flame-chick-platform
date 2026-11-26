# Flame Chick Website Preview and One-Step Checkout

**Checkpoint date:** 26 November 2026  
**Scope:** Customer Website preview only. This checkpoint does not authorize deployment or configuration changes for POS, Admin, or Rider.

## Repository and deployment target

- Repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Branch: `work/website-parallel-development`
- Website source root: `apps/flame-chick-website`
- Current branch head at this checkpoint: `db38e95b698d3893f9d6b34930af7e22cc4c1f0c`
- Vercel project: `flamechick`
- Vercel project ID: `prj_MYylq6dmZrxfwCGHqRV1WLkg8yqo`
- Vercel team ID: `team_lrFy9ILYEz9umsBy98GCyQjI`
- Vercel Root Directory remains `apps/flame-chick-website`.

The GitHub Actions workflow `.github/workflows/deploy-flame-chick-website-preview.yml` is deliberately scoped to Website files and `work/website-parallel-development`. It invokes the Vercel CLI from the monorepo root to respect the configured app Root Directory. It uses the Website project ID above only; do not copy these IDs into any POS/Admin/Rider workflow.

## Verified deployment state

GitHub Actions deployment workflow run: [45739943217](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45739943217) — **success**.

### Temporary bootstrap

- Deployment ID: `dpl_BsV6ErBawCeBM2Kf6naoWQE7hc47`
- Target: `production`
- State: `READY`
- Alias list: empty
- Created using `vercel deploy --prod --skip-domain --yes`.
- Contents: a minimal noindex Website-project initialization page only, not the Flame Chick customer site.
- Do not promote it or assign any customer domain to it.

### Customer Website Preview

- Deployment ID: `dpl_9xzisV8Peyu3icQs1YA5HS1hqyrQ`
- URL: [https://flamechick-aczmr3zhf-befahad1234-7050.vercel.app](https://flamechick-aczmr3zhf-befahad1234-7050.vercel.app)
- State: `READY`
- Target: Preview (Vercel API target is null for this non-Production deployment)
- Git source: `work/website-parallel-development`, commit `db38e95b698d3893f9d6b34930af7e22cc4c1f0c`
- Alias list: empty
- Vercel Authentication / SSO protection remains enabled for Preview deployments.

The bootstrap and Preview deployments are separate deployment records. Neither has a domain alias. The project is not live, and `flamechick.vercel.app` has not been assigned to this project.

## Checkout implementation

The Website controller now sends one request with `action: 'place_website_order'` when a customer presses **Place order**. The browser does not request a signed quote first. The API calculates current prices, availability and delivery charges, enforces the website idempotency/rate-limit checks, and creates the order through the server-side database RPC.

The browser stores a single idempotency request ID and preserves the exact request for a retry after an uncertain response. The previous “Get verified total” step and its quote-token state have been removed from the active V3 Website checkout controller and the secondary order page.

The current Preview guard allows write operations only on the exact approved customer hostname `flamechick.vercel.app`. Preview hosts remain read-only. QA/test-order submission code was removed from the active Website controller. No test orders were created during this checkpoint.

Static Website checks passed on commit `fe24265b7be2f2ebfb79c2a416339910d4860962` (GitHub Actions run [45739801765](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45739801765)). The Preview deployment includes this code plus the subsequent workflow-only correction.

## Safety boundaries and remaining verification

- This Vercel project is for the **customer Website Preview only**. Do not use it for POS, Admin, or Rider.
- Do not promote the bootstrap deployment or assign `flamechick.vercel.app` until the customer Production release has been explicitly approved.
- Preview checkout is intentionally read-only. Do not create test or real orders from this Preview.
- No payment, kitchen preparation, rider dispatch, or restaurant operations were tested or enabled by this deployment.
- The Website's direct order-submit flow has passed static source checks but has **not** yet had a live end-to-end order submission test. Do not call checkout production-verified.
- The Supabase Production API version 8 contains the direct `place_website_order` action, but the website order commit path still needs its separately approved runtime verification after the production catalog/schema and operational readiness gates are complete.

## Next step

Open the protected Preview URL above while signed into the correct Vercel team. Review the storefront, published catalog, mobile layout and cart details. Confirm that Preview checkout is visibly read-only and cannot submit orders. Keep the customer production domain unassigned until the backend and end-to-end production release checks are approved.
