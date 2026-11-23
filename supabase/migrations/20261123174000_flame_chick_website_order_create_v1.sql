-- Flame Chick Website order creation V1.
-- Trusted Order Edge Function first reads the immutable published V3 snapshot,
-- validates every product/deal/modifier ID and reprices in integer minor units.
-- This service_role-only command then repeats the critical publication, branch,
-- delivery-fee, amount, idempotency and phone-quota checks inside one transaction.
BEGIN;

DO $preflight$
BEGIN
  IF current_user<>'postgres' OR session_user<>'postgres' THEN
    RAISE EXCEPTION 'FLAME_CHICK_WEBSITE_ORDER_MIGRATION_REQUIRES_POSTGRES';
  END IF;
  IF pg_catalog.to_regprocedure('public.flame_chick_create_website_order(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'FLAME_CHICK_CREATE_ORDER_RPC_ALREADY_EXISTS';
  END IF;
  IF pg_catalog.to_regclass('public.orders') IS NULL
     OR pg_catalog.to_regclass('public.order_items') IS NULL
     OR pg_catalog.to_regclass('app_private.website_order_success_events') IS NULL
     OR pg_catalog.to_regclass('app_private.order_number_counters') IS NULL THEN
    RAISE EXCEPTION 'FLAME_CHICK_WEBSITE_ORDER_SCHEMA_DEPENDENCY_MISSING';
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
  IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
     OR COALESCE(p_payload->>'branch_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_branch_id uuid;
  v_publication_id uuid;
  v_idempotency_key text;
  v_request_hash text;
  v_phone_digest bytea;
  v_customer_name text;
  v_customer_phone text;
  v_customer_email text;
  v_notes text;
  v_fulfillment text;
  v_currency text;
  v_branch_timezone text;
  v_order_number text;
  v_business_date date;
  v_counter bigint;
  v_now timestamptz;
  v_status text:='new';
  v_payment_summary text;
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
  v_delivery_fee numeric(12,2);
  v_total numeric(12,2);
  v_calculated_subtotal numeric(12,2):=0;
  v_area_id uuid;
  v_area_name text;
  v_area_fee numeric(12,2);
  v_selection_type text;
  v_other_locality text;
  v_address text;
  v_instructions text;
  v_delivery jsonb;
  v_items jsonb;
  v_item jsonb;
  v_modifier jsonb;
  v_component jsonb;
  v_component_modifier jsonb;
  v_item_id uuid;
  v_component_id uuid;
  v_order_id uuid;
  v_existing public.orders%ROWTYPE;
  v_ordinal integer:=0;
  v_item_quantity integer;
  v_line_total numeric(12,2);
  v_unit_price numeric(12,2);
  v_phone_count_1m integer;
  v_phone_count_10m integer;
  v_phone_count_1h integer;
  v_retry_1m integer:=0;
  v_retry_10m integer:=0;
  v_retry_1h integer:=0;
  v_retry_seconds integer:=0;
  v_message text;
BEGIN
  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload)<>'object' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_REQUEST_INVALID','message','A website order request is required.'));
  END IF;

  IF COALESCE(p_payload->>'source','')<>'website' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_SOURCE_REQUIRED','message','This command accepts Website orders only.'));
  END IF;

  IF COALESCE(p_payload->>'branch_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_payload->>'catalog_publication_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_payload->>'idempotency_key','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_payload->>'request_hash','') !~ '^[0-9a-f]{64}$'
     OR COALESCE(p_payload->>'phone_digest','') !~ '^[0-9a-f]{64}$' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_IDENTIFIERS_INVALID','message','Order, publication and privacy identifiers are invalid.'));
  END IF;

  BEGIN
    v_branch_id := (p_payload->>'branch_id')::uuid;
    v_publication_id := (p_payload->>'catalog_publication_id')::uuid;
    v_idempotency_key := pg_catalog.lower(p_payload->>'idempotency_key');
    v_request_hash := pg_catalog.lower(p_payload->>'request_hash');
    v_phone_digest := pg_catalog.decode(pg_catalog.lower(p_payload->>'phone_digest'),'hex');
  EXCEPTION WHEN OTHERS THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_IDENTIFIERS_INVALID','message','Order and privacy identifiers could not be read.'));
  END;

  IF pg_catalog.octet_length(v_phone_digest)<>32 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_PRIVACY_DIGEST_INVALID','message','The customer privacy digest is invalid.'));
  END IF;

  SELECT r.id,r.currency_code,r.timezone
  INTO v_restaurant_id,v_currency,v_branch_timezone
  FROM public.restaurants r
  WHERE r.slug='flame-chick' AND r.is_active;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_RESTAURANT_UNAVAILABLE','message','Flame Chick is not accepting online orders.'));
  END IF;

  -- Serialize both idempotency retries and distinct requests from this phone.
  -- The phone quota is restaurant-wide, so switching branch cannot evade it.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'flame-chick-website-idempotency:'||v_restaurant_id::text||':'||v_idempotency_key,0));
  SELECT o.* INTO v_existing
  FROM public.orders o
  WHERE o.restaurant_id=v_restaurant_id
    AND o.source='website'
    AND o.idempotency_key=v_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    IF v_existing.request_hash<>v_request_hash THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_IDEMPOTENCY_CONFLICT','message','This checkout request ID was already used for different order details.'));
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'already_processed',true,
      'order_id',v_existing.id,'order_number',v_existing.order_number,
      'status',v_existing.status,'payment_status',v_existing.payment_status,
      'subtotal',v_existing.subtotal,'delivery_fee',v_existing.delivery_fee,
      'total',v_existing.total,'currency_code',v_existing.currency_code,
      'created_at',v_existing.created_at
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'flame-chick-website-phone:'||v_restaurant_id::text||':'||pg_catalog.encode(v_phone_digest,'hex'),0));

  v_now:=pg_catalog.clock_timestamp();

  IF jsonb_typeof(p_payload->'catalog_version') IS DISTINCT FROM 'number'
     OR COALESCE(p_payload->>'catalog_version','') !~ '^[1-9][0-9]*$'
     OR COALESCE(p_payload->>'fulfillment_type','') NOT IN ('delivery','pickup')
     OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_PAYLOAD_INVALID','message','The order payload is missing the current catalog version or item list.'));
  END IF;

  v_fulfillment := p_payload->>'fulfillment_type';
  v_items := p_payload->'items';
  IF pg_catalog.jsonb_array_length(v_items)<1 OR pg_catalog.jsonb_array_length(v_items)>100 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_ITEMS_INVALID','message','An order must contain between 1 and 100 items.'));
  END IF;

  -- Only the current immutable publication can be used to commit an order.
  IF NOT EXISTS(
    SELECT 1
    FROM public.catalog_current_publication cp
    JOIN public.catalog_publications p
      ON p.id=cp.publication_id AND p.restaurant_id=cp.restaurant_id
    WHERE cp.restaurant_id=v_restaurant_id
      AND p.id=v_publication_id
      AND p.publication_number=(p_payload->>'catalog_version')::bigint
      AND p.schema_version=3
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','CATALOG_PUBLICATION_CHANGED','message','The published menu changed. Refresh the menu and review your cart before placing the order.'));
  END IF;

  -- Branch must belong to this restaurant and be explicitly website-enabled.
  SELECT r.timezone INTO v_branch_timezone
  FROM public.branches b
  JOIN public.restaurants r ON r.id=b.restaurant_id
  WHERE b.id=v_branch_id AND b.restaurant_id=v_restaurant_id
    AND b.is_active AND b.website_ordering_enabled
    AND CASE WHEN v_fulfillment='delivery' THEN b.website_delivery_enabled
             ELSE b.website_pickup_enabled END;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','BRANCH_FULFILMENT_UNAVAILABLE','message','The selected branch is not accepting this type of website order.'));
  END IF;

  v_customer_name:=NULLIF(pg_catalog.btrim(p_payload->>'customer_name'),'');
  v_customer_phone:=NULLIF(pg_catalog.btrim(p_payload->>'customer_phone'),'');
  v_customer_email:=NULLIF(pg_catalog.btrim(p_payload->>'customer_email'),'');
  v_notes:=NULLIF(pg_catalog.btrim(p_payload->>'notes'),'');
  IF v_customer_name IS NULL OR pg_catalog.char_length(v_customer_name)>160
     OR v_customer_phone IS NULL OR pg_catalog.char_length(v_customer_phone) NOT BETWEEN 3 AND 32
     OR (v_customer_email IS NOT NULL AND pg_catalog.char_length(v_customer_email)>254)
     OR (v_notes IS NOT NULL AND pg_catalog.char_length(v_notes)>1000) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_CUSTOMER_INVALID','message','Customer details are incomplete or invalid.'));
  END IF;

  IF p_payload->>'currency_code' IS DISTINCT FROM v_currency THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_CURRENCY_INVALID','message','The order currency does not match Flame Chick.'));
  END IF;

  BEGIN
    v_subtotal:=(p_payload->>'subtotal')::numeric;
    v_discount:=COALESCE((p_payload->>'discount_amount')::numeric,0);
    v_delivery_fee:=(p_payload->>'delivery_fee')::numeric;
    v_total:=(p_payload->>'total')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_AMOUNT_INVALID','message','The server-calculated order amounts are invalid.'));
  END;
  IF v_subtotal<0 OR v_discount<>0 OR v_delivery_fee<0
     OR v_total<>v_subtotal-v_discount+v_delivery_fee THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_AMOUNT_INVALID','message','The order total or discount does not match the server calculation.'));
  END IF;

  -- Check delivery area/fee again in the same transaction as the order write.
  -- An unset Not Listed fee stays unavailable; explicit zero remains valid.
  v_delivery:=p_payload->'delivery';
  IF v_fulfillment='delivery' THEN
    IF jsonb_typeof(v_delivery) IS DISTINCT FROM 'object' THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_DELIVERY_DETAILS_REQUIRED','message','A delivery address and area are required.'));
    END IF;
    v_selection_type:=COALESCE(v_delivery->>'selection_type',v_delivery->>'selectionType');
    v_address:=NULLIF(pg_catalog.btrim(v_delivery->>'address'),'');
    v_instructions:=NULLIF(pg_catalog.btrim(v_delivery->>'instructions'),'');
    IF v_address IS NULL OR pg_catalog.char_length(v_address) NOT BETWEEN 5 AND 1000
       OR (v_instructions IS NOT NULL AND pg_catalog.char_length(v_instructions)>500) THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_DELIVERY_ADDRESS_INVALID','message','Enter a complete delivery address.'));
    END IF;
    IF v_selection_type='listed_area' THEN
      IF COALESCE(v_delivery->>'area_id',v_delivery->>'areaId','') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_DELIVERY_AREA_INVALID','message','Choose a delivery area from this branch.'));
      END IF;
      v_area_id:=COALESCE(v_delivery->>'area_id',v_delivery->>'areaId')::uuid;
      SELECT da.name,da.delivery_fee INTO v_area_name,v_area_fee
      FROM public.delivery_areas da
      WHERE da.id=v_area_id AND da.restaurant_id=v_restaurant_id
        AND da.branch_id=v_branch_id AND da.is_active;
      IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_DELIVERY_AREA_UNAVAILABLE','message','This delivery area is no longer available at the selected branch.'));
      END IF;
      v_other_locality:=NULL;
    ELSIF v_selection_type='not_listed' THEN
      v_area_id:=NULL;
      v_area_name:='Not Listed / Other';
      v_other_locality:=NULLIF(pg_catalog.btrim(COALESCE(v_delivery->>'other_locality',v_delivery->>'otherLocality','')),'');
      IF v_other_locality IS NULL OR pg_catalog.char_length(v_other_locality)>120 THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_DELIVERY_LOCALITY_REQUIRED','message','Enter your locality for a Not Listed delivery.'));
      END IF;
      SELECT s.not_listed_delivery_fee INTO v_area_fee
      FROM public.branch_delivery_settings s
      WHERE s.restaurant_id=v_restaurant_id AND s.branch_id=v_branch_id;
      IF NOT FOUND OR v_area_fee IS NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_DEFAULT_DELIVERY_FEE_UNCONFIGURED','message','Not Listed delivery is not configured for this branch. Please choose a listed area.'));
      END IF;
    ELSE
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_DELIVERY_SELECTION_INVALID','message','Choose a listed delivery area or Not Listed / Other.'));
    END IF;

    IF v_delivery_fee IS DISTINCT FROM v_area_fee THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_DELIVERY_FEE_CHANGED','message','The delivery fee changed. Refresh the quote before placing your order.'));
    END IF;
  ELSE
    IF v_delivery IS NOT NULL
       OR v_delivery_fee<>0 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_PICKUP_DELIVERY_FIELDS_INVALID','message','Pickup orders cannot include delivery address or fee.'));
    END IF;
    v_area_id:=NULL;
    v_area_name:=NULL;
    v_other_locality:=NULL;
    v_address:=NULL;
    v_instructions:=NULL;
    v_selection_type:=NULL;
    v_area_fee:=0;
  END IF;

  -- The JSON line totals are server-derived by the trusted V3 pricing module.
  -- Check their sum here before inserting any operational records.
  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items)
  LOOP
    IF jsonb_typeof(v_item)<>'object'
       OR COALESCE(v_item->>'line_kind','') NOT IN ('product','deal')
       OR COALESCE(v_item->>'quantity','') !~ '^[1-9][0-9]*$'
       OR (v_item->>'quantity')::integer NOT BETWEEN 1 AND 99
       OR jsonb_typeof(v_item->'item_snapshot') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item->'modifiers') IS DISTINCT FROM 'array'
       OR jsonb_typeof(v_item->'components') IS DISTINCT FROM 'array' THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_LINE_INVALID','message','An order line could not be validated.'));
    END IF;
    BEGIN
      v_unit_price:=(v_item->>'unit_price_snapshot')::numeric;
      v_line_total:=(v_item->>'line_total')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_LINE_AMOUNT_INVALID','message','An order line has an invalid calculated amount.'));
    END;
    IF v_unit_price<0 OR v_line_total<v_unit_price*(v_item->>'quantity')::integer THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_LINE_AMOUNT_INVALID','message','An order line amount is inconsistent.'));
    END IF;
    IF v_item->>'line_kind'='product' THEN
      IF COALESCE(v_item->>'product_id','') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR COALESCE(v_item->>'product_variant_id','') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR v_item->>'deal_id' IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_ORDER_PRODUCT_LINE_INVALID','message','A product line is missing its product or size.'));
      END IF;
    ELSE
      IF COALESCE(v_item->>'deal_id','') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR v_item->>'product_id' IS NOT NULL
         OR v_item->>'product_variant_id' IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_ORDER_DEAL_LINE_INVALID','message','A deal line is missing its published deal reference.'));
      END IF;
    END IF;
    v_calculated_subtotal:=v_calculated_subtotal+v_line_total;
    IF v_calculated_subtotal>9999999999.99 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_TOTAL_INVALID','message','The order total exceeds the supported amount.'));
    END IF;
  END LOOP;

  IF v_calculated_subtotal IS DISTINCT FROM v_subtotal THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_SUBTOTAL_MISMATCH','message','The order subtotal does not match the calculated item totals.'));
  END IF;

  v_phone_count_1m:=0; v_phone_count_10m:=0; v_phone_count_1h:=0;
  SELECT
    pg_catalog.count(*) FILTER(WHERE e.committed_at>=v_now-interval '1 minute'),
    pg_catalog.count(*) FILTER(WHERE e.committed_at>=v_now-interval '10 minutes'),
    pg_catalog.count(*)
  INTO v_phone_count_1m,v_phone_count_10m,v_phone_count_1h
  FROM app_private.website_order_success_events e
  WHERE e.restaurant_id=v_restaurant_id
    AND e.phone_digest=v_phone_digest
    AND e.committed_at>=v_now-interval '1 hour';

  IF v_phone_count_1m>=3 OR v_phone_count_10m>=3 OR v_phone_count_1h>=15 THEN
    SELECT
      CASE WHEN v_phone_count_1m>=3 THEN
        COALESCE(pg_catalog.ceil(EXTRACT(EPOCH FROM (
          (SELECT pg_catalog.min(e.committed_at) FROM app_private.website_order_success_events e
           WHERE e.restaurant_id=v_restaurant_id AND e.phone_digest=v_phone_digest
             AND e.committed_at>=v_now-interval '1 minute')+interval '1 minute'-v_now
        )))::integer,1) ELSE 0 END,
      CASE WHEN v_phone_count_10m>=3 THEN
        COALESCE(pg_catalog.ceil(EXTRACT(EPOCH FROM (
          (SELECT pg_catalog.min(e.committed_at) FROM app_private.website_order_success_events e
           WHERE e.restaurant_id=v_restaurant_id AND e.phone_digest=v_phone_digest
             AND e.committed_at>=v_now-interval '10 minutes')+interval '10 minutes'-v_now
        )))::integer,1) ELSE 0 END,
      CASE WHEN v_phone_count_1h>=15 THEN
        COALESCE(pg_catalog.ceil(EXTRACT(EPOCH FROM (
          (SELECT pg_catalog.min(e.committed_at) FROM app_private.website_order_success_events e
           WHERE e.restaurant_id=v_restaurant_id AND e.phone_digest=v_phone_digest
             AND e.committed_at>=v_now-interval '1 hour')+interval '1 hour'-v_now
        )))::integer,1) ELSE 0 END
    INTO v_retry_1m,v_retry_10m,v_retry_1h;
    v_retry_seconds:=GREATEST(1,v_retry_1m,v_retry_10m,v_retry_1h);
    RETURN pg_catalog.jsonb_build_object(
      'ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_RATE_LIMITED',
        'message','Too many successful website orders for this phone number. Please wait before placing another order.',
        'retry_after_seconds',LEAST(v_retry_seconds,3600)
      )
    );
  END IF;

  v_business_date:=(v_now AT TIME ZONE v_branch_timezone)::date;
  INSERT INTO app_private.order_number_counters(restaurant_id,branch_id,business_date,last_value,updated_at)
  VALUES(v_restaurant_id,v_branch_id,v_business_date,1,v_now)
  ON CONFLICT(branch_id,business_date)
  DO UPDATE SET last_value=app_private.order_number_counters.last_value+1,
                updated_at=EXCLUDED.updated_at
  RETURNING last_value INTO v_counter;
  v_order_number:='FC-'||pg_catalog.to_char(v_business_date,'YYMMDD')||'-'||pg_catalog.lpad(v_counter::text,4,'0');

  v_order_id:=pg_catalog.gen_random_uuid();
  v_payment_summary:=CASE WHEN v_fulfillment='delivery' THEN 'cash_on_delivery' ELSE 'pay_at_pickup' END;

  INSERT INTO public.orders(
    id,restaurant_id,branch_id,order_number,idempotency_key,request_hash,
    source,fulfillment_type,status,customer_name,customer_phone,customer_email,
    delivery_address,delivery_area_id,delivery_area_name_snapshot,delivery_selection_type,
    delivery_other_locality_snapshot,delivery_instructions,delivery_area_fee_snapshot,
    catalog_publication_id,catalog_version,subtotal,discount_amount,delivery_fee,total,
    paid_amount,currency_code,payment_status,payment_method_summary,notes,
    placed_at,created_at,updated_at,last_status_changed_by,last_status_actor_type,last_status_change_reason
  ) VALUES(
    v_order_id,v_restaurant_id,v_branch_id,v_order_number,v_idempotency_key,v_request_hash,
    'website',v_fulfillment,v_status,v_customer_name,v_customer_phone,v_customer_email,
    v_address,v_area_id,v_area_name,v_selection_type,v_other_locality,v_instructions,
    v_delivery_fee,v_publication_id,(p_payload->>'catalog_version')::bigint,
    v_subtotal,v_discount,v_delivery_fee,v_total,0,v_currency,'unpaid',v_payment_summary,
    v_notes,v_now,v_now,v_now,NULL,'website','Customer website order received'
  );

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items) WITH ORDINALITY AS e(value,ordinality) ORDER BY ordinality
  LOOP
    v_ordinal:=v_ordinal+1;
    v_item_quantity:=(v_item->>'quantity')::integer;
    INSERT INTO public.order_items(
      restaurant_id,branch_id,order_id,line_number,line_kind,product_id,product_variant_id,
      deal_id,quantity,product_name_snapshot,variant_label_snapshot,deal_title_snapshot,
      unit_price_snapshot,discount_amount,line_total,item_notes,item_snapshot,catalog_publication_id
    ) VALUES(
      v_restaurant_id,v_branch_id,v_order_id,v_ordinal,v_item->>'line_kind',
      NULLIF(v_item->>'product_id','')::uuid,NULLIF(v_item->>'product_variant_id','')::uuid,
      NULLIF(v_item->>'deal_id','')::uuid,v_item_quantity,
      NULLIF(v_item->>'product_name_snapshot',''),NULLIF(v_item->>'variant_label_snapshot',''),
      NULLIF(v_item->>'deal_title_snapshot',''),(v_item->>'unit_price_snapshot')::numeric,
      0,(v_item->>'line_total')::numeric,NULLIF(v_item->>'item_notes',''),
      v_item->'item_snapshot',v_publication_id
    ) RETURNING id INTO v_item_id;

    FOR v_modifier IN SELECT value FROM pg_catalog.jsonb_array_elements(v_item->'modifiers')
    LOOP
      INSERT INTO public.order_item_modifiers(
        restaurant_id,branch_id,order_id,order_item_id,order_item_component_id,
        modifier_group_id,modifier_id,quantity,modifier_group_name_snapshot,
        modifier_name_snapshot,unit_price_snapshot,total_price_snapshot,modifier_snapshot
      ) VALUES(
        v_restaurant_id,v_branch_id,v_order_id,v_item_id,NULL,
        NULLIF(v_modifier->>'modifier_group_id','')::uuid,
        NULLIF(v_modifier->>'modifier_id','')::uuid,
        (v_modifier->>'quantity')::integer,
        NULLIF(v_modifier->>'modifier_group_name_snapshot',''),
        COALESCE(NULLIF(v_modifier->>'modifier_name_snapshot',''),'Modifier'),
        (v_modifier->>'unit_price_snapshot')::numeric,
        (v_modifier->>'total_price_snapshot')::numeric,
        COALESCE(v_modifier->'modifier_snapshot','{}'::jsonb)
      );
    END LOOP;

    FOR v_component IN SELECT value FROM pg_catalog.jsonb_array_elements(v_item->'components')
    LOOP
      INSERT INTO public.order_item_components(
        restaurant_id,branch_id,order_id,order_item_id,deal_component_id,component_type,
        selected_product_id,selected_variant_id,selected_drink_option_id,quantity,
        name_snapshot,variant_snapshot,volume_snapshot,unit_price_snapshot,component_snapshot
      ) VALUES(
        v_restaurant_id,v_branch_id,v_order_id,v_item_id,
        NULLIF(v_component->>'deal_component_id','')::uuid,
        v_component->>'component_type',
        NULLIF(v_component->>'selected_product_id','')::uuid,
        NULLIF(v_component->>'selected_variant_id','')::uuid,
        NULLIF(v_component->>'selected_drink_option_id','')::uuid,
        (v_component->>'quantity')::integer,
        v_component->>'name_snapshot',
        NULLIF(v_component->>'variant_snapshot',''),
        NULLIF(v_component->>'volume_snapshot',''),
        (v_component->>'unit_price_snapshot')::numeric,
        COALESCE(v_component->'component_snapshot','{}'::jsonb)
      ) RETURNING id INTO v_component_id;

      FOR v_component_modifier IN SELECT value FROM pg_catalog.jsonb_array_elements(v_component->'modifiers')
      LOOP
        INSERT INTO public.order_item_modifiers(
          restaurant_id,branch_id,order_id,order_item_id,order_item_component_id,
          modifier_group_id,modifier_id,quantity,modifier_group_name_snapshot,
          modifier_name_snapshot,unit_price_snapshot,total_price_snapshot,modifier_snapshot
        ) VALUES(
          v_restaurant_id,v_branch_id,v_order_id,v_item_id,v_component_id,
          NULLIF(v_component_modifier->>'modifier_group_id','')::uuid,
          NULLIF(v_component_modifier->>'modifier_id','')::uuid,
          LEAST((v_component_modifier->>'quantity')::integer*v_item_quantity,99),
          NULLIF(v_component_modifier->>'modifier_group_name_snapshot',''),
          COALESCE(NULLIF(v_component_modifier->>'modifier_name_snapshot',''),'Modifier'),
          (v_component_modifier->>'unit_price_snapshot')::numeric,
          (v_component_modifier->>'unit_price_snapshot')::numeric*
            LEAST((v_component_modifier->>'quantity')::integer*v_item_quantity,99),
          COALESCE(v_component_modifier->'modifier_snapshot','{}'::jsonb)
        );
      END LOOP;
    END LOOP;
  END LOOP;

  INSERT INTO public.order_status_history(
    restaurant_id,branch_id,order_id,from_status,to_status,action,
    actor_type,reason_code,reason,metadata,request_id,changed_at
  ) VALUES(
    v_restaurant_id,v_branch_id,v_order_id,NULL,'new','created',
    'website','WEBSITE_ORDER_CREATED','Customer website order received',
    pg_catalog.jsonb_build_object(
      'catalog_publication_id',v_publication_id,
      'catalog_version',(p_payload->>'catalog_version')::bigint,
      'fulfillment_type',v_fulfillment
    ),
    v_idempotency_key::uuid,v_now
  );

  IF v_fulfillment='delivery' THEN
    INSERT INTO public.delivery_tasks(
      restaurant_id,branch_id,order_id,status,
      recipient_name_snapshot,recipient_phone_snapshot,address_snapshot,
      area_name_snapshot,area_id_snapshot,delivery_selection_type_snapshot,
      delivery_fee_snapshot,delivery_instructions_snapshot
    ) VALUES(
      v_restaurant_id,v_branch_id,v_order_id,'dispatch_pending',
      v_customer_name,v_customer_phone,v_address,v_area_name,v_area_id,
      v_selection_type,v_delivery_fee,v_instructions
    );
  END IF;

  INSERT INTO app_private.website_order_success_events(
    restaurant_id,branch_id,order_id,source,phone_digest,idempotency_key,request_hash,committed_at
  ) VALUES(
    v_restaurant_id,v_branch_id,v_order_id,'website',v_phone_digest,v_idempotency_key,v_request_hash,v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'already_processed',false,
    'order_id',v_order_id,'order_number',v_order_number,'status','new',
    'payment_status','unpaid','fulfillment_type',v_fulfillment,
    'subtotal',v_subtotal,'delivery_fee',v_delivery_fee,'total',v_total,
    'currency_code',v_currency,'created_at',v_now
  );
END;
$function$;

ALTER FUNCTION public.flame_chick_create_website_order(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_create_website_order(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_create_website_order(jsonb) TO service_role;

DO $verify_lookup$
DECLARE v_oid oid:=pg_catalog.to_regprocedure('public.flame_chick_get_website_order_by_idempotency(jsonb)');
BEGIN
  IF v_oid IS NULL
     OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
       WHERE p.oid=v_oid AND p.prosecdef
         AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
         AND p.proconfig @> ARRAY['search_path=""'])
     OR NOT pg_catalog.has_function_privilege('service_role',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('public',v_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'FLAME_CHICK_WEBSITE_IDEMPOTENCY_READ_RPC_SECURITY_INVALID';
  END IF;
END;
$verify_lookup$;

DO $verify$
DECLARE
  v_oid oid:=pg_catalog.to_regprocedure('public.flame_chick_create_website_order(jsonb)');
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
    RAISE EXCEPTION 'FLAME_CHICK_WEBSITE_CREATE_ORDER_RPC_SECURITY_INVALID';
  END IF;

  IF pg_catalog.has_table_privilege('service_role','public.orders','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.orders','UPDATE')
     OR pg_catalog.has_table_privilege('service_role','public.order_items','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.order_item_components','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.order_item_modifiers','INSERT')
     OR pg_catalog.has_table_privilege('service_role','app_private.website_order_success_events','INSERT') THEN
    RAISE EXCEPTION 'FLAME_CHICK_WEBSITE_CREATE_ORDER_DIRECT_DML_PRESENT';
  END IF;
END;
$verify$;

COMMIT;

     OR COALESCE(p_payload->>'idempotency_key','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_branch_id uuid;
  v_publication_id uuid;
  v_idempotency_key text;
  v_request_hash text;
  v_phone_digest bytea;
  v_customer_name text;
  v_customer_phone text;
  v_customer_email text;
  v_notes text;
  v_fulfillment text;
  v_currency text;
  v_branch_timezone text;
  v_order_number text;
  v_business_date date;
  v_counter bigint;
  v_now timestamptz;
  v_status text:='new';
  v_payment_summary text;
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
  v_delivery_fee numeric(12,2);
  v_total numeric(12,2);
  v_calculated_subtotal numeric(12,2):=0;
  v_area_id uuid;
  v_area_name text;
  v_area_fee numeric(12,2);
  v_selection_type text;
  v_other_locality text;
  v_address text;
  v_instructions text;
  v_delivery jsonb;
  v_items jsonb;
  v_item jsonb;
  v_modifier jsonb;
  v_component jsonb;
  v_component_modifier jsonb;
  v_item_id uuid;
  v_component_id uuid;
  v_order_id uuid;
  v_existing public.orders%ROWTYPE;
  v_ordinal integer:=0;
  v_item_quantity integer;
  v_line_total numeric(12,2);
  v_unit_price numeric(12,2);
  v_phone_count_1m integer;
  v_phone_count_10m integer;
  v_phone_count_1h integer;
  v_retry_1m integer:=0;
  v_retry_10m integer:=0;
  v_retry_1h integer:=0;
  v_retry_seconds integer:=0;
  v_message text;
BEGIN
  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload)<>'object' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_REQUEST_INVALID','message','A website order request is required.'));
  END IF;

  IF COALESCE(p_payload->>'source','')<>'website' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_SOURCE_REQUIRED','message','This command accepts Website orders only.'));
  END IF;

  IF COALESCE(p_payload->>'branch_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_payload->>'catalog_publication_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_payload->>'idempotency_key','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_payload->>'request_hash','') !~ '^[0-9a-f]{64}$'
     OR COALESCE(p_payload->>'phone_digest','') !~ '^[0-9a-f]{64}$' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_IDENTIFIERS_INVALID','message','Order, publication and privacy identifiers are invalid.'));
  END IF;

  BEGIN
    v_branch_id := (p_payload->>'branch_id')::uuid;
    v_publication_id := (p_payload->>'catalog_publication_id')::uuid;
    v_idempotency_key := pg_catalog.lower(p_payload->>'idempotency_key');
    v_request_hash := pg_catalog.lower(p_payload->>'request_hash');
    v_phone_digest := pg_catalog.decode(pg_catalog.lower(p_payload->>'phone_digest'),'hex');
  EXCEPTION WHEN OTHERS THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_IDENTIFIERS_INVALID','message','Order and privacy identifiers could not be read.'));
  END;

  IF pg_catalog.octet_length(v_phone_digest)<>32 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_PRIVACY_DIGEST_INVALID','message','The customer privacy digest is invalid.'));
  END IF;

  SELECT r.id,r.currency_code,r.timezone
  INTO v_restaurant_id,v_currency,v_branch_timezone
  FROM public.restaurants r
  WHERE r.slug='flame-chick' AND r.is_active;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_RESTAURANT_UNAVAILABLE','message','Flame Chick is not accepting online orders.'));
  END IF;

  -- Serialize both idempotency retries and distinct requests from this phone.
  -- The phone quota is restaurant-wide, so switching branch cannot evade it.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'flame-chick-website-idempotency:'||v_restaurant_id::text||':'||v_idempotency_key,0));
  SELECT o.* INTO v_existing
  FROM public.orders o
  WHERE o.restaurant_id=v_restaurant_id
    AND o.source='website'
    AND o.idempotency_key=v_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    IF v_existing.request_hash<>v_request_hash THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_IDEMPOTENCY_CONFLICT','message','This checkout request ID was already used for different order details.'));
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'already_processed',true,
      'order_id',v_existing.id,'order_number',v_existing.order_number,
      'status',v_existing.status,'payment_status',v_existing.payment_status,
      'subtotal',v_existing.subtotal,'delivery_fee',v_existing.delivery_fee,
      'total',v_existing.total,'currency_code',v_existing.currency_code,
      'created_at',v_existing.created_at
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'flame-chick-website-phone:'||v_restaurant_id::text||':'||pg_catalog.encode(v_phone_digest,'hex'),0));

  v_now:=pg_catalog.clock_timestamp();

  IF jsonb_typeof(p_payload->'catalog_version') IS DISTINCT FROM 'number'
     OR COALESCE(p_payload->>'catalog_version','') !~ '^[1-9][0-9]*$'
     OR COALESCE(p_payload->>'fulfillment_type','') NOT IN ('delivery','pickup')
     OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_PAYLOAD_INVALID','message','The order payload is missing the current catalog version or item list.'));
  END IF;

  v_fulfillment := p_payload->>'fulfillment_type';
  v_items := p_payload->'items';
  IF pg_catalog.jsonb_array_length(v_items)<1 OR pg_catalog.jsonb_array_length(v_items)>100 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_ITEMS_INVALID','message','An order must contain between 1 and 100 items.'));
  END IF;

  -- Only the current immutable publication can be used to commit an order.
  IF NOT EXISTS(
    SELECT 1
    FROM public.catalog_current_publication cp
    JOIN public.catalog_publications p
      ON p.id=cp.publication_id AND p.restaurant_id=cp.restaurant_id
    WHERE cp.restaurant_id=v_restaurant_id
      AND p.id=v_publication_id
      AND p.publication_number=(p_payload->>'catalog_version')::bigint
      AND p.schema_version=3
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','CATALOG_PUBLICATION_CHANGED','message','The published menu changed. Refresh the menu and review your cart before placing the order.'));
  END IF;

  -- Branch must belong to this restaurant and be explicitly website-enabled.
  SELECT r.timezone INTO v_branch_timezone
  FROM public.branches b
  JOIN public.restaurants r ON r.id=b.restaurant_id
  WHERE b.id=v_branch_id AND b.restaurant_id=v_restaurant_id
    AND b.is_active AND b.website_ordering_enabled
    AND CASE WHEN v_fulfillment='delivery' THEN b.website_delivery_enabled
             ELSE b.website_pickup_enabled END;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','BRANCH_FULFILMENT_UNAVAILABLE','message','The selected branch is not accepting this type of website order.'));
  END IF;

  v_customer_name:=NULLIF(pg_catalog.btrim(p_payload->>'customer_name'),'');
  v_customer_phone:=NULLIF(pg_catalog.btrim(p_payload->>'customer_phone'),'');
  v_customer_email:=NULLIF(pg_catalog.btrim(p_payload->>'customer_email'),'');
  v_notes:=NULLIF(pg_catalog.btrim(p_payload->>'notes'),'');
  IF v_customer_name IS NULL OR pg_catalog.char_length(v_customer_name)>160
     OR v_customer_phone IS NULL OR pg_catalog.char_length(v_customer_phone) NOT BETWEEN 3 AND 32
     OR (v_customer_email IS NOT NULL AND pg_catalog.char_length(v_customer_email)>254)
     OR (v_notes IS NOT NULL AND pg_catalog.char_length(v_notes)>1000) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_CUSTOMER_INVALID','message','Customer details are incomplete or invalid.'));
  END IF;

  IF p_payload->>'currency_code' IS DISTINCT FROM v_currency THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_CURRENCY_INVALID','message','The order currency does not match Flame Chick.'));
  END IF;

  BEGIN
    v_subtotal:=(p_payload->>'subtotal')::numeric;
    v_discount:=COALESCE((p_payload->>'discount_amount')::numeric,0);
    v_delivery_fee:=(p_payload->>'delivery_fee')::numeric;
    v_total:=(p_payload->>'total')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_AMOUNT_INVALID','message','The server-calculated order amounts are invalid.'));
  END;
  IF v_subtotal<0 OR v_discount<>0 OR v_delivery_fee<0
     OR v_total<>v_subtotal-v_discount+v_delivery_fee THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_AMOUNT_INVALID','message','The order total or discount does not match the server calculation.'));
  END IF;

  -- Check delivery area/fee again in the same transaction as the order write.
  -- An unset Not Listed fee stays unavailable; explicit zero remains valid.
  v_delivery:=p_payload->'delivery';
  IF v_fulfillment='delivery' THEN
    IF jsonb_typeof(v_delivery) IS DISTINCT FROM 'object' THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_DELIVERY_DETAILS_REQUIRED','message','A delivery address and area are required.'));
    END IF;
    v_selection_type:=COALESCE(v_delivery->>'selection_type',v_delivery->>'selectionType');
    v_address:=NULLIF(pg_catalog.btrim(v_delivery->>'address'),'');
    v_instructions:=NULLIF(pg_catalog.btrim(v_delivery->>'instructions'),'');
    IF v_address IS NULL OR pg_catalog.char_length(v_address) NOT BETWEEN 5 AND 1000
       OR (v_instructions IS NOT NULL AND pg_catalog.char_length(v_instructions)>500) THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_DELIVERY_ADDRESS_INVALID','message','Enter a complete delivery address.'));
    END IF;
    IF v_selection_type='listed_area' THEN
      IF COALESCE(v_delivery->>'area_id',v_delivery->>'areaId','') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_DELIVERY_AREA_INVALID','message','Choose a delivery area from this branch.'));
      END IF;
      v_area_id:=COALESCE(v_delivery->>'area_id',v_delivery->>'areaId')::uuid;
      SELECT da.name,da.delivery_fee INTO v_area_name,v_area_fee
      FROM public.delivery_areas da
      WHERE da.id=v_area_id AND da.restaurant_id=v_restaurant_id
        AND da.branch_id=v_branch_id AND da.is_active;
      IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_DELIVERY_AREA_UNAVAILABLE','message','This delivery area is no longer available at the selected branch.'));
      END IF;
      v_other_locality:=NULL;
    ELSIF v_selection_type='not_listed' THEN
      v_area_id:=NULL;
      v_area_name:='Not Listed / Other';
      v_other_locality:=NULLIF(pg_catalog.btrim(COALESCE(v_delivery->>'other_locality',v_delivery->>'otherLocality','')),'');
      IF v_other_locality IS NULL OR pg_catalog.char_length(v_other_locality)>120 THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_DELIVERY_LOCALITY_REQUIRED','message','Enter your locality for a Not Listed delivery.'));
      END IF;
      SELECT s.not_listed_delivery_fee INTO v_area_fee
      FROM public.branch_delivery_settings s
      WHERE s.restaurant_id=v_restaurant_id AND s.branch_id=v_branch_id;
      IF NOT FOUND OR v_area_fee IS NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_DEFAULT_DELIVERY_FEE_UNCONFIGURED','message','Not Listed delivery is not configured for this branch. Please choose a listed area.'));
      END IF;
    ELSE
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_DELIVERY_SELECTION_INVALID','message','Choose a listed delivery area or Not Listed / Other.'));
    END IF;

    IF v_delivery_fee IS DISTINCT FROM v_area_fee THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_DELIVERY_FEE_CHANGED','message','The delivery fee changed. Refresh the quote before placing your order.'));
    END IF;
  ELSE
    IF v_delivery IS NOT NULL
       OR v_delivery_fee<>0 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_PICKUP_DELIVERY_FIELDS_INVALID','message','Pickup orders cannot include delivery address or fee.'));
    END IF;
    v_area_id:=NULL;
    v_area_name:=NULL;
    v_other_locality:=NULL;
    v_address:=NULL;
    v_instructions:=NULL;
    v_selection_type:=NULL;
    v_area_fee:=0;
  END IF;

  -- The JSON line totals are server-derived by the trusted V3 pricing module.
  -- Check their sum here before inserting any operational records.
  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items)
  LOOP
    IF jsonb_typeof(v_item)<>'object'
       OR COALESCE(v_item->>'line_kind','') NOT IN ('product','deal')
       OR COALESCE(v_item->>'quantity','') !~ '^[1-9][0-9]*$'
       OR (v_item->>'quantity')::integer NOT BETWEEN 1 AND 99
       OR jsonb_typeof(v_item->'item_snapshot') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item->'modifiers') IS DISTINCT FROM 'array'
       OR jsonb_typeof(v_item->'components') IS DISTINCT FROM 'array' THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_LINE_INVALID','message','An order line could not be validated.'));
    END IF;
    BEGIN
      v_unit_price:=(v_item->>'unit_price_snapshot')::numeric;
      v_line_total:=(v_item->>'line_total')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_LINE_AMOUNT_INVALID','message','An order line has an invalid calculated amount.'));
    END;
    IF v_unit_price<0 OR v_line_total<v_unit_price*(v_item->>'quantity')::integer THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_LINE_AMOUNT_INVALID','message','An order line amount is inconsistent.'));
    END IF;
    IF v_item->>'line_kind'='product' THEN
      IF COALESCE(v_item->>'product_id','') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR COALESCE(v_item->>'product_variant_id','') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR v_item->>'deal_id' IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_ORDER_PRODUCT_LINE_INVALID','message','A product line is missing its product or size.'));
      END IF;
    ELSE
      IF COALESCE(v_item->>'deal_id','') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR v_item->>'product_id' IS NOT NULL
         OR v_item->>'product_variant_id' IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_ORDER_DEAL_LINE_INVALID','message','A deal line is missing its published deal reference.'));
      END IF;
    END IF;
    v_calculated_subtotal:=v_calculated_subtotal+v_line_total;
    IF v_calculated_subtotal>9999999999.99 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_TOTAL_INVALID','message','The order total exceeds the supported amount.'));
    END IF;
  END LOOP;

  IF v_calculated_subtotal IS DISTINCT FROM v_subtotal THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_SUBTOTAL_MISMATCH','message','The order subtotal does not match the calculated item totals.'));
  END IF;

  v_phone_count_1m:=0; v_phone_count_10m:=0; v_phone_count_1h:=0;
  SELECT
    pg_catalog.count(*) FILTER(WHERE e.committed_at>=v_now-interval '1 minute'),
    pg_catalog.count(*) FILTER(WHERE e.committed_at>=v_now-interval '10 minutes'),
    pg_catalog.count(*)
  INTO v_phone_count_1m,v_phone_count_10m,v_phone_count_1h
  FROM app_private.website_order_success_events e
  WHERE e.restaurant_id=v_restaurant_id
    AND e.phone_digest=v_phone_digest
    AND e.committed_at>=v_now-interval '1 hour';

  IF v_phone_count_1m>=3 OR v_phone_count_10m>=3 OR v_phone_count_1h>=15 THEN
    SELECT
      CASE WHEN v_phone_count_1m>=3 THEN
        COALESCE(pg_catalog.ceil(EXTRACT(EPOCH FROM (
          (SELECT pg_catalog.min(e.committed_at) FROM app_private.website_order_success_events e
           WHERE e.restaurant_id=v_restaurant_id AND e.phone_digest=v_phone_digest
             AND e.committed_at>=v_now-interval '1 minute')+interval '1 minute'-v_now
        )))::integer,1) ELSE 0 END,
      CASE WHEN v_phone_count_10m>=3 THEN
        COALESCE(pg_catalog.ceil(EXTRACT(EPOCH FROM (
          (SELECT pg_catalog.min(e.committed_at) FROM app_private.website_order_success_events e
           WHERE e.restaurant_id=v_restaurant_id AND e.phone_digest=v_phone_digest
             AND e.committed_at>=v_now-interval '10 minutes')+interval '10 minutes'-v_now
        )))::integer,1) ELSE 0 END,
      CASE WHEN v_phone_count_1h>=15 THEN
        COALESCE(pg_catalog.ceil(EXTRACT(EPOCH FROM (
          (SELECT pg_catalog.min(e.committed_at) FROM app_private.website_order_success_events e
           WHERE e.restaurant_id=v_restaurant_id AND e.phone_digest=v_phone_digest
             AND e.committed_at>=v_now-interval '1 hour')+interval '1 hour'-v_now
        )))::integer,1) ELSE 0 END
    INTO v_retry_1m,v_retry_10m,v_retry_1h;
    v_retry_seconds:=GREATEST(1,v_retry_1m,v_retry_10m,v_retry_1h);
    RETURN pg_catalog.jsonb_build_object(
      'ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_RATE_LIMITED',
        'message','Too many successful website orders for this phone number. Please wait before placing another order.',
        'retry_after_seconds',LEAST(v_retry_seconds,3600)
      )
    );
  END IF;

  v_business_date:=(v_now AT TIME ZONE v_branch_timezone)::date;
  INSERT INTO app_private.order_number_counters(restaurant_id,branch_id,business_date,last_value,updated_at)
  VALUES(v_restaurant_id,v_branch_id,v_business_date,1,v_now)
  ON CONFLICT(branch_id,business_date)
  DO UPDATE SET last_value=app_private.order_number_counters.last_value+1,
                updated_at=EXCLUDED.updated_at
  RETURNING last_value INTO v_counter;
  v_order_number:='FC-'||pg_catalog.to_char(v_business_date,'YYMMDD')||'-'||pg_catalog.lpad(v_counter::text,4,'0');

  v_order_id:=pg_catalog.gen_random_uuid();
  v_payment_summary:=CASE WHEN v_fulfillment='delivery' THEN 'cash_on_delivery' ELSE 'pay_at_pickup' END;

  INSERT INTO public.orders(
    id,restaurant_id,branch_id,order_number,idempotency_key,request_hash,
    source,fulfillment_type,status,customer_name,customer_phone,customer_email,
    delivery_address,delivery_area_id,delivery_area_name_snapshot,delivery_selection_type,
    delivery_other_locality_snapshot,delivery_instructions,delivery_area_fee_snapshot,
    catalog_publication_id,catalog_version,subtotal,discount_amount,delivery_fee,total,
    paid_amount,currency_code,payment_status,payment_method_summary,notes,
    placed_at,created_at,updated_at,last_status_changed_by,last_status_actor_type,last_status_change_reason
  ) VALUES(
    v_order_id,v_restaurant_id,v_branch_id,v_order_number,v_idempotency_key,v_request_hash,
    'website',v_fulfillment,v_status,v_customer_name,v_customer_phone,v_customer_email,
    v_address,v_area_id,v_area_name,v_selection_type,v_other_locality,v_instructions,
    v_delivery_fee,v_publication_id,(p_payload->>'catalog_version')::bigint,
    v_subtotal,v_discount,v_delivery_fee,v_total,0,v_currency,'unpaid',v_payment_summary,
    v_notes,v_now,v_now,v_now,NULL,'website','Customer website order received'
  );

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items) WITH ORDINALITY AS e(value,ordinality) ORDER BY ordinality
  LOOP
    v_ordinal:=v_ordinal+1;
    v_item_quantity:=(v_item->>'quantity')::integer;
    INSERT INTO public.order_items(
      restaurant_id,branch_id,order_id,line_number,line_kind,product_id,product_variant_id,
      deal_id,quantity,product_name_snapshot,variant_label_snapshot,deal_title_snapshot,
      unit_price_snapshot,discount_amount,line_total,item_notes,item_snapshot,catalog_publication_id
    ) VALUES(
      v_restaurant_id,v_branch_id,v_order_id,v_ordinal,v_item->>'line_kind',
      NULLIF(v_item->>'product_id','')::uuid,NULLIF(v_item->>'product_variant_id','')::uuid,
      NULLIF(v_item->>'deal_id','')::uuid,v_item_quantity,
      NULLIF(v_item->>'product_name_snapshot',''),NULLIF(v_item->>'variant_label_snapshot',''),
      NULLIF(v_item->>'deal_title_snapshot',''),(v_item->>'unit_price_snapshot')::numeric,
      0,(v_item->>'line_total')::numeric,NULLIF(v_item->>'item_notes',''),
      v_item->'item_snapshot',v_publication_id
    ) RETURNING id INTO v_item_id;

    FOR v_modifier IN SELECT value FROM pg_catalog.jsonb_array_elements(v_item->'modifiers')
    LOOP
      INSERT INTO public.order_item_modifiers(
        restaurant_id,branch_id,order_id,order_item_id,order_item_component_id,
        modifier_group_id,modifier_id,quantity,modifier_group_name_snapshot,
        modifier_name_snapshot,unit_price_snapshot,total_price_snapshot,modifier_snapshot
      ) VALUES(
        v_restaurant_id,v_branch_id,v_order_id,v_item_id,NULL,
        NULLIF(v_modifier->>'modifier_group_id','')::uuid,
        NULLIF(v_modifier->>'modifier_id','')::uuid,
        (v_modifier->>'quantity')::integer,
        NULLIF(v_modifier->>'modifier_group_name_snapshot',''),
        COALESCE(NULLIF(v_modifier->>'modifier_name_snapshot',''),'Modifier'),
        (v_modifier->>'unit_price_snapshot')::numeric,
        (v_modifier->>'total_price_snapshot')::numeric,
        COALESCE(v_modifier->'modifier_snapshot','{}'::jsonb)
      );
    END LOOP;

    FOR v_component IN SELECT value FROM pg_catalog.jsonb_array_elements(v_item->'components')
    LOOP
      INSERT INTO public.order_item_components(
        restaurant_id,branch_id,order_id,order_item_id,deal_component_id,component_type,
        selected_product_id,selected_variant_id,selected_drink_option_id,quantity,
        name_snapshot,variant_snapshot,volume_snapshot,unit_price_snapshot,component_snapshot
      ) VALUES(
        v_restaurant_id,v_branch_id,v_order_id,v_item_id,
        NULLIF(v_component->>'deal_component_id','')::uuid,
        v_component->>'component_type',
        NULLIF(v_component->>'selected_product_id','')::uuid,
        NULLIF(v_component->>'selected_variant_id','')::uuid,
        NULLIF(v_component->>'selected_drink_option_id','')::uuid,
        (v_component->>'quantity')::integer,
        v_component->>'name_snapshot',
        NULLIF(v_component->>'variant_snapshot',''),
        NULLIF(v_component->>'volume_snapshot',''),
        (v_component->>'unit_price_snapshot')::numeric,
        COALESCE(v_component->'component_snapshot','{}'::jsonb)
      ) RETURNING id INTO v_component_id;

      FOR v_component_modifier IN SELECT value FROM pg_catalog.jsonb_array_elements(v_component->'modifiers')
      LOOP
        INSERT INTO public.order_item_modifiers(
          restaurant_id,branch_id,order_id,order_item_id,order_item_component_id,
          modifier_group_id,modifier_id,quantity,modifier_group_name_snapshot,
          modifier_name_snapshot,unit_price_snapshot,total_price_snapshot,modifier_snapshot
        ) VALUES(
          v_restaurant_id,v_branch_id,v_order_id,v_item_id,v_component_id,
          NULLIF(v_component_modifier->>'modifier_group_id','')::uuid,
          NULLIF(v_component_modifier->>'modifier_id','')::uuid,
          LEAST((v_component_modifier->>'quantity')::integer*v_item_quantity,99),
          NULLIF(v_component_modifier->>'modifier_group_name_snapshot',''),
          COALESCE(NULLIF(v_component_modifier->>'modifier_name_snapshot',''),'Modifier'),
          (v_component_modifier->>'unit_price_snapshot')::numeric,
          (v_component_modifier->>'unit_price_snapshot')::numeric*
            LEAST((v_component_modifier->>'quantity')::integer*v_item_quantity,99),
          COALESCE(v_component_modifier->'modifier_snapshot','{}'::jsonb)
        );
      END LOOP;
    END LOOP;
  END LOOP;

  INSERT INTO public.order_status_history(
    restaurant_id,branch_id,order_id,from_status,to_status,action,
    actor_type,reason_code,reason,metadata,request_id,changed_at
  ) VALUES(
    v_restaurant_id,v_branch_id,v_order_id,NULL,'new','created',
    'website','WEBSITE_ORDER_CREATED','Customer website order received',
    pg_catalog.jsonb_build_object(
      'catalog_publication_id',v_publication_id,
      'catalog_version',(p_payload->>'catalog_version')::bigint,
      'fulfillment_type',v_fulfillment
    ),
    v_idempotency_key::uuid,v_now
  );

  IF v_fulfillment='delivery' THEN
    INSERT INTO public.delivery_tasks(
      restaurant_id,branch_id,order_id,status,
      recipient_name_snapshot,recipient_phone_snapshot,address_snapshot,
      area_name_snapshot,area_id_snapshot,delivery_selection_type_snapshot,
      delivery_fee_snapshot,delivery_instructions_snapshot
    ) VALUES(
      v_restaurant_id,v_branch_id,v_order_id,'dispatch_pending',
      v_customer_name,v_customer_phone,v_address,v_area_name,v_area_id,
      v_selection_type,v_delivery_fee,v_instructions
    );
  END IF;

  INSERT INTO app_private.website_order_success_events(
    restaurant_id,branch_id,order_id,source,phone_digest,idempotency_key,request_hash,committed_at
  ) VALUES(
    v_restaurant_id,v_branch_id,v_order_id,'website',v_phone_digest,v_idempotency_key,v_request_hash,v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'already_processed',false,
    'order_id',v_order_id,'order_number',v_order_number,'status','new',
    'payment_status','unpaid','fulfillment_type',v_fulfillment,
    'subtotal',v_subtotal,'delivery_fee',v_delivery_fee,'total',v_total,
    'currency_code',v_currency,'created_at',v_now
  );
END;
$function$;

ALTER FUNCTION public.flame_chick_create_website_order(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_create_website_order(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_create_website_order(jsonb) TO service_role;

DO $verify$
DECLARE
  v_oid oid:=pg_catalog.to_regprocedure('public.flame_chick_create_website_order(jsonb)');
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
    RAISE EXCEPTION 'FLAME_CHICK_WEBSITE_CREATE_ORDER_RPC_SECURITY_INVALID';
  END IF;

  IF pg_catalog.has_table_privilege('service_role','public.orders','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.orders','UPDATE')
     OR pg_catalog.has_table_privilege('service_role','public.order_items','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.order_item_components','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.order_item_modifiers','INSERT')
     OR pg_catalog.has_table_privilege('service_role','app_private.website_order_success_events','INSERT') THEN
    RAISE EXCEPTION 'FLAME_CHICK_WEBSITE_CREATE_ORDER_DIRECT_DML_PRESENT';
  END IF;
END;
$verify$;

COMMIT;

     OR COALESCE(p_payload->>'request_hash','') !~ '^[0-9a-f]{64}
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_branch_id uuid;
  v_publication_id uuid;
  v_idempotency_key text;
  v_request_hash text;
  v_phone_digest bytea;
  v_customer_name text;
  v_customer_phone text;
  v_customer_email text;
  v_notes text;
  v_fulfillment text;
  v_currency text;
  v_branch_timezone text;
  v_order_number text;
  v_business_date date;
  v_counter bigint;
  v_now timestamptz;
  v_status text:='new';
  v_payment_summary text;
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
  v_delivery_fee numeric(12,2);
  v_total numeric(12,2);
  v_calculated_subtotal numeric(12,2):=0;
  v_area_id uuid;
  v_area_name text;
  v_area_fee numeric(12,2);
  v_selection_type text;
  v_other_locality text;
  v_address text;
  v_instructions text;
  v_delivery jsonb;
  v_items jsonb;
  v_item jsonb;
  v_modifier jsonb;
  v_component jsonb;
  v_component_modifier jsonb;
  v_item_id uuid;
  v_component_id uuid;
  v_order_id uuid;
  v_existing public.orders%ROWTYPE;
  v_ordinal integer:=0;
  v_item_quantity integer;
  v_line_total numeric(12,2);
  v_unit_price numeric(12,2);
  v_phone_count_1m integer;
  v_phone_count_10m integer;
  v_phone_count_1h integer;
  v_retry_1m integer:=0;
  v_retry_10m integer:=0;
  v_retry_1h integer:=0;
  v_retry_seconds integer:=0;
  v_message text;
BEGIN
  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload)<>'object' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_REQUEST_INVALID','message','A website order request is required.'));
  END IF;

  IF COALESCE(p_payload->>'source','')<>'website' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_SOURCE_REQUIRED','message','This command accepts Website orders only.'));
  END IF;

  IF COALESCE(p_payload->>'branch_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_payload->>'catalog_publication_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_payload->>'idempotency_key','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_payload->>'request_hash','') !~ '^[0-9a-f]{64}$'
     OR COALESCE(p_payload->>'phone_digest','') !~ '^[0-9a-f]{64}$' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_IDENTIFIERS_INVALID','message','Order, publication and privacy identifiers are invalid.'));
  END IF;

  BEGIN
    v_branch_id := (p_payload->>'branch_id')::uuid;
    v_publication_id := (p_payload->>'catalog_publication_id')::uuid;
    v_idempotency_key := pg_catalog.lower(p_payload->>'idempotency_key');
    v_request_hash := pg_catalog.lower(p_payload->>'request_hash');
    v_phone_digest := pg_catalog.decode(pg_catalog.lower(p_payload->>'phone_digest'),'hex');
  EXCEPTION WHEN OTHERS THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_IDENTIFIERS_INVALID','message','Order and privacy identifiers could not be read.'));
  END;

  IF pg_catalog.octet_length(v_phone_digest)<>32 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_PRIVACY_DIGEST_INVALID','message','The customer privacy digest is invalid.'));
  END IF;

  SELECT r.id,r.currency_code,r.timezone
  INTO v_restaurant_id,v_currency,v_branch_timezone
  FROM public.restaurants r
  WHERE r.slug='flame-chick' AND r.is_active;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_RESTAURANT_UNAVAILABLE','message','Flame Chick is not accepting online orders.'));
  END IF;

  -- Serialize both idempotency retries and distinct requests from this phone.
  -- The phone quota is restaurant-wide, so switching branch cannot evade it.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'flame-chick-website-idempotency:'||v_restaurant_id::text||':'||v_idempotency_key,0));
  SELECT o.* INTO v_existing
  FROM public.orders o
  WHERE o.restaurant_id=v_restaurant_id
    AND o.source='website'
    AND o.idempotency_key=v_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    IF v_existing.request_hash<>v_request_hash THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_IDEMPOTENCY_CONFLICT','message','This checkout request ID was already used for different order details.'));
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'already_processed',true,
      'order_id',v_existing.id,'order_number',v_existing.order_number,
      'status',v_existing.status,'payment_status',v_existing.payment_status,
      'subtotal',v_existing.subtotal,'delivery_fee',v_existing.delivery_fee,
      'total',v_existing.total,'currency_code',v_existing.currency_code,
      'created_at',v_existing.created_at
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'flame-chick-website-phone:'||v_restaurant_id::text||':'||pg_catalog.encode(v_phone_digest,'hex'),0));

  v_now:=pg_catalog.clock_timestamp();

  IF jsonb_typeof(p_payload->'catalog_version') IS DISTINCT FROM 'number'
     OR COALESCE(p_payload->>'catalog_version','') !~ '^[1-9][0-9]*$'
     OR COALESCE(p_payload->>'fulfillment_type','') NOT IN ('delivery','pickup')
     OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_PAYLOAD_INVALID','message','The order payload is missing the current catalog version or item list.'));
  END IF;

  v_fulfillment := p_payload->>'fulfillment_type';
  v_items := p_payload->'items';
  IF pg_catalog.jsonb_array_length(v_items)<1 OR pg_catalog.jsonb_array_length(v_items)>100 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_ITEMS_INVALID','message','An order must contain between 1 and 100 items.'));
  END IF;

  -- Only the current immutable publication can be used to commit an order.
  IF NOT EXISTS(
    SELECT 1
    FROM public.catalog_current_publication cp
    JOIN public.catalog_publications p
      ON p.id=cp.publication_id AND p.restaurant_id=cp.restaurant_id
    WHERE cp.restaurant_id=v_restaurant_id
      AND p.id=v_publication_id
      AND p.publication_number=(p_payload->>'catalog_version')::bigint
      AND p.schema_version=3
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','CATALOG_PUBLICATION_CHANGED','message','The published menu changed. Refresh the menu and review your cart before placing the order.'));
  END IF;

  -- Branch must belong to this restaurant and be explicitly website-enabled.
  SELECT r.timezone INTO v_branch_timezone
  FROM public.branches b
  JOIN public.restaurants r ON r.id=b.restaurant_id
  WHERE b.id=v_branch_id AND b.restaurant_id=v_restaurant_id
    AND b.is_active AND b.website_ordering_enabled
    AND CASE WHEN v_fulfillment='delivery' THEN b.website_delivery_enabled
             ELSE b.website_pickup_enabled END;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','BRANCH_FULFILMENT_UNAVAILABLE','message','The selected branch is not accepting this type of website order.'));
  END IF;

  v_customer_name:=NULLIF(pg_catalog.btrim(p_payload->>'customer_name'),'');
  v_customer_phone:=NULLIF(pg_catalog.btrim(p_payload->>'customer_phone'),'');
  v_customer_email:=NULLIF(pg_catalog.btrim(p_payload->>'customer_email'),'');
  v_notes:=NULLIF(pg_catalog.btrim(p_payload->>'notes'),'');
  IF v_customer_name IS NULL OR pg_catalog.char_length(v_customer_name)>160
     OR v_customer_phone IS NULL OR pg_catalog.char_length(v_customer_phone) NOT BETWEEN 3 AND 32
     OR (v_customer_email IS NOT NULL AND pg_catalog.char_length(v_customer_email)>254)
     OR (v_notes IS NOT NULL AND pg_catalog.char_length(v_notes)>1000) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_CUSTOMER_INVALID','message','Customer details are incomplete or invalid.'));
  END IF;

  IF p_payload->>'currency_code' IS DISTINCT FROM v_currency THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_CURRENCY_INVALID','message','The order currency does not match Flame Chick.'));
  END IF;

  BEGIN
    v_subtotal:=(p_payload->>'subtotal')::numeric;
    v_discount:=COALESCE((p_payload->>'discount_amount')::numeric,0);
    v_delivery_fee:=(p_payload->>'delivery_fee')::numeric;
    v_total:=(p_payload->>'total')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_AMOUNT_INVALID','message','The server-calculated order amounts are invalid.'));
  END;
  IF v_subtotal<0 OR v_discount<>0 OR v_delivery_fee<0
     OR v_total<>v_subtotal-v_discount+v_delivery_fee THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_AMOUNT_INVALID','message','The order total or discount does not match the server calculation.'));
  END IF;

  -- Check delivery area/fee again in the same transaction as the order write.
  -- An unset Not Listed fee stays unavailable; explicit zero remains valid.
  v_delivery:=p_payload->'delivery';
  IF v_fulfillment='delivery' THEN
    IF jsonb_typeof(v_delivery) IS DISTINCT FROM 'object' THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_DELIVERY_DETAILS_REQUIRED','message','A delivery address and area are required.'));
    END IF;
    v_selection_type:=COALESCE(v_delivery->>'selection_type',v_delivery->>'selectionType');
    v_address:=NULLIF(pg_catalog.btrim(v_delivery->>'address'),'');
    v_instructions:=NULLIF(pg_catalog.btrim(v_delivery->>'instructions'),'');
    IF v_address IS NULL OR pg_catalog.char_length(v_address) NOT BETWEEN 5 AND 1000
       OR (v_instructions IS NOT NULL AND pg_catalog.char_length(v_instructions)>500) THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_DELIVERY_ADDRESS_INVALID','message','Enter a complete delivery address.'));
    END IF;
    IF v_selection_type='listed_area' THEN
      IF COALESCE(v_delivery->>'area_id',v_delivery->>'areaId','') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_DELIVERY_AREA_INVALID','message','Choose a delivery area from this branch.'));
      END IF;
      v_area_id:=COALESCE(v_delivery->>'area_id',v_delivery->>'areaId')::uuid;
      SELECT da.name,da.delivery_fee INTO v_area_name,v_area_fee
      FROM public.delivery_areas da
      WHERE da.id=v_area_id AND da.restaurant_id=v_restaurant_id
        AND da.branch_id=v_branch_id AND da.is_active;
      IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_DELIVERY_AREA_UNAVAILABLE','message','This delivery area is no longer available at the selected branch.'));
      END IF;
      v_other_locality:=NULL;
    ELSIF v_selection_type='not_listed' THEN
      v_area_id:=NULL;
      v_area_name:='Not Listed / Other';
      v_other_locality:=NULLIF(pg_catalog.btrim(COALESCE(v_delivery->>'other_locality',v_delivery->>'otherLocality','')),'');
      IF v_other_locality IS NULL OR pg_catalog.char_length(v_other_locality)>120 THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_DELIVERY_LOCALITY_REQUIRED','message','Enter your locality for a Not Listed delivery.'));
      END IF;
      SELECT s.not_listed_delivery_fee INTO v_area_fee
      FROM public.branch_delivery_settings s
      WHERE s.restaurant_id=v_restaurant_id AND s.branch_id=v_branch_id;
      IF NOT FOUND OR v_area_fee IS NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_DEFAULT_DELIVERY_FEE_UNCONFIGURED','message','Not Listed delivery is not configured for this branch. Please choose a listed area.'));
      END IF;
    ELSE
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_DELIVERY_SELECTION_INVALID','message','Choose a listed delivery area or Not Listed / Other.'));
    END IF;

    IF v_delivery_fee IS DISTINCT FROM v_area_fee THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_DELIVERY_FEE_CHANGED','message','The delivery fee changed. Refresh the quote before placing your order.'));
    END IF;
  ELSE
    IF v_delivery IS NOT NULL
       OR v_delivery_fee<>0 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_PICKUP_DELIVERY_FIELDS_INVALID','message','Pickup orders cannot include delivery address or fee.'));
    END IF;
    v_area_id:=NULL;
    v_area_name:=NULL;
    v_other_locality:=NULL;
    v_address:=NULL;
    v_instructions:=NULL;
    v_selection_type:=NULL;
    v_area_fee:=0;
  END IF;

  -- The JSON line totals are server-derived by the trusted V3 pricing module.
  -- Check their sum here before inserting any operational records.
  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items)
  LOOP
    IF jsonb_typeof(v_item)<>'object'
       OR COALESCE(v_item->>'line_kind','') NOT IN ('product','deal')
       OR COALESCE(v_item->>'quantity','') !~ '^[1-9][0-9]*$'
       OR (v_item->>'quantity')::integer NOT BETWEEN 1 AND 99
       OR jsonb_typeof(v_item->'item_snapshot') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item->'modifiers') IS DISTINCT FROM 'array'
       OR jsonb_typeof(v_item->'components') IS DISTINCT FROM 'array' THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_LINE_INVALID','message','An order line could not be validated.'));
    END IF;
    BEGIN
      v_unit_price:=(v_item->>'unit_price_snapshot')::numeric;
      v_line_total:=(v_item->>'line_total')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_LINE_AMOUNT_INVALID','message','An order line has an invalid calculated amount.'));
    END;
    IF v_unit_price<0 OR v_line_total<v_unit_price*(v_item->>'quantity')::integer THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_LINE_AMOUNT_INVALID','message','An order line amount is inconsistent.'));
    END IF;
    IF v_item->>'line_kind'='product' THEN
      IF COALESCE(v_item->>'product_id','') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR COALESCE(v_item->>'product_variant_id','') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR v_item->>'deal_id' IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_ORDER_PRODUCT_LINE_INVALID','message','A product line is missing its product or size.'));
      END IF;
    ELSE
      IF COALESCE(v_item->>'deal_id','') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR v_item->>'product_id' IS NOT NULL
         OR v_item->>'product_variant_id' IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_ORDER_DEAL_LINE_INVALID','message','A deal line is missing its published deal reference.'));
      END IF;
    END IF;
    v_calculated_subtotal:=v_calculated_subtotal+v_line_total;
    IF v_calculated_subtotal>9999999999.99 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_TOTAL_INVALID','message','The order total exceeds the supported amount.'));
    END IF;
  END LOOP;

  IF v_calculated_subtotal IS DISTINCT FROM v_subtotal THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_SUBTOTAL_MISMATCH','message','The order subtotal does not match the calculated item totals.'));
  END IF;

  v_phone_count_1m:=0; v_phone_count_10m:=0; v_phone_count_1h:=0;
  SELECT
    pg_catalog.count(*) FILTER(WHERE e.committed_at>=v_now-interval '1 minute'),
    pg_catalog.count(*) FILTER(WHERE e.committed_at>=v_now-interval '10 minutes'),
    pg_catalog.count(*)
  INTO v_phone_count_1m,v_phone_count_10m,v_phone_count_1h
  FROM app_private.website_order_success_events e
  WHERE e.restaurant_id=v_restaurant_id
    AND e.phone_digest=v_phone_digest
    AND e.committed_at>=v_now-interval '1 hour';

  IF v_phone_count_1m>=3 OR v_phone_count_10m>=3 OR v_phone_count_1h>=15 THEN
    SELECT
      CASE WHEN v_phone_count_1m>=3 THEN
        COALESCE(pg_catalog.ceil(EXTRACT(EPOCH FROM (
          (SELECT pg_catalog.min(e.committed_at) FROM app_private.website_order_success_events e
           WHERE e.restaurant_id=v_restaurant_id AND e.phone_digest=v_phone_digest
             AND e.committed_at>=v_now-interval '1 minute')+interval '1 minute'-v_now
        )))::integer,1) ELSE 0 END,
      CASE WHEN v_phone_count_10m>=3 THEN
        COALESCE(pg_catalog.ceil(EXTRACT(EPOCH FROM (
          (SELECT pg_catalog.min(e.committed_at) FROM app_private.website_order_success_events e
           WHERE e.restaurant_id=v_restaurant_id AND e.phone_digest=v_phone_digest
             AND e.committed_at>=v_now-interval '10 minutes')+interval '10 minutes'-v_now
        )))::integer,1) ELSE 0 END,
      CASE WHEN v_phone_count_1h>=15 THEN
        COALESCE(pg_catalog.ceil(EXTRACT(EPOCH FROM (
          (SELECT pg_catalog.min(e.committed_at) FROM app_private.website_order_success_events e
           WHERE e.restaurant_id=v_restaurant_id AND e.phone_digest=v_phone_digest
             AND e.committed_at>=v_now-interval '1 hour')+interval '1 hour'-v_now
        )))::integer,1) ELSE 0 END
    INTO v_retry_1m,v_retry_10m,v_retry_1h;
    v_retry_seconds:=GREATEST(1,v_retry_1m,v_retry_10m,v_retry_1h);
    RETURN pg_catalog.jsonb_build_object(
      'ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_RATE_LIMITED',
        'message','Too many successful website orders for this phone number. Please wait before placing another order.',
        'retry_after_seconds',LEAST(v_retry_seconds,3600)
      )
    );
  END IF;

  v_business_date:=(v_now AT TIME ZONE v_branch_timezone)::date;
  INSERT INTO app_private.order_number_counters(restaurant_id,branch_id,business_date,last_value,updated_at)
  VALUES(v_restaurant_id,v_branch_id,v_business_date,1,v_now)
  ON CONFLICT(branch_id,business_date)
  DO UPDATE SET last_value=app_private.order_number_counters.last_value+1,
                updated_at=EXCLUDED.updated_at
  RETURNING last_value INTO v_counter;
  v_order_number:='FC-'||pg_catalog.to_char(v_business_date,'YYMMDD')||'-'||pg_catalog.lpad(v_counter::text,4,'0');

  v_order_id:=pg_catalog.gen_random_uuid();
  v_payment_summary:=CASE WHEN v_fulfillment='delivery' THEN 'cash_on_delivery' ELSE 'pay_at_pickup' END;

  INSERT INTO public.orders(
    id,restaurant_id,branch_id,order_number,idempotency_key,request_hash,
    source,fulfillment_type,status,customer_name,customer_phone,customer_email,
    delivery_address,delivery_area_id,delivery_area_name_snapshot,delivery_selection_type,
    delivery_other_locality_snapshot,delivery_instructions,delivery_area_fee_snapshot,
    catalog_publication_id,catalog_version,subtotal,discount_amount,delivery_fee,total,
    paid_amount,currency_code,payment_status,payment_method_summary,notes,
    placed_at,created_at,updated_at,last_status_changed_by,last_status_actor_type,last_status_change_reason
  ) VALUES(
    v_order_id,v_restaurant_id,v_branch_id,v_order_number,v_idempotency_key,v_request_hash,
    'website',v_fulfillment,v_status,v_customer_name,v_customer_phone,v_customer_email,
    v_address,v_area_id,v_area_name,v_selection_type,v_other_locality,v_instructions,
    v_delivery_fee,v_publication_id,(p_payload->>'catalog_version')::bigint,
    v_subtotal,v_discount,v_delivery_fee,v_total,0,v_currency,'unpaid',v_payment_summary,
    v_notes,v_now,v_now,v_now,NULL,'website','Customer website order received'
  );

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items) WITH ORDINALITY AS e(value,ordinality) ORDER BY ordinality
  LOOP
    v_ordinal:=v_ordinal+1;
    v_item_quantity:=(v_item->>'quantity')::integer;
    INSERT INTO public.order_items(
      restaurant_id,branch_id,order_id,line_number,line_kind,product_id,product_variant_id,
      deal_id,quantity,product_name_snapshot,variant_label_snapshot,deal_title_snapshot,
      unit_price_snapshot,discount_amount,line_total,item_notes,item_snapshot,catalog_publication_id
    ) VALUES(
      v_restaurant_id,v_branch_id,v_order_id,v_ordinal,v_item->>'line_kind',
      NULLIF(v_item->>'product_id','')::uuid,NULLIF(v_item->>'product_variant_id','')::uuid,
      NULLIF(v_item->>'deal_id','')::uuid,v_item_quantity,
      NULLIF(v_item->>'product_name_snapshot',''),NULLIF(v_item->>'variant_label_snapshot',''),
      NULLIF(v_item->>'deal_title_snapshot',''),(v_item->>'unit_price_snapshot')::numeric,
      0,(v_item->>'line_total')::numeric,NULLIF(v_item->>'item_notes',''),
      v_item->'item_snapshot',v_publication_id
    ) RETURNING id INTO v_item_id;

    FOR v_modifier IN SELECT value FROM pg_catalog.jsonb_array_elements(v_item->'modifiers')
    LOOP
      INSERT INTO public.order_item_modifiers(
        restaurant_id,branch_id,order_id,order_item_id,order_item_component_id,
        modifier_group_id,modifier_id,quantity,modifier_group_name_snapshot,
        modifier_name_snapshot,unit_price_snapshot,total_price_snapshot,modifier_snapshot
      ) VALUES(
        v_restaurant_id,v_branch_id,v_order_id,v_item_id,NULL,
        NULLIF(v_modifier->>'modifier_group_id','')::uuid,
        NULLIF(v_modifier->>'modifier_id','')::uuid,
        (v_modifier->>'quantity')::integer,
        NULLIF(v_modifier->>'modifier_group_name_snapshot',''),
        COALESCE(NULLIF(v_modifier->>'modifier_name_snapshot',''),'Modifier'),
        (v_modifier->>'unit_price_snapshot')::numeric,
        (v_modifier->>'total_price_snapshot')::numeric,
        COALESCE(v_modifier->'modifier_snapshot','{}'::jsonb)
      );
    END LOOP;

    FOR v_component IN SELECT value FROM pg_catalog.jsonb_array_elements(v_item->'components')
    LOOP
      INSERT INTO public.order_item_components(
        restaurant_id,branch_id,order_id,order_item_id,deal_component_id,component_type,
        selected_product_id,selected_variant_id,selected_drink_option_id,quantity,
        name_snapshot,variant_snapshot,volume_snapshot,unit_price_snapshot,component_snapshot
      ) VALUES(
        v_restaurant_id,v_branch_id,v_order_id,v_item_id,
        NULLIF(v_component->>'deal_component_id','')::uuid,
        v_component->>'component_type',
        NULLIF(v_component->>'selected_product_id','')::uuid,
        NULLIF(v_component->>'selected_variant_id','')::uuid,
        NULLIF(v_component->>'selected_drink_option_id','')::uuid,
        (v_component->>'quantity')::integer,
        v_component->>'name_snapshot',
        NULLIF(v_component->>'variant_snapshot',''),
        NULLIF(v_component->>'volume_snapshot',''),
        (v_component->>'unit_price_snapshot')::numeric,
        COALESCE(v_component->'component_snapshot','{}'::jsonb)
      ) RETURNING id INTO v_component_id;

      FOR v_component_modifier IN SELECT value FROM pg_catalog.jsonb_array_elements(v_component->'modifiers')
      LOOP
        INSERT INTO public.order_item_modifiers(
          restaurant_id,branch_id,order_id,order_item_id,order_item_component_id,
          modifier_group_id,modifier_id,quantity,modifier_group_name_snapshot,
          modifier_name_snapshot,unit_price_snapshot,total_price_snapshot,modifier_snapshot
        ) VALUES(
          v_restaurant_id,v_branch_id,v_order_id,v_item_id,v_component_id,
          NULLIF(v_component_modifier->>'modifier_group_id','')::uuid,
          NULLIF(v_component_modifier->>'modifier_id','')::uuid,
          LEAST((v_component_modifier->>'quantity')::integer*v_item_quantity,99),
          NULLIF(v_component_modifier->>'modifier_group_name_snapshot',''),
          COALESCE(NULLIF(v_component_modifier->>'modifier_name_snapshot',''),'Modifier'),
          (v_component_modifier->>'unit_price_snapshot')::numeric,
          (v_component_modifier->>'unit_price_snapshot')::numeric*
            LEAST((v_component_modifier->>'quantity')::integer*v_item_quantity,99),
          COALESCE(v_component_modifier->'modifier_snapshot','{}'::jsonb)
        );
      END LOOP;
    END LOOP;
  END LOOP;

  INSERT INTO public.order_status_history(
    restaurant_id,branch_id,order_id,from_status,to_status,action,
    actor_type,reason_code,reason,metadata,request_id,changed_at
  ) VALUES(
    v_restaurant_id,v_branch_id,v_order_id,NULL,'new','created',
    'website','WEBSITE_ORDER_CREATED','Customer website order received',
    pg_catalog.jsonb_build_object(
      'catalog_publication_id',v_publication_id,
      'catalog_version',(p_payload->>'catalog_version')::bigint,
      'fulfillment_type',v_fulfillment
    ),
    v_idempotency_key::uuid,v_now
  );

  IF v_fulfillment='delivery' THEN
    INSERT INTO public.delivery_tasks(
      restaurant_id,branch_id,order_id,status,
      recipient_name_snapshot,recipient_phone_snapshot,address_snapshot,
      area_name_snapshot,area_id_snapshot,delivery_selection_type_snapshot,
      delivery_fee_snapshot,delivery_instructions_snapshot
    ) VALUES(
      v_restaurant_id,v_branch_id,v_order_id,'dispatch_pending',
      v_customer_name,v_customer_phone,v_address,v_area_name,v_area_id,
      v_selection_type,v_delivery_fee,v_instructions
    );
  END IF;

  INSERT INTO app_private.website_order_success_events(
    restaurant_id,branch_id,order_id,source,phone_digest,idempotency_key,request_hash,committed_at
  ) VALUES(
    v_restaurant_id,v_branch_id,v_order_id,'website',v_phone_digest,v_idempotency_key,v_request_hash,v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'already_processed',false,
    'order_id',v_order_id,'order_number',v_order_number,'status','new',
    'payment_status','unpaid','fulfillment_type',v_fulfillment,
    'subtotal',v_subtotal,'delivery_fee',v_delivery_fee,'total',v_total,
    'currency_code',v_currency,'created_at',v_now
  );
END;
$function$;

ALTER FUNCTION public.flame_chick_create_website_order(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_create_website_order(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_create_website_order(jsonb) TO service_role;

DO $verify$
DECLARE
  v_oid oid:=pg_catalog.to_regprocedure('public.flame_chick_create_website_order(jsonb)');
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
    RAISE EXCEPTION 'FLAME_CHICK_WEBSITE_CREATE_ORDER_RPC_SECURITY_INVALID';
  END IF;

  IF pg_catalog.has_table_privilege('service_role','public.orders','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.orders','UPDATE')
     OR pg_catalog.has_table_privilege('service_role','public.order_items','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.order_item_components','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.order_item_modifiers','INSERT')
     OR pg_catalog.has_table_privilege('service_role','app_private.website_order_success_events','INSERT') THEN
    RAISE EXCEPTION 'FLAME_CHICK_WEBSITE_CREATE_ORDER_DIRECT_DML_PRESENT';
  END IF;
END;
$verify$;

COMMIT;
 THEN
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

CREATE OR REPLACE FUNCTION public.flame_chick_create_website_order(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_branch_id uuid;
  v_publication_id uuid;
  v_idempotency_key text;
  v_request_hash text;
  v_phone_digest bytea;
  v_customer_name text;
  v_customer_phone text;
  v_customer_email text;
  v_notes text;
  v_fulfillment text;
  v_currency text;
  v_branch_timezone text;
  v_order_number text;
  v_business_date date;
  v_counter bigint;
  v_now timestamptz;
  v_status text:='new';
  v_payment_summary text;
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
  v_delivery_fee numeric(12,2);
  v_total numeric(12,2);
  v_calculated_subtotal numeric(12,2):=0;
  v_area_id uuid;
  v_area_name text;
  v_area_fee numeric(12,2);
  v_selection_type text;
  v_other_locality text;
  v_address text;
  v_instructions text;
  v_delivery jsonb;
  v_items jsonb;
  v_item jsonb;
  v_modifier jsonb;
  v_component jsonb;
  v_component_modifier jsonb;
  v_item_id uuid;
  v_component_id uuid;
  v_order_id uuid;
  v_existing public.orders%ROWTYPE;
  v_ordinal integer:=0;
  v_item_quantity integer;
  v_line_total numeric(12,2);
  v_unit_price numeric(12,2);
  v_phone_count_1m integer;
  v_phone_count_10m integer;
  v_phone_count_1h integer;
  v_retry_1m integer:=0;
  v_retry_10m integer:=0;
  v_retry_1h integer:=0;
  v_retry_seconds integer:=0;
  v_message text;
BEGIN
  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload)<>'object' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_REQUEST_INVALID','message','A website order request is required.'));
  END IF;

  IF COALESCE(p_payload->>'source','')<>'website' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_SOURCE_REQUIRED','message','This command accepts Website orders only.'));
  END IF;

  IF COALESCE(p_payload->>'branch_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_payload->>'catalog_publication_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_payload->>'idempotency_key','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_payload->>'request_hash','') !~ '^[0-9a-f]{64}$'
     OR COALESCE(p_payload->>'phone_digest','') !~ '^[0-9a-f]{64}$' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_IDENTIFIERS_INVALID','message','Order, publication and privacy identifiers are invalid.'));
  END IF;

  BEGIN
    v_branch_id := (p_payload->>'branch_id')::uuid;
    v_publication_id := (p_payload->>'catalog_publication_id')::uuid;
    v_idempotency_key := pg_catalog.lower(p_payload->>'idempotency_key');
    v_request_hash := pg_catalog.lower(p_payload->>'request_hash');
    v_phone_digest := pg_catalog.decode(pg_catalog.lower(p_payload->>'phone_digest'),'hex');
  EXCEPTION WHEN OTHERS THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_IDENTIFIERS_INVALID','message','Order and privacy identifiers could not be read.'));
  END;

  IF pg_catalog.octet_length(v_phone_digest)<>32 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_PRIVACY_DIGEST_INVALID','message','The customer privacy digest is invalid.'));
  END IF;

  SELECT r.id,r.currency_code,r.timezone
  INTO v_restaurant_id,v_currency,v_branch_timezone
  FROM public.restaurants r
  WHERE r.slug='flame-chick' AND r.is_active;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_RESTAURANT_UNAVAILABLE','message','Flame Chick is not accepting online orders.'));
  END IF;

  -- Serialize both idempotency retries and distinct requests from this phone.
  -- The phone quota is restaurant-wide, so switching branch cannot evade it.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'flame-chick-website-idempotency:'||v_restaurant_id::text||':'||v_idempotency_key,0));
  SELECT o.* INTO v_existing
  FROM public.orders o
  WHERE o.restaurant_id=v_restaurant_id
    AND o.source='website'
    AND o.idempotency_key=v_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    IF v_existing.request_hash<>v_request_hash THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_IDEMPOTENCY_CONFLICT','message','This checkout request ID was already used for different order details.'));
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'already_processed',true,
      'order_id',v_existing.id,'order_number',v_existing.order_number,
      'status',v_existing.status,'payment_status',v_existing.payment_status,
      'subtotal',v_existing.subtotal,'delivery_fee',v_existing.delivery_fee,
      'total',v_existing.total,'currency_code',v_existing.currency_code,
      'created_at',v_existing.created_at
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'flame-chick-website-phone:'||v_restaurant_id::text||':'||pg_catalog.encode(v_phone_digest,'hex'),0));

  v_now:=pg_catalog.clock_timestamp();

  IF jsonb_typeof(p_payload->'catalog_version') IS DISTINCT FROM 'number'
     OR COALESCE(p_payload->>'catalog_version','') !~ '^[1-9][0-9]*$'
     OR COALESCE(p_payload->>'fulfillment_type','') NOT IN ('delivery','pickup')
     OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_PAYLOAD_INVALID','message','The order payload is missing the current catalog version or item list.'));
  END IF;

  v_fulfillment := p_payload->>'fulfillment_type';
  v_items := p_payload->'items';
  IF pg_catalog.jsonb_array_length(v_items)<1 OR pg_catalog.jsonb_array_length(v_items)>100 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_ITEMS_INVALID','message','An order must contain between 1 and 100 items.'));
  END IF;

  -- Only the current immutable publication can be used to commit an order.
  IF NOT EXISTS(
    SELECT 1
    FROM public.catalog_current_publication cp
    JOIN public.catalog_publications p
      ON p.id=cp.publication_id AND p.restaurant_id=cp.restaurant_id
    WHERE cp.restaurant_id=v_restaurant_id
      AND p.id=v_publication_id
      AND p.publication_number=(p_payload->>'catalog_version')::bigint
      AND p.schema_version=3
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','CATALOG_PUBLICATION_CHANGED','message','The published menu changed. Refresh the menu and review your cart before placing the order.'));
  END IF;

  -- Branch must belong to this restaurant and be explicitly website-enabled.
  SELECT r.timezone INTO v_branch_timezone
  FROM public.branches b
  JOIN public.restaurants r ON r.id=b.restaurant_id
  WHERE b.id=v_branch_id AND b.restaurant_id=v_restaurant_id
    AND b.is_active AND b.website_ordering_enabled
    AND CASE WHEN v_fulfillment='delivery' THEN b.website_delivery_enabled
             ELSE b.website_pickup_enabled END;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','BRANCH_FULFILMENT_UNAVAILABLE','message','The selected branch is not accepting this type of website order.'));
  END IF;

  v_customer_name:=NULLIF(pg_catalog.btrim(p_payload->>'customer_name'),'');
  v_customer_phone:=NULLIF(pg_catalog.btrim(p_payload->>'customer_phone'),'');
  v_customer_email:=NULLIF(pg_catalog.btrim(p_payload->>'customer_email'),'');
  v_notes:=NULLIF(pg_catalog.btrim(p_payload->>'notes'),'');
  IF v_customer_name IS NULL OR pg_catalog.char_length(v_customer_name)>160
     OR v_customer_phone IS NULL OR pg_catalog.char_length(v_customer_phone) NOT BETWEEN 3 AND 32
     OR (v_customer_email IS NOT NULL AND pg_catalog.char_length(v_customer_email)>254)
     OR (v_notes IS NOT NULL AND pg_catalog.char_length(v_notes)>1000) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_CUSTOMER_INVALID','message','Customer details are incomplete or invalid.'));
  END IF;

  IF p_payload->>'currency_code' IS DISTINCT FROM v_currency THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_CURRENCY_INVALID','message','The order currency does not match Flame Chick.'));
  END IF;

  BEGIN
    v_subtotal:=(p_payload->>'subtotal')::numeric;
    v_discount:=COALESCE((p_payload->>'discount_amount')::numeric,0);
    v_delivery_fee:=(p_payload->>'delivery_fee')::numeric;
    v_total:=(p_payload->>'total')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_AMOUNT_INVALID','message','The server-calculated order amounts are invalid.'));
  END;
  IF v_subtotal<0 OR v_discount<>0 OR v_delivery_fee<0
     OR v_total<>v_subtotal-v_discount+v_delivery_fee THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_AMOUNT_INVALID','message','The order total or discount does not match the server calculation.'));
  END IF;

  -- Check delivery area/fee again in the same transaction as the order write.
  -- An unset Not Listed fee stays unavailable; explicit zero remains valid.
  v_delivery:=p_payload->'delivery';
  IF v_fulfillment='delivery' THEN
    IF jsonb_typeof(v_delivery) IS DISTINCT FROM 'object' THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_DELIVERY_DETAILS_REQUIRED','message','A delivery address and area are required.'));
    END IF;
    v_selection_type:=COALESCE(v_delivery->>'selection_type',v_delivery->>'selectionType');
    v_address:=NULLIF(pg_catalog.btrim(v_delivery->>'address'),'');
    v_instructions:=NULLIF(pg_catalog.btrim(v_delivery->>'instructions'),'');
    IF v_address IS NULL OR pg_catalog.char_length(v_address) NOT BETWEEN 5 AND 1000
       OR (v_instructions IS NOT NULL AND pg_catalog.char_length(v_instructions)>500) THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_DELIVERY_ADDRESS_INVALID','message','Enter a complete delivery address.'));
    END IF;
    IF v_selection_type='listed_area' THEN
      IF COALESCE(v_delivery->>'area_id',v_delivery->>'areaId','') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_DELIVERY_AREA_INVALID','message','Choose a delivery area from this branch.'));
      END IF;
      v_area_id:=COALESCE(v_delivery->>'area_id',v_delivery->>'areaId')::uuid;
      SELECT da.name,da.delivery_fee INTO v_area_name,v_area_fee
      FROM public.delivery_areas da
      WHERE da.id=v_area_id AND da.restaurant_id=v_restaurant_id
        AND da.branch_id=v_branch_id AND da.is_active;
      IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_DELIVERY_AREA_UNAVAILABLE','message','This delivery area is no longer available at the selected branch.'));
      END IF;
      v_other_locality:=NULL;
    ELSIF v_selection_type='not_listed' THEN
      v_area_id:=NULL;
      v_area_name:='Not Listed / Other';
      v_other_locality:=NULLIF(pg_catalog.btrim(COALESCE(v_delivery->>'other_locality',v_delivery->>'otherLocality','')),'');
      IF v_other_locality IS NULL OR pg_catalog.char_length(v_other_locality)>120 THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_DELIVERY_LOCALITY_REQUIRED','message','Enter your locality for a Not Listed delivery.'));
      END IF;
      SELECT s.not_listed_delivery_fee INTO v_area_fee
      FROM public.branch_delivery_settings s
      WHERE s.restaurant_id=v_restaurant_id AND s.branch_id=v_branch_id;
      IF NOT FOUND OR v_area_fee IS NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_DEFAULT_DELIVERY_FEE_UNCONFIGURED','message','Not Listed delivery is not configured for this branch. Please choose a listed area.'));
      END IF;
    ELSE
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_DELIVERY_SELECTION_INVALID','message','Choose a listed delivery area or Not Listed / Other.'));
    END IF;

    IF v_delivery_fee IS DISTINCT FROM v_area_fee THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_DELIVERY_FEE_CHANGED','message','The delivery fee changed. Refresh the quote before placing your order.'));
    END IF;
  ELSE
    IF v_delivery IS NOT NULL
       OR v_delivery_fee<>0 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_PICKUP_DELIVERY_FIELDS_INVALID','message','Pickup orders cannot include delivery address or fee.'));
    END IF;
    v_area_id:=NULL;
    v_area_name:=NULL;
    v_other_locality:=NULL;
    v_address:=NULL;
    v_instructions:=NULL;
    v_selection_type:=NULL;
    v_area_fee:=0;
  END IF;

  -- The JSON line totals are server-derived by the trusted V3 pricing module.
  -- Check their sum here before inserting any operational records.
  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items)
  LOOP
    IF jsonb_typeof(v_item)<>'object'
       OR COALESCE(v_item->>'line_kind','') NOT IN ('product','deal')
       OR COALESCE(v_item->>'quantity','') !~ '^[1-9][0-9]*$'
       OR (v_item->>'quantity')::integer NOT BETWEEN 1 AND 99
       OR jsonb_typeof(v_item->'item_snapshot') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item->'modifiers') IS DISTINCT FROM 'array'
       OR jsonb_typeof(v_item->'components') IS DISTINCT FROM 'array' THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_LINE_INVALID','message','An order line could not be validated.'));
    END IF;
    BEGIN
      v_unit_price:=(v_item->>'unit_price_snapshot')::numeric;
      v_line_total:=(v_item->>'line_total')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_LINE_AMOUNT_INVALID','message','An order line has an invalid calculated amount.'));
    END;
    IF v_unit_price<0 OR v_line_total<v_unit_price*(v_item->>'quantity')::integer THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_LINE_AMOUNT_INVALID','message','An order line amount is inconsistent.'));
    END IF;
    IF v_item->>'line_kind'='product' THEN
      IF COALESCE(v_item->>'product_id','') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR COALESCE(v_item->>'product_variant_id','') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR v_item->>'deal_id' IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_ORDER_PRODUCT_LINE_INVALID','message','A product line is missing its product or size.'));
      END IF;
    ELSE
      IF COALESCE(v_item->>'deal_id','') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR v_item->>'product_id' IS NOT NULL
         OR v_item->>'product_variant_id' IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','WEBSITE_ORDER_DEAL_LINE_INVALID','message','A deal line is missing its published deal reference.'));
      END IF;
    END IF;
    v_calculated_subtotal:=v_calculated_subtotal+v_line_total;
    IF v_calculated_subtotal>9999999999.99 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_TOTAL_INVALID','message','The order total exceeds the supported amount.'));
    END IF;
  END LOOP;

  IF v_calculated_subtotal IS DISTINCT FROM v_subtotal THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','WEBSITE_ORDER_SUBTOTAL_MISMATCH','message','The order subtotal does not match the calculated item totals.'));
  END IF;

  v_phone_count_1m:=0; v_phone_count_10m:=0; v_phone_count_1h:=0;
  SELECT
    pg_catalog.count(*) FILTER(WHERE e.committed_at>=v_now-interval '1 minute'),
    pg_catalog.count(*) FILTER(WHERE e.committed_at>=v_now-interval '10 minutes'),
    pg_catalog.count(*)
  INTO v_phone_count_1m,v_phone_count_10m,v_phone_count_1h
  FROM app_private.website_order_success_events e
  WHERE e.restaurant_id=v_restaurant_id
    AND e.phone_digest=v_phone_digest
    AND e.committed_at>=v_now-interval '1 hour';

  IF v_phone_count_1m>=3 OR v_phone_count_10m>=3 OR v_phone_count_1h>=15 THEN
    SELECT
      CASE WHEN v_phone_count_1m>=3 THEN
        COALESCE(pg_catalog.ceil(EXTRACT(EPOCH FROM (
          (SELECT pg_catalog.min(e.committed_at) FROM app_private.website_order_success_events e
           WHERE e.restaurant_id=v_restaurant_id AND e.phone_digest=v_phone_digest
             AND e.committed_at>=v_now-interval '1 minute')+interval '1 minute'-v_now
        )))::integer,1) ELSE 0 END,
      CASE WHEN v_phone_count_10m>=3 THEN
        COALESCE(pg_catalog.ceil(EXTRACT(EPOCH FROM (
          (SELECT pg_catalog.min(e.committed_at) FROM app_private.website_order_success_events e
           WHERE e.restaurant_id=v_restaurant_id AND e.phone_digest=v_phone_digest
             AND e.committed_at>=v_now-interval '10 minutes')+interval '10 minutes'-v_now
        )))::integer,1) ELSE 0 END,
      CASE WHEN v_phone_count_1h>=15 THEN
        COALESCE(pg_catalog.ceil(EXTRACT(EPOCH FROM (
          (SELECT pg_catalog.min(e.committed_at) FROM app_private.website_order_success_events e
           WHERE e.restaurant_id=v_restaurant_id AND e.phone_digest=v_phone_digest
             AND e.committed_at>=v_now-interval '1 hour')+interval '1 hour'-v_now
        )))::integer,1) ELSE 0 END
    INTO v_retry_1m,v_retry_10m,v_retry_1h;
    v_retry_seconds:=GREATEST(1,v_retry_1m,v_retry_10m,v_retry_1h);
    RETURN pg_catalog.jsonb_build_object(
      'ok',false,'error',pg_catalog.jsonb_build_object(
        'code','WEBSITE_ORDER_RATE_LIMITED',
        'message','Too many successful website orders for this phone number. Please wait before placing another order.',
        'retry_after_seconds',LEAST(v_retry_seconds,3600)
      )
    );
  END IF;

  v_business_date:=(v_now AT TIME ZONE v_branch_timezone)::date;
  INSERT INTO app_private.order_number_counters(restaurant_id,branch_id,business_date,last_value,updated_at)
  VALUES(v_restaurant_id,v_branch_id,v_business_date,1,v_now)
  ON CONFLICT(branch_id,business_date)
  DO UPDATE SET last_value=app_private.order_number_counters.last_value+1,
                updated_at=EXCLUDED.updated_at
  RETURNING last_value INTO v_counter;
  v_order_number:='FC-'||pg_catalog.to_char(v_business_date,'YYMMDD')||'-'||pg_catalog.lpad(v_counter::text,4,'0');

  v_order_id:=pg_catalog.gen_random_uuid();
  v_payment_summary:=CASE WHEN v_fulfillment='delivery' THEN 'cash_on_delivery' ELSE 'pay_at_pickup' END;

  INSERT INTO public.orders(
    id,restaurant_id,branch_id,order_number,idempotency_key,request_hash,
    source,fulfillment_type,status,customer_name,customer_phone,customer_email,
    delivery_address,delivery_area_id,delivery_area_name_snapshot,delivery_selection_type,
    delivery_other_locality_snapshot,delivery_instructions,delivery_area_fee_snapshot,
    catalog_publication_id,catalog_version,subtotal,discount_amount,delivery_fee,total,
    paid_amount,currency_code,payment_status,payment_method_summary,notes,
    placed_at,created_at,updated_at,last_status_changed_by,last_status_actor_type,last_status_change_reason
  ) VALUES(
    v_order_id,v_restaurant_id,v_branch_id,v_order_number,v_idempotency_key,v_request_hash,
    'website',v_fulfillment,v_status,v_customer_name,v_customer_phone,v_customer_email,
    v_address,v_area_id,v_area_name,v_selection_type,v_other_locality,v_instructions,
    v_delivery_fee,v_publication_id,(p_payload->>'catalog_version')::bigint,
    v_subtotal,v_discount,v_delivery_fee,v_total,0,v_currency,'unpaid',v_payment_summary,
    v_notes,v_now,v_now,v_now,NULL,'website','Customer website order received'
  );

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items) WITH ORDINALITY AS e(value,ordinality) ORDER BY ordinality
  LOOP
    v_ordinal:=v_ordinal+1;
    v_item_quantity:=(v_item->>'quantity')::integer;
    INSERT INTO public.order_items(
      restaurant_id,branch_id,order_id,line_number,line_kind,product_id,product_variant_id,
      deal_id,quantity,product_name_snapshot,variant_label_snapshot,deal_title_snapshot,
      unit_price_snapshot,discount_amount,line_total,item_notes,item_snapshot,catalog_publication_id
    ) VALUES(
      v_restaurant_id,v_branch_id,v_order_id,v_ordinal,v_item->>'line_kind',
      NULLIF(v_item->>'product_id','')::uuid,NULLIF(v_item->>'product_variant_id','')::uuid,
      NULLIF(v_item->>'deal_id','')::uuid,v_item_quantity,
      NULLIF(v_item->>'product_name_snapshot',''),NULLIF(v_item->>'variant_label_snapshot',''),
      NULLIF(v_item->>'deal_title_snapshot',''),(v_item->>'unit_price_snapshot')::numeric,
      0,(v_item->>'line_total')::numeric,NULLIF(v_item->>'item_notes',''),
      v_item->'item_snapshot',v_publication_id
    ) RETURNING id INTO v_item_id;

    FOR v_modifier IN SELECT value FROM pg_catalog.jsonb_array_elements(v_item->'modifiers')
    LOOP
      INSERT INTO public.order_item_modifiers(
        restaurant_id,branch_id,order_id,order_item_id,order_item_component_id,
        modifier_group_id,modifier_id,quantity,modifier_group_name_snapshot,
        modifier_name_snapshot,unit_price_snapshot,total_price_snapshot,modifier_snapshot
      ) VALUES(
        v_restaurant_id,v_branch_id,v_order_id,v_item_id,NULL,
        NULLIF(v_modifier->>'modifier_group_id','')::uuid,
        NULLIF(v_modifier->>'modifier_id','')::uuid,
        (v_modifier->>'quantity')::integer,
        NULLIF(v_modifier->>'modifier_group_name_snapshot',''),
        COALESCE(NULLIF(v_modifier->>'modifier_name_snapshot',''),'Modifier'),
        (v_modifier->>'unit_price_snapshot')::numeric,
        (v_modifier->>'total_price_snapshot')::numeric,
        COALESCE(v_modifier->'modifier_snapshot','{}'::jsonb)
      );
    END LOOP;

    FOR v_component IN SELECT value FROM pg_catalog.jsonb_array_elements(v_item->'components')
    LOOP
      INSERT INTO public.order_item_components(
        restaurant_id,branch_id,order_id,order_item_id,deal_component_id,component_type,
        selected_product_id,selected_variant_id,selected_drink_option_id,quantity,
        name_snapshot,variant_snapshot,volume_snapshot,unit_price_snapshot,component_snapshot
      ) VALUES(
        v_restaurant_id,v_branch_id,v_order_id,v_item_id,
        NULLIF(v_component->>'deal_component_id','')::uuid,
        v_component->>'component_type',
        NULLIF(v_component->>'selected_product_id','')::uuid,
        NULLIF(v_component->>'selected_variant_id','')::uuid,
        NULLIF(v_component->>'selected_drink_option_id','')::uuid,
        (v_component->>'quantity')::integer,
        v_component->>'name_snapshot',
        NULLIF(v_component->>'variant_snapshot',''),
        NULLIF(v_component->>'volume_snapshot',''),
        (v_component->>'unit_price_snapshot')::numeric,
        COALESCE(v_component->'component_snapshot','{}'::jsonb)
      ) RETURNING id INTO v_component_id;

      FOR v_component_modifier IN SELECT value FROM pg_catalog.jsonb_array_elements(v_component->'modifiers')
      LOOP
        INSERT INTO public.order_item_modifiers(
          restaurant_id,branch_id,order_id,order_item_id,order_item_component_id,
          modifier_group_id,modifier_id,quantity,modifier_group_name_snapshot,
          modifier_name_snapshot,unit_price_snapshot,total_price_snapshot,modifier_snapshot
        ) VALUES(
          v_restaurant_id,v_branch_id,v_order_id,v_item_id,v_component_id,
          NULLIF(v_component_modifier->>'modifier_group_id','')::uuid,
          NULLIF(v_component_modifier->>'modifier_id','')::uuid,
          LEAST((v_component_modifier->>'quantity')::integer*v_item_quantity,99),
          NULLIF(v_component_modifier->>'modifier_group_name_snapshot',''),
          COALESCE(NULLIF(v_component_modifier->>'modifier_name_snapshot',''),'Modifier'),
          (v_component_modifier->>'unit_price_snapshot')::numeric,
          (v_component_modifier->>'unit_price_snapshot')::numeric*
            LEAST((v_component_modifier->>'quantity')::integer*v_item_quantity,99),
          COALESCE(v_component_modifier->'modifier_snapshot','{}'::jsonb)
        );
      END LOOP;
    END LOOP;
  END LOOP;

  INSERT INTO public.order_status_history(
    restaurant_id,branch_id,order_id,from_status,to_status,action,
    actor_type,reason_code,reason,metadata,request_id,changed_at
  ) VALUES(
    v_restaurant_id,v_branch_id,v_order_id,NULL,'new','created',
    'website','WEBSITE_ORDER_CREATED','Customer website order received',
    pg_catalog.jsonb_build_object(
      'catalog_publication_id',v_publication_id,
      'catalog_version',(p_payload->>'catalog_version')::bigint,
      'fulfillment_type',v_fulfillment
    ),
    v_idempotency_key::uuid,v_now
  );

  IF v_fulfillment='delivery' THEN
    INSERT INTO public.delivery_tasks(
      restaurant_id,branch_id,order_id,status,
      recipient_name_snapshot,recipient_phone_snapshot,address_snapshot,
      area_name_snapshot,area_id_snapshot,delivery_selection_type_snapshot,
      delivery_fee_snapshot,delivery_instructions_snapshot
    ) VALUES(
      v_restaurant_id,v_branch_id,v_order_id,'dispatch_pending',
      v_customer_name,v_customer_phone,v_address,v_area_name,v_area_id,
      v_selection_type,v_delivery_fee,v_instructions
    );
  END IF;

  INSERT INTO app_private.website_order_success_events(
    restaurant_id,branch_id,order_id,source,phone_digest,idempotency_key,request_hash,committed_at
  ) VALUES(
    v_restaurant_id,v_branch_id,v_order_id,'website',v_phone_digest,v_idempotency_key,v_request_hash,v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'already_processed',false,
    'order_id',v_order_id,'order_number',v_order_number,'status','new',
    'payment_status','unpaid','fulfillment_type',v_fulfillment,
    'subtotal',v_subtotal,'delivery_fee',v_delivery_fee,'total',v_total,
    'currency_code',v_currency,'created_at',v_now
  );
END;
$function$;

ALTER FUNCTION public.flame_chick_create_website_order(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_create_website_order(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_create_website_order(jsonb) TO service_role;

DO $verify$
DECLARE
  v_oid oid:=pg_catalog.to_regprocedure('public.flame_chick_create_website_order(jsonb)');
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
    RAISE EXCEPTION 'FLAME_CHICK_WEBSITE_CREATE_ORDER_RPC_SECURITY_INVALID';
  END IF;

  IF pg_catalog.has_table_privilege('service_role','public.orders','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.orders','UPDATE')
     OR pg_catalog.has_table_privilege('service_role','public.order_items','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.order_item_components','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.order_item_modifiers','INSERT')
     OR pg_catalog.has_table_privilege('service_role','app_private.website_order_success_events','INSERT') THEN
    RAISE EXCEPTION 'FLAME_CHICK_WEBSITE_CREATE_ORDER_DIRECT_DML_PRESENT';
  END IF;
END;
$verify$;

COMMIT;
