-- Reconciles the production-applied delivery configuration command into source control.
-- Remote version: 20261124142950. Already applied; do not reapply to Production.
CREATE OR REPLACE FUNCTION app_private.flame_chick_delivery_configuration_command_internal(
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_action text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_action,'')));
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_actor uuid := auth.uid();
  v_restaurant_id uuid;
  v_actor_role text;
  v_branch_id uuid;
  v_branch_name text;
  v_area_id uuid;
  v_name text;
  v_name_ur text;
  v_fee numeric;
  v_sort integer;
  v_active boolean;
  v_area public.delivery_areas%ROWTYPE;
  v_settings public.branch_delivery_settings%ROWTYPE;
  v_num numeric;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'DELIVERY_CONFIG_AUTH_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF pg_catalog.jsonb_typeof(v_payload)<>'object'
     OR pg_catalog.octet_length(v_payload::text)>12000 THEN
    RAISE EXCEPTION 'DELIVERY_CONFIG_PAYLOAD_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT r.id INTO v_restaurant_id
  FROM public.restaurants r
  WHERE r.slug='flame-chick' AND r.is_active
  LIMIT 1;
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'DELIVERY_CONFIG_TENANT_NOT_ACTIVE' USING ERRCODE='P0001';
  END IF;

  SELECT ur.role_key INTO v_actor_role
  FROM public.user_profiles up
  JOIN auth.users au ON au.id=up.user_id AND au.deleted_at IS NULL
  JOIN public.user_roles ur ON ur.user_id=up.user_id
  WHERE up.user_id=v_actor AND up.is_active
    AND ur.restaurant_id=v_restaurant_id AND ur.is_active
    AND ur.role_key IN ('admin','owner') AND ur.branch_id IS NULL
  ORDER BY CASE ur.role_key WHEN 'admin' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'DELIVERY_CONFIG_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;

  IF v_action NOT IN ('list','area_upsert','default_fee_set') THEN
    RAISE EXCEPTION 'DELIVERY_CONFIG_ACTION_INVALID' USING ERRCODE='22023';
  END IF;

  IF (v_action='list' AND EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_object_keys(v_payload) k(key)
        WHERE k.key<>ALL(ARRAY['branch_id'])
      ))
     OR (v_action='area_upsert' AND EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_object_keys(v_payload) k(key)
        WHERE k.key<>ALL(ARRAY['branch_id','area_id','name','name_ur','delivery_fee','sort_order','is_active'])
      ))
     OR (v_action='default_fee_set' AND EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_object_keys(v_payload) k(key)
        WHERE k.key<>ALL(ARRAY['branch_id','delivery_fee'])
      )) THEN
    RAISE EXCEPTION 'DELIVERY_CONFIG_FIELD_NOT_ALLOWED' USING ERRCODE='22023';
  END IF;

  BEGIN
    v_branch_id := (v_payload->>'branch_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'DELIVERY_CONFIG_BRANCH_ID_INVALID' USING ERRCODE='22023';
  END;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'DELIVERY_CONFIG_BRANCH_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT b.name INTO v_branch_name
  FROM public.branches b
  WHERE b.id=v_branch_id AND b.restaurant_id=v_restaurant_id AND b.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELIVERY_CONFIG_BRANCH_UNAVAILABLE' USING ERRCODE='P0002';
  END IF;

  IF v_action='list' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,
      'branch_id',v_branch_id,
      'branch_name',v_branch_name,
      'areas',coalesce((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id',a.id,'name',a.name,'name_ur',a.name_ur,
            'delivery_fee',a.delivery_fee,'sort_order',a.sort_order,
            'is_active',a.is_active,'created_at',a.created_at,'updated_at',a.updated_at
          ) ORDER BY a.sort_order,a.name,a.id
        )
        FROM public.delivery_areas a
        WHERE a.restaurant_id=v_restaurant_id AND a.branch_id=v_branch_id
      ),'[]'::jsonb),
      'not_listed_delivery_fee',(
        SELECT s.not_listed_delivery_fee
        FROM public.branch_delivery_settings s
        WHERE s.restaurant_id=v_restaurant_id AND s.branch_id=v_branch_id
      )
    );
  END IF;

  IF v_action='area_upsert' THEN
    IF pg_catalog.jsonb_typeof(v_payload->'name') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_payload->'delivery_fee') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'DELIVERY_CONFIG_AREA_FIELDS_REQUIRED' USING ERRCODE='22023';
    END IF;
    v_name:=pg_catalog.btrim(v_payload->>'name');
    v_name_ur:=CASE
      WHEN v_payload->'name_ur' IS NULL OR v_payload->'name_ur'='null'::jsonb THEN NULL
      WHEN pg_catalog.jsonb_typeof(v_payload->'name_ur')='string' THEN nullif(pg_catalog.btrim(v_payload->>'name_ur'),'')
      ELSE NULL
    END;
    IF v_payload ? 'name_ur' AND v_payload->'name_ur'<>'null'::jsonb
       AND pg_catalog.jsonb_typeof(v_payload->'name_ur') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'DELIVERY_CONFIG_AREA_UR_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_name IS NULL OR pg_catalog.char_length(v_name) NOT BETWEEN 1 AND 120
       OR (v_name_ur IS NOT NULL AND pg_catalog.char_length(v_name_ur)>120) THEN
      RAISE EXCEPTION 'DELIVERY_CONFIG_AREA_NAME_INVALID' USING ERRCODE='22023';
    END IF;

    BEGIN
      v_fee:=(v_payload->>'delivery_fee')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'DELIVERY_CONFIG_AREA_FEE_INVALID' USING ERRCODE='22023';
    END;
    IF v_fee<0 OR v_fee>9999999999.99 OR pg_catalog.scale(v_fee)>2 THEN
      RAISE EXCEPTION 'DELIVERY_CONFIG_AREA_FEE_INVALID' USING ERRCODE='22023';
    END IF;

    IF v_payload ? 'sort_order' THEN
      IF pg_catalog.jsonb_typeof(v_payload->'sort_order') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'DELIVERY_CONFIG_AREA_SORT_INVALID' USING ERRCODE='22023';
      END IF;
      BEGIN v_num:=(v_payload->>'sort_order')::numeric;
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'DELIVERY_CONFIG_AREA_SORT_INVALID' USING ERRCODE='22023';
      END;
      IF pg_catalog.scale(v_num)<>0 OR v_num<0 OR v_num>2147483647 THEN
        RAISE EXCEPTION 'DELIVERY_CONFIG_AREA_SORT_INVALID' USING ERRCODE='22023';
      END IF;
      v_sort:=v_num::integer;
    ELSE
      v_sort:=0;
    END IF;

    IF v_payload ? 'is_active' THEN
      IF pg_catalog.jsonb_typeof(v_payload->'is_active') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'DELIVERY_CONFIG_AREA_STATUS_INVALID' USING ERRCODE='22023';
      END IF;
      v_active:=(v_payload->>'is_active')::boolean;
    ELSE
      v_active:=true;
    END IF;

    IF v_payload->>'area_id' IS NULL OR pg_catalog.btrim(v_payload->>'area_id')='' THEN
      INSERT INTO public.delivery_areas(
        restaurant_id,branch_id,name,name_ur,delivery_fee,sort_order,is_active,created_by,updated_by
      ) VALUES (
        v_restaurant_id,v_branch_id,v_name,v_name_ur,v_fee,v_sort,v_active,v_actor,v_actor
      )
      RETURNING * INTO v_area;
    ELSE
      BEGIN
        v_area_id:=(v_payload->>'area_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'DELIVERY_CONFIG_AREA_ID_INVALID' USING ERRCODE='22023';
      END;
      UPDATE public.delivery_areas a
      SET name=v_name,name_ur=v_name_ur,delivery_fee=v_fee,
          sort_order=v_sort,is_active=v_active,updated_by=v_actor
      WHERE a.id=v_area_id AND a.restaurant_id=v_restaurant_id AND a.branch_id=v_branch_id
      RETURNING a.* INTO v_area;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'DELIVERY_CONFIG_AREA_NOT_FOUND' USING ERRCODE='P0002';
      END IF;
    END IF;

    RETURN pg_catalog.jsonb_build_object('ok',true,'area',pg_catalog.to_jsonb(v_area));
  END IF;

  IF pg_catalog.jsonb_typeof(v_payload->'delivery_fee') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'DELIVERY_CONFIG_DEFAULT_FEE_REQUIRED' USING ERRCODE='22023';
  END IF;
  BEGIN
    v_fee:=(v_payload->>'delivery_fee')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'DELIVERY_CONFIG_DEFAULT_FEE_INVALID' USING ERRCODE='22023';
  END;
  IF v_fee<0 OR v_fee>9999999999.99 OR pg_catalog.scale(v_fee)>2 THEN
    RAISE EXCEPTION 'DELIVERY_CONFIG_DEFAULT_FEE_INVALID' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.branch_delivery_settings(
    branch_id,restaurant_id,not_listed_delivery_fee,updated_by
  ) VALUES (
    v_branch_id,v_restaurant_id,v_fee,v_actor
  )
  ON CONFLICT (branch_id) DO UPDATE
    SET restaurant_id=EXCLUDED.restaurant_id,
        not_listed_delivery_fee=EXCLUDED.not_listed_delivery_fee,
        updated_by=EXCLUDED.updated_by
  RETURNING * INTO v_settings;

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'branch_id',v_branch_id,
    'not_listed_delivery_fee',v_settings.not_listed_delivery_fee,
    'updated_at',v_settings.updated_at
  );
END
$function$;

ALTER FUNCTION app_private.flame_chick_delivery_configuration_command_internal(text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_delivery_configuration_command_internal(text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_delivery_configuration_command_internal(text,jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_delivery_configuration_command(
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT app_private.flame_chick_delivery_configuration_command_internal(p_action,p_payload)
$function$;

ALTER FUNCTION public.flame_chick_delivery_configuration_command(text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_delivery_configuration_command(text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_delivery_configuration_command(text,jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.flame_chick_delivery_configuration_command(text,jsonb) IS
  'Authenticated Admin/Owner-only command for branch delivery area and Not Listed fee management.';
