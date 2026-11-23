-- Disposable behavioral QA for Flame Chick V3 Website order creation.
-- Synthetic catalog, branch, order, delivery and phone-quota rows all roll back.
BEGIN;

DO $fixture$
DECLARE
  v_restaurant uuid:=gen_random_uuid();
  v_branch uuid:=gen_random_uuid();
  v_user uuid:='c9999999-9999-4999-8999-999999999991';
  v_category uuid:=gen_random_uuid();
  v_product uuid:=gen_random_uuid();
  v_variant uuid:=gen_random_uuid();
  v_area uuid:=gen_random_uuid();
  v_publication uuid:=gen_random_uuid();
  v_now timestamptz:=clock_timestamp();
BEGIN
  IF current_user<>'postgres' OR session_user<>'postgres' THEN
    RAISE EXCEPTION 'WEBSITE_ORDER_FIXTURE_REQUIRES_POSTGRES';
  END IF;
  IF EXISTS(SELECT 1 FROM public.restaurants WHERE slug='flame-chick')
     OR EXISTS(SELECT 1 FROM auth.users WHERE id=v_user) THEN
    RAISE EXCEPTION 'WEBSITE_ORDER_FIXTURE_TENANT_CONFLICT';
  END IF;

  INSERT INTO public.restaurants(id,name,slug,currency_code,timezone,is_active)
  VALUES(v_restaurant,'QA Flame Chick Website','flame-chick','PKR','Asia/Karachi',true);

  INSERT INTO public.branches(
    id,restaurant_id,branch_code,name,is_active,
    website_ordering_enabled,website_delivery_enabled,website_pickup_enabled
  ) VALUES(
    v_branch,v_restaurant,'qa-web','QA Website Branch',true,true,true,true
  );

  INSERT INTO auth.users(
    id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    is_sso_user,is_anonymous
  ) VALUES(
    v_user,'authenticated','authenticated','qa-website-publisher@example.invalid','',
    v_now,'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,
    v_now,v_now,false,false
  );

  INSERT INTO public.categories(id,restaurant_id,category_kind,name_en,is_active)
  VALUES(v_category,v_restaurant,'menu','QA Menu',true);

  INSERT INTO public.products(
    id,restaurant_id,category_id,category_kind,name_en,is_active,is_available
  ) VALUES(v_product,v_restaurant,v_category,'menu','QA Website Product',true,true);

  INSERT INTO public.product_variants(
    id,restaurant_id,product_id,size_key,size_label,price,is_active,is_available,
    is_standalone_sellable
  ) VALUES(v_variant,v_restaurant,v_product,'REGULAR','Regular',100,true,true,true);

  INSERT INTO public.branch_product_availability(
    restaurant_id,branch_id,product_id,is_available
  ) VALUES(v_restaurant,v_branch,v_product,true);

  INSERT INTO public.branch_variant_availability(
    restaurant_id,branch_id,product_id,product_variant_id,is_available
  ) VALUES(v_restaurant,v_branch,v_product,v_variant,true);

  INSERT INTO public.delivery_areas(
    id,restaurant_id,branch_id,name,delivery_fee,is_active
  ) VALUES(v_area,v_restaurant,v_branch,'QA Delivery Area',50,true);

  INSERT INTO public.branch_delivery_settings(
    branch_id,restaurant_id,not_listed_delivery_fee
  ) VALUES(v_branch,v_restaurant,NULL);

  INSERT INTO public.catalog_publications(
    id,restaurant_id,publication_number,draft_revision,schema_version,
    pricing_engine_version,snapshot,snapshot_sha256,published_by,published_at
  ) VALUES(
    v_publication,v_restaurant,1,1,3,'qa-v3',
    jsonb_build_object('schemaVersion',3,'publicationId',v_publication),
    repeat('a',64),v_user,v_now
  );

  INSERT INTO public.catalog_current_publication(
    restaurant_id,publication_id,updated_by
  ) VALUES(v_restaurant,v_publication,v_user);

  PERFORM set_config('test.website.restaurant_id',v_restaurant::text,true);
  PERFORM set_config('test.website.branch_id',v_branch::text,true);
  PERFORM set_config('test.website.user_id',v_user::text,true);
  PERFORM set_config('test.website.product_id',v_product::text,true);
  PERFORM set_config('test.website.variant_id',v_variant::text,true);
  PERFORM set_config('test.website.area_id',v_area::text,true);
  PERFORM set_config('test.website.publication_id',v_publication::text,true);
END
$fixture$;

DO $behavior$
DECLARE
  r uuid:=current_setting('test.website.restaurant_id')::uuid;
  b uuid:=current_setting('test.website.branch_id')::uuid;
  p uuid:=current_setting('test.website.product_id')::uuid;
  v uuid:=current_setting('test.website.variant_id')::uuid;
  area uuid:=current_setting('test.website.area_id')::uuid;
  publication uuid:=current_setting('test.website.publication_id')::uuid;
  digest text:=repeat('b',64);
  request_id uuid:=gen_random_uuid();
  changed_request_id uuid:=gen_random_uuid();
  payload jsonb;
  result jsonb;
  order_id uuid;
  events_count integer;
  order_count integer;
  item_count integer;
  task_count integer;
  history_count integer;
  i integer;
BEGIN
  payload:=jsonb_build_object(
    'source','website',
    'branch_id',b,
    'catalog_publication_id',publication,
    'catalog_version',1,
    'idempotency_key',request_id,
    'request_hash',repeat('a',64),
    'phone_digest',digest,
    'fulfillment_type','delivery',
    'currency_code','PKR',
    'customer_name','QA Customer',
    'customer_phone','03000000000',
    'customer_email',NULL,
    'notes',NULL,
    'subtotal',100,
    'discount_amount',0,
    'delivery_fee',50,
    'total',150,
    'delivery',jsonb_build_object(
      'selection_type','listed_area',
      'area_id',area,
      'address','100 QA Road, Karachi',
      'instructions','Ring the bell'
    ),
    'items',jsonb_build_array(jsonb_build_object(
      'line_kind','product',
      'product_id',p,
      'product_variant_id',v,
      'deal_id',NULL,
      'quantity',1,
      'product_name_snapshot','QA Website Product',
      'variant_label_snapshot','Regular',
      'deal_title_snapshot',NULL,
      'unit_price_snapshot',100,
      'line_total',100,
      'item_notes',NULL,
      'item_snapshot',jsonb_build_object('schemaVersion',3,'publicationId',publication),
      'modifiers','[]'::jsonb,
      'components','[]'::jsonb
    ))
  );

  -- A stale or client-forged area fee is rejected without creating any rows.
  result:=public.flame_chick_create_website_order(
    jsonb_set(payload,'{delivery_fee}',to_jsonb(49),true)
  );
  IF result->>'ok'<>'false'
     OR result#>>'{error,code}'<>'WEBSITE_DELIVERY_FEE_CHANGED'
     OR EXISTS(SELECT 1 FROM public.orders WHERE restaurant_id=r)
     OR EXISTS(SELECT 1 FROM app_private.website_order_success_events WHERE restaurant_id=r) THEN
    RAISE EXCEPTION 'WEBSITE_DELIVERY_FEE_REVALIDATION_FAILED: %',result;
  END IF;

  -- A valid delivery commits one order, item, history row, delivery task and
  -- rate event, with a server-generated order number and unpaid COD state.
  result:=public.flame_chick_create_website_order(payload);
  IF result->>'ok'<>'true' OR result->>'already_processed'<>'false'
     OR result->>'status'<>'new' OR result->>'payment_status'<>'unpaid'
     OR (result->>'subtotal')::numeric<>100
     OR (result->>'delivery_fee')::numeric<>50
     OR (result->>'total')::numeric<>150
     OR result->>'order_number' IS NULL THEN
    RAISE EXCEPTION 'WEBSITE_DELIVERY_ORDER_COMMIT_FAILED: %',result;
  END IF;
  order_id:=(result->>'order_id')::uuid;

  IF (SELECT count(*) FROM public.orders WHERE id=order_id AND restaurant_id=r)<>1
     OR (SELECT count(*) FROM public.order_items WHERE order_id=order_id)<>1
     OR (SELECT count(*) FROM public.order_status_history WHERE order_id=order_id AND action='created')<>1
     OR (SELECT count(*) FROM public.delivery_tasks WHERE order_id=order_id AND status='dispatch_pending')<>1
     OR (SELECT count(*) FROM app_private.website_order_success_events
         WHERE order_id=order_id AND source='website' AND phone_digest=decode(digest,'hex'))<>1 THEN
    RAISE EXCEPTION 'WEBSITE_DELIVERY_ORDER_RECORDS_INCOMPLETE';
  END IF;

  -- The dedicated lookup RPC returns an already committed order without
  -- depending on a still-current catalog or delivery fee.
  result:=public.flame_chick_get_website_order_by_idempotency(jsonb_build_object(
    'branch_id',b,'idempotency_key',request_id,'request_hash',repeat('a',64)));
  IF result->>'ok'<>'true' OR result->>'found'<>'true'
     OR (result->>'order_id')::uuid<>order_id
     OR result->>'already_processed'<>'true' THEN
    RAISE EXCEPTION 'WEBSITE_IDEMPOTENCY_LOOKUP_REPLAY_FAILED: %',result;
  END IF;

  -- Same request through the create RPC also returns the original row without
  -- consuming a second success quota slot.
  result:=public.flame_chick_create_website_order(payload);
  IF result->>'ok'<>'true' OR result->>'already_processed'<>'true'
     OR (result->>'order_id')::uuid<>order_id
     OR (SELECT count(*) FROM public.orders WHERE restaurant_id=r)<>1
     OR (SELECT count(*) FROM app_private.website_order_success_events WHERE restaurant_id=r)<>1 THEN
    RAISE EXCEPTION 'WEBSITE_CREATE_ORDER_IDEMPOTENCY_FAILED: %',result;
  END IF;

  result:=public.flame_chick_get_website_order_by_idempotency(jsonb_build_object(
    'branch_id',b,'idempotency_key',request_id,'request_hash',repeat('c',64)));
  IF result->>'ok'<>'false'
     OR result#>>'{error,code}'<>'WEBSITE_ORDER_IDEMPOTENCY_CONFLICT' THEN
    RAISE EXCEPTION 'WEBSITE_IDEMPOTENCY_CHANGED_HASH_NOT_REJECTED: %',result;
  END IF;

  -- A fee or selection changed after the quote but before commit is rejected.
  changed_request_id:=gen_random_uuid();
  result:=public.flame_chick_create_website_order(
    jsonb_set(payload,'{idempotency_key}',to_jsonb(changed_request_id),true)
      #- '{delivery}'
  );
  IF result->>'ok'<>'false'
     OR result#>>'{error,code}'<>'WEBSITE_DELIVERY_DETAILS_REQUIRED' THEN
    RAISE EXCEPTION 'WEBSITE_MISSING_DELIVERY_DETAILS_NOT_REJECTED: %',result;
  END IF;

  -- A pickup order accepts explicit JSON null delivery and zero delivery fee,
  -- and does not create a delivery task.
  changed_request_id:=gen_random_uuid();
  result:=public.flame_chick_create_website_order(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(payload,'{idempotency_key}',to_jsonb(changed_request_id),true),
          '{fulfillment_type}',to_jsonb('pickup'),true),
        '{delivery_fee}',to_jsonb(0),true),
      '{total}',to_jsonb(100),true)
      || jsonb_build_object('delivery',NULL)
  );
  IF result->>'ok'<>'true' OR result->>'fulfillment_type'<>'pickup'
     OR (result->>'delivery_fee')::numeric<>0 OR (result->>'total')::numeric<>100 THEN
    RAISE EXCEPTION 'WEBSITE_PICKUP_ORDER_FAILED: %',result;
  END IF;
  IF EXISTS(SELECT 1 FROM public.delivery_tasks WHERE order_id=(result->>'order_id')::uuid) THEN
    RAISE EXCEPTION 'WEBSITE_PICKUP_CREATED_DELIVERY_TASK';
  END IF;

  -- Atomic success-order quotas: 3/one minute, 3/ten minutes, 15/hour.
  -- Move only synthetic committed_at values within this rollback transaction
  -- to exercise exact rolling windows without sleeping.
  SELECT count(*) INTO events_count FROM app_private.website_order_success_events
  WHERE restaurant_id=r AND phone_digest=decode(digest,'hex');

  -- Already two successful orders for this digest; third is allowed.
  IF events_count<>2 THEN
    RAISE EXCEPTION 'WEBSITE_QUOTA_FIXTURE_EXPECTED_TWO_SUCCESS_EVENTS: %',events_count;
  END IF;
  changed_request_id:=gen_random_uuid();
  result:=public.flame_chick_create_website_order(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(payload,'{idempotency_key}',to_jsonb(changed_request_id),true),
          '{fulfillment_type}',to_jsonb('pickup'),true),
        '{delivery_fee}',to_jsonb(0),true),
      '{total}',to_jsonb(100),true)
      || jsonb_build_object('delivery',NULL)
  );
  IF result->>'ok'<>'true' THEN
    RAISE EXCEPTION 'WEBSITE_THIRD_ORDER_WITHIN_QUOTA_FAILED: %',result;
  END IF;

  -- The fourth success is blocked in the one-minute window.
  changed_request_id:=gen_random_uuid();
  result:=public.flame_chick_create_website_order(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(payload,'{idempotency_key}',to_jsonb(changed_request_id),true),
          '{fulfillment_type}',to_jsonb('pickup'),true),
        '{delivery_fee}',to_jsonb(0),true),
      '{total}',to_jsonb(100),true)
      || jsonb_build_object('delivery',NULL)
  );
  IF result->>'ok'<>'false'
     OR result#>>'{error,code}'<>'WEBSITE_ORDER_RATE_LIMITED' THEN
    RAISE EXCEPTION 'WEBSITE_ONE_MINUTE_QUOTA_NOT_ENFORCED: %',result;
  END IF;

  UPDATE app_private.website_order_success_events
  SET committed_at=clock_timestamp()-interval '2 minutes'
  WHERE restaurant_id=r AND phone_digest=decode(digest,'hex');

  changed_request_id:=gen_random_uuid();
  result:=public.flame_chick_create_website_order(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(payload,'{idempotency_key}',to_jsonb(changed_request_id),true),
          '{fulfillment_type}',to_jsonb('pickup'),true),
        '{delivery_fee}',to_jsonb(0),true),
      '{total}',to_jsonb(100),true)
      || jsonb_build_object('delivery',NULL)
  );
  IF result->>'ok'<>'false'
     OR result#>>'{error,code}'<>'WEBSITE_ORDER_RATE_LIMITED' THEN
    RAISE EXCEPTION 'WEBSITE_TEN_MINUTE_QUOTA_NOT_ENFORCED: %',result;
  END IF;

  -- Events are now outside 10 minutes but within one hour. Create twelve more
  -- successes, shifting the previous synthetic success timestamps before each
  -- request so neither shorter rolling window masks the hourly check.
  UPDATE app_private.website_order_success_events
  SET committed_at=clock_timestamp()-interval '11 minutes'
  WHERE restaurant_id=r AND phone_digest=decode(digest,'hex');

  FOR i IN 1..12 LOOP
    changed_request_id:=gen_random_uuid();
    payload:=jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(payload,'{idempotency_key}',to_jsonb(changed_request_id),true),
          '{fulfillment_type}',to_jsonb('pickup'),true),
        '{delivery_fee}',to_jsonb(0),true),
      '{total}',to_jsonb(100),true)
      || jsonb_build_object('delivery',NULL);
    IF i>1 THEN
      UPDATE app_private.website_order_success_events
      SET committed_at=clock_timestamp()-interval '11 minutes'
      WHERE restaurant_id=r AND phone_digest=decode(digest,'hex');
    END IF;
    result:=public.flame_chick_create_website_order(payload);
    IF result->>'ok'<>'true' THEN
      RAISE EXCEPTION 'WEBSITE_HOURLY_QUOTA_FIXTURE_ORDER_%_FAILED: %',i,result;
    END IF;
  END LOOP;

  -- Fifteenth success committed: the sixteenth is rejected by the hourly cap.
  SELECT count(*) INTO events_count FROM app_private.website_order_success_events
  WHERE restaurant_id=r AND phone_digest=decode(digest,'hex')
    AND committed_at>=clock_timestamp()-interval '1 hour';
  IF events_count<>15 THEN
    RAISE EXCEPTION 'WEBSITE_HOURLY_QUOTA_EXPECTED_FIFTEEN_EVENTS: %',events_count;
  END IF;

  changed_request_id:=gen_random_uuid();
  payload:=jsonb_set(payload,'{idempotency_key}',to_jsonb(changed_request_id),true);
  result:=public.flame_chick_create_website_order(payload);
  IF result->>'ok'<>'false'
     OR result#>>'{error,code}'<>'WEBSITE_ORDER_RATE_LIMITED' THEN
    RAISE EXCEPTION 'WEBSITE_HOURLY_QUOTA_NOT_ENFORCED: %',result;
  END IF;

END
$behavior$;

ROLLBACK;

DO $cleanup$
BEGIN
  IF EXISTS(SELECT 1 FROM public.restaurants WHERE slug='flame-chick')
     OR EXISTS(SELECT 1 FROM auth.users WHERE email='qa-website-publisher@example.invalid') THEN
    RAISE EXCEPTION 'WEBSITE_ORDER_FIXTURE_NOT_ROLLED_BACK';
  END IF;
END
$cleanup$;
