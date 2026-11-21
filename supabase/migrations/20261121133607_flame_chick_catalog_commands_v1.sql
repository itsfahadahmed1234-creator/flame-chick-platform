-- Flame Chick catalog command V1 — idempotency, draft reads and category authoring.
-- Apply only through the pinned Supabase CLI migration workflow.
-- No restaurant, branch, staff or menu data is seeded by this migration.

BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'CATALOG_COMMANDS_REQUIRE_POSTGRES';
  END IF;

  IF pg_catalog.to_regclass('public.catalog_draft_state') IS NULL
     OR pg_catalog.to_regclass('public.catalog_audit_log') IS NULL
     OR pg_catalog.to_regclass('public.categories') IS NULL
     OR pg_catalog.to_regclass('public.subcategories') IS NULL
     OR pg_catalog.to_regclass('public.restaurants') IS NULL
     OR pg_catalog.to_regclass('public.user_roles') IS NULL
     OR pg_catalog.to_regclass('public.user_profiles') IS NULL THEN
    RAISE EXCEPTION 'CATALOG_COMMANDS_PREREQUISITE_MISSING';
  END IF;

  IF pg_catalog.to_regclass('app_private.catalog_command_idempotency') IS NOT NULL THEN
    RAISE EXCEPTION 'CATALOG_COMMAND_IDEMPOTENCY_ALREADY_EXISTS';
  END IF;
END;
$preflight$;

-- Catalog writes are low volume. Retain idempotency keys permanently so a delayed
-- client retry cannot replay a previously-used key as a new edit.
CREATE TABLE app_private.catalog_command_idempotency (
  restaurant_id uuid NOT NULL,
  request_id uuid NOT NULL,
  command_key text NOT NULL,
  payload_hash bytea NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.transaction_timestamp(),

  CONSTRAINT catalog_command_idempotency_pkey
    PRIMARY KEY (restaurant_id, request_id),
  CONSTRAINT catalog_command_idempotency_restaurant_fkey
    FOREIGN KEY (restaurant_id)
    REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  CONSTRAINT catalog_command_idempotency_command_check
    CHECK (
      command_key = pg_catalog.btrim(command_key)
      AND pg_catalog.char_length(command_key) BETWEEN 1 AND 80
    ),
  CONSTRAINT catalog_command_idempotency_hash_check
    CHECK (pg_catalog.octet_length(payload_hash) = 32),
  CONSTRAINT catalog_command_idempotency_response_check
    CHECK (
      pg_catalog.jsonb_typeof(response_json) = 'object'
      AND response_json ? 'ok'
      AND response_json->>'ok' = 'true'
    )
);

ALTER TABLE app_private.catalog_command_idempotency OWNER TO postgres;
ALTER TABLE app_private.catalog_command_idempotency ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE app_private.catalog_command_idempotency
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE app_private.catalog_command_idempotency IS
  'Permanent private idempotency result ledger for catalog write commands. Access only through trusted postgres-owned command functions.';

-- The resolver is intentionally invoker-security. It is called only from
-- postgres-owned SECURITY DEFINER command/read functions and is not executable
-- by application roles.
CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_actor()
RETURNS TABLE (
  actor_user_id uuid,
  restaurant_id uuid,
  role_key text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT
    auth.uid(),
    r.id,
    ur.role_key
  FROM public.restaurants AS r
  JOIN public.user_profiles AS up
    ON up.user_id = auth.uid()
   AND up.is_active
  JOIN auth.users AS au
    ON au.id = auth.uid()
   AND au.deleted_at IS NULL
  JOIN public.user_roles AS ur
    ON ur.restaurant_id = r.id
   AND ur.user_id = auth.uid()
   AND ur.is_active
   AND ur.branch_id IS NULL
   AND ur.role_key IN ('admin', 'owner')
  WHERE r.slug = 'flame-chick'
    AND r.is_active
  ORDER BY CASE ur.role_key WHEN 'owner' THEN 1 ELSE 2 END
  LIMIT 1
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_actor() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_actor()
  FROM PUBLIC, anon, authenticated, service_role;

-- Bounded draft reads. UUID keyset pagination is stable even when Admin changes
-- display sort_order; the client sorts each accumulated page for presentation.
CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_draft_read_internal(
  p_entity_type text,
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
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
  v_revision bigint := 0;
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_last_id uuid;
  v_limit integer;
BEGIN
  IF p_entity_type NOT IN ('categories', 'subcategories') THEN
    RAISE EXCEPTION 'CATALOG_READ_ENTITY_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'CATALOG_READ_LIMIT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT a.actor_user_id, a.restaurant_id, a.role_key
    INTO v_actor, v_restaurant, v_role
  FROM app_private.flame_chick_catalog_actor() AS a;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'CATALOG_ADMIN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT s.revision
    INTO v_revision
  FROM public.catalog_draft_state AS s
  WHERE s.restaurant_id = v_restaurant;

  IF p_entity_type = 'categories' THEN
    WITH page AS (
      SELECT c.id, c.category_kind, c.legacy_id, c.name_en, c.name_ur,
             c.sort_order, c.is_active, c.created_at, c.updated_at
      FROM public.categories AS c
      WHERE c.restaurant_id = v_restaurant
        AND (p_after_id IS NULL OR c.id > p_after_id)
      ORDER BY c.id
      LIMIT p_limit + 1
    ),
    selected AS (
      SELECT * FROM page ORDER BY id LIMIT p_limit
    )
    SELECT
      COALESCE(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', s.id,
            'category_kind', s.category_kind,
            'legacy_id', s.legacy_id,
            'name_en', s.name_en,
            'name_ur', s.name_ur,
            'sort_order', s.sort_order,
            'is_active', s.is_active,
            'created_at', s.created_at,
            'updated_at', s.updated_at
          ) ORDER BY s.id
        ),
        '[]'::jsonb
      ),
      (SELECT pg_catalog.count(*) > p_limit FROM page),
      (SELECT x.id FROM selected AS x ORDER BY x.id DESC LIMIT 1)
    INTO v_items, v_has_more, v_last_id
    FROM selected AS s;

  ELSE
    WITH page AS (
      SELECT sc.id, sc.category_id, sc.legacy_id, sc.name_en, sc.name_ur,
             sc.sort_order, sc.is_active, sc.created_at, sc.updated_at
      FROM public.subcategories AS sc
      WHERE sc.restaurant_id = v_restaurant
        AND (p_after_id IS NULL OR sc.id > p_after_id)
      ORDER BY sc.id
      LIMIT p_limit + 1
    ),
    selected AS (
      SELECT * FROM page ORDER BY id LIMIT p_limit
    )
    SELECT
      COALESCE(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', s.id,
            'category_id', s.category_id,
            'legacy_id', s.legacy_id,
            'name_en', s.name_en,
            'name_ur', s.name_ur,
            'sort_order', s.sort_order,
            'is_active', s.is_active,
            'created_at', s.created_at,
            'updated_at', s.updated_at
          ) ORDER BY s.id
        ),
        '[]'::jsonb
      ),
      (SELECT pg_catalog.count(*) > p_limit FROM page),
      (SELECT x.id FROM selected AS x ORDER BY x.id DESC LIMIT 1)
    INTO v_items, v_has_more, v_last_id
    FROM selected AS s;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'entity_type', p_entity_type,
    'draft_revision', COALESCE(v_revision, 0),
    'items', v_items,
    'has_more', v_has_more,
    'next_cursor', CASE WHEN v_has_more THEN pg_catalog.to_jsonb(v_last_id) ELSE 'null'::jsonb END
  );
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_draft_read_internal(text, uuid, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_draft_read_internal(text, uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_draft_read_internal(text, uuid, integer)
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
  SELECT app_private.flame_chick_catalog_draft_read_internal(
    p_entity_type, p_after_id, p_limit
  )
$function$;

ALTER FUNCTION public.flame_chick_catalog_draft_read(text, uuid, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_draft_read(text, uuid, integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_draft_read(text, uuid, integer)
  TO authenticated;

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
  IF p_action NOT IN ('category_upsert', 'subcategory_upsert') THEN
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
     OR pg_catalog.char_length(pg_catalog.btrim(p_payload->>'name_en')) NOT BETWEEN 1
       AND CASE WHEN p_action = 'category_upsert' THEN 120 ELSE 120 END THEN
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

CREATE OR REPLACE FUNCTION public.flame_chick_catalog_category_upsert(
  p_payload jsonb,
  p_expected_revision bigint,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT app_private.flame_chick_catalog_command_internal(
    'category_upsert', p_payload, p_expected_revision, p_request_id
  )
$function$;

ALTER FUNCTION public.flame_chick_catalog_category_upsert(jsonb, bigint, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_category_upsert(jsonb, bigint, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_category_upsert(jsonb, bigint, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_catalog_subcategory_upsert(
  p_payload jsonb,
  p_expected_revision bigint,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT app_private.flame_chick_catalog_command_internal(
    'subcategory_upsert', p_payload, p_expected_revision, p_request_id
  )
$function$;

ALTER FUNCTION public.flame_chick_catalog_subcategory_upsert(jsonb, bigint, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_subcategory_upsert(jsonb, bigint, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_subcategory_upsert(jsonb, bigint, uuid)
  TO authenticated;

-- Verify owners, function mode, search_path and effective EXECUTE privileges.
DO $verify$
DECLARE
  v_sig text;
  v_role text;
BEGIN
  IF pg_catalog.pg_get_userbyid(
       (SELECT p.proowner FROM pg_catalog.pg_proc AS p
        WHERE p.oid = 'app_private.flame_chick_catalog_command_internal(text,jsonb,bigint,uuid)'::regprocedure)
     ) <> 'postgres' THEN
    RAISE EXCEPTION 'CATALOG_COMMAND_VERIFY_INTERNAL_OWNER_FAILED';
  END IF;

  IF NOT (SELECT p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
          FROM pg_catalog.pg_proc AS p
          WHERE p.oid = 'app_private.flame_chick_catalog_command_internal(text,jsonb,bigint,uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'CATALOG_COMMAND_VERIFY_INTERNAL_SECURITY_FAILED';
  END IF;

  FOREACH v_sig IN ARRAY ARRAY[
    'public.flame_chick_catalog_draft_read(text,uuid,integer)',
    'public.flame_chick_catalog_category_upsert(jsonb,bigint,uuid)',
    'public.flame_chick_catalog_subcategory_upsert(jsonb,bigint,uuid)'
  ] LOOP
    IF (SELECT p.prosecdef FROM pg_catalog.pg_proc AS p WHERE p.oid = v_sig::regprocedure) THEN
      RAISE EXCEPTION 'CATALOG_COMMAND_VERIFY_PUBLIC_WRAPPER_MUST_BE_INVOKER';
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon','service_role'] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_sig::regprocedure, 'EXECUTE') THEN
        RAISE EXCEPTION 'CATALOG_COMMAND_VERIFY_UNEXPECTED_EXECUTE_GRANT';
      END IF;
    END LOOP;
    IF NOT pg_catalog.has_function_privilege('authenticated', v_sig::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'CATALOG_COMMAND_VERIFY_AUTHENTICATED_EXECUTE_MISSING';
    END IF;
  END LOOP;

  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF pg_catalog.has_table_privilege(v_role, 'app_private.catalog_command_idempotency', 'SELECT')
       OR pg_catalog.has_table_privilege(v_role, 'app_private.catalog_command_idempotency', 'INSERT')
       OR pg_catalog.has_table_privilege(v_role, 'app_private.catalog_command_idempotency', 'UPDATE')
       OR pg_catalog.has_table_privilege(v_role, 'app_private.catalog_command_idempotency', 'DELETE') THEN
      RAISE EXCEPTION 'CATALOG_COMMAND_VERIFY_IDEMPOTENCY_TABLE_PRIVILEGE_LEAK';
    END IF;
  END LOOP;
END;
$verify$;

COMMIT;
