-- Disposable behavioral QA for the unified Flame Chick POS sync RPC.
-- Every synthetic restaurant, staff, catalog, order, payment and delivery row rolls back.
BEGIN;

DO $preflight$
BEGIN
  IF current_user<>'postgres' OR session_user<>'postgres' THEN
    RAISE EXCEPTION 'POS_SYNC_TEST_REQUIRES_POSTGRES';
  END IF;
  IF pg_catalog.to_regprocedure('public.flame_chick_sync_pos_order(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'POS_SYNC_RPC_MISSING';
  END IF;
  IF pg_catalog.to_regprocedure('public.flame_chick_collect_order_payment(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'POS_PAYMENT_RPC_MISSING';
  END IF;
END;
$preflight$;

DO $fixtures$
DECLARE
  r uuid:=gen_random_uuid();
  b uuid:=gen_random_uuid();
  cashier uuid:='d1111111-1111-4111-8111-111111111111';
  rider uuid:='d1111111-1111-4111-8111-111111111112';
  category uuid:=gen_random_uuid();
  product uuid:=gen_random_uuid();
  variant uuid:=gen_random_uuid();
  publication uuid:=gen_random_uuid();
  area uuid:=gen_random_uuid();
  now_at timestamptz:=clock_timestamp();
BEGIN
  IF EXISTS(SELECT 1 FROM public.restaurants WHERE slug='qa-pos-sync-flame-chick')
     OR EXISTS(SELECT 1 FROM auth.users WHERE id IN(cashier,rider)) THEN
    RAISE EXCEPTION 'POS_SYNC_TEST_FIXTURE_CONFLICT';
  END IF;

  INSERT INTO public.restaurants(id,name,slug,currency_code,timezone,is_active)
  VALUES(r,'QA Flame Chick POS Sync','qa-pos-sync-flame-chick','PKR','Asia/Karachi',true);
  INSERT INTO public.branches(id,restaurant_id,branch_code,name,is_active,timezone)
  VALUES(b,r,'qa-pos','QA POS Branch',true,'Asia/Karachi');

  INSERT INTO auth.users(
    id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous
  ) VALUES
    (cashier,'authenticated','authenticated','qa-pos-cashier@example.invalid','',now_at,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now_at,now_at,false,false),
    (rider,'authenticated','authenticated','qa-pos-rider@example.invalid','',now_at,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now_at,now_at,false,false);

  INSERT INTO public.user_profiles(user_id,display_name,is_active)
  VALUES(cashier,'QA POS Cashier',true),(rider,'QA POS Rider',true);
  INSERT INTO public.user_roles(
    restaurant_id,user_id,role_key,branch_id,is_active,assigned_by,reason,request_id
  ) VALUES
    (r,cashier,'cashier',b,true,cashier,'Disposable POS sync QA',gen_random_uuid()),
    (r,rider,'rider',b,true,cashier,'Disposable POS sync QA',gen_random_uuid());

  INSERT INTO public.categories(id,restaurant_id,category_kind,name_en,is_active)
  VALUES(category,r,'menu','QA POS Menu',true);
  INSERT INTO public.products(
    id,restaurant_id,category_id,category_kind,name_en,is_active,is_available
  ) VALUES(product,r,category,'menu','QA POS Product',true,true);
  INSERT INTO public.product_variants(
    id,restaurant_id,product_id,size_key,size_label,price,is_active,is_available,is_standalone_sellable
  ) VALUES(variant,r,product,'REGULAR','Regular',100,true,true,true);

  INSERT INTO public.catalog_publications(
    id,restaurant_id,publication_number,draft_revision,schema_version,pricing_engine_version,
    snapshot,snapshot_sha256,published_by,published_at
  ) VALUES(publication,r,1,1,3,'qa-pos-sync-v1',
    jsonb_build_object('schemaVersion',3,'publicationId',publication),repeat('a',64),cashier,now_at);
  INSERT INTO public.catalog_current_publication(restaurant_id,publication_id,updated_by)
  VALUES(r,publication,cashier);

  INSERT INTO public.delivery_areas(id,restaurant_id,branch_id,name,delivery_fee,is_active)
  VALUES(area,r,b,'QA POS Delivery Area',50,true);
  INSERT INTO public.branch_delivery_settings(branch_id,restaurant_id,not_listed_delivery_fee)
  VALUES(b,r,NULL);

  PERFORM set_config('qa.pos.restaurant_id',r::text,true);
  PERFORM set_config('qa.pos.branch_id',b::text,true);
  PERFORM set_config('qa.pos.cashier_id',cashier::text,true);
  PERFORM set_config('qa.pos.rider_id',rider::text,true);
  PERFORM set_config('qa.pos.product_id',product::text,true);
  PERFORM set_config('qa.pos.variant_id',variant::text,true);
  PERFORM set_config('qa.pos.publication_id',publication::text,true);
  PERFORM set_config('qa.pos.delivery_area_id',area::text,true);
END;
$fixtures$;

DO $behavior$
DECLARE
  r uuid:=current_setting('qa.pos.restaurant_id')::uuid;
  b uuid:=current_setting('qa.pos.branch_id')::uuid;
  cashier uuid:=current_setting('qa.pos.cashier_id')::uuid;
  rider uuid:=current_setting('qa.pos.rider_id')::uuid;
  product uuid:=current_setting('qa.pos.product_id')::uuid;
  variant uuid:=current_setting('qa.pos.variant_id')::uuid;
  publication uuid:=current_setting('qa.pos.publication_id')::uuid;
  area uuid:=current_setting('qa.pos.delivery_area_id')::uuid;
  dine_local uuid:='e1111111-1111-4111-8111-111111111111';
  pickup_local uuid:='e1111111-1111-4111-8111-111111111112';
  delivery_local uuid:='e1111111-1111-4111-8111-111111111113';
  duplicate_table_local uuid:='e1111111-1111-4111-8111-111111111114';
  req uuid:='e2222222-2222-4222-8222-222222222221';
  result jsonb;
  payload jsonb;
  changed jsonb;
  v_dine_order_id uuid;
  pickup_order_id uuid;
  delivery_order_id uuid;
  payment_request uuid:='e3333333-3333-4333-8333-333333333331';
  unique_table_rejected boolean:=false;
BEGIN
  -- Dine-in walk-in: no phone, no payment method, table is server persisted.
  payload:=jsonb_build_object(
    'source','pos','restaurant_id',r,'branch_id',b,'actor_user_id',cashier,
    'local_order_id',dine_local::text,'idempotency_key','flame-chick-pos-'||dine_local::text,
    'request_hash',repeat('1',64),'local_revision',1,
    'fulfillment_type','dine_in','customer_name','Dine-in Walk-in','customer_phone',NULL,
    'table_reference','TABLE-01','table_label_snapshot','Table 1',
    'catalog_publication_id',publication,'catalog_version',1,
    'subtotal',100,'delivery_fee',0,'total',100,
    'items',jsonb_build_array(jsonb_build_object(
      'line_kind','product','product_id',product,'product_variant_id',variant,'deal_id',NULL,
      'quantity',1,'product_name_snapshot','QA POS Product','variant_label_snapshot','Regular',
      'deal_title_snapshot',NULL,'unit_price_snapshot',100,'line_total',100,'item_notes',NULL,
      'item_snapshot',jsonb_build_object('schemaVersion',3,'publicationId',publication,'source','server_v3_pricing'),
      'modifiers','[]'::jsonb,'components','[]'::jsonb
    ))
  );
  result:=public.flame_chick_sync_pos_order(payload);
  IF result->>'ok'<>'true' OR result->>'status'<>'new' OR result->>'payment_status'<>'unpaid'
     OR result->>'fulfillment_type'<>'dine_in' OR (result->>'balance_due')::numeric<>100
     OR (SELECT customer_phone FROM public.orders WHERE local_order_id=dine_local::text) IS NOT NULL
     OR (SELECT payment_method_summary FROM public.orders WHERE local_order_id=dine_local::text) IS NOT NULL THEN
    RAISE EXCEPTION 'POS_DINE_IN_WALKIN_CREATE_FAILED: %',result;
  END IF;
  v_dine_order_id:=(result->>'order_id')::uuid;

  -- Exact retry replays the same server order; changed facts at the same
  -- revision are rejected. A later revision updates that still-new order.
  result:=public.flame_chick_sync_pos_order(payload);
  IF result->>'ok'<>'true' OR result->>'already_processed'<>'true'
     OR (result->>'order_id')::uuid<>v_dine_order_id
     OR (SELECT count(*) FROM public.orders WHERE local_order_id=dine_local::text)<>1 THEN
    RAISE EXCEPTION 'POS_DINE_IN_IDEMPOTENT_REPLAY_FAILED: %',result;
  END IF;

  changed:=jsonb_set(payload,'{notes}',to_jsonb('changed at same revision'),true);
  result:=public.flame_chick_sync_pos_order(changed);
  IF result->>'ok'<>'false' OR result#>>'{error,code}'<>'POS_ORDER_REVISION_CONFLICT' THEN
    RAISE EXCEPTION 'POS_SAME_REVISION_CHANGED_PAYLOAD_NOT_REJECTED: %',result;
  END IF;

  changed:=jsonb_set(
    jsonb_set(payload,'{local_revision}',to_jsonb(2),true),
    '{notes}',to_jsonb('valid later revision'),true
  );
  changed:=jsonb_set(changed,'{request_hash}',to_jsonb(repeat('2',64)),true);
  result:=public.flame_chick_sync_pos_order(changed);
  IF result->>'ok'<>'true' OR (result->>'local_revision')::bigint<>2
     OR (SELECT notes FROM public.orders WHERE id=v_dine_order_id)<>'valid later revision'
     OR (SELECT count(*) FROM public.order_items WHERE order_id=v_dine_order_id)<>1 THEN
    RAISE EXCEPTION 'POS_DINE_IN_REVISION_UPDATE_FAILED: %',result;
  END IF;

  result:=public.flame_chick_sync_pos_order(payload);
  IF result->>'ok'<>'true' OR result->>'stale_revision'<>'true'
     OR (result->>'local_revision')::bigint<>2 THEN
    RAISE EXCEPTION 'POS_STALE_OFFLINE_REVISION_NOT_IGNORED: %',result;
  END IF;

  -- A second terminal cannot create another active check for the same table.
  changed:=jsonb_set(payload,'{local_order_id}',to_jsonb(duplicate_table_local::text),true);
  changed:=jsonb_set(changed,'{idempotency_key}',to_jsonb('flame-chick-pos-'||duplicate_table_local::text),true);
  changed:=jsonb_set(changed,'{request_hash}',to_jsonb(repeat('3',64)),true);
  BEGIN
    PERFORM public.flame_chick_sync_pos_order(changed);
  EXCEPTION WHEN unique_violation THEN
    unique_table_rejected:=true;
  END;
  IF NOT unique_table_rejected OR (SELECT count(*) FROM public.orders WHERE branch_id=b AND table_reference='TABLE-01'
       AND status NOT IN ('completed','cancelled','rejected','returned'))<>1 THEN
    RAISE EXCEPTION 'POS_DINE_IN_TABLE_CONCURRENCY_NOT_ENFORCED';
  END IF;

  -- Rider is not authorized to create/synchronize an order, even if the
  -- service-only database function is called directly with that actor.
  changed:=jsonb_set(payload,'{actor_user_id}',to_jsonb(rider::text),true);
  result:=public.flame_chick_sync_pos_order(changed);
  IF result->>'ok'<>'false' OR result#>>'{error,code}'<>'POS_STAFF_REQUIRED' THEN
    RAISE EXCEPTION 'POS_RIDER_SYNC_ROLE_NOT_REJECTED: %',result;
  END IF;

  -- Takeaway walk-in with no phone can be paid at POS. The payment entry is
  -- separate from initial order state and uses a stable payment request ID.
  payload:=jsonb_build_object(
    'source','pos','restaurant_id',r,'branch_id',b,'actor_user_id',cashier,
    'local_order_id',pickup_local::text,'idempotency_key','flame-chick-pos-'||pickup_local::text,
    'request_hash',repeat('4',64),'local_revision',1,
    'fulfillment_type','pickup','customer_name','Takeaway Walk-in','customer_phone',NULL,
    'catalog_publication_id',publication,'catalog_version',1,
    'subtotal',100,'delivery_fee',0,'total',100,
    'items',jsonb_build_array(jsonb_build_object(
      'line_kind','product','product_id',product,'product_variant_id',variant,'deal_id',NULL,
      'quantity',1,'product_name_snapshot','QA POS Product','variant_label_snapshot','Regular',
      'deal_title_snapshot',NULL,'unit_price_snapshot',100,'line_total',100,'item_notes',NULL,
      'item_snapshot',jsonb_build_object('schemaVersion',3,'publicationId',publication),
      'modifiers','[]'::jsonb,'components','[]'::jsonb
    )),
    'payment',jsonb_build_object('request_id',payment_request,'amount',100,'payment_method','card')
  );
  result:=public.flame_chick_sync_pos_order(payload);
  IF result->>'ok'<>'true' OR result->>'status'<>'completed' OR result->>'payment_status'<>'paid'
     OR result->>'fulfillment_type'<>'pickup'
     OR (SELECT count(*) FROM public.payments WHERE order_id=(result->>'order_id')::uuid AND payment_method='card')<>1 THEN
    RAISE EXCEPTION 'POS_TAKEAWAY_CARD_COLLECTION_FAILED: %',result;
  END IF;
  pickup_order_id:=(result->>'order_id')::uuid;
  result:=public.flame_chick_sync_pos_order(payload);
  IF result->>'ok'<>'true' OR (result->>'order_id')::uuid<>pickup_order_id
     OR (SELECT count(*) FROM public.payments WHERE order_id=pickup_order_id)<>1 THEN
    RAISE EXCEPTION 'POS_TAKEAWAY_PAYMENT_REPLAY_FAILED: %',result;
  END IF;

  -- Delivery: server-verified listed-area fee is persisted; a delivery task is
  -- created and order stays unpaid until rider delivers and cashier collects.
  payload:=jsonb_build_object(
    'source','pos','restaurant_id',r,'branch_id',b,'actor_user_id',cashier,
    'local_order_id',delivery_local::text,'idempotency_key','flame-chick-pos-'||delivery_local::text,
    'request_hash',repeat('5',64),'local_revision',1,
    'fulfillment_type','delivery','customer_name','Delivery QA Customer','customer_phone','03000000000',
    'catalog_publication_id',publication,'catalog_version',1,
    'subtotal',100,'delivery_fee',50,'total',150,
    'delivery',jsonb_build_object('selection_type','listed_area','area_id',area,
      'address','100 QA Road, Karachi','instructions','Ring the bell'),
    'items',jsonb_build_array(jsonb_build_object(
      'line_kind','product','product_id',product,'product_variant_id',variant,'deal_id',NULL,
      'quantity',1,'product_name_snapshot','QA POS Product','variant_label_snapshot','Regular',
      'deal_title_snapshot',NULL,'unit_price_snapshot',100,'line_total',100,'item_notes',NULL,
      'item_snapshot',jsonb_build_object('schemaVersion',3,'publicationId',publication),
      'modifiers','[]'::jsonb,'components','[]'::jsonb
    ))
  );
  result:=public.flame_chick_sync_pos_order(payload);
  IF result->>'ok'<>'true' OR result->>'status'<>'new' OR result->>'payment_status'<>'unpaid'
     OR result->>'fulfillment_type'<>'delivery' OR (result->>'balance_due')::numeric<>150
     OR (SELECT count(*) FROM public.delivery_tasks WHERE order_id=(result->>'order_id')::uuid AND status='dispatch_pending')<>1 THEN
    RAISE EXCEPTION 'POS_DELIVERY_CREATE_FAILED: %',result;
  END IF;
  delivery_order_id:=(result->>'order_id')::uuid;

  -- Rider delivery is not payment collection. Once Delivered, Cashier collection
  -- records Bank and only then completes the order and creates its history event.
  UPDATE public.orders SET status='delivered',delivered_at=clock_timestamp()
  WHERE id=delivery_order_id;
  UPDATE public.delivery_tasks SET status='delivered',delivered_at=clock_timestamp()
  WHERE order_id=delivery_order_id;

  result:=public.flame_chick_collect_order_payment(jsonb_build_object(
    'order_id',delivery_order_id,'actor_user_id',cashier,'request_id',req,
    'amount',150,'payment_method','bank'
  ));
  IF result->>'ok'<>'true' OR result->>'completed'<>'true'
     OR result->>'order_status'<>'completed' OR result->>'payment_method'<>'bank'
     OR (SELECT status FROM public.orders WHERE id=delivery_order_id)<>'completed'
     OR (SELECT count(*) FROM public.payments WHERE order_id=delivery_order_id AND payment_method='bank')<>1
     OR NOT EXISTS(SELECT 1 FROM public.order_status_history WHERE order_id=delivery_order_id AND action='payment_collection_completed') THEN
    RAISE EXCEPTION 'POS_DELIVERY_BANK_COLLECTION_FAILED: %',result;
  END IF;
  result:=public.flame_chick_collect_order_payment(jsonb_build_object(
    'order_id',delivery_order_id,'actor_user_id',cashier,'request_id',req,
    'amount',150,'payment_method','bank'
  ));
  IF result->>'ok'<>'true' OR result->>'already_processed'<>'true'
     OR result->>'completed'<>'true'
     OR (SELECT count(*) FROM public.payments WHERE order_id=delivery_order_id)<>1 THEN
    RAISE EXCEPTION 'POS_DELIVERY_PAYMENT_REPLAY_FAILED: %',result;
  END IF;
END;
$behavior$;

ROLLBACK;

DO $cleanup$
BEGIN
  IF EXISTS(SELECT 1 FROM public.restaurants WHERE slug='qa-pos-sync-flame-chick')
     OR EXISTS(SELECT 1 FROM auth.users WHERE email IN('qa-pos-cashier@example.invalid','qa-pos-rider@example.invalid')) THEN
    RAISE EXCEPTION 'POS_SYNC_TEST_FIXTURES_NOT_ROLLED_BACK';
  END IF;
END;
$cleanup$;
