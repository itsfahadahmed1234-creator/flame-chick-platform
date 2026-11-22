const INVITATION_PATH = "/accept-invitation.html";

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * Parse a comma-separated, exact-origin allowlist.
 * Production entries must be HTTPS origins with no path, query, fragment or credentials.
 * HTTP is accepted only for explicitly named loopback development origins.
 */
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

/** Only the Admin invitation-acceptance page may receive Auth invite redirects. */
export function isSafeInviteRedirect(value, allowedOrigins) {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      allowedOrigins.has(url.origin) &&
      url.pathname === INVITATION_PATH &&
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
