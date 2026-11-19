# Production readiness checklist

## Completed repository work

- [x] New private repository owned by Flame Chick account.
- [x] Four app roots copied from the latest Flame Chick storefront source.
- [x] Browser clients updated to the Flame Chick Production Project URL and publishable key.
- [x] Four Edge Function source folders organized under `supabase/functions/`.
- [x] Production `supabase/config.toml` created with the Production project ref.
- [x] Nine original Demo migrations archived outside the deployable migrations folder.
- [x] Website media copied: 59 scroll frames, 11 product images, hero photo and hero video.
- [x] No old Demo project ref, old Demo publishable key, or HFP project ref found by the final source scan.

## Pending before deploy

- [ ] Review/reconstruct and apply the Production business schema and RLS policies.
- [ ] Build Production catalog/migration set from the current live menu and agreed future menu model.
- [ ] Seed restaurant/Main Branch; set the resulting branch UUID as `FLAME_CHICK_MAIN_BRANCH_ID`.
- [ ] Set actual delivery areas/fees in Admin; leave default fee unset until owner configures it.
- [ ] Set server-side Supabase Function Secrets; never commit them.
- [ ] Set `FLAME_CHICK_RIDER_PORTAL_URL` to the final Rider portal URL after preview hosting is chosen.
- [ ] Deploy and smoke-test all four Edge Functions against Production.
- [ ] Configure and test Storage bucket/policies and Admin product uploads.
- [ ] Configure the four Vercel projects to this repository and matching root directories, without removing old deployments.
- [ ] Test owner Admin login, menu publication, customer checkout, POS status workflow, rider assignment, acceptance, pickup, delivered, failed and return cases.
- [ ] Verify payment, inventory and audit behavior where applicable.
- [ ] Only after successful checks and explicit cutover approval, switch production domains/traffic.

## Do not do yet

Do not deploy the app to live custom domains, apply Demo-specific zero-fee migrations, create fake default delivery fees, or copy Demo Auth users/orders into Production.
