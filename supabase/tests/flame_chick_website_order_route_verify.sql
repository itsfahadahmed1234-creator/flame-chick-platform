DO $verify$
DECLARE
  v_restaurant_id uuid;
  v_order_id uuid;
  v_order_count integer;
  v_item_count integer;
  v_history_count integer;
  v_task_count integer;
  v_event_count integer;
  v_payment_count integer;
BEGIN
  SELECT id INTO v_restaurant_id FROM public.restaurants WHERE slug='flame-chick';
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'WEBSITE_ORDER_ROUTE_VERIFY_RESTAURANT_MISSING';
  END IF;

  SELECT count(*) INTO v_order_count
  FROM public.orders
  WHERE restaurant_id=v_restaurant_id AND source='website';

  SELECT id INTO v_order_id
  FROM public.orders
  WHERE restaurant_id=v_restaurant_id AND source='website'
  ORDER BY created_at,id
  LIMIT 1;

  IF v_order_count <> 1 OR v_order_id IS NULL THEN
    RAISE EXCEPTION 'WEBSITE_ORDER_ROUTE_VERIFY_EXPECTED_ONE_ORDER: %',v_order_count;
  END IF;

  SELECT count(*) INTO v_item_count FROM public.order_items WHERE order_id=v_order_id;
  SELECT count(*) INTO v_history_count FROM public.order_status_history WHERE order_id=v_order_id;
  SELECT count(*) INTO v_task_count FROM public.delivery_tasks WHERE order_id=v_order_id;
  SELECT count(*) INTO v_event_count FROM app_private.website_order_success_events WHERE order_id=v_order_id;
  SELECT count(*) INTO v_payment_count FROM public.payments WHERE order_id=v_order_id;

  IF v_item_count <> 1 OR v_history_count <> 1 OR v_task_count <> 1
     OR v_event_count <> 1 OR v_payment_count <> 0 THEN
    RAISE EXCEPTION 'WEBSITE_ORDER_ROUTE_VERIFY_CHILD_ROWS_INVALID: items %, history %, tasks %, quota events %, payments %',
      v_item_count,v_history_count,v_task_count,v_event_count,v_payment_count;
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.orders o
    JOIN public.delivery_tasks d ON d.order_id=o.id
    WHERE o.id=v_order_id
      AND o.status='new'
      AND o.payment_status='unpaid'
      AND o.paid_amount=0
      AND o.completed_at IS NULL
      AND o.subtotal=550
      AND o.delivery_fee=50
      AND o.total=600
      AND d.status='dispatch_pending'
  ) THEN
    RAISE EXCEPTION 'WEBSITE_ORDER_ROUTE_VERIFY_FINANCIAL_OR_DELIVERY_STATE_INVALID';
  END IF;

  RAISE NOTICE 'Verified one real local website order: new/unpaid, $550 item + $50 delivery, dispatch_pending, no payment.';
END;
$verify$;
