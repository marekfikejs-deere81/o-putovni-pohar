import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migrate, seed, TOURNAMENT_ID } from '../db/apply.mjs';
import { validateOrder, confirmationMail, czk } from '../shared/orders.js';
import {
  hashToken, newToken, isTokenShape, teamOrderView, submitTeamOrder,
  adminSaveOrder, adminGenerateLinks, adminListOrders,
} from '../worker/src/orders.js';
import { loadPublicRaw } from '../worker/src/queries.js';
import { buildPublicModel } from '../shared/public-model.js';

const BEFORE = '2026-12-12T22:59:59Z'; // 12. 12. 23:59:59 v Praze
const AFTER = '2026-12-12T23:00:00Z'; //  13. 12. 00:00:00 v Praze

async function setup() {
  const db = new PGlite();
  const exec = (sql, params) => (params ? db.query(sql, params) : db.exec(sql).then((r) => r.at(-1) || { rows: [] }));
  await migrate(exec, () => {});
  await seed(exec, () => {});
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  const links = await adminGenerateLinks(q, null, 'admin:test', '2026-11-23T18:00:00Z');
  const tok = Object.fromEntries(await Promise.all(links.map(async (l) => [l.key, await hashToken(l.token)])));
  return { q, links, tok };
}

const ok = { players: 12, staff: 3, note: 'bezlepková 1×', email: 'trener@example.cz' };

test('Validace: počty, poznámka 100/101 znaků, e-mail', () => {
  assert.deepEqual(validateOrder(ok).errors, {});
  assert.ok(validateOrder({ ...ok, players: -1 }).errors.players);
  assert.ok(validateOrder({ ...ok, staff: 1.5 }).errors.staff);
  assert.ok(validateOrder({ ...ok, players: '' }).errors.players);
  assert.deepEqual(validateOrder({ ...ok, note: 'x'.repeat(100) }).errors, {});
  assert.ok(validateOrder({ ...ok, note: 'x'.repeat(101) }).errors.note);
  assert.ok(validateOrder({ ...ok, email: '' }).errors.email);
  assert.ok(validateOrder({ ...ok, email: 'neni-email' }).errors.email);
  assert.equal(validateOrder({ ...ok, players: '0', staff: '0' }).value.players, 0);
});

test('Cena a e-mail: 12 + 3 = 15 × 170 = 2 550 Kč, kopie pořadateli, oběd', () => {
  assert.equal(czk(2550), '2 550 Kč');
  const m = confirmationMail({ ...ok, label: 'HC Lev Benešov', version: 1 },
    { name: 'Vánoční turnaj', dayText: 'pondělí 28. 12. 2026', price: 170, menu: 'Vývar, špagety', organizer: 'Marek' },
    { from: 745, to: 765 });
  assert.match(m.subject, /^Objednávka obědů – HC Lev Benešov/);
  for (const s of ['Celkem porcí: 15', '2 550 Kč', '12:25–12:45', 'bezlepková', 'pondělí 28. 12. 2026', 'závazná']) assert.ok(m.body.includes(s), s);
});

test('Tokeny: 9 odkazů, v DB jen otisk, nový odkaz zneplatní starý', async () => {
  const { q, links } = await setup();
  assert.equal(links.length, 9);
  assert.ok(links.every((l) => isTokenShape(l.token)));
  assert.equal(new Set(links.map((l) => l.token)).size, 9);
  const raw = await q(`SELECT encode(token_hash, 'hex') h FROM team_access`);
  assert.ok(raw.every((r) => !links.some((l) => l.token.includes(r.h))));
  const old = links.find((l) => l.key === 'BEN');
  const [fresh] = await adminGenerateLinks(q, ['BEN'], 'admin:test', '2026-11-24T10:00:00Z');
  await assert.rejects(teamOrderView(q, await hashToken(old.token), BEFORE), (e) => e.status === 404);
  const v = await teamOrderView(q, await hashToken(fresh.token), BEFORE);
  assert.equal(v.key, 'BEN');
  assert.equal(newToken().length, 43);
});

test('Tým: pohled bez cizích dat, Vlašim A+B společně, oběd 11:10', async () => {
  const { q, tok } = await setup();
  const v = await teamOrderView(q, tok.VLS, BEFORE);
  assert.equal(v.label, 'HC Rytíři Vlašim A + B');
  assert.deepEqual(v.teams.map((t) => t.code), ['VLA', 'VLB']);
  assert.deepEqual(v.lunch, [{ from: 670, to: 690 }]);
  assert.equal(v.order, null);
  assert.equal(v.closed, false);
  await assert.rejects(teamOrderView(q, await hashToken('x'.repeat(43)), BEFORE), (e) => e.status === 404);
});

test('Tým odešle jednou: dvojklik = jedna objednávka, druhé odeslání odmítnuto, fronta e-mailu', async () => {
  const { q, tok } = await setup();
  const a = await submitTeamOrder(q, tok.BEN, ok, 'klik-0001', BEFORE);
  const b = await submitTeamOrder(q, tok.BEN, ok, 'klik-0001', BEFORE); // stejný požadavek znovu
  assert.deepEqual(a, b);
  assert.equal(a.order.version, 1);
  await assert.rejects(submitTeamOrder(q, tok.BEN, { ...ok, players: 20 }, 'klik-0002', BEFORE), (e) => e.status === 409);
  const [c] = await q(`SELECT (SELECT count(*)::int FROM lunch_order) o, (SELECT count(*)::int FROM lunch_order_history) h,
    (SELECT count(*)::int FROM mail_outbox) m, (SELECT revision::int FROM tournament) r`);
  assert.deepEqual(c, { o: 1, h: 1, m: 1, r: 1 });
  const [mail] = await q(`SELECT to_addr, cc_addr, status, dedupe_key FROM mail_outbox`);
  assert.deepEqual(mail, { to_addr: 'trener@example.cz', cc_addr: 'm.kakos9@seznam.cz', status: 'pending', dedupe_key: 'order:BEN:v1' });
  const v = await teamOrderView(q, tok.BEN, BEFORE);
  assert.equal(v.order.players, 12);
});

test('Uzávěrka na serveru: 23:59:59 ještě ano, 00:00:00 už ne', async () => {
  const { q, tok } = await setup();
  await submitTeamOrder(q, tok.KOB, ok, 'klik-kob1', BEFORE);
  await assert.rejects(submitTeamOrder(q, tok.SVE, ok, 'klik-sve1', AFTER), (e) => e.status === 403);
  assert.equal((await teamOrderView(q, tok.SVE, AFTER)).closed, true);
});

test('Neplatný vstup se neuloží (422) a nezaloží e-mail', async () => {
  const { q, tok } = await setup();
  await assert.rejects(submitTeamOrder(q, tok.PLZ, { ...ok, note: 'x'.repeat(101) }, 'klik-plz1', BEFORE),
    (e) => e.status === 422 && Boolean(e.data.fields.note));
  const [c] = await q(`SELECT (SELECT count(*)::int FROM lunch_order) o, (SELECT count(*)::int FROM mail_outbox) m`);
  assert.deepEqual(c, { o: 0, m: 0 });
});

test('Správce: změna po uzávěrce s verzí, historií, auditem a novým potvrzením; konflikt verze', async () => {
  const { q, tok } = await setup();
  await submitTeamOrder(q, tok.LIT, ok, 'klik-lit1', BEFORE);
  const r = await adminSaveOrder(q, 'LIT', { ...ok, players: 14, version: 1 }, 'admin:marek', AFTER);
  assert.equal(r.order.version, 2);
  await assert.rejects(adminSaveOrder(q, 'LIT', { ...ok, players: 15, version: 1 }, 'admin:marek', AFTER), (e) => e.status === 409);
  const created = await adminSaveOrder(q, 'SLA', { ...ok, players: 0, staff: 0, version: null }, 'admin:marek', AFTER);
  assert.equal(created.order.version, 1);
  const [c] = await q(`SELECT (SELECT count(*)::int FROM lunch_order_history WHERE key = 'LIT') h,
    (SELECT count(*)::int FROM mail_outbox WHERE dedupe_key LIKE 'order:LIT:%') m,
    (SELECT count(*)::int FROM audit_log WHERE action = 'lunch_order.save') a`);
  assert.deepEqual(c, { h: 2, m: 2, a: 2 });
  const [mail] = await q(`SELECT subject FROM mail_outbox WHERE dedupe_key = 'order:LIT:v2'`);
  assert.match(mail.subject, /^Změna objednávky/);
  const list = await adminListOrders(q);
  assert.equal(list.length, 9);
  assert.equal(list[0].key, 'VLS');
});

test('Veřejný model: jen počty, neobjednáno ≠ výslovná nula, žádné e-maily ani poznámky', async () => {
  const { q, tok } = await setup();
  await submitTeamOrder(q, tok.CEB, ok, 'klik-ceb1', BEFORE);
  await adminSaveOrder(q, 'SLA', { ...ok, players: 0, staff: 0, version: null }, 'admin:marek', BEFORE);
  const m = buildPublicModel(await loadPublicRaw(q, TOURNAMENT_ID));
  const by = Object.fromEntries(m.orders.map((o) => [o.key, o]));
  assert.equal(m.orders.length, 9);
  assert.deepEqual([by.CEB.ordered, by.CEB.players, by.CEB.staff], [true, 12, 3]);
  assert.deepEqual([by.SLA.ordered, by.SLA.players], [true, 0]);
  assert.deepEqual([by.BEN.ordered, by.BEN.players], [false, null]);
  assert.equal(by.VLS.teams.length, 2);
  const text = JSON.stringify(m);
  assert.ok(!text.includes('trener@example.cz') && !text.includes('bezlepková'));
});
