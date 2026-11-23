import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migrate, seed, TOURNAMENT_ID } from '../db/apply.mjs';
import { loadPublicRaw } from '../worker/src/queries.js';
import { buildPublicModel } from '../shared/public-model.js';

async function setup() {
  const db = new PGlite();
  const exec = (sql, params) => (params ? db.query(sql, params) : db.exec(sql).then((r) => r.at(-1) || { rows: [] }));
  await migrate(exec, () => {});
  await seed(exec, () => {});
  const query = async (sql, params = []) => (await db.query(sql, params)).rows;
  const model = async () => buildPublicModel(await loadPublicRaw(query, TOURNAMENT_ID));
  return { exec, model };
}

const P = (m, no, h, a) => `INSERT INTO period (match_id, no, home_goals, away_goals, confirmed_by) VALUES (${m}, ${no}, ${h}, ${a}, 't')`;

test('Prázdný turnaj: model ze seedu, pořadí „–“, obědy z kotev, nasazení prázdné', async () => {
  const { model } = await setup();
  const m = await model();
  assert.equal(m.revision, 0);
  assert.equal(m.teams.length, 10);
  assert.deepEqual(m.teams.filter((t) => t.group === 'A').map((t) => t.code), ['VLA', 'BEN', 'CEB', 'MBL', 'LIT']);
  assert.equal(m.blocks.length, 20);
  assert.equal(m.blocks[0].from, 480);
  assert.equal(m.blocks.at(-1).to, 1080);
  assert.equal(m.matches.length, 25);
  assert.equal(m.groups.A.started, false);
  assert.ok(m.matches.filter((x) => x.place).every((x) => x.home === null && x.away === null));
  assert.deepEqual(m.lunches.map((l) => l.from), [645, 670, 695, 720, 745]); // 10:45, 11:10, 11:35, 12:00, 12:25
  assert.equal(m.tournament.lunch.deadline, '2026-12-12T23:00:00Z');
  assert.deepEqual(m.tournament.lunch.prices, { player: 140, staff: 150 });
});

test('Přejímka 0:0 a 1:2 + 5:3 přes databázi', async () => {
  const { exec, model } = await setup();
  await exec(P(0, 1, 0, 0)); // VLA × BEN
  let m = await model();
  const row = (g, code) => m.groups[g].rows.find((r) => r.id === m.teams.find((t) => t.code === code).id);
  assert.equal(m.groups.A.started, true);
  assert.equal(m.groups.B.started, false);
  assert.deepEqual([row('A', 'VLA').points, row('A', 'VLA').periods, row('A', 'VLA').draws], [1, 1, 1]);
  await exec(P(1, 1, 1, 2)); // VLB × KOB
  await exec(P(1, 2, 5, 3));
  m = await model();
  const vlb = row('B', 'VLB');
  assert.deepEqual([vlb.goalsFor, vlb.goalsAgainst, vlb.points, vlb.played], [6, 5, 2, 1]);
  assert.deepEqual(m.matches.find((x) => x.id === 1).periods, [[1, 2], [5, 3]]);
});

test('Po dohrání obou skupin se nasadí utkání o umístění a vítěz finále jde z bodů / nájezdů', async () => {
  const { exec, model } = await setup();
  // Domácí vyhrají každou třetinu 1:0 → pořadí čistě podle počtu domácích výher.
  for (let id = 0; id < 20; id++) { await exec(P(id, 1, 1, 0)); await exec(P(id, 2, 1, 0)); }
  let m = await model();
  assert.ok(m.groups.A.finished && m.groups.B.finished);
  const placement = m.matches.filter((x) => x.place);
  assert.ok(placement.every((x) => x.home !== null && x.away !== null), JSON.stringify(m.groups.A.rows.map((r) => [r.id, r.rank, r.tie])));
  const final = placement.find((x) => x.place === 1);
  assert.equal(final.home, m.groups.A.rows[0].id);
  assert.equal(final.away, m.groups.B.rows[0].id);
  await exec(P(final.id, 1, 2, 1));
  await exec(P(final.id, 2, 0, 3)); // 2:2 body
  m = await model();
  assert.equal(m.matches.find((x) => x.place === 1).winner, null);
  await exec(`INSERT INTO shootout (match_id, winner, decided_by) VALUES (${final.id}, 'away', 't')`);
  m = await model();
  assert.equal(m.matches.find((x) => x.place === 1).winner, 'away');
});
