-- Disposable local-only fixture for exercising the real Website Order API against local PostgREST/RPC.
-- The owning CI job always tears down the disposable Supabase stack with --no-backup.
SELECT pg_catalog.set_config('test.flame_chick_route.snapshot_b64', :'snapshot_b64', false);

DO $fixture$
DECLARE
  v_snapshot jsonb;
  v_restaurant_id uuid;
  v_branch_id uuid;
  v_publication_id uuid;
  v_user_id uuid := 'c9999999-9999-4999-8999-999999999991';
  v_area_id uuid := '17000000-0000-4000-8000-000000000001';
  v_category jsonb;
  v_product jsonb;
  v_variant jsonb;
  v_category_id uuid;
  v_product_id uuid;
  v_variant_id uuid;
  v_snapshot_sha256 text;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'WEBSITE_ORDER_ROUTE_SETUP_REQUIRES_POSTGRES';
  END IF;

  v_snapshot := pg_catalog.convert_from(
    pg_catalog.decode(current_setting('test.flame_chick_route.snapshot_b64'), 'base64'),
    'UTF8'
  )::jsonb;

  v_restaurant_id := (v_snapshot->>'restaurantId')::uuid;
  v_branch_id := (v_snapshot->'branches'->0->>'branchId')::uuid;
  v_publication_id := (v_snapshot->>'publicationId')::uuid;

  SELECT value INTO v_variant
  FROM pg_catalog.jsonb_array_elements(v_snapshot->'productVariants')
       WITH ORDINALITY AS rows(value, ordinality)
  WHERE (value->>'standaloneSellable')::boolean IS TRUE
  ORDER BY ordinality
  LIMIT 1;

  IF v_variant IS NULL THEN
    RAISE EXCEPTION 'WEBSITE_ORDER_ROUTE_SETUP_NO_STANDALONE_VARIANT';
  END IF;

  v_variant_id := (v_variant->>'variantId')::uuid;
  v_product_id := (v_variant->>'productId')::uuid;

  SELECT value INTO v_product
  FROM pg_catalog.jsonb_array_elements(v_snapshot->'products')
  WHERE value->>'productId' = v_product_id::text
  LIMIT 1;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'WEBSITE_ORDER_ROUTE_SETUP_VARIANT_PRODUCT_MISSING';
  END IF;

  v_category_id := (v_product->>'categoryId')::uuid;

  SELECT value INTO v_category
  FROM pg_catalog.jsonb_array_elements(v_snapshot->'categories')
  WHERE value->>'categoryId' = v_category_id::text
  LIMIT 1;

  IF v_category IS NULL OR v_category->>'categoryKind' <> 'menu' THEN
    RAISE EXCEPTION 'WEBSITE_ORDER_ROUTE_SETUP_MENU_CATEGORY_MISSING';
  END IF;

  IF EXISTS (SELECT 1 FROM public.restaurants WHERE slug='flame-chick')
     OR EXISTS (SELECT 1 FROM auth.users WHERE id=v_user_id) THEN
    RAISE EXCEPTION 'WEBSITE_ORDER_ROUTE_SETUP_TENANT_CONFLICT';
  END IF;

  IF v_snapshot->>'schemaVersion' <> '3'
     OR v_snapshot->>'restaurantSlug' <> 'flame-chick'
     OR v_snapshot->>'publicationNumber' <> '2'
     OR v_snapshot->>'draftRevision' <> '92'
     OR v_snapshot->>'pricingEngineVersion' <> 'flame-chick-pricing-v1' THEN
    RAISE EXCEPTION 'WEBSITE_ORDER_ROUTE_SETUP_SNAPSHOT_METADATA_INVALID';
  END IF;

  INSERT INTO public.restaurants(id,name,slug,currency_code,timezone,is_active)
  VALUES(
    v_restaurant_id,
    'QA Flame Chick Website Route',
    'flame-chick',
    'PKR',
    'Asia/Karachi',
    true
  );

  INSERT INTO public.branches(
    id,restaurant_id,branch_code,name,is_active,
    website_ordering_enabled,website_delivery_enabled,website_pickup_enabled,timezone
  ) VALUES(
    v_branch_id,v_restaurant_id,'main','QA Website Route Branch',true,
    true,true,true,'Asia/Karachi'
  );

  INSERT INTO auth.users(
    id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    is_sso_user,is_anonymous
  ) VALUES(
    v_user_id,'authenticated','authenticated',
    'qa-website-route-publisher@example.invalid','',
    v_now,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    v_now,v_now,false,false
  );

  INSERT INTO public.categories(
    id,restaurant_id,category_kind,name_en,is_active,sort_order
  ) VALUES(
    v_category_id,v_restaurant_id,'menu',
    v_category->>'nameEn',true,
    COALESCE((v_category->>'sortOrder')::integer,1)
  );

  INSERT INTO public.products(
    id,restaurant_id,category_id,category_kind,name_en,is_active,is_available,sort_order
  ) VALUES(
    v_product_id,v_restaurant_id,v_category_id,'menu',
    v_product->>'nameEn',true,true,
    COALESCE((v_product->>'sortOrder')::integer,1)
  );

  INSERT INTO public.product_variants(
    id,restaurant_id,product_id,size_key,size_label,price,
    variant_kind,pack_quantity,pack_unit,is_standalone_sellable,
    is_active,is_available,sort_order
  ) VALUES(
    v_variant_id,v_restaurant_id,v_product_id,
    v_variant->>'sizeKey',v_variant->>'sizeLabel',
    (v_variant->>'price')::numeric,
    COALESCE(v_variant->>'variantKind','standard'),
    NULLIF(v_variant->>'packQuantity','')::integer,
    NULLIF(v_variant->>'packUnit',''),
    true,true,true,COALESCE((v_variant->>'sortOrder')::integer,1)
  );

  INSERT INTO public.branch_product_availability(
    restaurant_id,branch_id,product_id,is_available
  ) VALUES(v_restaurant_id,v_branch_id,v_product_id,true);

  INSERT INTO public.branch_variant_availability(
    restaurant_id,branch_id,product_id,product_variant_id,is_available
  ) VALUES(v_restaurant_id,v_branch_id,v_product_id,v_variant_id,true);

  INSERT INTO public.delivery_areas(
    id,restaurant_id,branch_id,name,delivery_fee,sort_order,is_active
  ) VALUES(
    v_area_id,v_restaurant_id,v_branch_id,'Synthetic QA Area',50,1,true
  );

  INSERT INTO public.branch_delivery_settings(
    branch_id,restaurant_id,not_listed_delivery_fee
  ) VALUES(v_branch_id,v_restaurant_id,NULL);

  -- Hash the exact canonical JSONB representation used by the public catalog RPC.
  v_snapshot_sha256 := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_snapshot::text,'UTF8'),'sha256'),
    'hex'
  );

  INSERT INTO public.catalog_publications(
    id,restaurant_id,publication_number,draft_revision,schema_version,
    pricing_engine_version,snapshot,snapshot_sha256,published_by,published_at
  ) VALUES(
    v_publication_id,v_restaurant_id,2,92,3,
    'flame-chick-pricing-v1',v_snapshot,v_snapshot_sha256,v_user_id,
    COALESCE(NULLIF(v_snapshot->>'publishedAt','')::timestamptz,v_now)
  );

  INSERT INTO public.catalog_current_publication(
    restaurant_id,publication_id,updated_by
  ) VALUES(v_restaurant_id,v_publication_id,v_user_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.flame_chick_catalog_public_read('flame-chick') AS result
    WHERE result->>'published'='true'
      AND result->>'snapshotSha256'=v_snapshot_sha256
      AND result->>'publicationId'=v_publication_id::text
  ) THEN
    RAISE EXCEPTION 'WEBSITE_ORDER_ROUTE_SETUP_PUBLIC_CATALOG_READ_FAILED';
  END IF;

  RAISE NOTICE 'Synthetic Flame Chick Website route fixture is ready: branch %, product %, variant %, area %',
    v_branch_id,v_product_id,v_variant_id,v_area_id;
END;
$fixture$;
