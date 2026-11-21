-- Flame Chick Catalog FK indexes V1
-- STAGED ONLY. Do not apply until migration history is reconciled.
-- Requires catalog foundation version 20261121061000 to be recorded as applied.
-- Expected execution identity: current_user = postgres AND session_user = postgres.
--
-- Covers the 15 child-side FK column sets flagged by Supabase Performance Advisor.
-- No application privileges, policies, RLS settings, or business data are changed.

BEGIN;
DO $preflight$
DECLARE v_table text;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Catalog FK index migration must run as postgres';
  END IF;
  FOREACH v_table IN ARRAY ARRAY[
    'subcategories','products','product_variants','modifiers',
    'modifier_group_assignments','modifier_price_rules','drink_options',
    'branch_product_availability','branch_variant_availability'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      RAISE EXCEPTION 'Required catalog foundation relation public.% is missing', v_table;
    END IF;
  END LOOP;
END;
$preflight$;

CREATE INDEX IF NOT EXISTS subcategories_category_tenant_fk_idx
  ON public.subcategories (category_id, restaurant_id, category_kind);
CREATE INDEX IF NOT EXISTS products_category_tenant_fk_idx
  ON public.products (category_id, restaurant_id, category_kind);
CREATE INDEX IF NOT EXISTS products_subcategory_tenant_fk_idx
  ON public.products (subcategory_id, restaurant_id, category_id);
CREATE INDEX IF NOT EXISTS product_variants_product_tenant_fk_idx
  ON public.product_variants (product_id, restaurant_id);
CREATE INDEX IF NOT EXISTS modifiers_group_tenant_fk_idx
  ON public.modifiers (modifier_group_id, restaurant_id);
CREATE INDEX IF NOT EXISTS modifier_group_assignments_group_tenant_fk_idx
  ON public.modifier_group_assignments (modifier_group_id, restaurant_id);
CREATE INDEX IF NOT EXISTS modifier_group_assignments_product_tenant_fk_idx
  ON public.modifier_group_assignments (product_id, restaurant_id);
CREATE INDEX IF NOT EXISTS modifier_price_rules_assignment_fk_idx
  ON public.modifier_price_rules (restaurant_id, modifier_group_id, product_id);
CREATE INDEX IF NOT EXISTS modifier_price_rules_modifier_fk_idx
  ON public.modifier_price_rules (modifier_id, restaurant_id, modifier_group_id);
CREATE INDEX IF NOT EXISTS modifier_price_rules_product_variant_fk_idx
  ON public.modifier_price_rules (restaurant_id, product_id, size_key);
CREATE INDEX IF NOT EXISTS drink_options_product_variant_tenant_fk_idx
  ON public.drink_options (product_variant_id, restaurant_id);
CREATE INDEX IF NOT EXISTS branch_product_availability_branch_tenant_fk_idx
  ON public.branch_product_availability (branch_id, restaurant_id);
CREATE INDEX IF NOT EXISTS branch_product_availability_product_tenant_fk_idx
  ON public.branch_product_availability (product_id, restaurant_id);
CREATE INDEX IF NOT EXISTS branch_variant_availability_branch_tenant_fk_idx
  ON public.branch_variant_availability (branch_id, restaurant_id);
CREATE INDEX IF NOT EXISTS branch_variant_availability_variant_tenant_fk_idx
  ON public.branch_variant_availability (product_variant_id, restaurant_id, product_id);

DO $verify$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(required.index_name, ', ' ORDER BY required.index_name)
    INTO v_missing
    FROM (VALUES
      ('subcategories_category_tenant_fk_idx'),
      ('products_category_tenant_fk_idx'),
      ('products_subcategory_tenant_fk_idx'),
      ('product_variants_product_tenant_fk_idx'),
      ('modifiers_group_tenant_fk_idx'),
      ('modifier_group_assignments_group_tenant_fk_idx'),
      ('modifier_group_assignments_product_tenant_fk_idx'),
      ('modifier_price_rules_assignment_fk_idx'),
      ('modifier_price_rules_modifier_fk_idx'),
      ('modifier_price_rules_product_variant_fk_idx'),
      ('drink_options_product_variant_tenant_fk_idx'),
      ('branch_product_availability_branch_tenant_fk_idx'),
      ('branch_product_availability_product_tenant_fk_idx'),
      ('branch_variant_availability_branch_tenant_fk_idx'),
      ('branch_variant_availability_variant_tenant_fk_idx')
    ) AS required(index_name)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_catalog.pg_class c
     JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = required.index_name AND c.relkind = 'i'
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Catalog FK index verification failed: %', v_missing;
  END IF;
  RAISE NOTICE 'All 15 catalog child-side foreign-key indexes exist';
END;
$verify$;
COMMIT;
