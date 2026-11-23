const encoder = new TextEncoder();
const DEFAULT_TTL_MS = 3 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function stableWebsiteOrderJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableWebsiteOrderJson).join(",") + "]";
  }
  return "{" + Object.keys(value).sort().map((key) =>
    JSON.stringify(key) + ":" + stableWebsiteOrderJson(value[key])
  ).join(",") + "}";
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("TOKEN_ENCODING_INVALID");
  }
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importSigningKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) return null;
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signHex(key, value) {
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToHex(new Uint8Array(signature));
}

function fingerprintInput(quoteId, issuedAt, expiresAt, canonical) {
  return stableWebsiteOrderJson({
    quote_id: quoteId,
    issued_at: issuedAt,
    expires_at: expiresAt,
    canonical,
  });
}

export async function createWebsiteOrderQuoteToken({
  canonical,
  databaseNow,
  secret,
  quoteId = crypto.randomUUID(),
} = {}) {
  const nowMs = Date.parse(databaseNow);
  if (!Number.isFinite(nowMs) || !canonical || typeof canonical !== "object" || Array.isArray(canonical)) {
    return { ok: false, code: "WEBSITE_ORDER_QUOTE_TIME_INVALID" };
  }
  if (!UUID_RE.test(quoteId)) {
    return { ok: false, code: "WEBSITE_ORDER_QUOTE_ID_INVALID" };
  }

  let key;
  try {
    key = await importSigningKey(secret);
  } catch {
    return { ok: false, code: "WEBSITE_ORDER_QUOTE_SIGNING_UNAVAILABLE" };
  }
  if (!key) return { ok: false, code: "WEBSITE_ORDER_QUOTE_SIGNING_UNAVAILABLE" };

  const issuedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + DEFAULT_TTL_MS).toISOString();
  const fingerprint = await signHex(
    key,
    fingerprintInput(quoteId, issuedAt, expiresAt, canonical),
  );
  const claims = {
    v: 1,
    quote_id: quoteId,
    issued_at: issuedAt,
    expires_at: expiresAt,
    fingerprint,
  };
  const payload = encoder.encode(JSON.stringify(claims));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  return {
    ok: true,
    token: bytesToBase64Url(payload) + "." + bytesToBase64Url(signature),
    expiresAt,
  };
}

export async function verifyWebsiteOrderQuoteToken({
  token,
  canonical,
  databaseNow,
  secret,
} = {}) {
  if (typeof token !== "string" || !token) {
    return { ok: false, code: "WEBSITE_ORDER_QUOTE_REQUIRED" };
  }
  if (token.length > 4096 || token.split(".").length !== 2 ||
      !canonical || typeof canonical !== "object" || Array.isArray(canonical)) {
    return { ok: false, code: "WEBSITE_ORDER_QUOTE_TOKEN_INVALID" };
  }

  const nowMs = Date.parse(databaseNow);
  if (!Number.isFinite(nowMs)) {
    return { ok: false, code: "WEBSITE_ORDER_QUOTE_TIME_INVALID" };
  }

  let key;
  try {
    key = await importSigningKey(secret);
  } catch {
    return { ok: false, code: "WEBSITE_ORDER_QUOTE_SIGNING_UNAVAILABLE" };
  }
  if (!key) return { ok: false, code: "WEBSITE_ORDER_QUOTE_SIGNING_UNAVAILABLE" };

  const [payloadPart, signaturePart] = token.split(".");
  let payloadBytes;
  let signatureBytes;
  try {
    payloadBytes = base64UrlToBytes(payloadPart);
    signatureBytes = base64UrlToBytes(signaturePart);
  } catch {
    return { ok: false, code: "WEBSITE_ORDER_QUOTE_TOKEN_INVALID" };
  }
  if (signatureBytes.length !== 32 || payloadBytes.length > 2048) {
    return { ok: false, code: "WEBSITE_ORDER_QUOTE_TOKEN_INVALID" };
  }

  let signatureValid = false;
  try {
    signatureValid = await crypto.subtle.verify("HMAC", key, signatureBytes, payloadBytes);
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    return { ok: false, code: "WEBSITE_ORDER_QUOTE_TOKEN_INVALID" };
  }

  let claims;
  try {
    claims = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return { ok: false, code: "WEBSITE_ORDER_QUOTE_TOKEN_INVALID" };
  }
  if (!claims || typeof claims !== "object" || Array.isArray(claims) ||
      claims.v !== 1 ||
      typeof claims.quote_id !== "string" || !UUID_RE.test(claims.quote_id) ||
      typeof claims.issued_at !== "string" ||
      typeof claims.expires_at !== "string" ||
      typeof claims.fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(claims.fingerprint)) {
    return { ok: false, code: "WEBSITE_ORDER_QUOTE_TOKEN_INVALID" };
  }

  const issuedAtMs = Date.parse(claims.issued_at);
  const expiresAtMs = Date.parse(claims.expires_at);
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs) ||
      new Date(issuedAtMs).toISOString() !== claims.issued_at ||
      new Date(expiresAtMs).toISOString() !== claims.expires_at ||
      expiresAtMs - issuedAtMs !== DEFAULT_TTL_MS ||
      issuedAtMs > nowMs) {
    return { ok: false, code: "WEBSITE_ORDER_QUOTE_TOKEN_INVALID" };
  }
  if (nowMs >= expiresAtMs) {
    return { ok: false, code: "WEBSITE_ORDER_QUOTE_EXPIRED" };
  }

  const expectedFingerprint = await signHex(
    key,
    fingerprintInput(claims.quote_id, claims.issued_at, claims.expires_at, canonical),
  );
  if (expectedFingerprint !== claims.fingerprint) {
    return { ok: false, code: "WEBSITE_ORDER_QUOTE_STALE" };
  }
  return { ok: true, expiresAt: claims.expires_at };
}

export const WEBSITE_ORDER_QUOTE_TTL_MS = DEFAULT_TTL_MS;
