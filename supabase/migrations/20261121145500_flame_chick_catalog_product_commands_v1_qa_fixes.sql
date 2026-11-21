-- Forward-only QA correction for product aggregate commands.
-- Never rewrite the already-applied product command migration.
BEGIN;

CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_product_upsert_internal(
  p_payload jsonb,
  p_expected_revision bigint,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_restaurant uuid;
  v_role text;
  v_revision bigint;
  v_new_revision bigint;
  v_payload_hash bytea;
  v_existing app_private.catalog_command_idempotency%ROWTYPE;
  v_response jsonb;
  v_before jsonb;
  v_after jsonb;
  v_id uuid;
  v_category_id uuid;
  v_subcategory_id uuid;
  v_legacy_id text;
  v_name_en text;
  v_name_ur text;
  v_description_en text;
  v_description_ur text;
  v_featured boolean;
  v_sort_order integer;
  v_is_active boolean;
  v_is_available boolean;
  v_product public.products%ROWTYPE;
  v_variant_json jsonb;
  v_variant_id uuid;
  v_variant_legacy_id text;
  v_size_key text;
  v_size_label text;
  v_price numeric;
  v_raw_num numeric;
  v_sort integer;
  v_variant_active boolean;
  v_variant_available boolean;
  v_variant_kind text;
  v_pack_quantity integer;
  v_pack_unit text;
  v_standalone_sellable boolean;
  v_variant public.product_variants%ROWTYPE;
  v_variant_exists boolean;
  v_seen_keys text[] := ARRAY[]::text[];
  v_seen_variant_ids uuid[] := ARRAY[]::uuid[];
  v_variant_count integer;
  v_key text;
BEGIN
  IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_REQUEST_AND_REVISION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.octet_length(pg_catalog.convert_to(p_payload::text, 'UTF8')) > 65536 THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_PAYLOAD_TOO_LARGE' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_object_keys(p_payload) AS k(key)
    WHERE k.key <> ALL (ARRAY[
      'id','category_id','subcategory_id','legacy_id','name_en','name_ur',
      'description_en','description_ur','featured','sort_order','is_active',
      'is_available','variants'
    ])
  ) THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_FIELD_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  SELECT a.actor_user_id, a.restaurant_id, a.role_key
    INTO v_actor, v_restaurant, v_role
  FROM app_private.flame_chick_catalog_actor() AS a;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'CATALOG_ADMIN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  BEGIN
    v_id := NULLIF(p_payload->>'id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_ID_INVALID' USING ERRCODE = '22023';
  END;

  -- Validate the complete optional variant patch before taking the draft lock
  -- or changing any row. The full command still executes atomically.
  IF p_payload ? 'variants' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'variants') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_VARIANTS_INVALID' USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.jsonb_array_length(p_payload->'variants') > 50 THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_VARIANTS_INVALID' USING ERRCODE = '22023';
    END IF;

    FOR v_variant_json IN
      SELECT x.value FROM pg_catalog.jsonb_array_elements(p_payload->'variants') AS x(value)
    LOOP
      IF pg_catalog.jsonb_typeof(v_variant_json) <> 'object'
         OR EXISTS (
           SELECT 1
           FROM pg_catalog.jsonb_object_keys(v_variant_json) AS k(key)
           WHERE k.key <> ALL (ARRAY[
             'id','legacy_id','size_key','size_label','price','sort_order',
             'is_active','is_available','variant_kind','pack_quantity','pack_unit',
             'is_standalone_sellable'
           ])
         ) THEN
        RAISE EXCEPTION 'CATALOG_VARIANT_FIELDS_INVALID' USING ERRCODE = '22023';
      END IF;

      IF NOT (v_variant_json ? 'size_key')
         OR pg_catalog.jsonb_typeof(v_variant_json->'size_key') <> 'string' THEN
        RAISE EXCEPTION 'CATALOG_VARIANT_SIZE_KEY_REQUIRED' USING ERRCODE = '22023';
      END IF;
      v_key := pg_catalog.upper(pg_catalog.btrim(v_variant_json->>'size_key'));
      IF v_key !~ '^[A-Z0-9][A-Z0-9_-]{0,31}$' THEN
        RAISE EXCEPTION 'CATALOG_VARIANT_SIZE_KEY_INVALID' USING ERRCODE = '22023';
      END IF;
      IF v_key = ANY(v_seen_keys) THEN
        RAISE EXCEPTION 'CATALOG_VARIANT_SIZE_KEY_DUPLICATED' USING ERRCODE = '22023';
      END IF;
      v_seen_keys := pg_catalog.array_append(v_seen_keys, v_key);

      IF v_variant_json ? 'size_label'
         AND v_variant_json->'size_label' <> 'null'::jsonb
         AND pg_catalog.jsonb_typeof(v_variant_json->'size_label') <> 'string' THEN
        RAISE EXCEPTION 'CATALOG_VARIANT_SIZE_LABEL_INVALID' USING ERRCODE = '22023';
      END IF;
      IF v_variant_json ? 'legacy_id'
         AND v_variant_json->'legacy_id' <> 'null'::jsonb
         AND pg_catalog.jsonb_typeof(v_variant_json->'legacy_id') <> 'string' THEN
        RAISE EXCEPTION 'CATALOG_VARIANT_LEGACY_ID_INVALID' USING ERRCODE = '22023';
      END IF;
      IF v_variant_json ? 'price'
         AND v_variant_json->'price' <> 'null'::jsonb
         AND pg_catalog.jsonb_typeof(v_variant_json->'price') <> 'number' THEN
        RAISE EXCEPTION 'CATALOG_VARIANT_PRICE_INVALID' USING ERRCODE = '22023';
      END IF;
      IF v_variant_json ? 'sort_order'
         AND pg_catalog.jsonb_typeof(v_variant_json->'sort_order') <> 'number' THEN
        RAISE EXCEPTION 'CATALOG_VARIANT_SORT_ORDER_INVALID' USING ERRCODE = '22023';
      END IF;
      IF v_variant_json ? 'variant_kind'
         AND pg_catalog.jsonb_typeof(v_variant_json->'variant_kind') <> 'string' THEN
        RAISE EXCEPTION 'CATALOG_VARIANT_KIND_INVALID' USING ERRCODE = '22023';
      END IF;
      IF v_variant_json ? 'pack_quantity'
         AND v_variant_json->'pack_quantity' <> 'null'::jsonb
         AND pg_catalog.jsonb_typeof(v_variant_json->'pack_quantity') <> 'number' THEN
        RAISE EXCEPTION 'CATALOG_VARIANT_PACK_QUANTITY_INVALID' USING ERRCODE = '22023';
      END IF;
      IF v_variant_json ? 'pack_unit'
         AND v_variant_json->'pack_unit' <> 'null'::jsonb
         AND pg_catalog.jsonb_typeof(v_variant_json->'pack_unit') <> 'string' THEN
        RAISE EXCEPTION 'CATALOG_VARIANT_PACK_UNIT_INVALID' USING ERRCODE = '22023';
      END IF;
      IF (v_variant_json ? 'is_active' AND pg_catalog.jsonb_typeof(v_variant_json->'is_active') <> 'boolean')
         OR (v_variant_json ? 'is_available' AND pg_catalog.jsonb_typeof(v_variant_json->'is_available') <> 'boolean')
         OR (v_variant_json ? 'is_standalone_sellable' AND pg_catalog.jsonb_typeof(v_variant_json->'is_standalone_sellable') <> 'boolean') THEN
        RAISE EXCEPTION 'CATALOG_VARIANT_BOOLEAN_INVALID' USING ERRCODE = '22023';
      END IF;

      IF v_variant_json ? 'id' AND v_variant_json->'id' <> 'null'::jsonb THEN
        BEGIN
          v_variant_id := (v_variant_json->>'id')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
          RAISE EXCEPTION 'CATALOG_VARIANT_ID_INVALID' USING ERRCODE = '22023';
        END;
        IF v_variant_id = ANY(v_seen_variant_ids) THEN
          RAISE EXCEPTION 'CATALOG_VARIANT_ID_DUPLICATED' USING ERRCODE = '22023';
        END IF;
        v_seen_variant_ids := pg_catalog.array_append(v_seen_variant_ids, v_variant_id);
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.catalog_draft_state (restaurant_id)
  VALUES (v_restaurant)
  ON CONFLICT (restaurant_id) DO NOTHING;

  SELECT s.revision INTO v_revision
  FROM public.catalog_draft_state AS s
  WHERE s.restaurant_id = v_restaurant
  FOR UPDATE;

  v_payload_hash := pg_catalog.sha256(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'action', 'product_upsert',
        'expected_revision', p_expected_revision,
        'payload', p_payload
      )::text,
      'UTF8'
    )
  );

  SELECT i.* INTO v_existing
  FROM app_private.catalog_command_idempotency AS i
  WHERE i.restaurant_id = v_restaurant AND i.request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.command_key <> 'product_upsert'
       OR v_existing.payload_hash <> v_payload_hash THEN
      RAISE EXCEPTION 'CATALOG_IDEMPOTENCY_KEY_REUSED' USING ERRCODE = '22023';
    END IF;
    RETURN pg_catalog.jsonb_set(v_existing.response_json, '{idempotent}', 'true'::jsonb, true);
  END IF;

  IF v_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'CATALOG_REVISION_CONFLICT'
      USING ERRCODE = '40001',
            DETAIL = pg_catalog.format('current_revision=%s', v_revision);
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT p.* INTO v_product
    FROM public.products AS p
    WHERE p.id = v_id AND p.restaurant_id = v_restaurant
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_payload ? 'category_id' THEN
    BEGIN
      v_category_id := NULLIF(p_payload->>'category_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_CATEGORY_ID_INVALID' USING ERRCODE = '22023';
    END;
  ELSIF v_id IS NOT NULL THEN
    v_category_id := v_product.category_id;
  ELSE
    v_category_id := NULL;
  END IF;

  IF v_category_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.categories AS c
    WHERE c.id = v_category_id
      AND c.restaurant_id = v_restaurant
      AND c.category_kind = 'menu'
  ) THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_MENU_CATEGORY_REQUIRED' USING ERRCODE = 'P0002';
  END IF;

  IF p_payload ? 'subcategory_id' THEN
    BEGIN
      v_subcategory_id := NULLIF(p_payload->>'subcategory_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_SUBCATEGORY_ID_INVALID' USING ERRCODE = '22023';
    END;
  ELSIF v_id IS NOT NULL THEN
    v_subcategory_id := v_product.subcategory_id;
  ELSE
    v_subcategory_id := NULL;
  END IF;

  IF v_subcategory_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.subcategories AS sc
    WHERE sc.id = v_subcategory_id
      AND sc.restaurant_id = v_restaurant
      AND sc.category_id = v_category_id
      AND sc.category_kind = 'menu'
  ) THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_SUBCATEGORY_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF p_payload ? 'name_en' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'name_en') <> 'string' THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_NAME_EN_INVALID' USING ERRCODE = '22023';
    END IF;
    v_name_en := pg_catalog.btrim(p_payload->>'name_en');
  ELSIF v_id IS NOT NULL THEN
    v_name_en := v_product.name_en;
  ELSE
    v_name_en := NULL;
  END IF;
  IF v_name_en IS NULL OR pg_catalog.char_length(v_name_en) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_NAME_EN_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'name_ur' THEN
    IF p_payload->'name_ur' <> 'null'::jsonb
       AND pg_catalog.jsonb_typeof(p_payload->'name_ur') <> 'string' THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_NAME_UR_INVALID' USING ERRCODE = '22023';
    END IF;
    v_name_ur := NULLIF(pg_catalog.btrim(p_payload->>'name_ur'), '');
  ELSIF v_id IS NOT NULL THEN
    v_name_ur := v_product.name_ur;
  ELSE
    v_name_ur := NULL;
  END IF;
  IF v_name_ur IS NOT NULL AND pg_catalog.char_length(v_name_ur) > 160 THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_NAME_UR_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'description_en' THEN
    IF p_payload->'description_en' <> 'null'::jsonb
       AND pg_catalog.jsonb_typeof(p_payload->'description_en') <> 'string' THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_DESCRIPTION_EN_INVALID' USING ERRCODE = '22023';
    END IF;
    v_description_en := NULLIF(pg_catalog.btrim(p_payload->>'description_en'), '');
  ELSIF v_id IS NOT NULL THEN
    v_description_en := v_product.description_en;
  ELSE
    v_description_en := NULL;
  END IF;
  IF v_description_en IS NOT NULL AND pg_catalog.char_length(v_description_en) > 2000 THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_DESCRIPTION_EN_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'description_ur' THEN
    IF p_payload->'description_ur' <> 'null'::jsonb
       AND pg_catalog.jsonb_typeof(p_payload->'description_ur') <> 'string' THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_DESCRIPTION_UR_INVALID' USING ERRCODE = '22023';
    END IF;
    v_description_ur := NULLIF(pg_catalog.btrim(p_payload->>'description_ur'), '');
  ELSIF v_id IS NOT NULL THEN
    v_description_ur := v_product.description_ur;
  ELSE
    v_description_ur := NULL;
  END IF;
  IF v_description_ur IS NOT NULL AND pg_catalog.char_length(v_description_ur) > 2000 THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_DESCRIPTION_UR_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'legacy_id' THEN
    IF p_payload->'legacy_id' <> 'null'::jsonb
       AND pg_catalog.jsonb_typeof(p_payload->'legacy_id') <> 'string' THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_LEGACY_ID_INVALID' USING ERRCODE = '22023';
    END IF;
    v_legacy_id := NULLIF(pg_catalog.btrim(p_payload->>'legacy_id'), '');
  ELSIF v_id IS NOT NULL THEN
    v_legacy_id := v_product.legacy_id;
  ELSE
    v_legacy_id := NULL;
  END IF;
  IF v_legacy_id IS NOT NULL AND pg_catalog.char_length(v_legacy_id) > 120 THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_LEGACY_ID_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'sort_order' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'sort_order') <> 'number' THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_SORT_ORDER_INVALID' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_raw_num := (p_payload->>'sort_order')::numeric;
    EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_SORT_ORDER_INVALID' USING ERRCODE = '22023';
    END;
    IF pg_catalog.scale(v_raw_num) <> 0 OR v_raw_num < 0 OR v_raw_num > 2147483647 THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_SORT_ORDER_INVALID' USING ERRCODE = '22023';
    END IF;
    v_sort_order := v_raw_num::integer;
  ELSIF v_id IS NOT NULL THEN
    v_sort_order := v_product.sort_order;
  ELSE
    v_sort_order := 0;
  END IF;
  IF v_sort_order < 0 THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_SORT_ORDER_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'featured' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'featured') <> 'boolean' THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_FEATURED_INVALID' USING ERRCODE = '22023';
    END IF;
    v_featured := (p_payload->>'featured')::boolean;
  ELSIF v_id IS NOT NULL THEN v_featured := v_product.featured;
  ELSE v_featured := false;
  END IF;

  IF p_payload ? 'is_active' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'is_active') <> 'boolean' THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_ACTIVE_INVALID' USING ERRCODE = '22023';
    END IF;
    v_is_active := (p_payload->>'is_active')::boolean;
  ELSIF v_id IS NOT NULL THEN v_is_active := v_product.is_active;
  ELSE v_is_active := false;
  END IF;

  IF p_payload ? 'is_available' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'is_available') <> 'boolean' THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_AVAILABLE_INVALID' USING ERRCODE = '22023';
    END IF;
    v_is_available := (p_payload->>'is_available')::boolean;
  ELSIF v_id IS NOT NULL THEN v_is_available := v_product.is_available;
  ELSE v_is_available := false;
  END IF;

  -- Snapshot before state includes its existing variants for meaningful audit.
  IF v_id IS NOT NULL THEN
    SELECT pg_catalog.jsonb_build_object(
      'product', pg_catalog.to_jsonb(v_product),
      'variants', COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(v) ORDER BY v.sort_order, v.size_key, v.id)
        FROM public.product_variants AS v
        WHERE v.restaurant_id = v_restaurant AND v.product_id = v_id
      ), '[]'::jsonb)
    ) INTO v_before;

    UPDATE public.products AS p
    SET category_id = v_category_id,
        subcategory_id = v_subcategory_id,
        legacy_id = v_legacy_id,
        name_en = v_name_en,
        name_ur = v_name_ur,
        description_en = v_description_en,
        description_ur = v_description_ur,
        featured = v_featured,
        sort_order = v_sort_order,
        is_active = v_is_active,
        is_available = v_is_available
    WHERE p.id = v_id AND p.restaurant_id = v_restaurant
    RETURNING p.* INTO v_product;
  ELSE
    INSERT INTO public.products (
      restaurant_id, category_id, subcategory_id, category_kind, legacy_id,
      name_en, name_ur, description_en, description_ur, featured,
      sort_order, is_active, is_available
    )
    VALUES (
      v_restaurant, v_category_id, v_subcategory_id, 'menu', v_legacy_id,
      v_name_en, v_name_ur, v_description_en, v_description_ur, v_featured,
      v_sort_order, v_is_active, v_is_available
    )
    RETURNING * INTO v_product;
    v_id := v_product.id;
    v_before := NULL;
  END IF;

  -- Supplied variant array means an upsert patch set, not replacement:
  -- omitted existing variants are retained. Use is_active=false to archive.
  IF p_payload ? 'variants' THEN
    FOR v_variant_json IN
      SELECT x.value FROM pg_catalog.jsonb_array_elements(p_payload->'variants') AS x(value)
    LOOP
      v_size_key := pg_catalog.upper(pg_catalog.btrim(v_variant_json->>'size_key'));
      v_variant_id := NULL;
      IF v_variant_json ? 'id' AND v_variant_json->'id' <> 'null'::jsonb THEN
        v_variant_id := (v_variant_json->>'id')::uuid;
      END IF;

      IF v_variant_id IS NOT NULL THEN
        SELECT v.* INTO v_variant
        FROM public.product_variants AS v
        WHERE v.id = v_variant_id
          AND v.restaurant_id = v_restaurant
          AND v.product_id = v_id
        FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'CATALOG_VARIANT_NOT_FOUND_FOR_PRODUCT' USING ERRCODE = 'P0002';
        END IF;
        v_variant_exists := true;
      ELSE
        SELECT v.* INTO v_variant
        FROM public.product_variants AS v
        WHERE v.restaurant_id = v_restaurant
          AND v.product_id = v_id
          AND v.size_key = v_size_key
        FOR UPDATE;
        v_variant_exists := FOUND;
      END IF;

      IF v_variant_json ? 'size_label' THEN
        v_size_label := pg_catalog.btrim(v_variant_json->>'size_label');
      ELSIF v_variant_exists THEN
        v_size_label := v_variant.size_label;
      ELSE
        v_size_label := NULL;
      END IF;
      IF v_size_label IS NULL OR pg_catalog.char_length(v_size_label) NOT BETWEEN 1 AND 80 THEN
        RAISE EXCEPTION 'CATALOG_VARIANT_SIZE_LABEL_REQUIRED' USING ERRCODE = '22023';
      END IF;

      IF v_variant_json ? 'legacy_id' THEN
        v_variant_legacy_id := NULLIF(pg_catalog.btrim(v_variant_json->>'legacy_id'), '');
      ELSIF v_variant_exists THEN
        v_variant_legacy_id := v_variant.legacy_id;
      ELSE
        v_variant_legacy_id := NULL;
      END IF;
      IF v_variant_legacy_id IS NOT NULL AND pg_catalog.char_length(v_variant_legacy_id) > 120 THEN
        RAISE EXCEPTION 'CATALOG_VARIANT_LEGACY_ID_INVALID' USING ERRCODE = '22023';
      END IF;

      IF v_variant_json ? 'price' THEN
        IF v_variant_json->'price' = 'null'::jsonb THEN
          v_price := NULL;
        ELSE
          BEGIN
            v_raw_num := (v_variant_json->>'price')::numeric;
          EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
            RAISE EXCEPTION 'CATALOG_VARIANT_PRICE_INVALID' USING ERRCODE = '22023';
          END;
          IF v_raw_num < 0 OR pg_catalog.scale(v_raw_num) > 2 OR v_raw_num > 9999999999.99 THEN
            RAISE EXCEPTION 'CATALOG_VARIANT_PRICE_INVALID' USING ERRCODE = '22023';
          END IF;
          v_price := v_raw_num;
        END IF;
      ELSIF v_variant_exists THEN
        v_price := v_variant.price;
      ELSE
        v_price := NULL;
      END IF;

      IF v_variant_json ? 'sort_order' THEN
        BEGIN v_raw_num := (v_variant_json->>'sort_order')::numeric;
        EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
          RAISE EXCEPTION 'CATALOG_VARIANT_SORT_ORDER_INVALID' USING ERRCODE = '22023';
        END;
        IF pg_catalog.scale(v_raw_num) <> 0 OR v_raw_num < 0 OR v_raw_num > 2147483647 THEN
          RAISE EXCEPTION 'CATALOG_VARIANT_SORT_ORDER_INVALID' USING ERRCODE = '22023';
        END IF;
        v_sort := v_raw_num::integer;
      ELSIF v_variant_exists THEN v_sort := v_variant.sort_order;
      ELSE v_sort := 0;
      END IF;
      IF v_sort < 0 THEN
        RAISE EXCEPTION 'CATALOG_VARIANT_SORT_ORDER_INVALID' USING ERRCODE = '22023';
      END IF;

      IF v_variant_json ? 'variant_kind' THEN v_variant_kind := v_variant_json->>'variant_kind';
      ELSIF v_variant_exists THEN v_variant_kind := v_variant.variant_kind;
      ELSE v_variant_kind := 'standard';
      END IF;
      IF v_variant_kind NOT IN ('standard','portion','flavour','pack','volume') THEN
        RAISE EXCEPTION 'CATALOG_VARIANT_KIND_INVALID' USING ERRCODE = '22023';
      END IF;

      IF v_variant_json ? 'pack_quantity' THEN
        IF v_variant_json->'pack_quantity' = 'null'::jsonb THEN
          v_pack_quantity := NULL;
        ELSE
          BEGIN v_raw_num := (v_variant_json->>'pack_quantity')::numeric;
          EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
            RAISE EXCEPTION 'CATALOG_VARIANT_PACK_QUANTITY_INVALID' USING ERRCODE = '22023';
          END;
          IF pg_catalog.scale(v_raw_num) <> 0 OR v_raw_num < 1 OR v_raw_num > 2147483647 THEN
            RAISE EXCEPTION 'CATALOG_VARIANT_PACK_QUANTITY_INVALID' USING ERRCODE = '22023';
          END IF;
          v_pack_quantity := v_raw_num::integer;
        END IF;
      ELSIF v_variant_exists THEN v_pack_quantity := v_variant.pack_quantity;
      ELSE v_pack_quantity := NULL;
      END IF;

      IF v_variant_json ? 'pack_unit' THEN
        v_pack_unit := NULLIF(pg_catalog.btrim(v_variant_json->>'pack_unit'), '');
      ELSIF v_variant_exists THEN v_pack_unit := v_variant.pack_unit;
      ELSE v_pack_unit := NULL;
      END IF;

      IF v_variant_kind = 'pack' THEN
        IF v_pack_quantity IS NULL OR v_pack_quantity < 1
           OR v_pack_unit IS NULL OR pg_catalog.char_length(v_pack_unit) > 24 THEN
          RAISE EXCEPTION 'CATALOG_VARIANT_PACK_METADATA_REQUIRED' USING ERRCODE = '22023';
        END IF;
      ELSIF v_pack_quantity IS NOT NULL OR v_pack_unit IS NOT NULL THEN
        RAISE EXCEPTION 'CATALOG_VARIANT_PACK_METADATA_NOT_ALLOWED' USING ERRCODE = '22023';
      END IF;

      IF v_variant_json ? 'is_active' THEN v_variant_active := (v_variant_json->>'is_active')::boolean;
      ELSIF v_variant_exists THEN v_variant_active := v_variant.is_active;
      ELSE v_variant_active := false;
      END IF;
      IF v_variant_json ? 'is_available' THEN v_variant_available := (v_variant_json->>'is_available')::boolean;
      ELSIF v_variant_exists THEN v_variant_available := v_variant.is_available;
      ELSE v_variant_available := false;
      END IF;
      IF v_variant_json ? 'is_standalone_sellable' THEN
        v_standalone_sellable := (v_variant_json->>'is_standalone_sellable')::boolean;
      ELSIF v_variant_exists THEN v_standalone_sellable := v_variant.is_standalone_sellable;
      ELSE v_standalone_sellable := true;
      END IF;

      IF v_variant_exists THEN
        UPDATE public.product_variants AS v
        SET legacy_id = v_variant_legacy_id,
            size_key = v_size_key,
            size_label = v_size_label,
            price = v_price,
            sort_order = v_sort,
            is_active = v_variant_active,
            is_available = v_variant_available,
            variant_kind = v_variant_kind,
            pack_quantity = v_pack_quantity,
            pack_unit = v_pack_unit,
            is_standalone_sellable = v_standalone_sellable
        WHERE v.id = v_variant.id AND v.restaurant_id = v_restaurant
        RETURNING v.* INTO v_variant;
      ELSE
        INSERT INTO public.product_variants (
          restaurant_id, product_id, legacy_id, size_key, size_label, price,
          sort_order, is_active, is_available, variant_kind,
          pack_quantity, pack_unit, is_standalone_sellable
        )
        VALUES (
          v_restaurant, v_id, v_variant_legacy_id, v_size_key, v_size_label, v_price,
          v_sort, v_variant_active, v_variant_available, v_variant_kind,
          v_pack_quantity, v_pack_unit, v_standalone_sellable
        )
        RETURNING * INTO v_variant;
      END IF;
    END LOOP;
  END IF;

  SELECT pg_catalog.count(*) INTO v_variant_count
  FROM public.product_variants AS v
  WHERE v.restaurant_id = v_restaurant AND v.product_id = v_id;
  IF v_variant_count > 50 THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_VARIANT_LIMIT_EXCEEDED' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'product', pg_catalog.to_jsonb(p),
    'variants', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(v) ORDER BY v.sort_order, v.size_key, v.id)
      FROM public.product_variants AS v
      WHERE v.restaurant_id = v_restaurant AND v.product_id = v_id
    ), '[]'::jsonb)
  ) INTO v_after
  FROM public.products AS p
  WHERE p.id = v_id AND p.restaurant_id = v_restaurant;

  UPDATE public.catalog_draft_state AS s
  SET revision = s.revision + 1,
      updated_by = v_actor,
      updated_at = pg_catalog.clock_timestamp()
  WHERE s.restaurant_id = v_restaurant
  RETURNING s.revision INTO v_new_revision;

  INSERT INTO public.catalog_audit_log (
    restaurant_id, actor_user_id, actor_role_key, action_key,
    entity_type, entity_id, request_id, revision_before, revision_after,
    before_state, after_state
  )
  VALUES (
    v_restaurant, v_actor, v_role, 'product.upsert',
    'product', v_id, p_request_id, v_revision, v_new_revision,
    v_before, v_after
  );

  v_response := pg_catalog.jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'request_id', p_request_id,
    'draft_revision', v_new_revision,
    'entity_type', 'product',
    'entity_id', v_id,
    'record', v_after
  );

  INSERT INTO app_private.catalog_command_idempotency (
    restaurant_id, request_id, command_key, payload_hash, response_json
  )
  VALUES (v_restaurant, p_request_id, 'product_upsert', v_payload_hash, v_response);

  RETURN v_response;
END
$function$;


ALTER FUNCTION app_private.flame_chick_catalog_product_upsert_internal(jsonb, bigint, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_product_upsert_internal(jsonb, bigint, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_product_upsert_internal(jsonb, bigint, uuid)
  TO authenticated;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'app_private.flame_chick_catalog_product_upsert_internal(jsonb,bigint,uuid)'::regprocedure
      AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=""']
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
  ) THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_QA_SECURITY_CHECK_FAILED';
  END IF;
  IF pg_catalog.has_function_privilege('anon','public.flame_chick_catalog_product_upsert(jsonb,bigint,uuid)','EXECUTE')
     OR pg_catalog.has_function_privilege('service_role','public.flame_chick_catalog_product_upsert(jsonb,bigint,uuid)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated','public.flame_chick_catalog_product_upsert(jsonb,bigint,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_QA_GRANT_CHECK_FAILED';
  END IF;
END;
$verify$;

COMMIT;
