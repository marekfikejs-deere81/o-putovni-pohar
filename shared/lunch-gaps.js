// Odstupy obědu od zápasů: kdy tým před obědem dohraje a kdy hraje další zápas (z aktuálního modelu).

/** Pro skupinu týmů a obědové okno vrátí konec posledního zápasu před obědem a začátek dalšího zápasu po obědě. */
export function lunchGaps(M, teamIds, lunch) {
  const blockOf = (m) => M.blocks.find((b) => b.id === m.blockId);
  let prevEnd = null, nextStart = null;
  for (const m of M.matches) {
    if (!teamIds.includes(m.home) && !teamIds.includes(m.away)) continue;
    const b = blockOf(m);
    if (!b) continue;
    if (b.to <= lunch.from && (prevEnd === null || b.to > prevEnd)) prevEnd = b.to;
    if (b.from >= lunch.to && (nextStart === null || b.from < nextStart)) nextStart = b.from;
  }
  return {
    prevEnd, nextStart,
    before: prevEnd === null ? null : lunch.from - prevEnd, // minut od konce zápasu do oběda
    after: nextStart === null ? null : nextStart - lunch.to, // minut od konce oběda do dalšího zápasu
  };
}
