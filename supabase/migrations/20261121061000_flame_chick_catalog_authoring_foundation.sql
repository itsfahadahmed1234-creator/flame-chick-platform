-- Flame Chick Catalog Authoring Foundation V1
-- PRODUCTION DDL IS PRESENT. Applied directly on 2026-11-21 before the migration-history record was repaired.
-- Do not execute this file against the current Production project again.
-- Supabase migration ledger repair for version 20261121061000 remains pending.
-- Expected migration identity: current_user = postgres AND session_user = postgres.
--
-- Scope:
--   * Restaurant-wide catalog authoring: categories, subcategories, products,
--     product variants, modifier groups/options, assignments, size pricing rules,
--     and drink options.
--   * Branch-specific availability overrides for products and variants.
--
-- Deliberately NOT included:
--   * Deals/deal components/curated deal choice groups.
--   * Deal schedules and recurrence.
--   * Immutable publication snapshots/pointer, catalog audit commands, and
--     draft revision concurrency controls (next reviewed phase).
--   * Delivery areas/pricing, orders, payments, GST/tax, inventory or allergens.
--
-- Security:
--   * All tables remain in public for the existing Data API naming convention,
--     but RLS is enabled and direct privileges are revoked from PUBLIC and all
--     Supabase application roles.
--   * No public policies, views, RPCs, Realtime publication entries, or seed rows.
--   * Live parity verified on 2026-11-21: all 11 tables owned by postgres, RLS on,
--     zero policies, zero direct table grants to app roles, no Realtime, zero rows.
--   * app_private USAGE is intentionally present for authenticated because Batch 4
--     routes the staff-admin public invoker wrapper to one explicitly granted private
--     function. No other private functions/tables are granted by this migration.
--   * Draft writes must be implemented through authenticated server commands.
--   * Admin/Owner authorization must be checked from public.user_roles; never
--     trust user-editable Auth metadata or browser-supplied actor/role fields.
--   * This migration must be run as postgres, never supabase_admin.

BEGIN;

DO $preflight$
DECLARE
  v_name text;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION
      'STOP: Catalog foundation must run as postgres (current_user=%, session_user=%)',
      current_user, session_user;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_namespace n
      JOIN pg_catalog.pg_roles r ON r.oid = n.nspowner
     WHERE n.nspname = 'app_private'
       AND r.rolname = 'postgres'
  ) THEN
    RAISE EXCEPTION 'STOP: app_private is missing or not owned by postgres';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'restaurants' AND c.relkind = 'r'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'branches' AND c.relkind = 'r'
  ) THEN
    RAISE EXCEPTION 'STOP: Batch 2 restaurant/branch foundation is missing';
  END IF;

  FOREACH v_name IN ARRAY ARRAY[
    'categories', 'subcategories', 'products', 'product_variants',
    'modifier_groups', 'modifiers', 'modifier_group_assignments',
    'modifier_price_rules', 'drink_options',
    'branch_product_availability', 'branch_variant_availability'
  ] LOOP
    IF EXISTS (
      SELECT 1
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = v_name
         AND c.relkind IN ('r','p','v','m','f')
    ) THEN
      RAISE EXCEPTION
        'STOP: public.% already exists; inspect and reconcile rather than reuse',
        v_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'STOP: expected Supabase application roles are missing';
  END IF;
END;
$preflight$;

-- Private trigger utility. Trigger execution is internal; the function is not
-- directly executable by application roles or available through the Data API.
CREATE FUNCTION app_private.flame_chick_catalog_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.transaction_timestamp();
  RETURN NEW;
END;
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_touch_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_touch_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  category_kind text NOT NULL DEFAULT 'menu',
  legacy_id text NULL,
  name_en text NOT NULL,
  name_ur text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  category_folder_key text NULL,
  image_current_path text NULL,
  image_previous_path text NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT categories_pkey PRIMARY KEY (id),
  CONSTRAINT categories_id_restaurant_id_category_kind_key
    UNIQUE (id, restaurant_id, category_kind),
  CONSTRAINT categories_id_restaurant_id_key UNIQUE (id, restaurant_id),
  CONSTRAINT categories_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  CONSTRAINT categories_kind_check
    CHECK (category_kind IN ('menu', 'deal')),
  CONSTRAINT categories_name_en_check
    CHECK (name_en = btrim(name_en) AND char_length(name_en) BETWEEN 1 AND 120),
  CONSTRAINT categories_name_ur_check
    CHECK (name_ur IS NULL OR (name_ur = btrim(name_ur) AND char_length(name_ur) <= 120)),
  CONSTRAINT categories_sort_order_check CHECK (sort_order >= 0)
);

COMMENT ON TABLE public.categories IS
  'Restaurant-wide catalog categories. category_kind replaces retired magic legacy category IDs; new rows start hidden.';
COMMENT ON COLUMN public.categories.category_kind IS
  'Explicit classification. V1 supports menu and deal. Product/subcategory foreign keys are restricted to menu categories.';

CREATE TABLE public.subcategories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  category_id uuid NOT NULL,
  category_kind text NOT NULL DEFAULT 'menu',
  legacy_id text NULL,
  name_en text NOT NULL,
  name_ur text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT subcategories_pkey PRIMARY KEY (id),
  CONSTRAINT subcategories_id_restaurant_id_category_id_key
    UNIQUE (id, restaurant_id, category_id),
  CONSTRAINT subcategories_restaurant_id_category_id_fkey
    FOREIGN KEY (category_id, restaurant_id, category_kind)
    REFERENCES public.categories(id, restaurant_id, category_kind)
    ON DELETE RESTRICT,
  CONSTRAINT subcategories_category_kind_check CHECK (category_kind = 'menu'),
  CONSTRAINT subcategories_name_en_check
    CHECK (name_en = btrim(name_en) AND char_length(name_en) BETWEEN 1 AND 120),
  CONSTRAINT subcategories_name_ur_check
    CHECK (name_ur IS NULL OR (name_ur = btrim(name_ur) AND char_length(name_ur) <= 120)),
  CONSTRAINT subcategories_sort_order_check CHECK (sort_order >= 0)
);

COMMENT ON TABLE public.subcategories IS
  'Optional product navigation groups. A subcategory can only belong to a menu category in the same restaurant.';

CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  category_id uuid NOT NULL,
  subcategory_id uuid NULL,
  category_kind text NOT NULL DEFAULT 'menu',
  legacy_id text NULL,
  name_en text NOT NULL,
  name_ur text NULL,
  description_en text NULL,
  description_ur text NULL,
  image_folder_key text NULL,
  image_group_id text NULL,
  image_published boolean NOT NULL DEFAULT false,
  image_extension text NULL,
  image_current_path text NULL,
  image_previous_path text NULL,
  image_previous_extension text NULL,
  featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  is_available boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_id_restaurant_id_key UNIQUE (id, restaurant_id),
  CONSTRAINT products_restaurant_category_fkey
    FOREIGN KEY (category_id, restaurant_id, category_kind)
    REFERENCES public.categories(id, restaurant_id, category_kind)
    ON DELETE RESTRICT,
  CONSTRAINT products_restaurant_subcategory_fkey
    FOREIGN KEY (subcategory_id, restaurant_id, category_id)
    REFERENCES public.subcategories(id, restaurant_id, category_id)
    ON DELETE RESTRICT,
  CONSTRAINT products_category_kind_check CHECK (category_kind = 'menu'),
  CONSTRAINT products_name_en_check
    CHECK (name_en = btrim(name_en) AND char_length(name_en) BETWEEN 1 AND 160),
  CONSTRAINT products_name_ur_check
    CHECK (name_ur IS NULL OR (name_ur = btrim(name_ur) AND char_length(name_ur) <= 160)),
  CONSTRAINT products_image_extension_check
    CHECK (image_extension IS NULL OR lower(image_extension) IN ('jpg','jpeg','png','webp')),
  CONSTRAINT products_image_previous_extension_check
    CHECK (image_previous_extension IS NULL OR lower(image_previous_extension) IN ('jpg','jpeg','png','webp')),
  CONSTRAINT products_sort_order_check CHECK (sort_order >= 0)
);

COMMENT ON TABLE public.products IS
  'Restaurant-wide menu products. Draft/unavailable by default; prices are held by variants and are never trusted from browser totals.';
COMMENT ON COLUMN public.products.image_published IS
  'Compatibility field only. Public exposure must be controlled by a published catalog snapshot/media allowlist, not this flag alone.';

CREATE TABLE public.product_variants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  legacy_id text NULL,
  size_key text NOT NULL,
  size_label text NOT NULL,
  price numeric(12,2) NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  is_available boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT product_variants_pkey PRIMARY KEY (id),
  CONSTRAINT product_variants_id_restaurant_id_key UNIQUE (id, restaurant_id),
  CONSTRAINT product_variants_id_restaurant_id_product_id_key
    UNIQUE (id, restaurant_id, product_id),
  CONSTRAINT product_variants_restaurant_product_size_key
    UNIQUE (restaurant_id, product_id, size_key),
  CONSTRAINT product_variants_product_fkey
    FOREIGN KEY (product_id, restaurant_id)
    REFERENCES public.products(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT product_variants_size_key_check
    CHECK (size_key = upper(btrim(size_key))
      AND size_key ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'),
  CONSTRAINT product_variants_size_label_check
    CHECK (size_label = btrim(size_label) AND char_length(size_label) BETWEEN 1 AND 80),
  CONSTRAINT product_variants_price_check CHECK (price IS NULL OR price >= 0),
  CONSTRAINT product_variants_sort_order_check CHECK (sort_order >= 0)
);

COMMENT ON TABLE public.product_variants IS
  'Stable product size/portion/volume/option rows. NULL price means unpriced draft; numeric zero means deliberately free.';
COMMENT ON COLUMN public.product_variants.price IS
  'Nullable while drafting. Publishing a purchasable variant with NULL price must be rejected by the publish validator.';

CREATE TABLE public.modifier_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  legacy_id text NULL,
  name_en text NOT NULL,
  name_ur text NULL,
  standalone_only boolean NOT NULL DEFAULT false,
  selection_mode text NOT NULL DEFAULT 'ONE_OPTIONAL',
  min_select integer NOT NULL DEFAULT 0,
  max_select integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT modifier_groups_pkey PRIMARY KEY (id),
  CONSTRAINT modifier_groups_id_restaurant_id_key UNIQUE (id, restaurant_id),
  CONSTRAINT modifier_groups_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  CONSTRAINT modifier_groups_selection_mode_check
    CHECK (selection_mode IN ('ONE_OPTIONAL','ONE_REQUIRED','MULTIPLE_OPTIONAL','MULTIPLE_REQUIRED')),
  CONSTRAINT modifier_groups_min_max_check
    CHECK (min_select >= 0 AND max_select >= min_select AND max_select BETWEEN 1 AND 50),
  CONSTRAINT modifier_groups_selection_bounds_check
    CHECK (
      (selection_mode = 'ONE_OPTIONAL' AND min_select = 0 AND max_select = 1)
      OR (selection_mode = 'ONE_REQUIRED' AND min_select = 1 AND max_select = 1)
      OR (selection_mode = 'MULTIPLE_OPTIONAL' AND min_select = 0)
      OR (selection_mode = 'MULTIPLE_REQUIRED' AND min_select >= 1)
    ),
  CONSTRAINT modifier_groups_name_en_check
    CHECK (name_en = btrim(name_en) AND char_length(name_en) BETWEEN 1 AND 120),
  CONSTRAINT modifier_groups_name_ur_check
    CHECK (name_ur IS NULL OR (name_ur = btrim(name_ur) AND char_length(name_ur) <= 120)),
  CONSTRAINT modifier_groups_sort_order_check CHECK (sort_order >= 0)
);

COMMENT ON TABLE public.modifier_groups IS
  'Reusable option groups. Selection mode and min/max bounds mirror the existing catalog DTO values.';

CREATE TABLE public.modifiers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  modifier_group_id uuid NOT NULL,
  legacy_id text NULL,
  name_en text NOT NULL,
  name_ur text NULL,
  price_mode text NOT NULL DEFAULT 'FREE',
  fixed_price numeric(12,2) NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT modifiers_pkey PRIMARY KEY (id),
  CONSTRAINT modifiers_id_restaurant_group_key
    UNIQUE (id, restaurant_id, modifier_group_id),
  CONSTRAINT modifiers_group_fkey
    FOREIGN KEY (modifier_group_id, restaurant_id)
    REFERENCES public.modifier_groups(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT modifiers_price_mode_check
    CHECK (price_mode IN ('FREE','FIXED','BY_SIZE')),
  CONSTRAINT modifiers_fixed_price_check
    CHECK (
      (price_mode = 'FIXED' AND fixed_price IS NOT NULL AND fixed_price >= 0)
      OR (price_mode IN ('FREE','BY_SIZE') AND fixed_price IS NULL)
    ),
  CONSTRAINT modifiers_name_en_check
    CHECK (name_en = btrim(name_en) AND char_length(name_en) BETWEEN 1 AND 120),
  CONSTRAINT modifiers_name_ur_check
    CHECK (name_ur IS NULL OR (name_ur = btrim(name_ur) AND char_length(name_ur) <= 120)),
  CONSTRAINT modifiers_sort_order_check CHECK (sort_order >= 0)
);

COMMENT ON TABLE public.modifiers IS
  'Modifier options. FREE has no surcharge, FIXED requires fixed_price, and BY_SIZE resolves through product-specific price rules.';

CREATE TABLE public.modifier_group_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  modifier_group_id uuid NOT NULL,
  product_id uuid NOT NULL,
  legacy_id text NULL,
  is_active boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT modifier_group_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT modifier_group_assignments_group_product_key
    UNIQUE (restaurant_id, modifier_group_id, product_id),
  CONSTRAINT modifier_group_assignments_id_restaurant_id_key
    UNIQUE (id, restaurant_id),
  CONSTRAINT modifier_group_assignments_group_fkey
    FOREIGN KEY (modifier_group_id, restaurant_id)
    REFERENCES public.modifier_groups(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT modifier_group_assignments_product_fkey
    FOREIGN KEY (product_id, restaurant_id)
    REFERENCES public.products(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT modifier_group_assignments_sort_order_check CHECK (sort_order >= 0)
);

COMMENT ON TABLE public.modifier_group_assignments IS
  'Explicit product-to-option-group allowlist. Selection validation must confirm an active assignment, active group and active modifier.';

CREATE TABLE public.modifier_price_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  modifier_group_id uuid NOT NULL,
  modifier_id uuid NOT NULL,
  product_id uuid NOT NULL,
  size_key text NOT NULL,
  legacy_id text NULL,
  price numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT modifier_price_rules_pkey PRIMARY KEY (id),
  CONSTRAINT modifier_price_rules_modifier_product_size_key
    UNIQUE (modifier_id, product_id, size_key),
  CONSTRAINT modifier_price_rules_modifier_fkey
    FOREIGN KEY (modifier_id, restaurant_id, modifier_group_id)
    REFERENCES public.modifiers(id, restaurant_id, modifier_group_id)
    ON DELETE RESTRICT,
  CONSTRAINT modifier_price_rules_assignment_fkey
    FOREIGN KEY (restaurant_id, modifier_group_id, product_id)
    REFERENCES public.modifier_group_assignments(restaurant_id, modifier_group_id, product_id)
    ON DELETE RESTRICT,
  CONSTRAINT modifier_price_rules_product_variant_key_fkey
    FOREIGN KEY (restaurant_id, product_id, size_key)
    REFERENCES public.product_variants(restaurant_id, product_id, size_key)
    ON DELETE RESTRICT,
  CONSTRAINT modifier_price_rules_price_check CHECK (price >= 0),
  CONSTRAINT modifier_price_rules_size_key_check
    CHECK (size_key = upper(btrim(size_key))
      AND size_key ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$')
);

COMMENT ON TABLE public.modifier_price_rules IS
  'Product-specific BY_SIZE modifier prices. Composite foreign keys require the product variant and modifier-group assignment to exist in the same restaurant.';

CREATE TABLE public.drink_options (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  product_variant_id uuid NULL,
  legacy_id text NULL,
  display_name text NOT NULL,
  display_name_ur text NULL,
  volume_key text NOT NULL,
  volume_ml integer NULL,
  is_active boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT drink_options_pkey PRIMARY KEY (id),
  CONSTRAINT drink_options_id_restaurant_id_key UNIQUE (id, restaurant_id),
  CONSTRAINT drink_options_product_variant_fkey
    FOREIGN KEY (product_variant_id, restaurant_id)
    REFERENCES public.product_variants(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT drink_options_volume_key_check
    CHECK (volume_key = upper(btrim(volume_key))
      AND volume_key ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'),
  CONSTRAINT drink_options_volume_ml_check CHECK (volume_ml IS NULL OR volume_ml > 0),
  CONSTRAINT drink_options_display_name_check
    CHECK (display_name = btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 80),
  CONSTRAINT drink_options_display_name_ur_check
    CHECK (display_name_ur IS NULL OR (display_name_ur = btrim(display_name_ur) AND char_length(display_name_ur) <= 80)),
  CONSTRAINT drink_options_sort_order_check CHECK (sort_order >= 0)
);

COMMENT ON TABLE public.drink_options IS
  'Drink-size labels and volume keys retained for Website/POS DTO compatibility. The actual sale price remains the linked product variant price.';

-- Branch overlays are sparse overrides. Effective availability must always be:
-- base product/variant active AND base available AND overlay (if present) available.
-- An overlay can therefore never reactivate a globally inactive/unavailable item.
CREATE TABLE public.branch_product_availability (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  product_id uuid NOT NULL,
  is_available boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT branch_product_availability_pkey PRIMARY KEY (id),
  CONSTRAINT branch_product_availability_branch_product_key
    UNIQUE (branch_id, product_id),
  CONSTRAINT branch_product_availability_branch_fkey
    FOREIGN KEY (branch_id, restaurant_id)
    REFERENCES public.branches(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT branch_product_availability_product_fkey
    FOREIGN KEY (product_id, restaurant_id)
    REFERENCES public.products(id, restaurant_id)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.branch_product_availability IS
  'Sparse per-branch sellability override; effective sellability must still require the global product to be active and available.';

CREATE TABLE public.branch_variant_availability (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_variant_id uuid NOT NULL,
  is_available boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT branch_variant_availability_pkey PRIMARY KEY (id),
  CONSTRAINT branch_variant_availability_branch_variant_key
    UNIQUE (branch_id, product_variant_id),
  CONSTRAINT branch_variant_availability_branch_fkey
    FOREIGN KEY (branch_id, restaurant_id)
    REFERENCES public.branches(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT branch_variant_availability_variant_fkey
    FOREIGN KEY (product_variant_id, restaurant_id, product_id)
    REFERENCES public.product_variants(id, restaurant_id, product_id)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.branch_variant_availability IS
  'Sparse per-branch variant sellability override; effective sellability must still require the base product and variant to be active and available.';

-- Optional source compatibility identifiers are unique within their logical
-- scope, but never participate in primary/foreign-key identity.
CREATE UNIQUE INDEX categories_restaurant_legacy_id_uidx
  ON public.categories (restaurant_id, legacy_id) WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX subcategories_restaurant_legacy_id_uidx
  ON public.subcategories (restaurant_id, legacy_id) WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX products_restaurant_legacy_id_uidx
  ON public.products (restaurant_id, legacy_id) WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX product_variants_restaurant_legacy_id_uidx
  ON public.product_variants (restaurant_id, legacy_id) WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX modifier_groups_restaurant_legacy_id_uidx
  ON public.modifier_groups (restaurant_id, legacy_id) WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX modifiers_restaurant_legacy_id_uidx
  ON public.modifiers (restaurant_id, legacy_id) WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX modifier_group_assignments_restaurant_legacy_id_uidx
  ON public.modifier_group_assignments (restaurant_id, legacy_id) WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX modifier_price_rules_restaurant_legacy_id_uidx
  ON public.modifier_price_rules (restaurant_id, legacy_id) WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX drink_options_restaurant_legacy_id_uidx
  ON public.drink_options (restaurant_id, legacy_id) WHERE legacy_id IS NOT NULL;

-- Query/FK indexes for known catalog and branch overlay access paths.
CREATE INDEX categories_restaurant_active_sort_idx
  ON public.categories (restaurant_id, is_active, sort_order);
CREATE INDEX subcategories_restaurant_category_sort_idx
  ON public.subcategories (restaurant_id, category_id, is_active, sort_order);
CREATE INDEX products_restaurant_category_sort_idx
  ON public.products (restaurant_id, category_id, is_active, is_available, sort_order);
CREATE INDEX products_restaurant_subcategory_idx
  ON public.products (restaurant_id, subcategory_id);
CREATE INDEX product_variants_restaurant_product_sort_idx
  ON public.product_variants (restaurant_id, product_id, is_active, is_available, sort_order);
CREATE INDEX modifier_groups_restaurant_active_sort_idx
  ON public.modifier_groups (restaurant_id, is_active, sort_order);
CREATE INDEX modifiers_restaurant_group_sort_idx
  ON public.modifiers (restaurant_id, modifier_group_id, is_active, sort_order);
CREATE INDEX modifier_assignments_restaurant_product_idx
  ON public.modifier_group_assignments (restaurant_id, product_id, is_active, sort_order);
CREATE INDEX modifier_price_rules_lookup_idx
  ON public.modifier_price_rules (restaurant_id, product_id, modifier_id, size_key);
CREATE INDEX drink_options_restaurant_active_volume_idx
  ON public.drink_options (restaurant_id, is_active, volume_key);
CREATE INDEX branch_product_availability_branch_idx
  ON public.branch_product_availability (branch_id, is_available);
CREATE INDEX branch_variant_availability_branch_idx
  ON public.branch_variant_availability (branch_id, is_available);

-- Keep timestamps consistent regardless of which trusted server command writes.
CREATE TRIGGER categories_touch_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();
CREATE TRIGGER subcategories_touch_updated_at
  BEFORE UPDATE ON public.subcategories
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();
CREATE TRIGGER products_touch_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();
CREATE TRIGGER product_variants_touch_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();
CREATE TRIGGER modifier_groups_touch_updated_at
  BEFORE UPDATE ON public.modifier_groups
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();
CREATE TRIGGER modifiers_touch_updated_at
  BEFORE UPDATE ON public.modifiers
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();
CREATE TRIGGER modifier_group_assignments_touch_updated_at
  BEFORE UPDATE ON public.modifier_group_assignments
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();
CREATE TRIGGER modifier_price_rules_touch_updated_at
  BEFORE UPDATE ON public.modifier_price_rules
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();
CREATE TRIGGER drink_options_touch_updated_at
  BEFORE UPDATE ON public.drink_options
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();
CREATE TRIGGER branch_product_availability_touch_updated_at
  BEFORE UPDATE ON public.branch_product_availability
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();
CREATE TRIGGER branch_variant_availability_touch_updated_at
  BEFORE UPDATE ON public.branch_variant_availability
  FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_catalog_touch_updated_at();

-- Explicit, deny-by-default table boundary. No direct Data API table access.
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_group_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_price_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drink_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_product_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_variant_availability ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.categories,
  public.subcategories,
  public.products,
  public.product_variants,
  public.modifier_groups,
  public.modifiers,
  public.modifier_group_assignments,
  public.modifier_price_rules,
  public.drink_options,
  public.branch_product_availability,
  public.branch_variant_availability
FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.categories OWNER TO postgres;
ALTER TABLE public.subcategories OWNER TO postgres;
ALTER TABLE public.products OWNER TO postgres;
ALTER TABLE public.product_variants OWNER TO postgres;
ALTER TABLE public.modifier_groups OWNER TO postgres;
ALTER TABLE public.modifiers OWNER TO postgres;
ALTER TABLE public.modifier_group_assignments OWNER TO postgres;
ALTER TABLE public.modifier_price_rules OWNER TO postgres;
ALTER TABLE public.drink_options OWNER TO postgres;
ALTER TABLE public.branch_product_availability OWNER TO postgres;
ALTER TABLE public.branch_variant_availability OWNER TO postgres;

DO $verify$
DECLARE
  v_name text;
  v_role text;
  v_privilege text;
  v_has_rows boolean;
  v_tables text[] := ARRAY[
    'categories', 'subcategories', 'products', 'product_variants',
    'modifier_groups', 'modifiers', 'modifier_group_assignments',
    'modifier_price_rules', 'drink_options',
    'branch_product_availability', 'branch_variant_availability'
  ];
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Catalog verification failed: migration identity changed';
  END IF;

  FOREACH v_name IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = v_name
         AND c.relkind = 'r'
         AND c.relrowsecurity
         AND pg_catalog.pg_get_userbyid(c.relowner) = 'postgres'
    ) THEN
      RAISE EXCEPTION 'Catalog verification failed: public.% owner/RLS check failed', v_name;
    END IF;

    FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      FOREACH v_privilege IN ARRAY ARRAY[
        'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
      ] LOOP
        IF pg_catalog.has_table_privilege(v_role, 'public.' || v_name, v_privilege) THEN
          RAISE EXCEPTION 'Catalog verification failed: % has % on public.%',
            v_role, v_privilege, v_name;
        END IF;
      END LOOP;
    END LOOP;

    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies p
       WHERE p.schemaname = 'public' AND p.tablename = v_name
    ) THEN
      RAISE EXCEPTION 'Catalog verification failed: unexpected policy on public.%', v_name;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_publication_tables p
       WHERE p.schemaname = 'public' AND p.tablename = v_name
    ) THEN
      RAISE EXCEPTION 'Catalog verification failed: public.% unexpectedly in Realtime', v_name;
    END IF;

    EXECUTE pg_catalog.format('SELECT EXISTS (SELECT 1 FROM public.%I)', v_name)
      INTO v_has_rows;
    IF v_has_rows THEN
      RAISE EXCEPTION 'Catalog verification failed: public.% unexpectedly contains seed rows', v_name;
    END IF;
  END LOOP;

  IF has_schema_privilege('anon','app_private','USAGE')
     OR has_schema_privilege('service_role','app_private','USAGE')
     OR has_schema_privilege('public','app_private','USAGE')
     OR NOT has_schema_privilege('authenticated','app_private','USAGE') THEN
    RAISE EXCEPTION 'Catalog verification failed: private schema grants differ from the reviewed Batch 4 boundary';
  END IF;

  RAISE NOTICE 'Catalog foundation verification: owner, RLS, ACL, policies and Realtime checks passed';
END;
$verify$;

COMMIT;

-- Follow-up review gates (not satisfied by this schema-only migration):
-- 1. Add Admin/Owner-only atomic catalog commands and append-only actor audit.
-- 2. Add draft revision checks, immutable publication snapshots and rollback pointer.
-- 3. Add deal/deal-component and curated choice-group schema once the V1 component
--    validation DTO is reconciled; schedule recurrence remains deferred.
-- 4. Update catalog API to read only the published snapshot and branch availability
--    overlays, preserving NULL variant prices (never coerce NULL to zero).
-- 5. Update the Admin UI to stop direct REST writes and support explicit category_kind.
-- 6. Update the modifier price-rule DTO to include product scope.
-- 7. Verify browser cannot access these rows; only exact server-side privileges are
--    granted when commands are implemented.
