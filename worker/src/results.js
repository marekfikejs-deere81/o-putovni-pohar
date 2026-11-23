// Zápis výsledků a řízení turnaje správcem. Vše v transakci, s auditem a zvýšením revize.
// Ochrana rozehraných utkání o umístění: změna, která by změnila jejich účastníky, se odmítne.
import { ApiError } from './errors.js';
import { withTx, TOURNAMENT_ID } from './orders.js';
import { loadPublicRaw } from './queries.js';
import { buildPublicModel } from '../../shared/public-model.js';
import { validateLot } from '../../shared/ranking.js';

const T = TOURNAMENT_ID;
export const model = async (q) => buildPublicModel(await loadPublicRaw(q, T));
const int = (v) => (typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN);
const audit = (q, actor, action, before, after) =>
  q(`INSERT INTO audit_log (actor, action, before, after) VALUES ($1, $2, $3, $4)`, [actor, action, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]);
const bump = (q) => q(`UPDATE tournament SET revision = revision + 1 WHERE id = $1`, [T]);

const participants = (m) => m.matches.filter((x) => x.place).map((x) => ({ place: x.place, home: x.home, away: x.away, started: x.periods.length > 0 }));

/** Spustí změnu v transakci; pokud by změnila účastníky rozehraného utkání o umístění, vrátí ji zpět. */
async function guarded(q, fn) {
  return withTx(q, async () => {
    const before = participants(await model(q));
    const result = await fn();
    const after = participants(await model(q));
    for (const b of before.filter((x) => x.started)) {
      const a = after.find((x) => x.place === b.place);
      if (!a || a.home !== b.home || a.away !== b.away) {
        throw new ApiError(409, `Změna by změnila účastníky už rozehraného utkání o ${b.place}. místo. Nejdřív oprav nebo smaž jeho třetiny.`);
      }
    }
    await bump(q);
    return result;
  });
}

// ---------- třetiny ----------

export async function savePeriod(q, matchId, no, body, actor) {
  const n = Number(no);
  const home = int(body?.home);
  const away = int(body?.away);
  if (![1, 2].includes(n)) throw new ApiError(400, 'Utkání má jen 1. a 2. třetinu.');
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > 99 || away > 99) throw new ApiError(422, 'Zadej počty branek jako celá čísla 0 až 99.');
  return guarded(q, async () => {
    const m = (await model(q)).matches.find((x) => x.id === Number(matchId));
    if (!m) throw new ApiError(404, 'Zápas neexistuje.');
    if (m.place && (m.home == null || m.away == null)) throw new ApiError(409, 'Utkání o umístění ještě nemá nasazené týmy.');
    if (n === 2 && m.periods.length < 1) throw new ApiError(409, 'Nejdřív zapiš 1. třetinu.');
    const [prev] = await q(`SELECT home_goals, away_goals FROM period WHERE match_id = $1 AND no = $2`, [m.id, n]);
    await q(`INSERT INTO period (match_id, no, home_goals, away_goals, confirmed_by) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (match_id, no) DO UPDATE SET home_goals = EXCLUDED.home_goals, away_goals = EXCLUDED.away_goals,
             confirmed_by = EXCLUDED.confirmed_by, confirmed_at = now()`, [m.id, n, home, away, actor]);
    // Oprava třetiny může zrušit shodu bodů – nájezdy pak neplatí.
    if (m.place) await q(`DELETE FROM shootout WHERE match_id = $1`, [m.id]);
    await audit(q, actor, prev ? 'period.correct' : 'period.confirm', prev ? { match: m.id, no: n, score: [prev.home_goals, prev.away_goals] } : null, { match: m.id, no: n, score: [home, away] });
    return { ok: true };
  });
}

export async function deletePeriod(q, matchId, no, actor) {
  const n = Number(no);
  return guarded(q, async () => {
    const rows = await q(`SELECT no, home_goals, away_goals FROM period WHERE match_id = $1 ORDER BY no`, [Number(matchId)]);
    const last = rows.at(-1);
    if (!last || last.no !== n) throw new ApiError(409, 'Smazat lze jen poslední zapsanou třetinu.');
    await q(`DELETE FROM period WHERE match_id = $1 AND no = $2`, [Number(matchId), n]);
    await q(`DELETE FROM shootout WHERE match_id = $1`, [Number(matchId)]);
    await audit(q, actor, 'period.delete', { match: Number(matchId), no: n, score: [last.home_goals, last.away_goals] }, null);
    return { ok: true };
  });
}

// ---------- nájezdy ----------

export async function setShootout(q, matchId, body, actor) {
  const winner = body?.winner ?? null;
  return guarded(q, async () => {
    const m = (await model(q)).matches.find((x) => x.id === Number(matchId));
    if (!m || !m.place) throw new ApiError(404, 'Nájezdy se zapisují jen u utkání o umístění.');
    if (winner === null) {
      await q(`DELETE FROM shootout WHERE match_id = $1`, [m.id]);
    } else {
      if (!['home', 'away'].includes(winner)) throw new ApiError(422, 'Vyber vítěze nájezdů.');
      if (m.periods.length < 2) throw new ApiError(409, 'Nájezdy lze zapsat až po obou třetinách.');
      const pts = m.periods.reduce((s, [x, y]) => s + (x > y ? 1 : x < y ? -1 : 0), 0);
      if (pts !== 0) throw new ApiError(409, 'Utkání má vítěze podle bodů – nájezdy nejsou potřeba.');
      await q(`INSERT INTO shootout (match_id, winner, decided_by) VALUES ($1, $2, $3)
               ON CONFLICT (match_id) DO UPDATE SET winner = EXCLUDED.winner, decided_by = EXCLUDED.decided_by, decided_at = now()`, [m.id, winner, actor]);
    }
    await audit(q, actor, 'shootout.set', null, { match: m.id, winner });
    return { ok: true };
  });
}

// ---------- los a ruční pořadí ----------

export async function setLots(q, grp, body, actor) {
  if (!['A', 'B'].includes(grp)) throw new ApiError(404, 'Neznámá skupina.');
  const lots = body?.lots || {};
  return guarded(q, async () => {
    const G = (await model(q)).groups[grp];
    if (!G.finished) throw new ApiError(409, 'Los lze zadat až po dohrání skupiny.');
    const ids = Object.keys(lots).map(Number);
    const tie = G.pendingLots.find((t) => t.ids.length === ids.length && t.ids.every((i) => ids.includes(i)));
    if (!tie) throw new ApiError(409, 'Los se zadává jen pro týmy, které po všech kritériích sdílí příčku.');
    const errs = validateLot(tie.ids, Object.fromEntries(ids.map((i) => [i, int(lots[i])])));
    if (errs.length) throw new ApiError(422, errs[0]);
    for (const i of tie.ids) {
      await q(`INSERT INTO lot (tournament_id, grp, team_id, position, decided_by) VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (tournament_id, grp, team_id) DO UPDATE SET position = EXCLUDED.position, decided_by = EXCLUDED.decided_by, decided_at = now()`,
      [T, grp, i, int(lots[i]), actor]);
    }
    await audit(q, actor, 'lot.set', null, { grp, lots });
    return { ok: true };
  });
}

export async function clearLots(q, grp, actor) {
  return guarded(q, async () => {
    await q(`DELETE FROM lot WHERE tournament_id = $1 AND grp = $2`, [T, grp]);
    await audit(q, actor, 'lot.clear', null, { grp });
    return { ok: true };
  });
}

/** Ruční pořadí obou skupin ({A:[ids], B:[ids]}) nebo null = návrat k automatickému pořadí. */
export async function setManualOrder(q, body, actor) {
  const order = body?.order ?? null;
  return guarded(q, async () => {
    const M = await model(q);
    if (order !== null) {
      for (const g of ['A', 'B']) {
        const ids = M.teams.filter((t) => t.group === g).map((t) => t.id);
        const o = order[g];
        if (!Array.isArray(o) || o.length !== ids.length || new Set(o).size !== ids.length || !o.every((i) => ids.includes(i))) {
          throw new ApiError(422, `Ruční pořadí skupiny ${g} musí obsahovat každý tým skupiny právě jednou.`);
        }
      }
    }
    const [prev] = await q(`SELECT manual_order FROM tournament WHERE id = $1`, [T]);
    await q(`UPDATE tournament SET manual_order = $2 WHERE id = $1`, [T, order ? JSON.stringify(order) : null]);
    await audit(q, actor, 'manual_order.set', { order: prev?.manual_order ?? null }, { order });
    return { ok: true };
  });
}

// ---------- posun rozpisu ----------

/**
 * Náhled nebo provedení posunu. mode 'start' = posun začátku budoucího bloku (a všech dalších),
 * mode 'extend' = prodloužení právě probíhajícího bloku (další se posunou). nowMin = aktuální minuta dne turnaje
 * (mimo den turnaje -1, tj. vše je budoucí). Zahájené obědy se neposouvají (zamrznou).
 */
export async function shiftSchedule(q, body, actor, nowMin, apply) {
  const blockId = Number(body?.blockId);
  const delta = Number(body?.minutes);
  const mode = body?.mode === 'extend' ? 'extend' : 'start';
  if (!Number.isInteger(delta) || delta === 0 || delta < -60 || delta > 120) throw new ApiError(422, 'Posun zadej v minutách (−60 až +120, ne 0).');
  const run = async () => {
    const M = await model(q);
    const i = M.blocks.findIndex((b) => b.id === blockId);
    if (i < 0) throw new ApiError(404, 'Blok neexistuje.');
    const b = M.blocks[i];
    if (mode === 'start' && b.from <= nowMin) throw new ApiError(409, 'Začátek lze posunout jen u bloku, který ještě nezačal. Probíhající blok můžeš prodloužit.');
    if (mode === 'extend' && !(b.from <= nowMin && nowMin < b.to)) throw new ApiError(409, 'Prodloužit lze jen právě probíhající blok.');
    if (mode === 'extend' && b.to + delta <= Math.max(b.from, nowMin)) throw new ApiError(409, 'Blok by skončil dřív, než teď je.');
    if (mode === 'start') {
      const prevEnd = i > 0 ? M.blocks[i - 1].to : 0;
      if (b.from + delta < prevEnd) throw new ApiError(409, 'Blok by začal dřív, než skončí předchozí.');
      if (b.from + delta <= nowMin) throw new ApiError(409, 'Nový začátek by byl v minulosti.');
    }
    const changes = M.blocks.map((x, k) => {
      if (k < i) return null;
      if (k === i && mode === 'extend') return { id: x.id, title: x.title, games: x.games.length, from: [x.from, x.from], to: [x.to, x.to + delta] };
      return { id: x.id, title: x.title, games: x.games.length, from: [x.from, x.from + delta], to: [x.to, x.to + delta] };
    }).filter(Boolean);
    if (changes.at(-1).to[1] > 1440) throw new ApiError(409, 'Program by přesáhl půlnoc.');
    const moved = new Set(changes.filter((c) => c.from[0] !== c.from[1]).map((c) => c.id));
    const lunchRows = await q(`SELECT id, anchor_block_id, offset_min, length_min, frozen_start FROM lunch_window ORDER BY id`);
    const lunches = M.lunches.map((l) => {
      const row = lunchRows.find((r) => r.id === l.id);
      const started = l.from <= nowMin || row.frozen_start !== null;
      const moves = !started && moved.has(row.anchor_block_id);
      return { id: l.id, teams: l.teams, from: [l.from, moves ? l.from + delta : l.from], to: [l.to, moves ? l.to + delta : l.to], frozen: started, freezeNow: l.from <= nowMin && row.frozen_start === null };
    });
    if (apply) {
      for (const l of lunches.filter((x) => x.freezeNow)) await q(`UPDATE lunch_window SET frozen_start = $2 WHERE id = $1`, [l.id, l.from[0]]);
      for (const c of changes) await q(`UPDATE block SET start_min = $2, end_min = $3 WHERE id = $1`, [c.id, c.from[1], c.to[1]]);
      await audit(q, actor, 'schedule.shift', { blockId, mode }, { minutes: delta, blocks: changes.map((c) => [c.id, c.from[1], c.to[1]]) });
      await bump(q);
    }
    return { mode, minutes: delta, blocks: changes, lunches: lunches.filter((l) => l.from[0] !== l.from[1] || l.freezeNow) };
  };
  return apply ? withTx(q, run) : run();
}

// ---------- týmy a tipy ----------

export async function updateTeam(q, id, body, actor) {
  const line1 = String(body?.line1 ?? '').trim();
  const line2 = String(body?.line2 ?? '').trim();
  const code = String(body?.code ?? '').trim().toUpperCase();
  const color = String(body?.color ?? '').trim();
  if (!line1 || line1.length > 30 || line2.length > 30) throw new ApiError(422, 'Název: první řádek povinný, každý řádek nejvýše 30 znaků.');
  if (!/^[A-Z]{2,4}$/.test(code)) throw new ApiError(422, 'Zkratka musí mít 2–4 velká písmena.');
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new ApiError(422, 'Barva ve tvaru #RRGGBB.');
  return withTx(q, async () => {
    const [prev] = await q(`SELECT name, line1, line2, code, color FROM team WHERE id = $1`, [Number(id)]);
    if (!prev) throw new ApiError(404, 'Tým neexistuje.');
    const dup = await q(`SELECT 1 FROM team WHERE code = $1 AND id <> $2`, [code, Number(id)]);
    if (dup.length) throw new ApiError(409, 'Tuto zkratku už má jiný tým.');
    const name = [line1, line2].filter(Boolean).join(' ');
    await q(`UPDATE team SET name = $2, line1 = $3, line2 = $4, code = $5, color = $6 WHERE id = $1`, [Number(id), name, line1, line2, code, color]);
    await audit(q, actor, 'team.update', prev, { name, line1, line2, code, color });
    await bump(q);
    return { ok: true };
  });
}

export async function addTip(q, body, actor) {
  const title = String(body?.title ?? '').trim();
  const text = String(body?.body ?? '').trim();
  const address = String(body?.address ?? '').trim();
  const url = String(body?.url ?? '').trim();
  const web = String(body?.web ?? '').trim();
  if (!title || title.length > 90) throw new ApiError(422, 'Název je povinný (max. 90 znaků).');
  if (text.length > 550 || address.length > 150) throw new ApiError(422, 'Text je příliš dlouhý.');
  if (url && !/^https:\/\/[^\s]+$/.test(url)) throw new ApiError(422, 'Odkaz na mapy musí začínat https://');
  if (web && !/^https?:\/\/[^\s]+$/.test(web)) throw new ApiError(422, 'Odkaz na web musí začínat https:// nebo http://');
  if (url.length > 600 || web.length > 600) throw new ApiError(422, 'Odkaz je příliš dlouhý.');
  return withTx(q, async () => {
    const [{ s }] = await q(`SELECT COALESCE(max(sort), 0) + 1 AS s FROM parent_tip`);
    await q(`INSERT INTO parent_tip (title, body, address, url, web_url, sort) VALUES ($1, $2, $3, $4, $5, $6)`, [title, text, address, url, web, s]);
    await audit(q, actor, 'tip.add', null, { title });
    await bump(q);
    return { ok: true };
  });
}

export async function deleteTip(q, id, actor) {
  return withTx(q, async () => {
    const r = await q(`DELETE FROM parent_tip WHERE id = $1 RETURNING title`, [Number(id)]);
    if (!r.length) throw new ApiError(404, 'Tip neexistuje.');
    await audit(q, actor, 'tip.delete', { title: r[0].title }, null);
    await bump(q);
    return { ok: true };
  });
}

/** Posledních 50 záznamů auditu pro správce. */
export const auditLog = (q) => q(`SELECT id, at, actor, action, before, after FROM audit_log ORDER BY id DESC LIMIT 50`);
