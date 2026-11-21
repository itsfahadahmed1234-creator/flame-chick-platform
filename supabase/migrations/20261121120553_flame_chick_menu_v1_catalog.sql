-- Flame Chick menu-driven catalog V1 schema candidate.
-- Generated with Supabase CLI v3.2.0 as 20261121120553_flame_chick_menu_v1_catalog.sql.
-- REVIEW ONLY: do not apply to Production until the migration and CI tests are approved.
--
-- Scope:
--   * Typed variants (portion / flavour / pack / volume) and deal-only sellability.
--   * Exact product_variant_id modifier price rules.
--   * Deal collections, individual deals, component groups/options, branch availability.
--   * Weekly / one-off schedules with branch timezone override.
--   * Draft revision, append-only audit, immutable publication snapshot + current pointer.
--
-- This migration intentionally creates no catalog commands / pricing RPCs and inserts
-- no menu, restaurant, staff, deal, or schedule data. Those are separate implementation
-- stages. All new public tables remain RLS-enabled and inaccessible to app roles.

BEGIN;

DO $preflight$
DECLARE
  v_table text;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION
      'STOP: Flame Chick menu V1 migration must run as postgres (current_user=%, session_user=%)',
      current_user, session_user;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace n
    JOIN pg_catalog.pg_roles r ON r.oid = n.nspowner
    WHERE n.nspname = 'app_private' AND r.rolname = 'postgres'
  ) THEN
    RAISE EXCEPTION 'STOP: app_private schema missing or not owned by postgres';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'restaurants', 'branches', 'categories', 'products', 'product_variants',
    'modifier_groups', 'modifiers', 'modifier_group_assignments',
    'modifier_price_rules', 'branch_product_availability',
    'branch_variant_availability'
  ] LOOP
    IF pg_catalog.to_regclass('public.' || v_table) IS NULL THEN
      RAISE EXCEPTION 'STOP: prerequisite relation public.% is missing', v_table;
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'deal_collections', 'deals', 'deal_component_groups',
    'deal_component_options', 'branch_deal_availability',
    'catalog_schedule_sets', 'catalog_schedule_windows',
    'catalog_draft_state', 'catalog_audit_log',
    'catalog_publications', 'catalog_current_publication'
  ] LOOP
    IF pg_catalog.to_regclass('public.' || v_table) IS NOT NULL THEN
      RAISE EXCEPTION 'STOP: public.% already exists; inspect schema drift before continuing', v_table;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_variants'
      AND column_name IN ('variant_kind', 'pack_quantity', 'pack_unit', 'is_standalone_sellable')
  ) THEN
    RAISE EXCEPTION 'STOP: one or more V1 product variant columns already exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'branches'
      AND column_name = 'timezone'
  ) THEN
    RAISE EXCEPTION 'STOP: public.branches.timezone already exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role'
  ) THEN
    RAISE EXCEPTION 'STOP: expected Supabase application roles are missing';
  END IF;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Variant semantics
-- ---------------------------------------------------------------------------

ALTER TABLE public.product_variants
  ADD COLUMN variant_kind text NOT NULL DEFAULT 'standard',
  ADD COLUMN pack_quantity integer NULL,
  ADD COLUMN pack_unit text NULL,
  ADD COLUMN is_standalone_sellable boolean NOT NULL DEFAULT true;

ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_variant_kind_check
    CHECK (variant_kind IN ('standard', 'portion', 'flavour', 'pack', 'volume')),
  ADD CONSTRAINT product_variants_pack_quantity_check
    CHECK (pack_quantity IS NULL OR pack_quantity > 0),
  ADD CONSTRAINT product_variants_pack_unit_check
    CHECK (
      pack_unit IS NULL OR
      (pack_unit = pg_catalog.btrim(pack_unit)
       AND pg_catalog.char_length(pack_unit) BETWEEN 1 AND 24)
    ),
  ADD CONSTRAINT product_variants_pack_metadata_check
    CHECK (
      (variant_kind = 'pack' AND pack_quantity IS NOT NULL AND pack_unit IS NOT NULL)
      OR
      (variant_kind <> 'pack' AND pack_quantity IS NULL AND pack_unit IS NULL)
    );

COMMENT ON COLUMN public.product_variants.variant_kind IS
  'Menu-specific meaning of this one-dimensional sellable variant: standard, portion, flavour, pack, or volume.';
COMMENT ON COLUMN public.product_variants.pack_quantity IS
  'Positive item count for pack variants, e.g. 12 nuggets or 6 wings.';
COMMENT ON COLUMN public.product_variants.pack_unit IS
  'Pack count unit such as pcs; present only for variant_kind=pack.';
COMMENT ON COLUMN public.product_variants.is_standalone_sellable IS
  'False for active deal-only component variants such as a six-piece nuggets portion, fries, juice, or a 1L drink not sold separately.';

-- ---------------------------------------------------------------------------
-- 2. Exact product_variant_id modifier price rules
-- ---------------------------------------------------------------------------

ALTER TABLE public.modifier_price_rules
  ADD COLUMN product_variant_id uuid NULL;

-- Preserve any pre-existing authoring data by resolving the exact current variant
-- through the existing same-restaurant/product/size_key uniqueness constraint.
UPDATE public.modifier_price_rules AS mpr
SET product_variant_id = pv.id
FROM public.product_variants AS pv
WHERE pv.restaurant_id = mpr.restaurant_id
  AND pv.product_id = mpr.product_id
  AND pv.size_key = mpr.size_key;

DO $variant_price_rule_check$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.modifier_price_rules
    WHERE product_variant_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'STOP: one or more modifier price rules could not be mapped to an exact product variant';
  END IF;
END;
$variant_price_rule_check$;

ALTER TABLE public.modifier_price_rules
  ALTER COLUMN product_variant_id SET NOT NULL;

ALTER TABLE public.modifier_price_rules
  DROP CONSTRAINT modifier_price_rules_product_variant_key_fkey,
  DROP CONSTRAINT modifier_price_rules_modifier_product_size_key,
  DROP CONSTRAINT modifier_price_rules_size_key_check;

DROP INDEX IF EXISTS public.modifier_price_rules_lookup_idx;
DROP INDEX IF EXISTS public.modifier_price_rules_product_variant_fk_idx;

ALTER TABLE public.modifier_price_rules
  ADD CONSTRAINT modifier_price_rules_modifier_variant_key
    UNIQUE (modifier_id, product_variant_id),
  ADD CONSTRAINT modifier_price_rules_variant_fkey
    FOREIGN KEY (product_variant_id, restaurant_id, product_id)
    REFERENCES public.product_variants(id, restaurant_id, product_id)
    ON DELETE RESTRICT;

ALTER TABLE public.modifier_price_rules
  DROP COLUMN size_key;

CREATE INDEX modifier_price_rules_variant_lookup_idx
  ON public.modifier_price_rules (restaurant_id, product_variant_id, modifier_id);

COMMENT ON COLUMN public.modifier_price_rules.product_variant_id IS
  'Exact sellable product variant for this modifier price; do not resolve pricing by a reusable size label/key.';

-- ---------------------------------------------------------------------------
-- 3. Branch timezone override
-- ---------------------------------------------------------------------------

ALTER TABLE public.branches
  ADD COLUMN timezone text NULL,
  ADD CONSTRAINT branches_timezone_format_check
    CHECK (
      timezone IS NULL OR
      (timezone = pg_catalog.btrim(timezone)
       AND pg_catalog.char_length(timezone) BETWEEN 1 AND 64)
    );

COMMENT ON COLUMN public.branches.timezone IS
  'Optional IANA timezone override for local schedule evaluation; NULL inherits restaurants.timezone.';

CREATE FUNCTION app_private.flame_chick_branch_timezone_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW.timezone IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_timezone_names AS tz
       WHERE tz.name = NEW.timezone
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Branch timezone must be a valid PostgreSQL/IANA timezone name';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := pg_catalog.transaction_timestamp();
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION app_private.flame_chick_branch_timezone_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_branch_timezone_guard()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER branches_timezone_guard
  BEFORE INSERT OR UPDATE OF timezone
  ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION app_private.flame_chick_branch_timezone_guard();

-- ---------------------------------------------------------------------------
-- 4. Reusable schedules
-- ---------------------------------------------------------------------------

CREATE TABLE public.catalog_schedule_sets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT catalog_schedule_sets_pkey PRIMARY KEY (id),
  CONSTRAINT catalog_schedule_sets_id_restaurant_key UNIQUE (id, restaurant_id),
  CONSTRAINT catalog_schedule_sets_restaurant_fkey
    FOREIGN KEY (restaurant_id)
    REFERENCES public.restaurants(id)
    ON DELETE RESTRICT,
  CONSTRAINT catalog_schedule_sets_name_check
    CHECK (
      name = pg_catalog.btrim(name)
      AND pg_catalog.char_length(name) BETWEEN 1 AND 120
    )
);

CREATE INDEX catalog_schedule_sets_restaurant_active_idx
  ON public.catalog_schedule_sets (restaurant_id, is_active);

CREATE TABLE public.catalog_schedule_windows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  schedule_set_id uuid NOT NULL,
  window_kind text NOT NULL,
  weekday_iso smallint NULL,
  local_start time without time zone NULL,
  local_end time without time zone NULL,
  is_all_day boolean NOT NULL DEFAULT false,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  effective_from date NULL,
  effective_to date NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT catalog_schedule_windows_pkey PRIMARY KEY (id),
  CONSTRAINT catalog_schedule_windows_id_restaurant_key UNIQUE (id, restaurant_id),
  CONSTRAINT catalog_schedule_windows_schedule_fkey
    FOREIGN KEY (schedule_set_id, restaurant_id)
    REFERENCES public.catalog_schedule_sets(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT catalog_schedule_windows_kind_check
    CHECK (window_kind IN ('WEEKLY', 'ONE_OFF')),
  CONSTRAINT catalog_schedule_windows_effective_dates_check
    CHECK (
      effective_from IS NULL OR effective_to IS NULL OR effective_from <= effective_to
    ),
  CONSTRAINT catalog_schedule_windows_shape_check
    CHECK (
      (
        window_kind = 'WEEKLY'
        AND weekday_iso BETWEEN 1 AND 7
        AND starts_at IS NULL
        AND ends_at IS NULL
        AND (
          (is_all_day AND local_start IS NULL AND local_end IS NULL)
          OR
          (NOT is_all_day AND local_start IS NOT NULL
           AND local_end IS NOT NULL AND local_start <> local_end)
        )
      )
      OR
      (
        window_kind = 'ONE_OFF'
        AND weekday_iso IS NULL
        AND local_start IS NULL
        AND local_end IS NULL
        AND is_all_day = false
        AND starts_at IS NOT NULL
        AND ends_at IS NOT NULL
        AND ends_at > starts_at
        AND effective_from IS NULL
        AND effective_to IS NULL
      )
    )
);

CREATE INDEX catalog_schedule_windows_schedule_idx
  ON public.catalog_schedule_windows
  (schedule_set_id, restaurant_id, window_kind, weekday_iso);

CREATE INDEX catalog_schedule_windows_restaurant_idx
  ON public.catalog_schedule_windows (restaurant_id, schedule_set_id);

COMMENT ON TABLE public.catalog_schedule_sets IS
  'Reusable restaurant schedule set. Effective timezone is branch override when present, otherwise restaurant timezone.';
COMMENT ON COLUMN public.catalog_schedule_windows.weekday_iso IS
  'ISO weekday: Monday=1 through Sunday=7. Weekly overnight windows are evaluated against this originating weekday.';
COMMENT ON COLUMN public.catalog_schedule_windows.local_end IS
  'Weekly interval end is exclusive. A time earlier than local_start denotes an overnight interval.';
COMMENT ON COLUMN public.catalog_schedule_windows.effective_to IS
  'Optional final local calendar date on which a recurring weekly window is effective, inclusive.';
COMMENT ON COLUMN public.catalog_schedule_windows.ends_at IS
  'One-off interval end is exclusive.';

-- ---------------------------------------------------------------------------
-- 5. Deal collections, deals, component groups/options
-- ---------------------------------------------------------------------------

CREATE TABLE public.deal_collections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  category_id uuid NOT NULL,
  category_kind text NOT NULL DEFAULT 'deal',
  schedule_set_id uuid NULL,
  name_en text NOT NULL,
  name_ur text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT deal_collections_pkey PRIMARY KEY (id),
  CONSTRAINT deal_collections_id_restaurant_key UNIQUE (id, restaurant_id),
  CONSTRAINT deal_collections_category_fkey
    FOREIGN KEY (category_id, restaurant_id, category_kind)
    REFERENCES public.categories(id, restaurant_id, category_kind)
    ON DELETE RESTRICT,
  CONSTRAINT deal_collections_schedule_fkey
    FOREIGN KEY (schedule_set_id, restaurant_id)
    REFERENCES public.catalog_schedule_sets(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT deal_collections_category_kind_check CHECK (category_kind = 'deal'),
  CONSTRAINT deal_collections_name_en_check
    CHECK (
      name_en = pg_catalog.btrim(name_en)
      AND pg_catalog.char_length(name_en) BETWEEN 1 AND 120
    ),
  CONSTRAINT deal_collections_name_ur_check
    CHECK (
      name_ur IS NULL OR
      (name_ur = pg_catalog.btrim(name_ur)
       AND pg_catalog.char_length(name_ur) <= 120)
    ),
  CONSTRAINT deal_collections_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX deal_collections_restaurant_category_sort_idx
  ON public.deal_collections (restaurant_id, category_id, is_active, sort_order);

CREATE INDEX deal_collections_category_fk_idx
  ON public.deal_collections (category_id, restaurant_id, category_kind);

CREATE INDEX deal_collections_schedule_fk_idx
  ON public.deal_collections (schedule_set_id, restaurant_id);

CREATE TABLE public.deals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  collection_id uuid NOT NULL,
  legacy_id text NULL,
  title text NOT NULL,
  title_ur text NULL,
  description_en text NULL,
  description_ur text NULL,
  bundle_price numeric(12,2) NULL,
  image_current_path text NULL,
  image_previous_path text NULL,
  featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  is_available boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT deals_pkey PRIMARY KEY (id),
  CONSTRAINT deals_id_restaurant_key UNIQUE (id, restaurant_id),
  CONSTRAINT deals_collection_fkey
    FOREIGN KEY (collection_id, restaurant_id)
    REFERENCES public.deal_collections(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT deals_title_check
    CHECK (
      title = pg_catalog.btrim(title)
      AND pg_catalog.char_length(title) BETWEEN 1 AND 160
    ),
  CONSTRAINT deals_title_ur_check
    CHECK (
      title_ur IS NULL OR
      (title_ur = pg_catalog.btrim(title_ur)
       AND pg_catalog.char_length(title_ur) <= 160)
    ),
  CONSTRAINT deals_bundle_price_check
    CHECK (bundle_price IS NULL OR bundle_price >= 0),
  CONSTRAINT deals_sort_order_check CHECK (sort_order >= 0)
);

CREATE UNIQUE INDEX deals_restaurant_legacy_id_uidx
  ON public.deals (restaurant_id, legacy_id)
  WHERE legacy_id IS NOT NULL;

CREATE INDEX deals_collection_active_sort_idx
  ON public.deals (restaurant_id, collection_id, is_active, is_available, sort_order);

CREATE INDEX deals_collection_fk_idx
  ON public.deals (collection_id, restaurant_id);

CREATE TABLE public.deal_component_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  deal_id uuid NOT NULL,
  name_en text NOT NULL,
  name_ur text NULL,
  min_units integer NOT NULL DEFAULT 0,
  max_units integer NOT NULL DEFAULT 1,
  allow_repeat_option boolean NOT NULL DEFAULT false,
  max_units_per_option integer NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT deal_component_groups_pkey PRIMARY KEY (id),
  CONSTRAINT deal_component_groups_id_deal_restaurant_key UNIQUE (id, deal_id, restaurant_id),
  CONSTRAINT deal_component_groups_deal_fkey
    FOREIGN KEY (deal_id, restaurant_id)
    REFERENCES public.deals(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT deal_component_groups_name_en_check
    CHECK (
      name_en = pg_catalog.btrim(name_en)
      AND pg_catalog.char_length(name_en) BETWEEN 1 AND 120
    ),
  CONSTRAINT deal_component_groups_name_ur_check
    CHECK (
      name_ur IS NULL OR
      (name_ur = pg_catalog.btrim(name_ur)
       AND pg_catalog.char_length(name_ur) <= 120)
    ),
  CONSTRAINT deal_component_groups_units_check
    CHECK (min_units >= 0 AND max_units >= 1 AND min_units <= max_units AND max_units <= 100),
  CONSTRAINT deal_component_groups_option_limit_check
    CHECK (
      max_units_per_option IS NULL
      OR (max_units_per_option >= 1 AND max_units_per_option <= max_units)
    ),
  CONSTRAINT deal_component_groups_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX deal_component_groups_deal_sort_idx
  ON public.deal_component_groups (restaurant_id, deal_id, is_active, sort_order);

CREATE INDEX deal_component_groups_deal_fk_idx
  ON public.deal_component_groups (deal_id, restaurant_id);

CREATE TABLE public.deal_component_options (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  deal_id uuid NOT NULL,
  component_group_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_variant_id uuid NOT NULL,
  pricing_treatment text NOT NULL,
  unit_surcharge numeric(12,2) NOT NULL DEFAULT 0,
  max_quantity_per_deal integer NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT deal_component_options_pkey PRIMARY KEY (id),
  CONSTRAINT deal_component_options_id_restaurant_key UNIQUE (id, restaurant_id),
  CONSTRAINT deal_component_options_group_fkey
    FOREIGN KEY (component_group_id, deal_id, restaurant_id)
    REFERENCES public.deal_component_groups(id, deal_id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT deal_component_options_product_fkey
    FOREIGN KEY (product_id, restaurant_id)
    REFERENCES public.products(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT deal_component_options_variant_fkey
    FOREIGN KEY (product_variant_id, restaurant_id, product_id)
    REFERENCES public.product_variants(id, restaurant_id, product_id)
    ON DELETE RESTRICT,
  CONSTRAINT deal_component_options_pricing_treatment_check
    CHECK (pricing_treatment IN ('INCLUDED', 'SURCHARGE', 'STANDALONE')),
  CONSTRAINT deal_component_options_surcharge_check
    CHECK (
      unit_surcharge >= 0
      AND (
        (pricing_treatment = 'SURCHARGE')
        OR
        (pricing_treatment IN ('INCLUDED', 'STANDALONE') AND unit_surcharge = 0)
      )
    ),
  CONSTRAINT deal_component_options_quantity_check
    CHECK (max_quantity_per_deal IS NULL OR max_quantity_per_deal BETWEEN 1 AND 100),
  CONSTRAINT deal_component_options_sort_order_check CHECK (sort_order >= 0),
  CONSTRAINT deal_component_options_group_variant_key
    UNIQUE (component_group_id, product_variant_id)
);

CREATE INDEX deal_component_options_group_sort_idx
  ON public.deal_component_options
  (restaurant_id, deal_id, component_group_id, is_active, sort_order);

CREATE INDEX deal_component_options_product_fk_idx
  ON public.deal_component_options (product_id, restaurant_id);

CREATE INDEX deal_component_options_variant_fk_idx
  ON public.deal_component_options (product_variant_id, restaurant_id, product_id);

COMMENT ON TABLE public.deal_component_options IS
  'Explicit per-deal allowlist of exact product variants. INCLUDED adds zero; SURCHARGE adds explicit unit_surcharge per chosen unit; STANDALONE charges the published variant price for a genuine extra slot.';
COMMENT ON COLUMN public.deal_component_groups.allow_repeat_option IS
  'Whether a customer may choose the same option repeatedly to satisfy multiple component units; validated by quote and checkout.';
COMMENT ON COLUMN public.deal_component_groups.max_units_per_option IS
  'Optional cap per individual option; when NULL, the group-level max still applies.';

-- ---------------------------------------------------------------------------
-- 6. Branch-level deal availability
-- ---------------------------------------------------------------------------

CREATE TABLE public.branch_deal_availability (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  deal_id uuid NOT NULL,
  is_available boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT branch_deal_availability_pkey PRIMARY KEY (id),
  CONSTRAINT branch_deal_availability_branch_deal_key UNIQUE (branch_id, deal_id),
  CONSTRAINT branch_deal_availability_branch_fkey
    FOREIGN KEY (branch_id, restaurant_id)
    REFERENCES public.branches(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT branch_deal_availability_deal_fkey
    FOREIGN KEY (deal_id, restaurant_id)
    REFERENCES public.deals(id, restaurant_id)
    ON DELETE RESTRICT
);

CREATE INDEX branch_deal_availability_branch_idx
  ON public.branch_deal_availability (branch_id, is_available);

CREATE INDEX branch_deal_availability_branch_fk_idx
  ON public.branch_deal_availability (branch_id, restaurant_id);

CREATE INDEX branch_deal_availability_deal_fk_idx
  ON public.branch_deal_availability (deal_id, restaurant_id);

-- ---------------------------------------------------------------------------
-- 7. Draft revisions, append-only audit and immutable publications
-- ---------------------------------------------------------------------------

CREATE TABLE public.catalog_draft_state (
  restaurant_id uuid NOT NULL,
  revision bigint NOT NULL DEFAULT 0,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT catalog_draft_state_pkey PRIMARY KEY (restaurant_id),
  CONSTRAINT catalog_draft_state_restaurant_fkey
    FOREIGN KEY (restaurant_id)
    REFERENCES public.restaurants(id)
    ON DELETE RESTRICT,
  CONSTRAINT catalog_draft_state_revision_check CHECK (revision >= 0)
);

CREATE TABLE public.catalog_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_role_key text NOT NULL,
  action_key text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NULL,
  request_id uuid NOT NULL,
  revision_before bigint NOT NULL,
  revision_after bigint NOT NULL,
  before_state jsonb NULL,
  after_state jsonb NULL,
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT catalog_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT catalog_audit_log_request_key UNIQUE (restaurant_id, request_id),
  CONSTRAINT catalog_audit_log_restaurant_fkey
    FOREIGN KEY (restaurant_id)
    REFERENCES public.restaurants(id)
    ON DELETE RESTRICT,
  CONSTRAINT catalog_audit_log_actor_role_check
    CHECK (actor_role_key IN ('admin', 'owner')),
  CONSTRAINT catalog_audit_log_action_key_check
    CHECK (
      action_key = pg_catalog.btrim(action_key)
      AND pg_catalog.char_length(action_key) BETWEEN 1 AND 80
    ),
  CONSTRAINT catalog_audit_log_entity_type_check
    CHECK (
      entity_type = pg_catalog.btrim(entity_type)
      AND pg_catalog.char_length(entity_type) BETWEEN 1 AND 80
    ),
  CONSTRAINT catalog_audit_log_revision_check
    CHECK (revision_before >= 0 AND revision_after >= revision_before),
  CONSTRAINT catalog_audit_log_before_state_check
    CHECK (before_state IS NULL OR pg_catalog.jsonb_typeof(before_state) = 'object'),
  CONSTRAINT catalog_audit_log_after_state_check
    CHECK (after_state IS NULL OR pg_catalog.jsonb_typeof(after_state) = 'object')
);

CREATE INDEX catalog_audit_log_restaurant_time_idx
  ON public.catalog_audit_log (restaurant_id, occurred_at DESC);

CREATE INDEX catalog_audit_log_entity_time_idx
  ON public.catalog_audit_log
  (restaurant_id, entity_type, entity_id, occurred_at DESC);

CREATE TABLE public.catalog_publications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  publication_number bigint NOT NULL,
  draft_revision bigint NOT NULL,
  schema_version integer NOT NULL,
  pricing_engine_version text NOT NULL,
  snapshot jsonb NOT NULL,
  snapshot_sha256 text NOT NULL,
  published_by uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT catalog_publications_pkey PRIMARY KEY (id),
  CONSTRAINT catalog_publications_id_restaurant_key UNIQUE (id, restaurant_id),
  CONSTRAINT catalog_publications_number_key UNIQUE (restaurant_id, publication_number),
  CONSTRAINT catalog_publications_restaurant_fkey
    FOREIGN KEY (restaurant_id)
    REFERENCES public.restaurants(id)
    ON DELETE RESTRICT,
  CONSTRAINT catalog_publications_number_check CHECK (publication_number >= 1),
  CONSTRAINT catalog_publications_draft_revision_check CHECK (draft_revision >= 0),
  CONSTRAINT catalog_publications_schema_version_check CHECK (schema_version >= 1),
  CONSTRAINT catalog_publications_engine_version_check
    CHECK (
      pricing_engine_version = pg_catalog.btrim(pricing_engine_version)
      AND pg_catalog.char_length(pricing_engine_version) BETWEEN 1 AND 40
    ),
  CONSTRAINT catalog_publications_snapshot_object_check
    CHECK (pg_catalog.jsonb_typeof(snapshot) = 'object'),
  CONSTRAINT catalog_publications_snapshot_hash_check
    CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX catalog_publications_restaurant_time_idx
  ON public.catalog_publications (restaurant_id, published_at DESC);

CREATE TABLE public.catalog_current_publication (
  restaurant_id uuid NOT NULL,
  publication_id uuid NOT NULL,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT catalog_current_publication_pkey PRIMARY KEY (restaurant_id),
  CONSTRAINT catalog_current_publication_restaurant_fkey
    FOREIGN KEY (restaurant_id)
    REFERENCES public.restaurants(id)
    ON DELETE RESTRICT,
  CONSTRAINT catalog_current_publication_publication_fkey
    FOREIGN KEY (publication_id, restaurant_id)
    REFERENCES public.catalog_publications(id, restaurant_id)
    ON DELETE RESTRICT
);

CREATE INDEX catalog_current_publication_publication_fk_idx
  ON public.catalog_current_publication (publication_id, restaurant_id);

COMMENT ON TABLE public.catalog_draft_state IS
  'One optimistic-concurrency revision counter per restaurant. Catalog aggregate commands must lock and increment this row atomically.';
COMMENT ON TABLE public.catalog_audit_log IS
  'Append-only catalog command audit. Actor identity comes from verified auth.uid(), never browser-supplied identity.';
COMMENT ON TABLE public.catalog_publications IS
  'Immutable, compiled catalog artifact. Public catalog reads use this artifact rather than mutable authoring tables.';
COMMENT ON TABLE public.catalog_current_publication IS
  'Atomic pointer to the currently published immutable catalog artifact. Rollback switches this pointer; it does not mutate history.';

-- ---------------------------------------------------------------------------
-- 8. Timestamp and immutable-history triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER catalog_schedule_sets_touch_updated_at
  BEFORE UPDATE ON public.catalog_schedule_sets
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();

CREATE TRIGGER catalog_schedule_windows_touch_updated_at
  BEFORE UPDATE ON public.catalog_schedule_windows
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();

CREATE TRIGGER deal_collections_touch_updated_at
  BEFORE UPDATE ON public.deal_collections
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();

CREATE TRIGGER deals_touch_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();

CREATE TRIGGER deal_component_groups_touch_updated_at
  BEFORE UPDATE ON public.deal_component_groups
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();

CREATE TRIGGER deal_component_options_touch_updated_at
  BEFORE UPDATE ON public.deal_component_options
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();

CREATE TRIGGER branch_deal_availability_touch_updated_at
  BEFORE UPDATE ON public.branch_deal_availability
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();

CREATE TRIGGER catalog_draft_state_touch_updated_at
  BEFORE UPDATE ON public.catalog_draft_state
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();

CREATE TRIGGER catalog_current_publication_touch_updated_at
  BEFORE UPDATE ON public.catalog_current_publication
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();

CREATE FUNCTION app_private.flame_chick_reject_catalog_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = pg_catalog.format(
      '%I.%I is immutable; create a new history row instead',
      TG_TABLE_SCHEMA,
      TG_TABLE_NAME
    );
END;
$function$;

ALTER FUNCTION app_private.flame_chick_reject_catalog_history_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_reject_catalog_history_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER catalog_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.catalog_audit_log
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_reject_catalog_history_mutation();

CREATE TRIGGER catalog_publications_immutable
  BEFORE UPDATE OR DELETE ON public.catalog_publications
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_reject_catalog_history_mutation();

-- ---------------------------------------------------------------------------
-- 9. Ownership, RLS and privileges
-- ---------------------------------------------------------------------------

ALTER TABLE public.catalog_schedule_sets OWNER TO postgres;
ALTER TABLE public.catalog_schedule_windows OWNER TO postgres;
ALTER TABLE public.deal_collections OWNER TO postgres;
ALTER TABLE public.deals OWNER TO postgres;
ALTER TABLE public.deal_component_groups OWNER TO postgres;
ALTER TABLE public.deal_component_options OWNER TO postgres;
ALTER TABLE public.branch_deal_availability OWNER TO postgres;
ALTER TABLE public.catalog_draft_state OWNER TO postgres;
ALTER TABLE public.catalog_audit_log OWNER TO postgres;
ALTER TABLE public.catalog_publications OWNER TO postgres;
ALTER TABLE public.catalog_current_publication OWNER TO postgres;

ALTER TABLE public.catalog_schedule_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_schedule_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_component_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_component_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_deal_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_draft_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_current_publication ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.catalog_schedule_sets,
  public.catalog_schedule_windows,
  public.deal_collections,
  public.deals,
  public.deal_component_groups,
  public.deal_component_options,
  public.branch_deal_availability,
  public.catalog_draft_state,
  public.catalog_audit_log,
  public.catalog_publications,
  public.catalog_current_publication
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION app_private.flame_chick_branch_timezone_guard()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.flame_chick_reject_catalog_history_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

-- No policies or client grants are created. All authoring/publication actions
-- will be exposed later through narrowly-scoped, verified server commands.

COMMIT;
