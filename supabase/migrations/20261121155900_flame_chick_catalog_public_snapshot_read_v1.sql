-- Public catalog reads must consume only the current immutable publication.
-- No read path may reconstruct a public response from mutable draft tables.
-- Snapshot checksum contract: lowercase hex SHA-256 of PostgreSQL's canonical
-- jsonb::text representation, encoded as UTF-8 bytes.

BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'CATALOG_PUBLIC_READ_MIGRATION_REQUIRES_POSTGRES';
  END IF;

  IF pg_catalog.to_regclass('public.catalog_publications') IS NULL
     OR pg_catalog.to_regclass('public.catalog_current_publication') IS NULL
     OR pg_catalog.to_regclass('public.restaurants') IS NULL THEN
    RAISE EXCEPTION 'CATALOG_PUBLICATION_FOUNDATION_MISSING';
  END IF;

  IF pg_catalog.to_regprocedure('public.flame_chick_catalog_public_read(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'CATALOG_PUBLIC_READ_RPC_ALREADY_EXISTS';
  END IF;

  IF pg_catalog.to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'PGCRYPTO_DIGEST_FUNCTION_MISSING';
  END IF;
END;
$preflight$;

CREATE FUNCTION public.flame_chick_catalog_public_read(p_restaurant_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_restaurant_active boolean;
  v_publication_id uuid;
  v_publication_number bigint;
  v_draft_revision bigint;
  v_schema_version integer;
  v_pricing_engine_version text;
  v_snapshot jsonb;
  v_snapshot_sha256 text;
  v_published_at timestamptz;
  v_calculated_sha256 text;
BEGIN
  IF p_restaurant_slug IS NULL
     OR pg_catalog.char_length(p_restaurant_slug) > 80
     OR p_restaurant_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'CATALOG_PUBLIC_READ_SLUG_INVALID'
      USING ERRCODE = '22023';
  END IF;

  -- Deliberately reads only restaurant identity, the current pointer and
  -- immutable publication history. Draft/category/product/deal/modifier/
  -- settings tables are not queried anywhere in this function.
  SELECT
    r.is_active,
    p.id,
    p.publication_number,
    p.draft_revision,
    p.schema_version,
    p.pricing_engine_version,
    p.snapshot,
    p.snapshot_sha256,
    p.published_at
  INTO
    v_restaurant_active,
    v_publication_id,
    v_publication_number,
    v_draft_revision,
    v_schema_version,
    v_pricing_engine_version,
    v_snapshot,
    v_snapshot_sha256,
    v_published_at
  FROM public.restaurants AS r
  LEFT JOIN public.catalog_current_publication AS cp
    ON cp.restaurant_id = r.id
  LEFT JOIN public.catalog_publications AS p
    ON p.id = cp.publication_id
   AND p.restaurant_id = cp.restaurant_id
  WHERE r.slug = p_restaurant_slug
  LIMIT 1;

  IF NOT FOUND
     OR v_restaurant_active IS DISTINCT FROM true
     OR v_publication_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'published', false,
      'publicationId', NULL,
      'publicationNumber', NULL,
      'draftRevision', NULL,
      'schemaVersion', NULL,
      'pricingEngineVersion', NULL,
      'snapshotSha256', NULL,
      'publishedAt', NULL,
      'snapshot', NULL
    );
  END IF;

  IF v_snapshot IS NULL
     OR pg_catalog.jsonb_typeof(v_snapshot) <> 'object'
     OR v_schema_version IS NULL
     OR v_schema_version < 1
     OR v_snapshot ->> 'schemaVersion' IS DISTINCT FROM v_schema_version::text
     OR v_publication_number IS NULL
     OR v_publication_number < 1
     OR v_draft_revision IS NULL
     OR v_draft_revision < 0
     OR v_snapshot_sha256 IS NULL
     OR v_snapshot_sha256 !~ '^[0-9a-f]{64}$'
     OR v_published_at IS NULL
     OR v_pricing_engine_version IS NULL
     OR pg_catalog.btrim(v_pricing_engine_version) = '' THEN
    RAISE EXCEPTION 'CATALOG_CURRENT_PUBLICATION_INVALID'
      USING ERRCODE = '55000';
  END IF;

  v_calculated_sha256 := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(v_snapshot::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  IF v_calculated_sha256 IS DISTINCT FROM v_snapshot_sha256 THEN
    RAISE EXCEPTION 'CATALOG_CURRENT_PUBLICATION_CHECKSUM_MISMATCH'
      USING ERRCODE = '55000';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'published', true,
    'publicationId', v_publication_id,
    'publicationNumber', v_publication_number,
    'draftRevision', v_draft_revision,
    'schemaVersion', v_schema_version,
    'pricingEngineVersion', v_pricing_engine_version,
    'snapshotSha256', v_snapshot_sha256,
    'publishedAt', v_published_at,
    'snapshot', v_snapshot
  );
END
$function$;

ALTER FUNCTION public.flame_chick_catalog_public_read(text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.flame_chick_catalog_public_read(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_catalog_public_read(text)
  TO service_role;

COMMENT ON FUNCTION public.flame_chick_catalog_public_read(text) IS
  'Server-only public catalog read. Returns only the snapshot selected by catalog_current_publication; no mutable draft-table fallback exists.';

DO $verify$
DECLARE
  v_signature regprocedure := 'public.flame_chick_catalog_public_read(text)'::regprocedure;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    WHERE p.oid = v_signature
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION 'CATALOG_PUBLIC_READ_FUNCTION_SECURITY_INVALID';
  END IF;

  IF NOT pg_catalog.has_function_privilege('service_role', v_signature, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'CATALOG_PUBLIC_READ_FUNCTION_GRANTS_INVALID';
  END IF;

  IF pg_catalog.has_table_privilege('service_role', 'public.catalog_publications', 'SELECT')
     OR pg_catalog.has_table_privilege('service_role', 'public.catalog_current_publication', 'SELECT')
     OR pg_catalog.has_table_privilege('anon', 'public.catalog_publications', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.catalog_publications', 'SELECT') THEN
    RAISE EXCEPTION 'CATALOG_PUBLICATION_TABLE_GRANTS_MUST_REMAIN_CLOSED';
  END IF;
END;
$verify$;

COMMIT;
