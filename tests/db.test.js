import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migrate, seed } from '../db/apply.mjs';

async function fresh() {
  const db = new PGlite();
  const exec = (sql, params) => (params ? db.query(sql, params) : db.exec(sql).then((r) => r.at(-1) || { rows: [] }));
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  return { db, exec, q };
}
const quiet = () => {};

test('Migrace + seed: 10 týmů, 20 + 5 utkání, 4 okna, 9 objednatelů, žádné výsledky', async () => {
  const { exec, q } = await fresh();
  await migrate(exec, quiet);
  await seed(exec, quiet);
  const [c] = await q(`SELECT (SELECT count(*)::int FROM team) t, (SELECT count(*)::int FROM match WHERE place IS NULL) g,
    (SELECT count(*)::int FROM match WHERE place IS NOT NULL) p, (SELECT count(*)::int FROM lunch_window) w,
    (SELECT count(*)::int FROM order_key) k, (SELECT count(*)::int FROM order_key_team) kt,
    (SELECT count(*)::int FROM period) per, (SELECT count(*)::int FROM lunch_order) o`);
  assert.deepEqual(c, { t: 10, g: 20, p: 5, w: 4, k: 9, kt: 10, per: 0, o: 0 });
  const [vls] = await q(`SELECT array_agg(t.code ORDER BY t.code) codes FROM order_key_team k JOIN team t ON t.id = k.team_id WHERE k.key = 'VLS'`);
  assert.deepEqual(vls.codes, ['VLA', 'VLB']);
  const [dl] = await q(`SELECT to_char(lunch_deadline AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') utc FROM tournament`);
  assert.equal(dl.utc, '2026-12-12 23:00');
});

test('Opakovaný seed a migrace nesmažou výsledky, objednávky ani přejmenování', async () => {
  const { exec, q } = await fresh();
  await migrate(exec, quiet);
  await seed(exec, quiet);
  await exec(`INSERT INTO period (match_id, no, home_goals, away_goals, confirmed_by) VALUES (0, 1, 0, 0, 'test')`);
  await exec(`INSERT INTO lunch_order (key, players, staff, email, updated_by) VALUES ('BEN', 12, 3, 'ben@example.cz', 'test')`);
  await exec(`UPDATE team SET name = 'HC Lev Benešov (nový)' WHERE code = 'BEN'`);
  await migrate(exec, quiet);
  await seed(exec, quiet);
  const [c] = await q(`SELECT (SELECT count(*)::int FROM period) per, (SELECT count(*)::int FROM lunch_order) o,
    (SELECT name FROM team WHERE code = 'BEN') n, (SELECT count(*)::int FROM schema_migrations) m`);
  assert.deepEqual(c, { per: 1, o: 1, n: 'HC Lev Benešov (nový)', m: 7 });
});

test('Databáze odmítne neplatné zápisy', async () => {
  const { exec } = await fresh();
  await migrate(exec, quiet);
  await seed(exec, quiet);
  const bad = [
    `INSERT INTO period (match_id, no, home_goals, away_goals, confirmed_by) VALUES (0, 3, 0, 0, 't')`, // jen třetiny 1–2
    `INSERT INTO period (match_id, no, home_goals, away_goals, confirmed_by) VALUES (0, 1, -1, 0, 't')`, // záporné branky
    `INSERT INTO lunch_order (key, players, staff, note, email, updated_by) VALUES ('KOB', 1, 1, repeat('x', 101), 'a@b.cz', 't')`, // poznámka 101 znaků
    `INSERT INTO lunch_order (key, players, staff, email, updated_by) VALUES ('KOB', -1, 0, 'a@b.cz', 't')`, // záporný počet
    `INSERT INTO lunch_order (key, players, staff, email, updated_by) VALUES ('KOB', 1, 0, 'neni-email', 't')`,
    `INSERT INTO match (id, block_id, rink, place, home_team, away_team) VALUES (99, 0, 'A', NULL, 0, 2)`, // plocha A v bloku už obsazena
    `INSERT INTO logo_upload (team_id, version, variant, mime, width, height, bytes) VALUES (0, 1, 'web', 'image/png', 100, 100, decode(repeat('00', 524289), 'hex'))`, // > 512 KiB
  ];
  for (const sql of bad) await assert.rejects(exec(sql), undefined, sql);
  await exec(`INSERT INTO lunch_order (key, players, staff, note, email, updated_by) VALUES ('KOB', 1, 1, repeat('x', 100), 'a@b.cz', 't')`);
});

test('Granty: app_runtime nesmí zapsat správce, smí zapsat třetinu', async () => {
  const { exec, q } = await fresh();
  await exec(`CREATE ROLE app_runtime`);
  await migrate(exec, quiet);
  await seed(exec, quiet);
  const [r] = await q(`SELECT has_table_privilege('app_runtime', 'admin_user', 'INSERT') admin_ins,
    has_table_privilege('app_runtime', 'admin_user', 'SELECT') admin_sel,
    has_table_privilege('app_runtime', 'period', 'INSERT') period_ins,
    has_table_privilege('app_runtime', 'audit_log', 'UPDATE') audit_upd,
    has_table_privilege('app_runtime', 'schema_migrations', 'SELECT') mig_sel`);
  assert.deepEqual(r, { admin_ins: false, admin_sel: true, period_ins: true, audit_upd: false, mig_sel: false });
});
