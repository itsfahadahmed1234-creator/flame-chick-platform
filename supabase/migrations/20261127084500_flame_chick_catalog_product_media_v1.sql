-- Extend the audited Catalog V3 product command to manage product images.
-- The product command continues to own revision checks, idempotency and audit rows.
DO $fc_media_patch$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef('app_private.flame_chick_catalog_product_upsert_internal(jsonb,bigint,uuid)'::regprocedure)
    INTO v_definition;
  IF pg_catalog.strpos(v_definition,'image_current_path = v_image_current_path') = 0 THEN
    v_old := $old$  v_is_available boolean;
  v_product public.products%ROWTYPE;$old$;
    v_new := $new$  v_is_available boolean;
  v_image_current_path text;
  v_image_previous_path text;
  v_image_extension text;
  v_image_previous_extension text;
  v_image_published boolean;
  v_product public.products%ROWTYPE;$new$;
    v_definition := pg_catalog.replace(v_definition,v_old,v_new);
    v_old := $old$      'is_available','variants'$old$;
    v_new := $new$      'is_available','variants','image_current_path','image_previous_path',
      'image_extension','image_previous_extension','image_published'$new$;
    v_definition := pg_catalog.replace(v_definition,v_old,v_new);
    v_old := $old$  -- Snapshot before state includes its existing variants for meaningful audit.$old$;
    v_new := $new$  IF v_id IS NULL AND (
       p_payload ? 'image_current_path' OR p_payload ? 'image_previous_path'
       OR p_payload ? 'image_extension' OR p_payload ? 'image_previous_extension'
       OR p_payload ? 'image_published'
     ) THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_IMAGE_REQUIRES_EXISTING_PRODUCT' USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'image_current_path' THEN
    IF p_payload->'image_current_path' <> 'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'image_current_path') <> 'string' THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_IMAGE_PATH_INVALID' USING ERRCODE = '22023';
    END IF;
    v_image_current_path := NULLIF(pg_catalog.btrim(p_payload->>'image_current_path'), '');
  ELSIF v_id IS NOT NULL THEN v_image_current_path := v_product.image_current_path;
  ELSE v_image_current_path := NULL;
  END IF;

  IF p_payload ? 'image_previous_path' THEN
    IF p_payload->'image_previous_path' <> 'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'image_previous_path') <> 'string' THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_PREVIOUS_IMAGE_PATH_INVALID' USING ERRCODE = '22023';
    END IF;
    v_image_previous_path := NULLIF(pg_catalog.btrim(p_payload->>'image_previous_path'), '');
  ELSIF v_id IS NOT NULL THEN v_image_previous_path := v_product.image_previous_path;
  ELSE v_image_previous_path := NULL;
  END IF;

  IF p_payload ? 'image_extension' THEN
    IF p_payload->'image_extension' <> 'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'image_extension') <> 'string' THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_IMAGE_EXTENSION_INVALID' USING ERRCODE = '22023';
    END IF;
    v_image_extension := NULLIF(pg_catalog.lower(pg_catalog.btrim(p_payload->>'image_extension')), '');
  ELSIF v_id IS NOT NULL THEN v_image_extension := v_product.image_extension;
  ELSE v_image_extension := NULL;
  END IF;

  IF p_payload ? 'image_previous_extension' THEN
    IF p_payload->'image_previous_extension' <> 'null'::jsonb AND pg_catalog.jsonb_typeof(p_payload->'image_previous_extension') <> 'string' THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_PREVIOUS_IMAGE_EXTENSION_INVALID' USING ERRCODE = '22023';
    END IF;
    v_image_previous_extension := NULLIF(pg_catalog.lower(pg_catalog.btrim(p_payload->>'image_previous_extension')), '');
  ELSIF v_id IS NOT NULL THEN v_image_previous_extension := v_product.image_previous_extension;
  ELSE v_image_previous_extension := NULL;
  END IF;

  IF p_payload ? 'image_published' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'image_published') <> 'boolean' THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_IMAGE_PUBLISHED_INVALID' USING ERRCODE = '22023';
    END IF;
    v_image_published := (p_payload->>'image_published')::boolean;
  ELSIF v_id IS NOT NULL THEN v_image_published := v_product.image_published;
  ELSE v_image_published := false;
  END IF;

  IF v_image_current_path IS NOT NULL THEN
    IF v_image_current_path !~ ('^products/' || v_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(jpg|jpeg|png|webp)$')
       OR v_image_extension IS DISTINCT FROM pg_catalog.regexp_replace(v_image_current_path, '^.*\.', '')
       OR NOT EXISTS (SELECT 1 FROM storage.objects AS o WHERE o.bucket_id='flame-chick-media' AND o.name=v_image_current_path) THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_IMAGE_OBJECT_INVALID' USING ERRCODE = '22023';
    END IF;
  ELSIF v_image_extension IS NOT NULL OR v_image_published THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_IMAGE_METADATA_INVALID' USING ERRCODE = '22023';
  END IF;

  IF v_image_previous_path IS NOT NULL THEN
    IF v_image_previous_path !~ ('^products/' || v_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(jpg|jpeg|png|webp)$')
       OR v_image_previous_extension IS DISTINCT FROM pg_catalog.regexp_replace(v_image_previous_path, '^.*\.', '')
       OR NOT EXISTS (SELECT 1 FROM storage.objects AS o WHERE o.bucket_id='flame-chick-media' AND o.name=v_image_previous_path) THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_PREVIOUS_IMAGE_OBJECT_INVALID' USING ERRCODE = '22023';
    END IF;
  ELSIF v_image_previous_extension IS NOT NULL THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_PREVIOUS_IMAGE_METADATA_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Snapshot before state includes its existing variants for meaningful audit.$new$;
    v_definition := pg_catalog.replace(v_definition,v_old,v_new);
    v_old := $old$        is_active = v_is_active,
        is_available = v_is_available
    WHERE p.id = v_id AND p.restaurant_id = v_restaurant$old$;
    v_new := $new$        is_active = v_is_active,
        is_available = v_is_available,
        image_current_path = v_image_current_path,
        image_previous_path = v_image_previous_path,
        image_extension = v_image_extension,
        image_previous_extension = v_image_previous_extension,
        image_published = v_image_published
    WHERE p.id = v_id AND p.restaurant_id = v_restaurant$new$;
    v_definition := pg_catalog.replace(v_definition,v_old,v_new);
  END IF;

  IF pg_catalog.strpos(v_definition,'image_current_path = v_image_current_path') = 0
     OR pg_catalog.strpos(v_definition,'CATALOG_PRODUCT_IMAGE_OBJECT_INVALID') = 0 THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_MEDIA_PATCH_FAILED';
  END IF;
  EXECUTE v_definition;
END
$fc_media_patch$;
