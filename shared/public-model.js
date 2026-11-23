// Veřejný model turnaje: jedna projekce pro mobilní web, stadion i PDF.
// Vstupem jsou surové řádky z databáze (viz worker/src/queries.js), výstupem čistý JSON.
import { rankGroup, groupFinished, pendingLots, seedPlacements, applyManualOrder, placementWinner } from './ranking.js';

const byId = (rows) => new Map(rows.map((r) => [r.id, r]));

/**
 * @param {object} raw { tournament, teams, members, blocks, matches, periods, shootouts, lots, lunches, lunchTeams }
 */
export function buildPublicModel(raw) {
  const t = raw.tournament;
  const memberOf = new Map(raw.members.map((m) => [m.team_id, m]));
  const teams = raw.teams
    .map((x) => {
      const m = memberOf.get(x.id);
      const v = x.logo_version || 0;
      return {
        id: x.id, code: x.code, name: x.name, lines: [x.line1, x.line2], color: x.color,
        group: m?.grp ?? null, slot: m?.slot ?? null,
        logo: v > 0
          ? { web: `/api/logo/${x.id}/${v}/web`, stadium: `/api/logo/${x.id}/${v}/stadium`, version: v }
          : { web: x.web_logo, stadium: x.stadium_logo, version: 0 },
      };
    })
    .sort((a, b) => (a.group || 'Z').localeCompare(b.group || 'Z') || a.slot - b.slot);

  const periodsOf = new Map();
  for (const p of [...raw.periods].sort((a, b) => a.no - b.no)) {
    if (!periodsOf.has(p.match_id)) periodsOf.set(p.match_id, []);
    periodsOf.get(p.match_id).push([p.home_goals, p.away_goals]);
  }
  const shootoutOf = new Map(raw.shootouts.map((s) => [s.match_id, s.winner]));

  // Skupiny
  const groupGames = (g) => raw.matches
    .filter((m) => m.place === null && memberOf.get(m.home_team)?.grp === g)
    .map((m) => ({ id: m.id, home: m.home_team, away: m.away_team, periods: periodsOf.get(m.id) || [] }));
  const manual = t.manual_order || null;
  const groups = {};
  for (const g of ['A', 'B']) {
    const ids = teams.filter((x) => x.group === g).map((x) => x.id);
    const lots = Object.fromEntries(raw.lots.filter((l) => l.grp === g).map((l) => [l.team_id, l.position]));
    const games = groupGames(g);
    const res = rankGroup(ids, games, lots);
    const isManual = Array.isArray(manual?.[g]);
    const rows = isManual ? applyManualOrder(res.rows, manual[g]) : res.rows;
    const finished = groupFinished(games);
    groups[g] = {
      started: res.started, finished, manual: isManual, rows,
      pendingLots: finished && !isManual ? pendingLots(rows) : [],
    };
  }

  // Nasazení do utkání o umístění
  const seeds = seedPlacements({
    rowsA: groups.A.rows, rowsB: groups.B.rows,
    finishedA: groups.A.finished, finishedB: groups.B.finished,
    manual: groups.A.manual && groups.B.manual,
  });
  const fromSeed = (seed) => {
    if (!seed) return null;
    const rank = Number(seed[0]);
    const s = seeds[rank - 1];
    return s ? s[seed[1]] : null;
  };

  const matches = raw.matches
    .map((m) => {
      const periods = periodsOf.get(m.id) || [];
      const placement = m.place !== null;
      const home = placement ? fromSeed(m.home_seed) : m.home_team;
      const away = placement ? fromSeed(m.away_seed) : m.away_team;
      const shootout = shootoutOf.get(m.id) || null;
      return {
        id: m.id, blockId: m.block_id, rink: m.rink, place: m.place,
        home, away, homeSeed: m.home_seed, awaySeed: m.away_seed,
        periods, shootout,
        winner: placement ? placementWinner(periods, shootout) : null,
      };
    })
    .sort((a, b) => a.id - b.id);

  const blocks = raw.blocks
    .map((b) => ({
      id: b.id, from: b.start_min, to: b.end_min, title: b.title,
      games: matches.filter((m) => m.blockId === b.id).sort((x, y) => x.rink.localeCompare(y.rink)).map((m) => m.id),
    }))
    .sort((a, b) => a.from - b.from);

  const blockMap = byId(blocks);
  const lunches = raw.lunches
    .map((l) => {
      const anchor = blockMap.get(l.anchor_block_id);
      const from = l.frozen_start ?? anchor.from + l.offset_min;
      return { id: l.id, from, to: from + l.length_min, teams: raw.lunchTeams.filter((x) => x.window_id === l.id).map((x) => x.team_id) };
    })
    .sort((a, b) => a.from - b.from);

  return {
    revision: Number(t.revision),
    tournament: {
      name: t.name, day: t.day, timeZone: t.time_zone,
      lunch: { price: t.lunch_price_czk, deadline: t.lunch_deadline, menu: t.lunch_menu },
    },
    teams, blocks, matches, groups, lunches,
  };
}
