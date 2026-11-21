// Jediná implementace bodování, pořadí, minitabulky, losu, nasazení a ručního pořadí.
// Používá ji mobilní web, stadion, Worker i PDF. Bez závislostí, čisté funkce.
//
// Konvence:
//  - Třetina je dvojice [branky domácích, branky hostů]. Pole `periods` obsahuje jen
//    POTVRZENÉ třetiny v pořadí 1, 2. Nezadaná třetina v poli není (není to 0:0).
//  - Body za třetinu: výhra 2, remíza 1, prohra 0.
//  - Los: objekt { teamId: pořadí v losu (1 = nejlepší) } pro danou skupinu.

/** Body jednoho týmu za jednu třetinu. */
export const periodPoints = (own, opp) => (own > opp ? 2 : own === opp ? 1 : 0);

/** Kontrola tvaru zápisu jednoho utkání. Vrací seznam chyb (česky). */
export function validatePeriods(periods) {
  const errors = [];
  if (!Array.isArray(periods)) return ['Třetiny musí být pole.'];
  if (periods.length > 2) errors.push('Utkání má nejvýše dvě třetiny.');
  periods.forEach((p, i) => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((n) => Number.isInteger(n) && n >= 0 && n <= 99)) {
      errors.push(`Třetina ${i + 1}: počty branek musí být nezáporná celá čísla.`);
    }
  });
  return errors;
}

function emptyRow(id) {
  return { id, points: 0, goalsFor: 0, goalsAgainst: 0, played: 0, periods: 0, wins: 0, draws: 0, losses: 0 };
}

/** Statistiky týmů `ids` jen z utkání, kde jsou oba soupeři v `ids`. */
export function stats(ids, games) {
  const set = new Set(ids);
  const rows = new Map(ids.map((id) => [id, emptyRow(id)]));
  for (const g of games) {
    if (!set.has(g.home) || !set.has(g.away)) continue;
    const h = rows.get(g.home);
    const a = rows.get(g.away);
    for (const [x, y] of g.periods || []) {
      h.goalsFor += x; h.goalsAgainst += y;
      a.goalsFor += y; a.goalsAgainst += x;
      h.points += periodPoints(x, y);
      a.points += periodPoints(y, x);
      h.periods++; a.periods++;
      if (x > y) { h.wins++; a.losses++; } else if (x < y) { h.losses++; a.wins++; } else { h.draws++; a.draws++; }
    }
    if ((g.periods || []).length === 2) { h.played++; a.played++; }
  }
  return rows;
}

/** Rozdělí týmy do skupin podle hodnoty kritéria (vyšší = lepší), zachová pořadí vstupu. */
function splitBy(ids, value) {
  const buckets = new Map();
  for (const id of ids) {
    const key = value(id);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(id);
  }
  return [...buckets.keys()].sort((a, b) => b - a).map((k) => buckets.get(k));
}

const goalCriteria = (rows) => [
  (i) => rows.get(i).goalsFor - rows.get(i).goalsAgainst, // rozdíl branek
  (i) => rows.get(i).goalsFor, // více vstřelených
  (i) => -rows.get(i).goalsAgainst, // méně obdržených
];

/**
 * Automatické pořadí jedné skupiny podle schválených pravidel.
 * @param {Array<string|number>} teamIds týmy skupiny v pořadí nastavení (nasazení)
 * @param {Array<{home, away, periods}>} games skupinová utkání
 * @param {Object} lots výsledek losu { teamId: pořadí }
 * @returns {{rows: Array, started: boolean}} rows ve výsledném pořadí s rank a tie
 */
export function rankGroup(teamIds, games, lots = {}) {
  const all = stats(teamIds, games);

  function resolve(ids) {
    if (ids.length === 1) return [ids];
    const mutual = games.filter(
      (g) => ids.includes(g.home) && ids.includes(g.away) && (g.periods || []).length > 0,
    );
    const mini = stats(ids, mutual);
    const criteria =
      ids.length === 2
        ? mutual.length ? [(i) => mini.get(i).goalsFor - mini.get(i).goalsAgainst] : []
        : [(i) => mini.get(i).points, ...goalCriteria(mini)];
    for (const criterion of [...criteria, ...goalCriteria(all)]) {
      const buckets = splitBy(ids, criterion);
      if (buckets.length > 1) return buckets.flatMap(resolve);
    }
    // Los: platí jen pokud má každý tým v shodě vlastní číslo.
    const nums = ids.map((i) => lots?.[i]);
    if (nums.every((n) => Number.isInteger(n)) && new Set(nums).size === ids.length) {
      return splitBy(ids, (i) => -lots[i]);
    }
    return [ids];
  }

  const buckets = splitBy(teamIds, (i) => all.get(i).points).flatMap(resolve);
  let position = 1;
  const rows = buckets.flatMap((ids) => {
    const rank = position;
    position += ids.length;
    return ids.map((id) => ({ ...all.get(id), rank, tie: ids.length > 1 }));
  });
  const started = games.some((g) => (g.periods || []).length > 0);
  return { rows, started };
}

/** Jsou všechna skupinová utkání dohraná (obě třetiny)? */
export const groupFinished = (games) => games.length > 0 && games.every((g) => (g.periods || []).length === 2);

/** Skupiny týmů, které po dohrání skupiny stále sdílí příčku a čekají na los. */
export function pendingLots(rows) {
  const byRank = new Map();
  for (const r of rows) if (r.tie) (byRank.get(r.rank) || byRank.set(r.rank, []).get(r.rank)).push(r.id);
  return [...byRank.entries()].map(([rank, ids]) => ({ rank, ids }));
}

/** Ověří výsledek losu pro jednu shodnou skupinu: unikátní čísla 1..k. */
export function validateLot(ids, lot) {
  const nums = ids.map((i) => lot?.[i]);
  const ok = nums.every((n) => Number.isInteger(n) && n >= 1 && n <= ids.length) && new Set(nums).size === ids.length;
  return ok ? [] : [`Los musí přidělit každému z ${ids.length} týmů jiné číslo 1 až ${ids.length}.`];
}

/** Ruční pořadí pořadatele: příčky podle zadaného pořadí, statistiky dál ze zápisů. */
export function applyManualOrder(rows, order) {
  if (!Array.isArray(order) || order.length !== rows.length || new Set(order).size !== rows.length) {
    throw new Error('Ruční pořadí musí obsahovat každý tým skupiny právě jednou.');
  }
  return order.map((id, i) => {
    const r = rows.find((x) => x.id === id);
    if (!r) throw new Error('Ruční pořadí obsahuje tým mimo skupinu.');
    return { ...r, rank: i + 1, tie: false };
  });
}

/**
 * Nasazení do utkání o umístění. Vrací pole podle příčky (1..n): { place, A, B }.
 * A/B je id týmu, nebo null, pokud příčka ještě není jednoznačná.
 * Bez ručního pořadí se nasazuje až po dohrání obou skupin.
 */
export function seedPlacements({ rowsA, rowsB, finishedA, finishedB, manual = false }) {
  const n = Math.max(rowsA.length, rowsB.length);
  const ready = manual || (finishedA && finishedB);
  const pick = (rows, r) => {
    if (!ready) return null;
    const hit = rows.filter((x) => x.rank === r);
    return hit.length === 1 && !hit[0].tie ? hit[0].id : null;
  };
  return Array.from({ length: n }, (_, k) => ({ place: 2 * k + 1, A: pick(rowsA, k + 1), B: pick(rowsB, k + 1) }));
}

/**
 * Ochrana rozehraných utkání o umístění. `started` je seznam čísel umístění (1, 3, 5…),
 * jejichž utkání má aspoň jednu potvrzenou třetinu. Vrací seznam chyb.
 */
export function guardStartedPlacements(currentSeeds, nextSeeds, started) {
  const errors = [];
  for (const place of started) {
    const cur = currentSeeds.find((s) => s.place === place);
    const nxt = nextSeeds.find((s) => s.place === place);
    if (!cur || !nxt || cur.A !== nxt.A || cur.B !== nxt.B) {
      errors.push(`Utkání o ${place}. místo už je rozehrané, jeho účastníky nelze změnit.`);
    }
  }
  return errors;
}

/**
 * Vítěz utkání o umístění: součet bodů za třetiny, při shodě rozhodující nájezdy.
 * @returns 'home' | 'away' | null (nedohráno nebo chybí nájezdy)
 */
export function placementWinner(periods, shootoutWinner = null) {
  if (!periods || periods.length < 2) return null;
  let h = 0;
  let a = 0;
  for (const [x, y] of periods) { h += periodPoints(x, y); a += periodPoints(y, x); }
  if (h !== a) return h > a ? 'home' : 'away';
  return shootoutWinner === 'home' || shootoutWinner === 'away' ? shootoutWinner : null;
}

/** Text veřejné příčky: před první potvrzenou třetinou skupiny „–“. */
export const rankLabel = (row, started) => (started ? `${row.rank}.` : '–');
