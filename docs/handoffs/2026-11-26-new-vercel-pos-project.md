# Flame Chick POS — new Vercel project connection (2026-11-26)

## Vercel destination

- Team: `befahad1234-7050's projects`
- Team ID: `team_lrFy9ILYEz9umsBy98GCyQjI` (Hobby / Free)
- Project: `flame-chick-pos-production`
- Project ID: `prj_gWdAt4laY3HDNPKRScmBWuYzQLmR`
- Git repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Root directory: `apps/flame-chick-pos`
- Node.js: `22.x`
- Production branch: `main`
- Preview branch tracking: `All unassigned branches`
- SSO protection: enabled for deployments except custom domains
- At checkpoint: no deployments and no custom domains attached to this project.

## QZ signer secret

The user added `QZ_SIGNING_PRIVATE_KEY` in the Vercel project. The variable is stored as Sensitive and is scoped to **Preview only**. The secret value was not retrieved or displayed. The supplied private key file was checked locally with OpenSSL; the key is valid, and its public key matches the leaf certificate in `apps/flame-chick-pos/qz/digital-certificate.txt` after this checkpoint's update. The leaf certificate chains to the provided local root CA.

Never copy the private key into Git, GitHub Actions, source code, chat, or a client bundle. Do not add it to Production or Development unless separately approved.

## QZ signer origin policy

The signer in `apps/flame-chick-pos/api/qz/sign.js` allows the project-specific Vercel system hostname and Preview deployment hostnames for this destination project, in addition to previously documented origin hosts. Requests still require:
- valid Supabase access token;
- matching authenticated user and active POS staff context;
- Admin, Owner, Manager, or Cashier role with a branch ID;
- server-only QZ private signing key.

No signer handshake has yet been tested against the new project. No print has been attempted.

## Deployment workflow

Vercel native Git integration is now attached to the intended GitHub repository. The prior `.github/workflows/deploy-flame-chick-pos-preview.yml` GitHub Actions path, which targeted the earlier temporary `flamechickpos` project, has been made a no-op. Production branch stays `main`; the branch `work/production-source-audit` should create Preview deployments only.

## Safety and remaining validation

- No Production deployment has been started from this project.
- No custom/live domain was assigned.
- No Supabase resource or data was changed.
- Kitchen printing remains disabled; browser print fallback remains.
- No test orders should be created as part of deployment checks.
- After Preview is READY, verify SSO access, certificate endpoint, signer 401 for missing/invalid session, and a real authorized staff signing response. Only then configure QZ Tray root trust on the cashier PC (inspect and back up any existing override trust file first).
- Complete the controlled end-to-end rehearsal before any live operational cutover.
