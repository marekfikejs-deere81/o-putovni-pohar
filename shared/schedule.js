// Časy rozpisu. Všechny časy jsou místní (Europe/Prague), v minutách od půlnoci.
// Blok platí od začátku včetně do konce bez něj.

export const TIME_ZONE = 'Europe/Prague';

export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Bloky převedené na minuty, seřazené podle začátku. */
export const normalizeBlocks = (blocks) =>
  blocks
    .map((b) => ({ ...b, from: toMinutes(b.start), to: toMinutes(b.end) }))
    .sort((a, b) => a.from - b.from);

/** Blok, který právě probíhá, nebo null (před začátkem / po konci programu). */
export const blockAt = (blocks, minute) => blocks.find((b) => b.from <= minute && minute < b.to) || null;

/** Nejbližší budoucí blok s utkáními (pro „Připraví se“). */
export const nextGameBlock = (blocks, minute) => blocks.find((b) => b.from > minute && b.games.length) || null;

/** Nejbližší budoucí blok jakéhokoli druhu. */
export const nextBlock = (blocks, minute) => blocks.find((b) => b.from > minute) || null;

/** Celé minuty do začátku, zaokrouhleno nahoru (vstup v sekundách dne). */
export const minutesUntil = (startMinute, nowSeconds) => Math.max(0, Math.ceil((startMinute * 60 - nowSeconds) / 60));

/** Obědová okna odvozená z kotevního bloku a posunu (po změně rozpisu se posunou s blokem). */
export function lunchWindows(lunches, blocks) {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  return lunches.map((l) => {
    const anchor = byId.get(l.anchorBlockId);
    if (!anchor) throw new Error(`Oběd ${l.teams.join('+')}: neznámý kotevní blok ${l.anchorBlockId}`);
    const from = anchor.from + l.offsetMinutes;
    const length = toMinutes(l.end) - toMinutes(l.start);
    return { ...l, from, to: from + length };
  });
}

/**
 * Fáze rotace při úpravě ledu: 0–9 s křížová A, 10–19 křížová B, 20–29 pořadí A, 30–39 pořadí B.
 * Počítá se z uplynulého času bloku, takže refresh naváže.
 */
export function icePhase(blockFromMinute, nowSeconds) {
  const elapsed = Math.max(0, nowSeconds - blockFromMinute * 60);
  const slot = Math.floor((elapsed % 40) / 10);
  return [
    { view: 'krizova', group: 'A' },
    { view: 'krizova', group: 'B' },
    { view: 'poradi', group: 'A' },
    { view: 'poradi', group: 'B' },
  ][slot];
}
