// SQL dotazy pro veřejný model. Stejné dotazy používají testy (PGlite) i Worker (Neon).
export const PUBLIC_QUERIES = {
  tournament: `SELECT id, name, to_char(day, 'YYYY-MM-DD') AS day, time_zone, revision::text AS revision, manual_order,
                 lunch_price_player_czk, lunch_price_staff_czk, to_char(lunch_deadline AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS lunch_deadline, lunch_menu
               FROM tournament WHERE id = $1`,
  teams: `SELECT id, code, name, line1, line2, color, web_logo, stadium_logo, logo_version FROM team ORDER BY id`,
  members: `SELECT team_id, grp, slot FROM group_member WHERE tournament_id = $1`,
  blocks: `SELECT id, start_min, end_min, title FROM block WHERE tournament_id = $1 ORDER BY start_min`,
  matches: `SELECT m.id, m.block_id, m.rink, m.place, m.home_team, m.away_team, m.home_seed, m.away_seed
            FROM match m JOIN block b ON b.id = m.block_id WHERE b.tournament_id = $1 ORDER BY m.id`,
  periods: `SELECT match_id, no, home_goals, away_goals FROM period ORDER BY match_id, no`,
  shootouts: `SELECT match_id, winner FROM shootout`,
  lots: `SELECT grp, team_id, position FROM lot WHERE tournament_id = $1`,
  lunches: `SELECT id, anchor_block_id, offset_min, length_min, frozen_start FROM lunch_window ORDER BY id`,
  lunchTeams: `SELECT window_id, team_id FROM lunch_window_team`,
  tips: `SELECT id, title, body, address, url FROM parent_tip ORDER BY sort, id`,
  // Veřejně jen počty – žádné e-maily ani poznámky.
  orders: `SELECT k.key, k.label, array_agg(kt.team_id ORDER BY kt.team_id) AS teams, o.players, o.staff
           FROM order_key k JOIN order_key_team kt ON kt.key = k.key LEFT JOIN lunch_order o ON o.key = k.key
           GROUP BY k.key, k.label, o.players, o.staff ORDER BY k.key`,
};

const WITH_TOURNAMENT = new Set(['tournament', 'members', 'blocks', 'matches', 'lots']);

/** Načte všechny řádky pro veřejný model. `query(sql, params)` vrací pole řádků. */
export async function loadPublicRaw(query, tournamentId) {
  const entries = await Promise.all(
    Object.entries(PUBLIC_QUERIES).map(async ([k, sql]) => [k, await query(sql, WITH_TOURNAMENT.has(k) ? [tournamentId] : [])]),
  );
  const raw = Object.fromEntries(entries);
  if (!raw.tournament.length) throw new Error('Turnaj není v databázi.');
  raw.tournament = raw.tournament[0];
  return raw;
}
