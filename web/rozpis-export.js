// Export aktuálního časového rozpisu do JPEG a PDF (A4) ve vzhledu tištěného rozpisu.
// Kreslí se do canvasu v prohlížeči z veřejného modelu – časy a dvojice jsou vždy ty, které jsou v aplikaci.
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
  const stamp = new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  text(`Aktuální rozpis · stav k ${stamp}`, 136, y, { size: 30, bold: true, color: BLUE });
  y += 38;

  // --- skupiny ---
  const half = TW / 2;
  const rowH = 50;
  rect(L, y, TW, rowH, NAVY);
  text('Skupina A · plocha A (pod časomírou)', L + PAD, y + rowH / 2, { size: 26, bold: true, color: '#fff', max: half - 2 * PAD });
  text('Skupina B · plocha B (pod restaurací)', L + half + PAD, y + rowH / 2, { size: 26, bold: true, color: '#fff', max: half - 2 * PAD });
  const top = y; y += rowH;
  const byGroup = (gr) => M.teams.filter((t) => t.group === gr).sort((a, b) => a.slot - b.slot);
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
  const note = 'Utkání trvá 35 minut (2 × 14 min a nájezdy za fauly). Ve skupině je úprava ledu vždy po dvou utkáních, v poledne je delší pauza. Časy odpovídají aktuálnímu stavu v aplikaci turnaje – sleduj www.vlasimskypohar.cz.';
  font(24); g.fillStyle = GRAY;
  let line = '';
  for (const w of note.split(' ')) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > TW - 2 * PAD) { g.fillText(line, 136, y); y += 34; line = w; } else line = next;
  }
  if (line) g.fillText(line, 136, y);
  return c;
}

const toBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));

/** Jedna stránka A4 s JPEG obrázkem (DCTDecode) – bez knihoven. */
function pdfFromJpeg(jpeg, w, h) {
  const enc = new TextEncoder();
  const PW = 595.28, PH = 841.89;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    null, // obrázek
    null, // obsah
    '<< /Title (Casovy rozpis - O putovni pohar 2026) /Producer (vlasimskypohar.cz) >>',
  ];
  const content = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
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

export async function scheduleFiles(M, base = '') {
  const c = await drawSchedule(M, base);
  const jpg = await toBlob(c, 'image/jpeg', 0.92);
  const pdf = pdfFromJpeg(new Uint8Array(await jpg.arrayBuffer()), c.width, c.height);
  return { canvas: c, jpg, pdf };
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
