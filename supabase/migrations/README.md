# Production migrations

This directory is intentionally not seeded with the old Demo migrations.

The Production database has only its initial security-baseline migration at this stage. The application schema, production catalog, delivery configuration, Auth/roles, Storage policies and Edge Function dependencies still need a reviewed Production migration set.

Only place reviewed, timestamped Production migrations here. Validate the target project ID (`adkrxfnawdiljhjaavnj`) and run an independent schema/RLS/security review before applying any file.

Historical Demo migrations live under `supabase/demo-reference/migrations/` and must never be deployed automatically.
