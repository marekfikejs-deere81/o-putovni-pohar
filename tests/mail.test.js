import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migrate, seed } from '../db/apply.mjs';
import { adminGenerateLinks, hashToken, submitTeamOrder, adminSaveOrder } from '../worker/src/orders.js';
import { processOutbox, maybeQueueSummary, buildSummary, applyMailMode, adminMailAction, queueTest } from '../worker/src/mail.js';
import { MailError, buildMime, encrypt, decrypt } from '../worker/src/gmail.js';

const NB = ' ';
const ok = { players: 12, staff: 3, email: 'trener@example.cz' };
const LIVE = { MAIL_MODE: 'live' };

async function setup() {
  const db = new PGlite();
  const exec = (sql, params) => (params ? db.query(sql, params) : db.exec(sql).then((r) => r.at(-1) || { rows: [] }));
  await migrate(exec, () => {});
  await seed(exec, () => {});
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  const links = await adminGenerateLinks(q, null, 'admin:test', '2026-11-23T18:00:00Z');
  const tok = Object.fromEntries(await Promise.all(links.map(async (l) => [l.key, await hashToken(l.token)])));
  return { q, tok };
}
const status = async (q) => (await q(`SELECT dedupe_key, status, attempts, gmail_message_id FROM mail_outbox ORDER BY id`));

test('Úspěšné odeslání: To tým, Cc pořadatel, stav sent s ID zprávy, podruhé se neposílá', async () => {
  const { q, tok } = await setup();
  await submitTeamOrder(q, tok.BEN, ok, 'k-ben-001', '2026-12-01T10:00:00Z');
  const sent = [];
  const r = await processOutbox(q, LIVE, async (m) => { sent.push(m); return 'gmail-123'; });
  assert.deepEqual(r, [{ id: 1, status: 'sent' }]);
  assert.equal(sent[0].to, 'trener@example.cz');
  assert.equal(sent[0].cc, 'm.kakos9@seznam.cz');
  assert.equal(sent[0].from, 'marek.fikejs@gmail.com');
  assert.deepEqual(await status(q), [{ dedupe_key: 'order:BEN:v1', status: 'sent', attempts: 1, gmail_message_id: 'gmail-123' }]);
  assert.deepEqual(await processOutbox(q, LIVE, async () => 'x'), []);
});

test('Testovací režim: vše jen na testovacího příjemce s původní adresou v textu', async () => {
  const m = applyMailMode({ MAIL_MODE: 'test', MAIL_TEST_RECIPIENTS: 'marek.fikejs@gmail.com' },
    { to_addr: 'trener@example.cz', cc_addr: 'm.kakos9@seznam.cz', subject: 'Objednávka', body_text: 'Text' });
  assert.equal(m.to, 'marek.fikejs@gmail.com');
  assert.equal(m.cc, null);
  assert.match(m.subject, /^\[TEST\]/);
  assert.match(m.body, /trener@example\.cz, kopie m\.kakos9@seznam\.cz/);
  assert.equal(applyMailMode({}, { to_addr: 'a@b.cz', subject: 's', body_text: 'b' }).to, 'marek.fikejs@gmail.com'); // výchozí = test
});

test('Bezpečné odmítnutí se opakuje s prodlevou; nejasný výsledek → unknown; trvalá chyba → failed', async () => {
  const { q, tok } = await setup();
  await submitTeamOrder(q, tok.BEN, ok, 'k-ben-001', '2026-12-01T10:00:00Z');
  await submitTeamOrder(q, tok.KOB, ok, 'k-kob-001', '2026-12-01T10:00:00Z');
  await submitTeamOrder(q, tok.SVE, ok, 'k-sve-001', '2026-12-01T10:00:00Z');
  const outcome = { 'order:BEN:v1': 'retry', 'order:KOB:v1': 'unknown', 'order:SVE:v1': 'failed' };
  const rows = await q(`SELECT id, dedupe_key FROM mail_outbox`);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.dedupe_key]));
  let i = 0;
  const now = new Date('2026-12-01T10:00:00Z');
  await processOutbox(q, LIVE, async () => { const k = byId[++i]; throw new MailError(outcome[k], k); }, { now });
  const st = Object.fromEntries((await status(q)).map((r) => [r.dedupe_key, r.status]));
  assert.deepEqual(st, { 'order:BEN:v1': 'pending', 'order:KOB:v1': 'unknown', 'order:SVE:v1': 'failed' });
  // Hned znovu se nepošle (prodleva), po minutě ano.
  assert.deepEqual(await processOutbox(q, LIVE, async () => 'x', { now }), []);
  const later = await processOutbox(q, LIVE, async () => 'gm-1', { now: new Date('2026-12-01T10:01:30Z') });
  assert.deepEqual(later, [{ id: 1, status: 'sent' }]);
  // Ruční zásah: unknown → potvrdit ve Gmailu; failed → zkusit znovu
  assert.deepEqual(await adminMailAction(q, 2, 'mark-sent', 'admin:m'), { ok: true });
  assert.deepEqual(await adminMailAction(q, 3, 'retry', 'admin:m'), { ok: true });
  assert.deepEqual(await adminMailAction(q, 1, 'retry', 'admin:m'), { ok: false }); // odeslanou nelze
});

test('Zprávy zaseknuté ve stavu sending přejdou po 10 min do unknown (žádné slepé opakování)', async () => {
  const { q, tok } = await setup();
  await submitTeamOrder(q, tok.BEN, ok, 'k-ben-001', '2026-12-01T10:00:00Z');
  await q(`UPDATE mail_outbox SET status = 'sending', next_attempt_at = '2026-12-01T10:00:00Z'`);
  await processOutbox(q, LIVE, async () => 'x', { now: new Date('2026-12-01T10:11:00Z') });
  assert.equal((await status(q))[0].status, 'unknown');
});

test('Souhrn: všech 9 řádků vč. NEOBJEDNÁNO a výslovné nuly, součty a cena 140/170', async () => {
  const { q, tok } = await setup();
  await submitTeamOrder(q, tok.CEB, ok, 'k-ceb-001', '2026-12-01T10:00:00Z');
  await adminSaveOrder(q, 'SLA', { players: 0, staff: 0, email: 'sla@example.cz', version: null }, 'admin:m', '2026-12-01T10:00:00Z');
  const s = await buildSummary(q);
  const lines = s.body.split('\n').filter((l) => l.startsWith('• '));
  assert.equal(lines.length, 9);
  assert.ok(lines[0].startsWith('• HC Rytíři Vlašim A + B: NEOBJEDNÁNO'));
  assert.ok(s.body.includes(`hráči 12, realizační tým 3, celkem 15 porcí (2${NB}190${NB}Kč)`));
  assert.ok(lines.some((l) => /: hráči 0, realizační tým 0, celkem 0 porcí/.test(l)));
  assert.ok(s.body.includes('Objednalo: 2 z 9'));
  assert.ok(s.body.includes(`CELKOVÁ CENA: 2${NB}190${NB}Kč`));
});

test('Souhrn se zařadí až v čase a jen jednou (i po výpadku)', async () => {
  const { q } = await setup();
  const env = { SUMMARY_AT: '2026-12-13T07:00:00Z' };
  assert.equal(await maybeQueueSummary(q, env, new Date('2026-12-13T06:59:59Z')), false);
  assert.equal(await maybeQueueSummary(q, env, new Date('2026-12-13T09:30:00Z')), true); // dohnání po výpadku
  assert.equal(await maybeQueueSummary(q, env, new Date('2026-12-13T10:00:00Z')), false);
  const [m] = await q(`SELECT kind, to_addr, cc_addr FROM mail_outbox`);
  assert.deepEqual(m, { kind: 'lunch_summary', to_addr: 'm.kakos9@seznam.cz', cc_addr: null });
});

test('Zkušební e-mail jde jen na zadanou adresu', async () => {
  const { q } = await setup();
  await queueTest(q, 'mail', 'marek.fikejs@gmail.com');
  const [m] = await q(`SELECT kind, to_addr, subject FROM mail_outbox`);
  assert.equal(m.to_addr, 'marek.fikejs@gmail.com');
  assert.match(m.subject, /^\[ZKOUŠKA\]/);
});

test('MIME: UTF-8 předmět i tělo, Cc; šifrování tokenu tam a zpět', async () => {
  const mime = buildMime({ from: 'marek.fikejs@gmail.com', fromName: 'HC Rytíři', to: 'a@b.cz', cc: 'c@d.cz', subject: 'Objednávka obědů – Vlašim', body: 'Řádek 1\nŘádek 2' });
  assert.match(mime, /^From: =\?UTF-8\?B\?.+\?= <marek\.fikejs@gmail\.com>\r\nTo: a@b\.cz\r\nCc: c@d\.cz\r\nSubject: =\?UTF-8\?B\?/);
  const body = mime.split('\r\n\r\n')[1].replace(/\r\n/g, '');
  assert.equal(Buffer.from(body, 'base64').toString('utf8'), 'Řádek 1\r\nŘádek 2');
  const key = 'x'.repeat(48);
  const enc = await encrypt(key, '1//refresh-token');
  assert.notEqual(enc, '1//refresh-token');
  assert.equal(await decrypt(key, enc), '1//refresh-token');
  await assert.rejects(decrypt('y'.repeat(48), enc));
});
