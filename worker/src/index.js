// Cloudflare Worker – HTTPS API turnaje O putovní pohár.
// Veřejné čtení bez přihlášení; každý zápis vyžaduje ověřenou identitu z Neon Auth a záznam v admin_user.
import { neon, Client } from '@neondatabase/serverless';
import { buildPublicModel } from '../../shared/public-model.js';
import { loadPublicRaw } from './queries.js';
import { ApiError } from './errors.js';
import {
  hashToken, isTokenShape, teamOrderView, submitTeamOrder, adminSaveOrder, adminListOrders, adminGenerateLinks,
} from './orders.js';
import { requireAdmin as requireAdminSession, login, logout, requestPasswordReset, resetPassword, signUpOwner } from './auth.js';

const requireAdmin = (request, env) => requireAdminSession(request, env, db(env));

const TOURNAMENT_ID = 'vlasim-2026';

// ---------- pomocné funkce ----------

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-None-Match, Idempotency-Key, X-Order-Token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'ETag, X-Revision',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000',
};

function json(request, env, status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...corsHeaders(request, env), ...extra },
  });
}


async function sha1(text) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function db(env) {
  if (!env.DATABASE_URL) throw new ApiError(503, 'Databáze není nastavená.');
  const sql = neon(env.DATABASE_URL);
  return (text, params = []) => sql.query(text, params);
}

/** Jedno připojení přes WebSocket – nutné pro transakce (zápisy). */
async function withClient(env, ctx, fn) {
  if (!env.DATABASE_URL) throw new ApiError(503, 'Databáze není nastavená.');
  const client = new Client(env.DATABASE_URL);
  await client.connect();
  try {
    return await fn(async (text, params = []) => (await client.query(text, params)).rows);
  } finally {
    ctx.waitUntil(client.end());
  }
}

async function readJson(request) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > 10_000) throw new ApiError(413, 'Požadavek je příliš velký.');
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, 'Neplatná data formuláře.');
  }
}

async function orderTokenHash(request) {
  const token = request.headers.get('X-Order-Token');
  if (!isTokenShape(token)) throw new ApiError(404, 'Odkaz pro objednávku neplatí. Požádej pořadatele o nový.');
  return hashToken(token);
}

// ---------- trasy ----------

async function publicModel(request, env) {
  const raw = await loadPublicRaw(db(env), TOURNAMENT_ID);
  const model = buildPublicModel(raw);
  const body = JSON.stringify(model);
  const etag = `"${model.revision}-${(await sha1(body)).slice(0, 16)}"`;
  const headers = { ETag: etag, 'X-Revision': String(model.revision), 'Cache-Control': 'no-cache' };
  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers: { ...SECURITY_HEADERS, ...corsHeaders(request, env), ...headers } });
  }
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...corsHeaders(request, env), ...headers },
  });
}

async function health(request, env) {
  const started = Date.now();
  const [r] = await db(env)('SELECT revision::text AS revision, (SELECT count(*)::int FROM team) AS teams FROM tournament WHERE id = $1', [TOURNAMENT_ID]);
  return json(request, env, 200, {
    ok: true, env: env.ENVIRONMENT || 'unknown', revision: Number(r?.revision ?? -1), teams: r?.teams ?? 0,
    dbMs: Date.now() - started, auth: Boolean(env.NEON_AUTH_URL), time: new Date().toISOString(),
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { ...corsHeaders(request, env) } });
      }
      if (url.pathname === '/api/health' && request.method === 'GET') return await health(request, env);
      if (url.pathname === '/api/public' && request.method === 'GET') return await publicModel(request, env);
      // --- objednávka týmu (token v hlavičce, ne v URL) ---
      if (url.pathname === '/api/order' && request.method === 'GET') {
        const h = await orderTokenHash(request);
        const view = await withClient(env, ctx, (q) => teamOrderView(q, h, new Date().toISOString()));
        return json(request, env, 200, view, { 'Cache-Control': 'no-store' });
      }
      if (url.pathname === '/api/order' && request.method === 'POST') {
        const h = await orderTokenHash(request);
        const body = await readJson(request);
        const idem = request.headers.get('Idempotency-Key');
        const res = await withClient(env, ctx, (q) => submitTeamOrder(q, h, body, idem, new Date().toISOString()));
        return json(request, env, 200, res, { 'Cache-Control': 'no-store' });
      }

      // --- přihlášení správce (proxy na Neon Auth) ---
      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        const res = await login(env, db(env), await readJson(request));
        return json(request, env, 200, res, { 'Cache-Control': 'no-store' });
      }
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        const a = request.headers.get('Authorization') || '';
        await logout(env, a.startsWith('Bearer ') ? a.slice(7).trim() : '').catch(() => {});
        return json(request, env, 200, { ok: true });
      }
      if (url.pathname === '/api/auth/signup-owner' && request.method === 'POST') {
        return json(request, env, 200, await signUpOwner(env, db(env), await readJson(request)));
      }
      if (url.pathname === '/api/auth/password-reset/request' && request.method === 'POST') {
        return json(request, env, 200, await requestPasswordReset(env, await readJson(request)));
      }
      if (url.pathname === '/api/auth/password-reset' && request.method === 'POST') {
        return json(request, env, 200, await resetPassword(env, await readJson(request)));
      }

      // --- správce ---
      if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
        await requireAdmin(request, env);
        const rows = await withClient(env, ctx, (q) => adminListOrders(q));
        return json(request, env, 200, { orders: rows }, { 'Cache-Control': 'no-store' });
      }
      const m = url.pathname.match(/^\/api\/admin\/orders\/([A-Z]{2,4})$/);
      if (m && request.method === 'PUT') {
        const admin = await requireAdmin(request, env);
        const body = await readJson(request);
        const res = await withClient(env, ctx, (q) => adminSaveOrder(q, m[1], body, `admin:${admin.email}`, new Date().toISOString()));
        return json(request, env, 200, res, { 'Cache-Control': 'no-store' });
      }
      if (url.pathname === '/api/admin/order-links' && request.method === 'POST') {
        const admin = await requireAdmin(request, env);
        const body = await readJson(request);
        const keys = Array.isArray(body?.keys) ? body.keys.filter((k) => /^[A-Z]{2,4}$/.test(k)) : null;
        const links = await withClient(env, ctx, (q) => adminGenerateLinks(q, keys, `admin:${admin.email}`, new Date().toISOString()));
        return json(request, env, 200, { links }, { 'Cache-Control': 'no-store' });
      }
      if (url.pathname === '/api/admin/me' && request.method === 'GET') {
        const admin = await requireAdmin(request, env);
        return json(request, env, 200, { email: admin.email });
      }
      if (url.pathname.startsWith('/api/admin/')) {
        await requireAdmin(request, env);
        throw new ApiError(404, 'Neznámá akce.');
      }
      throw new ApiError(404, 'Stránka neexistuje.');
    } catch (e) {
      if (e instanceof ApiError) return json(request, env, e.status, { error: e.message, ...(e.data || {}) });
      console.error(JSON.stringify({ msg: 'unhandled', path: url.pathname, error: String(e?.message || e) }));
      return json(request, env, 500, { error: 'Na serveru došlo k chybě. Zkus to prosím znovu.' });
    }
  },
};
