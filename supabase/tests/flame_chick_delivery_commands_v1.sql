-- Disposable behavioral QA for Flame Chick delivery commands V1.
-- All synthetic Auth identities, orders, tasks, offers, assignments and events roll back.
BEGIN;
DO $delivery_commands$
DECLARE
  r uuid:=gen_random_uuid();
  b uuid:=gen_random_uuid();
  a uuid:=gen_random_uuid();
  rider_one uuid:='a5555555-5555-4555-8555-555555555551';
  rider_two uuid:='a5555555-5555-4555-8555-555555555552';
  manager uuid:='a5555555-5555-4555-8555-555555555553';
  o1 uuid:=gen_random_uuid();
  o2 uuid:=gen_random_uuid();
  t1 uuid:=gen_random_uuid();
  t2 uuid:=gen_random_uuid();
  offer1 uuid:=gen_random_uuid();
  offer2 uuid;
  result jsonb;
  assignment_id uuid;
  payment_count integer;
BEGIN
  INSERT INTO public.restaurants(id,name,slug,currency_code,timezone,is_active)
  VALUES(r,'QA Flame Chick Delivery','qa-flame-chick-delivery-v1','PKR','Asia/Karachi',true);
  INSERT INTO public.branches(id,restaurant_id,branch_code,name,is_active)
  VALUES(b,r,'qa-main','QA Main',true);
  INSERT INTO public.delivery_areas(id,restaurant_id,branch_id,name,delivery_fee,is_active)
  VALUES(a,r,b,'QA Zero Fee',0,true);

  INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
  VALUES
    (rider_one,'authenticated','authenticated','qa-delivery-rider-one@example.invalid','',transaction_timestamp(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,transaction_timestamp(),transaction_timestamp(),false,false),
    (rider_two,'authenticated','authenticated','qa-delivery-rider-two@example.invalid','',transaction_timestamp(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,transaction_timestamp(),transaction_timestamp(),false,false),
    (manager,'authenticated','authenticated','qa-delivery-manager@example.invalid','',transaction_timestamp(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,transaction_timestamp(),transaction_timestamp(),false,false);

  INSERT INTO public.user_profiles(user_id,display_name,is_active)
  VALUES(rider_one,'QA Rider One',true),(rider_two,'QA Rider Two',true),(manager,'QA Manager',true);
  INSERT INTO public.user_roles(restaurant_id,user_id,role_key,branch_id,is_active,assigned_by,reason,request_id)
  VALUES
    (r,rider_one,'rider',b,true,manager,'Disposable delivery command fixture',gen_random_uuid()),
    (r,rider_two,'rider',b,true,manager,'Disposable delivery command fixture',gen_random_uuid()),
    (r,manager,'manager',b,true,manager,'Disposable delivery command fixture',gen_random_uuid());

  INSERT INTO public.rider_profiles(restaurant_id,branch_id,user_id,rider_code,display_name,
    availability_status,accepting_jobs,last_seen_at,is_active)
  VALUES
    (r,b,rider_one,'qa-dc-r1','QA Delivery Rider One','available',true,clock_timestamp(),true),
    (r,b,rider_two,'qa-dc-r2','QA Delivery Rider Two','available',true,clock_timestamp(),true);

  INSERT INTO public.orders(id,restaurant_id,branch_id,order_number,idempotency_key,request_hash,source,
    fulfillment_type,status,customer_name,customer_phone,delivery_address,delivery_area_id,
    delivery_area_name_snapshot,delivery_selection_type,delivery_area_fee_snapshot,
    subtotal,discount_amount,delivery_fee,total,currency_code,payment_status)
  VALUES
    (o1,r,b,'QA-D-0001','qa-delivery-command-order-0001',repeat('b',64),'pos','delivery','ready',
      'QA Customer One','03000000001','101 QA Road, Karachi',a,'QA Zero Fee','listed_area',0,
      100,0,0,100,'PKR','unpaid'),
    (o2,r,b,'QA-D-0002','qa-delivery-command-order-0002',repeat('c',64),'pos','delivery','ready',
      'QA Customer Two','03000000002','102 QA Road, Karachi',a,'QA Zero Fee','listed_area',0,
      150,0,0,150,'PKR','unpaid');

  INSERT INTO public.delivery_tasks(id,restaurant_id,branch_id,order_id,status,
    recipient_name_snapshot,recipient_phone_snapshot,address_snapshot,area_name_snapshot,
    area_id_snapshot,delivery_selection_type_snapshot,delivery_fee_snapshot)
  VALUES
    (t1,r,b,o1,'dispatch_pending','QA Customer One','03000000001','101 QA Road, Karachi','QA Zero Fee',a,'listed_area',0),
    (t2,r,b,o2,'dispatch_pending','QA Customer Two','03000000002','102 QA Road, Karachi','QA Zero Fee',a,'listed_area',0);

  INSERT INTO public.delivery_task_offers(id,restaurant_id,branch_id,delivery_task_id,rider_user_id,
    offer_round,status,offered_at,expires_at,request_id)
  VALUES(offer1,r,b,t1,rider_one,1,'offered',clock_timestamp(),clock_timestamp()+interval '60 seconds',gen_random_uuid());

  -- Rider cannot answer another Rider's offer.
  result:=public.flame_chick_accept_delivery_offer(offer1,rider_two,gen_random_uuid());
  IF COALESCE((result->>'ok')::boolean,true) THEN
    RAISE EXCEPTION 'WRONG_RIDER_ACCEPTED_OFFER';
  END IF;

  -- Accept is idempotent: same offer creates exactly one assignment.
  result:=public.flame_chick_accept_delivery_offer(offer1,rider_one,gen_random_uuid());
  IF result->>'ok'<>'true' OR result->>'task_status'<>'accepted' THEN
    RAISE EXCEPTION 'RIDER_ACCEPT_FAILED: %',result;
  END IF;
  assignment_id:=(result->>'assignment_id')::uuid;
  result:=public.flame_chick_accept_delivery_offer(offer1,rider_one,gen_random_uuid());
  IF result->>'ok'<>'true' OR result->>'already_processed'<>'true'
     OR (SELECT count(*) FROM public.delivery_assignments WHERE delivery_task_id=t1 AND is_current)<>1 THEN
    RAISE EXCEPTION 'RIDER_ACCEPT_RETRY_NOT_IDEMPOTENT: %',result;
  END IF;

  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','picked_up','delivery_task_id',t1,'actor_user_id',rider_one,'request_id',gen_random_uuid()));
  IF result->>'ok'<>'true' OR result->>'task_status'<>'out_for_delivery'
     OR (SELECT status FROM public.orders WHERE id=o1)<>'out_for_delivery' THEN
    RAISE EXCEPTION 'RIDER_PICKUP_FAILED: %',result;
  END IF;

  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','delivered','delivery_task_id',t1,'actor_user_id',rider_one,'request_id',gen_random_uuid()));
  IF result->>'ok'<>'true' OR result->>'task_status'<>'delivered'
     OR (SELECT status FROM public.orders WHERE id=o1)<>'delivered'
     OR (SELECT is_current FROM public.delivery_assignments WHERE id=assignment_id) THEN
    RAISE EXCEPTION 'RIDER_DELIVERY_FAILED: %',result;
  END IF;
  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','delivered','delivery_task_id',t1,'actor_user_id',rider_one,'request_id',gen_random_uuid()));
  IF result->>'ok'<>'true' OR result->>'already_processed'<>'true' THEN
    RAISE EXCEPTION 'RIDER_DELIVERY_RETRY_FAILED: %',result;
  END IF;

  -- POS explicitly targets one Rider; no automatic rotation is created.
  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','assign','delivery_task_id',t2,'actor_user_id',manager,'rider_user_id',rider_two,'request_id',gen_random_uuid()));
  IF result->>'ok'<>'true' OR result->>'task_status'<>'offering' THEN
    RAISE EXCEPTION 'STAFF_ASSIGNMENT_FAILED: %',result;
  END IF;
  offer2:=(result->>'offer_id')::uuid;

  result:=public.flame_chick_accept_delivery_offer(offer2,rider_two,gen_random_uuid());
  IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'SECOND_RIDER_ACCEPT_FAILED: %',result; END IF;

  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','picked_up','delivery_task_id',t2,'actor_user_id',rider_two,'request_id',gen_random_uuid()));
  IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'SECOND_RIDER_PICKUP_FAILED: %',result; END IF;

  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','failed','delivery_task_id',t2,'actor_user_id',rider_two,'reason','Customer unavailable','request_id',gen_random_uuid()));
  IF result->>'ok'<>'true' OR (SELECT status FROM public.orders WHERE id=o2)<>'out_for_delivery' THEN
    RAISE EXCEPTION 'FAILED_DELIVERY_REPORT_CHANGED_ORDER_INCORRECTLY: %',result;
  END IF;

  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','return_reported','delivery_task_id',t2,'actor_user_id',rider_two,'request_id',gen_random_uuid()));
  IF result->>'ok'<>'true' OR (SELECT return_confirmed_at FROM public.delivery_tasks WHERE id=t2) IS NOT NULL THEN
    RAISE EXCEPTION 'RIDER_RETURN_REPORT_WAS_TREATED_AS_STAFF_CONFIRMATION: %',result;
  END IF;

  -- Rider cannot confirm the physical return; Manager must do it.
  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','confirm_return','delivery_task_id',t2,'actor_user_id',rider_two,'request_id',gen_random_uuid()));
  IF COALESCE((result->>'ok')::boolean,true) THEN RAISE EXCEPTION 'RIDER_CONFIRMED_OWN_RETURN'; END IF;

  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','confirm_return','delivery_task_id',t2,'actor_user_id',manager,
    'reason','Physical handover checked by manager','request_id',gen_random_uuid()));
  IF result->>'ok'<>'true' OR result->>'task_status'<>'returned'
     OR (SELECT status FROM public.orders WHERE id=o2)<>'returned'
     OR (SELECT is_current FROM public.delivery_assignments WHERE delivery_task_id=t2) THEN
    RAISE EXCEPTION 'MANAGER_RETURN_CONFIRMATION_FAILED: %',result;
  END IF;

  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','confirm_return','delivery_task_id',t2,'actor_user_id',manager,'request_id',gen_random_uuid()));
  IF result->>'ok'<>'true' OR result->>'already_processed'<>'true' THEN
    RAISE EXCEPTION 'RETURN_CONFIRMATION_RETRY_FAILED: %',result;
  END IF;

  SELECT count(*) INTO payment_count FROM public.payments WHERE order_id IN(o1,o2);
  IF payment_count<>0 OR EXISTS(SELECT 1 FROM public.orders WHERE id IN(o1,o2) AND payment_status<>'unpaid') THEN
    RAISE EXCEPTION 'DELIVERY_COMMANDS_CHANGED_PAYMENT_LEDGER';
  END IF;

  IF (SELECT count(*) FROM public.order_status_history WHERE order_id IN(o1,o2))<>4 THEN
    RAISE EXCEPTION 'ORDER_STATUS_HISTORY_NOT_APPENDED_FOR_PICKUP_DELIVERY_RETURN';
  END IF;
  IF (SELECT count(*) FROM public.delivery_task_events WHERE delivery_task_id IN(t1,t2))<8 THEN
    RAISE EXCEPTION 'DELIVERY_TASK_EVENT_AUDIT_INCOMPLETE';
  END IF;
END;
$delivery_commands$;
ROLLBACK;
DO $cleanup$
BEGIN
  IF EXISTS(SELECT 1 FROM public.restaurants WHERE slug='qa-flame-chick-delivery-v1')
     OR EXISTS(SELECT 1 FROM auth.users WHERE email LIKE 'qa-delivery-%@example.invalid') THEN
    RAISE EXCEPTION 'DELIVERY_COMMAND_FIXTURE_NOT_ROLLED_BACK';
  END IF;
END;
$cleanup$;
