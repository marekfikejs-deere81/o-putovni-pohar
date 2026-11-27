// Export aktuálního časového rozpisu do JPEG a PDF (A4) ve vzhledu tištěného rozpisu.
// Kreslí se do canvasu v prohlížeči z veřejného modelu – časy a dvojice jsou vždy ty, které jsou v aplikaci.
import { lunchGaps } from './shared/lunch-gaps.js';

const W = 1654, H = 2339; // A4 při 200 dpi
const NAVY = '#15284b', BLUE = '#3d7cc9', GRAY = '#6f7785', LINE = '#d3d8e0', ZEBRA = '#eaf1fb', ICE = '#f2f4f8', GOLD = '#fff2c2';
const FONT = 'RozpisSans';

let fontsReady = null;
function loadFonts(base) {
  if (!fontsReady) {
    const reg = new FontFace(FONT, `url(${base}fonts/DejaVuSans.ttf)`, { weight: '400' });
    const bold = new FontFace(FONT, `url(${base}fonts/DejaVuSans-Bold.ttf)`, { weight: '700' });
    fontsReady = Promise.all([reg.load(), bold.load()]).then((f) => f.forEach((x) => document.fonts.add(x))).catch(() => {});
  }
  return fontsReady;
}

// Drobné razítko vpravo dole: z jakého stavu aplikace soubor vznikl.
function stampAt(g, right, y) {
  const stamp = new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  g.font = `400 20px ${FONT}, "DejaVu Sans", Verdana, sans-serif`; g.fillStyle = '#9aa3ae'; g.textAlign = 'right';
  g.fillText(`Aktuální stav k ${stamp} · www.vlasimskypohar.cz`, right, y); g.textAlign = 'left';
}
const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const range = (b) => `${hm(b.from)}–${hm(b.to)}`;

// Plné názvy týmů – stejně jako v křížové tabulce.
const short = (t) => (t ? t.name : '');

/** Vykreslí rozpis do canvasu a vrátí ho. */
export async function drawSchedule(M, base = '') {
  await loadFonts(base);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.textBaseline = 'middle';
  const font = (size, bold = false, italic = false) => { g.font = `${italic ? 'italic ' : ''}${bold ? '700' : '400'} ${size}px ${FONT}, "DejaVu Sans", Verdana, sans-serif`; };
  const text = (s, x, y, { size = 26, bold = false, italic = false, color = '#111', max, fit = false } = {}) => {
    font(size, bold, italic); g.fillStyle = color;
    let str = String(s);
    if (max && fit) while (g.measureText(str).width > max && size > 20) font(--size, bold, italic);
    if (max) while (g.measureText(str).width > max && str.length > 3) str = str.slice(0, -2) + '…';
    g.fillText(str, x, y);
  };
  const rect = (x, y, w, h, fill) => { g.fillStyle = fill; g.fillRect(x, y, w, h); };
  const L = 120, R = W - 120, TW = R - L, PAD = 17;

  const team = (id) => M.teams.find((t) => t.id === id);
  const match = (id) => M.matches.find((m) => m.id === id);
  let y = 150;
  text(M.tournament?.name || 'Vánoční turnaj 2. tříd o Putovní pohár', 136, y, { size: 62, bold: true, color: NAVY, max: TW });
  y += 72;
  text('Ročník 2019 · pondělí 28. 12. 2026 · Zimní stadion Vlašim · časový rozpis', 136, y, { size: 30, color: GRAY });
  y += 48;
  const pauseR = M.blocks.find((x) => !x.games.length && /poledn/i.test(x.title));
  const finalB = M.blocks.find((x) => x.games.some((id) => M.matches.find((mm) => mm.id === id)?.place === 1));
  text(`Začátek v ${hm(M.blocks[0].from)}${finalB ? `, finále končí ${hm(finalB.to)}` : pauseR ? ` · polední pauza ${hm(pauseR.from)}–${hm(pauseR.to)}` : ''}`, 136, y, { size: 30, bold: true, color: BLUE });
  y += 38;

  // --- skupiny ---
  const half = TW / 2;
  const rowH = 50;
  rect(L, y, TW, rowH, NAVY);
  text('Skupina A · plocha A (pod časomírou)', L + PAD, y + rowH / 2, { size: 26, bold: true, color: '#fff', max: half - 2 * PAD });
  text('Skupina B · plocha B (pod restaurací)', L + half + PAD, y + rowH / 2, { size: 26, bold: true, color: '#fff', max: half - 2 * PAD });
  const top = y; y += rowH;
  // stejné pořadí jako v křížové tabulce (Vlašim první), označení podle pozice ve skupině
  const byGroup = (gr) => (M.groups?.[gr]?.order || M.teams.filter((t) => t.group === gr).sort((a, b) => a.slot - b.slot).map((t) => t.id)).map((id) => M.teams.find((t) => t.id === id));
  const A = byGroup('A'), B = byGroup('B');
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if (i % 2) rect(L, y, TW, rowH, ZEBRA);
    if (A[i]) text(`A${A[i].slot} ${short(A[i])}`, L + PAD, y + rowH / 2, { size: 27, max: half - 2 * PAD });
    if (B[i]) text(`B${B[i].slot} ${short(B[i])}`, L + half + PAD, y + rowH / 2, { size: 27, max: half - 2 * PAD });
    y += rowH;
  }
  g.strokeStyle = LINE; g.lineWidth = 2; g.strokeRect(L, top, TW, y - top);
  g.beginPath(); g.moveTo(L + half, top); g.lineTo(L + half, y); g.stroke();

  // --- tabulky programu ---
  const cols = [L, L + 205, L + 205 + (TW - 205) / 2, R];
  const firstPlace = M.blocks.findIndex((b) => b.games.some((id) => match(id).place));
  const parts = [
    ['Základní skupiny', M.blocks.slice(0, firstPlace < 0 ? M.blocks.length : firstPlace), ['Čas', 'Plocha A – skupina A', 'Plocha B – skupina B']],
    ['Zápasy o umístění', firstPlace < 0 ? [] : M.blocks.slice(firstPlace), ['Čas', 'Plocha A', 'Plocha B']],
  ];
  const side = (m, s) => {
    const t = team(m[s]);
    return t ? short(t) : (m[s === 'home' ? 'homeSeed' : 'awaySeed'] || '');
  };
  const gameText = (m) => {
    if (!m) return ['–'];
    if (!m.place) return [`${side(m, 'home')} – ${side(m, 'away')}`];
    const head = `${m.place === 1 ? 'FINÁLE o 1. místo' : `o ${m.place}. místo`} · ${m.homeSeed} × ${m.awaySeed}`;
    return m.home != null && m.away != null ? [head, `${short(team(m.home))} × ${short(team(m.away))}`] : [head];
  };
  const RH0 = 55;
  for (const [title, blocks, head] of parts) {
    if (!blocks.length) continue;
    y += 48;
    text(title, 136, y, { size: 36, bold: true, color: NAVY });
    y += 30;
    rect(L, y, TW, RH0, NAVY);
    head.forEach((h, i) => text(h, cols[i] + PAD, y + RH0 / 2, { size: 27, bold: true, color: '#fff' }));
    y += RH0;
    const start = y;
    for (const b of blocks) {
      const last = b === M.blocks.at(-1) && !b.games.length;
      const lunch = !b.games.length && /poledn/i.test(b.title);
      const games = b.games.map(match);
      const final = games.some((m) => m.place === 1);
      const RH = games.some((m) => m.place && m.home != null && m.away != null) ? 86 : RH0;
      const ice = !b.games.length && !lunch && !last;
      const fill = lunch || final ? GOLD : ice ? ICE : last ? ZEBRA : '#fff';
      rect(L, y, TW, RH, fill);
      const strong = lunch || final || last;
      text(range(b), cols[0] + PAD, y + RH / 2, { size: ice ? 24 : 27, bold: !ice, italic: ice, color: ice ? GRAY : '#111' });
      if (last) {
        text(b.title, cols[1] + PAD, y + RH / 2, { size: 27, bold: true, max: R - cols[1] - 2 * PAD });
      } else if (!b.games.length) {
        const label = b.title.charAt(0).toLowerCase() + b.title.slice(1);
        for (const k of [1, 2]) text(label, cols[k] + PAD, y + RH / 2, { size: ice ? 24 : 27, bold: strong, italic: ice, color: ice ? GRAY : '#111', max: cols[k + 1] - cols[k] - 2 * PAD });
      } else {
        const a = games.find((m) => m.rink === 'A'), bb = games.find((m) => m.rink === 'B');
        [[a, 1], [bb, 2]].forEach(([m, k]) => {
          const lines = gameText(m), max = cols[k + 1] - cols[k] - 2 * PAD, b1 = final && m?.place === 1;
          if (lines.length === 1) text(lines[0], cols[k] + PAD, y + RH / 2, { size: 27, bold: b1, max, fit: true });
          else {
            text(lines[0], cols[k] + PAD, y + RH / 2 - 17, { size: 24, bold: b1, color: b1 ? '#111' : GRAY, max, fit: true });
            text(lines[1], cols[k] + PAD, y + RH / 2 + 17, { size: 26, bold: b1, max, fit: true });
          }
        });
      }
      // čáry
      g.strokeStyle = LINE; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(L, y + RH); g.lineTo(R, y + RH); g.stroke();
      g.beginPath(); g.moveTo(cols[1], y); g.lineTo(cols[1], y + RH);
      if (!last) { g.moveTo(cols[2], y); g.lineTo(cols[2], y + RH); }
      g.stroke();
      y += RH;
    }
    g.strokeStyle = LINE; g.lineWidth = 2; g.strokeRect(L, start - RH0, TW, y - start + RH0);
  }

  // --- poznámka ---
  y += 30;
  // nejkratší pauza týmu mezi skupinovými utkáními
  let minBreak = Infinity;
  for (const t of M.teams) {
    const bs = M.matches.filter((m) => !m.place && (m.home === t.id || m.away === t.id)).map((m) => M.blocks.find((x) => x.id === m.blockId)).sort((p, q) => p.from - q.from);
    for (let i = 1; i < bs.length; i++) minBreak = Math.min(minBreak, bs[i].from - bs[i - 1].to);
  }
  const note = `Utkání trvá 35 minut (2 × 14 min a nájezdy za fauly). Ve skupině je úprava ledu vždy po dvou utkáních, v poledne je delší pauza.${Number.isFinite(minBreak) ? ` Každý tým má mezi skupinovými utkáními nejméně ${minBreak} minut pauzy.` : ''} Obědy viz samostatný rozpis.`;
  font(24); g.fillStyle = GRAY;
  let line = '';
  for (const w of note.split(' ')) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > TW - 2 * PAD) { g.fillText(line, 136, y); y += 34; line = w; } else line = next;
  }
  if (line) g.fillText(line, 136, y);
  stampAt(g, R, y + 50);
  return c;
}

const toBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));

/** Jedna stránka A4 s JPEG obrázkem (DCTDecode) – bez knihoven. */
function pdfFromJpeg(jpeg, w, h, landscape = false) {
  const enc = new TextEncoder();
  const PW = landscape ? 841.89 : 595.28, PH = landscape ? 595.28 : 841.89;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    null, // obrázek
    null, // obsah
    `<< /Title (${landscape ? 'Obedy - casova okna' : 'Casovy rozpis'} - O putovni pohar 2026) /Producer (vlasimskypohar.cz) >>`,
  ];
  // obrázek na šířku stránky, nahoře (u obědů může být nižší než stránka)
  const ih = Math.min(PH, PW * h / w), iw = ih * w / h;
  const content = `q ${iw.toFixed(2)} 0 0 ${ih.toFixed(2)} ${((PW - iw) / 2).toFixed(2)} ${(PH - ih).toFixed(2)} cm /Im0 Do Q`;
  const parts = [enc.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = [];
  let pos = parts[0].length;
  const push = (u8) => { parts.push(u8); pos += u8.length; };
  for (let i = 0; i < objs.length; i++) {
    offsets.push(pos);
    if (i === 3) {
      push(enc.encode(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`));
      push(jpeg);
      push(enc.encode('\nendstream\nendobj\n'));
    } else if (i === 4) {
      push(enc.encode(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`));
    } else push(enc.encode(`${i + 1} 0 obj\n${objs[i]}\nendobj\n`));
  }
  const xref = pos;
  push(enc.encode(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return new Blob(parts, { type: 'application/pdf' });
}

export async function scheduleFiles(M, base = '', kind = 'rozpis') {
  const c = kind === 'obedy' ? await drawLunches(M, base) : await drawSchedule(M, base);
  const jpg = await toBlob(c, 'image/jpeg', 0.92);
  const pdf = pdfFromJpeg(new Uint8Array(await jpg.arrayBuffer()), c.width, c.height, kind === 'obedy');
  return { canvas: c, jpg, pdf };
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ---------- Obědy – časová okna (A4 na šířku) ----------
const LSHORT = { VLA: 'Vlašim A', VLB: 'Vlašim B', BEN: 'Benešov', CEB: 'Budějovice', MBL: 'Boleslav', LIT: 'Litvínov', SVE: 'Světlá', SLA: 'Slavia', KOB: 'Kobra', PLZ: 'Plzeň' };
const lname = (t) => (t ? LSHORT[t.code] || t.name : '');

export async function drawLunches(M, base = '') {
  await loadFonts(base);
  const LW = 1800, LH = 2000; // kreslí se do vysokého plátna, na konci se ořízne na obsah (nejméně 1040 px jako předloha)
  const c = document.createElement('canvas');
  c.width = LW; c.height = LH;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, LW, LH);
  g.textBaseline = 'middle';
  const font = (size, bold = false) => { g.font = `${bold ? '700' : '400'} ${size}px ${FONT}, "DejaVu Sans", Verdana, sans-serif`; };
  const text = (str, x, y, size, { bold = false, color = '#111' } = {}) => { font(size, bold); g.fillStyle = color; g.fillText(String(str), x, y); };
  const team = (id) => M.teams.find((t) => t.id === id);
  const L = 130, R = LW - 110, TW = R - L, PAD = 18;

  // souhrn rozvržení – spočítaný z aplikace
  const team1 = (id) => M.teams.find((t) => t.id === id);
  const per = M.lunches.map((l) => ({ l, ts: l.teams.map(team1).filter(Boolean), each: l.teams.map((id) => ({ id, ...lunchGaps(M, [id], l) })) }));
  const lens = [...new Set(M.lunches.map((l) => l.to - l.from))];
  // nejvíc týmů v restauraci současně (okna, která se překrývají)
  let maxIn = 0;
  for (const l of M.lunches) maxIn = Math.max(maxIn, M.lunches.filter((o) => o.from < l.to && o.to > l.from && o.from <= l.from).reduce((n, o) => n + o.teams.length, 0));
  const pause = M.blocks.find((x) => !x.games.length && /poledn/i.test(x.title));
  const words = { 1: 'jeden tým', 2: 'dva týmy', 3: 'tři týmy', 4: 'čtyři týmy' };
  const minLen = lens.length === 1 ? `${lens[0]} minut` : `${Math.min(...lens)}–${Math.max(...lens)} minut`;
  // směny: okna se nepřekrývají (každé začíná až po konci předchozího)
  const ws = [...M.lunches].sort((a, b) => a.from - b.from);
  const shifts = ws.every((l, i) => i === 0 || l.from >= ws[i - 1].to);
  const cz = (n) => ({ 1: 'jedna', 2: 'dvě', 3: 'tři', 4: 'čtyři' }[n] || n);
  const subtitleOld = `Začátek v ${hm(M.blocks[0].from)}${pause ? `, polední pauza ${hm(pause.from)}–${hm(pause.to)}` : ''} · nejvýše ${maxIn} ${maxIn === 1 ? 'tým' : maxIn < 5 ? 'týmy' : 'týmů'}, oběd ${minLen}`;
  const subtitle = shifts ? `Začátek v ${hm(M.blocks[0].from)} · ${ws.length} ${ws.length < 5 ? 'směny' : 'směn'}, týmy se střídají` : subtitleOld;

  const L0 = 148;
  const wrap = (str, size, bold, max) => {
    font(size, bold); const out = []; let line = '';
    for (const w of String(str).split(' ')) { const nx = line ? `${line} ${w}` : w; if (g.measureText(nx).width > max && line) { out.push(line); line = w; } else line = nx; }
    if (line) out.push(line); return out;
  };
  let y = 145;
  text('Obědy – časová okna', L0, y, 62, { bold: true, color: NAVY });
  y += 64;
  text('Vánoční turnaj 2. tříd o Putovní pohár · pondělí 28. 12. 2026 · Zimní stadion Vlašim', L0, y, 31, { color: GRAY });
  y += 50;
  for (const ln of wrap(subtitle, 32, true, TW - 2 * PAD)) { text(ln, L0, y, 32, { bold: true, color: BLUE }); y += 42; }

  const cols = [L, L + 242, L + 640, L + 918, L + 1248, R];
  const HH = 126;
  g.fillStyle = NAVY; g.fillRect(L, y, TW, HH);
  const heads = [['Oběd'], ['Týmy'], ['Konec', 'předchozího', 'zápasu'], ['Další zápas'], ['Odstup oběd →', 'zápas']];
  heads.forEach((h, i) => h.forEach((ln, k) => text(ln, cols[i] + PAD, y + HH / 2 + (k - (h.length - 1) / 2) * 33, 26, { bold: true, color: '#fff' })));
  g.strokeStyle = '#3a4f73'; g.lineWidth = 1;
  for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(cols[i], y); g.lineTo(cols[i], y + HH); g.stroke(); }
  const top = y; y += HH;

  const uniq = (arr) => [...new Set(arr.filter((v) => v !== null))];
  per.forEach(({ l, ts, each }, i) => {
    const prev = uniq(each.map((e) => e.prevEnd)), next = uniq(each.map((e) => e.nextStart)), after = uniq(each.map((e) => e.after));
    // tučné názvy týmů, za nimi obyčejně délka oběda (když nemají všechna okna stejnou délku)
    const tokens = ts.map(lname).join(' + ').split(' ').map((w) => ({ w, b: true }));
    if (lens.length > 1 && !shifts) `(${l.to - l.from} min)`.split(' ').forEach((w) => tokens.push({ w, b: false }));
    const maxW = cols[2] - cols[1] - 2 * PAD, teamLines = [];
    let cur = [], curW = 0;
    for (const tk of tokens) {
      font(28, tk.b); const ww = g.measureText(tk.w).width, sp = cur.length ? g.measureText(' ').width : 0;
      if (cur.length && curW + sp + ww > maxW) { teamLines.push(cur); cur = [tk]; curW = ww; } else { cur.push(tk); curW += sp + ww; }
    }
    if (cur.length) teamLines.push(cur);
    const RH = teamLines.length > 1 ? 94 : 60;
    if (i % 2) { g.fillStyle = ZEBRA; g.fillRect(L, y, TW, RH); }
    text(`${hm(l.from)}–${hm(l.to)}`, cols[0] + PAD, y + RH / 2, 28);
    teamLines.forEach((ln, k) => {
      let x = cols[1] + PAD; const yy = y + RH / 2 + (k - (teamLines.length - 1) / 2) * 35;
      ln.forEach((tk, j) => { font(28, tk.b); if (j) x += g.measureText(' ').width; text(tk.w, x, yy, 28, { bold: tk.b }); font(28, tk.b); x += g.measureText(tk.w).width; });
    });
    text(prev.length ? prev.map(hm).join(' / ') : '–', cols[2] + PAD, y + RH / 2, 28);
    text(next.length ? next.map(hm).join(' / ') : '–', cols[3] + PAD, y + RH / 2, 28);
    text(after.length ? `${after.join(' / ')} min` : '–', cols[4] + PAD, y + RH / 2, 28);
    g.strokeStyle = LINE; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(L, y + RH); g.lineTo(R, y + RH); g.stroke();
    for (let k = 1; k < 5; k++) { g.beginPath(); g.moveTo(cols[k], y); g.lineTo(cols[k], y + RH); g.stroke(); }
    y += RH;
  });
  g.strokeStyle = LINE; g.lineWidth = 2; g.strokeRect(L, top, TW, y - top);

  const all = per.flatMap((r) => r.each);
  const bef = all.map((e) => e.before).filter((v) => v !== null), aft = all.map((e) => e.after).filter((v) => v !== null);
  // u směn: běžná délka oběda a výjimky („2. a 3. směna 25 minut“)
  const lenOf = (l) => l.to - l.from;
  const counts = {}; ws.forEach((l) => { counts[lenOf(l)] = (counts[lenOf(l)] || 0) + 1; });
  const common = Number(Object.keys(counts).sort((a, b) => counts[b] - counts[a] || b - a)[0]);
  const exc = {}; ws.forEach((l, i) => { if (lenOf(l) !== common) (exc[lenOf(l)] ||= []).push(`${i + 1}.`); });
  const andJoin = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} a ${a.at(-1)}` : a[0]);
  const excText = Object.entries(exc).map(([len, list]) => `${andJoin(list)} směna ${len} minut`).join(', ');
  const sizes = ws.map((l) => l.teams.length);
  const sizeText = Math.min(...sizes) === Math.max(...sizes) ? `${sizes[0]}` : `${Math.min(...sizes)}–${Math.max(...sizes)}`;
  const note = [
    shifts ? 'Týmy se v restauraci střídají po směnách: celá směna přichází a odchází společně, další směna přichází až po odchodu předchozí.' : `Oběd trvá ${minLen}${lens.length > 1 ? ' podle času do dalšího zápasu' : ''}.`,
    shifts ? `Směna má ${sizeText} ${Math.max(...sizes) < 5 ? 'týmy' : 'týmů'}, oběd trvá ${common} minut${excText ? ` (${excText})` : ''}.` : `V restauraci jsou vždy nejvýše ${words[maxIn] || `${maxIn} týmů`}.`,
    bef.length ? `Po zápase je vždy nejméně ${Math.min(...bef)} minut na převlečení${aft.length ? `, nejkratší odstup od konce oběda do dalšího zápasu je ${Math.min(...aft)} minut.` : '.'}` : '',
  ].join(' ').trim();
  y += 46;
  for (const ln of wrap(note, 28, false, TW - 2 * PAD)) { text(ln, L0, y, 28); y += 40; }
  stampAt(g, R, y + 10);
  // oříznout na obsah
  const out = document.createElement('canvas');
  out.width = LW; out.height = Math.max(1040, Math.ceil(y + 70));
  const o = out.getContext('2d');
  o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
  o.drawImage(c, 0, 0);
  return out;
}
