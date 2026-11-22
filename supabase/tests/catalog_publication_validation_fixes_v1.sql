-- Rollback-only fixture for catalog publication validation fixes V1.
-- Run after the full migration chain on a disposable Supabase local stack.
BEGIN;

DO $test$
DECLARE
  v_restaurant uuid := gen_random_uuid();
  v_branch uuid := gen_random_uuid();
  v_menu_category uuid := gen_random_uuid();
  v_deal_category uuid := gen_random_uuid();
  v_product uuid := gen_random_uuid();
  v_product_variant uuid := gen_random_uuid();
  v_optional_collection uuid := gen_random_uuid();
  v_optional_deal uuid := gen_random_uuid();
  v_optional_variant uuid := gen_random_uuid();
  v_optional_group uuid := gen_random_uuid();
  v_optional_option uuid := gen_random_uuid();
  v_required_collection uuid := gen_random_uuid();
  v_required_deal uuid := gen_random_uuid();
  v_required_variant uuid := gen_random_uuid();
  v_required_group uuid := gen_random_uuid();
  v_required_option uuid := gen_random_uuid();
  v_referenced_schedule uuid := gen_random_uuid();
  v_unreferenced_schedule uuid := gen_random_uuid();
  v_schedule_collection uuid := gen_random_uuid();
  v_errors jsonb;
  v_snapshot jsonb;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'FIXTURE_REQUIRES_POSTGRES';
  END IF;

  INSERT INTO public.restaurants(id,name,slug,currency_code,timezone,is_active)
  VALUES(v_restaurant,'QA Restaurant','qa-catalog-validator-v1','PKR','Asia/Karachi',true);
  INSERT INTO public.branches(id,restaurant_id,branch_code,name,is_active)
  VALUES(v_branch,v_restaurant,'qa','QA Branch',true);

  INSERT INTO public.categories(id,restaurant_id,category_kind,name_en,is_active)
  VALUES
    (v_menu_category,v_restaurant,'menu','QA Menu Category',true),
    (v_deal_category,v_restaurant,'deal','QA Deal Category',true);

  INSERT INTO public.products(id,restaurant_id,category_id,name_en,is_active,is_available)
  VALUES(v_product,v_restaurant,v_menu_category,'QA Product',true,true);
  INSERT INTO public.product_variants(id,restaurant_id,product_id,size_key,size_label,price,is_active,is_available)
  VALUES(v_product_variant,v_restaurant,v_product,'QA','QA',100,true,true);

  -- Optional group has an eligible option but intentionally no variant map.
  INSERT INTO public.deal_collections(id,restaurant_id,category_id,name_en,is_active)
  VALUES(v_optional_collection,v_restaurant,v_deal_category,'QA Optional Collection',true);
  INSERT INTO public.deals(id,restaurant_id,collection_id,title,is_active,is_available)
  VALUES(v_optional_deal,v_restaurant,v_optional_collection,'QA Optional Deal',true,true);
  INSERT INTO public.deal_variants(id,restaurant_id,deal_id,variant_key,label_en,pricing_mode,base_price,is_active)
  VALUES(v_optional_variant,v_restaurant,v_optional_deal,'QA','QA','FIXED_BUNDLE',100,true);
  INSERT INTO public.deal_component_groups(id,restaurant_id,deal_id,name_en,min_units,max_units,is_active)
  VALUES(v_optional_group,v_restaurant,v_optional_deal,'QA Optional Group',0,1,true);
  INSERT INTO public.deal_component_options(
    id,restaurant_id,deal_id,component_group_id,product_id,product_variant_id,pricing_treatment,is_active
  ) VALUES(v_optional_option,v_restaurant,v_optional_deal,v_optional_group,v_product,v_product_variant,'INCLUDED',true);

  -- Required group has an eligible option but intentionally no variant map.
  INSERT INTO public.deal_collections(id,restaurant_id,category_id,name_en,is_active)
  VALUES(v_required_collection,v_restaurant,v_deal_category,'QA Required Collection',true);
  INSERT INTO public.deals(id,restaurant_id,collection_id,title,is_active,is_available)
  VALUES(v_required_deal,v_restaurant,v_required_collection,'QA Required Deal',true,true);
  INSERT INTO public.deal_variants(id,restaurant_id,deal_id,variant_key,label_en,pricing_mode,base_price,is_active)
  VALUES(v_required_variant,v_restaurant,v_required_deal,'QA','QA','FIXED_BUNDLE',100,true);
  INSERT INTO public.deal_component_groups(id,restaurant_id,deal_id,name_en,min_units,max_units,is_active)
  VALUES(v_required_group,v_restaurant,v_required_deal,'QA Required Group',1,1,true);
  INSERT INTO public.deal_component_options(
    id,restaurant_id,deal_id,component_group_id,product_id,product_variant_id,pricing_treatment,is_active
  ) VALUES(v_required_option,v_restaurant,v_required_deal,v_required_group,v_product,v_product_variant,'INCLUDED',true);

  -- Referenced empty schedule must still be rejected.
  INSERT INTO public.catalog_schedule_sets(id,restaurant_id,name,is_active,timezone)
  VALUES(v_referenced_schedule,v_restaurant,'QA Referenced Empty Schedule',true,'Asia/Karachi');
  INSERT INTO public.deal_collections(id,restaurant_id,category_id,schedule_set_id,name_en,is_active)
  VALUES(v_schedule_collection,v_restaurant,v_deal_category,v_referenced_schedule,'QA Schedule Collection',true);

  -- Unreferenced active empty schedule is a harmless draft and must be ignored.
  INSERT INTO public.catalog_schedule_sets(id,restaurant_id,name,is_active,timezone)
  VALUES(v_unreferenced_schedule,v_restaurant,'QA Unreferenced Empty Schedule',true,'Asia/Karachi');

  v_errors := app_private.flame_chick_catalog_publication_validate(v_restaurant)->'errors';

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_errors) e
    WHERE e->>'code'='DEAL_VARIANT_REQUIRED_GROUP_NOT_CONFIGURED'
      AND e->>'component_group_id'=v_optional_group::text
  ) THEN RAISE EXCEPTION 'OPTIONAL_GROUP_WITHOUT_VARIANT_MAP_WAS_REJECTED'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_errors) e
    WHERE e->>'code'='DEAL_VARIANT_REQUIRED_GROUP_NOT_CONFIGURED'
      AND e->>'component_group_id'=v_required_group::text
  ) THEN RAISE EXCEPTION 'REQUIRED_GROUP_MISSING_VARIANT_MAP_WAS_NOT_REJECTED'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_errors) e
    WHERE e->>'code'='ACTIVE_SCHEDULE_SET_INVALID'
      AND e->>'entity_id'=v_referenced_schedule::text
  ) THEN RAISE EXCEPTION 'REFERENCED_EMPTY_SCHEDULE_WAS_NOT_REJECTED'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_errors) e
    WHERE e->>'code'='ACTIVE_SCHEDULE_SET_INVALID'
      AND e->>'entity_id'=v_unreferenced_schedule::text
  ) THEN RAISE EXCEPTION 'UNREFERENCED_EMPTY_SCHEDULE_WAS_REJECTED'; END IF;

  v_snapshot := app_private.flame_chick_catalog_compile_snapshot(v_restaurant,now());

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_snapshot->'scheduleSets') s
    WHERE s->>'scheduleSetId'=v_unreferenced_schedule::text
  ) THEN RAISE EXCEPTION 'UNREFERENCED_SCHEDULE_WAS_COMPILED'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_snapshot->'scheduleSets') s
    WHERE s->>'scheduleSetId'=v_referenced_schedule::text
  ) THEN RAISE EXCEPTION 'REFERENCED_SCHEDULE_MISSING_FROM_COMPILER'; END IF;
END;
$test$;

ROLLBACK;
