import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migrate, seed } from '../db/apply.mjs';
import {
  model, savePeriod, deletePeriod, setShootout, setLots, setManualOrder, shiftSchedule, updateTeam, addTip, deleteTip,
} from '../worker/src/results.js';

const A = 'admin:test';
async function setup() {
  const db = new PGlite();
  const exec = (sql, params) => (params ? db.query(sql, params) : db.exec(sql).then((r) => r.at(-1) || { rows: [] }));
  await migrate(exec, () => {});
  await seed(exec, () => {});
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  return { q };
}
const rev = async (q) => (await q(`SELECT revision::int r FROM tournament`))[0].r;
const code = (M, id) => M.teams.find((t) => t.id === id).code;

test('Třetiny: 1. → 2., oprava, neplatné vstupy, mazání jen poslední, audit a revize', async () => {
  const { q } = await setup();
  await assert.rejects(savePeriod(q, 0, 2, { home: 1, away: 0 }, A), (e) => e.status === 409);
  await savePeriod(q, 0, 1, { home: 0, away: 0 }, A);
  await savePeriod(q, 0, 2, { home: '3', away: '1' }, A);
  await savePeriod(q, 0, 1, { home: 2, away: 0 }, A); // oprava
  let M = await model(q);
  assert.deepEqual(M.matches[0].periods, [[2, 0], [3, 1]]);
  await assert.rejects(savePeriod(q, 0, 1, { home: -1, away: 0 }, A), (e) => e.status === 422);
  await assert.rejects(savePeriod(q, 0, 3, { home: 1, away: 0 }, A), (e) => e.status === 400);
  await assert.rejects(savePeriod(q, 0, 1, { home: 1.5, away: 0 }, A), (e) => e.status === 422);
  await assert.rejects(deletePeriod(q, 0, 1, A), (e) => e.status === 409);
  await deletePeriod(q, 0, 2, A);
  M = await model(q);
  assert.deepEqual(M.matches[0].periods, [[2, 0]]);
  assert.equal(await rev(q), 4); // 3 zápisy + 1 smazání; odmítnuté pokusy revizi nezvýší
  const log = await q(`SELECT action FROM audit_log ORDER BY id`);
  assert.deepEqual(log.map((l) => l.action), ['period.confirm', 'period.confirm', 'period.correct', 'period.delete']);
});

test('Utkání o umístění: bez nasazení nelze zapsat; nájezdy jen při shodě bodů; oprava ruší nájezdy', async () => {
  const { q } = await setup();
  await assert.rejects(savePeriod(q, 24, 1, { home: 1, away: 0 }, A), (e) => e.status === 409);
  for (let id = 0; id < 20; id++) { await savePeriod(q, id, 1, { home: 1, away: 0 }, A); await savePeriod(q, id, 2, { home: id % 3, away: 1 }, A); }
  let M = await model(q);
  const fin = M.matches.find((m) => m.place === 1);
  assert.ok(fin.home !== null && fin.away !== null, JSON.stringify(M.groups.A.pendingLots));
  await savePeriod(q, fin.id, 1, { home: 2, away: 1 }, A);
  await savePeriod(q, fin.id, 2, { home: 0, away: 3 }, A);
  await assert.rejects(setShootout(q, fin.id, { winner: 'draw' }, A), (e) => e.status === 422);
  await setShootout(q, fin.id, { winner: 'away' }, A);
  M = await model(q);
  assert.equal(M.matches.find((m) => m.place === 1).winner, 'away');
  assert.equal(M.finalDone, true);
  await savePeriod(q, fin.id, 2, { home: 3, away: 0 }, A); // už vede domácí na body
  M = await model(q);
  assert.equal(M.matches.find((m) => m.place === 1).winner, 'home');
  await assert.rejects(setShootout(q, fin.id, { winner: 'away' }, A), (e) => e.status === 409);
});

test('Ochrana rozehraného utkání o umístění: oprava skupiny, která by změnila účastníky, se odmítne a nic nezmění', async () => {
  const { q } = await setup();
  for (let id = 0; id < 20; id++) { await savePeriod(q, id, 1, { home: 3, away: 0 }, A); await savePeriod(q, id, 2, { home: 3, away: 0 }, A); }
  let M = await model(q);
  const fin = M.matches.find((m) => m.place === 1);
  const third = M.matches.find((m) => m.place === 3);
  assert.ok(fin.home !== null);
  await savePeriod(q, fin.id, 1, { home: 1, away: 1 }, A); // finále rozehráno
  const before = { fin: [fin.home, fin.away], rev: await rev(q) };
  // Překlopení výsledku zápasu vítěze skupiny A tak, aby přišel o první místo:
  const leaderA = M.groups.A.rows[0].id;
  const gamesOfLeader = M.matches.filter((m) => m.place === null && (m.home === leaderA || m.away === leaderA));
  let rejected = false;
  for (const g of gamesOfLeader) {
    const s = g.home === leaderA ? { home: 0, away: 9 } : { home: 9, away: 0 };
    try { await savePeriod(q, g.id, 1, s, A); await savePeriod(q, g.id, 2, s, A); } catch (e) { assert.equal(e.status, 409); rejected = true; break; }
  }
  assert.ok(rejected, 'změna měla být odmítnuta');
  M = await model(q);
  const f2 = M.matches.find((m) => m.place === 1);
  assert.deepEqual([f2.home, f2.away], before.fin);
  assert.ok(third);
});

test('Los: jen po dohrání a jen pro shodné týmy; vyřeší pořadí a nasazení', async () => {
  const { q } = await setup();
  // Všechna utkání 1:1 a 1:1 → ve skupině úplná shoda všech pěti
  for (let id = 0; id < 20; id++) { await savePeriod(q, id, 1, { home: 1, away: 1 }, A); if (id !== 19) await savePeriod(q, id, 2, { home: 1, away: 1 }, A); }
  let M = await model(q);
  const idsB = M.teams.filter((t) => t.group === 'B').map((t) => t.id);
  await assert.rejects(setLots(q, 'B', { lots: Object.fromEntries(idsB.map((i, k) => [i, k + 1])) }, A), (e) => e.status === 409); // skupina B nedohrána
  await savePeriod(q, 19, 2, { home: 1, away: 1 }, A);
  M = await model(q);
  assert.equal(M.groups.A.pendingLots.length, 1);
  assert.equal(M.groups.A.pendingLots[0].ids.length, 5);
  const idsA = M.groups.A.pendingLots[0].ids;
  await assert.rejects(setLots(q, 'A', { lots: { [idsA[0]]: 1, [idsA[1]]: 1 } }, A), (e) => e.status === 409);
  await assert.rejects(setLots(q, 'A', { lots: Object.fromEntries(idsA.map((i) => [i, 1])) }, A), (e) => e.status === 422);
  await setLots(q, 'A', { lots: Object.fromEntries(idsA.map((i, k) => [i, 5 - k])) }, A);
  await setLots(q, 'B', { lots: Object.fromEntries(idsB.map((i, k) => [i, k + 1])) }, A);
  M = await model(q);
  assert.deepEqual(M.groups.A.rows.map((r) => r.id), [...idsA].reverse());
  assert.ok(M.groups.A.rows.every((r) => !r.tie));
  assert.equal(M.matches.find((m) => m.place === 1).home, idsA[4]);
});

test('Ruční pořadí: kontrola úplnosti, platí pro nasazení, návrat k automatice', async () => {
  const { q } = await setup();
  let M = await model(q);
  const A_ = M.teams.filter((t) => t.group === 'A').map((t) => t.id);
  const B_ = M.teams.filter((t) => t.group === 'B').map((t) => t.id);
  await assert.rejects(setManualOrder(q, { order: { A: [A_[0], A_[0], A_[1], A_[2], A_[3]], B: B_ } }, A), (e) => e.status === 422);
  await setManualOrder(q, { order: { A: [...A_].reverse(), B: B_ } }, A);
  M = await model(q);
  assert.equal(M.groups.A.manual, true);
  assert.equal(code(M, M.groups.A.rows[0].id), code(M, A_.at(-1)));
  assert.equal(M.matches.find((m) => m.place === 1).home, A_.at(-1));
  await setManualOrder(q, { order: null }, A);
  M = await model(q);
  assert.equal(M.groups.A.manual, false);
  assert.equal(M.matches.find((m) => m.place === 1).home, null);
});

test('Posun rozpisu: +10 min od 10:35 posune bloky i navázané obědy; minulost a zahájené obědy se nemění', async () => {
  const { q } = await setup();
  const at = (h, m) => h * 60 + m;
  const pre = await shiftSchedule(q, { blockId: 5, minutes: 10, mode: 'start' }, A, at(9, 0), false);
  assert.equal(pre.blocks[0].from[1], at(10, 45));
  assert.deepEqual(pre.lunches.map((l) => l.from), [[at(10, 45), at(10, 55)], [at(11, 10), at(11, 20)], [at(11, 35), at(11, 45)], [at(12, 0), at(12, 10)], [at(12, 25), at(12, 35)]]);
  let M = await model(q);
  assert.equal(M.blocks.find((b) => b.id === 5).from, at(10, 35)); // náhled nic nezměnil
  // Prodloužení probíhajícího bloku 11:25–12:00 o 5 min v 11:40: oběd 10:45 a 11:10 už začal, 11:35 také → zamrznou
  await shiftSchedule(q, { blockId: 7, minutes: 5, mode: 'extend' }, A, at(11, 40), true);
  M = await model(q);
  const b7 = M.blocks.find((b) => b.id === 7);
  assert.deepEqual([b7.from, b7.to], [at(11, 25), at(12, 5)]);
  assert.equal(M.blocks.find((b) => b.id === 8).from, at(12, 5));
  assert.deepEqual(M.lunches.map((l) => l.from), [at(10, 45), at(11, 10), at(11, 35), at(12, 5), at(12, 30)]);
  assert.equal(M.blocks.at(-1).to, at(18, 5));
  await assert.rejects(shiftSchedule(q, { blockId: 3, minutes: 5, mode: 'start' }, A, at(11, 40), true), (e) => e.status === 409); // minulost
  await assert.rejects(shiftSchedule(q, { blockId: 9, minutes: -30, mode: 'start' }, A, at(11, 40), true), (e) => e.status === 409); // překryv
  await assert.rejects(shiftSchedule(q, { blockId: 9, minutes: 0, mode: 'start' }, A, at(11, 40), true), (e) => e.status === 422);
});

test('Týmy a tipy', async () => {
  const { q } = await setup();
  await updateTeam(q, 2, { line1: 'HC Lev', line2: 'Benešov 2019', code: 'BEN', color: '#004b9b' }, A);
  let M = await model(q);
  assert.equal(M.teams.find((t) => t.id === 2).name, 'HC Lev Benešov 2019');
  await assert.rejects(updateTeam(q, 2, { line1: 'X', line2: '', code: 'VLA', color: '#000000' }, A), (e) => e.status === 409);
  await assert.rejects(updateTeam(q, 2, { line1: 'X', line2: '', code: 'b', color: '#000000' }, A), (e) => e.status === 422);
  await addTip(q, { title: 'Pizzerie Na náměstí', body: 'Rezervace doporučena', address: 'Vlašim, Palackého nám.', url: 'https://example.cz' }, A);
  await assert.rejects(addTip(q, { title: 'X', url: 'javascript:alert(1)' }, A), (e) => e.status === 422);
  M = await model(q);
  assert.equal(M.tips.length, 1);
  await deleteTip(q, M.tips[0].id, A);
  assert.equal((await model(q)).tips.length, 0);
});
