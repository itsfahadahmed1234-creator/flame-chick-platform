-- Flame Chick catalog publication compiler, atomic publish and rollback V1.
-- Draft rows remain mutable. Publications are immutable; one pointer selects the
-- only customer-visible snapshot. Website release/cutover is a separate gate.

BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'CATALOG_PUBLISH_ROLLBACK_REQUIRES_POSTGRES';
  END IF;
  IF pg_catalog.to_regclass('public.catalog_draft_state') IS NULL
     OR pg_catalog.to_regclass('public.catalog_audit_log') IS NULL
     OR pg_catalog.to_regclass('app_private.catalog_command_idempotency') IS NULL
     OR pg_catalog.to_regclass('public.catalog_publications') IS NULL
     OR pg_catalog.to_regclass('public.catalog_current_publication') IS NULL THEN
    RAISE EXCEPTION 'CATALOG_PUBLICATION_FOUNDATION_MISSING';
  END IF;
  IF pg_catalog.to_regprocedure('public.flame_chick_catalog_publish(bigint,uuid)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.flame_chick_catalog_rollback(uuid,bigint,uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'CATALOG_PUBLISH_ROLLBACK_FUNCTION_ALREADY_EXISTS';
  END IF;
  IF pg_catalog.to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'PGCRYPTO_DIGEST_FUNCTION_MISSING';
  END IF;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- Draft graph validation. It reports at most 100 errors, with entity context.
-- No implicit repair, default pricing or conversion of NULL prices to zero.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app_private.flame_chick_catalog_publication_validate(p_restaurant_id uuid)
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
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_publication_validate(uuid)
  FROM PUBLIC,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Deterministic normalized V3 snapshot compiler.
-- The current schema has no restaurant_settings or delivery_areas tables, so
-- settings include only stored restaurant fields and deliveryAreas is [].
-- ---------------------------------------------------------------------------

CREATE FUNCTION app_private.flame_chick_catalog_compile_snapshot(p_restaurant_id uuid,p_published_at timestamptz)
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
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_compile_snapshot(uuid,timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Atomic publish: lock exact draft revision, validate, compile, store immutable
-- snapshot, and switch current pointer in one transaction. Does not edit drafts.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app_private.flame_chick_catalog_publish_internal(p_expected_revision bigint,p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid; v_restaurant uuid; v_role text; v_revision bigint;
  v_existing app_private.catalog_command_idempotency%ROWTYPE;
  v_payload_hash bytea; v_current_id uuid; v_new_id uuid;
  v_publication_number bigint; v_published_at timestamptz:=pg_catalog.transaction_timestamp();
  v_snapshot jsonb; v_snapshot_hash text; v_validation jsonb; v_response jsonb;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision<0 OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'CATALOG_PUBLISH_REVISION_AND_REQUEST_REQUIRED' USING ERRCODE='22023';
  END IF;
  SELECT a.actor_user_id,a.restaurant_id,a.role_key INTO v_actor,v_restaurant,v_role
  FROM app_private.flame_chick_catalog_actor() a;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'CATALOG_ADMIN_FORBIDDEN' USING ERRCODE='42501'; END IF;

  INSERT INTO public.catalog_draft_state(restaurant_id) VALUES(v_restaurant)
  ON CONFLICT(restaurant_id) DO NOTHING;
  SELECT s.revision INTO v_revision FROM public.catalog_draft_state s
  WHERE s.restaurant_id=v_restaurant FOR UPDATE;

  v_payload_hash:=pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('action','catalog.publish','expected_revision',p_expected_revision)::text,'UTF8'
  ));
  SELECT i.* INTO v_existing FROM app_private.catalog_command_idempotency i
  WHERE i.restaurant_id=v_restaurant AND i.request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.command_key<>'catalog.publish' OR v_existing.payload_hash<>v_payload_hash THEN
      RAISE EXCEPTION 'CATALOG_IDEMPOTENCY_KEY_REUSED' USING ERRCODE='22023';
    END IF;
    RETURN pg_catalog.jsonb_set(v_existing.response_json,'{idempotent}','true'::jsonb,true);
  END IF;

  IF v_revision<>p_expected_revision THEN
    RAISE EXCEPTION 'CATALOG_REVISION_CONFLICT' USING ERRCODE='40001',
      DETAIL=pg_catalog.format('current_revision=%s',v_revision);
  END IF;

  v_validation:=app_private.flame_chick_catalog_publication_validate(v_restaurant);
  IF v_validation->>'ok'<>'true' THEN
    RAISE EXCEPTION 'CATALOG_PUBLISH_VALIDATION_FAILED' USING ERRCODE='23514',
      DETAIL=v_validation::text;
  END IF;

  v_snapshot:=app_private.flame_chick_catalog_compile_snapshot(v_restaurant,v_published_at);
  v_snapshot_hash:=pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(v_snapshot::text,'UTF8'),'sha256'
  ),'hex');

  SELECT COALESCE(pg_catalog.max(p.publication_number),0)+1 INTO v_publication_number
  FROM public.catalog_publications p WHERE p.restaurant_id=v_restaurant;

  INSERT INTO public.catalog_publications(
    restaurant_id,publication_number,draft_revision,schema_version,pricing_engine_version,
    snapshot,snapshot_sha256,published_by,published_at
  ) VALUES(
    v_restaurant,v_publication_number,v_revision,3,'flame-chick-pricing-v1',
    v_snapshot,v_snapshot_hash,v_actor,v_published_at
  ) RETURNING id INTO v_new_id;

  SELECT cp.publication_id INTO v_current_id FROM public.catalog_current_publication cp
  WHERE cp.restaurant_id=v_restaurant FOR UPDATE;

  INSERT INTO public.catalog_current_publication(restaurant_id,publication_id,updated_by,updated_at)
  VALUES(v_restaurant,v_new_id,v_actor,v_published_at)
  ON CONFLICT(restaurant_id) DO UPDATE
    SET publication_id=EXCLUDED.publication_id,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at;

  v_response:=pg_catalog.jsonb_build_object(
    'ok',true,'idempotent',false,'action','catalog.publish','request_id',p_request_id,
    'draft_revision',v_revision,'publication_id',v_new_id,'publication_number',v_publication_number,
    'previous_publication_id',v_current_id,'snapshot_sha256',v_snapshot_hash,
    'schema_version',3,'published_at',v_published_at
  );

  INSERT INTO public.catalog_audit_log(
    restaurant_id,actor_user_id,actor_role_key,action_key,entity_type,entity_id,
    request_id,revision_before,revision_after,before_state,after_state
  ) VALUES(
    v_restaurant,v_actor,v_role,'catalog.publish','catalog_publication',v_new_id,
    p_request_id,v_revision,v_revision,
    CASE WHEN v_current_id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object('current_publication_id',v_current_id) END,
    pg_catalog.jsonb_build_object(
      'publication_id',v_new_id,'publication_number',v_publication_number,
      'previous_publication_id',v_current_id,'snapshot_sha256',v_snapshot_hash,
      'schema_version',3,'draft_revision',v_revision
    )
  );

  INSERT INTO app_private.catalog_command_idempotency(
    restaurant_id,request_id,command_key,payload_hash,response_json
  ) VALUES(v_restaurant,p_request_id,'catalog.publish',v_payload_hash,v_response);
  RETURN v_response;
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_publish_internal(bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_publish_internal(bigint,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_publish_internal(bigint,uuid) TO authenticated;

CREATE FUNCTION public.flame_chick_catalog_publish(p_expected_revision bigint,p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
  SELECT app_private.flame_chick_catalog_publish_internal(p_expected_revision,p_request_id)
$function$;
ALTER FUNCTION public.flame_chick_catalog_publish(bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_publish(bigint,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_publish(bigint,uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Atomic rollback: move only the current pointer to a prior immutable version.
-- A reason is required. Draft records and publication history are untouched.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app_private.flame_chick_catalog_rollback_internal(
  p_target_publication_id uuid,p_expected_revision bigint,p_request_id uuid,p_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid;v_restaurant uuid;v_role text;v_revision bigint;
  v_existing app_private.catalog_command_idempotency%ROWTYPE;
  v_payload_hash bytea;v_current_id uuid;v_target public.catalog_publications%ROWTYPE;
  v_calculated_hash text;v_response jsonb;
BEGIN
  IF p_target_publication_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0
     OR p_request_id IS NULL OR p_reason IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_reason))<10
     OR pg_catalog.char_length(pg_catalog.btrim(p_reason))>500 THEN
    RAISE EXCEPTION 'CATALOG_ROLLBACK_ARGUMENTS_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT a.actor_user_id,a.restaurant_id,a.role_key INTO v_actor,v_restaurant,v_role
  FROM app_private.flame_chick_catalog_actor() a;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'CATALOG_ADMIN_FORBIDDEN' USING ERRCODE='42501'; END IF;

  INSERT INTO public.catalog_draft_state(restaurant_id) VALUES(v_restaurant)
  ON CONFLICT(restaurant_id) DO NOTHING;
  SELECT s.revision INTO v_revision FROM public.catalog_draft_state s
  WHERE s.restaurant_id=v_restaurant FOR UPDATE;

  v_payload_hash:=pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'action','catalog.rollback','target_publication_id',p_target_publication_id,
      'expected_revision',p_expected_revision,'reason',pg_catalog.btrim(p_reason)
    )::text,'UTF8'
  ));
  SELECT i.* INTO v_existing FROM app_private.catalog_command_idempotency i
  WHERE i.restaurant_id=v_restaurant AND i.request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.command_key<>'catalog.rollback' OR v_existing.payload_hash<>v_payload_hash THEN
      RAISE EXCEPTION 'CATALOG_IDEMPOTENCY_KEY_REUSED' USING ERRCODE='22023';
    END IF;
    RETURN pg_catalog.jsonb_set(v_existing.response_json,'{idempotent}','true'::jsonb,true);
  END IF;

  IF v_revision<>p_expected_revision THEN
    RAISE EXCEPTION 'CATALOG_REVISION_CONFLICT' USING ERRCODE='40001',
      DETAIL=pg_catalog.format('current_revision=%s',v_revision);
  END IF;

  SELECT cp.publication_id INTO v_current_id FROM public.catalog_current_publication cp
  WHERE cp.restaurant_id=v_restaurant FOR UPDATE;
  IF v_current_id IS NULL THEN RAISE EXCEPTION 'CATALOG_ROLLBACK_NO_CURRENT_PUBLICATION' USING ERRCODE='55000'; END IF;
  IF v_current_id=p_target_publication_id THEN RAISE EXCEPTION 'CATALOG_ROLLBACK_TARGET_ALREADY_CURRENT' USING ERRCODE='22023'; END IF;

  SELECT p.* INTO v_target FROM public.catalog_publications p
  WHERE p.id=p_target_publication_id AND p.restaurant_id=v_restaurant;
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOG_ROLLBACK_TARGET_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  IF v_target.snapshot IS NULL
     OR pg_catalog.jsonb_typeof(v_target.snapshot)<>'object'
     OR v_target.snapshot->>'schemaVersion' IS DISTINCT FROM v_target.schema_version::text
     OR v_target.snapshot_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'CATALOG_ROLLBACK_TARGET_INVALID' USING ERRCODE='55000';
  END IF;

  v_calculated_hash:=pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(v_target.snapshot::text,'UTF8'),'sha256'
  ),'hex');
  IF v_calculated_hash IS DISTINCT FROM v_target.snapshot_sha256 THEN
    RAISE EXCEPTION 'CATALOG_ROLLBACK_TARGET_CHECKSUM_MISMATCH' USING ERRCODE='55000';
  END IF;

  UPDATE public.catalog_current_publication
  SET publication_id=v_target.id,updated_by=v_actor,updated_at=pg_catalog.transaction_timestamp()
  WHERE restaurant_id=v_restaurant;

  v_response:=pg_catalog.jsonb_build_object(
    'ok',true,'idempotent',false,'action','catalog.rollback','request_id',p_request_id,
    'draft_revision',v_revision,'previous_publication_id',v_current_id,
    'publication_id',v_target.id,'publication_number',v_target.publication_number,
    'snapshot_sha256',v_target.snapshot_sha256,'schema_version',v_target.schema_version,
    'rolled_back_by',v_actor,'reason',pg_catalog.btrim(p_reason),
    'rolled_back_at',pg_catalog.transaction_timestamp()
  );

  INSERT INTO public.catalog_audit_log(
    restaurant_id,actor_user_id,actor_role_key,action_key,entity_type,entity_id,
    request_id,revision_before,revision_after,before_state,after_state
  ) VALUES(
    v_restaurant,v_actor,v_role,'catalog.rollback','catalog_publication',v_target.id,
    p_request_id,v_revision,v_revision,
    pg_catalog.jsonb_build_object('current_publication_id',v_current_id),
    pg_catalog.jsonb_build_object(
      'publication_id',v_target.id,'publication_number',v_target.publication_number,
      'snapshot_sha256',v_target.snapshot_sha256,'schema_version',v_target.schema_version,
      'reason',pg_catalog.btrim(p_reason)
    )
  );

  INSERT INTO app_private.catalog_command_idempotency(
    restaurant_id,request_id,command_key,payload_hash,response_json
  ) VALUES(v_restaurant,p_request_id,'catalog.rollback',v_payload_hash,v_response);
  RETURN v_response;
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_rollback_internal(uuid,bigint,uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_rollback_internal(uuid,bigint,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_rollback_internal(uuid,bigint,uuid,text) TO authenticated;

CREATE FUNCTION public.flame_chick_catalog_rollback(
  p_target_publication_id uuid,p_expected_revision bigint,p_request_id uuid,p_reason text
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
  SELECT app_private.flame_chick_catalog_rollback_internal(
    p_target_publication_id,p_expected_revision,p_request_id,p_reason
  )
$function$;
ALTER FUNCTION public.flame_chick_catalog_rollback(uuid,bigint,uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_rollback(uuid,bigint,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_rollback(uuid,bigint,uuid,text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Bounded Admin/Owner publication history. Snapshots and direct table reads
-- remain private; UI receives publication metadata and rollback candidates.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app_private.flame_chick_catalog_publication_history_internal(
  p_after_number bigint DEFAULT NULL,p_limit integer DEFAULT 20
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid;v_restaurant uuid;v_current_id uuid;
  v_items jsonb;v_has_more boolean;v_next bigint;
BEGIN
  IF p_limit IS NULL OR p_limit<1 OR p_limit>50
     OR (p_after_number IS NOT NULL AND p_after_number<1) THEN
    RAISE EXCEPTION 'CATALOG_PUBLICATION_HISTORY_ARGUMENT_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT a.actor_user_id,a.restaurant_id INTO v_actor,v_restaurant
  FROM app_private.flame_chick_catalog_actor() a;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'CATALOG_ADMIN_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT cp.publication_id INTO v_current_id FROM public.catalog_current_publication cp
  WHERE cp.restaurant_id=v_restaurant;

  WITH page AS MATERIALIZED (
    SELECT p.* FROM public.catalog_publications p
    WHERE p.restaurant_id=v_restaurant AND (p_after_number IS NULL OR p.publication_number<p_after_number)
    ORDER BY p.publication_number DESC LIMIT p_limit+1
  ), picked AS MATERIALIZED (
    SELECT * FROM page ORDER BY publication_number DESC LIMIT p_limit
  )
  SELECT
    COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'publicationId',p.id,'publicationNumber',p.publication_number,
      'draftRevision',p.draft_revision,'schemaVersion',p.schema_version,
      'pricingEngineVersion',p.pricing_engine_version,'snapshotSha256',p.snapshot_sha256,
      'publishedBy',p.published_by,'publishedAt',p.published_at,'isCurrent',p.id=v_current_id
    ) ORDER BY p.publication_number DESC) FROM picked p),'[]'::jsonb),
    (SELECT count(*)>p_limit FROM page),
    (SELECT p.publication_number FROM picked p ORDER BY p.publication_number ASC LIMIT 1)
  INTO v_items,v_has_more,v_next;

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'items',v_items,'has_more',COALESCE(v_has_more,false),
    'next_cursor',CASE WHEN v_has_more THEN pg_catalog.to_jsonb(v_next) ELSE 'null'::jsonb END,
    'current_publication_id',v_current_id
  );
END
$function$;

ALTER FUNCTION app_private.flame_chick_catalog_publication_history_internal(bigint,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_catalog_publication_history_internal(bigint,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_catalog_publication_history_internal(bigint,integer) TO authenticated;

CREATE FUNCTION public.flame_chick_catalog_publication_history(
  p_after_number bigint DEFAULT NULL,p_limit integer DEFAULT 20
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
  SELECT app_private.flame_chick_catalog_publication_history_internal(p_after_number,p_limit)
$function$;
ALTER FUNCTION public.flame_chick_catalog_publication_history(bigint,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_catalog_publication_history(bigint,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_publication_history(bigint,integer) TO authenticated;

-- Verify wrapper and helper ownership, search_path, grants and table ACL.
DO $verify$
DECLARE v_sig regprocedure;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.flame_chick_catalog_publish(bigint,uuid)'::regprocedure,
    'public.flame_chick_catalog_rollback(uuid,bigint,uuid,text)'::regprocedure,
    'public.flame_chick_catalog_publication_history(bigint,integer)'::regprocedure
  ] LOOP
    IF (SELECT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid=v_sig) THEN
      RAISE EXCEPTION 'CATALOG_PUBLISH_PUBLIC_WRAPPER_MUST_BE_INVOKER';
    END IF;
    IF NOT pg_catalog.has_function_privilege('authenticated',v_sig,'EXECUTE')
       OR pg_catalog.has_function_privilege('anon',v_sig,'EXECUTE')
       OR pg_catalog.has_function_privilege('service_role',v_sig,'EXECUTE') THEN
      RAISE EXCEPTION 'CATALOG_PUBLISH_PUBLIC_WRAPPER_GRANTS_INVALID';
    END IF;
  END LOOP;

  FOREACH v_sig IN ARRAY ARRAY[
    'app_private.flame_chick_catalog_publication_validate(uuid)'::regprocedure,
    'app_private.flame_chick_catalog_compile_snapshot(uuid,timestamptz)'::regprocedure
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      WHERE p.oid=v_sig AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
        AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
    ) THEN RAISE EXCEPTION 'CATALOG_PUBLISH_COMPILER_SECURITY_INVALID'; END IF;
    IF pg_catalog.has_function_privilege('authenticated',v_sig,'EXECUTE')
       OR pg_catalog.has_function_privilege('anon',v_sig,'EXECUTE')
       OR pg_catalog.has_function_privilege('service_role',v_sig,'EXECUTE') THEN
      RAISE EXCEPTION 'CATALOG_PUBLISH_PRIVATE_HELPER_GRANTS_INVALID';
    END IF;
  END LOOP;

  FOREACH v_sig IN ARRAY ARRAY[
    'app_private.flame_chick_catalog_publish_internal(bigint,uuid)'::regprocedure,
    'app_private.flame_chick_catalog_rollback_internal(uuid,bigint,uuid,text)'::regprocedure,
    'app_private.flame_chick_catalog_publication_history_internal(bigint,integer)'::regprocedure
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=v_sig
        AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
        AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
    ) THEN RAISE EXCEPTION 'CATALOG_PUBLISH_INTERNAL_SECURITY_INVALID'; END IF;
    IF NOT pg_catalog.has_function_privilege('authenticated',v_sig,'EXECUTE')
       OR pg_catalog.has_function_privilege('anon',v_sig,'EXECUTE')
       OR pg_catalog.has_function_privilege('service_role',v_sig,'EXECUTE') THEN
      RAISE EXCEPTION 'CATALOG_PUBLISH_INTERNAL_GRANTS_INVALID';
    END IF;
  END LOOP;

  IF pg_catalog.has_table_privilege('authenticated','public.catalog_publications','SELECT')
     OR pg_catalog.has_table_privilege('authenticated','public.catalog_publications','INSERT')
     OR pg_catalog.has_table_privilege('authenticated','public.catalog_current_publication','UPDATE')
     OR pg_catalog.has_table_privilege('service_role','public.catalog_publications','SELECT')
     OR pg_catalog.has_table_privilege('service_role','public.catalog_current_publication','SELECT')
     OR pg_catalog.has_table_privilege('authenticated','app_private.catalog_command_idempotency','SELECT') THEN
    RAISE EXCEPTION 'CATALOG_PUBLISH_DIRECT_TABLE_GRANT_LEAK';
  END IF;
END;
$verify$;

COMMIT;
