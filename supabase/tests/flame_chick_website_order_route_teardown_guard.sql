-- Read-only guard: the synthetic publication is append-only. The local stack is discarded by the owning QA workflow.
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public.restaurants WHERE slug='flame-chick') <> 1 THEN
    RAISE EXCEPTION 'WEBSITE_ORDER_ROUTE_TEARDOWN_EXPECTED_ONE_SYNTHETIC_TENANT';
  END IF;
  IF (SELECT count(*) FROM public.orders o JOIN public.restaurants r ON r.id=o.restaurant_id
      WHERE r.slug='flame-chick' AND o.source='website') <> 1 THEN
    RAISE EXCEPTION 'WEBSITE_ORDER_ROUTE_TEARDOWN_EXPECTED_ONE_SYNTHETIC_ORDER';
  END IF;
  RAISE NOTICE 'Synthetic rows are confined to the disposable local Supabase database; stop --no-backup will discard the runner-local stack.';
END;
$guard$;
