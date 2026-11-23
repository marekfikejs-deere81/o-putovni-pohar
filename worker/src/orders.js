// Objednávky obědů na serveru. Funkce dostávají `q(sql, params) → rows` jednoho připojení,
// takže je lze testovat proti PGlite a ve Workeru spouštět v transakci nad Neonem.
import { ApiError } from './errors.js';
import { validateOrder, confirmationMail, ORGANIZER_CC } from '../../shared/orders.js';

export const TOURNAMENT_ID = 'vlasim-2026';
export const ORGANIZER = 'Marek Fikejs, marek.fikejs@gmail.com';
const DAY_TEXT = 'pondělí 28. 12. 2026';

// ---------- tokeny ----------

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function hashToken(token) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
}

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const isTokenShape = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(t);

// ---------- transakce ----------

export async function withTx(q, fn) {
  await q('BEGIN');
  try {
    const result = await fn();
    await q('COMMIT');
    return result;
  } catch (e) {
    await q('ROLLBACK').catch(() => {});
    throw e;
  }
}

// ---------- společné dotazy ----------

async function tournamentInfo(q, nowIso) {
  const [t] = await q(
    `SELECT name, lunch_price_czk AS price, lunch_menu AS menu,
            to_char(lunch_deadline AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS deadline,
            ($2::timestamptz >= lunch_deadline) AS closed
     FROM tournament WHERE id = $1`,
    [TOURNAMENT_ID, nowIso],
  );
  return t;
}

async function keyInfo(q, key) {
  const teams = await q(
    `SELECT t.id, t.code, t.name, t.line1, t.line2, t.web_logo, t.logo_version
     FROM order_key_team k JOIN team t ON t.id = k.team_id WHERE k.key = $1 ORDER BY t.id`,
    [key],
  );
  const lunch = await q(
    `SELECT DISTINCT w.id, COALESCE(w.frozen_start, b.start_min + w.offset_min) AS from_min, w.length_min
     FROM lunch_window_team wt JOIN lunch_window w ON w.id = wt.window_id JOIN block b ON b.id = w.anchor_block_id
     WHERE wt.team_id IN (SELECT team_id FROM order_key_team WHERE key = $1) ORDER BY from_min`,
    [key],
  );
  return {
    teams: teams.map((t) => ({
      id: t.id, code: t.code, name: t.name, lines: [t.line1, t.line2],
      logo: t.logo_version > 0 ? `/api/logo/${t.id}/${t.logo_version}/web` : t.web_logo,
    })),
    lunch: lunch.map((l) => ({ from: l.from_min, to: l.from_min + l.length_min })),
  };
}

const orderRow = (o) => o && {
  players: o.players, staff: o.staff, note: o.note, email: o.email, version: o.version,
  updatedAt: o.updated_at instanceof Date ? o.updated_at.toISOString() : o.updated_at,
};

async function enqueueConfirmation(q, label, order, t, lunch) {
  const mail = confirmationMail(
    { ...order, label },
    { name: t.name, dayText: DAY_TEXT, price: t.price, menu: t.menu, organizer: ORGANIZER },
    lunch[0] || null,
  );
  await q(
    `INSERT INTO mail_outbox (kind, dedupe_key, to_addr, cc_addr, subject, body_text)
     VALUES ('order_confirmation', $1, $2, $3, $4, $5) ON CONFLICT (dedupe_key) DO NOTHING`,
    [`order:${order.key}:v${order.version}`, order.email, ORGANIZER_CC, mail.subject, mail.body],
  );
}

async function bumpRevision(q) {
  await q(`UPDATE tournament SET revision = revision + 1 WHERE id = $1`, [TOURNAMENT_ID]);
}

// ---------- tým ----------

async function keyForToken(q, tokenHash) {
  const [a] = await q(
    `SELECT a.id, a.key, k.label FROM team_access a JOIN order_key k ON k.key = a.key
     WHERE a.token_hash = decode($1, 'hex') AND a.revoked_at IS NULL`,
    [tokenHash],
  );
  if (!a) throw new ApiError(404, 'Odkaz pro objednávku neplatí. Požádej pořadatele o nový.');
  return a;
}

/** Pohled týmu na jeho objednávku (bez cizích dat). */
export async function teamOrderView(q, tokenHash, nowIso) {
  const access = await keyForToken(q, tokenHash);
  const t = await tournamentInfo(q, nowIso);
  const info = await keyInfo(q, access.key);
  const [o] = await q(`SELECT players, staff, note, email, version, updated_at FROM lunch_order WHERE key = $1`, [access.key]);
  return {
    key: access.key, label: access.label, ...info,
    order: orderRow(o) || null,
    closed: Boolean(t.closed), deadline: t.deadline, price: t.price, menu: t.menu, organizer: ORGANIZER,
  };
}

/**
 * Jednorázové odeslání objednávky týmem. Po odeslání ji tým už nemění (jen správce).
 * Opakovaný požadavek se stejným Idempotency-Key vrátí stejnou odpověď.
 */
export async function submitTeamOrder(q, tokenHash, input, idemKey, nowIso) {
  if (!idemKey || !/^[A-Za-z0-9_-]{8,80}$/.test(idemKey)) throw new ApiError(400, 'Chybí identifikátor požadavku. Obnov stránku.');
  return withTx(q, async () => {
    const access = await keyForToken(q, tokenHash);
    const rk = `team-order:${access.key}:${idemKey}`;
    const [prev] = await q(`SELECT response FROM request_key WHERE key = $1`, [rk]);
    if (prev) return prev.response;

    const t = await tournamentInfo(q, nowIso);
    if (t.closed) throw new ApiError(403, 'Objednávky jsou uzavřené (uzávěrka 12. 12. 2026). Změnu domluv s pořadatelem.');
    const { value, errors } = validateOrder(input);
    if (Object.keys(errors).length) throw new ApiError(422, 'Zkontroluj zvýrazněná pole.', { fields: errors });

    const inserted = await q(
      `INSERT INTO lunch_order (key, players, staff, note, email, version, updated_at, updated_by)
       VALUES ($1, $2, $3, $4, $5, 1, $6, $7) ON CONFLICT (key) DO NOTHING
       RETURNING players, staff, note, email, version, updated_at`,
      [access.key, value.players, value.staff, value.note, value.email, nowIso, `team:${access.key}`],
    );
    if (!inserted.length) {
      // Souběžný dvojklik: první požadavek mezitím doběhl – vrať jeho odpověď.
      const [again] = await q(`SELECT response FROM request_key WHERE key = $1`, [rk]);
      if (again) return again.response;
      throw new ApiError(409, 'Objednávka tohoto týmu už byla odeslána. Změnu domluv s pořadatelem.');
    }
    const o = inserted[0];
    await q(
      `INSERT INTO lunch_order_history (key, version, players, staff, note, email, changed_by, changed_at)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7)`,
      [access.key, o.players, o.staff, o.note, o.email, `team:${access.key}`, nowIso],
    );
    await q(`UPDATE team_access SET used_at = COALESCE(used_at, $2) WHERE id = $1`, [access.id, nowIso]);
    const info = await keyInfo(q, access.key);
    await enqueueConfirmation(q, access.label, { ...o, key: access.key }, t, info.lunch);
    await bumpRevision(q);
    const response = { order: orderRow(o) };
    await q(`INSERT INTO request_key (key, response) VALUES ($1, $2)`, [rk, JSON.stringify(response)]);
    return response;
  });
}

// ---------- správce ----------

/** Správce zadá nebo změní objednávku kdykoli (i po uzávěrce), s kontrolou verze a historií. */
export async function adminSaveOrder(q, key, input, actor, nowIso) {
  return withTx(q, async () => {
    const [k] = await q(`SELECT key, label FROM order_key WHERE key = $1`, [key]);
    if (!k) throw new ApiError(404, 'Neznámý objednatel.');
    const { value, errors } = validateOrder(input);
    if (Object.keys(errors).length) throw new ApiError(422, 'Zkontroluj zvýrazněná pole.', { fields: errors });
    const [cur] = await q(`SELECT version FROM lunch_order WHERE key = $1 FOR UPDATE`, [key]);
    const curVersion = cur?.version ?? null;
    if ((value.version ?? null) !== curVersion) {
      throw new ApiError(409, 'Objednávku mezitím někdo změnil. Načti ji znovu.', { currentVersion: curVersion });
    }
    const version = (curVersion ?? 0) + 1;
    const [o] = await q(
      `INSERT INTO lunch_order (key, players, staff, note, email, version, updated_at, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (key) DO UPDATE SET players = EXCLUDED.players, staff = EXCLUDED.staff, note = EXCLUDED.note,
         email = EXCLUDED.email, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
       RETURNING players, staff, note, email, version, updated_at`,
      [key, value.players, value.staff, value.note, value.email, version, nowIso, actor],
    );
    await q(
      `INSERT INTO lunch_order_history (key, version, players, staff, note, email, changed_by, changed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [key, version, o.players, o.staff, o.note, o.email, actor, nowIso],
    );
    await q(`INSERT INTO audit_log (actor, action, after) VALUES ($1, 'lunch_order.save', $2)`, [actor, JSON.stringify({ key, ...orderRow(o) })]);
    const t = await tournamentInfo(q, nowIso);
    const info = await keyInfo(q, key);
    await enqueueConfirmation(q, k.label, { ...o, key }, t, info.lunch);
    await bumpRevision(q);
    return { order: orderRow(o) };
  });
}

/** Přehled všech objednávek pro správce (včetně neobjednaných a e-mailů). */
export async function adminListOrders(q) {
  return q(
    `SELECT k.key, k.label, o.players, o.staff, o.note, o.email, o.version, o.updated_at, o.updated_by,
            (SELECT max(created_at) FROM team_access a WHERE a.key = k.key AND a.revoked_at IS NULL) AS link_created,
            (SELECT max(used_at) FROM team_access a WHERE a.key = k.key AND a.revoked_at IS NULL) AS link_used
     FROM order_key k LEFT JOIN lunch_order o ON o.key = k.key
     ORDER BY CASE WHEN k.key = 'VLS' THEN 0 ELSE 1 END, k.label`,
  );
}

/**
 * Vygeneruje nové týmové odkazy (staré zneplatní). Token se vrací jen v této odpovědi,
 * v databázi zůstane pouze jeho otisk SHA-256.
 */
export async function adminGenerateLinks(q, keys, actor, nowIso) {
  return withTx(q, async () => {
    const all = await q(`SELECT key, label FROM order_key ORDER BY key`);
    const chosen = keys?.length ? all.filter((k) => keys.includes(k.key)) : all;
    if (!chosen.length) throw new ApiError(404, 'Neznámý objednatel.');
    const out = [];
    for (const k of chosen) {
      await q(`UPDATE team_access SET revoked_at = $2 WHERE key = $1 AND revoked_at IS NULL`, [k.key, nowIso]);
      const token = newToken();
      await q(`INSERT INTO team_access (key, token_hash, created_at) VALUES ($1, decode($2, 'hex'), $3)`, [k.key, await hashToken(token), nowIso]);
      out.push({ key: k.key, label: k.label, token });
    }
    await q(`INSERT INTO audit_log (actor, action, after) VALUES ($1, 'team_access.generate', $2)`, [actor, JSON.stringify(chosen.map((k) => k.key))]);
    return out;
  });
}
