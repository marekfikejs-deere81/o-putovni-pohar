// Cloudflare Worker – HTTPS API turnaje O putovní pohár.
// Veřejné čtení bez přihlášení; každý zápis vyžaduje ověřenou identitu z Neon Auth a záznam v admin_user.
import { neon, Client } from '@neondatabase/serverless';
import { buildPublicModel } from '../../shared/public-model.js';
import { loadPublicRaw } from './queries.js';
import { ApiError } from './errors.js';
import {
  hashToken, isTokenShape, normalizeToken, adminLunchSettings, teamOrderView, submitTeamOrder, adminSaveOrder, adminListOrders, adminGenerateLinks,
} from './orders.js';
import { startOAuth, finishOAuth, gmailSend } from './gmail.js';
import { savePeriod, deletePeriod, setShootout, setLots, clearLots, setManualOrder, shiftSchedule, updateTeam, addTip, updateTip, moveTip, deleteTip, auditLog } from './results.js';
import { processOutbox, maybeQueueSummary, queueTest, mailStatus, adminMailAction } from './mail.js';
import { reportPdf } from './report.js';
import { savePropozicePdf, deletePropozicePdf, loadPropozicePdf, MAX_PDF } from './files.js';
import fontRegular from '../fonts/DejaVuSans.ttf';
import fontBold from '../fonts/DejaVuSans-Bold.ttf';
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
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-None-Match, Idempotency-Key, X-Order-Token, X-Filename',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'ETag, X-Revision, X-Server-Time',
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

/** Brzda proti hádání kódů objednávek: limit požadavků na IP (Workers Rate Limiting). */
async function orderRateLimit(request, env) {
  if (!env.ORDER_LIMIT) return;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const { success } = await env.ORDER_LIMIT.limit({ key: ip });
  if (!success) throw new ApiError(429, 'Příliš mnoho pokusů. Zkus to prosím za minutu znovu.');
}

/** Druhá brzda (spolehlivá): víc než 20 neplatných kódů z jedné IP za 10 minut → 429 na 10 minut. */
const ipHash = async (request) => (await hashToken(`ip:${request.headers.get('CF-Connecting-IP') || 'unknown'}`)).slice(0, 32);
async function orderFailGuard(request, env) {
  const [r] = await db(env)(`SELECT count(*)::int AS n FROM order_fail WHERE ip_hash = $1 AND at > now() - interval '10 minutes'`, [await ipHash(request)]);
  if (r.n >= 20) throw new ApiError(429, 'Příliš mnoho neplatných pokusů. Zkus to prosím za 10 minut znovu.');
}
async function withOrderFailLog(request, env, ctx, fn) {
  await orderFailGuard(request, env);
  try { return await fn(); }
  catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      const h = await ipHash(request);
      ctx.waitUntil(db(env)(`INSERT INTO order_fail (ip_hash) VALUES ($1)`, [h]).catch(() => {}));
    }
    throw e;
  }
}

async function orderTokenHash(request, env) {
  await orderRateLimit(request, env);
  const token = normalizeToken(request.headers.get('X-Order-Token'));
  if (!isTokenShape(token)) throw new ApiError(404, 'Odkaz pro objednávku neplatí. Požádej pořadatele o nový.');
  return hashToken(token);
}

// ---------- trasy ----------

async function publicModel(request, env) {
  const raw = await loadPublicRaw(db(env), TOURNAMENT_ID);
  const model = buildPublicModel(raw);
  const body = JSON.stringify(model);
  const etag = `"${model.revision}-${(await sha1(body)).slice(0, 16)}"`;
  const headers = { ETag: etag, 'X-Revision': String(model.revision), 'X-Server-Time': String(Date.now()), 'Cache-Control': 'no-cache' };
  const inm = (request.headers.get('If-None-Match') || '').split(',').map((s) => s.trim().replace(/^W\//, ''));
  if (inm.includes(etag)) {
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

/** Minuta dne turnaje v Praze; mimo den turnaje −1 (vše je „budoucí“). */
function tournamentMinute(env) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  const day = `${p.year}-${p.month}-${p.day}`;
  return day === (env.TOURNAMENT_DAY || '2026-12-28') ? Number(p.hour) * 60 + Number(p.minute) : -1;
}

/** Trasy správce pro výsledky a řízení turnaje. Vrací Response, nebo null. */
async function adminResultRoutes(request, env, ctx, url) {
  const R = [
    ['PUT', /^\/api\/admin\/matches\/(\d+)\/periods\/([12])$/, (q, a, m, b) => savePeriod(q, m[1], m[2], b, a)],
    ['DELETE', /^\/api\/admin\/matches\/(\d+)\/periods\/([12])$/, (q, a, m) => deletePeriod(q, m[1], m[2], a)],
    ['PUT', /^\/api\/admin\/matches\/(\d+)\/shootout$/, (q, a, m, b) => setShootout(q, m[1], b, a)],
    ['PUT', /^\/api\/admin\/lots\/([AB])$/, (q, a, m, b) => setLots(q, m[1], b, a)],
    ['DELETE', /^\/api\/admin\/lots\/([AB])$/, (q, a, m) => clearLots(q, m[1], a)],
    ['PUT', /^\/api\/admin\/manual-order$/, (q, a, m, b) => setManualOrder(q, b, a)],
    ['POST', /^\/api\/admin\/schedule\/preview$/, (q, a, m, b) => shiftSchedule(q, b, a, tournamentMinute(env), false)],
    ['POST', /^\/api\/admin\/schedule\/apply$/, (q, a, m, b) => shiftSchedule(q, b, a, tournamentMinute(env), true)],
    ['PUT', /^\/api\/admin\/teams\/(\d+)$/, (q, a, m, b) => updateTeam(q, m[1], b, a)],
    ['POST', /^\/api\/admin\/tips$/, (q, a, m, b) => addTip(q, b, a)],
    ['DELETE', /^\/api\/admin\/tips\/(\d+)$/, (q, a, m) => deleteTip(q, m[1], a)],
    ['PUT', /^\/api\/admin\/tips\/(\d+)$/, (q, a, m, b) => updateTip(q, m[1], b, a)],
    ['POST', /^\/api\/admin\/tips\/(\d+)\/move$/, (q, a, m, b) => moveTip(q, m[1], Number(b?.dir), a)],
    ['GET', /^\/api\/admin\/audit$/, (q) => auditLog(q).then((rows) => ({ rows }))],
  ];
  for (const [method, re, fn] of R) {
    const m = url.pathname.match(re);
    if (!m || request.method !== method) continue;
    const admin = await requireAdmin(request, env);
    const body = ['PUT', 'POST'].includes(method) ? await readJson(request) : null;
    const res = await withClient(env, ctx, (q) => fn(q, `admin:${admin.email}`, m, body));
    return json(request, env, 200, res, { 'Cache-Control': 'no-store' });
  }
  return null;
}

/** Souhrn (pokud nastal čas) a odeslání splatné pošty. Volá cron každou hodinu (šetří výpočetní hodiny Neonu) a hned po každém zápisu. */
async function runMail(env, ctx) {
  try {
    await withClient(env, ctx, async (q) => {
      await maybeQueueSummary(q, env);
      await q(`DELETE FROM order_fail WHERE at < now() - interval '1 day'`);
      if (!env.GOOGLE_CLIENT_ID || !env.TOKEN_ENCRYPTION_KEY) return;
      const [acc] = await q(`SELECT 1 FROM oauth_account WHERE provider = 'google'`);
      if (!acc) return;
      await processOutbox(q, env, (msg) => gmailSend(env, q, msg));
    });
  } catch (e) {
    console.error(JSON.stringify({ msg: 'mail run failed', error: String(e?.message || e) }));
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runMail(env, ctx));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { ...corsHeaders(request, env) } });
      }
      if (url.pathname === '/api/health' && request.method === 'GET') return await health(request, env);
      if (url.pathname === '/api/public' && request.method === 'GET') return await publicModel(request, env);
      if (url.pathname === '/api/propozice.pdf' && request.method === 'GET') {
        const f = await loadPropozicePdf(db(env));
        if (!f) throw new ApiError(404, 'PDF propozic zatím není k dispozici.');
        return new Response(f.bytes, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf', ...SECURITY_HEADERS, ...corsHeaders(request, env),
            'Content-Disposition': `inline; filename="propozice.pdf"; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
            'Cache-Control': 'public, max-age=60',
          },
        });
      }
      if (url.pathname === '/api/admin/propozice-pdf' && request.method === 'PUT') {
        const admin = await requireAdmin(request, env);
        if (Number(request.headers.get('Content-Length') || 0) > MAX_PDF) throw new ApiError(413, 'PDF je větší než 8 MB.');
        const bytes = new Uint8Array(await request.arrayBuffer());
        let name = 'propozice.pdf';
        try { name = decodeURIComponent(request.headers.get('X-Filename') || name); } catch {}
        const res = await withClient(env, ctx, (q) => savePropozicePdf(q, bytes, name, `admin:${admin.email}`));
        return json(request, env, 200, res, { 'Cache-Control': 'no-store' });
      }
      if (url.pathname === '/api/admin/propozice-pdf' && request.method === 'DELETE') {
        const admin = await requireAdmin(request, env);
        const res = await withClient(env, ctx, (q) => deletePropozicePdf(q, `admin:${admin.email}`));
        return json(request, env, 200, res, { 'Cache-Control': 'no-store' });
      }
      if (url.pathname === '/api/report.pdf' && request.method === 'GET') {
        const r = await reportPdf(db(env), { regular: fontRegular, bold: fontBold });
        if (!r) throw new ApiError(404, 'Zápis turnaje bude k dispozici po potvrzení vítěze finále.');
        return new Response(r.bytes, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf', ...SECURITY_HEADERS, ...corsHeaders(request, env),
            'Content-Disposition': 'attachment; filename="zapis-o-putovni-pohar-2026.pdf"',
            'Cache-Control': 'no-cache', 'X-Revision': String(r.revision),
          },
        });
      }
      // --- objednávka týmu (token v hlavičce, ne v URL) ---
      if (url.pathname === '/api/order' && request.method === 'GET') {
        const view = await withOrderFailLog(request, env, ctx, async () => {
          const h = await orderTokenHash(request, env);
          return withClient(env, ctx, (q) => teamOrderView(q, h, new Date().toISOString()));
        });
        return json(request, env, 200, view, { 'Cache-Control': 'no-store' });
      }
      if (url.pathname === '/api/order' && request.method === 'POST') {
        const body = await readJson(request);
        const idem = request.headers.get('Idempotency-Key');
        const res = await withOrderFailLog(request, env, ctx, async () => {
          const h = await orderTokenHash(request, env);
          return withClient(env, ctx, (q) => submitTeamOrder(q, h, body, idem, new Date().toISOString()));
        });
        ctx.waitUntil(runMail(env, ctx));
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
        const { rows, prices } = await withClient(env, ctx, async (q) => {
          const [p] = await q(`SELECT lunch_price_player_czk AS player, lunch_price_staff_czk AS staff, lunch_menu AS menu FROM tournament LIMIT 1`);
          return { rows: await adminListOrders(q), prices: p };
        });
        return json(request, env, 200, { orders: rows, prices }, { 'Cache-Control': 'no-store' });
      }
      const m = url.pathname.match(/^\/api\/admin\/orders\/([A-Z]{2,4})$/);
      if (m && request.method === 'PUT') {
        const admin = await requireAdmin(request, env);
        const body = await readJson(request);
        const res = await withClient(env, ctx, (q) => adminSaveOrder(q, m[1], body, `admin:${admin.email}`, new Date().toISOString()));
        ctx.waitUntil(runMail(env, ctx));
        return json(request, env, 200, res, { 'Cache-Control': 'no-store' });
      }
      if (url.pathname === '/api/admin/lunch-settings' && request.method === 'PUT') {
        const admin = await requireAdmin(request, env);
        const body = await readJson(request);
        const res = await withClient(env, ctx, (q) => adminLunchSettings(q, body, `admin:${admin.email}`));
        return json(request, env, 200, res, { 'Cache-Control': 'no-store' });
      }
      if (url.pathname === '/api/admin/order-links' && request.method === 'POST') {
        const admin = await requireAdmin(request, env);
        const body = await readJson(request);
        const keys = Array.isArray(body?.keys) ? body.keys.filter((k) => /^[A-Z]{2,4}$/.test(k)) : null;
        const links = await withClient(env, ctx, (q) => adminGenerateLinks(q, keys, `admin:${admin.email}`, new Date().toISOString()));
        return json(request, env, 200, { links }, { 'Cache-Control': 'no-store' });
      }
      // --- pošta ---
      if (url.pathname === '/api/admin/gmail/callback' && request.method === 'GET') {
        const admin = `${env.PUBLIC_ORIGIN || env.AUTH_ORIGIN}${env.ADMIN_PATH}`;
        try {
          const r = await withClient(env, ctx, (q) => finishOAuth(env, q, request.url));
          return Response.redirect(`${admin}?gmail=ok&email=${encodeURIComponent(r.email)}`, 302);
        } catch (e) {
          const msg = e instanceof ApiError ? e.message : 'Párování Gmailu se nepovedlo.';
          return Response.redirect(`${admin}?gmail=error&msg=${encodeURIComponent(msg)}`, 302);
        }
      }
      if (url.pathname === '/api/admin/gmail/start' && request.method === 'POST') {
        await requireAdmin(request, env);
        return json(request, env, 200, await withClient(env, ctx, (q) => startOAuth(env, q, request.url)));
      }
      if (url.pathname === '/api/admin/mail' && request.method === 'GET') {
        await requireAdmin(request, env);
        const st = await withClient(env, ctx, (q) => mailStatus(q));
        return json(request, env, 200, { ...st, mode: env.MAIL_MODE || 'test', testRecipients: env.MAIL_TEST_RECIPIENTS || '', summaryAt: env.SUMMARY_AT || '2026-12-13T07:00:00Z' }, { 'Cache-Control': 'no-store' });
      }
      if (url.pathname === '/api/admin/mail/test' && request.method === 'POST') {
        const admin = await requireAdmin(request, env);
        const body = await readJson(request);
        await withClient(env, ctx, (q) => queueTest(q, body?.kind === 'summary' ? 'summary' : 'mail', admin.email));
        ctx.waitUntil(runMail(env, ctx));
        return json(request, env, 200, { ok: true });
      }
      const mm = url.pathname.match(/^\/api\/admin\/mail\/(\d+)\/(retry|mark-sent)$/);
      if (mm && request.method === 'POST') {
        const admin = await requireAdmin(request, env);
        const r = await withClient(env, ctx, (q) => adminMailAction(q, Number(mm[1]), mm[2], `admin:${admin.email}`));
        if (!r.ok) throw new ApiError(409, 'Tuto zprávu teď nelze takto změnit.');
        ctx.waitUntil(runMail(env, ctx));
        return json(request, env, 200, r);
      }

      const resultRes = await adminResultRoutes(request, env, ctx, url);
      if (resultRes) return resultRes;

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
