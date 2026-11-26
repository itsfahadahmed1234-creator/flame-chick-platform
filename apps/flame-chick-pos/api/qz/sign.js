'use strict';

const crypto = require('node:crypto');

const SUPABASE_URL = 'https://adkrxfnawdiljhjaavnj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_89MQIj_drF15IrF05ZLt0w_txUjPMxy';
const ALLOWED_ORIGINS = new Set([
  'https://flamechicpos.vercel.app',
  'https://flamechickpos.vercel.app',
  'https://flame-chick-pos-production-two.vercel.app',
  'https://flame-chick-pos-production.vercel.app'
]);
const rateBuckets = new Map();

function allowedOrigin(value) {
  if (!value) return false;
  if (ALLOWED_ORIGINS.has(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (
      /^flamechickpos-[a-z0-9-]+-befahad1234-7050\.vercel\.app$/i.test(url.hostname) ||
      /^flame-chick-pos-production-[a-z0-9-]+-fahad-7455\.vercel\.app$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}

function rateLimit(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || 'unknown';
  const now = Date.now();
  const cutoff = now - 60_000;
  const current = (rateBuckets.get(ip) || []).filter(stamp => stamp > cutoff);
  if (current.length >= 90) return false;
  current.push(now);
  rateBuckets.set(ip, current);
  if (rateBuckets.size > 500) {
    for (const [key, stamps] of rateBuckets) {
      if (!stamps.some(stamp => stamp > cutoff)) rateBuckets.delete(key);
    }
  }
  return true;
}

module.exports = async function handler(req, res) {
  const origin = String(req.headers.origin || '');
  if (!allowedOrigin(origin)) {
    res.status(403).send('Origin is not allowed.');
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).send('Method not allowed.');
    return;
  }
  if (!rateLimit(req)) {
    res.status(429).send('Too many signing requests. Try again shortly.');
    return;
  }

  const authorization = String(req.headers.authorization || '');
  const tokenMatch = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!tokenMatch) {
    res.status(401).send('A signed-in POS staff session is required.');
    return;
  }

  const body = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body); } catch { return null; } })()
    : req.body;
  const request = body && typeof body.request === 'string' ? body.request : '';
  if (!request || request.length > 262_144) {
    res.status(400).send('Invalid QZ signing request.');
    return;
  }

  try {
    const accessToken = tokenMatch[1];
    const userResponse = await fetch(SUPABASE_URL + '/auth/v1/user', {
      method: 'GET',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: 'Bearer ' + accessToken,
        Accept: 'application/json'
      },
      cache: 'no-store'
    });
    if (!userResponse.ok) {
      res.status(401).send('The POS staff session is invalid or expired.');
      return;
    }
    const user = await userResponse.json();
    if (!user || !user.id) {
      res.status(401).send('The POS staff session could not be verified.');
      return;
    }

    const roleResponse = await fetch(SUPABASE_URL + '/functions/v1/flame-chick-order-api?view=staff_context', {
      method: 'GET',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: 'Bearer ' + accessToken,
        Accept: 'application/json'
      },
      cache: 'no-store'
    });
    if (!roleResponse.ok) {
      res.status(403).send('Active Flame Chick POS staff access is required.');
      return;
    }
    const context = await roleResponse.json();
    const staff = context && context.staff;
    const role = String(staff && staff.role || '').toLowerCase();
    if (context?.ok !== true || !staff || staff.user_id !== user.id ||
        !['admin', 'owner', 'manager', 'cashier'].includes(role) ||
        typeof staff.branch_id !== 'string' || !staff.branch_id) {
      res.status(403).send('This account does not have active Flame Chick POS access.');
      return;
    }

    const pem = String(process.env.QZ_SIGNING_PRIVATE_KEY || '');
    if (!pem.includes('BEGIN PRIVATE KEY')) {
      res.status(503).send('The QZ signing key is not configured on the POS server.');
      return;
    }
    const privateKey = crypto.createPrivateKey(pem.replace(/\\n/g, '\n'));
    const signature = crypto.sign('RSA-SHA512', Buffer.from(request, 'utf8'), privateKey);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(signature.toString('base64'));
  } catch (error) {
    console.error('QZ signer failed:', error && error.name ? error.name : 'UnknownError');
    res.status(500).send('The POS signing service could not sign this print request.');
  }
};
