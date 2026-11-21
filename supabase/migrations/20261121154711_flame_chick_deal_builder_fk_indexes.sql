-- Cover the four composite foreign keys identified by the Production
-- Performance Advisor after deal-builder V1 was introduced.
-- These child-side support indexes have the same leading column order as each
-- referenced FK; existing query/unique indexes do not cover these FK orders.

BEGIN;

DO $preflight$
BEGIN
  IF current_user<>'postgres' OR session_user<>'postgres' THEN
    RAISE EXCEPTION 'DEAL_FK_INDEX_MIGRATION_REQUIRES_POSTGRES';
  END IF;
  IF pg_catalog.to_regclass('public.deal_schedule_assignments') IS NULL
     OR pg_catalog.to_regclass('public.deal_variant_component_options') IS NULL
     OR pg_catalog.to_regclass('public.deal_variants') IS NULL THEN
    RAISE EXCEPTION 'DEAL_FK_INDEX_TABLE_MISSING';
  END IF;
  IF pg_catalog.to_regclass('public.deal_schedule_assignments_branch_fk_idx') IS NOT NULL
     OR pg_catalog.to_regclass('public.deal_schedule_assignments_deal_fk_idx') IS NOT NULL
     OR pg_catalog.to_regclass('public.deal_variant_component_options_variant_fk_idx') IS NOT NULL
     OR pg_catalog.to_regclass('public.deal_variants_deal_fk_idx') IS NOT NULL THEN
    RAISE EXCEPTION 'DEAL_FK_INDEX_NAME_ALREADY_EXISTS';
  END IF;
END;
$preflight$;

CREATE INDEX deal_schedule_assignments_branch_fk_idx
  ON public.deal_schedule_assignments (branch_id, restaurant_id);
CREATE INDEX deal_schedule_assignments_deal_fk_idx
  ON public.deal_schedule_assignments (deal_id, restaurant_id);
CREATE INDEX deal_variant_component_options_variant_fk_idx
  ON public.deal_variant_component_options (deal_variant_id, deal_id, restaurant_id);
CREATE INDEX deal_variants_deal_fk_idx
  ON public.deal_variants (deal_id, restaurant_id);

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname='public' AND indexname='deal_schedule_assignments_branch_fk_idx'
      AND indexdef LIKE '%(branch_id, restaurant_id)%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname='public' AND indexname='deal_schedule_assignments_deal_fk_idx'
      AND indexdef LIKE '%(deal_id, restaurant_id)%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname='public' AND indexname='deal_variant_component_options_variant_fk_idx'
      AND indexdef LIKE '%(deal_variant_id, deal_id, restaurant_id)%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname='public' AND indexname='deal_variants_deal_fk_idx'
      AND indexdef LIKE '%(deal_id, restaurant_id)%'
  ) THEN
    RAISE EXCEPTION 'DEAL_FK_INDEX_VERIFICATION_FAILED';
  END IF;
END;
$verify$;

COMMIT;
