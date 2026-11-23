// Fronta pošty a souhrn obědů. Odesílač (`send`) se předává zvenku – ve Workeru Gmail, v testech náhrada.
import { MailError } from './gmail.js';
import { czk, ORGANIZER_CC } from '../../shared/orders.js';
import { withTx, TOURNAMENT_ID } from './orders.js';

export const SENDER = 'marek.fikejs@gmail.com';
export const SENDER_NAME = 'HC Rytíři Vlašim – O putovní pohár';
const BACKOFF_MIN = [1, 2, 5, 10, 30, 60];
const MAX_ATTEMPTS = 8;

/** V testovacím prostředí přesměruje všechny zprávy na testovací příjemce. */
export function applyMailMode(env, row) {
  if ((env.MAIL_MODE || 'test') === 'live') return { to: row.to_addr, cc: row.cc_addr, subject: row.subject, body: row.body_text };
  const test = (env.MAIL_TEST_RECIPIENTS || SENDER).trim();
  return {
    to: test, cc: null,
    subject: `[TEST] ${row.subject}`,
    body: `TESTOVACÍ PROSTŘEDÍ – ve skutečnosti by šlo na: ${row.to_addr}${row.cc_addr ? `, kopie ${row.cc_addr}` : ''}\n\n${row.body_text}`,
  };
}

/**
 * Zpracuje frontu: vybere splatné zprávy, označí je „sending“ (v transakci, SKIP LOCKED),
 * odešle a zapíše výsledek. Zprávy zaseknuté ve stavu „sending“ déle než 10 min přejdou do „unknown“.
 */
export async function processOutbox(q, env, send, { limit = 10, now = new Date() } = {}) {
  const nowIso = now.toISOString();
  await q(`UPDATE mail_outbox SET status = 'unknown', last_error = 'Odesílání přerušeno – zkontroluj ve Gmailu (Odeslané).'
           WHERE status = 'sending' AND next_attempt_at < $1::timestamptz - interval '10 minutes'`, [nowIso]);
  const batch = await withTx(q, async () => {
    const rows = await q(
      `SELECT id, kind, to_addr, cc_addr, subject, body_text, attempts FROM mail_outbox
       WHERE status = 'pending' AND next_attempt_at <= $1 ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED`,
      [nowIso, limit],
    );
    if (rows.length) {
      await q(`UPDATE mail_outbox SET status = 'sending', attempts = attempts + 1, next_attempt_at = $2 WHERE id = ANY($1::bigint[])`,
        [rows.map((r) => r.id), nowIso]);
    }
    return rows;
  });
  const results = [];
  for (const row of batch) {
    const msg = applyMailMode(env, row);
    try {
      const id = await send({ from: SENDER, fromName: SENDER_NAME, ...msg });
      await q(`UPDATE mail_outbox SET status = 'sent', gmail_message_id = $2, sent_at = $3, last_error = NULL WHERE id = $1`, [row.id, id, nowIso]);
      results.push({ id: row.id, status: 'sent' });
    } catch (e) {
      const kind = e instanceof MailError ? e.kind : 'unknown';
      const attempts = row.attempts + 1;
      if ((kind === 'retry' || kind === 'auth') && attempts < MAX_ATTEMPTS) {
        const wait = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)];
        await q(`UPDATE mail_outbox SET status = 'pending', last_error = $2, next_attempt_at = $3::timestamptz + make_interval(mins => $4) WHERE id = $1`,
          [row.id, String(e.message).slice(0, 500), nowIso, wait]);
        results.push({ id: row.id, status: 'pending' });
      } else {
        const status = kind === 'unknown' ? 'unknown' : 'failed';
        await q(`UPDATE mail_outbox SET status = $2, last_error = $3 WHERE id = $1`, [row.id, status, String(e.message).slice(0, 500)]);
        results.push({ id: row.id, status });
      }
      if (kind === 'auth') break; // bez platného spárování nemá smysl zkoušet další zprávy
    }
  }
  return results;
}

/** Text souhrnu obědů ze skutečné databáze (včetně neobjednaných). */
export async function buildSummary(q) {
  const [t] = await q(`SELECT name, lunch_price_player_czk AS pp, lunch_price_staff_czk AS ps, lunch_menu AS menu FROM tournament WHERE id = $1`, [TOURNAMENT_ID]);
  const rows = await q(
    `SELECT k.key, k.label, o.players, o.staff, o.note, o.email
     FROM order_key k LEFT JOIN lunch_order o ON o.key = k.key
     ORDER BY CASE WHEN k.key = 'VLS' THEN 0 ELSE 1 END, k.label`,
  );
  const ordered = rows.filter((r) => r.players !== null);
  const P = ordered.reduce((a, r) => a + r.players, 0);
  const S = ordered.reduce((a, r) => a + r.staff, 0);
  const lines = [
    'Dobrý den,',
    '',
    `posíláme souhrn objednaných obědů na ${t.name} (pondělí 28. 12. 2026) po uzávěrce 12. 12. 2026.`,
    `Menu: ${t.menu} · hráč ${czk(t.pp)}, realizační tým ${czk(t.ps)}.`,
    '',
    ...rows.map((r) => r.players === null
      ? `• ${r.label}: NEOBJEDNÁNO`
      : `• ${r.label}: hráči ${r.players}, realizační tým ${r.staff}, celkem ${r.players + r.staff} porcí (${czk(r.players * t.pp + r.staff * t.ps)})`
        + ` · ${r.email}`),
    '',
    `Objednalo: ${ordered.length} z ${rows.length}`,
    `Celkem hráči: ${P}, realizační tým: ${S}`,
    `CELKEM PORCÍ: ${P + S}`,
    `CELKOVÁ CENA: ${czk(P * t.pp + S * t.ps)} (hráči ${czk(P * t.pp)} + realizační tým ${czk(S * t.ps)})`,
    '',
    'HC Rytíři Vlašim',
  ];
  return { subject: `Souhrn obědů – ${t.name} – ${P + S} porcí`, body: lines.join('\n') };
}

/**
 * Zařadí souhrn do fronty, pokud nastal čas a ještě nebyl zařazen. Jediný klíč na turnaj a uzávěrku,
 * takže po výpadku se zmeškaný souhrn odešle právě jednou.
 */
export async function maybeQueueSummary(q, env, now = new Date()) {
  const at = env.SUMMARY_AT || '2026-12-13T07:00:00Z';
  if (now < new Date(at)) return false;
  const key = `summary:${TOURNAMENT_ID}:${at}`;
  const [exists] = await q(`SELECT 1 FROM mail_outbox WHERE dedupe_key = $1`, [key]);
  if (exists) return false;
  const s = await buildSummary(q);
  const ins = await q(
    `INSERT INTO mail_outbox (kind, dedupe_key, to_addr, subject, body_text) VALUES ('lunch_summary', $1, $2, $3, $4)
     ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [key, ORGANIZER_CC, s.subject, s.body],
  );
  return ins.length > 0;
}

/** Zkušební souhrn / zkušební e-mail na žádost správce (vždy jen pořadateli). */
export async function queueTest(q, kind, to) {
  const key = `test:${kind}:${Date.now()}`;
  const s = kind === 'summary' ? await buildSummary(q)
    : { subject: 'Zkušební e-mail – O putovní pohár', body: 'Tento e-mail ověřuje, že odesílání z webu turnaje funguje.\n\nHC Rytíři Vlašim' };
  await q(`INSERT INTO mail_outbox (kind, dedupe_key, to_addr, subject, body_text) VALUES ('test', $1, $2, $3, $4)`,
    [key, to, `[ZKOUŠKA] ${s.subject}`, s.body]);
}

/** Přehled pro Admin. */
export async function mailStatus(q) {
  const [acc] = await q(`SELECT account_email, updated_at FROM oauth_account WHERE provider = 'google'`);
  const rows = await q(`SELECT id, kind, to_addr, cc_addr, subject, status, attempts, last_error, gmail_message_id, created_at, sent_at, next_attempt_at
                        FROM mail_outbox ORDER BY id DESC LIMIT 60`);
  const [c] = await q(`SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending, count(*) FILTER (WHERE status IN ('failed','unknown'))::int AS problems FROM mail_outbox`);
  return { gmail: acc ? { email: acc.account_email, updatedAt: acc.updated_at } : null, counts: c, messages: rows };
}

/** Ruční zásah správce u problémové zprávy. */
export async function adminMailAction(q, id, action, actor) {
  const [m] = await q(`SELECT id, status FROM mail_outbox WHERE id = $1`, [id]);
  if (!m) return { ok: false };
  if (action === 'retry' && ['failed', 'unknown'].includes(m.status)) {
    await q(`UPDATE mail_outbox SET status = 'pending', next_attempt_at = now(), last_error = NULL WHERE id = $1`, [id]);
  } else if (action === 'mark-sent' && m.status === 'unknown') {
    await q(`UPDATE mail_outbox SET status = 'sent', sent_at = now(), last_error = 'Potvrzeno ručně ve Gmailu' WHERE id = $1`, [id]);
  } else {
    return { ok: false };
  }
  await q(`INSERT INTO audit_log (actor, action, after) VALUES ($1, $2, $3)`, [actor, `mail.${action}`, JSON.stringify({ id })]);
  return { ok: true };
}
