const SUPABASE_URL = 'https://adkrxfnawdiljhjaavnj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_89MQIj_drF15IrF05ZLt0w_txUjPMxy';
const SIGN_PATH = '/api/qz/sign';
const CERTIFICATE_PATH = '/qz/digital-certificate.txt';
const MAX_REQUEST_CHARACTERS = 262144;
const RATE_LIMIT_PER_MINUTE = 90;
const ALLOWED_ORIGINS = new Set([
  'https://flamechick-pos.vercel.app',
  'https://flamechicpos.vercel.app',
  'https://flamechickpos.vercel.app',
  'https://flame-chick-pos-production-two.vercel.app',
  'https://flame-chick-pos-production.vercel.app',
  'https://flamechickpos.itsfahadahmed1234.workers.dev'
]);
const rateBuckets = new Map();
const utf8 = new TextEncoder();

function isAllowedOrigin(value) {
  if (!value) return false;
  if (ALLOWED_ORIGINS.has(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value && !url.port &&
      !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && (
        /^flamechickpos-[a-z0-9-]+-befahad1234-7050\.vercel\.app$/i.test(url.hostname) ||
        /^flame-chick-pos-production-[a-z0-9-]+-befahad1234-7050\.vercel\.app$/i.test(url.hostname) ||
        /^flame-chick-pos-production-[a-z0-9-]+-fahad-7455\.vercel\.app$/i.test(url.hostname) ||
        /^flame-chick-pos-development-[a-z0-9-]+-faha-d\.vercel\.app$/i.test(url.hostname)
      );
  } catch { return false; }
}
function response(body, status, origin) {
  const headers = new Headers({
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff'
  });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Expose-Headers', 'X-QZ-Signature-Verified');
  }
  return new Response(body, { status, headers });
}
function rateLimited(request) {
  const ip = String(request.headers.get('CF-Connecting-IP') || 'unknown');
  const now = Date.now(), cutoff = now - 60000;
  const current = (rateBuckets.get(ip) || []).filter(stamp => stamp > cutoff);
  if (current.length >= RATE_LIMIT_PER_MINUTE) return true;
  current.push(now);
  rateBuckets.set(ip, current);
  if (rateBuckets.size > 500) {
    for (const [key, stamps] of rateBuckets) if (!stamps.some(stamp => stamp > cutoff)) rateBuckets.delete(key);
  }
  return false;
}
async function readLimitedBody(request) {
  const advertised = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(advertised) && advertised > MAX_REQUEST_CHARACTERS) return null;
  if (!request.body) return '';
  const reader = request.body.getReader(), chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_CHARACTERS) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
}
function derTlv(bytes, offset) {
  if (offset >= bytes.length) throw new Error('Invalid certificate DER');
  const start = offset, tag = bytes[offset++];
  if (offset >= bytes.length) throw new Error('Invalid certificate DER length');
  let length = bytes[offset++];
  if (length & 128) {
    const n = length & 127;
    if (!n || n > 4 || offset + n > bytes.length) throw new Error('Unsupported DER length');
    length = 0;
    for (let i = 0; i < n; i++) length = length * 256 + bytes[offset++];
  }
  const valueStart = offset, end = offset + length;
  if (end > bytes.length) throw new Error('Truncated certificate DER');
  return { tag, start, valueStart, end };
}
function derChildren(bytes, parent) {
  const out = [];
  for (let offset = parent.valueStart; offset < parent.end;) {
    const child = derTlv(bytes, offset);
    if (child.end > parent.end) throw new Error('Invalid nested DER');
    out.push(child); offset = child.end;
  }
  return out;
}
function fromBase64(value) {
  const binary = atob(value.replace(/\s+/g, '')), out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function leafPem(bundle) {
  const begin = '-----BEGIN CERTIFICATE-----', end = '-----END CERTIFICATE-----';
  const start = String(bundle || '').indexOf(begin);
  if (start < 0) return null;
  const finish = String(bundle).indexOf(end, start + begin.length);
  return finish < 0 ? null : String(bundle).slice(start, finish + end.length);
}
function certificateSpki(pem) {
  const match = String(pem).match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
  if (!match) throw new Error('Invalid public QZ certificate');
  const der = fromBase64(match[1]), root = derTlv(der, 0);
  if (root.tag !== 48 || root.end !== der.length) throw new Error('Invalid certificate DER');
  const certFields = derChildren(der, root), tbs = certFields[0];
  if (!tbs || tbs.tag !== 48) throw new Error('Missing TBSCertificate');
  const fields = derChildren(der, tbs), index = fields[0]?.tag === 160 ? 1 : 0;
  const spki = fields[index + 5];
  if (!spki || spki.tag !== 48) throw new Error('Missing certificate public key');
  return der.slice(spki.start, spki.end);
}
function privatePkcs8(pem) {
  const match = String(pem || '').replace(/\\n/g, '\n').match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
  if (!match) throw new Error('QZ signing key must be PKCS#8 PEM');
  return fromBase64(match[1]);
}
async function sign(request, env) {
  const origin = String(request.headers.get('Origin') || '');
  if (!isAllowedOrigin(origin)) return response('Origin is not allowed.', 403);
  if (request.method === 'OPTIONS') return response(null, 204, origin);
  if (request.method !== 'POST') {
    const res = response('Method not allowed.', 405, origin);
    res.headers.set('Allow', 'POST, OPTIONS'); return res;
  }
  if (rateLimited(request)) return response('Too many signing requests. Try again shortly.', 429, origin);
  const token = String(request.headers.get('Authorization') || '').match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token) return response('A signed-in POS staff session is required.', 401, origin);
  const raw = await readLimitedBody(request);
  if (raw === null) return response('Invalid QZ signing request.', 400, origin);
  let body;
  try { body = JSON.parse(raw); } catch { body = null; }
  const text = body && typeof body.request === 'string' ? body.request : '';
  if (!text || text.length > MAX_REQUEST_CHARACTERS) return response('Invalid QZ signing request.', 400, origin);
  try {
    const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, Accept: 'application/json' };
    const userResponse = await fetch(SUPABASE_URL + '/auth/v1/user', { method: 'GET', headers, cache: 'no-store' });
    if (!userResponse.ok) return response('The POS staff session is invalid or expired.', 401, origin);
    const user = await userResponse.json();
    if (!user?.id) return response('The POS staff session could not be verified.', 401, origin);
    const roleResponse = await fetch(SUPABASE_URL + '/functions/v1/flame-chick-order-api?view=staff_context', { method: 'GET', headers, cache: 'no-store' });
    if (!roleResponse.ok) return response('Active Flame Chick POS staff access is required.', 403, origin);
    const context = await roleResponse.json(), staff = context?.staff, role = String(staff?.role || '').toLowerCase();
    if (context?.ok !== true || !staff || staff.user_id !== user.id ||
        !['admin', 'owner', 'manager', 'cashier'].includes(role) ||
        typeof staff.branch_id !== 'string' || !staff.branch_id) {
      return response('This account does not have active Flame Chick POS access.', 403, origin);
    }
    const keyPem = String(env.QZ_SIGNING_PRIVATE_KEY || '');
    if (!keyPem.includes('BEGIN PRIVATE KEY')) return response('The QZ signing key is not configured on the POS server.', 503, origin);
    const certResponse = await env.ASSETS.fetch(new Request(new URL(CERTIFICATE_PATH, request.url), { headers: { Accept: 'text/plain' } }));
    if (!certResponse.ok) return response('The public QZ signing certificate is unavailable on the POS server.', 503, origin);
    const certificate = leafPem(await certResponse.text());
    if (!certificate) return response('The public QZ signing certificate is unavailable on the POS server.', 503, origin);
    const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' };
    const privateKey = await crypto.subtle.importKey('pkcs8', privatePkcs8(keyPem), algorithm, false, ['sign']);
    const publicKey = await crypto.subtle.importKey('spki', certificateSpki(certificate), algorithm, false, ['verify']);
    const bytes = utf8.encode(text);
    const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, bytes));
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, bytes)) {
      console.error('QZ signer key/certificate mismatch.');
      return response('The configured QZ signing key does not match the public signing certificate.', 503, origin);
    }
    const result = response(toBase64(signature), 200, origin);
    result.headers.set('X-QZ-Signature-Verified', 'true');
    result.headers.set('Content-Type', 'text/plain; charset=utf-8');
    return result;
  } catch (error) {
    console.error('QZ signer failed:', error?.name || 'UnknownError');
    return response('The POS signing service could not sign this print request.', 500, origin);
  }
}
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === SIGN_PATH) return sign(request, env);
    return env.ASSETS.fetch(request);
  }
};
