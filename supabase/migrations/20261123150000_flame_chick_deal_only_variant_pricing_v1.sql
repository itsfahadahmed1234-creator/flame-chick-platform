-- Flame Chick deal-only variant pricing contract V1.
-- Active standalone variants require a product price. Active non-standalone
-- variants must be referenced by an active deal option using INCLUDED or
-- SURCHARGE. The deal variant base price remains the bundle's selling price.
-- No deal selector or surcharge option is enabled by this migration.
--
-- Append-only candidate migration. This file changes source only until reviewed
-- and explicitly applied to a separately approved database.

BEGIN;

DO $preflight$
DECLARE
  v_validate oid;
  v_compile oid;
  v_validate_hash text;
  v_compile_hash text;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'DEAL_ONLY_VARIANT_PRICING_REQUIRES_POSTGRES';
  END IF;

  v_validate := pg_catalog.to_regprocedure('app_private.flame_chick_catalog_publication_validate(uuid)');
  v_compile := pg_catalog.to_regprocedure('app_private.flame_chick_catalog_compile_snapshot(uuid,timestamptz)');
  IF v_validate IS NULL OR v_compile IS NULL THEN
    RAISE EXCEPTION 'CATALOG_PUBLICATION_FUNCTIONS_MISSING';
  END IF;

  SELECT pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p.prosrc,'UTF8'),'sha256'),'hex')
    INTO v_validate_hash
  FROM pg_catalog.pg_proc p WHERE p.oid=v_validate;
  SELECT pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p.prosrc,'UTF8'),'sha256'),'hex')
    INTO v_compile_hash
  FROM pg_catalog.pg_proc p WHERE p.oid=v_compile;

  IF v_validate_hash IS DISTINCT FROM 'f179cc3b15b1d6ad5b07b90587513001bed97b752b09b13ce2d9c946e88a7750'
     OR v_compile_hash IS DISTINCT FROM '1cee9543d131260f71573afc2f0a5a204422a59fa7f46ef0b24f4c2e277e3808' THEN
    RAISE EXCEPTION 'DEAL_ONLY_VARIANT_PRICING_SOURCE_BASELINE_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid IN (v_validate,v_compile)
      AND (
        p.proowner IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres')
        OR p.prosecdef IS DISTINCT FROM true
        OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
        OR p.proacl::text IS DISTINCT FROM '{postgres=X/postgres}'
        OR pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
        OR pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
        OR pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'CATALOG_PUBLICATION_VALIDATOR_SECURITY_BASELINE_INVALID';
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
        pg_catalog.jsonb_build_object('code','ACTIVE_VARIANT_PRICE_MISSING','message','An active standalone-sellable variant must have a price. Deal-only variants are checked against active deal mappings.','entity_type','product_variant','entity_id',pv.id,'product_id',pv.product_id,'size_key',pv.size_key)
      FROM public.product_variants pv
      JOIN public.products p ON p.id=pv.product_id AND p.restaurant_id=pv.restaurant_id
      WHERE pv.restaurant_id=p_restaurant_id AND p.is_active AND pv.is_active
        AND pv.price IS NULL AND pv.is_standalone_sellable

      UNION ALL
      SELECT 'DEAL_ONLY_VARIANT_NOT_MAPPED',pv.id::text,
        pg_catalog.jsonb_build_object('code','DEAL_ONLY_VARIANT_NOT_MAPPED','message','An active non-standalone variant must be referenced by an active deal using INCLUDED or SURCHARGE pricing.','entity_type','product_variant','entity_id',pv.id,'product_id',pv.product_id,'size_key',pv.size_key)
      FROM public.product_variants pv
      JOIN public.products p ON p.id=pv.product_id AND p.restaurant_id=pv.restaurant_id
      WHERE pv.restaurant_id=p_restaurant_id AND p.is_active AND pv.is_active
        AND NOT pv.is_standalone_sellable
        AND NOT EXISTS (
          SELECT 1
          FROM public.deal_component_options o
          JOIN public.deal_component_groups g
            ON g.id=o.component_group_id AND g.deal_id=o.deal_id AND g.restaurant_id=o.restaurant_id
          JOIN public.deals d
            ON d.id=o.deal_id AND d.restaurant_id=o.restaurant_id
          JOIN public.deal_variant_component_options m
            ON m.component_option_id=o.id AND m.deal_id=o.deal_id AND m.restaurant_id=o.restaurant_id
          JOIN public.deal_variants dv
            ON dv.id=m.deal_variant_id AND dv.deal_id=m.deal_id AND dv.restaurant_id=m.restaurant_id
          WHERE o.restaurant_id=pv.restaurant_id
            AND o.product_id=pv.product_id
            AND o.product_variant_id=pv.id
            AND o.is_active AND g.is_active AND d.is_active
            AND m.is_active AND dv.is_active
            AND m.pricing_treatment IN ('INCLUDED','SURCHARGE')
        )

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
      HAVING g.min_units > 0
        AND (
          count(m.id)=0
          OR COALESCE(sum(LEAST(g.max_units,COALESCE(m.max_quantity_per_deal,g.max_units_per_option,CASE WHEN g.allow_repeat_option THEN g.max_units ELSE 1 END))),0)<g.min_units
        )

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
        AND (
          NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names t WHERE t.name=s.timezone)
          OR NOT EXISTS (SELECT 1 FROM public.catalog_schedule_windows w WHERE w.restaurant_id=s.restaurant_id AND w.schedule_set_id=s.id)
        )
        AND (
          EXISTS (
            SELECT 1 FROM public.deal_collections dc
            WHERE dc.restaurant_id=s.restaurant_id
              AND dc.schedule_set_id=s.id
              AND dc.is_active
          )
          OR EXISTS (
            SELECT 1
            FROM public.deal_schedule_assignments a
            JOIN public.deals d ON d.id=a.deal_id AND d.restaurant_id=a.restaurant_id AND d.is_active
            WHERE a.restaurant_id=s.restaurant_id
              AND a.schedule_set_id=s.id
              AND a.is_active
              AND (a.branch_id IS NULL OR EXISTS (
                SELECT 1 FROM public.branches b
                WHERE b.id=a.branch_id AND b.restaurant_id=a.restaurant_id AND b.is_active
              ))
          )
        )

      UNION ALL
      SELECT 'ACTIVE_DEAL_SCHEDULE_SET_INACTIVE',dc.id::text,
        pg_catalog.jsonb_build_object('code','ACTIVE_DEAL_SCHEDULE_SET_INACTIVE','message','An active deal collection fallback references an inactive schedule set.','entity_type','deal_collection','entity_id',dc.id,'schedule_set_id',s.id)
      FROM public.deal_collections dc
      JOIN public.catalog_schedule_sets s ON s.id=dc.schedule_set_id AND s.restaurant_id=dc.restaurant_id
      WHERE dc.restaurant_id=p_restaurant_id AND dc.is_active AND dc.schedule_set_id IS NOT NULL AND NOT s.is_active

      UNION ALL
      SELECT 'ACTIVE_DEAL_ASSIGNMENT_SCHEDULE_INACTIVE',a.id::text,
        pg_catalog.jsonb_build_object('code','ACTIVE_DEAL_ASSIGNMENT_SCHEDULE_INACTIVE','message','An active deal schedule assignment references an inactive schedule set.','entity_type','deal_schedule_assignment','entity_id',a.id,'deal_id',a.deal_id,'schedule_set_id',s.id)
      FROM public.deal_schedule_assignments a
      JOIN public.deals d ON d.id=a.deal_id AND d.restaurant_id=a.restaurant_id AND d.is_active
      JOIN public.catalog_schedule_sets s ON s.id=a.schedule_set_id AND s.restaurant_id=a.restaurant_id
      WHERE a.restaurant_id=p_restaurant_id AND a.is_active AND NOT s.is_active

      UNION ALL
      SELECT 'ACTIVE_DEAL_ASSIGNMENT_BRANCH_INACTIVE',a.id::text,
        pg_catalog.jsonb_build_object('code','ACTIVE_DEAL_ASSIGNMENT_BRANCH_INACTIVE','message','An active deal schedule assignment references an inactive branch.','entity_type','deal_schedule_assignment','entity_id',a.id,'deal_id',a.deal_id,'branch_id',b.id)
      FROM public.deal_schedule_assignments a
      JOIN public.deals d ON d.id=a.deal_id AND d.restaurant_id=a.restaurant_id AND d.is_active
      JOIN public.branches b ON b.id=a.branch_id AND b.restaurant_id=a.restaurant_id
      WHERE a.restaurant_id=p_restaurant_id AND a.is_active AND a.branch_id IS NOT NULL AND NOT b.is_active

      UNION ALL
      SELECT 'DEAL_ASSIGNMENT_TIMEZONE_MISMATCH',a.id::text,
        pg_catalog.jsonb_build_object('code','DEAL_ASSIGNMENT_TIMEZONE_MISMATCH','message','A deal schedule timezone no longer matches its branch or restaurant timezone.','entity_type','deal_schedule_assignment','entity_id',a.id,'deal_id',a.deal_id)
      FROM public.deal_schedule_assignments a
      JOIN public.deals d ON d.id=a.deal_id AND d.restaurant_id=a.restaurant_id AND d.is_active
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

DO $verify$
DECLARE
  v_validate oid;
  v_definition text;
BEGIN
  v_validate := pg_catalog.to_regprocedure('app_private.flame_chick_catalog_publication_validate(uuid)');
  SELECT pg_catalog.pg_get_functiondef(v_validate) INTO v_definition;

  IF v_validate IS NULL
     OR position('DEAL_ONLY_VARIANT_NOT_MAPPED' IN v_definition)=0
     OR position('m.pricing_treatment IN (''INCLUDED'',''SURCHARGE'')' IN v_definition)=0
     OR position('pv.price IS NULL AND pv.is_standalone_sellable' IN v_definition)=0 THEN
    RAISE EXCEPTION 'DEAL_ONLY_VARIANT_PRICING_VALIDATOR_VERIFICATION_FAILED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid=v_validate
      AND p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres')
      AND p.prosecdef IS TRUE
      AND p.proconfig=ARRAY['search_path=""']::text[]
      AND p.proacl::text='{postgres=X/postgres}'
      AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'DEAL_ONLY_VARIANT_PRICING_VALIDATOR_SECURITY_CHANGED';
  END IF;
END;
$verify$;

COMMIT;
