/**
 * BettingComp "fasit" backend — Cloudflare Worker + KV.
 *
 * Stores the admin-settled truth (bonus correct answers, per-player overrides,
 * point adjustments, scoring rules, knockout phases) so every participant's app
 * sees the same settlement. The admin password is verified HERE (env secret),
 * never in the browser, which is the whole point of having a backend.
 *
 * Routes:
 *   GET  /fasit   -> public; returns the stored JSON (or "{}")
 *   PUT  /fasit   -> admin; header X-Admin-Password must equal env.ADMIN_PASSWORD;
 *                    body is the fasit JSON, stored to KV
 *   POST /verify  -> admin; 200 if password matches, 401 otherwise (for login UX)
 *
 * Bindings (see wrangler.toml): KV namespace `FASIT`, secret `ADMIN_PASSWORD`.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Password',
  'Access-Control-Max-Age': '86400',
};

const json = (status, body) =>
  new Response(body, { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const text = (status, body) =>
  new Response(body, { status, headers: CORS });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return text(204, null);

    const authed = (req.headers.get('X-Admin-Password') || '') === (env.ADMIN_PASSWORD || '\0');

    if (url.pathname === '/fasit' && req.method === 'GET') {
      const v = await env.FASIT.get('fasit');
      return json(200, v || '{}');
    }

    if (url.pathname === '/fasit' && req.method === 'PUT') {
      if (!authed) return text(401, 'Unauthorized');
      const body = await req.text();
      try { JSON.parse(body); } catch { return text(400, 'Invalid JSON'); }
      await env.FASIT.put('fasit', body);
      return text(200, 'OK');
    }

    if (url.pathname === '/verify' && req.method === 'POST') {
      return text(authed ? 200 : 401, authed ? 'OK' : 'Unauthorized');
    }

    return text(404, 'Not found');
  },
};
