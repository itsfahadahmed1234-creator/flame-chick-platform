# Security policy

- Never commit `.env`, `.env.local`, Vercel OIDC tokens, database passwords, recovery codes, service-role keys, Supabase secret keys, private signing keys, or credentials.
- Browser code may contain only the Supabase Project URL and publishable key.
- Edge Function service credentials and branch/redirect configuration belong in the Supabase Function Secrets store.
- All four apps use the Flame Chick Production Supabase project only. Never use HFP/Pizza Bite URLs, keys, Auth users, records, or storage.
- Historical Demo migrations are kept outside `supabase/migrations/` and must not be deployed automatically.
- Review all SQL, RLS, views, functions, triggers, storage policies, grants and default privileges before applying schema changes.
- Do not put customer, order, staff, rider, or operational data in Git.
