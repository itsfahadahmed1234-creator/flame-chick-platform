# Production environment and deployment gates

## Supabase target

- Project: Flame Chick Production
- Ref: `adkrxfnawdiljhjaavnj`
- URL: `https://adkrxfnawdiljhjaavnj.supabase.co`
- Region: Mumbai (`ap-south-1`)
- Plan: Free

All four apps use this one backend. Browser apps may contain the publishable key only. Never put service-role or secret keys in frontend code.

## Edge Function secrets

Configure these in Supabase Dashboard > Project Settings > Edge Functions > Secrets (or the supported secrets interface):

- `SUPABASE_URL` = Production URL
- `SUPABASE_ANON_KEY` = Production legacy anon key, only if retained for compatibility
- `SUPABASE_PUBLISHABLE_KEYS` = JSON map containing the Production publishable key(s)
- `SUPABASE_SERVICE_ROLE_KEY` = Production service-role secret, server-side only
- `FLAME_CHICK_MAIN_BRANCH_ID` = Main Branch UUID created by the reviewed Production seed migration; required by staff checks in the order API
- `FLAME_CHICK_RIDER_PORTAL_URL` = approved final Rider portal URL; used for staff invitation redirects and Web Push notification clicks. If unset, Rider notification clicks open the service worker's own app scope.

Do not paste secret values in chat or commit them.

## Deployment sequence

1. Review and apply the Production schema and security migrations.
2. Seed the restaurant/Main Branch and approved active menu. Leave unconfirmed fees/prices unset.
3. Provision the owner and staff roles.
4. Configure Storage buckets and policy.
5. Configure Edge Function secrets.
6. Deploy and smoke-test the four Edge Functions.
7. Configure Vercel project environment and root directory for each app.
8. Use preview deployments for all four apps.
9. Test menu, checkout, POS, Admin, rider assignment, completion, failure and returns.
10. Only after explicit cutover approval, switch custom domains/production traffic.

Current repo migration is source organization only; no Vercel project or Production database was changed by adding these files.
