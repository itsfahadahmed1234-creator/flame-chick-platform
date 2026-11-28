const ADMIN_INVITATION_PATH = "/accept-invitation.html";
const RIDER_INVITATION_PATH = "/";

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * Parse a comma-separated, exact-origin allowlist.
 * Production entries must be HTTPS origins with no path, query, fragment or credentials.
 * HTTP is accepted only for explicitly named loopback development origins.
 */
export const CLOUDFLARE_PRODUCTION_STAFF_ADMIN_ORIGIN = "https://flamechickadmin.pages.dev";
export const CLOUDFLARE_PRODUCTION_RIDER_ORIGIN = "https://flamechickrider.pages.dev";
export const ADMIN_INVITATION_REDIRECT = CLOUDFLARE_PRODUCTION_STAFF_ADMIN_ORIGIN + ADMIN_INVITATION_PATH;
export const RIDER_INVITATION_REDIRECT = CLOUDFLARE_PRODUCTION_RIDER_ORIGIN + RIDER_INVITATION_PATH;
export const PRODUCTION_STAFF_ADMIN_ORIGIN = "https://flamechicadmin.vercel.app";

/**
 * Exact current Admin preview hosts only. Do not wildcard Vercel domains.
 */
export const PREVIEW_STAFF_ADMIN_ORIGINS = Object.freeze([
  "https://flame-chick-admin-production-fxdrq9od9-fahad-7455.vercel.app",
  "https://flame-chick-admin-production-q58bg0vac-fahad-7455.vercel.app",
  "https://flame-chick-admin-production-git-work-product-0d7cc4-fahad-7455.vercel.app"
]);

/**
 * Always include the canonical Cloudflare Pages Admin origin and preserve the
 * existing Vercel production fallback. Keep exact configured origins; never wildcard.
 */
export function parseStaffAdminOrigins(raw) {
  const configured = typeof raw === "string" ? raw.trim() : "";
  return parseAllowedOrigins(
    [configured, CLOUDFLARE_PRODUCTION_STAFF_ADMIN_ORIGIN, CLOUDFLARE_PRODUCTION_RIDER_ORIGIN, PRODUCTION_STAFF_ADMIN_ORIGIN, ...PREVIEW_STAFF_ADMIN_ORIGINS].filter(Boolean).join(",")
  );
}

export function parseAllowedOrigins(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new TypeError("Staff Admin allowed-origin list is empty.");
  }

  const entries = raw.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (entries.length === 0) {
    throw new TypeError("Staff Admin allowed-origin list is empty.");
  }

  const origins = new Set();
  for (const entry of entries) {
    let url;
    try {
      url = new URL(entry);
    } catch {
      throw new TypeError("Staff Admin allowed-origin entry is not a valid URL.");
    }

    const protocolAllowed = url.protocol === "https:" ||
      (url.protocol === "http:" && isLoopbackHost(url.hostname));
    if (!protocolAllowed ||
        url.hostname.includes("*") ||
        url.username !== "" ||
        url.password !== "" ||
        url.pathname !== "/" ||
        url.search !== "" ||
        url.hash !== "" ||
        url.origin !== entry) {
      throw new TypeError("Staff Admin origins must be exact HTTPS origins (or explicit loopback HTTP origins).");
    }
    origins.add(url.origin);
  }

  if (origins.size === 0) {
    throw new TypeError("Staff Admin allowed-origin list is empty.");
  }
  return origins;
}

/**
 * Missing Origin is permitted for non-browser callers; authentication and database
 * authorization remain mandatory. Browser origins must match exactly.
 */
export function isAllowedRequestOrigin(origin, allowedOrigins) {
  return origin === null || (typeof origin === "string" && allowedOrigins.has(origin));
}

/** Route each invitation to the Cloudflare portal that owns that staff role. */
export function getStaffInviteRedirect(role) {
  const normalized = typeof role === "string" ? role.trim().toLowerCase() : "";
  if (normalized === "rider") return RIDER_INVITATION_REDIRECT;
  if (["admin", "owner", "manager", "cashier"].includes(normalized)) return ADMIN_INVITATION_REDIRECT;
  throw new TypeError("Unsupported staff invitation role.");
}

/** Only the exact Cloudflare role-specific callback URLs may receive Auth tokens. */
export function isSafeInviteRedirect(value, allowedOrigins) {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    const url = new URL(value);
    const roleRoute =
      (url.origin === CLOUDFLARE_PRODUCTION_STAFF_ADMIN_ORIGIN && url.pathname === ADMIN_INVITATION_PATH) ||
      (url.origin === CLOUDFLARE_PRODUCTION_RIDER_ORIGIN && url.pathname === RIDER_INVITATION_PATH);
    return url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      allowedOrigins.has(url.origin) &&
      roleRoute &&
      url.search === "" &&
      url.hash === "";
  } catch {
    return false;
  }
}

/** Build a minimal CORS response header set; never reflect untrusted origins. */
export function staffCorsHeaders(origin, allowedOrigins) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };

  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "apikey, authorization, content-type, x-client-info";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}
