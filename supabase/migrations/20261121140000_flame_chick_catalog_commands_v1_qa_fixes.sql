-- Forward-only QA corrections for catalog command V1.
-- The applied 20261121133607 migration is intentionally not rewritten.
BEGIN;

CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_command_internal(
  p_action text,
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
  v_category_kind text;
  v_category_id uuid;
  v_name_en text;
  v_name_ur text;
  v_legacy_id text;
  v_sort_order integer;
  v_is_active boolean;
  v_category public.categories%ROWTYPE;
  v_subcategory public.subcategories%ROWTYPE;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('category_upsert', 'subcategory_upsert') THEN
    RAISE EXCEPTION 'CATALOG_COMMAND_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'CATALOG_COMMAND_ID_REVISION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'CATALOG_COMMAND_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.octet_length(pg_catalog.convert_to(p_payload::text, 'UTF8')) > 8192 THEN
    RAISE EXCEPTION 'CATALOG_COMMAND_PAYLOAD_TOO_LARGE' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'category_upsert' AND EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_object_keys(p_payload) AS k(key)
    WHERE k.key <> ALL (ARRAY[
      'id','category_kind','legacy_id','name_en','name_ur','sort_order','is_active'
    ])
  ) THEN
    RAISE EXCEPTION 'CATALOG_CATEGORY_FIELD_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'subcategory_upsert' AND EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_object_keys(p_payload) AS k(key)
    WHERE k.key <> ALL (ARRAY[
      'id','category_id','legacy_id','name_en','name_ur','sort_order','is_active'
    ])
  ) THEN
    RAISE EXCEPTION 'CATALOG_SUBCATEGORY_FIELD_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  SELECT a.actor_user_id, a.restaurant_id, a.role_key
    INTO v_actor, v_restaurant, v_role
  FROM app_private.flame_chick_catalog_actor() AS a;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'CATALOG_ADMIN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- A single per-restaurant revision row serializes catalog writes. This same
  -- lock makes same-key retries deterministic without a transient reservation.
  INSERT INTO public.catalog_draft_state (restaurant_id)
  VALUES (v_restaurant)
  ON CONFLICT (restaurant_id) DO NOTHING;

  SELECT s.revision
    INTO v_revision
  FROM public.catalog_draft_state AS s
  WHERE s.restaurant_id = v_restaurant
  FOR UPDATE;

  v_payload_hash := pg_catalog.sha256(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'action', p_action,
        'expected_revision', p_expected_revision,
        'payload', p_payload
      )::text,
      'UTF8'
    )
  );

  SELECT i.*
    INTO v_existing
  FROM app_private.catalog_command_idempotency AS i
  WHERE i.restaurant_id = v_restaurant
    AND i.request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.command_key <> p_action
       OR v_existing.payload_hash <> v_payload_hash THEN
      RAISE EXCEPTION 'CATALOG_IDEMPOTENCY_KEY_REUSED' USING ERRCODE = '22023';
    END IF;

    RETURN pg_catalog.jsonb_set(
      v_existing.response_json,
      '{idempotent}',
      'true'::jsonb,
      true
    );
  END IF;

  IF v_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'CATALOG_REVISION_CONFLICT'
      USING ERRCODE = '40001',
            DETAIL = pg_catalog.format('current_revision=%s', v_revision);
  END IF;

  -- Parse and validate the shared name/sort/status fields. Payloads use
  -- replacement semantics for supplied fields; omitted optional values keep
  -- their current value on update and use defaults on insert.
  IF NOT (p_payload ? 'name_en')
     OR pg_catalog.jsonb_typeof(p_payload->'name_en') <> 'string'
     OR pg_catalog.char_length(pg_catalog.btrim(p_payload->>'name_en')) < 1
     OR pg_catalog.char_length(pg_catalog.btrim(p_payload->>'name_en')) > 120 THEN
    RAISE EXCEPTION 'CATALOG_NAME_EN_INVALID' USING ERRCODE = '22023';
  END IF;
  v_name_en := pg_catalog.btrim(p_payload->>'name_en');

  IF p_payload ? 'name_ur' AND p_payload->'name_ur' <> 'null'::jsonb
     AND pg_catalog.jsonb_typeof(p_payload->'name_ur') <> 'string' THEN
    RAISE EXCEPTION 'CATALOG_NAME_UR_INVALID' USING ERRCODE = '22023';
  END IF;
  v_name_ur := CASE
    WHEN p_payload ? 'name_ur' THEN NULLIF(pg_catalog.btrim(p_payload->>'name_ur'), '')
    ELSE NULL
  END;
  IF v_name_ur IS NOT NULL AND pg_catalog.char_length(v_name_ur) > 120 THEN
    RAISE EXCEPTION 'CATALOG_NAME_UR_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'legacy_id' AND p_payload->'legacy_id' <> 'null'::jsonb
     AND pg_catalog.jsonb_typeof(p_payload->'legacy_id') <> 'string' THEN
    RAISE EXCEPTION 'CATALOG_LEGACY_ID_INVALID' USING ERRCODE = '22023';
  END IF;
  v_legacy_id := CASE
    WHEN p_payload ? 'legacy_id' THEN NULLIF(pg_catalog.btrim(p_payload->>'legacy_id'), '')
    ELSE NULL
  END;
  IF v_legacy_id IS NOT NULL AND pg_catalog.char_length(v_legacy_id) > 120 THEN
    RAISE EXCEPTION 'CATALOG_LEGACY_ID_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'sort_order' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'sort_order') <> 'number' THEN
      RAISE EXCEPTION 'CATALOG_SORT_ORDER_INVALID' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_sort_order := (p_payload->>'sort_order')::integer;
    EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
      RAISE EXCEPTION 'CATALOG_SORT_ORDER_INVALID' USING ERRCODE = '22023';
    END;
    IF v_sort_order < 0 THEN
      RAISE EXCEPTION 'CATALOG_SORT_ORDER_INVALID' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_sort_order := 0;
  END IF;

  IF p_payload ? 'is_active' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'is_active') <> 'boolean' THEN
      RAISE EXCEPTION 'CATALOG_ACTIVE_FLAG_INVALID' USING ERRCODE = '22023';
    END IF;
    v_is_active := (p_payload->>'is_active')::boolean;
  ELSE
    v_is_active := false;
  END IF;

  BEGIN
    v_id := NULLIF(p_payload->>'id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'CATALOG_ENTITY_ID_INVALID' USING ERRCODE = '22023';
  END;

  IF p_action = 'category_upsert' THEN
    IF NOT (p_payload ? 'category_kind')
       OR pg_catalog.jsonb_typeof(p_payload->'category_kind') <> 'string' THEN
      RAISE EXCEPTION 'CATALOG_CATEGORY_KIND_REQUIRED' USING ERRCODE = '22023';
    END IF;
    v_category_kind := p_payload->>'category_kind';
    IF v_category_kind NOT IN ('menu', 'deal') THEN
      RAISE EXCEPTION 'CATALOG_CATEGORY_KIND_INVALID' USING ERRCODE = '22023';
    END IF;

    IF v_id IS NULL THEN
      INSERT INTO public.categories (
        restaurant_id, category_kind, legacy_id, name_en, name_ur,
        sort_order, is_active
      )
      VALUES (
        v_restaurant, v_category_kind, v_legacy_id, v_name_en, v_name_ur,
        v_sort_order, v_is_active
      )
      RETURNING * INTO v_category;
      v_before := NULL;
    ELSE
      SELECT c.* INTO v_category
      FROM public.categories AS c
      WHERE c.id = v_id AND c.restaurant_id = v_restaurant
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'CATALOG_CATEGORY_NOT_FOUND' USING ERRCODE = 'P0002';
      END IF;
      IF v_category.category_kind <> v_category_kind THEN
        RAISE EXCEPTION 'CATALOG_CATEGORY_KIND_IMMUTABLE' USING ERRCODE = '23514';
      END IF;

      v_before := pg_catalog.to_jsonb(v_category);
      UPDATE public.categories AS c
      SET legacy_id = CASE WHEN p_payload ? 'legacy_id' THEN v_legacy_id ELSE c.legacy_id END,
          name_en = v_name_en,
          name_ur = CASE WHEN p_payload ? 'name_ur' THEN v_name_ur ELSE c.name_ur END,
          sort_order = CASE WHEN p_payload ? 'sort_order' THEN v_sort_order ELSE c.sort_order END,
          is_active = CASE WHEN p_payload ? 'is_active' THEN v_is_active ELSE c.is_active END
      WHERE c.id = v_id AND c.restaurant_id = v_restaurant
      RETURNING c.* INTO v_category;
    END IF;

    v_id := v_category.id;
    v_after := pg_catalog.to_jsonb(v_category);

  ELSE
    BEGIN
      v_category_id := NULLIF(p_payload->>'category_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'CATALOG_PARENT_CATEGORY_ID_INVALID' USING ERRCODE = '22023';
    END;

    IF v_category_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.categories AS c
      WHERE c.id = v_category_id
        AND c.restaurant_id = v_restaurant
        AND c.category_kind = 'menu'
    ) THEN
      RAISE EXCEPTION 'CATALOG_MENU_CATEGORY_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    IF v_id IS NULL THEN
      INSERT INTO public.subcategories (
        restaurant_id, category_id, category_kind, legacy_id,
        name_en, name_ur, sort_order, is_active
      )
      VALUES (
        v_restaurant, v_category_id, 'menu', v_legacy_id,
        v_name_en, v_name_ur, v_sort_order, v_is_active
      )
      RETURNING * INTO v_subcategory;
      v_before := NULL;
    ELSE
      SELECT sc.* INTO v_subcategory
      FROM public.subcategories AS sc
      WHERE sc.id = v_id AND sc.restaurant_id = v_restaurant
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'CATALOG_SUBCATEGORY_NOT_FOUND' USING ERRCODE = 'P0002';
      END IF;

      v_before := pg_catalog.to_jsonb(v_subcategory);
      UPDATE public.subcategories AS sc
      SET category_id = v_category_id,
          legacy_id = CASE WHEN p_payload ? 'legacy_id' THEN v_legacy_id ELSE sc.legacy_id END,
          name_en = v_name_en,
          name_ur = CASE WHEN p_payload ? 'name_ur' THEN v_name_ur ELSE sc.name_ur END,
          sort_order = CASE WHEN p_payload ? 'sort_order' THEN v_sort_order ELSE sc.sort_order END,
          is_active = CASE WHEN p_payload ? 'is_active' THEN v_is_active ELSE sc.is_active END
      WHERE sc.id = v_id AND sc.restaurant_id = v_restaurant
      RETURNING sc.* INTO v_subcategory;
    END IF;

    v_id := v_subcategory.id;
    v_after := pg_catalog.to_jsonb(v_subcategory);
  END IF;

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
    v_restaurant, v_actor, v_role,
    CASE p_action
      WHEN 'category_upsert' THEN 'category.upsert'
      ELSE 'subcategory.upsert'
    END,
    CASE p_action
      WHEN 'category_upsert' THEN 'category'
      ELSE 'subcategory'
    END,
    v_id, p_request_id, v_revision, v_new_revision, v_before, v_after
  );

  v_response := pg_catalog.jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'request_id', p_request_id,
    'draft_revision', v_new_revision,
    'entity_type', CASE p_action
      WHEN 'category_upsert' THEN 'category'
      ELSE 'subcategory'
    END,
    'entity_id', v_id,
    'record', v_after
  );

  INSERT INTO app_private.catalog_command_idempotency (
    restaurant_id, request_id, command_key, payload_hash, response_json
  )
  VALUES (
    v_restaurant, p_request_id, p_action, v_payload_hash, v_response
  );

  RETURN v_response;
END
$function$;


ALTER FUNCTION app_private.flame_chick_catalog_command_internal(text, jsonb, bigint, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_command_internal(text, jsonb, bigint, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_command_internal(text, jsonb, bigint, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_catalog_draft_read(
  p_entity_type text,
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  WITH result AS (
    SELECT app_private.flame_chick_catalog_draft_read_internal(
      p_entity_type, p_after_id, p_limit
    ) AS value
  )
  SELECT pg_catalog.jsonb_set(
    result.value,
    '{items}',
    COALESCE(result.value->'items', '[]'::jsonb),
    true
  )
  FROM result
$function$;
ALTER FUNCTION public.flame_chick_catalog_draft_read(text, uuid, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_draft_read(text, uuid, integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_draft_read(text, uuid, integer)
  TO authenticated;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid = 'app_private.flame_chick_catalog_command_internal(text,jsonb,bigint,uuid)'::regprocedure
      AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=""']
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
  ) THEN
    RAISE EXCEPTION 'CATALOG_COMMAND_FORWARD_FIX_SECURITY_CHECK_FAILED';
  END IF;
  IF pg_catalog.has_function_privilege('anon','public.flame_chick_catalog_draft_read(text,uuid,integer)','EXECUTE')
     OR pg_catalog.has_function_privilege('service_role','public.flame_chick_catalog_draft_read(text,uuid,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'CATALOG_COMMAND_FORWARD_FIX_GRANT_CHECK_FAILED';
  END IF;
END;
$verify$;

COMMIT;
