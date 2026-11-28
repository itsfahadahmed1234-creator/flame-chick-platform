-- Flame Chick category/deal media metadata support.
-- This migration changes only the four existing app_private catalog functions
-- below, using exact-anchor and security-baseline guards before replacement.
-- It does not write catalog rows or Storage objects, or modify buckets,
-- Storage policies, function grants, publication pointers, or any Edge Function.
--
-- Preflight completed on 2026-11-28: all 14 replacement anchors matched exactly
-- once against the live definitions; each function remained SECURITY DEFINER
-- with an empty search_path; required category/deal image columns and the
-- existing flame-chick-media bucket were present.
--
-- Existing callers remain compatible: omitted image fields preserve current
-- values. JSON null or an empty string clears a field. Image paths are accepted
-- only for existing entities and must reference an object in the exact entity
-- folder and existing bucket. Upload UI, object cleanup and compensation are
-- deliberately separate work and are not implemented by this migration.

DO $fc_category_media_patch$
DECLARE
  v_definition text;
  v_original text;
  v_replacement text;
  v_occurrences integer;
  v_is_definer boolean;
  v_config text[];
BEGIN
  SELECT p.prosecdef, p.proconfig
    INTO v_is_definer, v_config
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'app_private.flame_chick_catalog_command_internal(text,jsonb,bigint,uuid)'::regprocedure;

  IF v_is_definer IS DISTINCT FROM true
     OR NOT ('search_path=""' = ANY(COALESCE(v_config, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'CATEGORY_MEDIA_FUNCTION_SECURITY_BASELINE_MISMATCH';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'app_private.flame_chick_catalog_command_internal(text,jsonb,bigint,uuid)'::regprocedure
  ) INTO v_definition;

  IF pg_catalog.strpos(v_definition, 'CATALOG_CATEGORY_IMAGE_OBJECT_INVALID') > 0 THEN
    RAISE EXCEPTION 'CATEGORY_MEDIA_PATCH_ALREADY_PRESENT';
  END IF;

  v_original := $old$  v_is_active boolean;
  v_category public.categories%ROWTYPE;$old$;
  v_replacement := $new$  v_is_active boolean;
  v_image_current_path text;
  v_image_previous_path text;
  v_category public.categories%ROWTYPE;$new$;
  v_occurrences := (pg_catalog.char_length(v_definition) - pg_catalog.char_length(pg_catalog.replace(v_definition, v_original, ''))) / pg_catalog.char_length(v_original);
  IF v_occurrences <> 1 THEN RAISE EXCEPTION 'CATEGORY_MEDIA_DECLARATION_ANCHOR_MISMATCH'; END IF;
  v_definition := pg_catalog.replace(v_definition, v_original, v_replacement);

  v_original := $old$      'id','category_kind','legacy_id','name_en','name_ur','sort_order','is_active'$old$;
  v_replacement := $new$      'id','category_kind','legacy_id','name_en','name_ur','sort_order','is_active',
      'image_current_path','image_previous_path'$new$;
  v_occurrences := (pg_catalog.char_length(v_definition) - pg_catalog.char_length(pg_catalog.replace(v_definition, v_original, ''))) / pg_catalog.char_length(v_original);
  IF v_occurrences <> 1 THEN RAISE EXCEPTION 'CATEGORY_MEDIA_ALLOWLIST_ANCHOR_MISMATCH'; END IF;
  v_definition := pg_catalog.replace(v_definition, v_original, v_replacement);

  v_original := $old$  IF p_action = 'subcategory_upsert' AND EXISTS ($old$;
  v_replacement := $new$  IF p_action = 'category_upsert' AND (
    (p_payload ? 'image_current_path' AND p_payload->'image_current_path' <> 'null'::jsonb
      AND pg_catalog.jsonb_typeof(p_payload->'image_current_path') <> 'string')
    OR (p_payload ? 'image_previous_path' AND p_payload->'image_previous_path' <> 'null'::jsonb
      AND pg_catalog.jsonb_typeof(p_payload->'image_previous_path') <> 'string')
  ) THEN
    RAISE EXCEPTION 'CATALOG_CATEGORY_IMAGE_PATH_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'subcategory_upsert' AND EXISTS ($new$;
  v_occurrences := (pg_catalog.char_length(v_definition) - pg_catalog.char_length(pg_catalog.replace(v_definition, v_original, ''))) / pg_catalog.char_length(v_original);
  IF v_occurrences <> 1 THEN RAISE EXCEPTION 'CATEGORY_MEDIA_TYPE_GUARD_ANCHOR_MISMATCH'; END IF;
  v_definition := pg_catalog.replace(v_definition, v_original, v_replacement);

  v_original := $old$    IF v_category_kind NOT IN ('menu', 'deal') THEN
      RAISE EXCEPTION 'CATALOG_CATEGORY_KIND_INVALID' USING ERRCODE = '22023';
    END IF;

    IF v_id IS NULL THEN
      INSERT INTO public.categories ($old$;
  v_replacement := $new$    IF v_category_kind NOT IN ('menu', 'deal') THEN
      RAISE EXCEPTION 'CATALOG_CATEGORY_KIND_INVALID' USING ERRCODE = '22023';
    END IF;

    IF v_id IS NULL AND (p_payload ? 'image_current_path' OR p_payload ? 'image_previous_path') THEN
      RAISE EXCEPTION 'CATALOG_CATEGORY_IMAGE_REQUIRES_EXISTING_CATEGORY' USING ERRCODE = '22023';
    END IF;

    IF v_id IS NULL THEN
      INSERT INTO public.categories ($new$;
  v_occurrences := (pg_catalog.char_length(v_definition) - pg_catalog.char_length(pg_catalog.replace(v_definition, v_original, ''))) / pg_catalog.char_length(v_original);
  IF v_occurrences <> 1 THEN RAISE EXCEPTION 'CATEGORY_MEDIA_INSERT_GUARD_ANCHOR_MISMATCH'; END IF;
  v_definition := pg_catalog.replace(v_definition, v_original, v_replacement);

  v_original := $old$      IF v_category.category_kind <> v_category_kind THEN
        RAISE EXCEPTION 'CATALOG_CATEGORY_KIND_IMMUTABLE' USING ERRCODE = '23514';
      END IF;

      v_before := pg_catalog.to_jsonb(v_category);$old$;
  v_replacement := $new$      IF v_category.category_kind <> v_category_kind THEN
        RAISE EXCEPTION 'CATALOG_CATEGORY_KIND_IMMUTABLE' USING ERRCODE = '23514';
      END IF;

      IF p_payload ? 'image_current_path' THEN
        IF p_payload->'image_current_path' <> 'null'::jsonb
           AND pg_catalog.jsonb_typeof(p_payload->'image_current_path') <> 'string' THEN
          RAISE EXCEPTION 'CATALOG_CATEGORY_IMAGE_PATH_TYPE_INVALID' USING ERRCODE = '22023';
        END IF;
        v_image_current_path := NULLIF(pg_catalog.btrim(p_payload->>'image_current_path'), '');
      ELSE
        v_image_current_path := v_category.image_current_path;
      END IF;

      IF p_payload ? 'image_previous_path' THEN
        IF p_payload->'image_previous_path' <> 'null'::jsonb
           AND pg_catalog.jsonb_typeof(p_payload->'image_previous_path') <> 'string' THEN
          RAISE EXCEPTION 'CATALOG_CATEGORY_PREVIOUS_IMAGE_PATH_TYPE_INVALID' USING ERRCODE = '22023';
        END IF;
        v_image_previous_path := NULLIF(pg_catalog.btrim(p_payload->>'image_previous_path'), '');
      ELSE
        v_image_previous_path := v_category.image_previous_path;
      END IF;

      IF v_image_current_path IS NOT NULL AND (
        v_image_current_path !~ ('^categories/' || v_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(jpg|jpeg|png|webp)$')
        OR NOT EXISTS (
          SELECT 1 FROM storage.objects AS o
          WHERE o.bucket_id = 'flame-chick-media' AND o.name = v_image_current_path
        )
      ) THEN
        RAISE EXCEPTION 'CATALOG_CATEGORY_IMAGE_OBJECT_INVALID' USING ERRCODE = '22023';
      END IF;

      IF v_image_previous_path IS NOT NULL AND (
        v_image_previous_path !~ ('^categories/' || v_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(jpg|jpeg|png|webp)$')
        OR NOT EXISTS (
          SELECT 1 FROM storage.objects AS o
          WHERE o.bucket_id = 'flame-chick-media' AND o.name = v_image_previous_path
        )
      ) THEN
        RAISE EXCEPTION 'CATALOG_CATEGORY_PREVIOUS_IMAGE_OBJECT_INVALID' USING ERRCODE = '22023';
      END IF;

      IF v_image_current_path IS NOT NULL AND v_image_current_path = v_image_previous_path THEN
        RAISE EXCEPTION 'CATALOG_CATEGORY_IMAGE_PATHS_MUST_DIFFER' USING ERRCODE = '22023';
      END IF;

      v_before := pg_catalog.to_jsonb(v_category);$new$;
  v_occurrences := (pg_catalog.char_length(v_definition) - pg_catalog.char_length(pg_catalog.replace(v_definition, v_original, ''))) / pg_catalog.char_length(v_original);
  IF v_occurrences <> 1 THEN RAISE EXCEPTION 'CATEGORY_MEDIA_UPDATE_GUARD_ANCHOR_MISMATCH'; END IF;
  v_definition := pg_catalog.replace(v_definition, v_original, v_replacement);

  v_original := $old$          is_active = CASE WHEN p_payload ? 'is_active' THEN v_is_active ELSE c.is_active END
      WHERE c.id = v_id AND c.restaurant_id = v_restaurant$old$;
  v_replacement := $new$          is_active = CASE WHEN p_payload ? 'is_active' THEN v_is_active ELSE c.is_active END,
          image_current_path = v_image_current_path,
          image_previous_path = v_image_previous_path
      WHERE c.id = v_id AND c.restaurant_id = v_restaurant$new$;
  v_occurrences := (pg_catalog.char_length(v_definition) - pg_catalog.char_length(pg_catalog.replace(v_definition, v_original, ''))) / pg_catalog.char_length(v_original);
  IF v_occurrences <> 1 THEN RAISE EXCEPTION 'CATEGORY_MEDIA_UPDATE_SET_ANCHOR_MISMATCH'; END IF;
  v_definition := pg_catalog.replace(v_definition, v_original, v_replacement);

  IF pg_catalog.strpos(v_definition, 'image_current_path = v_image_current_path') = 0
     OR pg_catalog.strpos(v_definition, 'CATALOG_CATEGORY_IMAGE_OBJECT_INVALID') = 0
     OR pg_catalog.strpos(v_definition, 'CATALOG_CATEGORY_PREVIOUS_IMAGE_OBJECT_INVALID') = 0 THEN
    RAISE EXCEPTION 'CATEGORY_MEDIA_PATCH_CONTENT_INVALID';
  END IF;

  EXECUTE v_definition;

  SELECT p.prosecdef, p.proconfig
    INTO v_is_definer, v_config
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'app_private.flame_chick_catalog_command_internal(text,jsonb,bigint,uuid)'::regprocedure;
  IF v_is_definer IS DISTINCT FROM true
     OR NOT ('search_path=""' = ANY(COALESCE(v_config, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'CATEGORY_MEDIA_FUNCTION_SECURITY_POSTCONDITION_FAILED';
  END IF;
END
$fc_category_media_patch$;

DO $fc_category_media_read_patch$
DECLARE
  v_definition text;
  v_original text;
  v_replacement text;
  v_occurrences integer;
  v_is_definer boolean;
  v_config text[];
BEGIN
  SELECT p.prosecdef, p.proconfig
    INTO v_is_definer, v_config
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'app_private.flame_chick_catalog_draft_read_internal(text,uuid,integer)'::regprocedure;

  IF v_is_definer IS DISTINCT FROM true
     OR NOT ('search_path=""' = ANY(COALESCE(v_config, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'CATEGORY_MEDIA_READ_FUNCTION_SECURITY_BASELINE_MISMATCH';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'app_private.flame_chick_catalog_draft_read_internal(text,uuid,integer)'::regprocedure
  ) INTO v_definition;

  IF pg_catalog.strpos(v_definition, '''image_current_path'', s.image_current_path') > 0 THEN
    RAISE EXCEPTION 'CATEGORY_MEDIA_READ_PATCH_ALREADY_PRESENT';
  END IF;

  v_original := $old$      SELECT c.id, c.category_kind, c.legacy_id, c.name_en, c.name_ur,
             c.sort_order, c.is_active, c.created_at, c.updated_at$old$;
  v_replacement := $new$      SELECT c.id, c.category_kind, c.legacy_id, c.name_en, c.name_ur,
             c.sort_order, c.is_active, c.image_current_path, c.image_previous_path,
             c.created_at, c.updated_at$new$;
  v_occurrences := (pg_catalog.char_length(v_definition) - pg_catalog.char_length(pg_catalog.replace(v_definition, v_original, ''))) / pg_catalog.char_length(v_original);
  IF v_occurrences <> 1 THEN RAISE EXCEPTION 'CATEGORY_MEDIA_READ_PROJECTION_ANCHOR_MISMATCH'; END IF;
  v_definition := pg_catalog.replace(v_definition, v_original, v_replacement);

  v_original := $old$            'category_kind', s.category_kind,
            'legacy_id', s.legacy_id,
            'name_en', s.name_en,
            'name_ur', s.name_ur,
            'sort_order', s.sort_order,
            'is_active', s.is_active,
            'created_at', s.created_at,$old$;
  v_replacement := $new$            'category_kind', s.category_kind,
            'legacy_id', s.legacy_id,
            'name_en', s.name_en,
            'name_ur', s.name_ur,
            'sort_order', s.sort_order,
            'is_active', s.is_active,
            'image_current_path', s.image_current_path,
            'image_previous_path', s.image_previous_path,
            'created_at', s.created_at,$new$;
  v_occurrences := (pg_catalog.char_length(v_definition) - pg_catalog.char_length(pg_catalog.replace(v_definition, v_original, ''))) / pg_catalog.char_length(v_original);
  IF v_occurrences <> 1 THEN RAISE EXCEPTION 'CATEGORY_MEDIA_READ_JSON_ANCHOR_MISMATCH'; END IF;
  v_definition := pg_catalog.replace(v_definition, v_original, v_replacement);

  IF pg_catalog.strpos(v_definition, '''image_current_path'', s.image_current_path') = 0
     OR pg_catalog.strpos(v_definition, '''image_previous_path'', s.image_previous_path') = 0 THEN
    RAISE EXCEPTION 'CATEGORY_MEDIA_READ_PATCH_CONTENT_INVALID';
  END IF;

  EXECUTE v_definition;

  SELECT p.prosecdef, p.proconfig
    INTO v_is_definer, v_config
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'app_private.flame_chick_catalog_draft_read_internal(text,uuid,integer)'::regprocedure;
  IF v_is_definer IS DISTINCT FROM true
     OR NOT ('search_path=""' = ANY(COALESCE(v_config, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'CATEGORY_MEDIA_READ_FUNCTION_SECURITY_POSTCONDITION_FAILED';
  END IF;
END
$fc_category_media_read_patch$;

DO $fc_deal_media_patch$
DECLARE
  v_definition text;
  v_original text;
  v_replacement text;
  v_occurrences integer;
  v_is_definer boolean;
  v_config text[];
BEGIN
  SELECT p.prosecdef, p.proconfig
    INTO v_is_definer, v_config
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'app_private.flame_chick_catalog_deal_upsert_internal(jsonb,bigint,uuid)'::regprocedure;

  IF v_is_definer IS DISTINCT FROM true
     OR NOT ('search_path=""' = ANY(COALESCE(v_config, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'DEAL_MEDIA_FUNCTION_SECURITY_BASELINE_MISMATCH';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'app_private.flame_chick_catalog_deal_upsert_internal(jsonb,bigint,uuid)'::regprocedure
  ) INTO v_definition;

  IF pg_catalog.strpos(v_definition, 'DEAL_IMAGE_OBJECT_INVALID') > 0 THEN
    RAISE EXCEPTION 'DEAL_MEDIA_PATCH_ALREADY_PRESENT';
  END IF;

  v_original := $old$  v_available boolean;
  v_num numeric;$old$;
  v_replacement := $new$  v_available boolean;
  v_image_current_path text;
  v_image_previous_path text;
  v_num numeric;$new$;
  v_occurrences := (pg_catalog.char_length(v_definition) - pg_catalog.char_length(pg_catalog.replace(v_definition, v_original, ''))) / pg_catalog.char_length(v_original);
  IF v_occurrences <> 1 THEN RAISE EXCEPTION 'DEAL_MEDIA_DECLARATION_ANCHOR_MISMATCH'; END IF;
  v_definition := pg_catalog.replace(v_definition, v_original, v_replacement);

  v_original := $old$      'description_ur','featured','sort_order','is_active','is_available','variants'$old$;
  v_replacement := $new$      'description_ur','featured','sort_order','is_active','is_available',
      'image_current_path','image_previous_path','variants'$new$;
  v_occurrences := (pg_catalog.char_length(v_definition) - pg_catalog.char_length(pg_catalog.replace(v_definition, v_original, ''))) / pg_catalog.char_length(v_original);
  IF v_occurrences <> 1 THEN RAISE EXCEPTION 'DEAL_MEDIA_ALLOWLIST_ANCHOR_MISMATCH'; END IF;
  v_definition := pg_catalog.replace(v_definition, v_original, v_replacement);

  v_original := $old$  IF p_payload ? 'variants' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'variants') IS DISTINCT FROM 'array' THEN$old$;
  v_replacement := $new$  IF (p_payload ? 'image_current_path' AND p_payload->'image_current_path' <> 'null'::jsonb
       AND pg_catalog.jsonb_typeof(p_payload->'image_current_path') <> 'string')
     OR (p_payload ? 'image_previous_path' AND p_payload->'image_previous_path' <> 'null'::jsonb
       AND pg_catalog.jsonb_typeof(p_payload->'image_previous_path') <> 'string') THEN
    RAISE EXCEPTION 'DEAL_IMAGE_PATH_TYPE_INVALID' USING ERRCODE='22023';
  END IF;

  IF p_payload ? 'variants' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'variants') IS DISTINCT FROM 'array' THEN$new$;
  v_occurrences := (pg_catalog.char_length(v_definition) - pg_catalog.char_length(pg_catalog.replace(v_definition, v_original, ''))) / pg_catalog.char_length(v_original);
  IF v_occurrences <> 1 THEN RAISE EXCEPTION 'DEAL_MEDIA_TYPE_GUARD_ANCHOR_MISMATCH'; END IF;
  v_definition := pg_catalog.replace(v_definition, v_original, v_replacement);

  v_original := $old$  IF p_payload ? 'collection_id' THEN$old$;
  v_replacement := $new$  IF v_id IS NULL AND (p_payload ? 'image_current_path' OR p_payload ? 'image_previous_path') THEN
    RAISE EXCEPTION 'DEAL_IMAGE_REQUIRES_EXISTING_DEAL' USING ERRCODE='22023';
  END IF;

  IF p_payload ? 'image_current_path' THEN
    IF p_payload->'image_current_path' <> 'null'::jsonb
       AND pg_catalog.jsonb_typeof(p_payload->'image_current_path') <> 'string' THEN
      RAISE EXCEPTION 'DEAL_IMAGE_PATH_TYPE_INVALID' USING ERRCODE='22023';
    END IF;
    v_image_current_path := NULLIF(pg_catalog.btrim(p_payload->>'image_current_path'), '');
  ELSIF v_id IS NOT NULL THEN
    v_image_current_path := v_row.image_current_path;
  ELSE
    v_image_current_path := NULL;
  END IF;

  IF p_payload ? 'image_previous_path' THEN
    IF p_payload->'image_previous_path' <> 'null'::jsonb
       AND pg_catalog.jsonb_typeof(p_payload->'image_previous_path') <> 'string' THEN
      RAISE EXCEPTION 'DEAL_PREVIOUS_IMAGE_PATH_TYPE_INVALID' USING ERRCODE='22023';
    END IF;
    v_image_previous_path := NULLIF(pg_catalog.btrim(p_payload->>'image_previous_path'), '');
  ELSIF v_id IS NOT NULL THEN
    v_image_previous_path := v_row.image_previous_path;
  ELSE
    v_image_previous_path := NULL;
  END IF;

  IF v_image_current_path IS NOT NULL AND (
    v_image_current_path !~ ('^deals/' || v_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(jpg|jpeg|png|webp)$')
    OR NOT EXISTS (
      SELECT 1 FROM storage.objects AS o
      WHERE o.bucket_id = 'flame-chick-media' AND o.name = v_image_current_path
    )
  ) THEN
    RAISE EXCEPTION 'DEAL_IMAGE_OBJECT_INVALID' USING ERRCODE='22023';
  END IF;

  IF v_image_previous_path IS NOT NULL AND (
    v_image_previous_path !~ ('^deals/' || v_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(jpg|jpeg|png|webp)$')
    OR NOT EXISTS (
      SELECT 1 FROM storage.objects AS o
      WHERE o.bucket_id = 'flame-chick-media' AND o.name = v_image_previous_path
    )
  ) THEN
    RAISE EXCEPTION 'DEAL_PREVIOUS_IMAGE_OBJECT_INVALID' USING ERRCODE='22023';
  END IF;

  IF v_image_current_path IS NOT NULL AND v_image_current_path = v_image_previous_path THEN
    RAISE EXCEPTION 'DEAL_IMAGE_PATHS_MUST_DIFFER' USING ERRCODE='22023';
  END IF;

  IF p_payload ? 'collection_id' THEN$new$;
  v_occurrences := (pg_catalog.char_length(v_definition) - pg_catalog.char_length(pg_catalog.replace(v_definition, v_original, ''))) / pg_catalog.char_length(v_original);
  IF v_occurrences <> 1 THEN RAISE EXCEPTION 'DEAL_MEDIA_EXISTING_ROW_ANCHOR_MISMATCH'; END IF;
  v_definition := pg_catalog.replace(v_definition, v_original, v_replacement);

  v_original := $old$        sort_order=v_sort,is_active=v_active,is_available=v_available
    WHERE d.id=v_id AND d.restaurant_id=v_context.restaurant_id$old$;
  v_replacement := $new$        sort_order=v_sort,is_active=v_active,is_available=v_available,
        image_current_path=v_image_current_path,
        image_previous_path=v_image_previous_path
    WHERE d.id=v_id AND d.restaurant_id=v_context.restaurant_id$new$;
  v_occurrences := (pg_catalog.char_length(v_definition) - pg_catalog.char_length(pg_catalog.replace(v_definition, v_original, ''))) / pg_catalog.char_length(v_original);
  IF v_occurrences <> 1 THEN RAISE EXCEPTION 'DEAL_MEDIA_UPDATE_SET_ANCHOR_MISMATCH'; END IF;
  v_definition := pg_catalog.replace(v_definition, v_original, v_replacement);

  IF pg_catalog.strpos(v_definition, 'image_current_path=v_image_current_path') = 0
     OR pg_catalog.strpos(v_definition, 'DEAL_IMAGE_OBJECT_INVALID') = 0
     OR pg_catalog.strpos(v_definition, 'DEAL_PREVIOUS_IMAGE_OBJECT_INVALID') = 0 THEN
    RAISE EXCEPTION 'DEAL_MEDIA_PATCH_CONTENT_INVALID';
  END IF;

  EXECUTE v_definition;

  SELECT p.prosecdef, p.proconfig
    INTO v_is_definer, v_config
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'app_private.flame_chick_catalog_deal_upsert_internal(jsonb,bigint,uuid)'::regprocedure;
  IF v_is_definer IS DISTINCT FROM true
     OR NOT ('search_path=""' = ANY(COALESCE(v_config, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'DEAL_MEDIA_FUNCTION_SECURITY_POSTCONDITION_FAILED';
  END IF;
END
$fc_deal_media_patch$;

DO $fc_deal_media_read_patch$
DECLARE
  v_definition text;
  v_original text;
  v_replacement text;
  v_occurrences integer;
  v_is_definer boolean;
  v_config text[];
BEGIN
  SELECT p.prosecdef, p.proconfig
    INTO v_is_definer, v_config
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'app_private.flame_chick_catalog_deal_list_read_internal(uuid,uuid,integer)'::regprocedure;

  IF v_is_definer IS DISTINCT FROM true
     OR NOT ('search_path=""' = ANY(COALESCE(v_config, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'DEAL_MEDIA_READ_FUNCTION_SECURITY_BASELINE_MISMATCH';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'app_private.flame_chick_catalog_deal_list_read_internal(uuid,uuid,integer)'::regprocedure
  ) INTO v_definition;

  IF pg_catalog.strpos(v_definition, '''image_current_path'',d.image_current_path') > 0 THEN
    RAISE EXCEPTION 'DEAL_MEDIA_READ_PATCH_ALREADY_PRESENT';
  END IF;

  v_original := $old$          'is_available',d.is_available,
          'variant_count',(SELECT count(*) FROM public.deal_variants dv WHERE dv.restaurant_id=v_restaurant AND dv.deal_id=d.id),$old$;
  v_replacement := $new$          'is_available',d.is_available,
          'image_current_path',d.image_current_path,
          'image_previous_path',d.image_previous_path,
          'variant_count',(SELECT count(*) FROM public.deal_variants dv WHERE dv.restaurant_id=v_restaurant AND dv.deal_id=d.id),$new$;
  v_occurrences := (pg_catalog.char_length(v_definition) - pg_catalog.char_length(pg_catalog.replace(v_definition, v_original, ''))) / pg_catalog.char_length(v_original);
  IF v_occurrences <> 1 THEN RAISE EXCEPTION 'DEAL_MEDIA_READ_JSON_ANCHOR_MISMATCH'; END IF;
  v_definition := pg_catalog.replace(v_definition, v_original, v_replacement);

  IF pg_catalog.strpos(v_definition, '''image_current_path'',d.image_current_path') = 0
     OR pg_catalog.strpos(v_definition, '''image_previous_path'',d.image_previous_path') = 0 THEN
    RAISE EXCEPTION 'DEAL_MEDIA_READ_PATCH_CONTENT_INVALID';
  END IF;

  EXECUTE v_definition;

  SELECT p.prosecdef, p.proconfig
    INTO v_is_definer, v_config
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'app_private.flame_chick_catalog_deal_list_read_internal(uuid,uuid,integer)'::regprocedure;
  IF v_is_definer IS DISTINCT FROM true
     OR NOT ('search_path=""' = ANY(COALESCE(v_config, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'DEAL_MEDIA_READ_FUNCTION_SECURITY_POSTCONDITION_FAILED';
  END IF;
END
$fc_deal_media_read_patch$;
