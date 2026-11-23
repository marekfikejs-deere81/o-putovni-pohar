// Cloudflare Worker – HTTPS API turnaje O putovní pohár.
// Veřejné čtení bez přihlášení; každý zápis vyžaduje ověřenou identitu z Neon Auth a záznam v admin_user.
import { neon } from '@neondatabase/serverless';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { buildPublicModel } from '../../shared/public-model.js';
import { loadPublicRaw } from './queries.js';

const TOURNAMENT_ID = 'vlasim-2026';

// ---------- pomocné funkce ----------

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-None-Match, Idempotency-Key',
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

/** Chyba pro uživatele: česká hláška, bez vnitřních detailů. */
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
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

// ---------- ověření správce ----------

let jwks;
async function requireAdmin(request, env) {
  if (!env.NEON_AUTH_JWKS_URL) throw new ApiError(401, 'Přihlášení správce zatím není nastavené.');
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw new ApiError(401, 'Pro tuto akci se přihlas jako správce.');
  jwks ||= createRemoteJWKSet(new URL(env.NEON_AUTH_JWKS_URL));
  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, {
      ...(env.NEON_AUTH_ISSUER ? { issuer: env.NEON_AUTH_ISSUER } : {}),
      ...(env.NEON_AUTH_AUDIENCE ? { audience: env.NEON_AUTH_AUDIENCE } : {}),
    }));
  } catch {
    throw new ApiError(401, 'Přihlášení vypršelo nebo není platné. Přihlas se znovu.');
  }
  const rows = await db(env)('SELECT auth_user_id, email FROM admin_user WHERE auth_user_id = $1', [String(payload.sub)]);
  if (!rows.length) throw new ApiError(403, 'Tento účet nemá oprávnění správce.');
  return rows[0];
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
    dbMs: Date.now() - started, auth: Boolean(env.NEON_AUTH_JWKS_URL), time: new Date().toISOString(),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { ...corsHeaders(request, env) } });
      }
      if (url.pathname === '/api/health' && request.method === 'GET') return await health(request, env);
      if (url.pathname === '/api/public' && request.method === 'GET') return await publicModel(request, env);
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
      if (e instanceof ApiError) return json(request, env, e.status, { error: e.message });
      console.error(JSON.stringify({ msg: 'unhandled', path: url.pathname, error: String(e?.message || e) }));
      return json(request, env, 500, { error: 'Na serveru došlo k chybě. Zkus to prosím znovu.' });
    }
  },
};
