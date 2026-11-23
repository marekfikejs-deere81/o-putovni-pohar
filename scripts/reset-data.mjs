// Smaže provozní data turnaje (výsledky, objednávky, odkazy týmů, frontu e-mailů, tipy, PDF, historii změn)
// a vrátí nastavení turnaje do výchozího stavu. Ponechá: týmy, rozpis, správce a spárovaný Gmail.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { toMinutes } from '../shared/schedule.js';

if (process.env.CONFIRM !== 'SMAZAT') { console.error('Pro smazání zadej CONFIRM=SMAZAT.'); process.exit(1); }
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const q = (t, p) => c.query(t, p);
const blocks = JSON.parse(readFileSync(new URL('../data/harmonogram.json', import.meta.url), 'utf8'));
await q('BEGIN');
try {
  const tables = ['order_fail', 'shootout', 'period', 'lot', 'lunch_order_history', 'lunch_order', 'request_key', 'team_access',
    'mail_outbox', 'parent_tip', 'report_pdf', 'propozice_pdf', 'oauth_state', 'audit_log'];
  for (const t of tables) { const r = await q(`DELETE FROM ${t}`); console.log(`✓ ${t}: smazáno ${r.rowCount}`); }
  for (const b of blocks) await q('UPDATE block SET start_min = $2, end_min = $3 WHERE id = $1', [b.id, toMinutes(b.start), toMinutes(b.end)]);
  await q('UPDATE lunch_window SET frozen_start = NULL');
  await q(`UPDATE tournament SET manual_order = NULL, lunch_price_player_czk = 140, lunch_price_staff_czk = 150,
           lunch_menu = 'Hovězí vývar, špagety s boloňskou omáčkou, šťáva', lunch_deadline = '2026-12-13T00:00:00+01:00', revision = revision + 1`);
  await q('COMMIT');
  const [{ n }] = (await q('SELECT count(*)::int n FROM team')).rows;
  const [{ a }] = (await q('SELECT count(*)::int a FROM admin_user')).rows;
  const [{ g }] = (await q("SELECT count(*)::int g FROM oauth_account WHERE provider = 'google'")).rows;
  console.log(`✓ hotovo · týmů ${n} · správců ${a} · Gmail ${g ? 'spárován' : 'nespárován'}`);
} catch (e) { await q('ROLLBACK'); throw e; }
await c.end();
