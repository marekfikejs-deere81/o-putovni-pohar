// Přihlášení správce přes server (proxy na Neon Auth / Better Auth).
// Prohlížeč nikdy nemluví s doménou neonauth přímo – cookie třetí strany by Safari zablokovalo.
// Session cookie Neon Auth drží klient jako neprůhledný „admin session“ řetězec a posílá ho v Authorization.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ApiError } from './errors.js';

const COOKIE = '__Secure-neon-auth.session_token';
const jwksCache = new Map();
const jwtCache = new Map(); // sha256(session) → { jwt, sub, email, exp }

function authBase(env) {
  if (!env.NEON_AUTH_URL) throw new ApiError(503, 'Přihlášení správce zatím není nastavené.');
  return env.NEON_AUTH_URL.replace(/\/$/, '');
}

const authHeaders = (env, extra = {}) => ({
  Origin: env.AUTH_ORIGIN || 'https://marekfikejs-deere81.github.io',
  'Content-Type': 'application/json',
  ...extra,
});

async function sha(text) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Hodnota session cookie z odpovědi Neon Auth. */
function sessionFromSetCookie(res) {
  const all = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
  for (const c of all) {
    const m = c.match(new RegExp(`${COOKIE.replace(/[.]/g, '\\.')}=([^;]+)`));
    if (m) return m[1];
  }
  return null;
}

async function verifyJwt(env, jwt) {
  const base = authBase(env);
  const origin = new URL(base).origin;
  if (!jwksCache.has(base)) jwksCache.set(base, createRemoteJWKSet(new URL(`${base}/.well-known/jwks.json`)));
  const { payload } = await jwtVerify(jwt, jwksCache.get(base), { issuer: origin, audience: origin });
  return payload;
}

/** Vymění session za krátkodobý JWT a ověří jeho podpis, vydavatele, příjemce a platnost. */
async function identityFromSession(env, session) {
  if (!session || session.length > 600 || /[\s;]/.test(session)) throw new ApiError(401, 'Pro tuto akci se přihlas jako správce.');
  const key = await sha(session);
  const hit = jwtCache.get(key);
  const now = Math.floor(Date.now() / 1000);
  if (hit && hit.exp - 30 > now) return hit;
  const res = await fetch(`${authBase(env)}/token`, { headers: authHeaders(env, { Cookie: `${COOKIE}=${session}` }) });
  if (res.status === 401) throw new ApiError(401, 'Přihlášení vypršelo. Přihlas se znovu.');
  if (!res.ok) throw new ApiError(502, 'Přihlašovací služba neodpovídá. Zkus to za chvíli.');
  const { token } = await res.json();
  let payload;
  try {
    payload = await verifyJwt(env, token);
  } catch {
    throw new ApiError(401, 'Přihlášení není platné. Přihlas se znovu.');
  }
  const id = { sub: String(payload.sub), email: String(payload.email || ''), exp: payload.exp };
  jwtCache.set(key, id);
  if (jwtCache.size > 50) jwtCache.delete(jwtCache.keys().next().value);
  return id;
}

/** Ověří správce z hlavičky Authorization: Bearer <session>. Vrací { sub, email }. */
export async function requireAdmin(request, env, q) {
  const auth = request.headers.get('Authorization') || '';
  const session = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!session) throw new ApiError(401, 'Pro tuto akci se přihlas jako správce.');
  const id = await identityFromSession(env, session);
  const rows = await q('SELECT email FROM admin_user WHERE auth_user_id = $1', [id.sub]);
  if (!rows.length) throw new ApiError(403, 'Tento účet nemá oprávnění správce.');
  return { sub: id.sub, email: rows[0].email };
}

/** Přihlášení e-mailem a heslem. Session vrátí jen správci. */
export async function login(env, q, body) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password || password.length > 200) throw new ApiError(400, 'Vyplň e-mail a heslo.');
  const res = await fetch(`${authBase(env)}/sign-in/email`, {
    method: 'POST', headers: authHeaders(env), body: JSON.stringify({ email, password }),
  });
  if (res.status === 401 || res.status === 400) throw new ApiError(401, 'Nesprávný e-mail nebo heslo.');
  if (res.status === 429) throw new ApiError(429, 'Příliš mnoho pokusů. Zkus to za několik minut.');
  if (!res.ok) throw new ApiError(502, 'Přihlašovací služba neodpovídá. Zkus to za chvíli.');
  const session = sessionFromSetCookie(res);
  if (!session) throw new ApiError(502, 'Přihlašovací služba nevrátila relaci.');
  const id = await identityFromSession(env, session);
  const rows = await q('SELECT email FROM admin_user WHERE auth_user_id = $1', [id.sub]);
  if (!rows.length) {
    await logout(env, session).catch(() => {});
    throw new ApiError(403, 'Tento účet nemá oprávnění správce.');
  }
  return { session, email: rows[0].email };
}

export async function logout(env, session) {
  if (!session) return;
  jwtCache.delete(await sha(session));
  await fetch(`${authBase(env)}/sign-out`, {
    method: 'POST', headers: authHeaders(env, { Cookie: `${COOKIE}=${session}` }), body: '{}',
  });
}

/** Odeslání odkazu pro obnovu hesla (Neon Auth pošle e-mail). Odpověď neprozrazuje, zda účet existuje. */
export async function requestPasswordReset(env, body) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) throw new ApiError(400, 'Vyplň e-mail.');
  const redirectTo = `${env.PUBLIC_ORIGIN || env.AUTH_ORIGIN}${env.ADMIN_PATH || '/admin.html'}`;
  await fetch(`${authBase(env)}/request-password-reset`, {
    method: 'POST', headers: authHeaders(env), body: JSON.stringify({ email, redirectTo }),
  }).catch(() => {});
  return { ok: true };
}

/** Nastavení nového hesla tokenem z e-mailu. */
export async function resetPassword(env, body) {
  const token = typeof body?.token === 'string' ? body.token : '';
  const newPassword = typeof body?.password === 'string' ? body.password : '';
  if (!token || newPassword.length < 10) throw new ApiError(400, 'Heslo musí mít aspoň 10 znaků.');
  const res = await fetch(`${authBase(env)}/reset-password`, {
    method: 'POST', headers: authHeaders(env), body: JSON.stringify({ token, newPassword }),
  });
  if (!res.ok) throw new ApiError(400, 'Odkaz pro obnovu hesla vypršel nebo už byl použit. Požádej o nový.');
  return { ok: true };
}

/** Registrace vlastníka (jen dokud v admin_user nikdo není – pak ji API odmítá). */
export async function signUpOwner(env, q, body) {
  const [{ n }] = await q('SELECT count(*)::int AS n FROM admin_user');
  if (n > 0) throw new ApiError(403, 'Registrace je uzavřená.');
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const allowed = (env.OWNER_EMAIL || '').toLowerCase();
  if (!allowed || email !== allowed) throw new ApiError(403, 'Registrace je povolena jen pro e-mail pořadatele.');
  if (password.length < 10 || password.length > 200) throw new ApiError(400, 'Heslo musí mít aspoň 10 znaků.');
  const res = await fetch(`${authBase(env)}/sign-up/email`, {
    method: 'POST', headers: authHeaders(env), body: JSON.stringify({ email, password, name: 'Pořadatel' }),
  });
  if (res.status === 422 || res.status === 400) {
    const d = await res.json().catch(() => ({}));
    if (/exist/i.test(d.code || d.message || '')) throw new ApiError(409, 'Účet už existuje. Přihlas se, nebo použij obnovu hesla.');
    throw new ApiError(400, 'Registrace se nepovedla. Zkontroluj heslo (aspoň 10 znaků).');
  }
  if (!res.ok) throw new ApiError(502, 'Přihlašovací služba neodpovídá. Zkus to za chvíli.');
  return { ok: true };
}
