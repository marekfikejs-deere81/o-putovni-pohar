// Migrace, granty a seed. Funkce dostávají `exec(sql, params)` – v CI je to pg, v testech PGlite.
import { readFileSync, readdirSync } from 'node:fs';
import { toMinutes } from '../shared/schedule.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const json = (p) => JSON.parse(read(p));

export const TOURNAMENT_ID = 'vlasim-2026';

/** Spustí dosud neprovedené migrace (každá ve vlastní transakci) a poté granty. */
export async function migrate(exec, log = console.log) {
  await exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await exec('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = readdirSync(new URL('db/migrations/', root)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    await exec('BEGIN');
    try {
      await exec(read(`db/migrations/${f}`));
      await exec('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      await exec('COMMIT');
      log(`✓ migrace ${f}`);
    } catch (e) {
      await exec('ROLLBACK');
      throw new Error(`Migrace ${f} selhala: ${e.message}`);
    }
  }
  await exec(read('db/grants.sql'));
  log('✓ granty app_runtime');
}

/**
 * Seed ostrého turnaje: doplní jen chybějící řádky (ON CONFLICT DO NOTHING).
 * Opakované spuštění nikdy nesmaže ani nepřepíše výsledky, objednávky ani úpravy z Adminu.
 */
export async function seed(exec, log = console.log) {
  const teams = json('data/tymy.json');
  const blocks = json('data/harmonogram.json');
  const lunches = json('data/obedy.json');
  const id = new Map(teams.map((t) => [t.code, t.id]));
  const T = TOURNAMENT_ID;

  await exec('BEGIN');
  try {
    await exec(
      `INSERT INTO tournament (id, name, day, time_zone, lunch_price_player_czk, lunch_price_staff_czk, lunch_deadline, lunch_menu)
       VALUES ($1, $2, '2026-12-28', 'Europe/Prague', 140, 170, '2026-12-13T00:00:00+01:00', $3)
       ON CONFLICT (id) DO NOTHING`,
      [T, 'Vánoční turnaj 2. tříd o Putovní pohár', 'Hovězí vývar, špagety s boloňskou omáčkou, šťáva'],
    );
    for (const t of teams) {
      await exec(
        `INSERT INTO team (id, code, name, line1, line2, color, web_logo, stadium_logo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [t.id, t.code, t.name, t.lines[0], t.lines[1], t.color, t.web, t.stadium],
      );
      await exec(
        `INSERT INTO group_member (tournament_id, team_id, grp, slot) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [T, t.id, t.group, t.slot],
      );
    }
    for (const b of blocks) {
      await exec(
        `INSERT INTO block (id, tournament_id, start_min, end_min, title) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
        [b.id, T, toMinutes(b.start), toMinutes(b.end), b.title],
      );
      for (const g of b.games) {
        const group = g.place === null;
        await exec(
          `INSERT INTO match (id, block_id, rink, place, home_team, away_team, home_seed, away_seed)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
          [g.id, b.id, g.rink, g.place, group ? id.get(g.home) : null, group ? id.get(g.away) : null,
            group ? null : g.home, group ? null : g.away],
        );
      }
    }
    for (const [i, l] of lunches.entries()) {
      await exec(
        `INSERT INTO lunch_window (id, anchor_block_id, offset_min, length_min) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
        [i + 1, l.anchorBlockId, l.offsetMinutes, toMinutes(l.end) - toMinutes(l.start)],
      );
      for (const code of l.teams) {
        await exec(`INSERT INTO lunch_window_team (window_id, team_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [i + 1, id.get(code)]);
      }
    }
    // Objednatelé: Vlašim A + B společně (VLS), ostatních osm po jednom.
    const keys = [['VLS', 'HC Rytíři Vlašim A + B', ['VLA', 'VLB']],
      ...teams.filter((t) => !['VLA', 'VLB'].includes(t.code)).map((t) => [t.code, t.name, [t.code]])];
    for (const [key, label, codes] of keys) {
      await exec(`INSERT INTO order_key (key, label) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`, [key, label]);
      for (const code of codes) {
        await exec(`INSERT INTO order_key_team (key, team_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [key, id.get(code)]);
      }
    }
    await exec('COMMIT');
  } catch (e) {
    await exec('ROLLBACK');
    throw e;
  }
  log(`✓ seed: ${teams.length} týmů, ${blocks.length} bloků, ${blocks.flatMap((b) => b.games).length} utkání, ${lunches.length} obědových oken`);
}
