-- Flame Chick unified POS order sync V1.
-- Source-only candidate; intentionally not applied to Production in this stage.
BEGIN;
DO $preflight$
BEGIN
  IF current_user<>'postgres' OR session_user<>'postgres' THEN RAISE EXCEPTION 'FLAME_CHICK_POS_ORDER_SYNC_REQUIRES_POSTGRES'; END IF;
  IF pg_catalog.to_regclass('public.orders') IS NULL OR pg_catalog.to_regclass('public.order_items') IS NULL
     OR pg_catalog.to_regclass('public.order_item_components') IS NULL OR pg_catalog.to_regclass('public.order_item_modifiers') IS NULL
     OR pg_catalog.to_regclass('public.order_status_history') IS NULL OR pg_catalog.to_regclass('public.delivery_tasks') IS NULL
     OR pg_catalog.to_regclass('public.payments') IS NULL
     OR pg_catalog.to_regprocedure('app_private.flame_chick_delivery_staff_role(uuid,uuid,uuid)') IS NULL
     OR pg_catalog.to_regclass('app_private.order_number_counters') IS NULL THEN
    RAISE EXCEPTION 'FLAME_CHICK_POS_ORDER_SYNC_DEPENDENCY_MISSING';
  END IF;
  IF pg_catalog.to_regprocedure('public.flame_chick_sync_pos_order(jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'FLAME_CHICK_POS_ORDER_SYNC_RPC_ALREADY_EXISTS'; END IF;
END $preflight$;

-- A walk-in customer may omit a phone for dine-in or takeaway; delivery must provide one.
ALTER TABLE public.orders
  ALTER COLUMN customer_phone DROP NOT NULL,
  DROP CONSTRAINT orders_customer_phone_check,
  ADD CONSTRAINT orders_customer_phone_check CHECK (
    customer_phone IS NULL OR (
      customer_phone=btrim(customer_phone) AND char_length(customer_phone) BETWEEN 3 AND 32
    )
  ),
  ADD COLUMN table_reference text,
  ADD COLUMN table_label_snapshot text,
  ADD COLUMN scheduled_for timestamptz,
  ADD COLUMN prepare_at timestamptz,
  ADD COLUMN kitchen_timing text,
  ADD COLUMN local_revision bigint NOT NULL DEFAULT 1;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_local_revision_check CHECK (local_revision>=1),
  ADD CONSTRAINT orders_table_reference_check CHECK (table_reference IS NULL OR char_length(table_reference)<=120),
  ADD CONSTRAINT orders_table_label_snapshot_check CHECK (table_label_snapshot IS NULL OR char_length(table_label_snapshot)<=120),
  ADD CONSTRAINT orders_kitchen_timing_check CHECK (kitchen_timing IS NULL OR kitchen_timing IN ('now','schedule'));

CREATE INDEX orders_branch_local_order_idx ON public.orders(branch_id,source,local_order_id) WHERE local_order_id IS NOT NULL;
COMMENT ON COLUMN public.orders.local_order_id IS 'Stable IndexedDB POS identity; retries update this same canonical order.';
COMMENT ON COLUMN public.orders.local_revision IS 'Monotonic local POS edit revision; prevents stale offline snapshots overwriting newer edits.';
COMMENT ON COLUMN public.orders.table_reference IS 'POS-local table identity for dine-in checks; not a foreign key to a shared table registry.';
COMMENT ON COLUMN public.orders.scheduled_for IS 'Requested dine-in preorder arrival time, if applicable.';

CREATE OR REPLACE FUNCTION public.flame_chick_sync_pos_order(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_restaurant_id uuid; v_branch_id uuid; v_actor_id uuid; v_role text;
  v_local_order_id text; v_idempotency_key text; v_request_hash text; v_revision bigint;
  v_fulfillment text; v_customer_name text; v_customer_phone text; v_notes text; v_payment_method text;
  v_table_reference text; v_table_label text; v_scheduled_for timestamptz; v_prepare_at timestamptz; v_kitchen_timing text;
  v_branch_timezone text; v_currency text; v_order_number text; v_business_date date; v_counter bigint;
  v_now timestamptz:=pg_catalog.clock_timestamp();
  v_subtotal numeric(12,2); v_delivery_fee numeric(12,2); v_total numeric(12,2); v_calculated_subtotal numeric(12,2):=0;
  v_area_id uuid; v_area_name text; v_area_fee numeric(12,2):=0; v_selection_type text; v_address text; v_instructions text;
  v_delivery jsonb; v_items jsonb; v_item jsonb; v_modifier jsonb; v_component jsonb; v_component_modifier jsonb;
  v_item_id uuid; v_component_id uuid; v_order_id uuid; v_order public.orders%ROWTYPE; v_existing public.orders%ROWTYPE;
  v_ordinal integer:=0; v_quantity integer; v_unit_price numeric; v_line_total numeric; v_updated boolean:=false;
  v_payment jsonb; v_payment_request uuid; v_payment_amount numeric(12,2); v_queued_payment_method text;
  v_existing_payment public.payments%ROWTYPE; v_payment_id uuid; v_paid numeric(12,2); v_balance numeric(12,2);
  v_fully_paid boolean:=false; v_next_status text;
BEGIN
  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload)<>'object' OR COALESCE(p_payload->>'source','')<>'pos' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_ORDER_REQUEST_INVALID','message','A POS order synchronization request is required.'));
  END IF;
  BEGIN
    v_restaurant_id:=(p_payload->>'restaurant_id')::uuid; v_branch_id:=(p_payload->>'branch_id')::uuid;
    v_actor_id:=(p_payload->>'actor_user_id')::uuid; v_revision:=(p_payload->>'local_revision')::bigint;
  EXCEPTION WHEN OTHERS THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_ORDER_IDENTIFIERS_INVALID','message','Restaurant, branch, actor and revision are required.'));
  END;
  v_local_order_id:=NULLIF(pg_catalog.btrim(p_payload->>'local_order_id'),'');
  v_idempotency_key:=NULLIF(pg_catalog.btrim(p_payload->>'idempotency_key'),'');
  v_request_hash:=COALESCE(p_payload->>'request_hash',''); v_fulfillment:=COALESCE(p_payload->>'fulfillment_type','');
  v_customer_name:=NULLIF(pg_catalog.btrim(p_payload->>'customer_name'),'');
  v_customer_phone:=NULLIF(pg_catalog.btrim(p_payload->>'customer_phone'),'');
  v_notes:=NULLIF(pg_catalog.btrim(p_payload->>'notes'),'');
  v_payment_method:=NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(p_payload->>'payment_method',''))),'');
  v_payment_method:=CASE v_payment_method
    WHEN 'bank_transfer' THEN 'bank'
    WHEN 'online' THEN 'other'
    WHEN 'cod' THEN 'cash'
    ELSE v_payment_method
  END;
  v_table_reference:=NULLIF(pg_catalog.btrim(p_payload->>'table_reference'),'');
  v_table_label:=NULLIF(pg_catalog.btrim(p_payload->>'table_label_snapshot'),'');
  v_kitchen_timing:=NULLIF(pg_catalog.lower(pg_catalog.btrim(p_payload->>'kitchen_timing')),'');
  v_items:=p_payload->'items'; v_delivery:=p_payload->'delivery';

  IF v_local_order_id IS NULL OR pg_catalog.char_length(v_local_order_id)>160
     OR v_idempotency_key IS NULL OR pg_catalog.char_length(v_idempotency_key) NOT BETWEEN 8 AND 200
     OR v_idempotency_key<>'flame-chick-pos-'||v_local_order_id OR v_request_hash !~ '^[0-9a-f]{64}$'
     OR v_revision IS NULL OR v_revision<1 OR v_fulfillment NOT IN ('delivery','pickup','dine_in')
     OR v_customer_name IS NULL OR pg_catalog.char_length(v_customer_name)>160
     OR (v_customer_phone IS NOT NULL AND pg_catalog.char_length(v_customer_phone) NOT BETWEEN 3 AND 32)
     OR (v_payment_method IS NOT NULL AND v_payment_method NOT IN ('cash','card','bank','wallet','other'))
     OR (v_notes IS NOT NULL AND pg_catalog.char_length(v_notes)>1000)
     OR (v_kitchen_timing IS NOT NULL AND v_kitchen_timing NOT IN ('now','schedule'))
     OR (v_fulfillment='dine_in' AND v_table_reference IS NULL AND v_kitchen_timing IS DISTINCT FROM 'schedule')
     OR (v_fulfillment<>'dine_in' AND (v_table_reference IS NOT NULL OR v_table_label IS NOT NULL OR
         p_payload->>'scheduled_for' IS NOT NULL OR p_payload->>'prepare_at' IS NOT NULL OR v_kitchen_timing IS NOT NULL))
     OR pg_catalog.jsonb_typeof(v_items) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(v_items) NOT BETWEEN 1 AND 100 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_ORDER_FIELDS_INVALID','message','The POS order contains missing or invalid details.'));
  END IF;
  IF v_fulfillment='delivery' AND v_customer_phone IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_DELIVERY_PHONE_REQUIRED','message','A delivery order requires a customer phone number.'));
  END IF;
  IF v_kitchen_timing='schedule' THEN
    BEGIN v_scheduled_for:=NULLIF(p_payload->>'scheduled_for','')::timestamptz; v_prepare_at:=NULLIF(p_payload->>'prepare_at','')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_PREORDER_TIME_INVALID','message','The dine-in preorder time is invalid.'));
    END;
    IF v_scheduled_for IS NULL OR v_prepare_at IS NULL OR v_prepare_at>v_scheduled_for THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_PREORDER_TIME_INVALID','message','The dine-in preorder schedule is incomplete.'));
    END IF;
  END IF;

  SELECT b.timezone INTO v_branch_timezone FROM public.branches b
  WHERE b.id=v_branch_id AND b.restaurant_id=v_restaurant_id AND b.is_active;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_BRANCH_UNAVAILABLE','message','The assigned POS branch is no longer active.')); END IF;
  SELECT r.currency_code INTO v_currency FROM public.restaurants r WHERE r.id=v_restaurant_id AND r.is_active;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_RESTAURANT_UNAVAILABLE','message','The Flame Chick restaurant is not active.')); END IF;
  v_role:=app_private.flame_chick_delivery_staff_role(v_actor_id,v_restaurant_id,v_branch_id);
  IF v_role IS NULL OR v_role NOT IN ('admin','owner','manager','cashier') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_STAFF_REQUIRED','message','An active Admin, Owner, Manager or Cashier for this branch is required.'));
  END IF;

  BEGIN
    v_subtotal:=(p_payload->>'subtotal')::numeric; v_delivery_fee:=(p_payload->>'delivery_fee')::numeric; v_total:=(p_payload->>'total')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_ORDER_AMOUNT_INVALID','message','The server-calculated order amount is invalid.'));
  END;
  IF v_subtotal IS NULL OR v_delivery_fee IS NULL OR v_total IS NULL OR v_subtotal<0 OR v_delivery_fee<0
     OR v_subtotal<>pg_catalog.round(v_subtotal,2) OR v_delivery_fee<>pg_catalog.round(v_delivery_fee,2)
     OR v_total<>pg_catalog.round(v_total,2) OR v_total<>v_subtotal+v_delivery_fee THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_ORDER_AMOUNT_INVALID','message','The server-calculated order total is inconsistent.'));
  END IF;

  IF v_fulfillment='delivery' THEN
    IF pg_catalog.jsonb_typeof(v_delivery) IS DISTINCT FROM 'object' THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_DELIVERY_DETAILS_REQUIRED','message','A delivery address and area are required.'));
    END IF;
    v_selection_type:=COALESCE(v_delivery->>'selection_type',v_delivery->>'selectionType');
    v_address:=NULLIF(pg_catalog.btrim(v_delivery->>'address'),''); v_instructions:=NULLIF(pg_catalog.btrim(v_delivery->>'instructions'),'');
    IF v_address IS NULL OR pg_catalog.char_length(v_address) NOT BETWEEN 5 AND 1000 OR (v_instructions IS NOT NULL AND pg_catalog.char_length(v_instructions)>500) THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_DELIVERY_ADDRESS_INVALID','message','Enter a complete delivery address.'));
    END IF;
    IF v_selection_type='listed_area' THEN
      BEGIN v_area_id:=(v_delivery->>'area_id')::uuid; EXCEPTION WHEN OTHERS THEN v_area_id:=NULL; END;
      IF v_area_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_DELIVERY_AREA_INVALID','message','Choose a listed delivery area.')); END IF;
      SELECT da.name,da.delivery_fee INTO v_area_name,v_area_fee FROM public.delivery_areas da
      WHERE da.id=v_area_id AND da.restaurant_id=v_restaurant_id AND da.branch_id=v_branch_id AND da.is_active FOR SHARE OF da;
      IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_DELIVERY_AREA_UNAVAILABLE','message','The selected delivery area is no longer available.')); END IF;
    ELSIF v_selection_type='not_listed' THEN
      v_area_id:=NULL; v_area_name:='Not Listed / Other';
      SELECT s.not_listed_delivery_fee INTO v_area_fee FROM public.branch_delivery_settings s
      WHERE s.restaurant_id=v_restaurant_id AND s.branch_id=v_branch_id FOR SHARE OF s;
      IF NOT FOUND OR v_area_fee IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_DEFAULT_DELIVERY_FEE_UNCONFIGURED','message','The Not Listed delivery fee is not configured for this branch.')); END IF;
    ELSE
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_DELIVERY_SELECTION_INVALID','message','Choose a listed delivery area or Not Listed.'));
    END IF;
    IF v_area_fee IS DISTINCT FROM v_delivery_fee THEN RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_DELIVERY_FEE_CHANGED','message','The delivery fee changed. Refresh the order before syncing.')); END IF;
  ELSE
    IF (v_delivery IS NOT NULL AND v_delivery<>'null'::jsonb) OR v_delivery_fee<>0 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_NON_DELIVERY_FIELDS_INVALID','message','Dine-in and takeaway orders cannot include delivery fees or addresses.'));
    END IF;
    v_area_id:=NULL;v_area_name:=NULL;v_selection_type:=NULL;v_address:=NULL;v_instructions:=NULL;v_area_fee:=0;
  END IF;

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items) LOOP
    IF pg_catalog.jsonb_typeof(v_item)<>'object' OR COALESCE(v_item->>'line_kind','') NOT IN ('product','deal')
       OR COALESCE(v_item->>'quantity','') !~ '^[1-9][0-9]*$' OR (v_item->>'quantity')::integer NOT BETWEEN 1 AND 99
       OR pg_catalog.jsonb_typeof(v_item->'item_snapshot') IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(v_item->'modifiers') IS DISTINCT FROM 'array'
       OR pg_catalog.jsonb_typeof(v_item->'components') IS DISTINCT FROM 'array' THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_ORDER_LINE_INVALID','message','An order line could not be validated.'));
    END IF;
    BEGIN v_unit_price:=(v_item->>'unit_price_snapshot')::numeric; v_line_total:=(v_item->>'line_total')::numeric; v_quantity:=(v_item->>'quantity')::integer;
    EXCEPTION WHEN OTHERS THEN RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_ORDER_LINE_AMOUNT_INVALID','message','An order line amount is invalid.'));
    END;
    IF v_unit_price IS NULL OR v_line_total IS NULL OR v_unit_price<0 OR v_line_total<0
       OR v_unit_price<>pg_catalog.round(v_unit_price,2) OR v_line_total<>pg_catalog.round(v_line_total,2)
       OR v_line_total<v_unit_price*v_quantity THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_ORDER_LINE_AMOUNT_INVALID','message','An order line amount is inconsistent.'));
    END IF;
    IF v_item->>'line_kind'='product' THEN
      IF COALESCE(v_item->>'product_id','') !~* '^[0-9a-f-]{36}$' OR COALESCE(v_item->>'product_variant_id','') !~* '^[0-9a-f-]{36}$' OR v_item->>'deal_id' IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_ORDER_PRODUCT_LINE_INVALID','message','A product line is missing its product or variant.'));
      END IF;
    ELSE
      IF COALESCE(v_item->>'deal_id','') !~* '^[0-9a-f-]{36}$' OR v_item->>'product_id' IS NOT NULL OR v_item->>'product_variant_id' IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_ORDER_DEAL_LINE_INVALID','message','A deal line is missing its published deal reference.'));
      END IF;
    END IF;
    v_calculated_subtotal:=v_calculated_subtotal+v_line_total;
  END LOOP;
  IF v_calculated_subtotal IS DISTINCT FROM v_subtotal THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_ORDER_SUBTOTAL_MISMATCH','message','The item totals do not match the server-calculated subtotal.'));
  END IF;

  SELECT o.* INTO v_existing FROM public.orders o
  WHERE o.restaurant_id=v_restaurant_id AND o.branch_id=v_branch_id AND o.source='pos'
    AND (o.local_order_id=v_local_order_id OR o.idempotency_key=v_idempotency_key)
  ORDER BY (o.local_order_id=v_local_order_id) DESC LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    IF v_existing.local_order_id IS DISTINCT FROM v_local_order_id OR v_existing.idempotency_key IS DISTINCT FROM v_idempotency_key THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_ORDER_IDENTITY_CONFLICT','message','This local POS order ID is already linked to a different server order.'));
    END IF;
    IF v_revision<v_existing.local_revision THEN
      RETURN pg_catalog.jsonb_build_object('ok',true,'already_processed',true,'stale_revision',true,'order_id',v_existing.id,'order_number',v_existing.order_number,'local_revision',v_existing.local_revision,'status',v_existing.status,'payment_status',v_existing.payment_status,'total',v_existing.total);
    END IF;
    IF v_revision=v_existing.local_revision THEN
      IF v_existing.request_hash<>v_request_hash THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_ORDER_REVISION_CONFLICT','message','This revision was already used with different order details.'));
      END IF;
      v_order_id:=v_existing.id; v_order:=v_existing;
    ELSE
      IF v_existing.status NOT IN ('new','needs_confirmation') OR v_existing.payment_status<>'unpaid' OR v_existing.paid_amount<>0 OR v_existing.fulfillment_type<>v_fulfillment THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_ORDER_NO_LONGER_EDITABLE','message','This order has moved forward or payment was recorded; POS edits are no longer allowed.'));
      END IF;
      v_order_id:=v_existing.id; v_updated:=true;
      UPDATE public.orders SET request_hash=v_request_hash,local_revision=v_revision,customer_name=v_customer_name,
        customer_phone=v_customer_phone,notes=v_notes,payment_method_summary=v_payment_method,
        delivery_address=v_address,delivery_area_id=v_area_id,delivery_area_name_snapshot=v_area_name,
        delivery_area_fee_snapshot=v_delivery_fee,delivery_selection_type=v_selection_type,delivery_instructions=v_instructions,
        subtotal=v_subtotal,discount_amount=0,delivery_fee=v_delivery_fee,total=v_total,
        balance_due=GREATEST(v_total-v_existing.paid_amount,0),catalog_publication_id=NULLIF(p_payload->>'catalog_publication_id','')::uuid,
        catalog_version=NULLIF(p_payload->>'catalog_version','')::bigint,
        table_reference=v_table_reference,table_label_snapshot=v_table_label,scheduled_for=v_scheduled_for,
        prepare_at=v_prepare_at,kitchen_timing=v_kitchen_timing,updated_at=v_now WHERE id=v_order_id;
      DELETE FROM public.order_item_modifiers WHERE order_id=v_order_id;
      DELETE FROM public.order_item_components WHERE order_id=v_order_id;
      DELETE FROM public.order_items WHERE order_id=v_order_id;
    END IF;
  ELSE
    v_business_date:=(v_now AT TIME ZONE COALESCE(v_branch_timezone,'Asia/Karachi'))::date;
    INSERT INTO app_private.order_number_counters(restaurant_id,branch_id,business_date,last_value,updated_at)
    VALUES(v_restaurant_id,v_branch_id,v_business_date,1,v_now)
    ON CONFLICT(branch_id,business_date) DO UPDATE SET last_value=app_private.order_number_counters.last_value+1,updated_at=EXCLUDED.updated_at
    RETURNING last_value INTO v_counter;
    v_order_number:='FC-'||pg_catalog.to_char(v_business_date,'YYMMDD')||'-'||pg_catalog.lpad(v_counter::text,4,'0');
    INSERT INTO public.orders(restaurant_id,branch_id,order_number,local_order_id,idempotency_key,request_hash,source,fulfillment_type,status,
      customer_name,customer_phone,delivery_address,delivery_area_id,delivery_area_name_snapshot,delivery_area_fee_snapshot,
      delivery_selection_type,delivery_instructions,catalog_publication_id,catalog_version,subtotal,discount_amount,delivery_fee,total,balance_due,
      paid_amount,currency_code,payment_status,payment_method_summary,notes,cashier_id,created_by_user_id,table_reference,
      table_label_snapshot,scheduled_for,prepare_at,kitchen_timing,placed_at,created_at,updated_at,last_status_actor_type,last_status_change_reason)
    VALUES(v_restaurant_id,v_branch_id,v_order_number,v_local_order_id,v_idempotency_key,v_request_hash,'pos',v_fulfillment,'new',
      v_customer_name,v_customer_phone,v_address,v_area_id,v_area_name,v_delivery_fee,v_selection_type,v_instructions,
      NULLIF(p_payload->>'catalog_publication_id','')::uuid,NULLIF(p_payload->>'catalog_version','')::bigint,
      v_subtotal,0,v_delivery_fee,v_total,v_total,0,v_currency,'unpaid',v_payment_method,v_notes,v_actor_id,v_actor_id,
      v_table_reference,v_table_label,v_scheduled_for,v_prepare_at,v_kitchen_timing,v_now,v_now,v_now,'staff','POS order received')
    RETURNING id INTO v_order_id;
  END IF;

  IF v_updated OR v_existing.id IS NULL THEN
    FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items) WITH ORDINALITY AS e(value,ordinality) ORDER BY ordinality LOOP
      v_ordinal:=v_ordinal+1; v_quantity:=(v_item->>'quantity')::integer;
      INSERT INTO public.order_items(restaurant_id,branch_id,order_id,line_number,line_kind,product_id,product_variant_id,deal_id,quantity,
        product_name_snapshot,variant_label_snapshot,deal_title_snapshot,unit_price_snapshot,discount_amount,line_total,item_notes,item_snapshot,catalog_publication_id)
      VALUES(v_restaurant_id,v_branch_id,v_order_id,v_ordinal,v_item->>'line_kind',NULLIF(v_item->>'product_id','')::uuid,
        NULLIF(v_item->>'product_variant_id','')::uuid,NULLIF(v_item->>'deal_id','')::uuid,v_quantity,
        NULLIF(v_item->>'product_name_snapshot',''),NULLIF(v_item->>'variant_label_snapshot',''),NULLIF(v_item->>'deal_title_snapshot',''),
        (v_item->>'unit_price_snapshot')::numeric,0,(v_item->>'line_total')::numeric,NULLIF(v_item->>'item_notes',''),v_item->'item_snapshot',
        NULLIF(p_payload->>'catalog_publication_id','')::uuid) RETURNING id INTO v_item_id;
      FOR v_modifier IN SELECT value FROM pg_catalog.jsonb_array_elements(v_item->'modifiers') LOOP
        INSERT INTO public.order_item_modifiers(restaurant_id,branch_id,order_id,order_item_id,order_item_component_id,modifier_group_id,modifier_id,
          quantity,modifier_group_name_snapshot,modifier_name_snapshot,unit_price_snapshot,total_price_snapshot,modifier_snapshot)
        VALUES(v_restaurant_id,v_branch_id,v_order_id,v_item_id,NULL,NULLIF(v_modifier->>'modifier_group_id','')::uuid,
          NULLIF(v_modifier->>'modifier_id','')::uuid,(v_modifier->>'quantity')::integer,
          NULLIF(v_modifier->>'modifier_group_name_snapshot',''),COALESCE(NULLIF(v_modifier->>'modifier_name_snapshot',''),'Modifier'),
          (v_modifier->>'unit_price_snapshot')::numeric,(v_modifier->>'total_price_snapshot')::numeric,COALESCE(v_modifier->'modifier_snapshot','{}'::jsonb));
      END LOOP;
      FOR v_component IN SELECT value FROM pg_catalog.jsonb_array_elements(v_item->'components') LOOP
        INSERT INTO public.order_item_components(restaurant_id,branch_id,order_id,order_item_id,deal_component_id,component_type,selected_product_id,
          selected_variant_id,selected_drink_option_id,quantity,name_snapshot,variant_snapshot,volume_snapshot,unit_price_snapshot,component_snapshot)
        VALUES(v_restaurant_id,v_branch_id,v_order_id,v_item_id,NULLIF(v_component->>'deal_component_id','')::uuid,v_component->>'component_type',
          NULLIF(v_component->>'selected_product_id','')::uuid,NULLIF(v_component->>'selected_variant_id','')::uuid,
          NULLIF(v_component->>'selected_drink_option_id','')::uuid,LEAST((v_component->>'quantity')::integer*v_quantity,99),
          v_component->>'name_snapshot',NULLIF(v_component->>'variant_snapshot',''),NULLIF(v_component->>'volume_snapshot',''),
          (v_component->>'unit_price_snapshot')::numeric,COALESCE(v_component->'component_snapshot','{}'::jsonb)) RETURNING id INTO v_component_id;
        FOR v_component_modifier IN SELECT value FROM pg_catalog.jsonb_array_elements(v_component->'modifiers') LOOP
          INSERT INTO public.order_item_modifiers(restaurant_id,branch_id,order_id,order_item_id,order_item_component_id,modifier_group_id,modifier_id,
            quantity,modifier_group_name_snapshot,modifier_name_snapshot,unit_price_snapshot,total_price_snapshot,modifier_snapshot)
          VALUES(v_restaurant_id,v_branch_id,v_order_id,v_item_id,v_component_id,NULLIF(v_component_modifier->>'modifier_group_id','')::uuid,
            NULLIF(v_component_modifier->>'modifier_id','')::uuid,LEAST((v_component_modifier->>'quantity')::integer*v_quantity,99),
            NULLIF(v_component_modifier->>'modifier_group_name_snapshot',''),COALESCE(NULLIF(v_component_modifier->>'modifier_name_snapshot',''),'Modifier'),
            (v_component_modifier->>'unit_price_snapshot')::numeric,(v_component_modifier->>'unit_price_snapshot')::numeric*LEAST((v_component_modifier->>'quantity')::integer*v_quantity,99),
            COALESCE(v_component_modifier->'modifier_snapshot','{}'::jsonb));
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;

  IF v_updated OR v_existing.id IS NULL THEN
    IF v_fulfillment='delivery' THEN
      INSERT INTO public.delivery_tasks(restaurant_id,branch_id,order_id,status,recipient_name_snapshot,recipient_phone_snapshot,
        address_snapshot,area_name_snapshot,area_id_snapshot,delivery_selection_type_snapshot,delivery_fee_snapshot,delivery_instructions_snapshot)
      VALUES(v_restaurant_id,v_branch_id,v_order_id,'dispatch_pending',v_customer_name,v_customer_phone,v_address,v_area_name,v_area_id,
        v_selection_type,v_delivery_fee,v_instructions)
      ON CONFLICT(order_id) DO UPDATE SET recipient_name_snapshot=EXCLUDED.recipient_name_snapshot,
        recipient_phone_snapshot=EXCLUDED.recipient_phone_snapshot,address_snapshot=EXCLUDED.address_snapshot,
        area_name_snapshot=EXCLUDED.area_name_snapshot,area_id_snapshot=EXCLUDED.area_id_snapshot,
        delivery_selection_type_snapshot=EXCLUDED.delivery_selection_type_snapshot,delivery_fee_snapshot=EXCLUDED.delivery_fee_snapshot,
        delivery_instructions_snapshot=EXCLUDED.delivery_instructions_snapshot,updated_at=v_now
      WHERE public.delivery_tasks.status='dispatch_pending';
    END IF;

    INSERT INTO public.order_status_history(restaurant_id,branch_id,order_id,from_status,to_status,action,actor_user_id,actor_type,actor_role,
      reason_code,reason,metadata,request_id,changed_at)
    VALUES(v_restaurant_id,v_branch_id,v_order_id,CASE WHEN v_updated THEN 'new' ELSE NULL END,'new',
      CASE WHEN v_updated THEN 'pos_order_edited' ELSE 'created' END,v_actor_id,'staff',v_role,
      CASE WHEN v_updated THEN 'POS_ORDER_EDITED' ELSE 'POS_ORDER_CREATED' END,
      CASE WHEN v_updated THEN 'POS order edited while still pending' ELSE 'POS order received' END,
      pg_catalog.jsonb_build_object('local_order_id',v_local_order_id,'local_revision',v_revision,'fulfillment_type',v_fulfillment,'table_reference',v_table_reference),
      pg_catalog.gen_random_uuid(),v_now);
  END IF;

  v_payment:=p_payload->'payment';
  IF v_payment IS NOT NULL AND v_payment<>'null'::jsonb THEN
    BEGIN v_payment_request:=(v_payment->>'request_id')::uuid; v_payment_amount:=(v_payment->>'amount')::numeric;
    EXCEPTION WHEN OTHERS THEN RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_PAYMENT_REQUEST_INVALID','message','The queued payment record is invalid.'));
    END;
    v_queued_payment_method:=pg_catalog.lower(pg_catalog.btrim(COALESCE(v_payment->>'payment_method','')));
    IF v_payment_request IS NULL OR v_payment_amount IS NULL OR v_payment_amount<=0 OR v_payment_amount<>pg_catalog.round(v_payment_amount,2)
       OR v_queued_payment_method NOT IN ('cash','card','bank','wallet','other') THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_PAYMENT_REQUEST_INVALID','message','The queued payment record is invalid.'));
    END IF;
    SELECT p.* INTO v_existing_payment FROM public.payments p
    WHERE p.restaurant_id=v_restaurant_id AND p.branch_id=v_branch_id AND p.order_id=v_order_id AND p.idempotency_key=v_payment_request::text;
    IF FOUND THEN
      IF v_existing_payment.amount<>v_payment_amount OR v_existing_payment.payment_method<>v_queued_payment_method
         OR v_existing_payment.received_by_user_id<>v_actor_id OR v_existing_payment.entry_type<>'collection' THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_PAYMENT_IDEMPOTENCY_CONFLICT','message','This payment request ID was already used with different details.'));
      END IF;
      v_payment_id:=v_existing_payment.id;
    ELSE
      SELECT * INTO v_order FROM public.orders WHERE id=v_order_id FOR UPDATE;
      IF v_order.status NOT IN ('new','needs_confirmation','served','delivered') OR v_order.payment_status NOT IN ('unpaid','partially_paid')
         OR (v_order.fulfillment_type='delivery' AND v_order.status<>'delivered') THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_PAYMENT_ORDER_STATE_INVALID','message','Payment can only be recorded for an open POS order, or after delivery has been marked Delivered.'));
      END IF;
      IF v_payment_amount>v_order.balance_due THEN RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object('code','POS_PAYMENT_EXCEEDS_BALANCE','message','The collected amount exceeds the outstanding balance.')); END IF;
      v_paid:=v_order.paid_amount+v_payment_amount; v_balance:=GREATEST(v_order.total-v_paid,0::numeric); v_fully_paid:=v_balance=0;
      INSERT INTO public.payments(restaurant_id,branch_id,order_id,entry_type,payment_method,amount,currency_code,status,idempotency_key,
        received_by_user_id,reason_code,reason_note,occurred_at,created_at)
      VALUES(v_restaurant_id,v_branch_id,v_order_id,'collection',v_queued_payment_method,v_payment_amount,v_order.currency_code,'succeeded',
        v_payment_request::text,v_actor_id,CASE WHEN v_fully_paid THEN 'BALANCE_SETTLED' ELSE 'PARTIAL_COLLECTION' END,
        CASE WHEN v_fully_paid THEN 'POS payment collected' ELSE 'POS partial payment collected' END,v_now,v_now)
      RETURNING id INTO v_payment_id;
      v_next_status:=CASE WHEN v_fully_paid THEN 'completed' ELSE v_order.status END;
      UPDATE public.orders SET paid_amount=v_paid,balance_due=v_balance,payment_status=CASE WHEN v_fully_paid THEN 'paid' ELSE 'partially_paid' END,
        payment_method_summary=CASE WHEN v_order.paid_amount=0 THEN v_queued_payment_method WHEN v_order.payment_method_summary=v_queued_payment_method THEN v_queued_payment_method ELSE 'mixed' END,
        status=v_next_status,collected_at=CASE WHEN v_fully_paid THEN v_now ELSE collected_at END,
        completed_at=CASE WHEN v_fully_paid THEN v_now ELSE completed_at END,last_status_changed_by=v_actor_id,last_status_actor_type='staff',
        last_status_change_reason=CASE WHEN v_fully_paid THEN 'POS payment fully collected' ELSE 'POS partial payment collected' END,updated_at=v_now
      WHERE id=v_order_id;
      INSERT INTO public.order_status_history(restaurant_id,branch_id,order_id,from_status,to_status,action,actor_user_id,actor_type,actor_role,
        reason_code,reason,metadata,request_id,changed_at)
      VALUES(v_restaurant_id,v_branch_id,v_order_id,v_order.status,v_next_status,CASE WHEN v_fully_paid THEN 'payment_collection_completed' ELSE 'payment_partially_collected' END,
        v_actor_id,'staff',v_role,CASE WHEN v_fully_paid THEN 'PAYMENT_BALANCE_SETTLED' ELSE 'PAYMENT_PARTIAL' END,
        CASE WHEN v_fully_paid THEN 'POS payment fully collected' ELSE 'POS partial payment collected' END,
        pg_catalog.jsonb_build_object('payment_id',v_payment_id,'amount',v_payment_amount,'payment_method',v_queued_payment_method,'paid_amount',v_paid,'balance_due',v_balance),
        v_payment_request,v_now);
    END IF;
  END IF;

  SELECT o.* INTO v_order FROM public.orders o WHERE o.id=v_order_id;
  RETURN pg_catalog.jsonb_build_object('ok',true,'already_processed',NOT v_updated AND v_existing.id IS NOT NULL,
    'order_id',v_order.id,'order_number',v_order.order_number,'local_order_id',v_order.local_order_id,
    'local_revision',v_order.local_revision,'status',v_order.status,'payment_status',v_order.payment_status,
    'fulfillment_type',v_order.fulfillment_type,'subtotal',v_order.subtotal,'delivery_fee',v_order.delivery_fee,
    'total',v_order.total,'paid_amount',v_order.paid_amount,'balance_due',v_order.balance_due,
    'currency_code',v_order.currency_code,'created_at',v_order.created_at,'payment_id',v_payment_id);
END;
$function$;

ALTER FUNCTION public.flame_chick_sync_pos_order(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_sync_pos_order(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_sync_pos_order(jsonb) TO service_role;

DO $verify$
DECLARE v_oid oid:=pg_catalog.to_regprocedure('public.flame_chick_sync_pos_order(jsonb)');
BEGIN
  IF v_oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=v_oid AND p.prosecdef
      AND pg_catalog.pg_get_userbyid(p.proowner)='postgres' AND p.proconfig @> ARRAY['search_path=""'])
     OR NOT pg_catalog.has_function_privilege('service_role',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('public',v_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'FLAME_CHICK_POS_ORDER_SYNC_RPC_SECURITY_INVALID';
  END IF;
  IF pg_catalog.has_table_privilege('service_role','public.orders','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.orders','UPDATE')
     OR pg_catalog.has_table_privilege('service_role','public.order_items','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.payments','INSERT') THEN
    RAISE EXCEPTION 'FLAME_CHICK_POS_ORDER_SYNC_DIRECT_DML_PRESENT';
  END IF;
END;
$verify$;
COMMIT;
