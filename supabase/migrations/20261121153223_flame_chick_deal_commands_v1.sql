-- Flame Chick deal builder command API V1.
-- Strict domain-specific commands; no generic table/RPC proxy.
-- All command writes are atomic, revision checked, idempotent and audited.
-- Draft incompleteness is allowed; publication validation is a separate gate.

BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'DEAL_COMMANDS_REQUIRE_POSTGRES';
  END IF;
  IF pg_catalog.to_regclass('public.deal_variants') IS NULL
     OR pg_catalog.to_regclass('public.deal_variant_component_options') IS NULL
     OR pg_catalog.to_regclass('public.deal_schedule_assignments') IS NULL
     OR pg_catalog.to_regprocedure('app_private.flame_chick_catalog_actor()') IS NULL
     OR pg_catalog.to_regclass('app_private.catalog_command_idempotency') IS NULL THEN
    RAISE EXCEPTION 'DEAL_COMMANDS_PREREQUISITE_MISSING';
  END IF;
  IF pg_catalog.to_regtype('app_private.flame_chick_catalog_command_context') IS NOT NULL THEN
    RAISE EXCEPTION 'DEAL_COMMAND_CONTEXT_TYPE_ALREADY_EXISTS';
  END IF;
END;
$preflight$;

CREATE TYPE app_private.flame_chick_catalog_command_context AS (
  actor_user_id uuid,
  restaurant_id uuid,
  role_key text,
  draft_revision bigint,
  payload_hash bytea,
  replay_response jsonb
);

-- Shared command entry point. Parent mutation functions are SECURITY DEFINER
-- and call this SECURITY INVOKER helper as postgres. Application roles cannot
-- execute it directly.
CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_command_context(
  p_command_key text,
  p_payload jsonb,
  p_expected_revision bigint,
  p_request_id uuid,
  p_max_bytes integer DEFAULT 65536
)
RETURNS app_private.flame_chick_catalog_command_context
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_context app_private.flame_chick_catalog_command_context;
  v_existing app_private.catalog_command_idempotency%ROWTYPE;
BEGIN
  IF p_command_key IS NULL
     OR p_command_key NOT IN (
       'deal_collection_upsert',
       'deal_upsert',
       'deal_components_upsert',
       'deal_variant_options_upsert',
       'schedule_set_upsert',
       'deal_schedule_assignment_upsert',
       'deal_branch_availability_upsert'
     ) THEN
    RAISE EXCEPTION 'DEAL_COMMAND_KEY_INVALID' USING ERRCODE='22023';
  END IF;
  IF p_request_id IS NULL
     OR p_expected_revision IS NULL
     OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'DEAL_COMMAND_REQUEST_AND_REVISION_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload)<>'object' THEN
    RAISE EXCEPTION 'DEAL_COMMAND_PAYLOAD_INVALID' USING ERRCODE='22023';
  END IF;
  IF p_max_bytes IS NULL OR p_max_bytes<1024 OR p_max_bytes>262144
     OR pg_catalog.octet_length(pg_catalog.convert_to(p_payload::text,'UTF8'))>p_max_bytes THEN
    RAISE EXCEPTION 'DEAL_COMMAND_PAYLOAD_TOO_LARGE' USING ERRCODE='22023';
  END IF;

  SELECT a.actor_user_id,a.restaurant_id,a.role_key
    INTO v_context.actor_user_id,v_context.restaurant_id,v_context.role_key
  FROM app_private.flame_chick_catalog_actor() AS a;

  IF v_context.actor_user_id IS NULL THEN
    RAISE EXCEPTION 'CATALOG_ADMIN_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.catalog_draft_state(restaurant_id)
  VALUES(v_context.restaurant_id)
  ON CONFLICT(restaurant_id) DO NOTHING;

  SELECT s.revision
    INTO v_context.draft_revision
  FROM public.catalog_draft_state AS s
  WHERE s.restaurant_id=v_context.restaurant_id
  FOR UPDATE;

  v_context.payload_hash:=pg_catalog.sha256(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'action',p_command_key,
        'expected_revision',p_expected_revision,
        'payload',p_payload
      )::text,
      'UTF8'
    )
  );

  SELECT i.*
    INTO v_existing
  FROM app_private.catalog_command_idempotency AS i
  WHERE i.restaurant_id=v_context.restaurant_id
    AND i.request_id=p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.command_key<>p_command_key
       OR v_existing.payload_hash<>v_context.payload_hash THEN
      RAISE EXCEPTION 'CATALOG_IDEMPOTENCY_KEY_REUSED' USING ERRCODE='22023';
    END IF;
    v_context.replay_response:=v_existing.response_json;
    RETURN v_context;
  END IF;

  IF v_context.draft_revision<>p_expected_revision THEN
    RAISE EXCEPTION 'CATALOG_REVISION_CONFLICT'
      USING ERRCODE='40001',
      DETAIL=pg_catalog.format('current_revision=%s',v_context.draft_revision);
  END IF;

  RETURN v_context;
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_command_context(text,jsonb,bigint,uuid,integer)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_command_context(text,jsonb,bigint,uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_command_finish(
  p_context app_private.flame_chick_catalog_command_context,
  p_command_key text,
  p_audit_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_request_id uuid,
  p_before jsonb,
  p_after jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_new_revision bigint;
  v_response jsonb;
BEGIN
  UPDATE public.catalog_draft_state AS s
  SET revision=s.revision+1,
      updated_by=p_context.actor_user_id,
      updated_at=pg_catalog.clock_timestamp()
  WHERE s.restaurant_id=p_context.restaurant_id
  RETURNING s.revision INTO v_new_revision;

  INSERT INTO public.catalog_audit_log(
    restaurant_id,actor_user_id,actor_role_key,action_key,entity_type,entity_id,
    request_id,revision_before,revision_after,before_state,after_state
  )
  VALUES(
    p_context.restaurant_id,p_context.actor_user_id,p_context.role_key,
    p_audit_action,p_entity_type,p_entity_id,p_request_id,
    p_context.draft_revision,v_new_revision,p_before,p_after
  );

  v_response:=pg_catalog.jsonb_build_object(
    'ok',true,
    'idempotent',false,
    'request_id',p_request_id,
    'draft_revision',v_new_revision,
    'entity_type',p_entity_type,
    'entity_id',p_entity_id,
    'record',p_after
  );

  INSERT INTO app_private.catalog_command_idempotency(
    restaurant_id,request_id,command_key,payload_hash,response_json
  )
  VALUES(
    p_context.restaurant_id,p_request_id,p_command_key,p_context.payload_hash,v_response
  );

  RETURN v_response;
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_command_finish(
  app_private.flame_chick_catalog_command_context,text,text,text,uuid,uuid,jsonb,jsonb
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_command_finish(
  app_private.flame_chick_catalog_command_context,text,text,text,uuid,uuid,jsonb,jsonb
) FROM PUBLIC,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Deal collection read + upsert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_deal_collection_read_internal(
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
  IF p_limit IS NULL OR p_limit<1 OR p_limit>50 THEN
    RAISE EXCEPTION 'DEAL_COLLECTION_READ_LIMIT_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT a.actor_user_id,a.restaurant_id INTO v_actor,v_restaurant
  FROM app_private.flame_chick_catalog_actor() AS a;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'CATALOG_ADMIN_FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT s.revision INTO v_revision
  FROM public.catalog_draft_state AS s WHERE s.restaurant_id=v_restaurant;

  WITH page AS MATERIALIZED (
    SELECT c.*
    FROM public.deal_collections AS c
    WHERE c.restaurant_id=v_restaurant
      AND (p_after_id IS NULL OR c.id>p_after_id)
    ORDER BY c.id
    LIMIT p_limit+1
  ),
  picked AS MATERIALIZED (SELECT * FROM page ORDER BY id LIMIT p_limit)
  SELECT
    COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id',p.id,'category_id',p.category_id,'category_kind',p.category_kind,
          'schedule_set_id',p.schedule_set_id,'name_en',p.name_en,'name_ur',p.name_ur,
          'sort_order',p.sort_order,'is_active',p.is_active,
          'created_at',p.created_at,'updated_at',p.updated_at
        ) ORDER BY p.id
      ) FROM picked AS p
    ),'[]'::jsonb),
    (SELECT count(*)>p_limit FROM page),
    (SELECT p.id FROM picked AS p ORDER BY p.id DESC LIMIT 1)
  INTO v_items,v_has_more,v_last_id;

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'entity_type','deal_collections',
    'draft_revision',COALESCE(v_revision,0),
    'items',v_items,'has_more',COALESCE(v_has_more,false),
    'next_cursor',CASE WHEN v_has_more THEN pg_catalog.to_jsonb(v_last_id) ELSE 'null'::jsonb END
  );
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_deal_collection_read_internal(uuid,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_deal_collection_read_internal(uuid,integer)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_deal_collection_read_internal(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_catalog_deal_collection_read(
  p_after_id uuid DEFAULT NULL,p_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT app_private.flame_chick_catalog_deal_collection_read_internal(p_after_id,p_limit)
$function$;

ALTER FUNCTION public.flame_chick_catalog_deal_collection_read(uuid,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_deal_collection_read(uuid,integer)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_deal_collection_read(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_deal_collection_upsert_internal(
  p_payload jsonb,p_expected_revision bigint,p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_context app_private.flame_chick_catalog_command_context;
  v_id uuid;
  v_category_id uuid;
  v_schedule_id uuid;
  v_name_en text;
  v_name_ur text;
  v_sort integer;
  v_active boolean;
  v_num numeric;
  v_row public.deal_collections%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_payload) k(key)
    WHERE k.key<>ALL(ARRAY['id','category_id','schedule_set_id','name_en','name_ur','sort_order','is_active'])
  ) THEN RAISE EXCEPTION 'DEAL_COLLECTION_FIELD_NOT_ALLOWED' USING ERRCODE='22023'; END IF;
  IF (p_payload ? 'id' AND p_payload->'id'<>'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'id')<>'string')
     OR (p_payload ? 'category_id' AND pg_catalog.jsonb_typeof(p_payload->'category_id')<>'string')
     OR (p_payload ? 'schedule_set_id' AND p_payload->'schedule_set_id'<>'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'schedule_set_id')<>'string')
     OR (p_payload ? 'name_en' AND pg_catalog.jsonb_typeof(p_payload->'name_en')<>'string')
     OR (p_payload ? 'name_ur' AND p_payload->'name_ur'<>'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'name_ur')<>'string')
     OR (p_payload ? 'sort_order' AND pg_catalog.jsonb_typeof(p_payload->'sort_order')<>'number')
     OR (p_payload ? 'is_active' AND pg_catalog.jsonb_typeof(p_payload->'is_active')<>'boolean') THEN
    RAISE EXCEPTION 'DEAL_COLLECTION_FIELD_TYPE_INVALID' USING ERRCODE='22023';
  END IF;

  v_context:=app_private.flame_chick_catalog_command_context(
    'deal_collection_upsert',p_payload,p_expected_revision,p_request_id,16384
  );
  IF v_context.replay_response IS NOT NULL THEN
    RETURN pg_catalog.jsonb_set(v_context.replay_response,'{idempotent}','true'::jsonb,true);
  END IF;

  BEGIN v_id:=NULLIF(p_payload->>'id','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DEAL_COLLECTION_ID_INVALID' USING ERRCODE='22023'; END;
  IF v_id IS NOT NULL THEN
    SELECT c.* INTO v_row FROM public.deal_collections c
    WHERE c.id=v_id AND c.restaurant_id=v_context.restaurant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DEAL_COLLECTION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    v_before:=pg_catalog.to_jsonb(v_row);
  ELSE v_before:=NULL;
  END IF;

  IF p_payload ? 'category_id' THEN
    BEGIN v_category_id:=(p_payload->>'category_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DEAL_COLLECTION_CATEGORY_ID_INVALID' USING ERRCODE='22023'; END;
  ELSIF v_id IS NOT NULL THEN v_category_id:=v_row.category_id;
  ELSE v_category_id:=NULL;
  END IF;
  IF v_category_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.categories c
    WHERE c.id=v_category_id AND c.restaurant_id=v_context.restaurant_id AND c.category_kind='deal'
  ) THEN RAISE EXCEPTION 'DEAL_CATEGORY_REQUIRED' USING ERRCODE='23503'; END IF;

  IF p_payload ? 'schedule_set_id' THEN
    IF p_payload->'schedule_set_id'='null'::jsonb THEN v_schedule_id:=NULL;
    ELSE
      BEGIN v_schedule_id:=(p_payload->>'schedule_set_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DEAL_COLLECTION_SCHEDULE_ID_INVALID' USING ERRCODE='22023'; END;
    END IF;
  ELSIF v_id IS NOT NULL THEN v_schedule_id:=v_row.schedule_set_id;
  ELSE v_schedule_id:=NULL;
  END IF;
  IF v_schedule_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.catalog_schedule_sets s
    WHERE s.id=v_schedule_id AND s.restaurant_id=v_context.restaurant_id
  ) THEN RAISE EXCEPTION 'DEAL_COLLECTION_SCHEDULE_NOT_FOUND' USING ERRCODE='23503'; END IF;

  IF p_payload ? 'name_en' THEN v_name_en:=pg_catalog.btrim(p_payload->>'name_en');
  ELSIF v_id IS NOT NULL THEN v_name_en:=v_row.name_en;
  ELSE v_name_en:=NULL; END IF;
  IF v_name_en IS NULL OR pg_catalog.char_length(v_name_en) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'DEAL_COLLECTION_NAME_EN_REQUIRED' USING ERRCODE='22023';
  END IF;

  IF p_payload ? 'name_ur' THEN v_name_ur:=NULLIF(pg_catalog.btrim(p_payload->>'name_ur'),'');
  ELSIF v_id IS NOT NULL THEN v_name_ur:=v_row.name_ur;
  ELSE v_name_ur:=NULL; END IF;
  IF v_name_ur IS NOT NULL AND pg_catalog.char_length(v_name_ur)>120 THEN
    RAISE EXCEPTION 'DEAL_COLLECTION_NAME_UR_INVALID' USING ERRCODE='22023';
  END IF;

  IF p_payload ? 'sort_order' THEN
    BEGIN v_num:=(p_payload->>'sort_order')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'DEAL_COLLECTION_SORT_INVALID' USING ERRCODE='22023'; END;
    IF pg_catalog.scale(v_num)<>0 OR v_num<0 OR v_num>2147483647 THEN RAISE EXCEPTION 'DEAL_COLLECTION_SORT_INVALID' USING ERRCODE='22023'; END IF;
    v_sort:=v_num::integer;
  ELSIF v_id IS NOT NULL THEN v_sort:=v_row.sort_order;
  ELSE v_sort:=0; END IF;

  IF p_payload ? 'is_active' THEN v_active:=(p_payload->>'is_active')::boolean;
  ELSIF v_id IS NOT NULL THEN v_active:=v_row.is_active;
  ELSE v_active:=false; END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.deal_collections(
      restaurant_id,category_id,category_kind,schedule_set_id,name_en,name_ur,sort_order,is_active
    ) VALUES(
      v_context.restaurant_id,v_category_id,'deal',v_schedule_id,v_name_en,v_name_ur,v_sort,v_active
    ) RETURNING * INTO v_row;
    v_id:=v_row.id;
  ELSE
    UPDATE public.deal_collections c
    SET category_id=v_category_id,schedule_set_id=v_schedule_id,name_en=v_name_en,
        name_ur=v_name_ur,sort_order=v_sort,is_active=v_active
    WHERE c.id=v_id AND c.restaurant_id=v_context.restaurant_id
    RETURNING c.* INTO v_row;
  END IF;

  v_after:=pg_catalog.to_jsonb(v_row);
  RETURN app_private.flame_chick_catalog_command_finish(
    v_context,'deal_collection_upsert','deal_collection.upsert','deal_collection',
    v_id,p_request_id,v_before,v_after
  );
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_deal_collection_upsert_internal(jsonb,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_deal_collection_upsert_internal(jsonb,bigint,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_deal_collection_upsert_internal(jsonb,bigint,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_catalog_deal_collection_upsert(
  p_payload jsonb,p_expected_revision bigint,p_request_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT app_private.flame_chick_catalog_deal_collection_upsert_internal(p_payload,p_expected_revision,p_request_id)
$function$;

ALTER FUNCTION public.flame_chick_catalog_deal_collection_upsert(jsonb,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_deal_collection_upsert(jsonb,bigint,uuid)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_deal_collection_upsert(jsonb,bigint,uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Deal + purchasable deal variants aggregate upsert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_deal_upsert_internal(
  p_payload jsonb,p_expected_revision bigint,p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_context app_private.flame_chick_catalog_command_context;
  v_id uuid;
  v_collection uuid;
  v_legacy text;
  v_title text;
  v_title_ur text;
  v_desc_en text;
  v_desc_ur text;
  v_featured boolean;
  v_sort integer;
  v_active boolean;
  v_available boolean;
  v_num numeric;
  v_variant jsonb;
  v_variant_id uuid;
  v_variant_key text;
  v_variant_label text;
  v_variant_label_ur text;
  v_pricing_mode text;
  v_base_price numeric;
  v_variant_sort integer;
  v_variant_active boolean;
  v_seen_ids uuid[]:=ARRAY[]::uuid[];
  v_seen_keys text[]:=ARRAY[]::text[];
  v_row public.deals%ROWTYPE;
  v_variant_row public.deal_variants%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_payload) k(key)
    WHERE k.key<>ALL(ARRAY[
      'id','collection_id','legacy_id','title','title_ur','description_en',
      'description_ur','featured','sort_order','is_active','is_available','variants'
    ])
  ) THEN RAISE EXCEPTION 'DEAL_FIELD_NOT_ALLOWED' USING ERRCODE='22023'; END IF;

  IF (p_payload ? 'id' AND p_payload->'id'<>'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'id')<>'string')
     OR (p_payload ? 'collection_id' AND pg_catalog.jsonb_typeof(p_payload->'collection_id')<>'string')
     OR (p_payload ? 'legacy_id' AND p_payload->'legacy_id'<>'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'legacy_id')<>'string')
     OR (p_payload ? 'title' AND pg_catalog.jsonb_typeof(p_payload->'title')<>'string')
     OR (p_payload ? 'title_ur' AND p_payload->'title_ur'<>'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'title_ur')<>'string')
     OR (p_payload ? 'description_en' AND p_payload->'description_en'<>'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'description_en')<>'string')
     OR (p_payload ? 'description_ur' AND p_payload->'description_ur'<>'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'description_ur')<>'string')
     OR (p_payload ? 'featured' AND pg_catalog.jsonb_typeof(p_payload->'featured')<>'boolean')
     OR (p_payload ? 'sort_order' AND pg_catalog.jsonb_typeof(p_payload->'sort_order')<>'number')
     OR (p_payload ? 'is_active' AND pg_catalog.jsonb_typeof(p_payload->'is_active')<>'boolean')
     OR (p_payload ? 'is_available' AND pg_catalog.jsonb_typeof(p_payload->'is_available')<>'boolean') THEN
    RAISE EXCEPTION 'DEAL_FIELD_TYPE_INVALID' USING ERRCODE='22023';
  END IF;

  IF p_payload ? 'variants' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'variants') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'DEAL_VARIANTS_ARRAY_INVALID' USING ERRCODE='22023';
    END IF;
    IF pg_catalog.jsonb_array_length(p_payload->'variants')>20 THEN
      RAISE EXCEPTION 'DEAL_VARIANTS_ARRAY_LIMIT' USING ERRCODE='22023';
    END IF;
    FOR v_variant IN SELECT x.value FROM pg_catalog.jsonb_array_elements(p_payload->'variants') x(value)
    LOOP
      IF pg_catalog.jsonb_typeof(v_variant)<>'object'
         OR EXISTS(
           SELECT 1 FROM pg_catalog.jsonb_object_keys(v_variant) k(key)
           WHERE k.key<>ALL(ARRAY['id','variant_key','label_en','label_ur','pricing_mode','base_price','sort_order','is_active'])
         ) THEN
        RAISE EXCEPTION 'DEAL_VARIANT_FIELDS_INVALID' USING ERRCODE='22023';
      END IF;
      IF (v_variant ? 'id' AND v_variant->'id'<>'null'::jsonb AND pg_catalog.jsonb_typeof(v_variant->'id')<>'string')
         OR (v_variant ? 'variant_key' AND pg_catalog.jsonb_typeof(v_variant->'variant_key')<>'string')
         OR (v_variant ? 'label_en' AND pg_catalog.jsonb_typeof(v_variant->'label_en')<>'string')
         OR (v_variant ? 'label_ur' AND v_variant->'label_ur'<>'null'::jsonb AND pg_catalog.jsonb_typeof(v_variant->'label_ur')<>'string')
         OR (v_variant ? 'pricing_mode' AND pg_catalog.jsonb_typeof(v_variant->'pricing_mode')<>'string')
         OR (v_variant ? 'base_price' AND v_variant->'base_price'<>'null'::jsonb AND pg_catalog.jsonb_typeof(v_variant->'base_price')<>'number')
         OR (v_variant ? 'sort_order' AND pg_catalog.jsonb_typeof(v_variant->'sort_order')<>'number')
         OR (v_variant ? 'is_active' AND pg_catalog.jsonb_typeof(v_variant->'is_active')<>'boolean') THEN
        RAISE EXCEPTION 'DEAL_VARIANT_FIELD_TYPE_INVALID' USING ERRCODE='22023';
      END IF;
      IF v_variant ? 'id' AND v_variant->'id'<>'null'::jsonb THEN
        BEGIN v_variant_id:=(v_variant->>'id')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DEAL_VARIANT_ID_INVALID' USING ERRCODE='22023'; END;
        IF v_variant_id=ANY(v_seen_ids) THEN RAISE EXCEPTION 'DEAL_VARIANT_ID_DUPLICATED' USING ERRCODE='22023'; END IF;
        v_seen_ids:=pg_catalog.array_append(v_seen_ids,v_variant_id);
      END IF;
      IF NOT (v_variant ? 'variant_key') OR v_variant->>'variant_key' !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$' THEN
        RAISE EXCEPTION 'DEAL_VARIANT_KEY_INVALID' USING ERRCODE='22023';
      END IF;
      v_variant_key:=pg_catalog.upper(pg_catalog.btrim(v_variant->>'variant_key'));
      IF v_variant_key=ANY(v_seen_keys) THEN RAISE EXCEPTION 'DEAL_VARIANT_KEY_DUPLICATED' USING ERRCODE='22023'; END IF;
      v_seen_keys:=pg_catalog.array_append(v_seen_keys,v_variant_key);
    END LOOP;
  END IF;

  v_context:=app_private.flame_chick_catalog_command_context('deal_upsert',p_payload,p_expected_revision,p_request_id,65536);
  IF v_context.replay_response IS NOT NULL THEN
    RETURN pg_catalog.jsonb_set(v_context.replay_response,'{idempotent}','true'::jsonb,true);
  END IF;

  BEGIN v_id:=NULLIF(p_payload->>'id','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DEAL_ID_INVALID' USING ERRCODE='22023'; END;
  IF v_id IS NOT NULL THEN
    SELECT d.* INTO v_row FROM public.deals d
    WHERE d.id=v_id AND d.restaurant_id=v_context.restaurant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DEAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    v_before:=pg_catalog.jsonb_build_object(
      'deal',pg_catalog.to_jsonb(v_row),
      'variants',COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(dv) ORDER BY dv.sort_order,dv.variant_key,dv.id)
        FROM public.deal_variants dv WHERE dv.restaurant_id=v_context.restaurant_id AND dv.deal_id=v_id
      ),'[]'::jsonb)
    );
  ELSE v_before:=NULL;
  END IF;

  IF p_payload ? 'collection_id' THEN
    BEGIN v_collection:=(p_payload->>'collection_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DEAL_COLLECTION_ID_INVALID' USING ERRCODE='22023'; END;
  ELSIF v_id IS NOT NULL THEN v_collection:=v_row.collection_id;
  ELSE v_collection:=NULL; END IF;
  IF v_collection IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.deal_collections c
    WHERE c.id=v_collection AND c.restaurant_id=v_context.restaurant_id AND c.category_kind='deal'
  ) THEN RAISE EXCEPTION 'DEAL_COLLECTION_REQUIRED' USING ERRCODE='23503'; END IF;

  IF p_payload ? 'title' THEN v_title:=pg_catalog.btrim(p_payload->>'title');
  ELSIF v_id IS NOT NULL THEN v_title:=v_row.title; ELSE v_title:=NULL; END IF;
  IF v_title IS NULL OR pg_catalog.char_length(v_title) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'DEAL_TITLE_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF p_payload ? 'title_ur' THEN v_title_ur:=NULLIF(pg_catalog.btrim(p_payload->>'title_ur'),'');
  ELSIF v_id IS NOT NULL THEN v_title_ur:=v_row.title_ur; ELSE v_title_ur:=NULL; END IF;
  IF v_title_ur IS NOT NULL AND pg_catalog.char_length(v_title_ur)>160 THEN RAISE EXCEPTION 'DEAL_TITLE_UR_INVALID' USING ERRCODE='22023'; END IF;

  IF p_payload ? 'description_en' THEN v_desc_en:=NULLIF(pg_catalog.btrim(p_payload->>'description_en'),'');
  ELSIF v_id IS NOT NULL THEN v_desc_en:=v_row.description_en; ELSE v_desc_en:=NULL; END IF;
  IF v_desc_en IS NOT NULL AND pg_catalog.char_length(v_desc_en)>3000 THEN RAISE EXCEPTION 'DEAL_DESCRIPTION_EN_INVALID' USING ERRCODE='22023'; END IF;
  IF p_payload ? 'description_ur' THEN v_desc_ur:=NULLIF(pg_catalog.btrim(p_payload->>'description_ur'),'');
  ELSIF v_id IS NOT NULL THEN v_desc_ur:=v_row.description_ur; ELSE v_desc_ur:=NULL; END IF;
  IF v_desc_ur IS NOT NULL AND pg_catalog.char_length(v_desc_ur)>3000 THEN RAISE EXCEPTION 'DEAL_DESCRIPTION_UR_INVALID' USING ERRCODE='22023'; END IF;

  IF p_payload ? 'legacy_id' THEN v_legacy:=NULLIF(pg_catalog.btrim(p_payload->>'legacy_id'),'');
  ELSIF v_id IS NOT NULL THEN v_legacy:=v_row.legacy_id; ELSE v_legacy:=NULL; END IF;
  IF v_legacy IS NOT NULL AND pg_catalog.char_length(v_legacy)>120 THEN RAISE EXCEPTION 'DEAL_LEGACY_ID_INVALID' USING ERRCODE='22023'; END IF;

  IF p_payload ? 'featured' THEN v_featured:=(p_payload->>'featured')::boolean;
  ELSIF v_id IS NOT NULL THEN v_featured:=v_row.featured; ELSE v_featured:=false; END IF;
  IF p_payload ? 'is_active' THEN v_active:=(p_payload->>'is_active')::boolean;
  ELSIF v_id IS NOT NULL THEN v_active:=v_row.is_active; ELSE v_active:=false; END IF;
  IF p_payload ? 'is_available' THEN v_available:=(p_payload->>'is_available')::boolean;
  ELSIF v_id IS NOT NULL THEN v_available:=v_row.is_available; ELSE v_available:=false; END IF;

  IF p_payload ? 'sort_order' THEN
    BEGIN v_num:=(p_payload->>'sort_order')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'DEAL_SORT_INVALID' USING ERRCODE='22023'; END;
    IF pg_catalog.scale(v_num)<>0 OR v_num<0 OR v_num>2147483647 THEN RAISE EXCEPTION 'DEAL_SORT_INVALID' USING ERRCODE='22023'; END IF;
    v_sort:=v_num::integer;
  ELSIF v_id IS NOT NULL THEN v_sort:=v_row.sort_order; ELSE v_sort:=0; END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.deals(
      restaurant_id,collection_id,legacy_id,title,title_ur,description_en,description_ur,
      bundle_price,featured,sort_order,is_active,is_available
    ) VALUES(
      v_context.restaurant_id,v_collection,v_legacy,v_title,v_title_ur,v_desc_en,v_desc_ur,
      NULL,v_featured,v_sort,v_active,v_available
    ) RETURNING * INTO v_row;
    v_id:=v_row.id;
  ELSE
    UPDATE public.deals d
    SET collection_id=v_collection,legacy_id=v_legacy,title=v_title,title_ur=v_title_ur,
        description_en=v_desc_en,description_ur=v_desc_ur,featured=v_featured,
        sort_order=v_sort,is_active=v_active,is_available=v_available
    WHERE d.id=v_id AND d.restaurant_id=v_context.restaurant_id
    RETURNING d.* INTO v_row;
  END IF;

  IF p_payload ? 'variants' THEN
    FOR v_variant IN SELECT x.value FROM pg_catalog.jsonb_array_elements(p_payload->'variants') x(value)
    LOOP
      v_variant_id:=NULL;
      IF v_variant ? 'id' AND v_variant->'id'<>'null'::jsonb THEN v_variant_id:=(v_variant->>'id')::uuid; END IF;
      IF v_variant_id IS NOT NULL THEN
        SELECT dv.* INTO v_variant_row FROM public.deal_variants dv
        WHERE dv.id=v_variant_id AND dv.restaurant_id=v_context.restaurant_id AND dv.deal_id=v_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'DEAL_VARIANT_NOT_FOUND_FOR_DEAL' USING ERRCODE='P0002'; END IF;
      ELSE
        SELECT dv.* INTO v_variant_row FROM public.deal_variants dv
        WHERE dv.restaurant_id=v_context.restaurant_id AND dv.deal_id=v_id
          AND dv.variant_key=pg_catalog.upper(pg_catalog.btrim(v_variant->>'variant_key'))
        FOR UPDATE;
      END IF;
      IF v_variant ? 'variant_key' THEN v_variant_key:=pg_catalog.upper(pg_catalog.btrim(v_variant->>'variant_key'));
      ELSIF v_variant_id IS NOT NULL THEN v_variant_key:=v_variant_row.variant_key;
      ELSE v_variant_key:=NULL; END IF;
      IF v_variant_key IS NULL OR v_variant_key !~ '^[A-Z0-9][A-Z0-9_-]{0,31}$' THEN RAISE EXCEPTION 'DEAL_VARIANT_KEY_REQUIRED' USING ERRCODE='22023'; END IF;

      IF v_variant ? 'label_en' THEN v_variant_label:=pg_catalog.btrim(v_variant->>'label_en');
      ELSIF v_variant_id IS NOT NULL THEN v_variant_label:=v_variant_row.label_en; ELSE v_variant_label:=NULL; END IF;
      IF v_variant_label IS NULL OR pg_catalog.char_length(v_variant_label) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'DEAL_VARIANT_LABEL_REQUIRED' USING ERRCODE='22023'; END IF;
      IF v_variant ? 'label_ur' THEN v_variant_label_ur:=NULLIF(pg_catalog.btrim(v_variant->>'label_ur'),'');
      ELSIF v_variant_id IS NOT NULL THEN v_variant_label_ur:=v_variant_row.label_ur; ELSE v_variant_label_ur:=NULL; END IF;
      IF v_variant_label_ur IS NOT NULL AND pg_catalog.char_length(v_variant_label_ur)>80 THEN RAISE EXCEPTION 'DEAL_VARIANT_LABEL_UR_INVALID' USING ERRCODE='22023'; END IF;

      IF v_variant ? 'pricing_mode' THEN v_pricing_mode:=v_variant->>'pricing_mode';
      ELSIF v_variant_id IS NOT NULL THEN v_pricing_mode:=v_variant_row.pricing_mode;
      ELSE v_pricing_mode:=NULL; END IF;
      IF v_pricing_mode NOT IN ('FIXED_BUNDLE','BASE_PLUS_SELECTED_ITEMS') THEN RAISE EXCEPTION 'DEAL_VARIANT_PRICING_MODE_REQUIRED' USING ERRCODE='22023'; END IF;

      IF v_variant ? 'base_price' THEN
        IF v_variant->'base_price'='null'::jsonb THEN v_base_price:=NULL;
        ELSE
          BEGIN v_num:=(v_variant->>'base_price')::numeric;
          EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'DEAL_VARIANT_BASE_PRICE_INVALID' USING ERRCODE='22023'; END;
          IF v_num<0 OR pg_catalog.scale(v_num)>2 OR v_num>9999999999.99 THEN RAISE EXCEPTION 'DEAL_VARIANT_BASE_PRICE_INVALID' USING ERRCODE='22023'; END IF;
          v_base_price:=v_num;
        END IF;
      ELSIF v_variant_id IS NOT NULL THEN v_base_price:=v_variant_row.base_price;
      ELSE v_base_price:=NULL; END IF;

      IF v_variant ? 'sort_order' THEN
        BEGIN v_num:=(v_variant->>'sort_order')::numeric;
        EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'DEAL_VARIANT_SORT_INVALID' USING ERRCODE='22023'; END;
        IF pg_catalog.scale(v_num)<>0 OR v_num<0 OR v_num>2147483647 THEN RAISE EXCEPTION 'DEAL_VARIANT_SORT_INVALID' USING ERRCODE='22023'; END IF;
        v_variant_sort:=v_num::integer;
      ELSIF v_variant_id IS NOT NULL THEN v_variant_sort:=v_variant_row.sort_order; ELSE v_variant_sort:=0; END IF;
      IF v_variant ? 'is_active' THEN v_variant_active:=(v_variant->>'is_active')::boolean;
      ELSIF v_variant_id IS NOT NULL THEN v_variant_active:=v_variant_row.is_active; ELSE v_variant_active:=false; END IF;

      IF v_variant_id IS NULL THEN
        INSERT INTO public.deal_variants(
          restaurant_id,deal_id,variant_key,label_en,label_ur,pricing_mode,base_price,sort_order,is_active
        ) VALUES(
          v_context.restaurant_id,v_id,v_variant_key,v_variant_label,v_variant_label_ur,
          v_pricing_mode,v_base_price,v_variant_sort,v_variant_active
        ) RETURNING * INTO v_variant_row;
      ELSE
        UPDATE public.deal_variants dv
        SET variant_key=v_variant_key,label_en=v_variant_label,label_ur=v_variant_label_ur,
            pricing_mode=v_pricing_mode,base_price=v_base_price,
            sort_order=v_variant_sort,is_active=v_variant_active
        WHERE dv.id=v_variant_id AND dv.restaurant_id=v_context.restaurant_id AND dv.deal_id=v_id
        RETURNING dv.* INTO v_variant_row;
      END IF;
    END LOOP;
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'deal',pg_catalog.to_jsonb(d),
    'variants',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(dv) ORDER BY dv.sort_order,dv.variant_key,dv.id)
      FROM public.deal_variants dv WHERE dv.restaurant_id=v_context.restaurant_id AND dv.deal_id=v_id
    ),'[]'::jsonb)
  ) INTO v_after
  FROM public.deals d WHERE d.id=v_id AND d.restaurant_id=v_context.restaurant_id;

  RETURN app_private.flame_chick_catalog_command_finish(
    v_context,'deal_upsert','deal.upsert','deal',v_id,p_request_id,v_before,v_after
  );
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_deal_upsert_internal(jsonb,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_deal_upsert_internal(jsonb,bigint,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_deal_upsert_internal(jsonb,bigint,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_catalog_deal_upsert(
 p_payload jsonb,p_expected_revision bigint,p_request_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
 SELECT app_private.flame_chick_catalog_deal_upsert_internal(p_payload,p_expected_revision,p_request_id)
$function$;

ALTER FUNCTION public.flame_chick_catalog_deal_upsert(jsonb,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_deal_upsert(jsonb,bigint,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_deal_upsert(jsonb,bigint,uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Deal component groups + exact product variant options aggregate upsert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_deal_components_upsert_internal(
 p_payload jsonb,p_expected_revision bigint,p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
 v_context app_private.flame_chick_catalog_command_context;
 v_deal_id uuid;
 v_group_json jsonb;
 v_group_id uuid;
 v_option jsonb;
 v_option_id uuid;
 v_variant_id uuid;
 v_product_id uuid;
 v_group public.deal_component_groups%ROWTYPE;
 v_option_row public.deal_component_options%ROWTYPE;
 v_num numeric;
 v_name_en text;
 v_name_ur text;
 v_min integer;
 v_max integer;
 v_repeat boolean;
 v_max_per integer;
 v_sort integer;
 v_active boolean;
 v_before jsonb;
 v_after jsonb;
 v_groups_seen uuid[]:=ARRAY[]::uuid[];
 v_variant_seen uuid[]:=ARRAY[]::uuid[];
 v_options_total integer:=0;
BEGIN
 IF EXISTS(
  SELECT 1 FROM pg_catalog.jsonb_object_keys(p_payload) k(key)
  WHERE k.key<>ALL(ARRAY['deal_id','groups'])
 ) THEN RAISE EXCEPTION 'DEAL_COMPONENT_FIELD_NOT_ALLOWED' USING ERRCODE='22023'; END IF;
 IF pg_catalog.jsonb_typeof(p_payload->'deal_id')<>'string'
    OR pg_catalog.jsonb_typeof(p_payload->'groups') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'DEAL_COMPONENT_PAYLOAD_INVALID' USING ERRCODE='22023';
 END IF;
 IF pg_catalog.jsonb_array_length(p_payload->'groups')>40 THEN RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_LIMIT' USING ERRCODE='22023'; END IF;

 v_context:=app_private.flame_chick_catalog_command_context('deal_components_upsert',p_payload,p_expected_revision,p_request_id,131072);
 IF v_context.replay_response IS NOT NULL THEN
  RETURN pg_catalog.jsonb_set(v_context.replay_response,'{idempotent}','true'::jsonb,true);
 END IF;
 BEGIN v_deal_id:=(p_payload->>'deal_id')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DEAL_ID_INVALID' USING ERRCODE='22023'; END;

 PERFORM 1 FROM public.deals d
 WHERE d.id=v_deal_id AND d.restaurant_id=v_context.restaurant_id
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'DEAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;

 SELECT pg_catalog.jsonb_build_object(
  'groups',COALESCE((
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
       'group',pg_catalog.to_jsonb(g),
       'options',COALESCE((
         SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(o) ORDER BY o.sort_order,o.product_variant_id)
         FROM public.deal_component_options o
         WHERE o.restaurant_id=v_context.restaurant_id AND o.deal_id=v_deal_id AND o.component_group_id=g.id
       ),'[]'::jsonb)
      ) ORDER BY g.sort_order,g.id
    )
    FROM public.deal_component_groups g
    WHERE g.restaurant_id=v_context.restaurant_id AND g.deal_id=v_deal_id
  ),'[]'::jsonb)
 ) INTO v_before;

 FOR v_group_json IN SELECT x.value FROM pg_catalog.jsonb_array_elements(p_payload->'groups') x(value)
 LOOP
  v_variant_seen:=ARRAY[]::uuid[];
  IF pg_catalog.jsonb_typeof(v_group_json)<>'object'
     OR EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_object_keys(v_group_json) k(key)
      WHERE k.key<>ALL(ARRAY['id','name_en','name_ur','min_units','max_units','allow_repeat_option','max_units_per_option','sort_order','is_active','options'])
     ) THEN RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_FIELDS_INVALID' USING ERRCODE='22023'; END IF;
  IF (v_group_json ? 'id' AND v_group_json->'id'<>'null'::jsonb AND pg_catalog.jsonb_typeof(v_group_json->'id')<>'string')
     OR (v_group_json ? 'name_en' AND pg_catalog.jsonb_typeof(v_group_json->'name_en')<>'string')
     OR (v_group_json ? 'name_ur' AND v_group_json->'name_ur'<>'null'::jsonb AND pg_catalog.jsonb_typeof(v_group_json->'name_ur')<>'string')
     OR (v_group_json ? 'min_units' AND pg_catalog.jsonb_typeof(v_group_json->'min_units')<>'number')
     OR (v_group_json ? 'max_units' AND pg_catalog.jsonb_typeof(v_group_json->'max_units')<>'number')
     OR (v_group_json ? 'allow_repeat_option' AND pg_catalog.jsonb_typeof(v_group_json->'allow_repeat_option')<>'boolean')
     OR (v_group_json ? 'max_units_per_option' AND v_group_json->'max_units_per_option'<>'null'::jsonb AND pg_catalog.jsonb_typeof(v_group_json->'max_units_per_option')<>'number')
     OR (v_group_json ? 'sort_order' AND pg_catalog.jsonb_typeof(v_group_json->'sort_order')<>'number')
     OR (v_group_json ? 'is_active' AND pg_catalog.jsonb_typeof(v_group_json->'is_active')<>'boolean')
     OR (v_group_json ? 'options' AND pg_catalog.jsonb_typeof(v_group_json->'options') IS DISTINCT FROM 'array') THEN
    RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_FIELD_TYPE_INVALID' USING ERRCODE='22023';
  END IF;
  IF v_group_json ? 'options' THEN
    v_options_total:=v_options_total+pg_catalog.jsonb_array_length(v_group_json->'options');
    IF v_options_total>200 THEN RAISE EXCEPTION 'DEAL_COMPONENT_OPTION_LIMIT' USING ERRCODE='22023'; END IF;
  END IF;

  v_group_id:=NULL;
  IF v_group_json ? 'id' AND v_group_json->'id'<>'null'::jsonb THEN
   BEGIN v_group_id:=(v_group_json->>'id')::uuid;
   EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_ID_INVALID' USING ERRCODE='22023'; END;
   IF v_group_id=ANY(v_groups_seen) THEN RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_ID_DUPLICATED' USING ERRCODE='22023'; END IF;
   v_groups_seen:=pg_catalog.array_append(v_groups_seen,v_group_id);
   SELECT g.* INTO v_group FROM public.deal_component_groups g
   WHERE g.id=v_group_id AND g.restaurant_id=v_context.restaurant_id AND g.deal_id=v_deal_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  END IF;

  IF v_group_json ? 'name_en' THEN v_name_en:=pg_catalog.btrim(v_group_json->>'name_en');
  ELSIF v_group_id IS NOT NULL THEN v_name_en:=v_group.name_en; ELSE v_name_en:=NULL; END IF;
  IF v_name_en IS NULL OR pg_catalog.char_length(v_name_en) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_NAME_REQUIRED' USING ERRCODE='22023'; END IF;
  IF v_group_json ? 'name_ur' THEN v_name_ur:=NULLIF(pg_catalog.btrim(v_group_json->>'name_ur'),'');
  ELSIF v_group_id IS NOT NULL THEN v_name_ur:=v_group.name_ur; ELSE v_name_ur:=NULL; END IF;
  IF v_name_ur IS NOT NULL AND pg_catalog.char_length(v_name_ur)>120 THEN RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_NAME_UR_INVALID' USING ERRCODE='22023'; END IF;

  IF v_group_json ? 'min_units' THEN
   BEGIN v_num:=(v_group_json->>'min_units')::numeric;
   EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_MIN_INVALID' USING ERRCODE='22023'; END;
   IF pg_catalog.scale(v_num)<>0 OR v_num<0 OR v_num>100 THEN RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_MIN_INVALID' USING ERRCODE='22023'; END IF;
   v_min:=v_num::integer;
  ELSIF v_group_id IS NOT NULL THEN v_min:=v_group.min_units; ELSE v_min:=0; END IF;
  IF v_group_json ? 'max_units' THEN
   BEGIN v_num:=(v_group_json->>'max_units')::numeric;
   EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_MAX_INVALID' USING ERRCODE='22023'; END;
   IF pg_catalog.scale(v_num)<>0 OR v_num<1 OR v_num>100 THEN RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_MAX_INVALID' USING ERRCODE='22023'; END IF;
   v_max:=v_num::integer;
  ELSIF v_group_id IS NOT NULL THEN v_max:=v_group.max_units; ELSE v_max:=1; END IF;
  IF v_min>v_max THEN RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_BOUNDS_INVALID' USING ERRCODE='22023'; END IF;

  IF v_group_json ? 'allow_repeat_option' THEN v_repeat:=(v_group_json->>'allow_repeat_option')::boolean;
  ELSIF v_group_id IS NOT NULL THEN v_repeat:=v_group.allow_repeat_option; ELSE v_repeat:=false; END IF;

  IF v_group_json ? 'max_units_per_option' THEN
   IF v_group_json->'max_units_per_option'='null'::jsonb THEN v_max_per:=NULL;
   ELSE
    BEGIN v_num:=(v_group_json->>'max_units_per_option')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_OPTION_LIMIT_INVALID' USING ERRCODE='22023'; END;
    IF pg_catalog.scale(v_num)<>0 OR v_num<1 OR v_num>v_max THEN RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_OPTION_LIMIT_INVALID' USING ERRCODE='22023'; END IF;
    v_max_per:=v_num::integer;
   END IF;
  ELSIF v_group_id IS NOT NULL THEN v_max_per:=v_group.max_units_per_option; ELSE v_max_per:=NULL; END IF;
  IF NOT v_repeat AND v_max_per IS NOT NULL AND v_max_per>1 THEN
   RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_REPEAT_LIMIT_CONFLICT' USING ERRCODE='22023';
  END IF;

  IF v_group_json ? 'sort_order' THEN
   BEGIN v_num:=(v_group_json->>'sort_order')::numeric;
   EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_SORT_INVALID' USING ERRCODE='22023'; END;
   IF pg_catalog.scale(v_num)<>0 OR v_num<0 OR v_num>2147483647 THEN RAISE EXCEPTION 'DEAL_COMPONENT_GROUP_SORT_INVALID' USING ERRCODE='22023'; END IF;
   v_sort:=v_num::integer;
  ELSIF v_group_id IS NOT NULL THEN v_sort:=v_group.sort_order; ELSE v_sort:=0; END IF;
  IF v_group_json ? 'is_active' THEN v_active:=(v_group_json->>'is_active')::boolean;
  ELSIF v_group_id IS NOT NULL THEN v_active:=v_group.is_active; ELSE v_active:=false; END IF;

  IF v_group_id IS NULL THEN
   INSERT INTO public.deal_component_groups(
    restaurant_id,deal_id,name_en,name_ur,min_units,max_units,allow_repeat_option,
    max_units_per_option,sort_order,is_active
   ) VALUES(
    v_context.restaurant_id,v_deal_id,v_name_en,v_name_ur,v_min,v_max,v_repeat,
    v_max_per,v_sort,v_active
   ) RETURNING * INTO v_group;
   v_group_id:=v_group.id;
  ELSE
   UPDATE public.deal_component_groups g
   SET name_en=v_name_en,name_ur=v_name_ur,min_units=v_min,max_units=v_max,
       allow_repeat_option=v_repeat,max_units_per_option=v_max_per,
       sort_order=v_sort,is_active=v_active
   WHERE g.id=v_group_id AND g.restaurant_id=v_context.restaurant_id AND g.deal_id=v_deal_id
   RETURNING g.* INTO v_group;
  END IF;

  IF v_group_json ? 'options' THEN
   FOR v_option IN SELECT x.value FROM pg_catalog.jsonb_array_elements(v_group_json->'options') x(value)
   LOOP
    IF pg_catalog.jsonb_typeof(v_option)<>'object'
       OR EXISTS(
        SELECT 1 FROM pg_catalog.jsonb_object_keys(v_option) k(key)
        WHERE k.key<>ALL(ARRAY['id','product_variant_id','sort_order','is_active'])
       ) THEN RAISE EXCEPTION 'DEAL_COMPONENT_OPTION_FIELDS_INVALID' USING ERRCODE='22023'; END IF;
    IF (v_option ? 'id' AND v_option->'id'<>'null'::jsonb AND pg_catalog.jsonb_typeof(v_option->'id')<>'string')
       OR (v_option ? 'product_variant_id' AND pg_catalog.jsonb_typeof(v_option->'product_variant_id')<>'string')
       OR (v_option ? 'sort_order' AND pg_catalog.jsonb_typeof(v_option->'sort_order')<>'number')
       OR (v_option ? 'is_active' AND pg_catalog.jsonb_typeof(v_option->'is_active')<>'boolean') THEN
      RAISE EXCEPTION 'DEAL_COMPONENT_OPTION_FIELD_TYPE_INVALID' USING ERRCODE='22023';
    END IF;
    v_option_id:=NULL;
    IF v_option ? 'id' AND v_option->'id'<>'null'::jsonb THEN
     BEGIN v_option_id:=(v_option->>'id')::uuid;
     EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DEAL_COMPONENT_OPTION_ID_INVALID' USING ERRCODE='22023'; END;
    END IF;
    v_variant_id:=NULL;
    IF v_option ? 'product_variant_id' THEN
     BEGIN v_variant_id:=(v_option->>'product_variant_id')::uuid;
     EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DEAL_COMPONENT_OPTION_VARIANT_ID_INVALID' USING ERRCODE='22023'; END;
    ELSIF v_option_id IS NULL THEN
     RAISE EXCEPTION 'DEAL_COMPONENT_OPTION_VARIANT_REQUIRED' USING ERRCODE='22023';
    END IF;

    IF v_option_id IS NOT NULL THEN
     SELECT o.* INTO v_option_row FROM public.deal_component_options o
     WHERE o.id=v_option_id AND o.restaurant_id=v_context.restaurant_id
       AND o.deal_id=v_deal_id AND o.component_group_id=v_group_id FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'DEAL_COMPONENT_OPTION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
     IF v_variant_id IS NULL THEN v_variant_id:=v_option_row.product_variant_id; END IF;
    ELSE
     SELECT o.* INTO v_option_row FROM public.deal_component_options o
     WHERE o.restaurant_id=v_context.restaurant_id AND o.deal_id=v_deal_id
       AND o.component_group_id=v_group_id AND o.product_variant_id=v_variant_id FOR UPDATE;
    END IF;

    IF v_variant_id=ANY(v_variant_seen) THEN
     RAISE EXCEPTION 'DEAL_COMPONENT_VARIANT_DUPLICATED_IN_REQUEST' USING ERRCODE='22023';
    END IF;
    v_variant_seen:=pg_catalog.array_append(v_variant_seen,v_variant_id);

    SELECT pv.product_id INTO v_product_id
    FROM public.product_variants pv
    JOIN public.products p ON p.id=pv.product_id AND p.restaurant_id=pv.restaurant_id
    JOIN public.categories c ON c.id=p.category_id AND c.restaurant_id=p.restaurant_id
    WHERE pv.id=v_variant_id AND pv.restaurant_id=v_context.restaurant_id
      AND c.category_kind='menu';
    IF NOT FOUND THEN RAISE EXCEPTION 'DEAL_COMPONENT_VARIANT_NOT_FOUND_OR_NOT_MENU' USING ERRCODE='23503'; END IF;

    IF v_option ? 'sort_order' THEN
     BEGIN v_num:=(v_option->>'sort_order')::numeric;
     EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'DEAL_COMPONENT_OPTION_SORT_INVALID' USING ERRCODE='22023'; END;
     IF pg_catalog.scale(v_num)<>0 OR v_num<0 OR v_num>2147483647 THEN RAISE EXCEPTION 'DEAL_COMPONENT_OPTION_SORT_INVALID' USING ERRCODE='22023'; END IF;
     v_sort:=v_num::integer;
    ELSIF v_option_row.id IS NOT NULL THEN v_sort:=v_option_row.sort_order; ELSE v_sort:=0; END IF;
    IF v_option ? 'is_active' THEN v_active:=(v_option->>'is_active')::boolean;
    ELSIF v_option_row.id IS NOT NULL THEN v_active:=v_option_row.is_active; ELSE v_active:=false; END IF;

    IF v_option_row.id IS NULL THEN
     INSERT INTO public.deal_component_options(
      restaurant_id,deal_id,component_group_id,product_id,product_variant_id,
      pricing_treatment,unit_surcharge,max_quantity_per_deal,sort_order,is_active
     ) VALUES(
      v_context.restaurant_id,v_deal_id,v_group_id,v_product_id,v_variant_id,
      'INCLUDED',0,NULL,v_sort,v_active
     ) RETURNING * INTO v_option_row;
    ELSE
     UPDATE public.deal_component_options o
     SET product_id=v_product_id,product_variant_id=v_variant_id,
         pricing_treatment='INCLUDED',unit_surcharge=0,max_quantity_per_deal=NULL,
         sort_order=v_sort,is_active=v_active
     WHERE o.id=v_option_row.id AND o.restaurant_id=v_context.restaurant_id
     RETURNING o.* INTO v_option_row;
    END IF;
   END LOOP;
  END IF;
 END LOOP;

 SELECT pg_catalog.jsonb_build_object(
  'deal_id',v_deal_id,
  'groups',COALESCE((
   SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
     'group',pg_catalog.to_jsonb(g),
     'options',COALESCE((
      SELECT pg_catalog.jsonb_agg(
       pg_catalog.jsonb_build_object(
        'id',o.id,'product_id',o.product_id,'product_variant_id',o.product_variant_id,
        'product_name',p.name_en,'variant_key',pv.size_key,'variant_label',pv.size_label,
        'variant_price',pv.price,'sort_order',o.sort_order,'is_active',o.is_active
       ) ORDER BY o.sort_order,pv.size_key,pv.id
      )
      FROM public.deal_component_options o
      JOIN public.product_variants pv ON pv.id=o.product_variant_id AND pv.restaurant_id=o.restaurant_id AND pv.product_id=o.product_id
      JOIN public.products p ON p.id=o.product_id AND p.restaurant_id=o.restaurant_id
      WHERE o.restaurant_id=v_context.restaurant_id AND o.deal_id=v_deal_id AND o.component_group_id=g.id
     ),'[]'::jsonb)
    ) ORDER BY g.sort_order,g.id
   )
   FROM public.deal_component_groups g
   WHERE g.restaurant_id=v_context.restaurant_id AND g.deal_id=v_deal_id
  ),'[]'::jsonb)
 ) INTO v_after;

 RETURN app_private.flame_chick_catalog_command_finish(
  v_context,'deal_components_upsert','deal.components_upsert','deal',v_deal_id,p_request_id,v_before,v_after
 );
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_deal_components_upsert_internal(jsonb,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_deal_components_upsert_internal(jsonb,bigint,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_deal_components_upsert_internal(jsonb,bigint,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_catalog_deal_components_upsert(
 p_payload jsonb,p_expected_revision bigint,p_request_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
 SELECT app_private.flame_chick_catalog_deal_components_upsert_internal(p_payload,p_expected_revision,p_request_id)
$function$;

ALTER FUNCTION public.flame_chick_catalog_deal_components_upsert(jsonb,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_deal_components_upsert(jsonb,bigint,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_deal_components_upsert(jsonb,bigint,uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Deal variant allowed-option pricing map upsert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_deal_variant_options_upsert_internal(
 p_payload jsonb,p_expected_revision bigint,p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_context app_private.flame_chick_catalog_command_context;
 v_deal uuid; v_variant uuid;
 v_variant_row public.deal_variants%ROWTYPE;
 v_map jsonb; v_option_id uuid; v_map_id uuid;
 v_treatment text; v_surcharge numeric; v_num numeric;
 v_max_qty integer; v_sort integer; v_active boolean;
 v_row public.deal_variant_component_options%ROWTYPE;
 v_before jsonb; v_after jsonb;
 v_seen uuid[]:=ARRAY[]::uuid[];
BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_payload) k(key)
   WHERE k.key<>ALL(ARRAY['deal_id','deal_variant_id','options'])) THEN
  RAISE EXCEPTION 'DEAL_VARIANT_MAP_FIELD_NOT_ALLOWED' USING ERRCODE='22023';
 END IF;
 IF pg_catalog.jsonb_typeof(p_payload->'deal_id')<>'string'
    OR pg_catalog.jsonb_typeof(p_payload->'deal_variant_id')<>'string'
    OR pg_catalog.jsonb_typeof(p_payload->'options') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'DEAL_VARIANT_MAP_PAYLOAD_INVALID' USING ERRCODE='22023';
 END IF;
 IF pg_catalog.jsonb_array_length(p_payload->'options')>200 THEN RAISE EXCEPTION 'DEAL_VARIANT_MAP_LIMIT' USING ERRCODE='22023'; END IF;
 FOR v_map IN SELECT x.value FROM pg_catalog.jsonb_array_elements(p_payload->'options') x(value)
 LOOP
  IF pg_catalog.jsonb_typeof(v_map)<>'object'
     OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(v_map) k(key)
       WHERE k.key<>ALL(ARRAY['id','component_option_id','pricing_treatment','unit_surcharge','max_quantity_per_deal','sort_order','is_active'])) THEN
    RAISE EXCEPTION 'DEAL_VARIANT_MAP_OPTION_FIELDS_INVALID' USING ERRCODE='22023';
  END IF;
  IF (v_map ? 'id' AND v_map->'id'<>'null'::jsonb AND pg_catalog.jsonb_typeof(v_map->'id')<>'string')
     OR (v_map ? 'component_option_id' AND pg_catalog.jsonb_typeof(v_map->'component_option_id')<>'string')
     OR (v_map ? 'pricing_treatment' AND pg_catalog.jsonb_typeof(v_map->'pricing_treatment')<>'string')
     OR (v_map ? 'unit_surcharge' AND pg_catalog.jsonb_typeof(v_map->'unit_surcharge')<>'number')
     OR (v_map ? 'max_quantity_per_deal' AND v_map->'max_quantity_per_deal'<>'null'::jsonb AND pg_catalog.jsonb_typeof(v_map->'max_quantity_per_deal')<>'number')
     OR (v_map ? 'sort_order' AND pg_catalog.jsonb_typeof(v_map->'sort_order')<>'number')
     OR (v_map ? 'is_active' AND pg_catalog.jsonb_typeof(v_map->'is_active')<>'boolean') THEN
   RAISE EXCEPTION 'DEAL_VARIANT_MAP_OPTION_TYPE_INVALID' USING ERRCODE='22023';
  END IF;
  IF pg_catalog.jsonb_typeof(v_map->'component_option_id')<>'string' THEN RAISE EXCEPTION 'DEAL_VARIANT_MAP_OPTION_ID_REQUIRED' USING ERRCODE='22023'; END IF;
  BEGIN v_option_id:=(v_map->>'component_option_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DEAL_COMPONENT_OPTION_ID_INVALID' USING ERRCODE='22023'; END;
  IF v_option_id=ANY(v_seen) THEN RAISE EXCEPTION 'DEAL_VARIANT_MAP_OPTION_DUPLICATED' USING ERRCODE='22023'; END IF;
  v_seen:=pg_catalog.array_append(v_seen,v_option_id);
 END LOOP;

 v_context:=app_private.flame_chick_catalog_command_context('deal_variant_options_upsert',p_payload,p_expected_revision,p_request_id,65536);
 IF v_context.replay_response IS NOT NULL THEN RETURN pg_catalog.jsonb_set(v_context.replay_response,'{idempotent}','true'::jsonb,true); END IF;
 BEGIN v_deal:=(p_payload->>'deal_id')::uuid; v_variant:=(p_payload->>'deal_variant_id')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DEAL_VARIANT_MAP_ID_INVALID' USING ERRCODE='22023'; END;

 SELECT dv.* INTO v_variant_row FROM public.deal_variants dv
 WHERE dv.id=v_variant AND dv.deal_id=v_deal AND dv.restaurant_id=v_context.restaurant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'DEAL_VARIANT_NOT_FOUND' USING ERRCODE='P0002'; END IF;

 SELECT pg_catalog.jsonb_build_object(
  'deal_variant_id',v_variant,
  'options',COALESCE((
   SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) ORDER BY m.sort_order,m.component_option_id)
   FROM public.deal_variant_component_options m
   WHERE m.restaurant_id=v_context.restaurant_id AND m.deal_id=v_deal AND m.deal_variant_id=v_variant
  ),'[]'::jsonb)
 ) INTO v_before;

 FOR v_map IN SELECT x.value FROM pg_catalog.jsonb_array_elements(p_payload->'options') x(value)
 LOOP
  v_option_id:=(v_map->>'component_option_id')::uuid;
  IF NOT EXISTS(
   SELECT 1 FROM public.deal_component_options o
   WHERE o.id=v_option_id AND o.deal_id=v_deal AND o.restaurant_id=v_context.restaurant_id
  ) THEN RAISE EXCEPTION 'DEAL_VARIANT_MAP_COMPONENT_OPTION_MISMATCH' USING ERRCODE='23514'; END IF;

  v_map_id:=NULL;
  IF v_map ? 'id' AND v_map->'id'<>'null'::jsonb THEN
   BEGIN v_map_id:=(v_map->>'id')::uuid;
   EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DEAL_VARIANT_MAP_ID_INVALID' USING ERRCODE='22023'; END;
   SELECT m.* INTO v_row FROM public.deal_variant_component_options m
   WHERE m.id=v_map_id AND m.restaurant_id=v_context.restaurant_id
     AND m.deal_id=v_deal AND m.deal_variant_id=v_variant FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'DEAL_VARIANT_MAP_ROW_NOT_FOUND' USING ERRCODE='P0002'; END IF;
   IF v_row.component_option_id<>v_option_id THEN RAISE EXCEPTION 'DEAL_VARIANT_MAP_ID_OPTION_MISMATCH' USING ERRCODE='23514'; END IF;
  ELSE
   SELECT m.* INTO v_row FROM public.deal_variant_component_options m
   WHERE m.restaurant_id=v_context.restaurant_id AND m.deal_id=v_deal
     AND m.deal_variant_id=v_variant AND m.component_option_id=v_option_id FOR UPDATE;
   v_map_id:=v_row.id;
  END IF;

  IF v_map ? 'pricing_treatment' THEN v_treatment:=v_map->>'pricing_treatment';
  ELSIF v_map_id IS NOT NULL THEN v_treatment:=v_row.pricing_treatment; ELSE v_treatment:=NULL; END IF;
  IF v_treatment NOT IN ('INCLUDED','SURCHARGE','STANDALONE') THEN RAISE EXCEPTION 'DEAL_VARIANT_MAP_TREATMENT_REQUIRED' USING ERRCODE='22023'; END IF;
  IF v_variant_row.pricing_mode='FIXED_BUNDLE' AND v_treatment='STANDALONE' THEN
   RAISE EXCEPTION 'FIXED_BUNDLE_CANNOT_USE_STANDALONE_TREATMENT' USING ERRCODE='23514';
  END IF;

  IF v_map ? 'unit_surcharge' THEN
   BEGIN v_num:=(v_map->>'unit_surcharge')::numeric;
   EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'DEAL_VARIANT_MAP_SURCHARGE_INVALID' USING ERRCODE='22023'; END;
   IF v_num<0 OR pg_catalog.scale(v_num)>2 OR v_num>9999999999.99 THEN RAISE EXCEPTION 'DEAL_VARIANT_MAP_SURCHARGE_INVALID' USING ERRCODE='22023'; END IF;
   v_surcharge:=v_num;
  ELSIF v_map_id IS NOT NULL THEN v_surcharge:=v_row.unit_surcharge; ELSE v_surcharge:=0; END IF;
  IF v_treatment<>'SURCHARGE' AND v_surcharge<>0 THEN RAISE EXCEPTION 'DEAL_VARIANT_MAP_SURCHARGE_NOT_ALLOWED' USING ERRCODE='22023'; END IF;
  IF v_treatment='SURCHARGE' AND v_surcharge IS NULL THEN RAISE EXCEPTION 'DEAL_VARIANT_MAP_SURCHARGE_REQUIRED' USING ERRCODE='22023'; END IF;

  IF v_map ? 'max_quantity_per_deal' THEN
   IF v_map->'max_quantity_per_deal'='null'::jsonb THEN v_max_qty:=NULL;
   ELSE
    BEGIN v_num:=(v_map->>'max_quantity_per_deal')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'DEAL_VARIANT_MAP_QUANTITY_INVALID' USING ERRCODE='22023'; END;
    IF pg_catalog.scale(v_num)<>0 OR v_num<1 OR v_num>100 THEN RAISE EXCEPTION 'DEAL_VARIANT_MAP_QUANTITY_INVALID' USING ERRCODE='22023'; END IF;
    v_max_qty:=v_num::integer;
   END IF;
  ELSIF v_map_id IS NOT NULL THEN v_max_qty:=v_row.max_quantity_per_deal; ELSE v_max_qty:=NULL; END IF;

  IF v_map ? 'sort_order' THEN
   BEGIN v_num:=(v_map->>'sort_order')::numeric;
   EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'DEAL_VARIANT_MAP_SORT_INVALID' USING ERRCODE='22023'; END;
   IF pg_catalog.scale(v_num)<>0 OR v_num<0 OR v_num>2147483647 THEN RAISE EXCEPTION 'DEAL_VARIANT_MAP_SORT_INVALID' USING ERRCODE='22023'; END IF;
   v_sort:=v_num::integer;
  ELSIF v_map_id IS NOT NULL THEN v_sort:=v_row.sort_order; ELSE v_sort:=0; END IF;
  IF v_map ? 'is_active' THEN v_active:=(v_map->>'is_active')::boolean;
  ELSIF v_map_id IS NOT NULL THEN v_active:=v_row.is_active; ELSE v_active:=false; END IF;

  IF v_map_id IS NULL THEN
   INSERT INTO public.deal_variant_component_options(
    restaurant_id,deal_id,deal_variant_id,component_option_id,pricing_treatment,
    unit_surcharge,max_quantity_per_deal,sort_order,is_active
   ) VALUES(
    v_context.restaurant_id,v_deal,v_variant,v_option_id,v_treatment,
    v_surcharge,v_max_qty,v_sort,v_active
   );
  ELSE
   UPDATE public.deal_variant_component_options m
   SET pricing_treatment=v_treatment,unit_surcharge=v_surcharge,
       max_quantity_per_deal=v_max_qty,sort_order=v_sort,is_active=v_active
   WHERE m.id=v_map_id AND m.restaurant_id=v_context.restaurant_id;
  END IF;
 END LOOP;

 SELECT pg_catalog.jsonb_build_object(
  'deal_variant_id',v_variant,
  'options',COALESCE((
   SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
     'id',m.id,'component_option_id',m.component_option_id,
     'component_group_id',o.component_group_id,
     'product_id',o.product_id,'product_variant_id',o.product_variant_id,
     'pricing_treatment',m.pricing_treatment,'unit_surcharge',m.unit_surcharge,
     'max_quantity_per_deal',m.max_quantity_per_deal,'sort_order',m.sort_order,'is_active',m.is_active
    ) ORDER BY m.sort_order,m.component_option_id
   )
   FROM public.deal_variant_component_options m
   JOIN public.deal_component_options o ON o.id=m.component_option_id AND o.deal_id=m.deal_id AND o.restaurant_id=m.restaurant_id
   WHERE m.restaurant_id=v_context.restaurant_id AND m.deal_id=v_deal AND m.deal_variant_id=v_variant
  ),'[]'::jsonb)
 ) INTO v_after;

 RETURN app_private.flame_chick_catalog_command_finish(
  v_context,'deal_variant_options_upsert','deal.variant_options_upsert','deal_variant',
  v_variant,p_request_id,v_before,v_after
 );
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_deal_variant_options_upsert_internal(jsonb,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_deal_variant_options_upsert_internal(jsonb,bigint,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_deal_variant_options_upsert_internal(jsonb,bigint,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_catalog_deal_variant_options_upsert(
 p_payload jsonb,p_expected_revision bigint,p_request_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
 SELECT app_private.flame_chick_catalog_deal_variant_options_upsert_internal(p_payload,p_expected_revision,p_request_id)
$function$;

ALTER FUNCTION public.flame_chick_catalog_deal_variant_options_upsert(jsonb,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_deal_variant_options_upsert(jsonb,bigint,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_deal_variant_options_upsert(jsonb,bigint,uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Schedule set + windows aggregate upsert. Explicit removals are audited.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_schedule_set_upsert_internal(
 p_payload jsonb,p_expected_revision bigint,p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_context app_private.flame_chick_catalog_command_context;
 v_id uuid; v_name text; v_timezone text; v_active boolean;
 v_row public.catalog_schedule_sets%ROWTYPE;
 v_window jsonb; v_window_id uuid; v_window_row public.catalog_schedule_windows%ROWTYPE;
 v_kind text; v_weekday integer; v_local_start time; v_local_end time; v_all_day boolean;
 v_starts timestamptz; v_ends timestamptz; v_from date; v_to date; v_num numeric;
 v_seen uuid[]:=ARRAY[]::uuid[]; v_remove jsonb; v_remove_id uuid;
 v_before jsonb; v_after jsonb; v_count integer:=0; v_ts text;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_payload) k(key)
   WHERE k.key<>ALL(ARRAY['id','name','timezone','is_active','windows','remove_window_ids'])) THEN
  RAISE EXCEPTION 'SCHEDULE_SET_FIELD_NOT_ALLOWED' USING ERRCODE='22023';
 END IF;
 IF (p_payload ? 'id' AND p_payload->'id'<>'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'id')<>'string')
    OR (p_payload ? 'name' AND pg_catalog.jsonb_typeof(p_payload->'name')<>'string')
    OR (p_payload ? 'timezone' AND pg_catalog.jsonb_typeof(p_payload->'timezone')<>'string')
    OR (p_payload ? 'is_active' AND pg_catalog.jsonb_typeof(p_payload->'is_active')<>'boolean')
    OR (p_payload ? 'windows' AND pg_catalog.jsonb_typeof(p_payload->'windows') IS DISTINCT FROM 'array')
    OR (p_payload ? 'remove_window_ids' AND pg_catalog.jsonb_typeof(p_payload->'remove_window_ids') IS DISTINCT FROM 'array') THEN
  RAISE EXCEPTION 'SCHEDULE_SET_FIELD_TYPE_INVALID' USING ERRCODE='22023';
 END IF;
 IF p_payload ? 'windows' AND pg_catalog.jsonb_array_length(p_payload->'windows')>100 THEN RAISE EXCEPTION 'SCHEDULE_WINDOW_LIMIT' USING ERRCODE='22023'; END IF;
 IF p_payload ? 'remove_window_ids' AND pg_catalog.jsonb_array_length(p_payload->'remove_window_ids')>100 THEN RAISE EXCEPTION 'SCHEDULE_WINDOW_REMOVE_LIMIT' USING ERRCODE='22023'; END IF;

 v_context:=app_private.flame_chick_catalog_command_context('schedule_set_upsert',p_payload,p_expected_revision,p_request_id,65536);
 IF v_context.replay_response IS NOT NULL THEN RETURN pg_catalog.jsonb_set(v_context.replay_response,'{idempotent}','true'::jsonb,true); END IF;
 BEGIN v_id:=NULLIF(p_payload->>'id','')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'SCHEDULE_SET_ID_INVALID' USING ERRCODE='22023'; END;

 IF v_id IS NOT NULL THEN
  SELECT s.* INTO v_row FROM public.catalog_schedule_sets s
  WHERE s.id=v_id AND s.restaurant_id=v_context.restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SCHEDULE_SET_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  v_before:=pg_catalog.jsonb_build_object(
   'schedule_set',pg_catalog.to_jsonb(v_row),
   'windows',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(w) ORDER BY w.window_kind,w.weekday_iso,w.local_start,w.starts_at,w.id)
     FROM public.catalog_schedule_windows w WHERE w.restaurant_id=v_context.restaurant_id AND w.schedule_set_id=v_id),'[]'::jsonb)
  );
 ELSE v_before:=NULL; END IF;

 IF p_payload ? 'name' THEN v_name:=pg_catalog.btrim(p_payload->>'name');
 ELSIF v_id IS NOT NULL THEN v_name:=v_row.name; ELSE v_name:=NULL; END IF;
 IF v_name IS NULL OR pg_catalog.char_length(v_name) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'SCHEDULE_SET_NAME_REQUIRED' USING ERRCODE='22023'; END IF;
 IF p_payload ? 'timezone' THEN v_timezone:=pg_catalog.btrim(p_payload->>'timezone');
 ELSIF v_id IS NOT NULL THEN v_timezone:=v_row.timezone; ELSE v_timezone:=NULL; END IF;
 IF v_timezone IS NULL OR pg_catalog.char_length(v_timezone)>100
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names tz WHERE tz.name=v_timezone) THEN
  RAISE EXCEPTION 'CATALOG_SCHEDULE_TIMEZONE_INVALID' USING ERRCODE='22023';
 END IF;
 IF p_payload ? 'is_active' THEN v_active:=(p_payload->>'is_active')::boolean;
 ELSIF v_id IS NOT NULL THEN v_active:=v_row.is_active; ELSE v_active:=false; END IF;

 IF v_id IS NULL THEN
  INSERT INTO public.catalog_schedule_sets(restaurant_id,name,timezone,is_active)
  VALUES(v_context.restaurant_id,v_name,v_timezone,v_active) RETURNING * INTO v_row;
  v_id:=v_row.id;
 ELSE
  UPDATE public.catalog_schedule_sets s SET name=v_name,timezone=v_timezone,is_active=v_active
  WHERE s.id=v_id AND s.restaurant_id=v_context.restaurant_id RETURNING s.* INTO v_row;
 END IF;

 IF p_payload ? 'windows' THEN
  FOR v_window IN SELECT x.value FROM pg_catalog.jsonb_array_elements(p_payload->'windows') x(value)
  LOOP
   IF pg_catalog.jsonb_typeof(v_window)<>'object'
     OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(v_window) k(key)
       WHERE k.key<>ALL(ARRAY['id','window_kind','weekday_iso','local_start','local_end','is_all_day','starts_at','ends_at','effective_from','effective_to'])) THEN
    RAISE EXCEPTION 'SCHEDULE_WINDOW_FIELDS_INVALID' USING ERRCODE='22023';
   END IF;
   IF (v_window ? 'id' AND v_window->'id'<>'null'::jsonb AND pg_catalog.jsonb_typeof(v_window->'id')<>'string')
      OR (v_window ? 'window_kind' AND pg_catalog.jsonb_typeof(v_window->'window_kind')<>'string')
      OR (v_window ? 'weekday_iso' AND v_window->'weekday_iso'<>'null'::jsonb AND pg_catalog.jsonb_typeof(v_window->'weekday_iso')<>'number')
      OR (v_window ? 'local_start' AND v_window->'local_start'<>'null'::jsonb AND pg_catalog.jsonb_typeof(v_window->'local_start')<>'string')
      OR (v_window ? 'local_end' AND v_window->'local_end'<>'null'::jsonb AND pg_catalog.jsonb_typeof(v_window->'local_end')<>'string')
      OR (v_window ? 'is_all_day' AND pg_catalog.jsonb_typeof(v_window->'is_all_day')<>'boolean')
      OR (v_window ? 'starts_at' AND v_window->'starts_at'<>'null'::jsonb AND pg_catalog.jsonb_typeof(v_window->'starts_at')<>'string')
      OR (v_window ? 'ends_at' AND v_window->'ends_at'<>'null'::jsonb AND pg_catalog.jsonb_typeof(v_window->'ends_at')<>'string')
      OR (v_window ? 'effective_from' AND v_window->'effective_from'<>'null'::jsonb AND pg_catalog.jsonb_typeof(v_window->'effective_from')<>'string')
      OR (v_window ? 'effective_to' AND v_window->'effective_to'<>'null'::jsonb AND pg_catalog.jsonb_typeof(v_window->'effective_to')<>'string') THEN
    RAISE EXCEPTION 'SCHEDULE_WINDOW_FIELD_TYPE_INVALID' USING ERRCODE='22023';
   END IF;
   v_window_id:=NULL;
   IF v_window ? 'id' AND v_window->'id'<>'null'::jsonb THEN
    BEGIN v_window_id:=(v_window->>'id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'SCHEDULE_WINDOW_ID_INVALID' USING ERRCODE='22023'; END;
    IF v_window_id=ANY(v_seen) THEN RAISE EXCEPTION 'SCHEDULE_WINDOW_ID_DUPLICATED' USING ERRCODE='22023'; END IF;
    v_seen:=pg_catalog.array_append(v_seen,v_window_id);
    SELECT w.* INTO v_window_row FROM public.catalog_schedule_windows w
    WHERE w.id=v_window_id AND w.restaurant_id=v_context.restaurant_id AND w.schedule_set_id=v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SCHEDULE_WINDOW_NOT_FOUND' USING ERRCODE='P0002'; END IF;
   END IF;

   IF v_window ? 'window_kind' THEN v_kind:=v_window->>'window_kind';
   ELSIF v_window_id IS NOT NULL THEN v_kind:=v_window_row.window_kind; ELSE v_kind:=NULL; END IF;
   IF v_kind NOT IN ('WEEKLY','ONE_OFF') THEN RAISE EXCEPTION 'SCHEDULE_WINDOW_KIND_REQUIRED' USING ERRCODE='22023'; END IF;

   IF v_kind='WEEKLY' THEN
    IF v_window ? 'weekday_iso' THEN
     BEGIN v_num:=(v_window->>'weekday_iso')::numeric;
     EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'SCHEDULE_WEEKDAY_INVALID' USING ERRCODE='22023'; END;
     IF pg_catalog.scale(v_num)<>0 OR v_num<1 OR v_num>7 THEN RAISE EXCEPTION 'SCHEDULE_WEEKDAY_INVALID' USING ERRCODE='22023'; END IF;
     v_weekday:=v_num::integer;
    ELSIF v_window_id IS NOT NULL THEN v_weekday:=v_window_row.weekday_iso; ELSE v_weekday:=NULL; END IF;

    IF v_window ? 'is_all_day' THEN v_all_day:=(v_window->>'is_all_day')::boolean;
    ELSIF v_window_id IS NOT NULL THEN v_all_day:=v_window_row.is_all_day; ELSE v_all_day:=false; END IF;
    IF v_window ? 'local_start' THEN v_local_start:=NULLIF(v_window->>'local_start','')::time;
    ELSIF v_window_id IS NOT NULL THEN v_local_start:=v_window_row.local_start; ELSE v_local_start:=NULL; END IF;
    IF v_window ? 'local_end' THEN v_local_end:=NULLIF(v_window->>'local_end','')::time;
    ELSIF v_window_id IS NOT NULL THEN v_local_end:=v_window_row.local_end; ELSE v_local_end:=NULL; END IF;
    IF v_all_day THEN
     v_local_start:=NULL; v_local_end:=NULL;
    ELSIF v_weekday IS NULL OR v_local_start IS NULL OR v_local_end IS NULL OR v_local_start=v_local_end THEN
     RAISE EXCEPTION 'SCHEDULE_WEEKLY_WINDOW_SHAPE_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_window ? 'effective_from' THEN v_from:=NULLIF(v_window->>'effective_from','')::date;
    ELSIF v_window_id IS NOT NULL THEN v_from:=v_window_row.effective_from; ELSE v_from:=NULL; END IF;
    IF v_window ? 'effective_to' THEN v_to:=NULLIF(v_window->>'effective_to','')::date;
    ELSIF v_window_id IS NOT NULL THEN v_to:=v_window_row.effective_to; ELSE v_to:=NULL; END IF;
    IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_from>v_to THEN RAISE EXCEPTION 'SCHEDULE_EFFECTIVE_RANGE_INVALID' USING ERRCODE='22023'; END IF;
    v_starts:=NULL; v_ends:=NULL;
   ELSE
    v_weekday:=NULL; v_local_start:=NULL; v_local_end:=NULL; v_all_day:=false; v_from:=NULL; v_to:=NULL;
    IF v_window ? 'starts_at' THEN v_ts:=v_window->>'starts_at';
    ELSIF v_window_id IS NOT NULL THEN v_ts:=v_window_row.starts_at::text; ELSE v_ts:=NULL; END IF;
    IF v_window ? 'ends_at' THEN v_ts:=v_window->>'ends_at';
    ELSIF v_window_id IS NOT NULL THEN v_ts:=v_window_row.ends_at::text; ELSE v_ts:=NULL; END IF;
    -- Parse each explicitly below (preserving offsets supplied by caller).
    IF v_window ? 'starts_at' THEN
      IF (v_window->>'starts_at') !~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN RAISE EXCEPTION 'SCHEDULE_ONE_OFF_OFFSET_REQUIRED' USING ERRCODE='22023'; END IF;
      v_starts:=(v_window->>'starts_at')::timestamptz;
    ELSIF v_window_id IS NOT NULL THEN v_starts:=v_window_row.starts_at; ELSE v_starts:=NULL; END IF;
    IF v_window ? 'ends_at' THEN
      IF (v_window->>'ends_at') !~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN RAISE EXCEPTION 'SCHEDULE_ONE_OFF_OFFSET_REQUIRED' USING ERRCODE='22023'; END IF;
      v_ends:=(v_window->>'ends_at')::timestamptz;
    ELSIF v_window_id IS NOT NULL THEN v_ends:=v_window_row.ends_at; ELSE v_ends:=NULL; END IF;
    IF v_starts IS NULL OR v_ends IS NULL OR v_ends<=v_starts THEN RAISE EXCEPTION 'SCHEDULE_ONE_OFF_RANGE_INVALID' USING ERRCODE='22023'; END IF;
   END IF;

   IF v_window_id IS NULL THEN
    INSERT INTO public.catalog_schedule_windows(
     restaurant_id,schedule_set_id,window_kind,weekday_iso,local_start,local_end,is_all_day,
     starts_at,ends_at,effective_from,effective_to
    ) VALUES(
     v_context.restaurant_id,v_id,v_kind,v_weekday,v_local_start,v_local_end,v_all_day,
     v_starts,v_ends,v_from,v_to
    );
   ELSE
    UPDATE public.catalog_schedule_windows w
    SET window_kind=v_kind,weekday_iso=v_weekday,local_start=v_local_start,local_end=v_local_end,
        is_all_day=v_all_day,starts_at=v_starts,ends_at=v_ends,effective_from=v_from,effective_to=v_to
    WHERE w.id=v_window_id AND w.restaurant_id=v_context.restaurant_id AND w.schedule_set_id=v_id;
   END IF;
  END LOOP;
 END IF;

 IF p_payload ? 'remove_window_ids' THEN
  FOR v_remove IN SELECT x.value FROM pg_catalog.jsonb_array_elements(p_payload->'remove_window_ids') x(value)
  LOOP
   IF pg_catalog.jsonb_typeof(v_remove)<>'string' THEN RAISE EXCEPTION 'SCHEDULE_WINDOW_REMOVE_ID_INVALID' USING ERRCODE='22023'; END IF;
   BEGIN v_remove_id:=v_remove::text::uuid;
   EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'SCHEDULE_WINDOW_REMOVE_ID_INVALID' USING ERRCODE='22023'; END;
   IF v_remove_id=ANY(v_seen) THEN RAISE EXCEPTION 'SCHEDULE_WINDOW_REMOVE_DUPLICATED' USING ERRCODE='22023'; END IF;
   v_seen:=pg_catalog.array_append(v_seen,v_remove_id);
   DELETE FROM public.catalog_schedule_windows w
   WHERE w.id=v_remove_id AND w.restaurant_id=v_context.restaurant_id AND w.schedule_set_id=v_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'SCHEDULE_WINDOW_REMOVE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  END LOOP;
 END IF;

 SELECT pg_catalog.jsonb_build_object(
  'schedule_set',pg_catalog.to_jsonb(s),
  'windows',COALESCE((
   SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(w) ORDER BY w.window_kind,w.weekday_iso,w.local_start,w.starts_at,w.id)
   FROM public.catalog_schedule_windows w
   WHERE w.restaurant_id=v_context.restaurant_id AND w.schedule_set_id=v_id
  ),'[]'::jsonb)
 ) INTO v_after
 FROM public.catalog_schedule_sets s
 WHERE s.id=v_id AND s.restaurant_id=v_context.restaurant_id;

 RETURN app_private.flame_chick_catalog_command_finish(
  v_context,'schedule_set_upsert','schedule_set.upsert','schedule_set',v_id,p_request_id,v_before,v_after
 );
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_schedule_set_upsert_internal(jsonb,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_schedule_set_upsert_internal(jsonb,bigint,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_schedule_set_upsert_internal(jsonb,bigint,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_catalog_schedule_set_upsert(
 p_payload jsonb,p_expected_revision bigint,p_request_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
 SELECT app_private.flame_chick_catalog_schedule_set_upsert_internal(p_payload,p_expected_revision,p_request_id)
$function$;

ALTER FUNCTION public.flame_chick_catalog_schedule_set_upsert(jsonb,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_schedule_set_upsert(jsonb,bigint,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_schedule_set_upsert(jsonb,bigint,uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Deal schedule precedence and branch availability commands
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_deal_schedule_assignment_upsert_internal(
 p_payload jsonb,p_expected_revision bigint,p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_context app_private.flame_chick_catalog_command_context;
 v_id uuid; v_deal uuid; v_branch uuid; v_schedule uuid;
 v_active boolean; v_row public.deal_schedule_assignments%ROWTYPE;
 v_before jsonb; v_after jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_payload) k(key)
  WHERE k.key<>ALL(ARRAY['id','deal_id','branch_id','schedule_set_id','is_active'])) THEN
  RAISE EXCEPTION 'DEAL_SCHEDULE_ASSIGNMENT_FIELD_NOT_ALLOWED' USING ERRCODE='22023';
 END IF;
 IF (p_payload ? 'id' AND p_payload->'id'<>'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'id')<>'string')
  OR (p_payload ? 'deal_id' AND pg_catalog.jsonb_typeof(p_payload->'deal_id')<>'string')
  OR (p_payload ? 'branch_id' AND p_payload->'branch_id'<>'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'branch_id')<>'string')
  OR (p_payload ? 'schedule_set_id' AND pg_catalog.jsonb_typeof(p_payload->'schedule_set_id')<>'string')
  OR (p_payload ? 'is_active' AND pg_catalog.jsonb_typeof(p_payload->'is_active')<>'boolean') THEN
  RAISE EXCEPTION 'DEAL_SCHEDULE_ASSIGNMENT_FIELD_TYPE_INVALID' USING ERRCODE='22023';
 END IF;
 v_context:=app_private.flame_chick_catalog_command_context('deal_schedule_assignment_upsert',p_payload,p_expected_revision,p_request_id,16384);
 IF v_context.replay_response IS NOT NULL THEN RETURN pg_catalog.jsonb_set(v_context.replay_response,'{idempotent}','true'::jsonb,true); END IF;
 BEGIN v_id:=NULLIF(p_payload->>'id','')::uuid; v_deal:=(p_payload->>'deal_id')::uuid; v_schedule:=(p_payload->>'schedule_set_id')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DEAL_SCHEDULE_ASSIGNMENT_ID_INVALID' USING ERRCODE='22023'; END;
 IF v_id IS NOT NULL THEN
  SELECT a.* INTO v_row FROM public.deal_schedule_assignments a
  WHERE a.id=v_id AND a.restaurant_id=v_context.restaurant_id AND a.deal_id=v_deal
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEAL_SCHEDULE_ASSIGNMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 END IF;
 IF p_payload ? 'branch_id' THEN
  IF p_payload->'branch_id'='null'::jsonb THEN v_branch:=NULL;
  ELSE BEGIN v_branch:=(p_payload->>'branch_id')::uuid;
       EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DEAL_SCHEDULE_BRANCH_ID_INVALID' USING ERRCODE='22023'; END; END IF;
 ELSIF v_id IS NOT NULL THEN v_branch:=v_row.branch_id;
 ELSE v_branch:=NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.deals d WHERE d.id=v_deal AND d.restaurant_id=v_context.restaurant_id)
  OR NOT EXISTS(SELECT 1 FROM public.catalog_schedule_sets s WHERE s.id=v_schedule AND s.restaurant_id=v_context.restaurant_id) THEN
  RAISE EXCEPTION 'DEAL_SCHEDULE_ASSIGNMENT_TARGET_MISMATCH' USING ERRCODE='23503';
 END IF;
 IF v_branch IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=v_branch AND b.restaurant_id=v_context.restaurant_id) THEN
  RAISE EXCEPTION 'DEAL_SCHEDULE_BRANCH_MISMATCH' USING ERRCODE='23503';
 END IF;
 IF v_id IS NOT NULL THEN
  SELECT a.* INTO v_row FROM public.deal_schedule_assignments a
  WHERE a.id=v_id AND a.restaurant_id=v_context.restaurant_id AND a.deal_id=v_deal FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEAL_SCHEDULE_ASSIGNMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 ELSIF v_branch IS NULL THEN
  SELECT a.* INTO v_row FROM public.deal_schedule_assignments a
  WHERE a.restaurant_id=v_context.restaurant_id AND a.deal_id=v_deal AND a.branch_id IS NULL FOR UPDATE;
 ELSE
  SELECT a.* INTO v_row FROM public.deal_schedule_assignments a
  WHERE a.restaurant_id=v_context.restaurant_id AND a.deal_id=v_deal AND a.branch_id=v_branch FOR UPDATE;
 END IF;
 IF v_row.id IS NOT NULL THEN v_id:=v_row.id; v_before:=pg_catalog.to_jsonb(v_row); ELSE v_id:=NULL; v_before:=NULL; END IF;
 IF p_payload ? 'is_active' THEN v_active:=(p_payload->>'is_active')::boolean;
 ELSIF v_id IS NOT NULL THEN v_active:=v_row.is_active; ELSE v_active:=true; END IF;
 IF v_id IS NULL THEN
  INSERT INTO public.deal_schedule_assignments(restaurant_id,deal_id,branch_id,schedule_set_id,is_active)
  VALUES(v_context.restaurant_id,v_deal,v_branch,v_schedule,v_active) RETURNING * INTO v_row;
  v_id:=v_row.id;
 ELSE
  UPDATE public.deal_schedule_assignments a SET branch_id=v_branch,schedule_set_id=v_schedule,is_active=v_active
  WHERE a.id=v_id AND a.restaurant_id=v_context.restaurant_id RETURNING a.* INTO v_row;
 END IF;
 v_after:=pg_catalog.to_jsonb(v_row);
 RETURN app_private.flame_chick_catalog_command_finish(
  v_context,'deal_schedule_assignment_upsert','deal.schedule_assignment_upsert','deal_schedule_assignment',
  v_id,p_request_id,v_before,v_after
 );
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_deal_schedule_assignment_upsert_internal(jsonb,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_deal_schedule_assignment_upsert_internal(jsonb,bigint,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_deal_schedule_assignment_upsert_internal(jsonb,bigint,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_catalog_deal_schedule_assignment_upsert(
 p_payload jsonb,p_expected_revision bigint,p_request_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
 SELECT app_private.flame_chick_catalog_deal_schedule_assignment_upsert_internal(p_payload,p_expected_revision,p_request_id)
$function$;

ALTER FUNCTION public.flame_chick_catalog_deal_schedule_assignment_upsert(jsonb,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_deal_schedule_assignment_upsert(jsonb,bigint,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_deal_schedule_assignment_upsert(jsonb,bigint,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_deal_branch_availability_upsert_internal(
 p_payload jsonb,p_expected_revision bigint,p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_context app_private.flame_chick_catalog_command_context;
 v_deal uuid; v_branch uuid; v_id uuid; v_available boolean;
 v_row public.branch_deal_availability%ROWTYPE;
 v_before jsonb; v_after jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_payload) k(key)
  WHERE k.key<>ALL(ARRAY['id','deal_id','branch_id','is_available'])) THEN
  RAISE EXCEPTION 'DEAL_BRANCH_AVAILABILITY_FIELD_NOT_ALLOWED' USING ERRCODE='22023';
 END IF;
 IF (p_payload ? 'id' AND p_payload->'id'<>'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'id')<>'string')
  OR (p_payload ? 'deal_id' AND pg_catalog.jsonb_typeof(p_payload->'deal_id')<>'string')
  OR (p_payload ? 'branch_id' AND pg_catalog.jsonb_typeof(p_payload->'branch_id')<>'string')
  OR (p_payload ? 'is_available' AND pg_catalog.jsonb_typeof(p_payload->'is_available')<>'boolean') THEN
  RAISE EXCEPTION 'DEAL_BRANCH_AVAILABILITY_FIELD_TYPE_INVALID' USING ERRCODE='22023';
 END IF;
 v_context:=app_private.flame_chick_catalog_command_context('deal_branch_availability_upsert',p_payload,p_expected_revision,p_request_id,8192);
 IF v_context.replay_response IS NOT NULL THEN RETURN pg_catalog.jsonb_set(v_context.replay_response,'{idempotent}','true'::jsonb,true); END IF;
 BEGIN v_id:=NULLIF(p_payload->>'id','')::uuid; v_deal:=(p_payload->>'deal_id')::uuid; v_branch:=(p_payload->>'branch_id')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DEAL_BRANCH_AVAILABILITY_ID_INVALID' USING ERRCODE='22023'; END;
 IF NOT EXISTS(SELECT 1 FROM public.deals d WHERE d.id=v_deal AND d.restaurant_id=v_context.restaurant_id)
  OR NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=v_branch AND b.restaurant_id=v_context.restaurant_id) THEN
  RAISE EXCEPTION 'DEAL_BRANCH_AVAILABILITY_TARGET_MISMATCH' USING ERRCODE='23503';
 END IF;
 IF p_payload ? 'is_available' THEN v_available:=(p_payload->>'is_available')::boolean;
 ELSE RAISE EXCEPTION 'DEAL_BRANCH_AVAILABILITY_VALUE_REQUIRED' USING ERRCODE='22023'; END IF;
 IF v_id IS NOT NULL THEN
  SELECT a.* INTO v_row FROM public.branch_deal_availability a
  WHERE a.id=v_id AND a.restaurant_id=v_context.restaurant_id AND a.deal_id=v_deal AND a.branch_id=v_branch FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEAL_BRANCH_AVAILABILITY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 ELSE
  SELECT a.* INTO v_row FROM public.branch_deal_availability a
  WHERE a.restaurant_id=v_context.restaurant_id AND a.deal_id=v_deal AND a.branch_id=v_branch FOR UPDATE;
 END IF;
 IF v_row.id IS NOT NULL THEN v_id:=v_row.id; v_before:=pg_catalog.to_jsonb(v_row); ELSE v_before:=NULL; END IF;
 IF v_id IS NULL THEN
  INSERT INTO public.branch_deal_availability(restaurant_id,deal_id,branch_id,is_available)
  VALUES(v_context.restaurant_id,v_deal,v_branch,v_available) RETURNING * INTO v_row;
  v_id:=v_row.id;
 ELSE
  UPDATE public.branch_deal_availability a SET is_available=v_available
  WHERE a.id=v_id AND a.restaurant_id=v_context.restaurant_id RETURNING a.* INTO v_row;
 END IF;
 v_after:=pg_catalog.to_jsonb(v_row);
 RETURN app_private.flame_chick_catalog_command_finish(
  v_context,'deal_branch_availability_upsert','deal.branch_availability_upsert','branch_deal_availability',
  v_id,p_request_id,v_before,v_after
 );
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_deal_branch_availability_upsert_internal(jsonb,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_deal_branch_availability_upsert_internal(jsonb,bigint,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_deal_branch_availability_upsert_internal(jsonb,bigint,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_catalog_deal_branch_availability_upsert(
 p_payload jsonb,p_expected_revision bigint,p_request_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
 SELECT app_private.flame_chick_catalog_deal_branch_availability_upsert_internal(p_payload,p_expected_revision,p_request_id)
$function$;

ALTER FUNCTION public.flame_chick_catalog_deal_branch_availability_upsert(jsonb,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_deal_branch_availability_upsert(jsonb,bigint,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_deal_branch_availability_upsert(jsonb,bigint,uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Bounded deal detail read (one deal, including variant pricing mappings)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_deal_detail_read_internal(p_deal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
 v_actor uuid; v_restaurant uuid; v_revision bigint; v_result jsonb;
BEGIN
 IF p_deal_id IS NULL THEN RAISE EXCEPTION 'DEAL_ID_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT a.actor_user_id,a.restaurant_id INTO v_actor,v_restaurant
 FROM app_private.flame_chick_catalog_actor() a;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'CATALOG_ADMIN_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.deals d WHERE d.id=p_deal_id AND d.restaurant_id=v_restaurant) THEN
  RAISE EXCEPTION 'DEAL_NOT_FOUND' USING ERRCODE='P0002';
 END IF;
 SELECT s.revision INTO v_revision FROM public.catalog_draft_state s WHERE s.restaurant_id=v_restaurant;

 WITH option_docs AS (
  SELECT o.component_group_id,
   pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',o.id,'product_id',o.product_id,'product_variant_id',o.product_variant_id,
    'product_name_en',p.name_en,'product_name_ur',p.name_ur,
    'variant_key',pv.size_key,'variant_label',pv.size_label,'variant_price',pv.price,
    'sort_order',o.sort_order,'is_active',o.is_active
   ) ORDER BY o.sort_order,pv.size_key,pv.id) options
  FROM public.deal_component_options o
  JOIN public.product_variants pv ON pv.id=o.product_variant_id AND pv.restaurant_id=o.restaurant_id AND pv.product_id=o.product_id
  JOIN public.products p ON p.id=o.product_id AND p.restaurant_id=o.restaurant_id
  WHERE o.restaurant_id=v_restaurant AND o.deal_id=p_deal_id
  GROUP BY o.component_group_id
 ),
 group_docs AS (
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'group',pg_catalog.to_jsonb(g),'options',COALESCE(od.options,'[]'::jsonb)
   ) ORDER BY g.sort_order,g.id) groups
  FROM public.deal_component_groups g
  LEFT JOIN option_docs od ON od.component_group_id=g.id
  WHERE g.restaurant_id=v_restaurant AND g.deal_id=p_deal_id
 ),
 map_docs AS (
  SELECT m.deal_variant_id,
   pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',m.id,'component_option_id',m.component_option_id,
    'component_group_id',o.component_group_id,
    'product_id',o.product_id,'product_variant_id',o.product_variant_id,
    'pricing_treatment',m.pricing_treatment,'unit_surcharge',m.unit_surcharge,
    'max_quantity_per_deal',m.max_quantity_per_deal,'sort_order',m.sort_order,'is_active',m.is_active
   ) ORDER BY m.sort_order,m.component_option_id) options
  FROM public.deal_variant_component_options m
  JOIN public.deal_component_options o ON o.id=m.component_option_id AND o.deal_id=m.deal_id AND o.restaurant_id=m.restaurant_id
  WHERE m.restaurant_id=v_restaurant AND m.deal_id=p_deal_id
  GROUP BY m.deal_variant_id
 ),
 variant_docs AS (
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'variant',pg_catalog.to_jsonb(v),'allowed_options',COALESCE(md.options,'[]'::jsonb)
   ) ORDER BY v.sort_order,v.variant_key,v.id) variants
  FROM public.deal_variants v
  LEFT JOIN map_docs md ON md.deal_variant_id=v.id
  WHERE v.restaurant_id=v_restaurant AND v.deal_id=p_deal_id
 ),
 schedule_docs AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY a.branch_id NULLS FIRST,a.id),'[]'::jsonb) assignments
  FROM public.deal_schedule_assignments a
  WHERE a.restaurant_id=v_restaurant AND a.deal_id=p_deal_id
 ),
 branch_docs AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'branch_id',a.branch_id,'branch_name',b.name,'is_available',a.is_available
   ) ORDER BY b.name,b.id),'[]'::jsonb) availability
  FROM public.branch_deal_availability a
  JOIN public.branches b ON b.id=a.branch_id AND b.restaurant_id=a.restaurant_id
  WHERE a.restaurant_id=v_restaurant AND a.deal_id=p_deal_id
 )
 SELECT pg_catalog.jsonb_build_object(
  'ok',true,'draft_revision',COALESCE(v_revision,0),
  'deal',pg_catalog.to_jsonb(d),
  'collection',pg_catalog.jsonb_build_object(
    'id',c.id,'name_en',c.name_en,'name_ur',c.name_ur,'category_id',c.category_id,
    'schedule_set_id',c.schedule_set_id,'is_active',c.is_active
  ),
  'component_groups',COALESCE(gd.groups,'[]'::jsonb),
  'variants',COALESCE(vd.variants,'[]'::jsonb),
  'schedule_assignments',sd.assignments,
  'branch_availability',bd.availability
 )
 INTO v_result
 FROM public.deals d
 JOIN public.deal_collections c ON c.id=d.collection_id AND c.restaurant_id=d.restaurant_id
 CROSS JOIN group_docs gd
 CROSS JOIN variant_docs vd
 CROSS JOIN schedule_docs sd
 CROSS JOIN branch_docs bd
 WHERE d.id=p_deal_id AND d.restaurant_id=v_restaurant;

 RETURN v_result;
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_deal_detail_read_internal(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_deal_detail_read_internal(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_deal_detail_read_internal(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_catalog_deal_detail_read(p_deal_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
 SELECT app_private.flame_chick_catalog_deal_detail_read_internal(p_deal_id)
$function$;

ALTER FUNCTION public.flame_chick_catalog_deal_detail_read(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_deal_detail_read(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_deal_detail_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_schedule_detail_read_internal(p_schedule_set_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid;v_restaurant uuid;v_revision bigint;v_result jsonb;
BEGIN
 IF p_schedule_set_id IS NULL THEN RAISE EXCEPTION 'SCHEDULE_SET_ID_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT a.actor_user_id,a.restaurant_id INTO v_actor,v_restaurant FROM app_private.flame_chick_catalog_actor() a;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'CATALOG_ADMIN_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT s.revision INTO v_revision FROM public.catalog_draft_state s WHERE s.restaurant_id=v_restaurant;
 SELECT pg_catalog.jsonb_build_object(
  'ok',true,'draft_revision',COALESCE(v_revision,0),
  'schedule_set',pg_catalog.to_jsonb(s),
  'windows',COALESCE((
   SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(w) ORDER BY w.window_kind,w.weekday_iso,w.local_start,w.starts_at,w.id)
   FROM public.catalog_schedule_windows w
   WHERE w.restaurant_id=v_restaurant AND w.schedule_set_id=s.id
  ),'[]'::jsonb)
 ) INTO v_result
 FROM public.catalog_schedule_sets s
 WHERE s.id=p_schedule_set_id AND s.restaurant_id=v_restaurant;
 IF v_result IS NULL THEN RAISE EXCEPTION 'SCHEDULE_SET_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN v_result;
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_schedule_detail_read_internal(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_schedule_detail_read_internal(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_schedule_detail_read_internal(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_catalog_schedule_detail_read(p_schedule_set_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
 SELECT app_private.flame_chick_catalog_schedule_detail_read_internal(p_schedule_set_id)
$function$;

ALTER FUNCTION public.flame_chick_catalog_schedule_detail_read(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_schedule_detail_read(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_schedule_detail_read(uuid) TO authenticated;

-- Verify least privilege and function security.
DO $verify$
DECLARE v_sig text;
BEGIN
 FOREACH v_sig IN ARRAY ARRAY[
  'public.flame_chick_catalog_deal_collection_read(uuid,integer)',
  'public.flame_chick_catalog_deal_collection_upsert(jsonb,bigint,uuid)',
  'public.flame_chick_catalog_deal_upsert(jsonb,bigint,uuid)',
  'public.flame_chick_catalog_deal_components_upsert(jsonb,bigint,uuid)',
  'public.flame_chick_catalog_deal_variant_options_upsert(jsonb,bigint,uuid)',
  'public.flame_chick_catalog_schedule_set_upsert(jsonb,bigint,uuid)',
  'public.flame_chick_catalog_deal_schedule_assignment_upsert(jsonb,bigint,uuid)',
  'public.flame_chick_catalog_deal_branch_availability_upsert(jsonb,bigint,uuid)',
  'public.flame_chick_catalog_deal_detail_read(uuid)',
  'public.flame_chick_catalog_schedule_detail_read(uuid)'
 ] LOOP
  IF (SELECT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid=v_sig::regprocedure) THEN
   RAISE EXCEPTION 'DEAL_COMMAND_PUBLIC_WRAPPER_MUST_BE_INVOKER';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated',v_sig::regprocedure,'EXECUTE')
     OR pg_catalog.has_function_privilege('anon',v_sig::regprocedure,'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role',v_sig::regprocedure,'EXECUTE') THEN
   RAISE EXCEPTION 'DEAL_COMMAND_PUBLIC_WRAPPER_GRANTS_INVALID';
  END IF;
 END LOOP;

 FOREACH v_sig IN ARRAY ARRAY[
  'app_private.flame_chick_catalog_command_context(text,jsonb,bigint,uuid,integer)',
  'app_private.flame_chick_catalog_command_finish(app_private.flame_chick_catalog_command_context,text,text,text,uuid,uuid,jsonb,jsonb)',
  'app_private.flame_chick_catalog_deal_collection_upsert_internal(jsonb,bigint,uuid)',
  'app_private.flame_chick_catalog_deal_upsert_internal(jsonb,bigint,uuid)',
  'app_private.flame_chick_catalog_deal_components_upsert_internal(jsonb,bigint,uuid)',
  'app_private.flame_chick_catalog_deal_variant_options_upsert_internal(jsonb,bigint,uuid)',
  'app_private.flame_chick_catalog_schedule_set_upsert_internal(jsonb,bigint,uuid)',
  'app_private.flame_chick_catalog_deal_schedule_assignment_upsert_internal(jsonb,bigint,uuid)',
  'app_private.flame_chick_catalog_deal_branch_availability_upsert_internal(jsonb,bigint,uuid)',
  'app_private.flame_chick_catalog_deal_detail_read_internal(uuid)',
  'app_private.flame_chick_catalog_schedule_detail_read_internal(uuid)'
 ] LOOP
  IF NOT EXISTS(
   SELECT 1 FROM pg_catalog.pg_proc p
   WHERE p.oid=v_sig::regprocedure
    AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
    AND (
     (v_sig LIKE 'app_private.flame_chick_catalog_command_context%' OR v_sig LIKE 'app_private.flame_chick_catalog_command_finish%')
       AND NOT p.prosecdef
      OR (v_sig NOT LIKE 'app_private.flame_chick_catalog_command_context%' AND v_sig NOT LIKE 'app_private.flame_chick_catalog_command_finish%')
       AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
    )
  ) THEN RAISE EXCEPTION 'DEAL_COMMAND_INTERNAL_SECURITY_INVALID'; END IF;
 END LOOP;

 IF pg_catalog.has_table_privilege('authenticated','public.deal_collections','INSERT')
  OR pg_catalog.has_table_privilege('authenticated','public.deals','INSERT')
  OR pg_catalog.has_table_privilege('authenticated','public.deal_variants','INSERT')
  OR pg_catalog.has_table_privilege('authenticated','public.deal_component_groups','INSERT')
  OR pg_catalog.has_table_privilege('authenticated','public.deal_component_options','INSERT')
  OR pg_catalog.has_table_privilege('authenticated','public.deal_variant_component_options','INSERT')
  OR pg_catalog.has_table_privilege('authenticated','public.catalog_schedule_sets','INSERT')
  OR pg_catalog.has_table_privilege('authenticated','public.catalog_schedule_windows','INSERT')
  OR pg_catalog.has_table_privilege('authenticated','public.deal_schedule_assignments','INSERT')
  OR pg_catalog.has_table_privilege('authenticated','public.branch_deal_availability','INSERT')
  OR pg_catalog.has_table_privilege('authenticated','app_private.catalog_command_idempotency','SELECT') THEN
  RAISE EXCEPTION 'DEAL_COMMAND_DIRECT_TABLE_GRANT_LEAK';
 END IF;
END;
$verify$;

COMMIT;
