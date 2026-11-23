-- Flame Chick delivery offer identity guard V1.
-- An assignment must be for the exact rider targeted by its source offer.
-- Also reserve offer request IDs per branch so assignment retries can be
-- idempotent in the upcoming transactional command migration.
BEGIN;

ALTER TABLE public.delivery_task_offers
  ADD CONSTRAINT delivery_task_offers_rider_identity_key
  UNIQUE(id,delivery_task_id,branch_id,restaurant_id,rider_user_id);

ALTER TABLE public.delivery_assignments
  DROP CONSTRAINT delivery_assignments_offer_fkey;

ALTER TABLE public.delivery_assignments
  ADD CONSTRAINT delivery_assignments_offer_rider_fkey
  FOREIGN KEY(offer_id,delivery_task_id,branch_id,restaurant_id,rider_user_id)
  REFERENCES public.delivery_task_offers(
    id,delivery_task_id,branch_id,restaurant_id,rider_user_id
  ) ON DELETE RESTRICT;

CREATE UNIQUE INDEX delivery_task_offers_request_idempotency_uq
  ON public.delivery_task_offers(restaurant_id,branch_id,request_id)
  WHERE request_id IS NOT NULL;

DO $verify$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='public.delivery_assignments'::regclass
      AND conname='delivery_assignments_offer_rider_fkey'
      AND contype='f'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE
        '%(offer_id, delivery_task_id, branch_id, restaurant_id, rider_user_id)%'
  ) THEN
    RAISE EXCEPTION 'FLAME_CHICK_DELIVERY_ASSIGNMENT_OFFER_RIDER_FK_MISSING';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
    WHERE i.indrelid='public.delivery_task_offers'::regclass
      AND c.relname='delivery_task_offers_request_idempotency_uq'
      AND i.indisunique AND i.indpred IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FLAME_CHICK_DELIVERY_OFFER_REQUEST_IDEMPOTENCY_INDEX_MISSING';
  END IF;
END;
$verify$;

COMMIT;
