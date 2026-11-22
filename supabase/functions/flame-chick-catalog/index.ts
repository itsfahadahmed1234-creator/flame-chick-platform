// Flame Chick public catalog API.
// HARD BOUNDARY: public responses are read from the current immutable
// catalog publication only. This function MUST NOT read draft tables.
const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const RESTAURANT_SLUG = "flame-chick";

function readKeyMap(name: string): Record<string, string> {
  const raw = Deno.env.get(name);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, string>
      : {};
  } catch {
    return {};
  }
}

// This key is server-only. Never pass it to the browser or include it in a response.
const SECRET_KEY_MAP = readKeyMap("SUPABASE_SECRET_KEYS");
const DATABASE_KEY = String(
  SECRET_KEY_MAP.default ??
  Object.values(SECRET_KEY_MAP)[0] ??
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  ""
);

const SCHEMA_VERSION = 2;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, content-type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

type PublicationRead = {
  published: boolean;
  publicationId: string | null;
  publicationNumber: number | null;
  draftRevision: number | null;
  schemaVersion: number | null;
  pricingEngineVersion: string | null;
  snapshotSha256: string | null;
  publishedAt: string | null;
  snapshot: Record<string, unknown> | null;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readCurrentPublication(): Promise<PublicationRead> {
  if (!PROJECT_URL || !DATABASE_KEY) {
    throw new Error("Catalog service credentials are not configured");
  }

  const endpoint = new URL("/rest/v1/rpc/flame_chick_catalog_public_read", PROJECT_URL);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: DATABASE_KEY,
      Authorization: `Bearer ${DATABASE_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ p_restaurant_slug: RESTAURANT_SLUG }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Published catalog RPC failed (${response.status}): ${detail}`);
  }

  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Published catalog RPC returned an invalid response");
  }

  const result = value as Record<string, unknown>;
  if (typeof result.published !== "boolean") {
    throw new Error("Published catalog RPC omitted publication status");
  }
  if (result.published === false) {
    return {
      published: false,
      publicationId: null,
      publicationNumber: null,
      draftRevision: null,
      schemaVersion: null,
      pricingEngineVersion: null,
      snapshotSha256: null,
      publishedAt: null,
      snapshot: null,
    };
  }

  if (
    typeof result.publicationId !== "string" ||
    !Number.isSafeInteger(result.publicationNumber) ||
    !Number.isSafeInteger(result.draftRevision) ||
    !Number.isSafeInteger(result.schemaVersion) ||
    typeof result.pricingEngineVersion !== "string" ||
    typeof result.snapshotSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(result.snapshotSha256) ||
    typeof result.publishedAt !== "string" ||
    !result.snapshot ||
    typeof result.snapshot !== "object" ||
    Array.isArray(result.snapshot)
  ) {
    throw new Error("Published catalog RPC returned incomplete publication metadata");
  }

  if ((result.snapshot as Record<string, unknown>).schemaVersion !== result.schemaVersion) {
    throw new Error("Published catalog snapshot schema version is inconsistent");
  }

  return result as PublicationRead;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return json({
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "GET only." },
    }, 405);
  }

  if (!PROJECT_URL || !DATABASE_KEY) {
    return json({
      ok: false,
      error: { code: "CONFIG_MISSING", message: "Catalog API is not configured." },
    }, 503);
  }

  const action = new URL(req.url).searchParams.get("action") ?? "catalog";
  if (action !== "health" && action !== "catalog") {
    return json({
      ok: false,
      error: { code: "ACTION_NOT_FOUND", message: "Supported actions: health, catalog." },
    }, 404);
  }

  try {
    const publication = await readCurrentPublication();

    if (action === "health") {
      return json({
        ok: true,
        data: {
          // An unpublished restaurant has no live snapshot yet. Preserve the
          // legacy schema marker only for that empty state; a published V3
          // snapshot advertises its exact schema so older clients fail closed.
          schemaVersion: publication.published ? publication.schemaVersion : SCHEMA_VERSION,
          published: publication.published,
          publicationId: publication.publicationId,
          publicationNumber: publication.publicationNumber,
          draftRevision: publication.draftRevision,
          snapshotSha256: publication.snapshotSha256,
          publishedAt: publication.publishedAt,
        },
      });
    }

    if (!publication.published || !publication.snapshot) {
      return json({
        ok: false,
        error: {
          code: "CATALOG_NOT_PUBLISHED",
          message: "No published Flame Chick menu is available yet.",
        },
      }, 404);
    }

    // Retain the existing schema-v2 DTO at the top level for Website/POS
    // consumers, adding publication identity as metadata. The snapshot itself
    // is copied unchanged; no draft data is merged into it here.
    return json({
      ok: true,
      data: {
        ...publication.snapshot,
        versionId: `sha256:${publication.snapshotSha256}`,
        publicationId: publication.publicationId,
        publicationNumber: publication.publicationNumber,
        draftRevision: publication.draftRevision,
        pricingEngineVersion: publication.pricingEngineVersion,
        snapshotSha256: publication.snapshotSha256,
        publishedAt: publication.publishedAt,
      },
    });
  } catch (error) {
    console.error("flame-chick-catalog published read failed", error);
    return json({
      ok: false,
      error: {
        code: "CATALOG_READ_FAILED",
        message: "The published Flame Chick menu could not be loaded.",
      },
    }, 503);
  }
});
