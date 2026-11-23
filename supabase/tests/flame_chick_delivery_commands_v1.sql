-- Disposable behavioral QA for Flame Chick delivery commands V1.
-- Synthetic identities, tenant, staff roles, orders and delivery records all roll back.
-- Role setup deliberately follows the protected production bootstrap + Staff Admin path.
BEGIN;

-- Deterministic clock override is confined to this rollback-only fixture.
-- Production migration implementation continues to use clock_timestamp().
CREATE OR REPLACE FUNCTION app_private.flame_chick_delivery_clock_now()
RETURNS timestamptz
LANGUAGE sql
VOLATILE
SET search_path=''
AS $function$
  SELECT COALESCE(
    NULLIF(pg_catalog.current_setting('test.delivery.clock_now',true),'')::timestamptz,
    pg_catalog.clock_timestamp()
  )
$function$;

DO $delivery_identity_setup$
DECLARE
  r uuid:=gen_random_uuid();
  b uuid:=gen_random_uuid();
  a uuid:=gen_random_uuid();
  admin_user uuid:='a5555555-5555-4555-8555-555555555550';
  rider_one uuid:='a5555555-5555-4555-8555-555555555551';
  rider_two uuid:='a5555555-5555-4555-8555-555555555552';
  manager uuid:='a5555555-5555-4555-8555-555555555553';
  cashier uuid:='a5555555-5555-4555-8555-555555555554';
  now_at timestamptz:=transaction_timestamp();
BEGIN
  IF current_user<>'postgres' OR session_user<>'postgres' THEN
    RAISE EXCEPTION 'DELIVERY_COMMAND_FIXTURE_REQUIRES_POSTGRES';
  END IF;

  IF EXISTS(SELECT 1 FROM public.restaurants WHERE slug='flame-chick') THEN
    RAISE EXCEPTION 'DELIVERY_COMMAND_FIXTURE_TENANT_CONFLICT';
  END IF;

  INSERT INTO public.restaurants(id,name,slug,currency_code,timezone,is_active)
  VALUES(r,'QA Flame Chick Delivery','flame-chick','PKR','Asia/Karachi',true);
  INSERT INTO public.branches(id,restaurant_id,branch_code,name,is_active)
  VALUES(b,r,'qa-main','QA Main',true);
  INSERT INTO public.delivery_areas(id,restaurant_id,branch_id,name,delivery_fee,is_active)
  VALUES(a,r,b,'QA Zero Fee',0,true);

  PERFORM set_config('test.delivery.restaurant_id',r::text,true);
  PERFORM set_config('test.delivery.branch_id',b::text,true);
  PERFORM set_config('test.delivery.area_id',a::text,true);

  INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
  VALUES
    (admin_user,'authenticated','authenticated','qa-delivery-admin@example.invalid','',now_at,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now_at,now_at,false,false),
    (rider_one,'authenticated','authenticated','qa-delivery-rider-one@example.invalid','',now_at,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now_at,now_at,false,false),
    (rider_two,'authenticated','authenticated','qa-delivery-rider-two@example.invalid','',now_at,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now_at,now_at,false,false),
    (manager,'authenticated','authenticated','qa-delivery-manager@example.invalid','',now_at,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now_at,now_at,false,false),
    (cashier,'authenticated','authenticated','qa-delivery-cashier@example.invalid','',now_at,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now_at,now_at,false,false);

  INSERT INTO public.user_profiles(user_id,display_name,is_active)
  VALUES
    (admin_user,'QA Delivery Admin',true),
    (rider_one,'QA Rider One',true),
    (rider_two,'QA Rider Two',true),
    (manager,'QA Manager',true),
    (cashier,'QA Cashier',true);

  -- First restaurant-wide Admin uses the trusted postgres-only bootstrap route.
  INSERT INTO public.user_roles(
    restaurant_id,user_id,role_key,branch_id,is_active,assigned_by,
    reason,request_id,assignment_method
  ) VALUES(
    r,admin_user,'admin',NULL,true,admin_user,
    'Disposable delivery command fixture',gen_random_uuid(),'initial_bootstrap'
  );
END
$delivery_identity_setup$;

-- Operational staff roles must be assigned by the same authenticated command
-- used by the Admin application. Direct user_roles inserts are intentionally forbidden.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','a5555555-5555-4555-8555-555555555550',true);

DO $delivery_staff_role_setup$
DECLARE
  branch_id uuid:=current_setting('test.delivery.branch_id')::uuid;
  result jsonb;
BEGIN
  result:=public.flame_chick_staff_admin_command('assign_role',jsonb_build_object(
    'target_user_id','a5555555-5555-4555-8555-555555555551',
    'role_key','rider','branch_ids',jsonb_build_array(branch_id),
    'request_id',gen_random_uuid(),'reason','Disposable delivery command fixture'));
  IF result->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'DELIVERY_FIXTURE_RIDER_ONE_ASSIGNMENT_FAILED: %',result;
  END IF;

  result:=public.flame_chick_staff_admin_command('assign_role',jsonb_build_object(
    'target_user_id','a5555555-5555-4555-8555-555555555552',
    'role_key','rider','branch_ids',jsonb_build_array(branch_id),
    'request_id',gen_random_uuid(),'reason','Disposable delivery command fixture'));
  IF result->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'DELIVERY_FIXTURE_RIDER_TWO_ASSIGNMENT_FAILED: %',result;
  END IF;

  result:=public.flame_chick_staff_admin_command('assign_role',jsonb_build_object(
    'target_user_id','a5555555-5555-4555-8555-555555555553',
    'role_key','manager','branch_ids',jsonb_build_array(branch_id),
    'request_id',gen_random_uuid(),'reason','Disposable delivery command fixture'));
  IF result->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'DELIVERY_FIXTURE_MANAGER_ASSIGNMENT_FAILED: %',result;
  END IF;

  result:=public.flame_chick_staff_admin_command('assign_role',jsonb_build_object(
    'target_user_id','a5555555-5555-4555-8555-555555555554',
    'role_key','cashier','branch_ids',jsonb_build_array(branch_id),
    'request_id',gen_random_uuid(),'reason','Disposable delivery command fixture'));
  IF result->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'DELIVERY_FIXTURE_CASHIER_ASSIGNMENT_FAILED: %',result;
  END IF;
END
$delivery_staff_role_setup$;

RESET ROLE;

DO $delivery_commands$
DECLARE
  r uuid:=current_setting('test.delivery.restaurant_id')::uuid;
  b uuid:=current_setting('test.delivery.branch_id')::uuid;
  a uuid:=current_setting('test.delivery.area_id')::uuid;
  rider_one uuid:='a5555555-5555-4555-8555-555555555551';
  rider_two uuid:='a5555555-5555-4555-8555-555555555552';
  manager uuid:='a5555555-5555-4555-8555-555555555553';
  cashier uuid:='a5555555-5555-4555-8555-555555555554';
  o1 uuid:=gen_random_uuid();
  o2 uuid:=gen_random_uuid();
  t1 uuid:=gen_random_uuid();
  t2 uuid:=gen_random_uuid();
  offer1 uuid;
  offer2 uuid;
  result jsonb;
  assignment_id uuid;
  payment_count integer;
  partial_request uuid:=gen_random_uuid();
  full_request uuid:=gen_random_uuid();
  partial_payment_id uuid;
BEGIN
  IF (SELECT count(*) FROM public.user_roles WHERE restaurant_id=r AND is_active)<>5
     OR (SELECT count(*) FROM public.staff_role_audit WHERE restaurant_id=r)<>5 THEN
    RAISE EXCEPTION 'DELIVERY_FIXTURE_STAFF_ROLES_NOT_CREATED_THROUGH_AUDITED_COMMANDS';
  END IF;

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

  -- Create the first offer through the real POS dispatch command. This keeps
  -- delivery_tasks.status='offering' in sync with the offered row.
  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','assign','delivery_task_id',t1,'actor_user_id',manager,
    'rider_user_id',rider_one,'request_id',gen_random_uuid()));
  IF result->>'ok'<>'true' OR result->>'task_status'<>'offering'
     OR result->>'offer_status'<>'offered' THEN
    RAISE EXCEPTION 'FIRST_STAFF_ASSIGNMENT_FAILED: %',result;
  END IF;
  offer1:=(result->>'offer_id')::uuid;

  -- Rider cannot answer another Rider's offer; verify the exact authorization error.
  result:=public.flame_chick_accept_delivery_offer(offer1,rider_two,gen_random_uuid());
  IF result->>'ok'<>'false'
     OR result#>>'{error,code}'<>'DELIVERY_OFFER_NOT_ASSIGNED_TO_RIDER' THEN
    RAISE EXCEPTION 'WRONG_RIDER_OFFER_GUARD_FAILED: %',result;
  END IF;

  -- The offer is valid one microsecond before its exact 60-second deadline.
  PERFORM set_config('test.delivery.clock_now',
    (SELECT expires_at-interval '1 microsecond' FROM public.delivery_task_offers WHERE id=offer1)::text,true);
  result:=public.flame_chick_accept_delivery_offer(offer1,rider_one,gen_random_uuid());
  IF result->>'ok'<>'true' OR result->>'task_status'<>'accepted' THEN
    RAISE EXCEPTION 'RIDER_ACCEPT_FAILED: %',result;
  END IF;
  assignment_id:=(result->>'assignment_id')::uuid;
  PERFORM set_config('test.delivery.clock_now','',true);
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
     OR (SELECT is_current FROM public.delivery_assignments WHERE id=assignment_id)
     OR (SELECT completed_at FROM public.orders WHERE id=o1) IS NOT NULL
     OR (SELECT payment_status FROM public.orders WHERE id=o1)<>'unpaid'
     OR (SELECT paid_amount FROM public.orders WHERE id=o1)<>0
     OR (SELECT balance_due FROM public.orders WHERE id=o1)<>(SELECT total FROM public.orders WHERE id=o1) THEN
    RAISE EXCEPTION 'RIDER_DELIVERY_FAILED_OR_PREMATURE_ORDER_COMPLETION: %',result;
  END IF;
  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','delivered','delivery_task_id',t1,'actor_user_id',rider_one,'request_id',gen_random_uuid()));
  IF result->>'ok'<>'true' OR result->>'already_processed'<>'true' THEN
    RAISE EXCEPTION 'RIDER_DELIVERY_RETRY_FAILED: %',result;
  END IF;

  -- Rider delivery is not authority to collect money.
  result:=public.flame_chick_collect_order_payment(jsonb_build_object(
    'order_id',o1,'actor_user_id',rider_one,'request_id',gen_random_uuid(),
    'amount',20,'payment_method','cash'));
  IF result->>'ok'<>'false' OR result#>>'{error,code}'<>'PAYMENT_STAFF_REQUIRED' THEN
    RAISE EXCEPTION 'RIDER_PAYMENT_COLLECTION_NOT_DENIED: %',result;
  END IF;

  -- A ready (not yet delivered) order cannot be settled from this delivery flow.
  result:=public.flame_chick_collect_order_payment(jsonb_build_object(
    'order_id',o2,'actor_user_id',cashier,'request_id',gen_random_uuid(),
    'amount',20,'payment_method','cash'));
  IF result->>'ok'<>'false' OR result#>>'{error,code}'<>'PAYMENT_ORDER_STATE_INVALID' THEN
    RAISE EXCEPTION 'UNDELIVERED_ORDER_PAYMENT_COLLECTION_NOT_DENIED: %',result;
  END IF;

  -- Record a partial collection. The order remains Delivered; no completion
  -- timestamp is written and the generated balance remains due.
  result:=public.flame_chick_collect_order_payment(jsonb_build_object(
    'order_id',o1,'actor_user_id',cashier,'request_id',partial_request,
    'amount',40,'payment_method','cash'));
  IF result->>'ok'<>'true' OR result->>'completed'<>'false'
     OR result->>'payment_status'<>'partially_paid'
     OR (result->>'balance_due')::numeric<>60
     OR (SELECT status FROM public.orders WHERE id=o1)<>'delivered'
     OR (SELECT payment_status FROM public.orders WHERE id=o1)<>'partially_paid'
     OR (SELECT paid_amount FROM public.orders WHERE id=o1)<>40
     OR (SELECT balance_due FROM public.orders WHERE id=o1)<>60
     OR (SELECT completed_at FROM public.orders WHERE id=o1) IS NOT NULL
     OR (SELECT count(*) FROM public.payments WHERE order_id=o1 AND entry_type='collection')<>1 THEN
    RAISE EXCEPTION 'PARTIAL_PAYMENT_COLLECTION_FAILED: %',result;
  END IF;
  partial_payment_id:=(result->>'payment_id')::uuid;

  -- Same request ID and same payment facts return the original ledger row.
  result:=public.flame_chick_collect_order_payment(jsonb_build_object(
    'order_id',o1,'actor_user_id',cashier,'request_id',partial_request,
    'amount',40,'payment_method','cash'));
  IF result->>'ok'<>'true' OR result->>'already_processed'<>'true'
     OR (result->>'payment_id')::uuid<>partial_payment_id
     OR (SELECT count(*) FROM public.payments WHERE order_id=o1 AND entry_type='collection')<>1 THEN
    RAISE EXCEPTION 'PARTIAL_PAYMENT_RETRY_NOT_IDEMPOTENT: %',result;
  END IF;

  -- Reusing the same ID with altered payment facts is a conflict, not a new
  -- ledger movement or silently accepted retry.
  result:=public.flame_chick_collect_order_payment(jsonb_build_object(
    'order_id',o1,'actor_user_id',cashier,'request_id',partial_request,
    'amount',50,'payment_method','cash'));
  IF result->>'ok'<>'false' OR result#>>'{error,code}'<>'PAYMENT_IDEMPOTENCY_CONFLICT'
     OR (SELECT count(*) FROM public.payments WHERE order_id=o1 AND entry_type='collection')<>1 THEN
    RAISE EXCEPTION 'PAYMENT_IDEMPOTENCY_CONFLICT_NOT_ENFORCED: %',result;
  END IF;

  -- A stale POS amount cannot over-collect the remaining balance.
  result:=public.flame_chick_collect_order_payment(jsonb_build_object(
    'order_id',o1,'actor_user_id',cashier,'request_id',gen_random_uuid(),
    'amount',60.01,'payment_method','cash'));
  IF result->>'ok'<>'false' OR result#>>'{error,code}'<>'PAYMENT_AMOUNT_EXCEEDS_BALANCE'
     OR (SELECT count(*) FROM public.payments WHERE order_id=o1 AND entry_type='collection')<>1 THEN
    RAISE EXCEPTION 'PAYMENT_OVER_COLLECTION_NOT_DENIED: %',result;
  END IF;

  -- The final balance collection completes the order only after both payment
  -- ledger entries have committed in this same transaction.
  result:=public.flame_chick_collect_order_payment(jsonb_build_object(
    'order_id',o1,'actor_user_id',cashier,'request_id',full_request,
    'amount',60,'payment_method','cash'));
  IF result->>'ok'<>'true' OR result->>'completed'<>'true'
     OR result->>'order_status'<>'completed'
     OR result->>'payment_status'<>'paid'
     OR (SELECT status FROM public.orders WHERE id=o1)<>'completed'
     OR (SELECT payment_status FROM public.orders WHERE id=o1)<>'paid'
     OR (SELECT paid_amount FROM public.orders WHERE id=o1)<>100
     OR (SELECT balance_due FROM public.orders WHERE id=o1)<>0
     OR (SELECT completed_at FROM public.orders WHERE id=o1) IS NULL
     OR (SELECT collected_at FROM public.orders WHERE id=o1) IS NULL
     OR (SELECT count(*) FROM public.payments WHERE order_id=o1 AND entry_type='collection')<>2 THEN
    RAISE EXCEPTION 'FINAL_PAYMENT_COLLECTION_DID_NOT_COMPLETE_ORDER: %',result;
  END IF;

  result:=public.flame_chick_collect_order_payment(jsonb_build_object(
    'order_id',o1,'actor_user_id',cashier,'request_id',full_request,
    'amount',60,'payment_method','cash'));
  IF result->>'ok'<>'true' OR result->>'already_processed'<>'true'
     OR result->>'order_status'<>'completed'
     OR (SELECT count(*) FROM public.payments WHERE order_id=o1 AND entry_type='collection')<>2 THEN
    RAISE EXCEPTION 'FINAL_PAYMENT_RETRY_NOT_IDEMPOTENT: %',result;
  END IF;

  -- POS explicitly targets one Rider; no automatic rotation is created.
  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','assign','delivery_task_id',t2,'actor_user_id',manager,'rider_user_id',rider_two,'request_id',gen_random_uuid()));
  IF result->>'ok'<>'true' OR result->>'task_status'<>'offering' THEN
    RAISE EXCEPTION 'STAFF_ASSIGNMENT_FAILED: %',result;
  END IF;
  offer2:=(result->>'offer_id')::uuid;

  -- At the exact expiry instant (>=), accept must fail closed and expire the offer.
  PERFORM set_config('test.delivery.clock_now',
    (SELECT expires_at::text FROM public.delivery_task_offers WHERE id=offer2),true);
  result:=public.flame_chick_accept_delivery_offer(offer2,rider_two,gen_random_uuid());
  IF result->>'ok'<>'false' OR result#>>'{error,code}'<>'OFFER_EXPIRED'
     OR (SELECT status FROM public.delivery_task_offers WHERE id=offer2)<>'expired'
     OR (SELECT status FROM public.delivery_tasks WHERE id=t2)<>'dispatch_pending'
     OR EXISTS(SELECT 1 FROM public.delivery_assignments WHERE delivery_task_id=t2 AND is_current) THEN
    RAISE EXCEPTION 'EXACT_EXPIRY_BOUNDARY_FAILED: %',result;
  END IF;

  -- Restore real DB time, then manually reassign. Expiry never auto-rotates.
  PERFORM set_config('test.delivery.clock_now','',true);
  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','assign','delivery_task_id',t2,'actor_user_id',manager,'rider_user_id',rider_two,'request_id',gen_random_uuid()));
  IF result->>'ok'<>'true' OR result->>'task_status'<>'offering' THEN
    RAISE EXCEPTION 'MANUAL_REASSIGN_AFTER_EXPIRY_FAILED: %',result;
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

  -- Rider cannot confirm the physical return; Cashier must verify receipt.
  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','confirm_return','delivery_task_id',t2,'actor_user_id',rider_two,'request_id',gen_random_uuid()));
  IF COALESCE((result->>'ok')::boolean,true) THEN RAISE EXCEPTION 'RIDER_CONFIRMED_OWN_RETURN'; END IF;

  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','confirm_return','delivery_task_id',t2,'actor_user_id',cashier,
    'reason','Physical handover checked by cashier','request_id',gen_random_uuid()));
  IF result->>'ok'<>'true' OR result->>'task_status'<>'returned'
     OR (SELECT status FROM public.orders WHERE id=o2)<>'returned'
     OR (SELECT completed_at FROM public.orders WHERE id=o2) IS NOT NULL
     OR (SELECT payment_status FROM public.orders WHERE id=o2)<>'unpaid'
     OR (SELECT paid_amount FROM public.orders WHERE id=o2)<>0
     OR (SELECT is_current FROM public.delivery_assignments WHERE delivery_task_id=t2) THEN
    RAISE EXCEPTION 'CASHIER_RETURN_CONFIRMATION_FAILED_OR_FINANCIAL_STATE_CHANGED: %',result;
  END IF;

  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','confirm_return','delivery_task_id',t2,'actor_user_id',cashier,'request_id',gen_random_uuid()));
  IF result->>'ok'<>'true' OR result->>'already_processed'<>'true' THEN
    RAISE EXCEPTION 'RETURN_CONFIRMATION_RETRY_FAILED: %',result;
  END IF;

  SELECT count(*) INTO payment_count FROM public.payments WHERE order_id IN(o1,o2);
  IF payment_count<>2
     OR (SELECT count(*) FROM public.payments WHERE order_id=o1 AND entry_type='collection' AND status='succeeded')<>2
     OR (SELECT COALESCE(sum(amount),0) FROM public.payments WHERE order_id=o1 AND entry_type='collection')<>100
     OR EXISTS(SELECT 1 FROM public.payments WHERE order_id=o2)
     OR (SELECT payment_status FROM public.orders WHERE id=o1)<>'paid'
     OR (SELECT payment_status FROM public.orders WHERE id=o2)<>'unpaid' THEN
    RAISE EXCEPTION 'PAYMENT_LEDGER_OR_RETURN_FINANCIAL_STATE_INVALID';
  END IF;

  IF (SELECT count(*) FROM public.order_status_history WHERE order_id IN(o1,o2))<>6 THEN
    RAISE EXCEPTION 'ORDER_STATUS_HISTORY_NOT_APPENDED_FOR_DELIVERY_AND_PAYMENT_COLLECTION';
  END IF;
  IF (SELECT count(*) FROM public.delivery_task_events WHERE delivery_task_id IN(t1,t2))<8 THEN
    RAISE EXCEPTION 'DELIVERY_TASK_EVENT_AUDIT_INCOMPLETE';
  END IF;
END;
$delivery_commands$;

ROLLBACK;

DO $cleanup$
BEGIN
  IF EXISTS(SELECT 1 FROM public.restaurants WHERE slug='flame-chick')
     OR EXISTS(SELECT 1 FROM auth.users WHERE email LIKE 'qa-delivery-%@example.invalid') THEN
    RAISE EXCEPTION 'DELIVERY_COMMAND_FIXTURE_NOT_ROLLED_BACK';
  END IF;
END
$cleanup$;
