# Flame Chick POS — new-account Preview project checkpoint (2026-11-26)

## Vercel project

- Account: `imfahad0123-5106`
- Team: `FahaD` (`team_whJsonilovUt4vVCoIBD6L1m`, Hobby / Free)
- Project: `flame-chick-pos-development` (`prj_oWxuLLIJBMutlBzVX4Ko5N4jBWEw`)
- Repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Root directory: `apps/flame-chick-pos`
- Production branch: `main` (must not be deployed for this task)
- Working Preview branch: `work/production-source-audit`
- Reserved default Vercel hostname: `flame-chick-pos-development.vercel.app`
- SSO deployment protection is enabled.
- Project-specific Ignored Build Step is `exit 0` to skip automatic Git builds; an intentional manual Preview needs a controlled one-time override and restoration.
- At checkpoint: no deployments, no custom/live domains, and no Production deployment.

## Preview signing secret

- `QZ_SIGNING_PRIVATE_KEY` exists as Sensitive.
- Target: Preview only.
- Git branch restriction: `work/production-source-audit`.
- The value was never decrypted, read, logged, committed, or exposed in chat.
- The QZ signer verifies every returned signature against the public leaf certificate. The newly configured secret's match is not considered proven until a successful authorized Preview signing test.

## Source changes in this checkpoint

- POS diagnostic-download control recognizes Preview hostnames for this project/team: `flame-chick-pos-development-<preview-suffix>-faha-d.vercel.app`; previous Preview host patterns remain supported.
- QZ signing CORS now allows that exact project/team Preview hostname pattern. It requires HTTPS and origin-only headers, rejects custom ports/paths/credentials, and retains the previously approved Preview origins.
- The public `qz/digital-certificate.txt` remains leaf-only. The root CA stays outside the public web bundle and is used as QZ Tray trust material (the user's separate `override.crt`).
- The stale certificate test was updated to assert a single leaf certificate and its expected issuer; the old test incorrectly expected the root CA inside the browser-served PEM file.
- QZ signer origin-policy tests were added.
- The retired Apps Script compatibility paths remain in the source only as disabled fallbacks. The outdated key comment was corrected; `STAFF_API_KEY` remains empty, and the legacy reconciliation guard now exits while the Supabase V3 API is active.
- `.github/workflows/ci-ops-static.yml` now runs the QZ diagnostic Node test and checks the signer syntax.

## Preview validation plan

1. Create one manual Preview deployment from `work/production-source-audit` only; omit a Production target.
2. Restore the project's Ignored Build Step after the manual deployment is created.
3. Confirm the Preview builds and is SSO-protected.
4. Verify the public leaf certificate endpoint.
5. Verify that signer requests with no/invalid bearer token return 401.
6. Verify a signed-in, authorized POS staff session receives a signature that the server confirms against the public leaf certificate.
7. Use only synthetic diagnostics. Do not submit customer or kitchen print jobs or create test orders as part of deploy verification.

## Guardrails

- Never deploy or promote `main` or a Production target as part of this checkpoint.
- No Supabase schema, function, role, policy, or data changes were made.
- No real or synthetic customer orders/payments were created.
- Do not expose or add the QZ private key to Git, GitHub, chat, source files, or client assets.
- Physical printer cut/alignment remains unverified; no restaurant-PC access or hardware test is part of this task.
- Keep the four-app project setup independent; only the POS project is configured in this checkpoint.


## Production release checkpoint — 2026-11-26

- User explicitly approved the POS Production deployment and confirmed the hostname should be `flamechick-pos.vercel.app` (not `.vercel.com`).
- Production hostname `flamechick-pos.vercel.app` is attached to this POS project and verified by Vercel. The prior account's separate `flamechickpos.vercel.app` hostname was not detached or modified.
- Production deployment: `dpl_6VuqJfbd89a7f1V6TTV6L6n2CEjP`.
- Deployment state: `READY`; target: `production`.
- Deployment URL: `https://flame-chick-pos-development-3bbhwr2uj-faha-d.vercel.app`.
- Production alias: `https://flamechick-pos.vercel.app`.
- Exact source: `work/production-source-audit`, commit `f6ce0ea49aeb165fec382280dcc3f90c4747a706`.
- Production CI status checks reported success for the deployed commit.
- Before release, `api/qz/sign.js` was updated to allow `https://flamechick-pos.vercel.app`; the QZ origin-policy regression test accepts that hostname and explicitly rejects the invalid `.vercel.com` suffix.
- `QZ_SIGNING_PRIVATE_KEY` is Sensitive and scoped to Production. Its value was not decrypted or exposed. The production signer must still be validated through an authenticated POS session on the production hostname.
- The project's Ignored Build Step was temporarily set to `null` only to create this approved manual Production deployment, then restored to `exit 0` immediately afterward to prevent routine Git pushes from triggering extra deployments.
- Project SSO protection remains enabled for non-custom domains; the verified `flamechick-pos.vercel.app` project domain is configured as a production alias.
- No Supabase schema/data/function changes, no order/payment activity, and no physical printer test were performed by this release.
- Physical printer output, paper alignment and cutter operation remain pending. QZ Tray was previously verified to connect, trust the certificate, obtain valid signatures and submit jobs to the Windows queue on the development PC only.
- Next: sign in on `https://flamechick-pos.vercel.app`, verify the POS loads and the authenticated QZ signing flow works on Production using a synthetic/non-customer diagnostic. Keep live restaurant use and automatic/kitchen printing disabled until full end-to-end rehearsal and physical printer verification.
