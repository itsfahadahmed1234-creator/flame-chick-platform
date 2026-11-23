-- Flame Chick catalog publication validator recovery V1.
-- Forward-only compensation for 20261122035721_flame_chick_catalog_publication_validation_fixes_v1.
-- Restores the exact helper source bodies from 20261122031027 while preserving the
-- postgres-only execution boundary. This is NOT a migration-ledger repair or deletion.
-- Apply only after the candidate migration has committed and its exact candidate hashes
-- are still present. Any source or security drift fails closed.

BEGIN;

CREATE TEMP TABLE flame_chick_catalog_restore_guard (
  function_oid oid PRIMARY KEY,
  function_owner oid NOT NULL,
  function_acl aclitem[],
  function_security_definer boolean NOT NULL,
  function_config text[],
  function_volatility "char" NOT NULL,
  function_is_strict boolean NOT NULL,
  function_parallel "char" NOT NULL,
  function_is_leakproof boolean NOT NULL,
  function_cost real NOT NULL,
  function_rows real NOT NULL,
  function_returns_set boolean NOT NULL,
  function_kind "char" NOT NULL
) ON COMMIT DROP;

DO $preflight$
DECLARE
  v_validate oid;
  v_compile oid;
  v_validate_hash text;
  v_compile_hash text;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'CATALOG_VALIDATION_RESTORE_REQUIRES_POSTGRES';
  END IF;

  v_validate := pg_catalog.to_regprocedure('app_private.flame_chick_catalog_publication_validate(uuid)');
  v_compile := pg_catalog.to_regprocedure('app_private.flame_chick_catalog_compile_snapshot(uuid,timestamptz)');
  IF v_validate IS NULL OR v_compile IS NULL THEN
    RAISE EXCEPTION 'CATALOG_VALIDATION_RESTORE_HELPERS_MISSING';
  END IF;

  SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')
    INTO v_validate_hash
  FROM pg_catalog.pg_proc p WHERE p.oid=v_validate;

  SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')
    INTO v_compile_hash
  FROM pg_catalog.pg_proc p WHERE p.oid=v_compile;

  -- Exact source hashes of the reviewed candidate migration. This prevents this
  -- compensation being used after an unrelated helper edit or a later revision.
  IF v_validate_hash IS DISTINCT FROM '270133a76cb649e70190945028b87b916b9e946d63e2794550fef31ad3fec86d'
     OR v_compile_hash IS DISTINCT FROM '1cee9543d131260f71573afc2f0a5a204422a59fa7f46ef0b24f4c2e277e3808' THEN
    RAISE EXCEPTION 'CATALOG_VALIDATION_RESTORE_CANDIDATE_SOURCE_MISMATCH'
      USING DETAIL=pg_catalog.format('validator=%s compiler=%s',v_validate_hash,v_compile_hash);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    WHERE p.oid IN (v_validate,v_compile)
      AND (
        p.proowner IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres')
        OR p.prosecdef IS DISTINCT FROM true
        OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
        OR p.proacl::text IS DISTINCT FROM '{postgres=X/postgres}'
        OR p.provolatile IS DISTINCT FROM 'v'
        OR p.proisstrict IS DISTINCT FROM false
        OR p.proparallel IS DISTINCT FROM 'u'
        OR p.proleakproof IS DISTINCT FROM false
        OR p.procost IS DISTINCT FROM 100
        OR p.prorows IS DISTINCT FROM 0
        OR p.proretset IS DISTINCT FROM false
        OR p.prokind IS DISTINCT FROM 'f'
        OR pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
        OR pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
        OR pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'CATALOG_VALIDATION_RESTORE_SECURITY_BASELINE_INVALID';
  END IF;

  INSERT INTO pg_temp.flame_chick_catalog_restore_guard
  SELECT p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,
         p.provolatile,p.proisstrict,p.proparallel,p.proleakproof,
         p.procost,p.prorows,p.proretset,p.prokind
  FROM pg_catalog.pg_proc p
  WHERE p.oid IN (v_validate,v_compile)
    AND p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres')
    AND p.prosecdef;

  IF (SELECT count(*) FROM pg_temp.flame_chick_catalog_restore_guard) <> 2 THEN
    RAISE EXCEPTION 'CATALOG_VALIDATION_RESTORE_GUARD_CAPTURE_FAILED';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_publication_validate(p_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_errors jsonb;
BEGIN
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'CATALOG_PUBLICATION_RESTAURANT_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(x.issue ORDER BY x.code,x.entity_id),'[]'::jsonb)
    INTO v_errors
  FROM (
    SELECT y.* FROM (
      SELECT 'NO_ACTIVE_MENU_CATEGORY'::text code,NULL::text entity_id,
        pg_catalog.jsonb_build_object('code','NO_ACTIVE_MENU_CATEGORY','message','Create and activate at least one menu category.','entity_type','catalog') issue
      WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.restaurant_id=p_restaurant_id AND c.category_kind='menu' AND c.is_active)

      UNION ALL
      SELECT 'NO_ACTIVE_PRODUCT',NULL,
        pg_catalog.jsonb_build_object('code','NO_ACTIVE_PRODUCT','message','Add and activate at least one menu product.','entity_type','catalog')
      WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.restaurant_id=p_restaurant_id AND p.is_active)

      UNION ALL
      SELECT 'ACTIVE_PRODUCT_CATEGORY_INACTIVE',p.id::text,
        pg_catalog.jsonb_build_object('code','ACTIVE_PRODUCT_CATEGORY_INACTIVE','message','An active product belongs to an inactive category.','entity_type','product','entity_id',p.id)
      FROM public.products p JOIN public.categories c ON c.id=p.category_id AND c.restaurant_id=p.restaurant_id
      WHERE p.restaurant_id=p_restaurant_id AND p.is_active AND NOT c.is_active

      UNION ALL
      SELECT 'ACTIVE_PRODUCT_SUBCATEGORY_INACTIVE',p.id::text,
        pg_catalog.jsonb_build_object('code','ACTIVE_PRODUCT_SUBCATEGORY_INACTIVE','message','An active product references an inactive subcategory.','entity_type','product','entity_id',p.id)
      FROM public.products p JOIN public.subcategories sc ON sc.id=p.subcategory_id AND sc.restaurant_id=p.restaurant_id
      WHERE p.restaurant_id=p_restaurant_id AND p.is_active AND p.subcategory_id IS NOT NULL AND NOT sc.is_active

      UNION ALL
      SELECT 'ACTIVE_PRODUCT_WITHOUT_ACTIVE_VARIANT',p.id::text,
        pg_catalog.jsonb_build_object('code','ACTIVE_PRODUCT_WITHOUT_ACTIVE_VARIANT','message','An active product must have at least one active variant.','entity_type','product','entity_id',p.id)
      FROM public.products p
      WHERE p.restaurant_id=p_restaurant_id AND p.is_active
        AND NOT EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.restaurant_id=p.restaurant_id AND pv.product_id=p.id AND pv.is_active)

      UNION ALL
      SELECT 'ACTIVE_VARIANT_PRICE_MISSING',pv.id::text,
        pg_catalog.jsonb_build_object('code','ACTIVE_VARIANT_PRICE_MISSING','message','An active variant has no price. Enter a price or deactivate it.','entity_type','product_variant','entity_id',pv.id,'product_id',pv.product_id,'size_key',pv.size_key)
      FROM public.product_variants pv
      JOIN public.products p ON p.id=pv.product_id AND p.restaurant_id=pv.restaurant_id
      WHERE pv.restaurant_id=p_restaurant_id AND p.is_active AND pv.is_active AND pv.price IS NULL

      UNION ALL
      SELECT 'ACTIVE_MODIFIER_ASSIGNMENT_TO_INACTIVE_GROUP',a.id::text,
        pg_catalog.jsonb_build_object('code','ACTIVE_MODIFIER_ASSIGNMENT_TO_INACTIVE_GROUP','message','An active assignment references an inactive modifier group.','entity_type','modifier_group_assignment','entity_id',a.id,'product_id',a.product_id,'modifier_group_id',a.modifier_group_id)
      FROM public.modifier_group_assignments a
      JOIN public.products p ON p.id=a.product_id AND p.restaurant_id=a.restaurant_id
      JOIN public.modifier_groups g ON g.id=a.modifier_group_id AND g.restaurant_id=a.restaurant_id
      WHERE a.restaurant_id=p_restaurant_id AND a.is_active AND p.is_active AND NOT g.is_active

      UNION ALL
      SELECT 'MODIFIER_GROUP_HAS_TOO_FEW_ACTIVE_OPTIONS',g.id::text,
        pg_catalog.jsonb_build_object('code','MODIFIER_GROUP_HAS_TOO_FEW_ACTIVE_OPTIONS','message','An assigned modifier group has fewer active options than its maximum selectable count.','entity_type','modifier_group','entity_id',g.id,'active_option_count',count(m.id),'max_select',g.max_select)
      FROM public.modifier_groups g
      JOIN public.modifier_group_assignments a ON a.modifier_group_id=g.id AND a.restaurant_id=g.restaurant_id AND a.is_active
      JOIN public.products p ON p.id=a.product_id AND p.restaurant_id=a.restaurant_id AND p.is_active
      LEFT JOIN public.modifiers m ON m.modifier_group_id=g.id AND m.restaurant_id=g.restaurant_id AND m.is_active
      WHERE g.restaurant_id=p_restaurant_id AND g.is_active
      GROUP BY g.id,g.max_select
      HAVING count(m.id)<g.max_select

      UNION ALL
      SELECT 'BY_SIZE_MODIFIER_PRICE_RULE_MISSING',m.id::text||':'||pv.id::text,
        pg_catalog.jsonb_build_object('code','BY_SIZE_MODIFIER_PRICE_RULE_MISSING','message','A BY_SIZE modifier is missing an exact product-variant price rule.','entity_type','modifier','entity_id',m.id,'product_id',p.id,'product_variant_id',pv.id)
      FROM public.modifiers m
      JOIN public.modifier_groups g ON g.id=m.modifier_group_id AND g.restaurant_id=m.restaurant_id
      JOIN public.modifier_group_assignments a ON a.modifier_group_id=g.id AND a.restaurant_id=g.restaurant_id AND a.is_active
      JOIN public.products p ON p.id=a.product_id AND p.restaurant_id=a.restaurant_id AND p.is_active
      JOIN public.product_variants pv ON pv.product_id=p.id AND pv.restaurant_id=p.restaurant_id AND pv.is_active
      LEFT JOIN public.modifier_price_rules r
        ON r.restaurant_id=m.restaurant_id AND r.modifier_id=m.id
       AND r.product_id=p.id AND r.product_variant_id=pv.id
      WHERE m.restaurant_id=p_restaurant_id AND m.is_active AND g.is_active
        AND m.price_mode='BY_SIZE' AND r.id IS NULL

      UNION ALL
      SELECT 'ACTIVE_DEAL_COLLECTION_CATEGORY_INACTIVE',dc.id::text,
        pg_catalog.jsonb_build_object('code','ACTIVE_DEAL_COLLECTION_CATEGORY_INACTIVE','message','An active deal collection belongs to an inactive deal category.','entity_type','deal_collection','entity_id',dc.id)
      FROM public.deal_collections dc
      JOIN public.categories c ON c.id=dc.category_id AND c.restaurant_id=dc.restaurant_id
      WHERE dc.restaurant_id=p_restaurant_id AND dc.is_active AND (NOT c.is_active OR c.category_kind<>'deal')

      UNION ALL
      SELECT 'ACTIVE_DEAL_WITHOUT_ACTIVE_COLLECTION',d.id::text,
        pg_catalog.jsonb_build_object('code','ACTIVE_DEAL_WITHOUT_ACTIVE_COLLECTION','message','An active deal belongs to an inactive collection.','entity_type','deal','entity_id',d.id)
      FROM public.deals d JOIN public.deal_collections dc ON dc.id=d.collection_id AND dc.restaurant_id=d.restaurant_id
      WHERE d.restaurant_id=p_restaurant_id AND d.is_active AND NOT dc.is_active

      UNION ALL
      SELECT 'ACTIVE_DEAL_WITHOUT_ACTIVE_VARIANT',d.id::text,
        pg_catalog.jsonb_build_object('code','ACTIVE_DEAL_WITHOUT_ACTIVE_VARIANT','message','An active deal must have at least one active purchasable variant.','entity_type','deal','entity_id',d.id)
      FROM public.deals d
      WHERE d.restaurant_id=p_restaurant_id AND d.is_active
        AND NOT EXISTS (SELECT 1 FROM public.deal_variants dv WHERE dv.restaurant_id=d.restaurant_id AND dv.deal_id=d.id AND dv.is_active)

      UNION ALL
      SELECT 'ACTIVE_DEAL_VARIANT_BASE_PRICE_MISSING',dv.id::text,
        pg_catalog.jsonb_build_object('code','ACTIVE_DEAL_VARIANT_BASE_PRICE_MISSING','message','An active deal variant has no base price.','entity_type','deal_variant','entity_id',dv.id,'deal_id',dv.deal_id)
      FROM public.deal_variants dv JOIN public.deals d ON d.id=dv.deal_id AND d.restaurant_id=dv.restaurant_id
      WHERE dv.restaurant_id=p_restaurant_id AND d.is_active AND dv.is_active AND dv.base_price IS NULL

      UNION ALL
      SELECT 'ACTIVE_DEAL_COMPONENT_GROUP_HAS_NO_OPTIONS',g.id::text,
        pg_catalog.jsonb_build_object('code','ACTIVE_DEAL_COMPONENT_GROUP_HAS_NO_OPTIONS','message','An active deal component group has no active product-variant options.','entity_type','deal_component_group','entity_id',g.id,'deal_id',g.deal_id)
      FROM public.deal_component_groups g JOIN public.deals d ON d.id=g.deal_id AND d.restaurant_id=g.restaurant_id AND d.is_active
      WHERE g.restaurant_id=p_restaurant_id AND g.is_active
        AND NOT EXISTS (SELECT 1 FROM public.deal_component_options o WHERE o.restaurant_id=g.restaurant_id AND o.deal_id=g.deal_id AND o.component_group_id=g.id AND o.is_active)

      UNION ALL
      SELECT 'DEAL_VARIANT_REQUIRED_GROUP_NOT_CONFIGURED',dv.id::text||':'||g.id::text,
        pg_catalog.jsonb_build_object('code','DEAL_VARIANT_REQUIRED_GROUP_NOT_CONFIGURED','message','A deal variant has insufficient allowed choices for a component group.','entity_type','deal_variant','entity_id',dv.id,'deal_id',d.id,'component_group_id',g.id,'required_units',g.min_units)
      FROM public.deal_variants dv
      JOIN public.deals d ON d.id=dv.deal_id AND d.restaurant_id=dv.restaurant_id AND d.is_active
      JOIN public.deal_component_groups g ON g.deal_id=d.id AND g.restaurant_id=d.restaurant_id AND g.is_active
      LEFT JOIN public.deal_component_options o ON o.deal_id=d.id AND o.restaurant_id=d.restaurant_id AND o.component_group_id=g.id AND o.is_active
      LEFT JOIN public.deal_variant_component_options m ON m.deal_id=d.id AND m.restaurant_id=d.restaurant_id AND m.deal_variant_id=dv.id AND m.component_option_id=o.id AND m.is_active
      WHERE dv.restaurant_id=p_restaurant_id AND dv.is_active
      GROUP BY dv.id,d.id,g.id,g.min_units,g.max_units,g.max_units_per_option,g.allow_repeat_option
      HAVING count(m.id)=0 OR COALESCE(sum(LEAST(g.max_units,COALESCE(m.max_quantity_per_deal,g.max_units_per_option,CASE WHEN g.allow_repeat_option THEN g.max_units ELSE 1 END))),0)<g.min_units

      UNION ALL
      SELECT 'DEAL_VARIANT_PRICING_TREATMENT_INVALID',m.id::text,
        pg_catalog.jsonb_build_object('code','DEAL_VARIANT_PRICING_TREATMENT_INVALID','message','A deal option uses an incompatible pricing treatment or an inactive/unpriced standalone variant.','entity_type','deal_variant_component_option','entity_id',m.id,'deal_variant_id',dv.id,'component_option_id',o.id)
      FROM public.deal_variant_component_options m
      JOIN public.deal_variants dv ON dv.id=m.deal_variant_id AND dv.deal_id=m.deal_id AND dv.restaurant_id=m.restaurant_id
      JOIN public.deals d ON d.id=m.deal_id AND d.restaurant_id=m.restaurant_id
      JOIN public.deal_component_options o ON o.id=m.component_option_id AND o.deal_id=m.deal_id AND o.restaurant_id=m.restaurant_id
      JOIN public.products p ON p.id=o.product_id AND p.restaurant_id=o.restaurant_id
      JOIN public.categories c ON c.id=p.category_id AND c.restaurant_id=p.restaurant_id
      JOIN public.product_variants pv ON pv.id=o.product_variant_id AND pv.product_id=o.product_id AND pv.restaurant_id=o.restaurant_id
      WHERE m.restaurant_id=p_restaurant_id AND m.is_active AND dv.is_active AND d.is_active
        AND (NOT p.is_active OR NOT c.is_active OR NOT pv.is_active
          OR (dv.pricing_mode='FIXED_BUNDLE' AND m.pricing_treatment='STANDALONE')
          OR (m.pricing_treatment='STANDALONE' AND (pv.price IS NULL OR NOT pv.is_standalone_sellable)))

      UNION ALL
      SELECT 'ACTIVE_SCHEDULE_SET_INVALID',s.id::text,
        pg_catalog.jsonb_build_object('code','ACTIVE_SCHEDULE_SET_INVALID','message','An active schedule set has an invalid IANA timezone or no windows.','entity_type','schedule_set','entity_id',s.id)
      FROM public.catalog_schedule_sets s
      WHERE s.restaurant_id=p_restaurant_id AND s.is_active
        AND (NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names t WHERE t.name=s.timezone)
          OR NOT EXISTS (SELECT 1 FROM public.catalog_schedule_windows w WHERE w.restaurant_id=s.restaurant_id AND w.schedule_set_id=s.id))

      UNION ALL
      SELECT 'ACTIVE_DEAL_SCHEDULE_SET_INACTIVE',d.id::text,
        pg_catalog.jsonb_build_object('code','ACTIVE_DEAL_SCHEDULE_SET_INACTIVE','message','An active deal collection references an inactive schedule set.','entity_type','deal','entity_id',d.id,'schedule_set_id',s.id)
      FROM public.deals d
      JOIN public.deal_collections dc ON dc.id=d.collection_id AND dc.restaurant_id=d.restaurant_id
      JOIN public.catalog_schedule_sets s ON s.id=dc.schedule_set_id AND s.restaurant_id=dc.restaurant_id
      WHERE d.restaurant_id=p_restaurant_id AND d.is_active AND dc.is_active AND dc.schedule_set_id IS NOT NULL AND NOT s.is_active

      UNION ALL
      SELECT 'ACTIVE_DEAL_ASSIGNMENT_SCHEDULE_INACTIVE',a.id::text,
        pg_catalog.jsonb_build_object('code','ACTIVE_DEAL_ASSIGNMENT_SCHEDULE_INACTIVE','message','An active deal schedule assignment references an inactive schedule set.','entity_type','deal_schedule_assignment','entity_id',a.id,'deal_id',a.deal_id,'schedule_set_id',s.id)
      FROM public.deal_schedule_assignments a
      JOIN public.deals d ON d.id=a.deal_id AND d.restaurant_id=a.restaurant_id AND d.is_active
      JOIN public.catalog_schedule_sets s ON s.id=a.schedule_set_id AND s.restaurant_id=a.restaurant_id
      WHERE a.restaurant_id=p_restaurant_id AND a.is_active AND NOT s.is_active

      UNION ALL
      SELECT 'DEAL_ASSIGNMENT_TIMEZONE_MISMATCH',a.id::text,
        pg_catalog.jsonb_build_object('code','DEAL_ASSIGNMENT_TIMEZONE_MISMATCH','message','A deal schedule timezone no longer matches its branch or restaurant timezone.','entity_type','deal_schedule_assignment','entity_id',a.id,'deal_id',a.deal_id)
      FROM public.deal_schedule_assignments a
      JOIN public.catalog_schedule_sets s ON s.id=a.schedule_set_id AND s.restaurant_id=a.restaurant_id
      JOIN public.restaurants r ON r.id=a.restaurant_id
      LEFT JOIN public.branches b ON b.id=a.branch_id AND b.restaurant_id=a.restaurant_id
      WHERE a.restaurant_id=p_restaurant_id AND a.is_active
        AND s.timezone IS DISTINCT FROM CASE WHEN a.branch_id IS NULL THEN r.timezone ELSE COALESCE(b.timezone,r.timezone) END

      UNION ALL
      SELECT 'ACTIVE_BRANCH_OVERRIDE_FOR_INACTIVE_BRANCH',a.id::text,
        pg_catalog.jsonb_build_object('code','ACTIVE_BRANCH_OVERRIDE_FOR_INACTIVE_BRANCH','message','A product, variant or deal availability override references an inactive branch.','entity_type','branch_availability','entity_id',a.id,'branch_id',a.branch_id)
      FROM (
        SELECT id,restaurant_id,branch_id FROM public.branch_product_availability
        UNION ALL
        SELECT id,restaurant_id,branch_id FROM public.branch_variant_availability
        UNION ALL
        SELECT id,restaurant_id,branch_id FROM public.branch_deal_availability
      ) a
      JOIN public.branches b ON b.id=a.branch_id AND b.restaurant_id=a.restaurant_id
      WHERE a.restaurant_id=p_restaurant_id AND NOT b.is_active
    ) y
    ORDER BY y.code,y.entity_id
    LIMIT 100
  ) x;

  RETURN pg_catalog.jsonb_build_object(
    'ok',pg_catalog.jsonb_array_length(v_errors)=0,
    'error_count',pg_catalog.jsonb_array_length(v_errors),
    'errors',v_errors
  );
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_publication_validate(uuid) OWNER TO postgres;
ALTER FUNCTION app_private.flame_chick_catalog_publication_validate(uuid)
  VOLATILE NOT LEAKPROOF PARALLEL UNSAFE COST 100;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_publication_validate(uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.flame_chick_catalog_compile_snapshot(p_restaurant_id uuid,p_published_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_restaurant public.restaurants%ROWTYPE; v_snapshot jsonb;
BEGIN
  SELECT r.* INTO v_restaurant FROM public.restaurants r WHERE r.id=p_restaurant_id AND r.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOG_PUBLISH_RESTAURANT_NOT_ACTIVE' USING ERRCODE='55000'; END IF;

  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion',3,'publishedAt',p_published_at,
    'restaurantId',v_restaurant.id,'restaurantSlug',v_restaurant.slug,
    'settings',pg_catalog.jsonb_build_object(
      'restaurant_name',v_restaurant.name,'currency_code',v_restaurant.currency_code,'timezone',v_restaurant.timezone
    ),
    'branches',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'branchId',b.id,'branchCode',b.branch_code,'name',b.name,'address',b.address,'phone',b.phone,
        'timezone',COALESCE(b.timezone,v_restaurant.timezone),
        'websiteOrderingEnabled',b.website_ordering_enabled,
        'websiteDeliveryEnabled',b.website_delivery_enabled,'websitePickupEnabled',b.website_pickup_enabled
      ) ORDER BY b.branch_code,b.id)
      FROM public.branches b WHERE b.restaurant_id=p_restaurant_id AND b.is_active
    ),'[]'::jsonb),
    'categories',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'categoryId',c.id,'legacyId',c.legacy_id,'categoryKind',c.category_kind,
        'nameEn',c.name_en,'nameUr',c.name_ur,'sortOrder',c.sort_order,
        'categoryFolderKey',c.category_folder_key,'imageCurrentPath',c.image_current_path,
        'imagePreviousPath',c.image_previous_path
      ) ORDER BY c.sort_order,c.name_en,c.id)
      FROM public.categories c WHERE c.restaurant_id=p_restaurant_id AND c.is_active
    ),'[]'::jsonb),
    'subcategories',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'subcategoryId',sc.id,'categoryId',sc.category_id,'legacyId',sc.legacy_id,
        'nameEn',sc.name_en,'nameUr',sc.name_ur,'sortOrder',sc.sort_order
      ) ORDER BY sc.sort_order,sc.name_en,sc.id)
      FROM public.subcategories sc JOIN public.categories c
        ON c.id=sc.category_id AND c.restaurant_id=sc.restaurant_id AND c.is_active
      WHERE sc.restaurant_id=p_restaurant_id AND sc.is_active
    ),'[]'::jsonb),
    'products',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'productId',p.id,'categoryId',p.category_id,'subcategoryId',p.subcategory_id,
        'legacyId',p.legacy_id,'nameEn',p.name_en,'nameUr',p.name_ur,
        'descriptionEn',p.description_en,'descriptionUr',p.description_ur,
        'imageFolderKey',p.image_folder_key,'imageGroupId',p.image_group_id,
        'imagePublished',p.image_published,'imageExtension',p.image_extension,
        'imageCurrentPath',p.image_current_path,'imagePreviousPath',p.image_previous_path,
        'imagePreviousExtension',p.image_previous_extension,'featured',p.featured,
        'sortOrder',p.sort_order,'available',p.is_available
      ) ORDER BY p.sort_order,p.name_en,p.id)
      FROM public.products p JOIN public.categories c
        ON c.id=p.category_id AND c.restaurant_id=p.restaurant_id AND c.is_active
      WHERE p.restaurant_id=p_restaurant_id AND p.is_active
    ),'[]'::jsonb),
    'productVariants',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'variantId',pv.id,'productId',pv.product_id,'legacyId',pv.legacy_id,
        'sizeKey',pv.size_key,'sizeLabel',pv.size_label,'variantKind',pv.variant_kind,
        'price',pv.price,'packQuantity',pv.pack_quantity,'packUnit',pv.pack_unit,
        'standaloneSellable',pv.is_standalone_sellable,'sortOrder',pv.sort_order,'available',pv.is_available
      ) ORDER BY p.sort_order,p.id,pv.sort_order,pv.size_key,pv.id)
      FROM public.product_variants pv
      JOIN public.products p ON p.id=pv.product_id AND p.restaurant_id=pv.restaurant_id AND p.is_active
      JOIN public.categories c ON c.id=p.category_id AND c.restaurant_id=p.restaurant_id AND c.is_active
      WHERE pv.restaurant_id=p_restaurant_id AND pv.is_active
    ),'[]'::jsonb),
    'modifierGroups',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'modifierGroupId',g.id,'legacyId',g.legacy_id,'nameEn',g.name_en,'nameUr',g.name_ur,
        'standaloneOnly',g.standalone_only,'selectionMode',g.selection_mode,
        'minSelect',g.min_select,'maxSelect',g.max_select,'sortOrder',g.sort_order
      ) ORDER BY g.sort_order,g.name_en,g.id)
      FROM public.modifier_groups g WHERE g.restaurant_id=p_restaurant_id AND g.is_active
    ),'[]'::jsonb),
    'modifiers',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'modifierId',m.id,'modifierGroupId',m.modifier_group_id,'legacyId',m.legacy_id,
        'nameEn',m.name_en,'nameUr',m.name_ur,'priceMode',m.price_mode,
        'fixedPrice',m.fixed_price,'sortOrder',m.sort_order
      ) ORDER BY g.sort_order,g.id,m.sort_order,m.name_en,m.id)
      FROM public.modifiers m JOIN public.modifier_groups g
        ON g.id=m.modifier_group_id AND g.restaurant_id=m.restaurant_id AND g.is_active
      WHERE m.restaurant_id=p_restaurant_id AND m.is_active
    ),'[]'::jsonb),
    'modifierGroupAssignments',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'assignmentId',a.id,'modifierGroupId',a.modifier_group_id,'productId',a.product_id,'sortOrder',a.sort_order
      ) ORDER BY p.sort_order,p.id,a.sort_order,a.id)
      FROM public.modifier_group_assignments a
      JOIN public.products p ON p.id=a.product_id AND p.restaurant_id=a.restaurant_id AND p.is_active
      JOIN public.categories c ON c.id=p.category_id AND c.restaurant_id=p.restaurant_id AND c.is_active
      JOIN public.modifier_groups g ON g.id=a.modifier_group_id AND g.restaurant_id=a.restaurant_id AND g.is_active
      WHERE a.restaurant_id=p_restaurant_id AND a.is_active
    ),'[]'::jsonb),
    'modifierPriceRules',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'modifierPriceRuleId',r.id,'modifierId',r.modifier_id,'modifierGroupId',r.modifier_group_id,
        'productId',r.product_id,'productVariantId',r.product_variant_id,'price',r.price
      ) ORDER BY r.product_id,r.product_variant_id,r.modifier_id)
      FROM public.modifier_price_rules r
      JOIN public.modifiers m ON m.id=r.modifier_id AND m.restaurant_id=r.restaurant_id AND m.is_active
      JOIN public.modifier_groups g ON g.id=r.modifier_group_id AND g.restaurant_id=r.restaurant_id AND g.is_active
      JOIN public.products p ON p.id=r.product_id AND p.restaurant_id=r.restaurant_id AND p.is_active
      JOIN public.product_variants pv ON pv.id=r.product_variant_id AND pv.restaurant_id=r.restaurant_id AND pv.product_id=r.product_id AND pv.is_active
      WHERE r.restaurant_id=p_restaurant_id
    ),'[]'::jsonb),
    'drinkOptions',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'drinkOptionId',d.id,'productVariantId',d.product_variant_id,'legacyId',d.legacy_id,
        'displayName',d.display_name,'displayNameUr',d.display_name_ur,
        'volumeKey',d.volume_key,'volumeMl',d.volume_ml,'sortOrder',d.sort_order
      ) ORDER BY d.sort_order,d.volume_key,d.id)
      FROM public.drink_options d LEFT JOIN public.product_variants pv
        ON pv.id=d.product_variant_id AND pv.restaurant_id=d.restaurant_id
      WHERE d.restaurant_id=p_restaurant_id AND d.is_active
        AND (d.product_variant_id IS NULL OR pv.is_active)
    ),'[]'::jsonb),
    'dealCollections',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'dealCollectionId',dc.id,'categoryId',dc.category_id,'scheduleSetId',dc.schedule_set_id,
        'nameEn',dc.name_en,'nameUr',dc.name_ur,'sortOrder',dc.sort_order
      ) ORDER BY dc.sort_order,dc.name_en,dc.id)
      FROM public.deal_collections dc JOIN public.categories c
        ON c.id=dc.category_id AND c.restaurant_id=dc.restaurant_id AND c.category_kind='deal' AND c.is_active
      WHERE dc.restaurant_id=p_restaurant_id AND dc.is_active
    ),'[]'::jsonb),
    'deals',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'dealId',d.id,'dealCollectionId',d.collection_id,'legacyId',d.legacy_id,
        'title',d.title,'titleUr',d.title_ur,'descriptionEn',d.description_en,'descriptionUr',d.description_ur,
        'legacyBundlePrice',d.bundle_price,'imageCurrentPath',d.image_current_path,
        'imagePreviousPath',d.image_previous_path,'featured',d.featured,'sortOrder',d.sort_order,'available',d.is_available
      ) ORDER BY d.sort_order,d.title,d.id)
      FROM public.deals d JOIN public.deal_collections dc
        ON dc.id=d.collection_id AND dc.restaurant_id=d.restaurant_id AND dc.is_active
      JOIN public.categories c
        ON c.id=dc.category_id AND c.restaurant_id=dc.restaurant_id AND c.category_kind='deal' AND c.is_active
      WHERE d.restaurant_id=p_restaurant_id AND d.is_active
    ),'[]'::jsonb),
    'dealVariants',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'dealVariantId',dv.id,'dealId',dv.deal_id,'variantKey',dv.variant_key,
        'labelEn',dv.label_en,'labelUr',dv.label_ur,'pricingMode',dv.pricing_mode,
        'basePrice',dv.base_price,'sortOrder',dv.sort_order
      ) ORDER BY d.sort_order,d.title,d.id,dv.sort_order,dv.variant_key,dv.id)
      FROM public.deal_variants dv JOIN public.deals d
        ON d.id=dv.deal_id AND d.restaurant_id=dv.restaurant_id AND d.is_active
      WHERE dv.restaurant_id=p_restaurant_id AND dv.is_active
    ),'[]'::jsonb),
    'dealComponentGroups',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'componentGroupId',g.id,'dealId',g.deal_id,'nameEn',g.name_en,'nameUr',g.name_ur,
        'minUnits',g.min_units,'maxUnits',g.max_units,'allowRepeatOption',g.allow_repeat_option,
        'maxUnitsPerOption',g.max_units_per_option,'sortOrder',g.sort_order
      ) ORDER BY d.sort_order,d.id,g.sort_order,g.id)
      FROM public.deal_component_groups g JOIN public.deals d
        ON d.id=g.deal_id AND d.restaurant_id=g.restaurant_id AND d.is_active
      WHERE g.restaurant_id=p_restaurant_id AND g.is_active
    ),'[]'::jsonb),
    'dealComponentOptions',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'componentOptionId',o.id,'dealId',o.deal_id,'componentGroupId',o.component_group_id,
        'productId',o.product_id,'productVariantId',o.product_variant_id,'sortOrder',o.sort_order
      ) ORDER BY d.sort_order,d.id,g.sort_order,g.id,o.sort_order,o.id)
      FROM public.deal_component_options o
      JOIN public.deals d ON d.id=o.deal_id AND d.restaurant_id=o.restaurant_id AND d.is_active
      JOIN public.deal_component_groups g ON g.id=o.component_group_id AND g.deal_id=o.deal_id AND g.restaurant_id=o.restaurant_id AND g.is_active
      JOIN public.products p ON p.id=o.product_id AND p.restaurant_id=o.restaurant_id AND p.is_active
      JOIN public.categories c ON c.id=p.category_id AND c.restaurant_id=p.restaurant_id AND c.is_active
      JOIN public.product_variants pv ON pv.id=o.product_variant_id AND pv.product_id=o.product_id AND pv.restaurant_id=o.restaurant_id AND pv.is_active
      WHERE o.restaurant_id=p_restaurant_id AND o.is_active
    ),'[]'::jsonb),
    'dealVariantComponentOptions',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'dealVariantComponentOptionId',m.id,'dealId',m.deal_id,'dealVariantId',m.deal_variant_id,
        'componentOptionId',m.component_option_id,'pricingTreatment',m.pricing_treatment,
        'unitSurcharge',m.unit_surcharge,'maxQuantityPerDeal',m.max_quantity_per_deal,'sortOrder',m.sort_order
      ) ORDER BY d.id,dv.sort_order,dv.id,g.sort_order,g.id,m.sort_order,m.id)
      FROM public.deal_variant_component_options m
      JOIN public.deals d ON d.id=m.deal_id AND d.restaurant_id=m.restaurant_id AND d.is_active
      JOIN public.deal_variants dv ON dv.id=m.deal_variant_id AND dv.deal_id=m.deal_id AND dv.restaurant_id=m.restaurant_id AND dv.is_active
      JOIN public.deal_component_options o ON o.id=m.component_option_id AND o.deal_id=m.deal_id AND o.restaurant_id=m.restaurant_id AND o.is_active
      JOIN public.deal_component_groups g ON g.id=o.component_group_id AND g.deal_id=o.deal_id AND g.restaurant_id=o.restaurant_id AND g.is_active
      WHERE m.restaurant_id=p_restaurant_id AND m.is_active
    ),'[]'::jsonb),
    'scheduleSets',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'scheduleSetId',s.id,'name',s.name,'timezone',s.timezone,
        'windows',COALESCE((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'windowId',w.id,'windowKind',w.window_kind,'weekdayIso',w.weekday_iso,
            'localStart',w.local_start,'localEnd',w.local_end,'isAllDay',w.is_all_day,
            'startsAt',w.starts_at,'endsAt',w.ends_at,'effectiveFrom',w.effective_from,'effectiveTo',w.effective_to
          ) ORDER BY w.window_kind,w.weekday_iso,w.local_start,w.starts_at,w.id)
          FROM public.catalog_schedule_windows w WHERE w.restaurant_id=s.restaurant_id AND w.schedule_set_id=s.id
        ),'[]'::jsonb)
      ) ORDER BY s.name,s.id)
      FROM public.catalog_schedule_sets s WHERE s.restaurant_id=p_restaurant_id AND s.is_active
    ),'[]'::jsonb),
    'dealScheduleAssignments',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'assignmentId',a.id,'dealId',a.deal_id,'branchId',a.branch_id,'scheduleSetId',a.schedule_set_id
      ) ORDER BY a.deal_id,a.branch_id NULLS FIRST,a.id)
      FROM public.deal_schedule_assignments a
      JOIN public.deals d ON d.id=a.deal_id AND d.restaurant_id=a.restaurant_id AND d.is_active
      JOIN public.catalog_schedule_sets s ON s.id=a.schedule_set_id AND s.restaurant_id=a.restaurant_id AND s.is_active
      WHERE a.restaurant_id=p_restaurant_id AND a.is_active
    ),'[]'::jsonb),
    'branchProductAvailability',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'branchId',a.branch_id,'productId',a.product_id,'isAvailable',a.is_available
      ) ORDER BY a.branch_id,a.product_id)
      FROM public.branch_product_availability a JOIN public.branches b
        ON b.id=a.branch_id AND b.restaurant_id=a.restaurant_id AND b.is_active
      WHERE a.restaurant_id=p_restaurant_id
    ),'[]'::jsonb),
    'branchVariantAvailability',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'branchId',a.branch_id,'productId',a.product_id,'productVariantId',a.product_variant_id,'isAvailable',a.is_available
      ) ORDER BY a.branch_id,a.product_id,a.product_variant_id)
      FROM public.branch_variant_availability a JOIN public.branches b
        ON b.id=a.branch_id AND b.restaurant_id=a.restaurant_id AND b.is_active
      WHERE a.restaurant_id=p_restaurant_id
    ),'[]'::jsonb),
    'branchDealAvailability',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'branchId',a.branch_id,'dealId',a.deal_id,'isAvailable',a.is_available
      ) ORDER BY a.branch_id,a.deal_id)
      FROM public.branch_deal_availability a JOIN public.branches b
        ON b.id=a.branch_id AND b.restaurant_id=a.restaurant_id AND b.is_active
      WHERE a.restaurant_id=p_restaurant_id
    ),'[]'::jsonb),
    'deliveryAreas','[]'::jsonb,
    'promotions','[]'::jsonb
  ) INTO v_snapshot;

  IF pg_catalog.octet_length(pg_catalog.convert_to(v_snapshot::text,'UTF8'))>4194304 THEN
    RAISE EXCEPTION 'CATALOG_PUBLISH_SNAPSHOT_TOO_LARGE' USING ERRCODE='54000';
  END IF;
  RETURN v_snapshot;
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_compile_snapshot(uuid,timestamptz) OWNER TO postgres;
ALTER FUNCTION app_private.flame_chick_catalog_compile_snapshot(uuid,timestamptz)
  VOLATILE NOT LEAKPROOF PARALLEL UNSAFE COST 100;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_compile_snapshot(uuid,timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;

DO $postflight$
DECLARE
  v_validate oid := pg_catalog.to_regprocedure('app_private.flame_chick_catalog_publication_validate(uuid)');
  v_compile oid := pg_catalog.to_regprocedure('app_private.flame_chick_catalog_compile_snapshot(uuid,timestamptz)');
  v_validate_hash text;
  v_compile_hash text;
BEGIN
  IF v_validate IS NULL OR v_compile IS NULL THEN
    RAISE EXCEPTION 'CATALOG_VALIDATION_RESTORE_HELPERS_MISSING_AFTER_REPLACE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_temp.flame_chick_catalog_restore_guard g ON g.function_oid=p.oid
    WHERE p.proowner IS DISTINCT FROM g.function_owner
       OR p.proacl IS DISTINCT FROM g.function_acl
       OR p.prosecdef IS DISTINCT FROM g.function_security_definer
       OR p.proconfig IS DISTINCT FROM g.function_config
       OR p.provolatile IS DISTINCT FROM g.function_volatility
       OR p.proisstrict IS DISTINCT FROM g.function_is_strict
       OR p.proparallel IS DISTINCT FROM g.function_parallel
       OR p.proleakproof IS DISTINCT FROM g.function_is_leakproof
       OR p.procost IS DISTINCT FROM g.function_cost
       OR p.prorows IS DISTINCT FROM g.function_rows
       OR p.proretset IS DISTINCT FROM g.function_returns_set
       OR p.prokind IS DISTINCT FROM g.function_kind
  ) THEN
    RAISE EXCEPTION 'CATALOG_VALIDATION_RESTORE_SECURITY_METADATA_CHANGED';
  END IF;

  SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')
    INTO v_validate_hash FROM pg_catalog.pg_proc p WHERE p.oid=v_validate;
  SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')
    INTO v_compile_hash FROM pg_catalog.pg_proc p WHERE p.oid=v_compile;

  -- Original source hashes verified against the pre-candidate Production baseline.
  IF v_validate_hash IS DISTINCT FROM '018c71056df82ef92fb0aa92f87713e9a91cba156156c7e2f300c12584b04712'
     OR v_compile_hash IS DISTINCT FROM 'b79cd02dde2bca71dce7815516017bfc53b3f9e2e2c0deac1bd5c9a7ef2404e2' THEN
    RAISE EXCEPTION 'CATALOG_VALIDATION_RESTORE_SOURCE_VERIFICATION_FAILED'
      USING DETAIL=pg_catalog.format('validator=%s compiler=%s',v_validate_hash,v_compile_hash);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid IN (v_validate,v_compile)
      AND (
        pg_catalog.pg_get_userbyid(p.proowner)<>'postgres'
        OR p.proacl::text IS DISTINCT FROM '{postgres=X/postgres}'
        OR NOT p.prosecdef
        OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
        OR p.provolatile IS DISTINCT FROM 'v'
        OR p.proisstrict IS DISTINCT FROM false
        OR p.proparallel IS DISTINCT FROM 'u'
        OR p.proleakproof IS DISTINCT FROM false
        OR p.procost IS DISTINCT FROM 100
        OR p.prorows IS DISTINCT FROM 0
        OR p.proretset IS DISTINCT FROM false
        OR p.prokind IS DISTINCT FROM 'f'
        OR pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
        OR pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
        OR pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'CATALOG_VALIDATION_RESTORE_FINAL_SECURITY_CHECK_FAILED';
  END IF;
END;
$postflight$;

COMMIT;
