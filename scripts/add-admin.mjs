// Jednorázový privilegovaný krok: přiřadí roli správce existujícímu účtu Neon Auth podle e-mailu.
// Spouští se jen ručně (workflow „Správce – přidat“) s vlastnickým připojením (neondb_owner).
import pg from 'pg';

const url = process.env.DATABASE_URL;
const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
if (!url || !email) { console.error('Chybí DATABASE_URL nebo ADMIN_EMAIL.'); process.exit(1); }

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
await c.connect();
try {
  const t = await c.query(`SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'neon_auth' AND column_name = 'email' AND table_name IN ('user', 'users', 'users_sync') ORDER BY table_name`);
  if (!t.rows.length) throw new Error('Ve schématu neon_auth nebyla nalezena tabulka uživatelů.');
  const table = t.rows[0].table_name;
  const u = await c.query(`SELECT id::text AS id, email FROM neon_auth."${table}" WHERE lower(email) = $1`, [email]);
  if (u.rows.length !== 1) throw new Error(`Účet ${email} v Neon Auth neexistuje (nalezeno ${u.rows.length}). Nejdřív se zaregistruj v Adminu.`);
  const { id } = u.rows[0];
  await c.query('BEGIN');
  await c.query(`INSERT INTO admin_user (auth_user_id, email) VALUES ($1, $2)
    ON CONFLICT (auth_user_id) DO UPDATE SET email = EXCLUDED.email`, [id, email]);
  await c.query(`INSERT INTO audit_log (actor, action, after) VALUES ('ci:add-admin', 'admin_user.add', $1)`, [JSON.stringify({ email })]);
  await c.query('COMMIT');
  const n = await c.query('SELECT count(*)::int AS n FROM admin_user');
  console.log(`✓ Správce ${email} přiřazen (tabulka neon_auth.${table}). Správců celkem: ${n.rows[0].n}`);
} finally {
  await c.end();
}
