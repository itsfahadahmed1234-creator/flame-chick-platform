-- Read-only website checkout idempotency replay.
-- Lets a customer safely retry an already committed checkout even if the
-- published menu or delivery fee has changed since the original commit.
BEGIN;

DO $preflight$
BEGIN
  IF current_user<>'postgres' OR session_user<>'postgres' THEN
    RAISE EXCEPTION 'FLAME_CHICK_WEBSITE_IDEMPOTENCY_LOOKUP_REQUIRES_POSTGRES';
  END IF;
  IF pg_catalog.to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'FLAME_CHICK_WEBSITE_IDEMPOTENCY_ORDERS_TABLE_MISSING';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.flame_chick_get_website_order_by_idempotency(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_branch_id uuid;
  v_idempotency_key text;
  v_request_hash text;
  v_order public.orders%ROWTYPE;
BEGIN
  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload)<>'object'
     OR COALESCE(p_payload->>'branch_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_payload->>'idempotency_key','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_payload->>'request_hash','') !~ '^[0-9a-f]{64}$' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_IDEMPOTENCY_INPUT_INVALID','message','The checkout retry identifier is invalid.'));
  END IF;

  v_branch_id:=(p_payload->>'branch_id')::uuid;
  v_idempotency_key:=pg_catalog.lower(p_payload->>'idempotency_key');
  v_request_hash:=pg_catalog.lower(p_payload->>'request_hash');

  SELECT r.id INTO v_restaurant_id
  FROM public.restaurants r
  JOIN public.branches b ON b.restaurant_id=r.id AND b.id=v_branch_id
  WHERE r.slug='flame-chick' AND r.is_active AND b.is_active;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_BRANCH_UNAVAILABLE','message','The selected Flame Chick branch is unavailable.'));
  END IF;

  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE o.restaurant_id=v_restaurant_id
    AND o.branch_id=v_branch_id
    AND o.source='website'
    AND o.idempotency_key=v_idempotency_key
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'found',false);
  END IF;

  IF v_order.request_hash<>v_request_hash THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_IDEMPOTENCY_CONFLICT','message','This checkout request ID was already used for different order details.'));
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'found',true,'already_processed',true,
    'order_id',v_order.id,'order_number',v_order.order_number,
    'status',v_order.status,'payment_status',v_order.payment_status,
    'subtotal',v_order.subtotal,'delivery_fee',v_order.delivery_fee,
    'total',v_order.total,'currency_code',v_order.currency_code,
    'created_at',v_order.created_at
  );
END;
$function$;

ALTER FUNCTION public.flame_chick_get_website_order_by_idempotency(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_get_website_order_by_idempotency(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_get_website_order_by_idempotency(jsonb) TO service_role;

DO $verify$
DECLARE v_oid oid:=pg_catalog.to_regprocedure('public.flame_chick_get_website_order_by_idempotency(jsonb)');
BEGIN
  IF v_oid IS NULL
     OR NOT EXISTS(
       SELECT 1 FROM pg_catalog.pg_proc p
       WHERE p.oid=v_oid
         AND p.prosecdef
         AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
         AND p.proconfig @> ARRAY['search_path=""']
     )
     OR NOT pg_catalog.has_function_privilege('service_role',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('public',v_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'FLAME_CHICK_WEBSITE_IDEMPOTENCY_LOOKUP_SECURITY_INVALID';
  END IF;
END;
$verify$;

COMMIT;
