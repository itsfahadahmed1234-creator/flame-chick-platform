-- Flame Chick modifier authoring commands V1.
-- Reusable modifier groups/options are separate from product assignments and
-- exact-variant BY_SIZE price rules. Every aggregate mutation is atomic.
-- Drafts may be incomplete; publication/quote validation will enforce completeness.
-- No business data is seeded.

BEGIN;

-- Page by restaurant + UUID without scanning every tenant's groups.
CREATE INDEX IF NOT EXISTS modifier_groups_restaurant_id_id_idx
  ON public.modifier_groups (restaurant_id, id);


DO $preflight$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_COMMANDS_REQUIRE_POSTGRES';
  END IF;
  IF pg_catalog.to_regclass('public.modifier_groups') IS NULL
     OR pg_catalog.to_regclass('public.modifiers') IS NULL
     OR pg_catalog.to_regclass('public.modifier_group_assignments') IS NULL
     OR pg_catalog.to_regclass('public.modifier_price_rules') IS NULL
     OR pg_catalog.to_regclass('public.catalog_draft_state') IS NULL
     OR pg_catalog.to_regclass('public.catalog_audit_log') IS NULL
     OR pg_catalog.to_regclass('app_private.catalog_command_idempotency') IS NULL
     OR pg_catalog.to_regprocedure('app_private.flame_chick_catalog_actor()') IS NULL THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_COMMANDS_PREREQUISITE_MISSING';
  END IF;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- Modifier group + option aggregate read
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_modifier_draft_read_internal(
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_restaurant uuid;
  v_revision bigint;
  v_items jsonb;
  v_has_more boolean;
  v_last_id uuid;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_READ_LIMIT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT a.actor_user_id, a.restaurant_id
    INTO v_actor, v_restaurant
  FROM app_private.flame_chick_catalog_actor() AS a;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'CATALOG_ADMIN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT s.revision INTO v_revision
  FROM public.catalog_draft_state AS s
  WHERE s.restaurant_id = v_restaurant;

  WITH page AS MATERIALIZED (
    SELECT g.*
    FROM public.modifier_groups AS g
    WHERE g.restaurant_id = v_restaurant
      AND (p_after_id IS NULL OR g.id > p_after_id)
    ORDER BY g.id
    LIMIT p_limit + 1
  ),
  picked AS MATERIALIZED (
    SELECT * FROM page ORDER BY id LIMIT p_limit
  ),
  option_docs AS (
    SELECT
      m.modifier_group_id,
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', m.id,
          'legacy_id', m.legacy_id,
          'name_en', m.name_en,
          'name_ur', m.name_ur,
          'price_mode', m.price_mode,
          'fixed_price', m.fixed_price,
          'sort_order', m.sort_order,
          'is_active', m.is_active,
          'created_at', m.created_at,
          'updated_at', m.updated_at
        ) ORDER BY m.sort_order, m.id
      ) AS modifiers
    FROM public.modifiers AS m
    JOIN picked AS g ON g.id = m.modifier_group_id
    WHERE m.restaurant_id = v_restaurant
    GROUP BY m.modifier_group_id
  ),
  group_docs AS (
    SELECT
      g.id,
      pg_catalog.jsonb_build_object(
        'id', g.id,
        'legacy_id', g.legacy_id,
        'name_en', g.name_en,
        'name_ur', g.name_ur,
        'standalone_only', g.standalone_only,
        'selection_mode', g.selection_mode,
        'min_select', g.min_select,
        'max_select', g.max_select,
        'sort_order', g.sort_order,
        'is_active', g.is_active,
        'modifiers', COALESCE(o.modifiers, '[]'::jsonb),
        'created_at', g.created_at,
        'updated_at', g.updated_at
      ) AS item
    FROM picked AS g
    LEFT JOIN option_docs AS o ON o.modifier_group_id = g.id
  )
  SELECT
    COALESCE(
      (SELECT pg_catalog.jsonb_agg(d.item ORDER BY d.id) FROM group_docs AS d),
      '[]'::jsonb
    ),
    (SELECT pg_catalog.count(*) > p_limit FROM page),
    (SELECT g.id FROM picked AS g ORDER BY g.id DESC LIMIT 1)
  INTO v_items, v_has_more, v_last_id;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'entity_type', 'modifier_groups',
    'draft_revision', COALESCE(v_revision, 0),
    'items', COALESCE(v_items, '[]'::jsonb),
    'has_more', COALESCE(v_has_more, false),
    'next_cursor', CASE WHEN v_has_more THEN pg_catalog.to_jsonb(v_last_id) ELSE 'null'::jsonb END
  );
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_modifier_draft_read_internal(uuid, integer)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_modifier_draft_read_internal(uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_modifier_draft_read_internal(uuid, integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_catalog_modifier_draft_read(
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT app_private.flame_chick_catalog_modifier_draft_read_internal(
    p_after_id, p_limit
  )
$function$;

ALTER FUNCTION public.flame_chick_catalog_modifier_draft_read(uuid, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_modifier_draft_read(uuid, integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_modifier_draft_read(uuid, integer)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Product-specific assignment and exact-variant price-rule read
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_modifier_assignment_draft_read_internal(
  p_product_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_restaurant uuid;
  v_revision bigint;
  v_items jsonb;
BEGIN
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_PRODUCT_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT a.actor_user_id, a.restaurant_id
    INTO v_actor, v_restaurant
  FROM app_private.flame_chick_catalog_actor() AS a;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'CATALOG_ADMIN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products AS p
    WHERE p.id = p_product_id AND p.restaurant_id = v_restaurant
  ) THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.revision INTO v_revision
  FROM public.catalog_draft_state AS s
  WHERE s.restaurant_id = v_restaurant;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'assignment_id', a.id,
        'legacy_id', a.legacy_id,
        'is_active', a.is_active,
        'sort_order', a.sort_order,
        'modifier_group', pg_catalog.jsonb_build_object(
          'id', g.id,
          'name_en', g.name_en,
          'name_ur', g.name_ur,
          'standalone_only', g.standalone_only,
          'selection_mode', g.selection_mode,
          'min_select', g.min_select,
          'max_select', g.max_select,
          'is_active', g.is_active
        ),
        'modifiers', COALESCE((
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', m.id,
              'name_en', m.name_en,
              'name_ur', m.name_ur,
              'price_mode', m.price_mode,
              'fixed_price', m.fixed_price,
              'sort_order', m.sort_order,
              'is_active', m.is_active,
              'price_rules', COALESCE((
                SELECT pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'id', pr.id,
                    'product_variant_id', pr.product_variant_id,
                    'size_key', pv.size_key,
                    'size_label', pv.size_label,
                    'price', pr.price,
                    'legacy_id', pr.legacy_id
                  ) ORDER BY pv.sort_order, pv.size_key, pv.id
                )
                FROM public.modifier_price_rules AS pr
                JOIN public.product_variants AS pv
                  ON pv.id = pr.product_variant_id
                 AND pv.product_id = pr.product_id
                 AND pv.restaurant_id = pr.restaurant_id
                WHERE pr.restaurant_id = v_restaurant
                  AND pr.product_id = p_product_id
                  AND pr.modifier_group_id = g.id
                  AND pr.modifier_id = m.id
              ), '[]'::jsonb)
            ) ORDER BY m.sort_order, m.id
          )
          FROM public.modifiers AS m
          WHERE m.restaurant_id = v_restaurant
            AND m.modifier_group_id = g.id
        ), '[]'::jsonb)
      ) ORDER BY a.sort_order, g.sort_order, g.id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.modifier_group_assignments AS a
  JOIN public.modifier_groups AS g
    ON g.id = a.modifier_group_id
   AND g.restaurant_id = a.restaurant_id
  WHERE a.restaurant_id = v_restaurant
    AND a.product_id = p_product_id;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'entity_type', 'modifier_assignments',
    'product_id', p_product_id,
    'draft_revision', COALESCE(v_revision, 0),
    'items', v_items
  );
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_modifier_assignment_draft_read_internal(uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_modifier_assignment_draft_read_internal(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_modifier_assignment_draft_read_internal(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_catalog_modifier_assignment_draft_read(
  p_product_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT app_private.flame_chick_catalog_modifier_assignment_draft_read_internal(p_product_id)
$function$;

ALTER FUNCTION public.flame_chick_catalog_modifier_assignment_draft_read(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_modifier_assignment_draft_read(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_modifier_assignment_draft_read(uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Modifier group + modifier-option aggregate upsert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_modifier_group_upsert_internal(
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
  v_group public.modifier_groups%ROWTYPE;
  v_modifier public.modifiers%ROWTYPE;
  v_option jsonb;
  v_option_id uuid;
  v_legacy_id text;
  v_name_en text;
  v_name_ur text;
  v_standalone_only boolean;
  v_selection_mode text;
  v_min_select integer;
  v_max_select integer;
  v_sort_order integer;
  v_is_active boolean;
  v_price_mode text;
  v_fixed_price numeric;
  v_num numeric;
  v_option_sort integer;
  v_option_active boolean;
  v_seen_option_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_REQUEST_AND_REVISION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_GROUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.octet_length(pg_catalog.convert_to(p_payload::text, 'UTF8')) > 65536 THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_GROUP_PAYLOAD_TOO_LARGE' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_payload) AS k(key)
    WHERE k.key <> ALL (ARRAY[
      'id','legacy_id','name_en','name_ur','standalone_only',
      'selection_mode','min_select','max_select','sort_order','is_active','modifiers'
    ])
  ) THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_GROUP_FIELD_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;
  IF (p_payload ? 'legacy_id' AND p_payload->'legacy_id'<>'null'::jsonb
      AND pg_catalog.jsonb_typeof(p_payload->'legacy_id')<>'string')
     OR (p_payload ? 'name_en' AND pg_catalog.jsonb_typeof(p_payload->'name_en')<>'string')
     OR (p_payload ? 'name_ur' AND p_payload->'name_ur'<>'null'::jsonb
      AND pg_catalog.jsonb_typeof(p_payload->'name_ur')<>'string')
     OR (p_payload ? 'standalone_only' AND pg_catalog.jsonb_typeof(p_payload->'standalone_only')<>'boolean')
     OR (p_payload ? 'selection_mode' AND pg_catalog.jsonb_typeof(p_payload->'selection_mode')<>'string')
     OR (p_payload ? 'min_select' AND pg_catalog.jsonb_typeof(p_payload->'min_select')<>'number')
     OR (p_payload ? 'max_select' AND pg_catalog.jsonb_typeof(p_payload->'max_select')<>'number')
     OR (p_payload ? 'sort_order' AND pg_catalog.jsonb_typeof(p_payload->'sort_order')<>'number')
     OR (p_payload ? 'is_active' AND pg_catalog.jsonb_typeof(p_payload->'is_active')<>'boolean') THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_GROUP_FIELD_TYPE_INVALID' USING ERRCODE='22023';
  END IF;

  BEGIN
    v_id := NULLIF(p_payload->>'id','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_GROUP_ID_INVALID' USING ERRCODE = '22023';
  END;

  IF p_payload ? 'modifiers' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'modifiers') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'CATALOG_MODIFIERS_ARRAY_INVALID' USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.jsonb_array_length(p_payload->'modifiers') > 50 THEN
      RAISE EXCEPTION 'CATALOG_MODIFIERS_ARRAY_INVALID' USING ERRCODE = '22023';
    END IF;

    FOR v_option IN
      SELECT x.value FROM pg_catalog.jsonb_array_elements(p_payload->'modifiers') AS x(value)
    LOOP
      IF pg_catalog.jsonb_typeof(v_option) <> 'object'
         OR EXISTS (
           SELECT 1 FROM pg_catalog.jsonb_object_keys(v_option) AS k(key)
           WHERE k.key <> ALL (ARRAY[
             'id','legacy_id','name_en','name_ur','price_mode',
             'fixed_price','sort_order','is_active'
           ])
         ) THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_FIELDS_INVALID' USING ERRCODE = '22023';
      END IF;

      IF v_option ? 'id' AND v_option->'id' <> 'null'::jsonb THEN
        BEGIN
          v_option_id := (v_option->>'id')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
          RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_ID_INVALID' USING ERRCODE = '22023';
        END;
        IF v_option_id = ANY(v_seen_option_ids) THEN
          RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_ID_DUPLICATED' USING ERRCODE = '22023';
        END IF;
        v_seen_option_ids := pg_catalog.array_append(v_seen_option_ids, v_option_id);
      END IF;

      IF (v_option ? 'legacy_id' AND v_option->'legacy_id'<>'null'::jsonb
          AND pg_catalog.jsonb_typeof(v_option->'legacy_id')<>'string')
         OR (v_option ? 'name_en' AND pg_catalog.jsonb_typeof(v_option->'name_en')<>'string')
         OR (v_option ? 'name_ur' AND v_option->'name_ur'<>'null'::jsonb
          AND pg_catalog.jsonb_typeof(v_option->'name_ur')<>'string')
         OR (v_option ? 'price_mode' AND pg_catalog.jsonb_typeof(v_option->'price_mode')<>'string')
         OR (v_option ? 'fixed_price' AND v_option->'fixed_price'<>'null'::jsonb
          AND pg_catalog.jsonb_typeof(v_option->'fixed_price')<>'number')
         OR (v_option ? 'sort_order' AND pg_catalog.jsonb_typeof(v_option->'sort_order')<>'number')
         OR (v_option ? 'is_active' AND pg_catalog.jsonb_typeof(v_option->'is_active')<>'boolean') THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_FIELD_TYPE_INVALID' USING ERRCODE='22023';
      END IF;
      IF v_option ? 'legacy_id'
         AND v_option->'legacy_id' <> 'null'::jsonb
         AND pg_catalog.jsonb_typeof(v_option->'legacy_id') <> 'string' THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_LEGACY_ID_INVALID' USING ERRCODE = '22023';
      END IF;
      IF v_option ? 'name_en'
         AND pg_catalog.jsonb_typeof(v_option->'name_en') <> 'string' THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_NAME_EN_INVALID' USING ERRCODE = '22023';
      END IF;
      IF v_option ? 'name_ur'
         AND v_option->'name_ur' <> 'null'::jsonb
         AND pg_catalog.jsonb_typeof(v_option->'name_ur') <> 'string' THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_NAME_UR_INVALID' USING ERRCODE = '22023';
      END IF;
      IF v_option ? 'price_mode'
         AND pg_catalog.jsonb_typeof(v_option->'price_mode') <> 'string' THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_PRICE_MODE_INVALID' USING ERRCODE = '22023';
      END IF;
      IF v_option ? 'fixed_price'
         AND v_option->'fixed_price' <> 'null'::jsonb
         AND pg_catalog.jsonb_typeof(v_option->'fixed_price') <> 'number' THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_FIXED_PRICE_INVALID' USING ERRCODE = '22023';
      END IF;
      IF v_option ? 'sort_order'
         AND pg_catalog.jsonb_typeof(v_option->'sort_order') <> 'number' THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_SORT_ORDER_INVALID' USING ERRCODE = '22023';
      END IF;
      IF v_option ? 'is_active'
         AND pg_catalog.jsonb_typeof(v_option->'is_active') <> 'boolean' THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_ACTIVE_INVALID' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  SELECT a.actor_user_id, a.restaurant_id, a.role_key
    INTO v_actor, v_restaurant, v_role
  FROM app_private.flame_chick_catalog_actor() AS a;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'CATALOG_ADMIN_FORBIDDEN' USING ERRCODE = '42501';
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
        'action','modifier_group_upsert',
        'expected_revision',p_expected_revision,
        'payload',p_payload
      )::text,
      'UTF8'
    )
  );

  SELECT i.* INTO v_existing
  FROM app_private.catalog_command_idempotency AS i
  WHERE i.restaurant_id = v_restaurant AND i.request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.command_key <> 'modifier_group_upsert'
       OR v_existing.payload_hash <> v_payload_hash THEN
      RAISE EXCEPTION 'CATALOG_IDEMPOTENCY_KEY_REUSED' USING ERRCODE = '22023';
    END IF;
    RETURN pg_catalog.jsonb_set(v_existing.response_json,'{idempotent}','true'::jsonb,true);
  END IF;

  IF v_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'CATALOG_REVISION_CONFLICT'
      USING ERRCODE = '40001',
            DETAIL = pg_catalog.format('current_revision=%s',v_revision);
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT g.* INTO v_group
    FROM public.modifier_groups AS g
    WHERE g.id=v_id AND g.restaurant_id=v_restaurant
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_GROUP_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    v_before := pg_catalog.jsonb_build_object(
      'group',pg_catalog.to_jsonb(v_group),
      'modifiers',COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) ORDER BY m.sort_order,m.id)
        FROM public.modifiers AS m
        WHERE m.restaurant_id=v_restaurant AND m.modifier_group_id=v_id
      ),'[]'::jsonb)
    );
  ELSE
    v_before := NULL;
  END IF;

  IF p_payload ? 'name_en' THEN v_name_en:=pg_catalog.btrim(p_payload->>'name_en');
  ELSIF v_id IS NOT NULL THEN v_name_en:=v_group.name_en;
  ELSE v_name_en:=NULL;
  END IF;
  IF v_name_en IS NULL OR pg_catalog.char_length(v_name_en) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_GROUP_NAME_EN_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'name_ur' THEN
    v_name_ur:=NULLIF(pg_catalog.btrim(p_payload->>'name_ur'),'');
  ELSIF v_id IS NOT NULL THEN v_name_ur:=v_group.name_ur;
  ELSE v_name_ur:=NULL;
  END IF;
  IF v_name_ur IS NOT NULL AND pg_catalog.char_length(v_name_ur)>120 THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_GROUP_NAME_UR_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'legacy_id' THEN
    v_legacy_id:=NULLIF(pg_catalog.btrim(p_payload->>'legacy_id'),'');
  ELSIF v_id IS NOT NULL THEN v_legacy_id:=v_group.legacy_id;
  ELSE v_legacy_id:=NULL;
  END IF;
  IF v_legacy_id IS NOT NULL AND pg_catalog.char_length(v_legacy_id)>120 THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_GROUP_LEGACY_ID_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'standalone_only' THEN v_standalone_only:=(p_payload->>'standalone_only')::boolean;
  ELSIF v_id IS NOT NULL THEN v_standalone_only:=v_group.standalone_only;
  ELSE v_standalone_only:=false;
  END IF;

  IF p_payload ? 'selection_mode' THEN v_selection_mode:=p_payload->>'selection_mode';
  ELSIF v_id IS NOT NULL THEN v_selection_mode:=v_group.selection_mode;
  ELSE v_selection_mode:='ONE_OPTIONAL';
  END IF;
  IF v_selection_mode NOT IN ('ONE_OPTIONAL','ONE_REQUIRED','MULTIPLE_OPTIONAL','MULTIPLE_REQUIRED') THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_SELECTION_MODE_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'min_select' THEN
    BEGIN v_num:=(p_payload->>'min_select')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_MIN_SELECT_INVALID' USING ERRCODE = '22023';
    END;
    IF pg_catalog.scale(v_num)<>0 OR v_num<0 OR v_num>50 THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_MIN_SELECT_INVALID' USING ERRCODE = '22023';
    END IF;
    v_min_select:=v_num::integer;
  ELSIF v_id IS NOT NULL THEN v_min_select:=v_group.min_select;
  ELSE v_min_select:=0;
  END IF;

  IF p_payload ? 'max_select' THEN
    BEGIN v_num:=(p_payload->>'max_select')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_MAX_SELECT_INVALID' USING ERRCODE = '22023';
    END;
    IF pg_catalog.scale(v_num)<>0 OR v_num<1 OR v_num>50 THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_MAX_SELECT_INVALID' USING ERRCODE = '22023';
    END IF;
    v_max_select:=v_num::integer;
  ELSIF v_id IS NOT NULL THEN v_max_select:=v_group.max_select;
  ELSE v_max_select:=1;
  END IF;

  IF NOT (
    (v_selection_mode='ONE_OPTIONAL' AND v_min_select=0 AND v_max_select=1)
    OR (v_selection_mode='ONE_REQUIRED' AND v_min_select=1 AND v_max_select=1)
    OR (v_selection_mode='MULTIPLE_OPTIONAL' AND v_min_select=0 AND v_max_select BETWEEN 1 AND 50)
    OR (v_selection_mode='MULTIPLE_REQUIRED' AND v_min_select BETWEEN 1 AND v_max_select AND v_max_select<=50)
  ) THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_SELECTION_BOUNDS_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'sort_order' THEN
    BEGIN v_num:=(p_payload->>'sort_order')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_GROUP_SORT_INVALID' USING ERRCODE = '22023';
    END;
    IF pg_catalog.scale(v_num)<>0 OR v_num<0 OR v_num>2147483647 THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_GROUP_SORT_INVALID' USING ERRCODE = '22023';
    END IF;
    v_sort_order:=v_num::integer;
  ELSIF v_id IS NOT NULL THEN v_sort_order:=v_group.sort_order;
  ELSE v_sort_order:=0;
  END IF;

  IF p_payload ? 'is_active' THEN v_is_active:=(p_payload->>'is_active')::boolean;
  ELSIF v_id IS NOT NULL THEN v_is_active:=v_group.is_active;
  ELSE v_is_active:=false;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.modifier_groups(
      restaurant_id,legacy_id,name_en,name_ur,standalone_only,
      selection_mode,min_select,max_select,sort_order,is_active
    )
    VALUES (
      v_restaurant,v_legacy_id,v_name_en,v_name_ur,v_standalone_only,
      v_selection_mode,v_min_select,v_max_select,v_sort_order,v_is_active
    )
    RETURNING * INTO v_group;
    v_id:=v_group.id;
  ELSE
    UPDATE public.modifier_groups AS g
    SET legacy_id=v_legacy_id,name_en=v_name_en,name_ur=v_name_ur,
        standalone_only=v_standalone_only,selection_mode=v_selection_mode,
        min_select=v_min_select,max_select=v_max_select,
        sort_order=v_sort_order,is_active=v_is_active
    WHERE g.id=v_id AND g.restaurant_id=v_restaurant
    RETURNING g.* INTO v_group;
  END IF;

  -- A modifier changing away from BY_SIZE must not leave obsolete per-variant
  -- prices behind. Remove those rules explicitly via the assignment editor first.
  IF p_payload ? 'modifiers' THEN
    FOR v_option IN
      SELECT x.value FROM pg_catalog.jsonb_array_elements(p_payload->'modifiers') AS x(value)
    LOOP
      v_option_id:=NULL;
      IF v_option ? 'id' AND v_option->'id'<>'null'::jsonb THEN
        v_option_id:=(v_option->>'id')::uuid;
      END IF;

      IF v_option_id IS NOT NULL THEN
        SELECT m.* INTO v_modifier
        FROM public.modifiers AS m
        WHERE m.id=v_option_id
          AND m.restaurant_id=v_restaurant
          AND m.modifier_group_id=v_id
        FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_NOT_FOUND' USING ERRCODE = 'P0002';
        END IF;
      END IF;

      IF v_option ? 'name_en' THEN v_name_en:=pg_catalog.btrim(v_option->>'name_en');
      ELSIF v_option_id IS NOT NULL THEN v_name_en:=v_modifier.name_en;
      ELSE v_name_en:=NULL;
      END IF;
      IF v_name_en IS NULL OR pg_catalog.char_length(v_name_en) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_NAME_EN_REQUIRED' USING ERRCODE = '22023';
      END IF;

      IF v_option ? 'name_ur' THEN v_name_ur:=NULLIF(pg_catalog.btrim(v_option->>'name_ur'),'');
      ELSIF v_option_id IS NOT NULL THEN v_name_ur:=v_modifier.name_ur;
      ELSE v_name_ur:=NULL;
      END IF;
      IF v_name_ur IS NOT NULL AND pg_catalog.char_length(v_name_ur)>120 THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_NAME_UR_INVALID' USING ERRCODE = '22023';
      END IF;

      IF v_option ? 'legacy_id' THEN v_legacy_id:=NULLIF(pg_catalog.btrim(v_option->>'legacy_id'),'');
      ELSIF v_option_id IS NOT NULL THEN v_legacy_id:=v_modifier.legacy_id;
      ELSE v_legacy_id:=NULL;
      END IF;
      IF v_legacy_id IS NOT NULL AND pg_catalog.char_length(v_legacy_id)>120 THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_LEGACY_ID_INVALID' USING ERRCODE = '22023';
      END IF;

      IF v_option ? 'price_mode' THEN v_price_mode:=v_option->>'price_mode';
      ELSIF v_option_id IS NOT NULL THEN v_price_mode:=v_modifier.price_mode;
      ELSE v_price_mode:='FREE';
      END IF;
      IF v_price_mode NOT IN ('FREE','FIXED','BY_SIZE') THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_PRICE_MODE_INVALID' USING ERRCODE = '22023';
      END IF;

      IF v_option ? 'fixed_price' THEN
        IF v_option->'fixed_price'='null'::jsonb THEN
          v_fixed_price:=NULL;
        ELSE
          BEGIN v_num:=(v_option->>'fixed_price')::numeric;
          EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
            RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_FIXED_PRICE_INVALID' USING ERRCODE = '22023';
          END;
          IF v_num<0 OR pg_catalog.scale(v_num)>2 OR v_num>9999999999.99 THEN
            RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_FIXED_PRICE_INVALID' USING ERRCODE = '22023';
          END IF;
          v_fixed_price:=v_num;
        END IF;
      ELSIF v_option_id IS NOT NULL AND v_price_mode=v_modifier.price_mode THEN
        v_fixed_price:=v_modifier.fixed_price;
      ELSE
        v_fixed_price:=NULL;
      END IF;

      IF (v_price_mode='FIXED' AND v_fixed_price IS NULL)
         OR (v_price_mode IN ('FREE','BY_SIZE') AND v_fixed_price IS NOT NULL) THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_PRICE_CONFIGURATION_INVALID' USING ERRCODE = '22023';
      END IF;

      IF v_option_id IS NOT NULL
         AND v_modifier.price_mode='BY_SIZE'
         AND v_price_mode<>'BY_SIZE'
         AND EXISTS (
           SELECT 1 FROM public.modifier_price_rules AS pr
           WHERE pr.restaurant_id=v_restaurant AND pr.modifier_id=v_option_id
         ) THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_PRICE_RULES_MUST_BE_REMOVED_FIRST' USING ERRCODE = '23514';
      END IF;

      IF v_option ? 'sort_order' THEN
        BEGIN v_num:=(v_option->>'sort_order')::numeric;
        EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
          RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_SORT_INVALID' USING ERRCODE = '22023';
        END;
        IF pg_catalog.scale(v_num)<>0 OR v_num<0 OR v_num>2147483647 THEN
          RAISE EXCEPTION 'CATALOG_MODIFIER_OPTION_SORT_INVALID' USING ERRCODE = '22023';
        END IF;
        v_option_sort:=v_num::integer;
      ELSIF v_option_id IS NOT NULL THEN v_option_sort:=v_modifier.sort_order;
      ELSE v_option_sort:=0;
      END IF;

      IF v_option ? 'is_active' THEN v_option_active:=(v_option->>'is_active')::boolean;
      ELSIF v_option_id IS NOT NULL THEN v_option_active:=v_modifier.is_active;
      ELSE v_option_active:=false;
      END IF;

      IF v_option_id IS NULL THEN
        INSERT INTO public.modifiers(
          restaurant_id,modifier_group_id,legacy_id,name_en,name_ur,
          price_mode,fixed_price,sort_order,is_active
        )
        VALUES (
          v_restaurant,v_id,v_legacy_id,v_name_en,v_name_ur,
          v_price_mode,v_fixed_price,v_option_sort,v_option_active
        );
      ELSE
        UPDATE public.modifiers AS m
        SET legacy_id=v_legacy_id,name_en=v_name_en,name_ur=v_name_ur,
            price_mode=v_price_mode,fixed_price=v_fixed_price,
            sort_order=v_option_sort,is_active=v_option_active
        WHERE m.id=v_option_id
          AND m.restaurant_id=v_restaurant
          AND m.modifier_group_id=v_id;
      END IF;
    END LOOP;
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'group',pg_catalog.to_jsonb(g),
    'modifiers',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) ORDER BY m.sort_order,m.id)
      FROM public.modifiers AS m
      WHERE m.restaurant_id=v_restaurant AND m.modifier_group_id=v_id
    ),'[]'::jsonb)
  )
  INTO v_after
  FROM public.modifier_groups AS g
  WHERE g.id=v_id AND g.restaurant_id=v_restaurant;

  UPDATE public.catalog_draft_state AS s
  SET revision=s.revision+1,updated_by=v_actor,updated_at=pg_catalog.clock_timestamp()
  WHERE s.restaurant_id=v_restaurant
  RETURNING s.revision INTO v_new_revision;

  INSERT INTO public.catalog_audit_log(
    restaurant_id,actor_user_id,actor_role_key,action_key,entity_type,entity_id,
    request_id,revision_before,revision_after,before_state,after_state
  )
  VALUES(
    v_restaurant,v_actor,v_role,'modifier_group.upsert','modifier_group',v_id,
    p_request_id,v_revision,v_new_revision,v_before,v_after
  );

  v_response:=pg_catalog.jsonb_build_object(
    'ok',true,'idempotent',false,'request_id',p_request_id,
    'draft_revision',v_new_revision,'entity_type','modifier_group',
    'entity_id',v_id,'record',v_after
  );

  INSERT INTO app_private.catalog_command_idempotency(
    restaurant_id,request_id,command_key,payload_hash,response_json
  )
  VALUES(v_restaurant,p_request_id,'modifier_group_upsert',v_payload_hash,v_response);

  RETURN v_response;
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_modifier_group_upsert_internal(jsonb,bigint,uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_modifier_group_upsert_internal(jsonb,bigint,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_modifier_group_upsert_internal(jsonb,bigint,uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_catalog_modifier_group_upsert(
  p_payload jsonb,
  p_expected_revision bigint,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT app_private.flame_chick_catalog_modifier_group_upsert_internal(
    p_payload,p_expected_revision,p_request_id
  )
$function$;

ALTER FUNCTION public.flame_chick_catalog_modifier_group_upsert(jsonb,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_modifier_group_upsert(jsonb,bigint,uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_modifier_group_upsert(jsonb,bigint,uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Product assignment + exact product_variant_id price-rule aggregate upsert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_modifier_assignment_upsert_internal(
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
  v_assignment public.modifier_group_assignments%ROWTYPE;
  v_assignment_id uuid;
  v_group_id uuid;
  v_product_id uuid;
  v_legacy_id text;
  v_sort_order integer;
  v_is_active boolean;
  v_rule jsonb;
  v_remove jsonb;
  v_modifier_id uuid;
  v_variant_id uuid;
  v_price numeric;
  v_num numeric;
  v_rule_legacy_id text;
  v_modifier public.modifiers%ROWTYPE;
  v_variant public.product_variants%ROWTYPE;
  v_existing_rule public.modifier_price_rules%ROWTYPE;
  v_rule_exists boolean;
  v_key text;
  v_seen_keys text[]:=ARRAY[]::text[];
  v_seen_remove_keys text[]:=ARRAY[]::text[];
BEGIN
  IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_ASSIGNMENT_REQUEST_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload)<>'object' THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_ASSIGNMENT_PAYLOAD_INVALID' USING ERRCODE='22023';
  END IF;
  IF pg_catalog.octet_length(pg_catalog.convert_to(p_payload::text,'UTF8'))>65536 THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_ASSIGNMENT_PAYLOAD_TOO_LARGE' USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_payload) AS k(key)
    WHERE k.key<>ALL(ARRAY[
      'id','modifier_group_id','product_id','legacy_id','is_active','sort_order',
      'price_rules','remove_price_rules'
    ])
  ) THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_ASSIGNMENT_FIELD_NOT_ALLOWED' USING ERRCODE='22023';
  END IF;

  BEGIN
    v_assignment_id:=NULLIF(p_payload->>'id','')::uuid;
    v_group_id:=NULLIF(p_payload->>'modifier_group_id','')::uuid;
    v_product_id:=NULLIF(p_payload->>'product_id','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_ASSIGNMENT_ID_INVALID' USING ERRCODE='22023';
  END;
  IF v_group_id IS NULL OR v_product_id IS NULL THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_ASSIGNMENT_TARGET_REQUIRED' USING ERRCODE='22023';
  END IF;

  IF (p_payload ? 'id' AND p_payload->'id'<>'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'id')<>'string')
     OR (p_payload ? 'modifier_group_id' AND pg_catalog.jsonb_typeof(p_payload->'modifier_group_id')<>'string')
     OR (p_payload ? 'product_id' AND pg_catalog.jsonb_typeof(p_payload->'product_id')<>'string')
     OR (p_payload ? 'legacy_id' AND p_payload->'legacy_id'<>'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'legacy_id')<>'string')
     OR (p_payload ? 'is_active' AND pg_catalog.jsonb_typeof(p_payload->'is_active')<>'boolean')
     OR (p_payload ? 'sort_order' AND pg_catalog.jsonb_typeof(p_payload->'sort_order')<>'number') THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_ASSIGNMENT_FIELD_TYPE_INVALID' USING ERRCODE='22023';
  END IF;

  IF p_payload ? 'price_rules' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'price_rules') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_PRICE_RULES_ARRAY_INVALID' USING ERRCODE='22023';
    END IF;
    IF pg_catalog.jsonb_array_length(p_payload->'price_rules')>200 THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_PRICE_RULES_ARRAY_INVALID' USING ERRCODE='22023';
    END IF;
    FOR v_rule IN
      SELECT x.value FROM pg_catalog.jsonb_array_elements(p_payload->'price_rules') AS x(value)
    LOOP
      IF pg_catalog.jsonb_typeof(v_rule)<>'object'
         OR EXISTS(
           SELECT 1 FROM pg_catalog.jsonb_object_keys(v_rule) AS k(key)
           WHERE k.key<>ALL(ARRAY['modifier_id','product_variant_id','legacy_id','price'])
         ) THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_PRICE_RULE_FIELDS_INVALID' USING ERRCODE='22023';
      END IF;
      IF pg_catalog.jsonb_typeof(v_rule->'modifier_id')<>'string'
         OR pg_catalog.jsonb_typeof(v_rule->'product_variant_id')<>'string'
         OR pg_catalog.jsonb_typeof(v_rule->'price')<>'number' THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_PRICE_RULE_VALUE_INVALID' USING ERRCODE='22023';
      END IF;
      BEGIN
        v_modifier_id:=(v_rule->>'modifier_id')::uuid;
        v_variant_id:=(v_rule->>'product_variant_id')::uuid;
        v_num:=(v_rule->>'price')::numeric;
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_PRICE_RULE_VALUE_INVALID' USING ERRCODE='22023';
      END;
      IF v_rule->'price' IS NULL OR v_rule->'price'='null'::jsonb
         OR v_num<0 OR pg_catalog.scale(v_num)>2 OR v_num>9999999999.99 THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_PRICE_RULE_PRICE_INVALID' USING ERRCODE='22023';
      END IF;
      v_key:=v_modifier_id::text||':'||v_variant_id::text;
      IF v_key=ANY(v_seen_keys) THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_PRICE_RULE_DUPLICATED' USING ERRCODE='22023';
      END IF;
      v_seen_keys:=pg_catalog.array_append(v_seen_keys,v_key);
      IF v_rule ? 'legacy_id'
         AND v_rule->'legacy_id'<>'null'::jsonb
         AND pg_catalog.jsonb_typeof(v_rule->'legacy_id')<>'string' THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_PRICE_RULE_LEGACY_ID_INVALID' USING ERRCODE='22023';
      END IF;
    END LOOP;
  END IF;

  IF p_payload ? 'remove_price_rules' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'remove_price_rules') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_REMOVE_RULES_ARRAY_INVALID' USING ERRCODE='22023';
    END IF;
    IF pg_catalog.jsonb_array_length(p_payload->'remove_price_rules')>200 THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_REMOVE_RULES_ARRAY_INVALID' USING ERRCODE='22023';
    END IF;
    FOR v_remove IN
      SELECT x.value FROM pg_catalog.jsonb_array_elements(p_payload->'remove_price_rules') AS x(value)
    LOOP
      IF pg_catalog.jsonb_typeof(v_remove)<>'object'
         OR EXISTS(
           SELECT 1 FROM pg_catalog.jsonb_object_keys(v_remove) AS k(key)
           WHERE k.key<>ALL(ARRAY['modifier_id','product_variant_id'])
         ) THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_REMOVE_RULE_FIELDS_INVALID' USING ERRCODE='22023';
      END IF;
      IF pg_catalog.jsonb_typeof(v_remove->'modifier_id')<>'string'
         OR pg_catalog.jsonb_typeof(v_remove->'product_variant_id')<>'string' THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_REMOVE_RULE_VALUE_INVALID' USING ERRCODE='22023';
      END IF;
      BEGIN
        v_modifier_id:=(v_remove->>'modifier_id')::uuid;
        v_variant_id:=(v_remove->>'product_variant_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_REMOVE_RULE_VALUE_INVALID' USING ERRCODE='22023';
      END;
      IF NOT EXISTS(
        SELECT 1 FROM public.modifiers AS m
        WHERE m.id=v_modifier_id AND m.restaurant_id=v_restaurant
          AND m.modifier_group_id=v_group_id
      ) OR NOT EXISTS(
        SELECT 1 FROM public.product_variants AS pv
        WHERE pv.id=v_variant_id AND pv.restaurant_id=v_restaurant
          AND pv.product_id=v_product_id
      ) THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_REMOVE_RULE_TARGET_MISMATCH' USING ERRCODE='23514';
      END IF;
      v_key:=v_modifier_id::text||':'||v_variant_id::text;
      IF v_key=ANY(v_seen_remove_keys) OR v_key=ANY(v_seen_keys) THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_REMOVE_RULE_DUPLICATED_OR_CONFLICTS' USING ERRCODE='22023';
      END IF;
      v_seen_remove_keys:=pg_catalog.array_append(v_seen_remove_keys,v_key);
    END LOOP;
  END IF;

  SELECT a.actor_user_id,a.restaurant_id,a.role_key
    INTO v_actor,v_restaurant,v_role
  FROM app_private.flame_chick_catalog_actor() AS a;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'CATALOG_ADMIN_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.catalog_draft_state(restaurant_id)
  VALUES(v_restaurant)
  ON CONFLICT(restaurant_id) DO NOTHING;

  SELECT s.revision INTO v_revision
  FROM public.catalog_draft_state AS s
  WHERE s.restaurant_id=v_restaurant
  FOR UPDATE;

  v_payload_hash:=pg_catalog.sha256(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'action','modifier_assignment_upsert',
        'expected_revision',p_expected_revision,
        'payload',p_payload
      )::text,'UTF8'
    )
  );

  SELECT i.* INTO v_existing
  FROM app_private.catalog_command_idempotency AS i
  WHERE i.restaurant_id=v_restaurant AND i.request_id=p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.command_key<>'modifier_assignment_upsert'
       OR v_existing.payload_hash<>v_payload_hash THEN
      RAISE EXCEPTION 'CATALOG_IDEMPOTENCY_KEY_REUSED' USING ERRCODE='22023';
    END IF;
    RETURN pg_catalog.jsonb_set(v_existing.response_json,'{idempotent}','true'::jsonb,true);
  END IF;

  IF v_revision<>p_expected_revision THEN
    RAISE EXCEPTION 'CATALOG_REVISION_CONFLICT'
      USING ERRCODE='40001',
            DETAIL=pg_catalog.format('current_revision=%s',v_revision);
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.products AS p
    WHERE p.id=v_product_id AND p.restaurant_id=v_restaurant
  ) THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_ASSIGNMENT_PRODUCT_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.modifier_groups AS g
    WHERE g.id=v_group_id AND g.restaurant_id=v_restaurant
  ) THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_ASSIGNMENT_GROUP_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  IF v_assignment_id IS NOT NULL THEN
    SELECT a.* INTO v_assignment
    FROM public.modifier_group_assignments AS a
    WHERE a.id=v_assignment_id AND a.restaurant_id=v_restaurant
      AND a.modifier_group_id=v_group_id AND a.product_id=v_product_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_ASSIGNMENT_NOT_FOUND' USING ERRCODE='P0002';
    END IF;
  ELSE
    SELECT a.* INTO v_assignment
    FROM public.modifier_group_assignments AS a
    WHERE a.restaurant_id=v_restaurant
      AND a.modifier_group_id=v_group_id
      AND a.product_id=v_product_id
    FOR UPDATE;
  END IF;

  IF FOUND THEN
    v_assignment_id:=v_assignment.id;
    v_before:=pg_catalog.jsonb_build_object(
      'assignment',pg_catalog.to_jsonb(v_assignment),
      'price_rules',COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(pr) ORDER BY pr.modifier_id,pr.product_variant_id)
        FROM public.modifier_price_rules AS pr
        WHERE pr.restaurant_id=v_restaurant
          AND pr.modifier_group_id=v_group_id
          AND pr.product_id=v_product_id
      ),'[]'::jsonb)
    );
  ELSE
    v_assignment_id:=NULL;
    v_before:=NULL;
  END IF;

  IF p_payload ? 'legacy_id' THEN
    IF p_payload->'legacy_id'<>'null'::jsonb
       AND pg_catalog.jsonb_typeof(p_payload->'legacy_id')<>'string' THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_ASSIGNMENT_LEGACY_ID_INVALID' USING ERRCODE='22023';
    END IF;
    v_legacy_id:=NULLIF(pg_catalog.btrim(p_payload->>'legacy_id'),'');
  ELSIF v_assignment_id IS NOT NULL THEN v_legacy_id:=v_assignment.legacy_id;
  ELSE v_legacy_id:=NULL;
  END IF;
  IF v_legacy_id IS NOT NULL AND pg_catalog.char_length(v_legacy_id)>120 THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_ASSIGNMENT_LEGACY_ID_INVALID' USING ERRCODE='22023';
  END IF;

  IF p_payload ? 'sort_order' THEN
    BEGIN v_num:=(p_payload->>'sort_order')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_ASSIGNMENT_SORT_INVALID' USING ERRCODE='22023';
    END;
    IF pg_catalog.scale(v_num)<>0 OR v_num<0 OR v_num>2147483647 THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_ASSIGNMENT_SORT_INVALID' USING ERRCODE='22023';
    END IF;
    v_sort_order:=v_num::integer;
  ELSIF v_assignment_id IS NOT NULL THEN v_sort_order:=v_assignment.sort_order;
  ELSE v_sort_order:=0;
  END IF;

  IF p_payload ? 'is_active' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'is_active')<>'boolean' THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_ASSIGNMENT_ACTIVE_INVALID' USING ERRCODE='22023';
    END IF;
    v_is_active:=(p_payload->>'is_active')::boolean;
  ELSIF v_assignment_id IS NOT NULL THEN v_is_active:=v_assignment.is_active;
  ELSE v_is_active:=false;
  END IF;

  IF v_assignment_id IS NULL THEN
    INSERT INTO public.modifier_group_assignments(
      restaurant_id,modifier_group_id,product_id,legacy_id,is_active,sort_order
    )
    VALUES(v_restaurant,v_group_id,v_product_id,v_legacy_id,v_is_active,v_sort_order)
    RETURNING * INTO v_assignment;
    v_assignment_id:=v_assignment.id;
  ELSE
    UPDATE public.modifier_group_assignments AS a
    SET legacy_id=v_legacy_id,is_active=v_is_active,sort_order=v_sort_order
    WHERE a.id=v_assignment_id AND a.restaurant_id=v_restaurant
    RETURNING a.* INTO v_assignment;
  END IF;

  IF p_payload ? 'remove_price_rules' THEN
    FOR v_remove IN
      SELECT x.value FROM pg_catalog.jsonb_array_elements(p_payload->'remove_price_rules') AS x(value)
    LOOP
      v_modifier_id:=(v_remove->>'modifier_id')::uuid;
      v_variant_id:=(v_remove->>'product_variant_id')::uuid;
      IF NOT EXISTS(
        SELECT 1 FROM public.modifiers AS m
        WHERE m.id=v_modifier_id AND m.restaurant_id=v_restaurant
          AND m.modifier_group_id=v_group_id
      ) THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_REMOVE_RULE_OPTION_MISMATCH' USING ERRCODE='23514';
      END IF;
      DELETE FROM public.modifier_price_rules AS pr
      WHERE pr.restaurant_id=v_restaurant
        AND pr.modifier_group_id=v_group_id
        AND pr.product_id=v_product_id
        AND pr.modifier_id=v_modifier_id
        AND pr.product_variant_id=v_variant_id;
    END LOOP;
  END IF;

  IF p_payload ? 'price_rules' THEN
    FOR v_rule IN
      SELECT x.value FROM pg_catalog.jsonb_array_elements(p_payload->'price_rules') AS x(value)
    LOOP
      v_modifier_id:=(v_rule->>'modifier_id')::uuid;
      v_variant_id:=(v_rule->>'product_variant_id')::uuid;
      v_price:=(v_rule->>'price')::numeric;
      v_rule_legacy_id:=CASE
        WHEN v_rule ? 'legacy_id' THEN NULLIF(pg_catalog.btrim(v_rule->>'legacy_id'),'')
        ELSE NULL
      END;
      IF v_rule_legacy_id IS NOT NULL AND pg_catalog.char_length(v_rule_legacy_id)>120 THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_PRICE_RULE_LEGACY_ID_INVALID' USING ERRCODE='22023';
      END IF;

      SELECT m.* INTO v_modifier
      FROM public.modifiers AS m
      WHERE m.id=v_modifier_id AND m.restaurant_id=v_restaurant
        AND m.modifier_group_id=v_group_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_PRICE_RULE_OPTION_MISMATCH' USING ERRCODE='23514';
      END IF;
      IF v_modifier.price_mode<>'BY_SIZE' THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_PRICE_RULE_REQUIRES_BY_SIZE' USING ERRCODE='23514';
      END IF;

      SELECT pv.* INTO v_variant
      FROM public.product_variants AS pv
      WHERE pv.id=v_variant_id AND pv.restaurant_id=v_restaurant
        AND pv.product_id=v_product_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'CATALOG_MODIFIER_PRICE_RULE_VARIANT_MISMATCH' USING ERRCODE='23514';
      END IF;

      SELECT pr.* INTO v_existing_rule
      FROM public.modifier_price_rules AS pr
      WHERE pr.modifier_id=v_modifier_id
        AND pr.product_variant_id=v_variant_id
      FOR UPDATE;
      v_rule_exists:=FOUND;

      IF v_rule_exists THEN
        UPDATE public.modifier_price_rules AS pr
        SET price=v_price,
            legacy_id=CASE WHEN v_rule ? 'legacy_id' THEN v_rule_legacy_id ELSE pr.legacy_id END
        WHERE pr.id=v_existing_rule.id
        RETURNING pr.* INTO v_existing_rule;
      ELSE
        INSERT INTO public.modifier_price_rules(
          restaurant_id,modifier_group_id,modifier_id,product_id,
          legacy_id,price,product_variant_id
        )
        VALUES(
          v_restaurant,v_group_id,v_modifier_id,v_product_id,
          v_rule_legacy_id,v_price,v_variant_id
        )
        RETURNING * INTO v_existing_rule;
      END IF;
    END LOOP;
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'assignment',pg_catalog.to_jsonb(a),
    'price_rules',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id',pr.id,'modifier_id',pr.modifier_id,
          'product_variant_id',pr.product_variant_id,
          'size_key',pv.size_key,'size_label',pv.size_label,
          'price',pr.price,'legacy_id',pr.legacy_id
        ) ORDER BY pr.modifier_id,pv.sort_order,pv.size_key
      )
      FROM public.modifier_price_rules AS pr
      JOIN public.product_variants AS pv
        ON pv.id=pr.product_variant_id
       AND pv.restaurant_id=pr.restaurant_id
       AND pv.product_id=pr.product_id
      WHERE pr.restaurant_id=v_restaurant
        AND pr.modifier_group_id=v_group_id
        AND pr.product_id=v_product_id
    ),'[]'::jsonb)
  )
  INTO v_after
  FROM public.modifier_group_assignments AS a
  WHERE a.id=v_assignment_id AND a.restaurant_id=v_restaurant;

  UPDATE public.catalog_draft_state AS s
  SET revision=s.revision+1,updated_by=v_actor,updated_at=pg_catalog.clock_timestamp()
  WHERE s.restaurant_id=v_restaurant
  RETURNING s.revision INTO v_new_revision;

  INSERT INTO public.catalog_audit_log(
    restaurant_id,actor_user_id,actor_role_key,action_key,entity_type,entity_id,
    request_id,revision_before,revision_after,before_state,after_state
  )
  VALUES(
    v_restaurant,v_actor,v_role,'modifier_assignment.upsert','modifier_assignment',
    v_assignment_id,p_request_id,v_revision,v_new_revision,v_before,v_after
  );

  v_response:=pg_catalog.jsonb_build_object(
    'ok',true,'idempotent',false,'request_id',p_request_id,
    'draft_revision',v_new_revision,'entity_type','modifier_assignment',
    'entity_id',v_assignment_id,'record',v_after
  );

  INSERT INTO app_private.catalog_command_idempotency(
    restaurant_id,request_id,command_key,payload_hash,response_json
  )
  VALUES(v_restaurant,p_request_id,'modifier_assignment_upsert',v_payload_hash,v_response);

  RETURN v_response;
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_modifier_assignment_upsert_internal(jsonb,bigint,uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_modifier_assignment_upsert_internal(jsonb,bigint,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_modifier_assignment_upsert_internal(jsonb,bigint,uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_catalog_modifier_assignment_upsert(
  p_payload jsonb,
  p_expected_revision bigint,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT app_private.flame_chick_catalog_modifier_assignment_upsert_internal(
    p_payload,p_expected_revision,p_request_id
  )
$function$;

ALTER FUNCTION public.flame_chick_catalog_modifier_assignment_upsert(jsonb,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_modifier_assignment_upsert(jsonb,bigint,uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_modifier_assignment_upsert(jsonb,bigint,uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Final privilege/security assertions
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.flame_chick_catalog_modifier_draft_read(uuid,integer)',
    'public.flame_chick_catalog_modifier_assignment_draft_read(uuid)',
    'public.flame_chick_catalog_modifier_group_upsert(jsonb,bigint,uuid)',
    'public.flame_chick_catalog_modifier_assignment_upsert(jsonb,bigint,uuid)'
  ] LOOP
    IF (SELECT p.prosecdef FROM pg_catalog.pg_proc AS p WHERE p.oid=v_sig::regprocedure) THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_PUBLIC_WRAPPER_MUST_BE_INVOKER';
    END IF;
    IF NOT pg_catalog.has_function_privilege('authenticated',v_sig::regprocedure,'EXECUTE')
       OR pg_catalog.has_function_privilege('anon',v_sig::regprocedure,'EXECUTE')
       OR pg_catalog.has_function_privilege('service_role',v_sig::regprocedure,'EXECUTE') THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_PUBLIC_WRAPPER_GRANTS_INVALID';
    END IF;
  END LOOP;

  FOREACH v_sig IN ARRAY ARRAY[
    'app_private.flame_chick_catalog_modifier_draft_read_internal(uuid,integer)',
    'app_private.flame_chick_catalog_modifier_assignment_draft_read_internal(uuid)',
    'app_private.flame_chick_catalog_modifier_group_upsert_internal(jsonb,bigint,uuid)',
    'app_private.flame_chick_catalog_modifier_assignment_upsert_internal(jsonb,bigint,uuid)'
  ] LOOP
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS p
      WHERE p.oid=v_sig::regprocedure
        AND p.prosecdef
        AND p.proconfig @> ARRAY['search_path=""']
        AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
    ) THEN
      RAISE EXCEPTION 'CATALOG_MODIFIER_INTERNAL_SECURITY_INVALID';
    END IF;
  END LOOP;

  IF pg_catalog.has_table_privilege('authenticated','public.modifier_groups','INSERT')
     OR pg_catalog.has_table_privilege('authenticated','public.modifiers','INSERT')
     OR pg_catalog.has_table_privilege('authenticated','public.modifier_group_assignments','INSERT')
     OR pg_catalog.has_table_privilege('authenticated','public.modifier_price_rules','INSERT')
     OR pg_catalog.has_table_privilege('authenticated','public.modifier_price_rules','UPDATE')
     OR pg_catalog.has_table_privilege('authenticated','public.modifier_price_rules','DELETE')
     OR pg_catalog.has_table_privilege('authenticated','app_private.catalog_command_idempotency','SELECT') THEN
    RAISE EXCEPTION 'CATALOG_MODIFIER_DIRECT_TABLE_PRIVILEGE_LEAK';
  END IF;
END;
$verify$;

COMMIT;
