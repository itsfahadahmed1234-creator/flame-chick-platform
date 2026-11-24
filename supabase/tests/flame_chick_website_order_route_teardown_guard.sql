-- Read-only guard: the synthetic publication is append-only. The owning QA workflow
-- tears down the entire disposable Supabase stack with --no-backup at job end.
DO $guard$
DECLARE
  v_restaurant_id uuid;
  v_order_count integer := 0;
BEGIN
  SELECT id INTO v_restaurant_id FROM public.restaurants WHERE slug='flame-chick';
  IF v_restaurant_id IS NULL THEN
    RAISE NOTICE 'No route fixture was committed; disposable stack will be discarded.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_order_count
  FROM public.orders
  WHERE restaurant_id=v_restaurant_id AND source='website';

  IF v_order_count NOT IN (0,1) THEN
    RAISE EXCEPTION 'WEBSITE_ORDER_ROUTE_TEARDOWN_UNEXPECTED_ORDER_COUNT: %',v_order_count;
  END IF;
  RAISE NOTICE 'Synthetic route fixture is confined to disposable local Supabase; stack teardown discards immutable publication and test rows.';
END;
$guard$;
