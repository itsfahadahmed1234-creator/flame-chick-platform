-- Flame Chick Admin dashboard: optional historical-summary mode.
-- Existing 13-field callers retain their historical-summary behavior.
-- Current Admin clients send p_include_period_history=false on initial load,
-- and true only when a longer Sales Overview range is selected.
CREATE OR REPLACE FUNCTION app_private.flame_chick_admin_dashboard_internal(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_restaurant_id uuid;
  v_role text;
  v_branch_id uuid;
  v_branch_name text;
  v_today_start timestamptz; v_today_end timestamptz;
  v_period_start timestamptz; v_period_end timestamptz;
  v_prev_period_start timestamptz; v_prev_period_end timestamptz;
  v_week_start timestamptz; v_week_end timestamptz;
  v_prev_week_start timestamptz; v_prev_week_end timestamptz;
  v_rush_start timestamptz; v_rush_end timestamptz;
  v_keys text[] := ARRAY[
    'p_branch_id','p_today_start','p_today_end','p_period_start','p_period_end',
    'p_previous_period_start','p_previous_period_end','p_week_start','p_week_end',
    'p_previous_week_start','p_previous_week_end','p_rush_start','p_rush_end',
    'p_include_period_history'
  ];
  v_required_keys text[] := ARRAY[
    'p_branch_id','p_today_start','p_today_end','p_period_start','p_period_end',
    'p_previous_period_start','p_previous_period_end','p_week_start','p_week_end',
    'p_previous_week_start','p_previous_week_end','p_rush_start','p_rush_end'
  ];
  v_time_keys text[] := ARRAY[
    'p_today_start','p_today_end','p_period_start','p_period_end',
    'p_previous_period_start','p_previous_period_end','p_week_start','p_week_end',
    'p_previous_week_start','p_previous_week_end','p_rush_start','p_rush_end'
  ];
  v_key text; v_count integer; v_value text;
  v_include_period_history boolean := true;
  v_today jsonb; v_status jsonb; v_period jsonb; v_prev_period jsonb;
  v_week jsonb; v_prev_week jsonb; v_daily jsonb; v_rush jsonb;
  v_recent jsonb; v_attention jsonb; v_attention_count bigint;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'ADMIN_DASHBOARD_AUTH_REQUIRED' USING ERRCODE='42501';
  END IF;

  IF pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR pg_catalog.octet_length(p_payload::text)>12000 THEN
    RAISE EXCEPTION 'ADMIN_DASHBOARD_PAYLOAD_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT pg_catalog.count(*) INTO v_count
  FROM pg_catalog.jsonb_object_keys(p_payload);
  IF v_count NOT IN (13,14) THEN
    RAISE EXCEPTION 'ADMIN_DASHBOARD_PAYLOAD_INVALID' USING ERRCODE='22023';
  END IF;

  FOR v_key IN SELECT k FROM pg_catalog.jsonb_object_keys(p_payload) AS keys(k)
  LOOP
    IF NOT (v_key=ANY(v_keys)) THEN
      RAISE EXCEPTION 'ADMIN_DASHBOARD_FIELD_NOT_ALLOWED' USING ERRCODE='22023';
    END IF;
  END LOOP;
  FOREACH v_key IN ARRAY v_required_keys
  LOOP
    IF NOT (p_payload ? v_key) THEN
      RAISE EXCEPTION 'ADMIN_DASHBOARD_FIELD_REQUIRED' USING ERRCODE='22023';
    END IF;
  END LOOP;

  IF pg_catalog.jsonb_typeof(p_payload->'p_branch_id') IS DISTINCT FROM 'string'
     OR pg_catalog.btrim(p_payload->>'p_branch_id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'ADMIN_DASHBOARD_BRANCH_INVALID' USING ERRCODE='22023';
  END IF;
  BEGIN
    v_branch_id := (p_payload->>'p_branch_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'ADMIN_DASHBOARD_BRANCH_INVALID' USING ERRCODE='22023';
  END;

  FOREACH v_key IN ARRAY v_time_keys
  LOOP
    v_value := p_payload->>v_key;
    IF pg_catalog.jsonb_typeof(p_payload->v_key) IS DISTINCT FROM 'string'
       OR v_value !~
         '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?Z$' THEN
      RAISE EXCEPTION 'ADMIN_DASHBOARD_TIME_INVALID' USING ERRCODE='22023';
    END IF;
  END LOOP;

  IF p_payload ? 'p_include_period_history' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'p_include_period_history') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'ADMIN_DASHBOARD_HISTORY_FLAG_INVALID' USING ERRCODE='22023';
    END IF;
    v_include_period_history := (p_payload->>'p_include_period_history')::boolean;
  ELSE
    v_include_period_history := true;
  END IF;

  BEGIN
    v_today_start := (p_payload->>'p_today_start')::timestamptz;
    v_today_end := (p_payload->>'p_today_end')::timestamptz;
    v_period_start := (p_payload->>'p_period_start')::timestamptz;
    v_period_end := (p_payload->>'p_period_end')::timestamptz;
    v_prev_period_start := (p_payload->>'p_previous_period_start')::timestamptz;
    v_prev_period_end := (p_payload->>'p_previous_period_end')::timestamptz;
    v_week_start := (p_payload->>'p_week_start')::timestamptz;
    v_week_end := (p_payload->>'p_week_end')::timestamptz;
    v_prev_week_start := (p_payload->>'p_previous_week_start')::timestamptz;
    v_prev_week_end := (p_payload->>'p_previous_week_end')::timestamptz;
    v_rush_start := (p_payload->>'p_rush_start')::timestamptz;
    v_rush_end := (p_payload->>'p_rush_end')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'ADMIN_DASHBOARD_TIME_INVALID' USING ERRCODE='22023';
  END;

  IF v_today_end<=v_today_start OR v_today_end-v_today_start>interval '2 days'
     OR v_period_end<=v_period_start OR v_period_end-v_period_start>interval '366 days'
     OR v_prev_period_end<=v_prev_period_start OR v_prev_period_end-v_prev_period_start>interval '366 days'
     OR v_week_end<=v_week_start OR v_week_end-v_week_start>interval '8 days'
     OR v_prev_week_end<=v_prev_week_start OR v_prev_week_end-v_prev_week_start>interval '8 days'
     OR v_rush_end<=v_rush_start OR v_rush_end-v_rush_start>interval '366 days' THEN
    RAISE EXCEPTION 'ADMIN_DASHBOARD_RANGE_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT r.id INTO v_restaurant_id
  FROM public.restaurants r
  WHERE r.slug='flame-chick' AND r.is_active
  LIMIT 1;
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'ADMIN_DASHBOARD_TENANT_UNAVAILABLE' USING ERRCODE='P0001';
  END IF;

  SELECT ur.role_key INTO v_role
  FROM public.user_profiles up
  JOIN auth.users au ON au.id=up.user_id AND au.deleted_at IS NULL
  JOIN public.user_roles ur ON ur.user_id=up.user_id
  WHERE up.user_id=v_actor AND up.is_active
    AND ur.restaurant_id=v_restaurant_id AND ur.is_active
    AND ur.role_key IN ('admin','owner') AND ur.branch_id IS NULL
  ORDER BY CASE ur.role_key WHEN 'admin' THEN 1 ELSE 2 END
  LIMIT 1;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'ADMIN_DASHBOARD_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;

  SELECT b.name INTO v_branch_name
  FROM public.branches b
  WHERE b.id=v_branch_id AND b.restaurant_id=v_restaurant_id AND b.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ADMIN_DASHBOARD_BRANCH_UNAVAILABLE' USING ERRCODE='P0002';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_object_agg(s.status,s.n),'{}'::jsonb)
  INTO v_status
  FROM (
    SELECT o.status,pg_catalog.count(*) AS n
    FROM public.orders o
    WHERE o.restaurant_id=v_restaurant_id AND o.branch_id=v_branch_id
      AND o.created_at>=v_today_start AND o.created_at<v_today_end
    GROUP BY o.status
  ) s;

  SELECT pg_catalog.jsonb_build_object(
    'orders',pg_catalog.count(*),
    'sales',COALESCE(pg_catalog.sum(o.total) FILTER(WHERE o.status NOT IN ('cancelled','rejected')),0),
    'valid_orders',pg_catalog.count(*) FILTER(WHERE o.status NOT IN ('cancelled','rejected')),
    'delivery',pg_catalog.count(*) FILTER(WHERE o.fulfillment_type='delivery'),
    'takeaway',pg_catalog.count(*) FILTER(WHERE o.fulfillment_type IN ('pickup','takeaway')),
    'dine_in',pg_catalog.count(*) FILTER(WHERE o.fulfillment_type IN ('dine_in','dine-in')),
    'status',v_status)
  INTO v_today
  FROM public.orders o
  WHERE o.restaurant_id=v_restaurant_id AND o.branch_id=v_branch_id
    AND o.created_at>=v_today_start AND o.created_at<v_today_end;

  IF v_include_period_history THEN
  SELECT pg_catalog.jsonb_build_object(
    'orders',pg_catalog.count(*),
    'sales',COALESCE(pg_catalog.sum(o.total) FILTER(WHERE o.status NOT IN ('cancelled','rejected')),0),
    'valid_orders',pg_catalog.count(*) FILTER(WHERE o.status NOT IN ('cancelled','rejected')))
  INTO v_period
  FROM public.orders o
  WHERE o.restaurant_id=v_restaurant_id AND o.branch_id=v_branch_id
    AND o.created_at>=v_period_start AND o.created_at<v_period_end;

  WITH days AS (
    SELECT g.d::date AS day
    FROM pg_catalog.generate_series(
      (v_period_start AT TIME ZONE 'Asia/Karachi')::date,
      ((v_period_end-interval '1 microsecond') AT TIME ZONE 'Asia/Karachi')::date,
      interval '1 day') g(d)
  ), daily AS (
    SELECT (o.created_at AT TIME ZONE 'Asia/Karachi')::date AS day,
      COALESCE(pg_catalog.sum(o.total) FILTER(WHERE o.status NOT IN ('cancelled','rejected')),0) AS sales,
      pg_catalog.count(*) AS orders
    FROM public.orders o
    WHERE o.restaurant_id=v_restaurant_id AND o.branch_id=v_branch_id
      AND o.created_at>=v_period_start AND o.created_at<v_period_end
    GROUP BY (o.created_at AT TIME ZONE 'Asia/Karachi')::date
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'day',pg_catalog.to_char(d.day,'YYYY-MM-DD'),
    'sales',COALESCE(x.sales,0),'orders',COALESCE(x.orders,0)
  ) ORDER BY d.day),'[]'::jsonb)
  INTO v_daily
  FROM days d LEFT JOIN daily x ON x.day=d.day;
  v_period := v_period || pg_catalog.jsonb_build_object('daily',v_daily);

  SELECT pg_catalog.jsonb_build_object(
    'sales',COALESCE(pg_catalog.sum(o.total) FILTER(WHERE o.status NOT IN ('cancelled','rejected')),0),
    'orders',pg_catalog.count(*),
    'average_order_value',COALESCE(
      pg_catalog.sum(o.total) FILTER(WHERE o.status NOT IN ('cancelled','rejected'))
      / NULLIF(pg_catalog.count(*) FILTER(WHERE o.status NOT IN ('cancelled','rejected')),0),0),
    'delivery',pg_catalog.count(*) FILTER(WHERE o.fulfillment_type='delivery'),
    'takeaway',pg_catalog.count(*) FILTER(WHERE o.fulfillment_type IN ('pickup','takeaway')),
    'dine_in',pg_catalog.count(*) FILTER(WHERE o.fulfillment_type IN ('dine_in','dine-in')),
    'start',v_week_start,'end',v_week_end)
  INTO v_week
  FROM public.orders o
  WHERE o.restaurant_id=v_restaurant_id AND o.branch_id=v_branch_id
    AND o.created_at>=v_week_start AND o.created_at<v_week_end;

  SELECT pg_catalog.jsonb_build_object(
    'sales',COALESCE(pg_catalog.sum(o.total) FILTER(WHERE o.status NOT IN ('cancelled','rejected')),0),
    'orders',pg_catalog.count(*),
    'average_order_value',COALESCE(
      pg_catalog.sum(o.total) FILTER(WHERE o.status NOT IN ('cancelled','rejected'))
      / NULLIF(pg_catalog.count(*) FILTER(WHERE o.status NOT IN ('cancelled','rejected')),0),0),
    'delivery',pg_catalog.count(*) FILTER(WHERE o.fulfillment_type='delivery'),
    'takeaway',pg_catalog.count(*) FILTER(WHERE o.fulfillment_type IN ('pickup','takeaway')),
    'dine_in',pg_catalog.count(*) FILTER(WHERE o.fulfillment_type IN ('dine_in','dine-in')),
    'start',v_prev_week_start,'end',v_prev_week_end)
  INTO v_prev_week
  FROM public.orders o
  WHERE o.restaurant_id=v_restaurant_id AND o.branch_id=v_branch_id
    AND o.created_at>=v_prev_week_start AND o.created_at<v_prev_week_end;

  SELECT pg_catalog.jsonb_build_object(
    'sales',COALESCE(pg_catalog.sum(o.total) FILTER(WHERE o.status NOT IN ('cancelled','rejected')),0),
    'orders',pg_catalog.count(*))
  INTO v_prev_period
  FROM public.orders o
  WHERE o.restaurant_id=v_restaurant_id AND o.branch_id=v_branch_id
    AND o.created_at>=v_prev_period_start AND o.created_at<v_prev_period_end;

  ELSE
    v_period := pg_catalog.jsonb_build_object(
      'orders',v_today->'orders','sales',v_today->'sales','valid_orders',v_today->'valid_orders',
      'daily',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'day',pg_catalog.to_char((v_today_start AT TIME ZONE 'Asia/Karachi')::date,'YYYY-MM-DD'),
        'sales',v_today->'sales','orders',v_today->'orders'
      ))
    );
    v_prev_period := pg_catalog.jsonb_build_object('sales',0,'orders',0);
    v_week := NULL;
    v_prev_week := NULL;
  END IF;

  WITH hours AS (
    SELECT h.hour_value FROM pg_catalog.generate_series(11,23) h(hour_value)
  ), hourly AS (
    SELECT EXTRACT(hour FROM (o.created_at AT TIME ZONE 'Asia/Karachi'))::integer AS hr,
      pg_catalog.count(*) AS orders,
      COALESCE(pg_catalog.sum(o.total) FILTER(WHERE o.status NOT IN ('cancelled','rejected')),0) AS sales
    FROM public.orders o
    WHERE o.restaurant_id=v_restaurant_id AND o.branch_id=v_branch_id
      AND o.created_at>=v_rush_start AND o.created_at<v_rush_end
      AND EXTRACT(hour FROM (o.created_at AT TIME ZONE 'Asia/Karachi')) BETWEEN 11 AND 23
    GROUP BY EXTRACT(hour FROM (o.created_at AT TIME ZONE 'Asia/Karachi'))::integer
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'hour',h.hour_value,'orders',COALESCE(x.orders,0),'sales',COALESCE(x.sales,0)
  ) ORDER BY h.hour_value),'[]'::jsonb)
  INTO v_rush FROM hours h LEFT JOIN hourly x ON x.hr=h.hour_value;

  SELECT pg_catalog.count(*) INTO v_attention_count
  FROM public.orders o
  WHERE o.restaurant_id=v_restaurant_id AND o.branch_id=v_branch_id
    AND o.status IN ('new','accepted','preparing','ready','out_for_delivery');

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'order_number',x.order_number,'customer_name',x.customer_name,
    'fulfillment_type',x.fulfillment_type,'status',x.status,'total',x.total,
    'placed_at',x.created_at,'age_minutes',x.age_minutes
  ) ORDER BY x.created_at ASC),'[]'::jsonb)
  INTO v_attention
  FROM (
    SELECT o.order_number,o.customer_name,o.fulfillment_type,o.status,o.total,o.created_at,
      GREATEST(0,FLOOR(EXTRACT(epoch FROM (v_now-o.created_at))/60))::integer AS age_minutes
    FROM public.orders o
    WHERE o.restaurant_id=v_restaurant_id AND o.branch_id=v_branch_id
      AND o.status IN ('new','accepted','preparing','ready','out_for_delivery')
    ORDER BY o.created_at ASC LIMIT 6
  ) x;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'order_number',x.order_number,'customer_name',x.customer_name,
    'fulfillment_type',x.fulfillment_type,'total',x.total,
    'status',x.status,'placed_at',x.created_at
  ) ORDER BY x.created_at DESC),'[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT o.order_number,o.customer_name,o.fulfillment_type,o.total,o.status,o.created_at
    FROM public.orders o
    WHERE o.restaurant_id=v_restaurant_id AND o.branch_id=v_branch_id
      AND o.created_at >= CASE WHEN v_include_period_history THEN v_period_start ELSE v_today_start END
      AND o.created_at < CASE WHEN v_include_period_history THEN v_period_end ELSE v_today_end END
    ORDER BY o.created_at DESC LIMIT 8
  ) x;

  RETURN pg_catalog.jsonb_build_object(
    'branch_id',v_branch_id,'branch_name',v_branch_name,'updated_at',v_now,
    'today',v_today,'period',v_period,'previous_period',v_prev_period,
    'week',v_week,'previous_week',v_prev_week,'rush_hours',v_rush,
    'recent_orders',v_recent,'attention_count',v_attention_count,
    'attention_orders',v_attention
  );
END
$function$
;

ALTER FUNCTION app_private.flame_chick_admin_dashboard_internal(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_admin_dashboard_internal(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_admin_dashboard_internal(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.flame_chick_admin_dashboard(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
  SELECT app_private.flame_chick_admin_dashboard_internal(p_payload)
$function$
;

ALTER FUNCTION public.flame_chick_admin_dashboard(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_admin_dashboard(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_admin_dashboard(jsonb) TO authenticated;

COMMENT ON FUNCTION public.flame_chick_admin_dashboard(jsonb) IS
  'Read-only branch dashboard aggregates for authenticated Flame Chick Admin/Owner; validates tenant and branch. Optional p_include_period_history controls historical aggregates.';
