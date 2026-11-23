// Gmail přes serverový OAuth: párování, šifrované uložení obnovovacího tokenu, odeslání zprávy.
import { ApiError } from './errors.js';

const SCOPE = 'openid email https://www.googleapis.com/auth/gmail.send';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const callbackUrl = (requestUrl) => `${new URL(requestUrl).origin}/api/admin/gmail/callback`;

// ---------- šifrování (AES-GCM, klíč odvozený z Worker Secret) ----------

async function aesKey(secret) {
  if (!secret || secret.length < 32) throw new ApiError(503, 'Chybí šifrovací klíč pro Gmail.');
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(secret, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), new TextEncoder().encode(text)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv); out.set(ct, iv.length);
  return [...out].map((b) => b.toString(16).padStart(2, '0')).join(''); // hex pro decode($1,'hex')
}

export async function decrypt(secret, hex) {
  const bytes = new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await aesKey(secret), bytes.slice(12));
  return new TextDecoder().decode(pt);
}

// ---------- párování ----------

export async function startOAuth(env, q, requestUrl) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new ApiError(503, 'Google OAuth klient zatím není nastavený.');
  const state = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await q(`DELETE FROM oauth_state WHERE created_at < now() - interval '1 hour'`);
  await q(`INSERT INTO oauth_state (state) VALUES ($1)`, [state]);
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: callbackUrl(requestUrl), response_type: 'code',
    scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
    login_hint: env.OWNER_EMAIL || '', state,
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${p}` };
}

function decodeJwtPayload(jwt) {
  const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)));
}

/** Návrat z Google. Ověří state, vymění kód, ověří účet a uloží šifrovaný obnovovací token. */
export async function finishOAuth(env, q, requestUrl) {
  const u = new URL(requestUrl);
  if (u.searchParams.get('error')) throw new ApiError(400, 'Párování Gmailu bylo zrušeno.');
  const state = u.searchParams.get('state') || '';
  const code = u.searchParams.get('code') || '';
  const used = await q(`DELETE FROM oauth_state WHERE state = $1 AND created_at > now() - interval '15 minutes' RETURNING state`, [state]);
  if (!used.length || !code) throw new ApiError(400, 'Odkaz pro párování vypršel. Spusť párování znovu z Adminu.');
  const res = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl(requestUrl), grant_type: 'authorization_code',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(400, 'Google párování odmítl. Zkus to znovu.');
  if (!data.refresh_token) throw new ApiError(400, 'Google nevrátil trvalý přístup. Odeber aplikaci v účtu Google a spáruj znovu.');
  if (!String(data.scope || '').includes('gmail.send')) throw new ApiError(400, 'Nebylo povoleno odesílání e-mailů. Při párování zaškrtni oprávnění k odesílání.');
  const email = String(decodeJwtPayload(data.id_token || '..').email || '').toLowerCase();
  if (env.OWNER_EMAIL && email !== env.OWNER_EMAIL.toLowerCase()) {
    throw new ApiError(403, `Spárovat lze jen účet ${env.OWNER_EMAIL}.`);
  }
  const enc = await encrypt(env.TOKEN_ENCRYPTION_KEY, data.refresh_token);
  await q(
    `INSERT INTO oauth_account (provider, account_email, refresh_token_enc, scope, updated_at)
     VALUES ('google', $1, decode($2, 'hex'), $3, now())
     ON CONFLICT (provider) DO UPDATE SET account_email = EXCLUDED.account_email,
       refresh_token_enc = EXCLUDED.refresh_token_enc, scope = EXCLUDED.scope, updated_at = now()`,
    [email, enc, data.scope],
  );
  await q(`INSERT INTO audit_log (actor, action, after) VALUES ('oauth', 'gmail.paired', $1)`, [JSON.stringify({ email })]);
  return { email };
}

// ---------- přístupový token a odeslání ----------

let cached = null; // { token, exp }

export class MailError extends Error {
  /** kind: 'retry' (bezpečně odmítnuto, opakovat), 'failed' (trvale), 'unknown' (nejasné), 'auth' (nutné znovu spárovat) */
  constructor(kind, message) { super(message); this.kind = kind; }
}

export async function accessToken(env, q) {
  if (cached && cached.exp - 60_000 > Date.now()) return cached.token;
  const [acc] = await q(`SELECT encode(refresh_token_enc, 'hex') AS enc FROM oauth_account WHERE provider = 'google'`);
  if (!acc) throw new MailError('auth', 'Gmail není spárovaný.');
  const refresh = await decrypt(env.TOKEN_ENCRYPTION_KEY, acc.enc);
  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }),
    });
  } catch {
    throw new MailError('retry', 'Google token: síťová chyba.');
  }
  const data = await res.json().catch(() => ({}));
  if (data.error === 'invalid_grant') throw new MailError('auth', 'Přístup ke Gmailu byl odvolán nebo vypršel. Spáruj Gmail znovu.');
  if (!res.ok) throw new MailError('retry', `Google token: HTTP ${res.status}.`);
  cached = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64url = (s) => b64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

/** Zpráva RFC 5322 v UTF-8 (tělo base64, řádky po 76 znacích). */
export function buildMime({ from, fromName, to, cc, subject, body }) {
  const bodyB64 = b64(body.replace(/\r?\n/g, '\r\n')).replace(/.{76}/g, '$&\r\n');
  return [
    `From: ${fromName ? `${encodeHeader(fromName)} <${from}>` : from}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    bodyB64,
  ].filter((l) => l !== null).join('\r\n');
}

/** Odešle zprávu. Vrací ID zprávy Gmailu, nebo vyhodí MailError s typem výsledku. */
export async function gmailSend(env, q, msg) {
  const token = await accessToken(env, q);
  let res;
  try {
    res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: b64url(buildMime(msg)) }),
    });
  } catch {
    // Spojení spadlo během odeslání – nevíme, zda zpráva odešla.
    throw new MailError('unknown', 'Spojení s Gmailem se přerušilo během odesílání.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.id) return data.id;
  if (res.status === 401) { cached = null; throw new MailError('retry', 'Gmail: neplatný přístupový token (obnoví se).'); }
  if (res.status === 429 || (res.status === 403 && /rate|quota|limit/i.test(JSON.stringify(data)))) throw new MailError('retry', `Gmail: limit (HTTP ${res.status}).`);
  if (res.status >= 500) throw new MailError('unknown', `Gmail: chyba serveru HTTP ${res.status} – nejasné, zda zpráva odešla.`);
  throw new MailError('failed', `Gmail odmítl zprávu: HTTP ${res.status} ${data?.error?.message || ''}`.trim());
}
