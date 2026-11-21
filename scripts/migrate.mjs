// Spuštění migrací a seedu proti Neonu.
// Použití:  DATABASE_URL=… node scripts/migrate.mjs [--seed]
// Připojení musí být vlastník schématu (neondb_owner), BEZ poolingu.
import pg from 'pg';
import { migrate, seed } from '../db/apply.mjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Chybí DATABASE_URL (připojení vlastníka schématu bez poolingu).');
  process.exit(1);
}
if (/-pooler\./.test(url)) {
  console.error('DATABASE_URL míří na pooler. Pro migrace použij přímé připojení (vypni Connection pooling).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
await client.connect();
const host = new URL(url).hostname.split('.')[0];
console.log(`Připojeno k ${host}`);
const exec = (sql, params) => client.query(sql, params);
try {
  await migrate(exec);
  if (process.argv.includes('--seed')) await seed(exec);
  const counts = await client.query(`SELECT
    (SELECT count(*) FROM team) AS teams, (SELECT count(*) FROM match) AS matches,
    (SELECT count(*) FROM period) AS periods, (SELECT count(*) FROM lunch_order) AS orders,
    (SELECT count(*) FROM order_key) AS order_keys`);
  console.log('Stav:', counts.rows[0]);
} finally {
  await client.end();
}
