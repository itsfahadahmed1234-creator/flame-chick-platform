-- Flame Chick deal-builder schema V1.
-- Extends the empty pre-launch deal tables with deal variants, per-variant
-- eligible option/pricing maps, timezone-aware schedule sets and branch schedule
-- overrides. Existing fields are retained for source compatibility.
-- No restaurant/menu data is seeded.

BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'DEAL_SCHEMA_MIGRATION_REQUIRES_POSTGRES';
  END IF;

  IF pg_catalog.to_regclass('public.deals') IS NULL
     OR pg_catalog.to_regclass('public.deal_collections') IS NULL
     OR pg_catalog.to_regclass('public.deal_component_groups') IS NULL
     OR pg_catalog.to_regclass('public.deal_component_options') IS NULL
     OR pg_catalog.to_regclass('public.catalog_schedule_sets') IS NULL
     OR pg_catalog.to_regclass('public.catalog_schedule_windows') IS NULL
     OR pg_catalog.to_regclass('public.branch_deal_availability') IS NULL THEN
    RAISE EXCEPTION 'DEAL_SCHEMA_PREREQUISITE_MISSING';
  END IF;

  IF pg_catalog.to_regclass('public.deal_variants') IS NOT NULL
     OR pg_catalog.to_regclass('public.deal_variant_component_options') IS NOT NULL
     OR pg_catalog.to_regclass('public.deal_schedule_assignments') IS NOT NULL THEN
    RAISE EXCEPTION 'DEAL_SCHEMA_OBJECT_ALREADY_EXISTS';
  END IF;
END;
$preflight$;

-- Every schedule set has an explicit IANA timezone. Backfill from the owning
-- restaurant for any pre-existing draft sets before making the field required.
ALTER TABLE public.catalog_schedule_sets
  ADD COLUMN timezone text;

UPDATE public.catalog_schedule_sets AS s
SET timezone = r.timezone
FROM public.restaurants AS r
WHERE r.id = s.restaurant_id
  AND s.timezone IS NULL;

DO $schedule_timezone_backfill$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.catalog_schedule_sets AS s
    WHERE s.timezone IS NULL
  ) THEN
    RAISE EXCEPTION 'DEAL_SCHEMA_SCHEDULE_TIMEZONE_BACKFILL_FAILED';
  END IF;
END;
$schedule_timezone_backfill$;

ALTER TABLE public.catalog_schedule_sets
  ALTER COLUMN timezone SET NOT NULL;

ALTER TABLE public.catalog_schedule_sets
  ADD CONSTRAINT catalog_schedule_sets_timezone_check
  CHECK (
    timezone = pg_catalog.btrim(timezone)
    AND pg_catalog.char_length(timezone) BETWEEN 1 AND 100
  );

CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_validate_timezone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'pg_catalog'
AS $function$
BEGIN
  IF NEW.timezone IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_timezone_names AS tz
       WHERE tz.name = NEW.timezone
     ) THEN
    RAISE EXCEPTION 'CATALOG_SCHEDULE_TIMEZONE_INVALID'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_validate_timezone() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_validate_timezone()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER catalog_schedule_sets_validate_timezone
BEFORE INSERT OR UPDATE OF timezone ON public.catalog_schedule_sets
FOR EACH ROW
EXECUTE FUNCTION app_private.flame_chick_catalog_validate_timezone();

-- A deal has separately purchasable variants (e.g. Regular / Family).
-- The existing deals.bundle_price remains only as a legacy DTO compatibility
-- field; all new pricing resolves through deal_variants.
CREATE TABLE public.deal_variants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  deal_id uuid NOT NULL,
  variant_key text NOT NULL,
  label_en text NOT NULL,
  label_ur text NULL,
  pricing_mode text NOT NULL,
  base_price numeric(12,2) NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT deal_variants_pkey PRIMARY KEY (id),
  CONSTRAINT deal_variants_id_deal_restaurant_key
    UNIQUE (id, deal_id, restaurant_id),
  CONSTRAINT deal_variants_deal_fkey
    FOREIGN KEY (deal_id, restaurant_id)
    REFERENCES public.deals(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT deal_variants_key_check
    CHECK (
      variant_key = pg_catalog.upper(pg_catalog.btrim(variant_key))
      AND variant_key ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'
    ),
  CONSTRAINT deal_variants_label_en_check
    CHECK (
      label_en = pg_catalog.btrim(label_en)
      AND pg_catalog.char_length(label_en) BETWEEN 1 AND 80
    ),
  CONSTRAINT deal_variants_label_ur_check
    CHECK (
      label_ur IS NULL OR (
        label_ur = pg_catalog.btrim(label_ur)
        AND pg_catalog.char_length(label_ur) <= 80
      )
    ),
  CONSTRAINT deal_variants_pricing_mode_check
    CHECK (pricing_mode IN ('FIXED_BUNDLE','BASE_PLUS_SELECTED_ITEMS')),
  CONSTRAINT deal_variants_base_price_check
    CHECK (base_price IS NULL OR base_price >= 0),
  CONSTRAINT deal_variants_sort_order_check CHECK (sort_order >= 0)
);

CREATE UNIQUE INDEX deal_variants_restaurant_deal_key_uidx
  ON public.deal_variants (restaurant_id, deal_id, variant_key);

CREATE INDEX deal_variants_restaurant_deal_active_sort_idx
  ON public.deal_variants (restaurant_id, deal_id, is_active, sort_order);

-- Each deal-variant maps only the explicitly allowed options from its own
-- deal's component groups. A missing mapping means the option is not allowed.
-- Pricing is per selected component unit:
-- INCLUDED = zero additional charge;
-- SURCHARGE = explicit unit_surcharge;
-- STANDALONE = server-resolved standalone product_variant.price.
CREATE TABLE public.deal_variant_component_options (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  deal_id uuid NOT NULL,
  deal_variant_id uuid NOT NULL,
  component_option_id uuid NOT NULL,
  pricing_treatment text NOT NULL,
  unit_surcharge numeric(12,2) NOT NULL DEFAULT 0,
  max_quantity_per_deal integer NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT deal_variant_component_options_pkey PRIMARY KEY (id),
  CONSTRAINT deal_variant_component_options_variant_key
    UNIQUE (deal_variant_id, component_option_id),
  CONSTRAINT deal_variant_component_options_id_deal_restaurant_key
    UNIQUE (id, deal_id, restaurant_id),
  CONSTRAINT deal_variant_component_options_variant_fkey
    FOREIGN KEY (deal_variant_id, deal_id, restaurant_id)
    REFERENCES public.deal_variants(id, deal_id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT deal_variant_component_options_option_fkey
    FOREIGN KEY (component_option_id, deal_id, restaurant_id)
    REFERENCES public.deal_component_options(id, deal_id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT deal_variant_component_options_treatment_check
    CHECK (pricing_treatment IN ('INCLUDED','SURCHARGE','STANDALONE')),
  CONSTRAINT deal_variant_component_options_surcharge_check
    CHECK (
      unit_surcharge >= 0
      AND (
        pricing_treatment = 'SURCHARGE'
        OR (
          pricing_treatment IN ('INCLUDED','STANDALONE')
          AND unit_surcharge = 0
        )
      )
    ),
  CONSTRAINT deal_variant_component_options_quantity_check
    CHECK (
      max_quantity_per_deal IS NULL
      OR max_quantity_per_deal BETWEEN 1 AND 100
    ),
  CONSTRAINT deal_variant_component_options_sort_check CHECK (sort_order >= 0)
);

CREATE INDEX deal_variant_component_options_variant_active_sort_idx
  ON public.deal_variant_component_options
    (restaurant_id, deal_variant_id, is_active, sort_order);

CREATE INDEX deal_variant_component_options_option_fk_idx
  ON public.deal_variant_component_options
    (component_option_id, deal_id, restaurant_id);

-- An explicit branch assignment overrides the deal-wide assignment.
-- If no deal assignment exists at either scope, the collection-level
-- schedule_set_id remains the legacy/global fallback.
CREATE TABLE public.deal_schedule_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  deal_id uuid NOT NULL,
  branch_id uuid NULL,
  schedule_set_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT deal_schedule_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT deal_schedule_assignments_id_restaurant_key
    UNIQUE (id, restaurant_id),
  CONSTRAINT deal_schedule_assignments_deal_fkey
    FOREIGN KEY (deal_id, restaurant_id)
    REFERENCES public.deals(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT deal_schedule_assignments_branch_fkey
    FOREIGN KEY (branch_id, restaurant_id)
    REFERENCES public.branches(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT deal_schedule_assignments_schedule_fkey
    FOREIGN KEY (schedule_set_id, restaurant_id)
    REFERENCES public.catalog_schedule_sets(id, restaurant_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX deal_schedule_assignments_global_uidx
  ON public.deal_schedule_assignments (restaurant_id, deal_id)
  WHERE branch_id IS NULL;

CREATE UNIQUE INDEX deal_schedule_assignments_branch_uidx
  ON public.deal_schedule_assignments (restaurant_id, deal_id, branch_id)
  WHERE branch_id IS NOT NULL;

CREATE INDEX deal_schedule_assignments_schedule_fk_idx
  ON public.deal_schedule_assignments (schedule_set_id, restaurant_id);

CREATE INDEX deal_schedule_assignments_branch_lookup_idx
  ON public.deal_schedule_assignments (restaurant_id, branch_id, deal_id, is_active)
  WHERE branch_id IS NOT NULL;

-- Strengthen the option-side composite key so the variant map FK proves
-- the option belongs to the same deal and restaurant as its deal variant.
ALTER TABLE public.deal_component_options
  ADD CONSTRAINT deal_component_options_id_deal_restaurant_key
  UNIQUE (id, deal_id, restaurant_id);

-- The collection schedule remains a fallback only. The deal-specific
-- assignment takes precedence; a branch-specific assignment takes precedence
-- over a deal-wide assignment for that branch.
COMMENT ON COLUMN public.deal_collections.schedule_set_id IS
  'Legacy/global fallback schedule. A deal-specific schedule assignment overrides this; branch-specific deal assignment overrides the global deal assignment.';

COMMENT ON COLUMN public.deals.bundle_price IS
  'Legacy compatibility field only. New Admin and pricing APIs must use deal_variants.base_price and its pricing_mode.';

COMMENT ON COLUMN public.deal_component_options.pricing_treatment IS
  'Legacy compatibility field only. New Admin and pricing APIs must use deal_variant_component_options.pricing_treatment.';

COMMENT ON COLUMN public.deal_component_options.unit_surcharge IS
  'Legacy compatibility field only. New Admin and pricing APIs must use deal_variant_component_options.unit_surcharge.';

COMMENT ON COLUMN public.catalog_schedule_sets.timezone IS
  'Validated IANA timezone used for weekly window evaluation; populated from branch timezone for branch-specific schedules or restaurant timezone for global schedules.';

-- Reuse the existing postgres-owned updated_at trigger function.
CREATE TRIGGER deal_variants_touch_updated_at
BEFORE UPDATE ON public.deal_variants
FOR EACH ROW
EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();

CREATE TRIGGER deal_variant_component_options_touch_updated_at
BEFORE UPDATE ON public.deal_variant_component_options
FOR EACH ROW
EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();

CREATE TRIGGER deal_schedule_assignments_touch_updated_at
BEFORE UPDATE ON public.deal_schedule_assignments
FOR EACH ROW
EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();

-- Defence in depth: deny direct Data API access; all new tables stay private
-- behind authenticated command functions added in a later migration.
ALTER TABLE public.deal_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_variant_component_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_schedule_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.deal_variants OWNER TO postgres;
ALTER TABLE public.deal_variant_component_options OWNER TO postgres;
ALTER TABLE public.deal_schedule_assignments OWNER TO postgres;

REVOKE ALL PRIVILEGES ON TABLE
  public.deal_variants,
  public.deal_variant_component_options,
  public.deal_schedule_assignments
FROM PUBLIC, anon, authenticated, service_role;

-- Existing schedule sets are RLS protected; they still have no application
-- grants/policies. The timezone field is accessed only by trusted functions.
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_validate_timezone()
  FROM PUBLIC, anon, authenticated, service_role;

DO $verify$
DECLARE
  v_table text;
  v_role text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'app_private.flame_chick_catalog_validate_timezone()'::regprocedure
      AND NOT p.prosecdef
      AND p.proconfig @> ARRAY['search_path=pg_catalog']
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
  ) THEN
    RAISE EXCEPTION 'DEAL_SCHEMA_TIMEZONE_TRIGGER_SECURITY_INVALID';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'public.deal_variants',
    'public.deal_variant_component_options',
    'public.deal_schedule_assignments'
  ] LOOP
    IF NOT (
      SELECT c.relrowsecurity
      FROM pg_catalog.pg_class AS c
      WHERE c.oid = v_table::regclass
    ) THEN
      RAISE EXCEPTION 'DEAL_SCHEMA_RLS_DISABLED';
    END IF;

    FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF pg_catalog.has_table_privilege(v_role, v_table, 'SELECT')
         OR pg_catalog.has_table_privilege(v_role, v_table, 'INSERT')
         OR pg_catalog.has_table_privilege(v_role, v_table, 'UPDATE')
         OR pg_catalog.has_table_privilege(v_role, v_table, 'DELETE') THEN
        RAISE EXCEPTION 'DEAL_SCHEMA_DIRECT_TABLE_GRANT_FOUND';
      END IF;
    END LOOP;
  END LOOP;
END;
$verify$;

COMMIT;
