-- Flame Chick Batch 2 — restaurant and branch foundation
-- Status: REVIEW CANDIDATE ONLY. Not an applied migration and NOT approved for Production.
-- Target: Flame Chick Production, PostgreSQL 17.12.
-- Expected execution identity: current_user = postgres AND session_user = postgres.
-- Preconditions: Batch 1 app_private exists and is owned by postgres; no prior
-- public.restaurants or public.branches relation exists.
--
-- Scope: exactly two tables. No seed rows, policies, public RPCs, views, functions,
-- triggers, Auth users, catalog, delivery-area, POS table, order, payment, or Realtime objects.
--
-- Source contract:
--   Website: Delivery -> delivery; Takeaway -> pickup.
--   POS: Delivery -> delivery; Takeaway -> pickup; Dine-in -> dine_in.
--   dine_in is POS-only. Website branch capability flags below intentionally cover
--   delivery/pickup only. See the POS fulfilment/offline-sync contract report.

BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION
      'STOP: Batch 2 must run as postgres (current_user=%, session_user=%)',
      current_user, session_user;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_namespace n
      JOIN pg_catalog.pg_roles r ON r.oid = n.nspowner
     WHERE n.nspname = 'app_private'
       AND r.rolname = 'postgres'
  ) THEN
    RAISE EXCEPTION
      'STOP: Batch 1 app_private schema is missing or not owned by postgres';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION
      'STOP: expected Supabase application roles are missing';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('restaurants', 'branches')
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  ) THEN
    RAISE EXCEPTION
      'STOP: public.restaurants or public.branches already exists; inspect and reconcile instead of reusing it';
  END IF;
END;
$preflight$;

CREATE TABLE public.restaurants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  currency_code text NOT NULL DEFAULT 'PKR',
  timezone text NOT NULL DEFAULT 'Asia/Karachi',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT restaurants_pkey PRIMARY KEY (id),
  CONSTRAINT restaurants_slug_key UNIQUE (slug),
  CONSTRAINT restaurants_name_format_check
    CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT restaurants_slug_format_check
    CHECK (
      char_length(slug) BETWEEN 1 AND 80
      AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  CONSTRAINT restaurants_currency_code_format_check
    CHECK (currency_code ~ '^[A-Z]{3}$')
);

COMMENT ON TABLE public.restaurants IS
  'Flame Chick restaurant tenant identity. Provision through an audited server-side command; no client table access.';
COMMENT ON COLUMN public.restaurants.timezone IS
  'IANA timezone. Validate against pg_timezone_names in trusted provisioning logic; a CHECK constraint cannot safely query that catalog.';
COMMENT ON COLUMN public.restaurants.currency_code IS
  'Three-letter uppercase currency code. Trusted provisioning validates the supported ISO-4217 code.';

CREATE TABLE public.branches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_code text NOT NULL,
  name text NOT NULL,
  address text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  website_ordering_enabled boolean NOT NULL DEFAULT false,
  website_delivery_enabled boolean NOT NULL DEFAULT false,
  website_pickup_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT branches_pkey PRIMARY KEY (id),
  CONSTRAINT branches_restaurant_id_fkey
    FOREIGN KEY (restaurant_id)
    REFERENCES public.restaurants (id)
    ON DELETE RESTRICT,
  CONSTRAINT branches_id_restaurant_id_key UNIQUE (id, restaurant_id),
  CONSTRAINT branches_restaurant_id_branch_code_key UNIQUE (restaurant_id, branch_code),
  CONSTRAINT branches_branch_code_format_check
    CHECK (
      char_length(branch_code) BETWEEN 1 AND 32
      AND branch_code ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'
    ),
  CONSTRAINT branches_name_format_check
    CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT branches_website_delivery_requires_ordering_check
    CHECK (NOT website_delivery_enabled OR website_ordering_enabled),
  CONSTRAINT branches_website_pickup_requires_ordering_check
    CHECK (NOT website_pickup_enabled OR website_ordering_enabled)
);

COMMENT ON TABLE public.branches IS
  'Operational Flame Chick branch. Public discovery is a future allowlisted projection; do not expose raw branch rows.';
COMMENT ON COLUMN public.branches.name IS
  'Customer-facing branch label; may be returned by a future explicitly allowlisted branch-discovery API.';
COMMENT ON COLUMN public.branches.address IS
  'Private operational branch address. Excluded from public branch discovery unless separately approved.';
COMMENT ON COLUMN public.branches.phone IS
  'Private operational branch phone. Excluded from public branch discovery unless separately approved.';
COMMENT ON COLUMN public.branches.website_ordering_enabled IS
  'Explicit master gate for customer website ordering at this branch; defaults disabled.';
COMMENT ON COLUMN public.branches.website_delivery_enabled IS
  'Website Delivery capability only. POS mode capability is not controlled by this flag.';
COMMENT ON COLUMN public.branches.website_pickup_enabled IS
  'Website Takeaway/Pickup capability only. Canonical fulfilment value is pickup.';
 
-- Public-schema RLS is explicit even though all application roles have no table grants.
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- No browser role or service_role direct table access in Batch 2.
-- Future server commands must receive only the exact privileges they require.
REVOKE ALL PRIVILEGES ON TABLE public.restaurants
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.branches
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.restaurants OWNER TO postgres;
ALTER TABLE public.branches OWNER TO postgres;

DO $verify$
DECLARE
  v_table text;
  v_role text;
  v_privilege text;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Batch 2 verification failed: execution identity changed';
  END IF;

  FOREACH v_table IN ARRAY ARRAY['public.restaurants', 'public.branches']
  LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname || '.' || c.relname = v_table
         AND c.relkind = 'r'
         AND c.relrowsecurity
         AND pg_catalog.pg_get_userbyid(c.relowner) = 'postgres'
    ) THEN
      RAISE EXCEPTION 'Batch 2 verification failed: %, owner or RLS check failed', v_table;
    END IF;

    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
    LOOP
      FOREACH v_privilege IN ARRAY ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]
      LOOP
        IF pg_catalog.has_table_privilege(v_role, v_table, v_privilege) THEN
          RAISE EXCEPTION
            'Batch 2 verification failed: role % has % on %',
            v_role, v_privilege, v_table;
        END IF;
      END LOOP;
    END LOOP;

    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies p
       WHERE p.schemaname = 'public'
         AND p.tablename = split_part(v_table, '.', 2)
    ) THEN
      RAISE EXCEPTION 'Batch 2 verification failed: unexpected policy exists on %', v_table;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_publication_tables p
       WHERE p.schemaname = 'public'
         AND p.tablename = split_part(v_table, '.', 2)
    ) THEN
      RAISE EXCEPTION 'Batch 2 verification failed: % unexpectedly added to Realtime publication', v_table;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.restaurants)
     OR EXISTS (SELECT 1 FROM public.branches) THEN
    RAISE EXCEPTION 'Batch 2 verification failed: migration must not seed business rows';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.branches'::regclass
       AND conname = 'branches_restaurant_id_fkey'
       AND contype = 'f'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.branches'::regclass
       AND conname = 'branches_id_restaurant_id_key'
       AND contype = 'u'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.branches'::regclass
       AND conname = 'branches_restaurant_id_branch_code_key'
       AND contype = 'u'
  ) THEN
    RAISE EXCEPTION 'Batch 2 verification failed: tenant/branch constraints are missing';
  END IF;

  RAISE NOTICE 'Batch 2 restaurant/branch ownership, RLS, ACL, FK, uniqueness, empty-data and Realtime checks passed';
END;
$verify$;

COMMIT;

-- Provisioning is intentionally separate from this schema migration.
-- Before enabling website ordering, an audited server-side command must:
--   * validate timezone against pg_timezone_names;
--   * validate currency_code against the supported ISO-4217 allowlist;
--   * create the restaurant and branch rows idempotently;
--   * keep website capability flags false until explicitly enabled;
--   * configure branch delivery areas and an explicit Not Listed fee before enabling Delivery.
--
-- Website resolution uses active restaurant + active branch + website_ordering_enabled
-- + the requested capability. Zero eligible branches fails closed; one auto-resolves;
-- multiple require customer choice. The chosen branch is revalidated on every command.
--
-- Website fulfilment: delivery/pickup only. POS fulfilment: delivery/pickup/dine_in.
-- Batch 2 creates no POS table configuration and no dine-in table records.
