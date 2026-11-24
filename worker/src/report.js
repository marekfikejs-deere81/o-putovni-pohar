// PDF zápis turnaje: propozice, skupiny, průběh všech utkání s poločasy a body, nájezdy, tabulky,
// konečné pořadí a poznámky o rozhodnutí pořadatele. Český font (DejaVu Sans, subset). Bez soukromých údajů.
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { fillPropozice } from '../../shared/propozice.js';
import { toHHMM } from '../../shared/schedule.js';
import { model } from './results.js';
import { TOURNAMENT_ID } from './orders.js';

const A4 = [595.28, 841.89];
const M = { l: 48, r: 48, t: 56, b: 56 };
const INK = rgb(0.08, 0.18, 0.28);
const MUTED = rgb(0.36, 0.44, 0.52);
const LINE = rgb(0.84, 0.88, 0.92);
const HEAD_BG = rgb(0.93, 0.96, 0.98);
const pts = (x, y) => (x > y ? 2 : x === y ? 1 : 0);

class Layout {
  constructor(pdf, regular, bold) {
    this.pdf = pdf; this.f = regular; this.fb = bold; this.y = 0; this.page = null; this.newPage();
  }
  get width() { return A4[0] - M.l - M.r; }
  newPage() { this.page = this.pdf.addPage(A4); this.y = A4[1] - M.t; }
  ensure(h) { if (this.y - h < M.b) { this.newPage(); return true; } return false; }
  wrap(text, size, font, width) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= width || !cur) cur = next;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }
  text(str, { size = 10, bold = false, color = INK, x = M.l, gap = 3, width = this.width } = {}) {
    const font = bold ? this.fb : this.f;
    for (const line of this.wrap(str, size, font, width)) {
      this.ensure(size + gap);
      this.page.drawText(line, { x, y: this.y - size, size, font, color });
      this.y -= size + gap;
    }
  }
  space(h) { this.y -= h; }
  heading(str, size = 15) { this.ensure(size + 30); this.space(10); this.text(str, { size, bold: true }); this.page.drawRectangle({ x: M.l, y: this.y - 2, width: this.width, height: 1.2, color: rgb(0.32, 0.69, 0.89) }); this.space(8); }
  sub(str) { this.ensure(40); this.space(6); this.text(str, { size: 11.5, bold: true }); this.space(2); }

  /** Tabulka: hlavička se opakuje na každé stránce, řádek se nikdy nerozdělí. */
  table(cols, rows, { size = 9 } = {}) {
    const total = cols.reduce((s, c) => s + c.w, 0);
    const scale = this.width / total;
    const ws = cols.map((c) => c.w * scale);
    const pad = 4, lh = size + 2.5;
    const drawRow = (cells, { head = false, fill = null } = {}) => {
      const font = head ? this.fb : this.f;
      const wrapped = cells.map((c, i) => this.wrap(c ?? '', size, (cols[i].bold && !head) ? this.fb : font, ws[i] - 2 * pad));
      const h = Math.max(...wrapped.map((l) => l.length)) * lh + 2 * pad;
      return { wrapped, h, head, fill };
    };
    const header = drawRow(cols.map((c) => c.title), { head: true });
    const paint = (r) => {
      if (r.head || r.fill) this.page.drawRectangle({ x: M.l, y: this.y - r.h, width: this.width, height: r.h, color: r.head ? HEAD_BG : r.fill });
      let x = M.l;
      r.wrapped.forEach((lines, i) => {
        const font = r.head || cols[i].bold ? this.fb : this.f;
        lines.forEach((ln, k) => {
          const tw = font.widthOfTextAtSize(ln, size);
          const tx = cols[i].align === 'right' ? x + ws[i] - pad - tw : cols[i].align === 'center' ? x + (ws[i] - tw) / 2 : x + pad;
          this.page.drawText(ln, { x: tx, y: this.y - pad - size - k * lh + 1, size, font, color: r.head ? MUTED : INK });
        });
        x += ws[i];
      });
      this.page.drawRectangle({ x: M.l, y: this.y - r.h, width: this.width, height: 0.6, color: LINE });
      this.y -= r.h;
    };
    this.ensure(header.h + 20);
    paint(header);
    for (const cells of rows) {
      const r = Array.isArray(cells) ? drawRow(cells) : drawRow(cells.cells, { fill: cells.fill });
      if (this.ensure(r.h)) paint(header);
      paint(r);
    }
    this.space(6);
  }
}

/** Data zápisu z veřejného modelu + rozhodnutí pořadatele (los, ruční pořadí). */
async function reportData(q) {
  const m = await model(q);
  const lots = await q(`SELECT grp, team_id, position FROM lot WHERE tournament_id = $1 ORDER BY grp, position`, [TOURNAMENT_ID]);
  return { m, lots };
}

export async function generateReport(q, fonts, generatedAt = new Date()) {
  const { m, lots } = await reportData(q);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle('Zápis turnaje – Vánoční turnaj 2. tříd o Putovní pohár 2026');
  pdf.setAuthor('HC Rytíři Vlašim');
  pdf.setSubject('Propozice, výsledky, tabulky a konečné pořadí');
  pdf.setLanguage('cs-CZ');
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });
  const L = new Layout(pdf, regular, bold);
  const team = (id) => m.teams.find((t) => t.id === id);
  const nm = (id) => team(id)?.name ?? '—';

  // Titul
  L.text('HC RYTÍŘI VLAŠIM · 2. TŘÍDY', { size: 9, color: MUTED });
  L.text('Zápis turnaje', { size: 24, bold: true, gap: 6 });
  L.text('Vánoční turnaj 2. tříd o Putovní pohár', { size: 15, bold: true, gap: 4 });
  L.text('pondělí 28. 12. 2026 · Zimní stadion Vlašim', { size: 11, color: MUTED });
  L.space(8);

  // Konečné pořadí hned na začátek (rychlý přehled), detail dál
  const final = [];
  for (const g of m.matches.filter((x) => x.place).sort((a, b) => a.place - b.place)) {
    if (g.winner) {
      const w = g.winner === 'home' ? g.home : g.away, l = g.winner === 'home' ? g.away : g.home;
      final.push([`${g.place}.`, nm(w)], [`${g.place + 1}.`, nm(l)]);
    }
  }
  L.sub('Konečné pořadí');
  L.table([{ title: 'Místo', w: 14, align: 'center', bold: true }, { title: 'Tým', w: 86, bold: true }],
    final.map((r, i) => (i < 3 ? { cells: r, fill: rgb(1, 0.97, 0.86) } : r)), { size: 10 });

  // 1) Propozice
  L.heading('Propozice turnaje');
  for (const s of fillPropozice(m.tournament.lunch)) {
    L.sub(s.title);
    if (s.items) L.table([{ title: 'Údaj', w: 26 }, { title: '', w: 74 }], s.items, { size: 9.5 });
    for (const p of s.text || []) { L.text(p, { size: 9.5 }); L.space(3); }
    for (const li of s.list || []) L.text(`• ${li}`, { size: 9.5, x: M.l + 10, width: L.width - 10 });
    for (const p of s.after || []) { L.space(2); L.text(p, { size: 9.5 }); }
  }

  // 2) Skupiny
  L.heading('Skupiny');
  for (const g of ['A', 'B']) {
    const ids = m.teams.filter((t) => t.group === g).sort((a, b) => a.slot - b.slot);
    L.text(`Skupina ${g} (plocha ${g} ${g === 'A' ? 'pod časomírou' : 'pod restaurací'}): ${ids.map((t) => t.name).join(', ')}`, { size: 9.5 });
    L.space(3);
  }

  // 3) Průběh – všechna utkání chronologicky
  L.heading('Průběh turnaje – výsledky všech utkání');
  L.text('Body se udělují za každý poločas zvlášť: výhra 2, remíza 1, prohra 0. Skóre poločasu zahrnuje nájezdy za fauly.', { size: 8.5, color: MUTED });
  L.space(4);
  const rows = [];
  for (const b of m.blocks) {
    for (const id of b.games) {
      const g = m.matches.find((x) => x.id === id);
      const p = g.periods;
      const tot = p.reduce((s, [x, y]) => [s[0] + x, s[1] + y], [0, 0]);
      const bp = p.reduce((s, [x, y]) => [s[0] + pts(x, y), s[1] + pts(y, x)], [0, 0]);
      const per = (i) => (p[i] ? `${p[i][0]}:${p[i][1]} (${pts(p[i][0], p[i][1])}:${pts(p[i][1], p[i][0])})` : '—');
      const so = g.place && g.shootout ? `nájezdy: ${nm(g.shootout === 'home' ? g.home : g.away)}` : '';
      rows.push([
        toHHMM(b.from), g.rink, g.place ? `o ${g.place}. m.` : `sk. ${g.rink}`,
        `${nm(g.home)} × ${nm(g.away)}`, per(0), per(1),
        p.length ? `${tot[0]}:${tot[1]}` : '—', p.length ? `${bp[0]}:${bp[1]}` : '—', so,
      ]);
    }
  }
  L.table([
    { title: 'Čas', w: 7 }, { title: 'Pl.', w: 4, align: 'center' }, { title: 'Utkání', w: 8 }, { title: 'Týmy', w: 31, bold: true },
    { title: '1. poločas', w: 11, align: 'center' }, { title: '2. poločas', w: 11, align: 'center' },
    { title: 'Skóre', w: 7, align: 'center', bold: true }, { title: 'Body', w: 7, align: 'center', bold: true }, { title: 'Pozn.', w: 14 },
  ], rows, { size: 8 });

  // 4) Tabulky skupin
  L.heading('Tabulky skupin');
  for (const g of ['A', 'B']) {
    const G = m.groups[g];
    L.sub(`Skupina ${g}`);
    L.table([
      { title: 'Poř.', w: 7, align: 'center', bold: true }, { title: 'Tým', w: 41, bold: true }, { title: 'Zápasy', w: 9, align: 'center' },
      { title: 'V / R / P (poločasy)', w: 17, align: 'center' }, { title: 'Skóre', w: 12, align: 'center' }, { title: 'Body', w: 9, align: 'center', bold: true },
    ], G.rows.map((r) => [`${r.rank}.`, nm(r.id), `${r.played}/${G.rows.length - 1}`, `${r.wins} / ${r.draws} / ${r.losses}`, `${r.goalsFor}:${r.goalsAgainst}`, String(r.points)]), { size: 9 });
    const gl = lots.filter((x) => x.grp === g);
    if (G.manual) L.text(`Rozhodnutí pořadatele: pořadí skupiny ${g} bylo stanoveno ručně pořadatelem turnaje.`, { size: 9, bold: true });
    else if (gl.length) L.text(`Rozhodnutí pořadatele: o pořadí týmů ${gl.map((x) => nm(x.team_id)).join(', ')} rozhodl los (pořadí v losu: ${gl.map((x) => `${x.position}. ${team(x.team_id).code}`).join(', ')}).`, { size: 9, bold: true });
  }

  // 5) Utkání o umístění
  L.heading('Utkání o umístění');
  L.table([{ title: 'O místo', w: 12, align: 'center' }, { title: 'Nasazení', w: 14 }, { title: 'Týmy', w: 44, bold: true }, { title: 'Výsledek', w: 30 }],
    m.matches.filter((x) => x.place).sort((a, b) => a.place - b.place).map((g) => {
      const p = g.periods;
      const tot = p.reduce((s, [x, y]) => [s[0] + x, s[1] + y], [0, 0]);
      const bp = p.reduce((s, [x, y]) => [s[0] + pts(x, y), s[1] + pts(y, x)], [0, 0]);
      const res = p.length ? `skóre ${tot[0]}:${tot[1]}, body ${bp[0]}:${bp[1]}${g.shootout ? `, nájezdy vyhrál ${team(g.shootout === 'home' ? g.home : g.away).code}` : ''}${!g.winner ? ' – vítěz zatím nepotvrzen' : ''}` : '—';
      return [`${g.place}.`, `${g.homeSeed} × ${g.awaySeed}`, `${nm(g.home)} × ${nm(g.away)}`, res];
    }), { size: 9 });

  // Patička na každé stránce
  const pages = pdf.getPages();
  const stamp = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', dateStyle: 'short', timeStyle: 'short' }).format(generatedAt);
  pages.forEach((pg, i) => {
    const t = `O putovní pohár 2026 · zápis turnaje · verze ${m.revision} · vytvořeno ${stamp} · strana ${i + 1} z ${pages.length}`;
    pg.drawText(t, { x: M.l, y: 30, size: 7.5, font: regular, color: MUTED });
  });
  return { bytes: await pdf.save(), revision: m.revision, ready: m.finalDone };
}

/** Veřejný soubor: jen po potvrzení vítěze finále; jedna verze na revizi výsledků (cache v DB). */
export async function reportPdf(q, fonts) {
  const m = await model(q);
  if (!m.finalDone) return null;
  const [hit] = await q(`SELECT encode(bytes, 'base64') AS b64 FROM report_pdf WHERE revision = $1`, [m.revision]);
  if (hit) return { bytes: Uint8Array.from(atob(hit.b64), (c) => c.charCodeAt(0)), revision: m.revision };
  const r = await generateReport(q, fonts);
  let bin = '';
  for (let i = 0; i < r.bytes.length; i += 0x8000) bin += String.fromCharCode(...r.bytes.subarray(i, i + 0x8000));
  await q(`INSERT INTO report_pdf (revision, bytes) VALUES ($1, decode($2, 'base64')) ON CONFLICT (revision) DO NOTHING`, [r.revision, btoa(bin)]);
  await q(`DELETE FROM report_pdf WHERE revision < $1 - 20`, [r.revision]);
  return { bytes: r.bytes, revision: r.revision };
}
