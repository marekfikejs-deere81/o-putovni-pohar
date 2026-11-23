// Admin – řízení turnaje: výsledky, pořadí, rozpis, týmy, tipy, historie.
// ctx: { call(method, path, body), esc, fmt, czk, flash(type, msg), rerender() }
import { toHHMM } from './shared/schedule.js';

const pts = (x, y) => (x > y ? 2 : x === y ? 1 : 0);
let M = null;
let openMatch = null;
let shiftPreview = null;
let orderDraft = null;

async function loadModel(ctx) {
  M = await ctx.call('GET', '/api/public');
  return M;
}
const team = (id) => M.teams.find((t) => t.id === id);
const seed = (s) => `${s[0]}. ze sk. ${s[1]}`;
const sideName = (m, s) => (m[s] != null ? team(m[s]).name : seed(m[s === 'home' ? 'homeSeed' : 'awaySeed']));
const logo = (id, esc) => (id != null ? `<img src="${esc(team(id).logo.web)}" alt="" style="width:26px;height:28px;object-fit:contain;vertical-align:middle">` : '');

// ---------- Výsledky ----------
export async function renderResults(app, ctx, head) {
  const { esc } = ctx;
  app.innerHTML = `${ctx.tabs()}<div class="card">Načítání…</div>`;
  try { await loadModel(ctx); } catch (e) { if (!e.silent) app.innerHTML = `${ctx.head()}<div class="banner err">${esc(e.message)}</div>`; return; }
  const chip = (m) => {
    const n = m.periods.length;
    if (n === 2 && (!m.place || m.winner)) return '<span class="pill ok">dohráno</span>';
    if (n === 2) return '<span class="pill no" style="background:#fff7e0;color:#7a5a00">nájezdy</span>';
    if (n === 1) return '<span class="pill no" style="background:#e8f1fb;color:#124f83">1. třetina</span>';
    return '<span class="pill no">čeká</span>';
  };
  const score = (m) => m.periods.length ? m.periods.map(([x, y]) => `${x}:${y}`).join(', ') : '';
  // Rychlá sekce: právě probíhající blok v den turnaje, jinak první blok s nedohraným zápasem
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const nowMin = `${p.year}-${p.month}-${p.day}` === '2026-12-28' ? Number(p.hour) * 60 + Number(p.minute) : -1;
  const gameBlocks = M.blocks.filter((b) => b.games.length);
  const quick = gameBlocks.find((b) => b.from <= nowMin && nowMin < b.to)
    || gameBlocks.find((b) => b.games.some((id) => { const m = M.matches.find((x) => x.id === id); return m.periods.length < 2 || (m.place && !m.winner); }));
  const quickHtml = quick ? `<section class="card" style="border:2px solid #40c38b"><h2 style="margin-bottom:4px">${quick.from <= nowMin && nowMin < quick.to ? 'Teď na ledě' : 'Na řadě'}</h2>
    <div class="muted">${toHHMM(quick.from)}–${toHHMM(quick.to)}</div>
    ${quick.games.map((id) => { const m = M.matches.find((x) => x.id === id); return `<div class="mrow" data-m="${m.id}" style="padding:10px 0;border-bottom:1px solid var(--line);cursor:pointer">
      <div style="display:flex;justify-content:space-between"><span class="muted">Plocha ${m.rink}${m.place ? ` · o ${m.place}. místo` : ''}</span>${chip(m)}</div>
      <div><b>${esc(sideName(m, 'home'))}</b> × <b>${esc(sideName(m, 'away'))}</b> <span class="muted">${score(m)}</span></div></div>${openMatch === m.id ? editor(m, ctx) : ''}`; }).join('')}</section>` : '';
  const quickIds = new Set(quick ? quick.games : []);
  app.innerHTML = `${ctx.head()}${quickHtml}<section class="card"><h2>Všechny zápasy</h2>
    <div class="muted">Klepni na zápas. Každou třetinu potvrď zvlášť – na web a stadion se dostane do 5 s. Branky včetně nájezdů za fauly.</div>
    ${M.blocks.filter((b) => b.games.length).map((b) => `<h3 style="margin:16px 0 6px">${toHHMM(b.from)}–${toHHMM(b.to)}</h3>
      ${b.games.map((id) => { const m = M.matches.find((x) => x.id === id); return `<div class="mrow" data-m="${m.id}" style="padding:10px 0;border-bottom:1px solid var(--line);cursor:pointer">
        <div style="display:flex;gap:8px;align-items:center;justify-content:space-between"><span class="muted">Plocha ${m.rink}${m.place ? ` · o ${m.place}. místo` : ''}</span>${chip(m)}</div>
        <div><b>${esc(sideName(m, 'home'))}</b> × <b>${esc(sideName(m, 'away'))}</b> <span class="muted">${score(m)}</span></div></div>
        ${openMatch === m.id && !quickIds.has(m.id) ? editor(m, ctx) : ''}`; }).join('')}`).join('')}
    </section>`;
  app.querySelectorAll('.mrow').forEach((r) => r.onclick = () => { openMatch = openMatch === Number(r.dataset.m) ? null : Number(r.dataset.m); renderResults(app, ctx, head); });
  wireEditor(app, ctx, head);
  if (openMatch !== null) app.querySelector(`[data-ed="${openMatch}"]`)?.scrollIntoView({ block: 'nearest' });
}

function editor(m, ctx) {
  const { esc } = ctx;
  if (m.place && (m.home == null || m.away == null)) return `<div class="card" data-ed="${m.id}">Utkání o umístění ještě nemá nasazené týmy – čeká se na konečné pořadí skupin (nebo los / ruční pořadí).</div>`;
  const row = (no) => {
    const p = m.periods[no - 1];
    const can = no === 1 || m.periods.length >= 1;
    if (!can) return `<div class="muted" style="margin:8px 0">${no}. třetina – nejdřív potvrď 1. třetinu</div>`;
    const isLast = m.periods.length === no;
    return `<form class="per" data-no="${no}" style="margin:10px 0;padding:10px;border:1px solid var(--line);border-radius:10px">
      <div style="font-weight:700;margin-bottom:6px">${no}. třetina ${p ? `<span class="pill ok">potvrzeno ${p[0]}:${p[1]}</span>` : ''}</div>
      <div style="display:grid;grid-template-columns:1fr 70px 14px 70px 1fr;gap:6px;align-items:center">
        <span style="text-align:right">${logo(m.home, esc)} ${esc(team(m.home).code)}</span>
        <input name="home" inputmode="numeric" pattern="[0-9]*" value="${p ? p[0] : ''}" aria-label="${no}. třetina ${esc(team(m.home).name)}" style="font-size:24px;text-align:center;font-weight:800">
        <b style="text-align:center">:</b>
        <input name="away" inputmode="numeric" pattern="[0-9]*" value="${p ? p[1] : ''}" aria-label="${no}. třetina ${esc(team(m.away).name)}" style="font-size:24px;text-align:center;font-weight:800">
        <span>${esc(team(m.away).code)} ${logo(m.away, esc)}</span></div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn" type="submit">${p ? 'Opravit' : 'Potvrdit'} ${no}. třetinu</button>
      ${p && isLast ? `<button class="btn secondary" type="button" data-del="${no}">Smazat ${no}. třetinu</button>` : ''}</div></form>`;
  };
  let so = '';
  if (m.place && m.periods.length === 2) {
    const s = m.periods.reduce((a, [x, y]) => a + pts(x, y) - pts(y, x), 0);
    if (s === 0) so = `<div style="margin:10px 0;padding:10px;background:#fff7e0;border-radius:10px"><b>Shoda bodů – rozhodly nájezdy.</b> Vítěz:
      <div style="display:flex;gap:8px;margin-top:6px">${['home', 'away'].map((w) => `<button class="btn ${m.shootout === w ? '' : 'secondary'}" data-so="${w}">${esc(team(m[w]).name)}</button>`).join('')}
      ${m.shootout ? '<button class="btn secondary" data-so="">Zrušit</button>' : ''}</div></div>`;
  }
  return `<div class="card" data-ed="${m.id}" style="background:#f8fbff">${row(1)}${row(2)}${so}</div>`;
}

function wireEditor(app, ctx, head) {
  const ed = app.querySelector('[data-ed]');
  if (!ed) return;
  const m = M.matches.find((x) => x.id === Number(ed.dataset.ed));
  ed.querySelectorAll('form.per').forEach((f) => {
    f.onsubmit = async (e) => {
      e.preventDefault();
      const no = Number(f.dataset.no);
      const h = f.home.value.trim(), a = f.away.value.trim();
      if (!/^\d{1,2}$/.test(h) || !/^\d{1,2}$/.test(a)) { alert('Zadej počty branek (celá čísla).'); return; }
      if (!confirm(`${m.periods[no - 1] ? 'Opravit' : 'Potvrdit'} ${no}. třetinu:\n${team(m.home).name} ${h} : ${a} ${team(m.away).name}?`)) return;
      f.querySelector('button[type=submit]').disabled = true;
      try { await ctx.call('PUT', `/api/admin/matches/${m.id}/periods/${no}`, { home: Number(h), away: Number(a) }); ctx.flash('ok', `${no}. třetina uložena.`); }
      catch (err) { if (err.silent) return; ctx.flash('err', err.message); }
      renderResults(app, ctx, head);
    };
  });
  ed.querySelectorAll('[data-del]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    if (!confirm(`Opravdu smazat ${b.dataset.del}. třetinu?`)) return;
    try { await ctx.call('DELETE', `/api/admin/matches/${m.id}/periods/${b.dataset.del}`); ctx.flash('ok', 'Třetina smazána.'); }
    catch (err) { if (err.silent) return; ctx.flash('err', err.message); }
    renderResults(app, ctx, head);
  });
  ed.querySelectorAll('[data-so]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    const w = b.dataset.so || null;
    if (w && !confirm(`Nájezdy vyhrál ${team(m[w]).name}?`)) return;
    try { await ctx.call('PUT', `/api/admin/matches/${m.id}/shootout`, { winner: w }); ctx.flash('ok', 'Nájezdy uloženy.'); }
    catch (err) { if (err.silent) return; ctx.flash('err', err.message); }
    renderResults(app, ctx, head);
  });
}

// ---------- Pořadí: los a ruční pořadí ----------
export async function renderOrder(app, ctx, head) {
  const { esc } = ctx;
  app.innerHTML = `${ctx.tabs()}<div class="card">Načítání…</div>`;
  try { await loadModel(ctx); } catch (e) { if (!e.silent) app.innerHTML = `${ctx.head()}<div class="banner err">${esc(e.message)}</div>`; return; }
  const manual = M.groups.A.manual && M.groups.B.manual;
  if (!orderDraft) orderDraft = { A: M.groups.A.rows.map((r) => r.id), B: M.groups.B.rows.map((r) => r.id) };
  const lots = ['A', 'B'].flatMap((g) => M.groups[g].pendingLots.map((t) => ({ g, ...t })));
  app.innerHTML = `${ctx.head()}
    <section class="card"><h2>Los pořadatele</h2>
      ${lots.length ? lots.map((t, k) => `<form class="lot" data-g="${t.g}" data-k="${k}" style="margin:10px 0;padding:10px;border:1px solid var(--line);border-radius:10px">
        <b>Skupina ${t.g} · shoda na ${t.rank}. místě</b>
        ${t.ids.map((id) => `<div style="display:flex;align-items:center;gap:8px;margin:6px 0">${logo(id, esc)} <span style="flex:1;min-width:0">${esc(team(id).name)}</span>
          <select name="${id}" style="width:7.5em;flex:none">${t.ids.map((_, i) => `<option value="${i + 1}">${t.rank + i}. místo</option>`).join('')}</select></div>`).join('')}
        <button class="btn" type="submit">Uložit výsledek losu</button></form>`).join('')
        : `<p class="muted">${M.groups.A.finished && M.groups.B.finished ? 'Žádná nevyřešená shoda – los není potřeba.' : 'Los se zadává až po dohrání skupiny, pokud po všech kritériích zůstane shoda.'}</p>`}
    </section>
    <section class="card"><h2>Ruční pořadí</h2>
      <div class="muted">${manual ? '<b>Platí ruční pořadí.</b> ' : ''}Použij jen ve výjimečné situaci. Platí pro obě skupiny a hned se podle něj nasadí utkání o umístění. Rozehraná utkání o umístění nelze změnit.</div>
      ${['A', 'B'].map((g) => `<h3>Skupina ${g}</h3>${orderDraft[g].map((id, i) => `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--line)">
        <b style="width:2ch">${i + 1}.</b>${logo(id, esc)}<span style="flex:1">${esc(team(id).name)}</span>
        <button class="btn small secondary" data-mv="${g}:${i}:-1" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn small secondary" data-mv="${g}:${i}:1" ${i === orderDraft[g].length - 1 ? 'disabled' : ''}>↓</button></div>`).join('')}`).join('')}
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn" id="saveOrder">Potvrdit ruční pořadí</button>
      ${manual ? '<button class="btn secondary" id="autoOrder">Vrátit automatické pořadí</button>' : ''}
      <button class="btn secondary" id="resetDraft">Načíst aktuální pořadí</button></div>
    </section>`;
  app.querySelectorAll('form.lot').forEach((f) => f.onsubmit = async (e) => {
    e.preventDefault();
    const t = lots[Number(f.dataset.k)];
    const lotsObj = Object.fromEntries(t.ids.map((id) => [id, Number(f.elements[String(id)].value)]));
    if (new Set(Object.values(lotsObj)).size !== t.ids.length) { alert('Každý tým musí mít jiné místo.'); return; }
    if (!confirm('Uložit výsledek losu?')) return;
    try { await ctx.call('PUT', `/api/admin/lots/${t.g}`, { lots: lotsObj }); ctx.flash('ok', 'Los uložen.'); orderDraft = null; }
    catch (err) { if (err.silent) return; ctx.flash('err', err.message); }
    renderOrder(app, ctx, head);
  });
  app.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => {
    const [g, i, d] = b.dataset.mv.split(':'); const a = orderDraft[g]; const j = Number(i) + Number(d);
    [a[i], a[j]] = [a[j], a[i]]; renderOrder(app, ctx, head);
  });
  document.getElementById('resetDraft').onclick = () => { orderDraft = null; renderOrder(app, ctx, head); };
  document.getElementById('saveOrder').onclick = async () => {
    if (!confirm('Potvrdit ruční pořadí obou skupin? Utkání o umístění se nasadí podle něj.')) return;
    try { await ctx.call('PUT', '/api/admin/manual-order', { order: orderDraft }); ctx.flash('ok', 'Ruční pořadí platí.'); }
    catch (err) { if (err.silent) return; ctx.flash('err', err.message); }
    renderOrder(app, ctx, head);
  };
  document.getElementById('autoOrder')?.addEventListener('click', async () => {
    if (!confirm('Vrátit automatické pořadí podle pravidel?')) return;
    try { await ctx.call('PUT', '/api/admin/manual-order', { order: null }); ctx.flash('ok', 'Platí automatické pořadí.'); orderDraft = null; }
    catch (err) { if (err.silent) return; ctx.flash('err', err.message); }
    renderOrder(app, ctx, head);
  });
}

// ---------- Rozpis ----------
export async function renderSchedule(app, ctx, head) {
  const { esc } = ctx;
  app.innerHTML = `${ctx.tabs()}<div class="card">Načítání…</div>`;
  try { await loadModel(ctx); } catch (e) { if (!e.silent) app.innerHTML = `${ctx.head()}<div class="banner err">${esc(e.message)}</div>`; return; }
  const rng = (a, b) => `${toHHMM(a)}–${toHHMM(b)}`;
  app.innerHTML = `${ctx.head()}<section class="card"><h2>Úprava rozpisu</h2>
    <div class="muted">Posuň začátek budoucího bloku, nebo prodluž právě probíhající. Všechny další bloky a navázané obědy se posunou o stejný rozdíl. Proběhlé bloky a zahájené obědy zůstanou.</div>
    <form id="sf" style="margin-top:10px">
      <label>Blok</label><select name="blockId">${M.blocks.map((b) => `<option value="${b.id}">${rng(b.from, b.to)} · ${esc(b.games.length ? b.games.map((id) => { const m = M.matches.find((x) => x.id === id); return `${team(m.home)?.code ?? m.homeSeed}×${team(m.away)?.code ?? m.awaySeed}`; }).join(', ') : b.title)}</option>`).join('')}</select>
      <label>Druh změny</label><select name="mode"><option value="start">Posunout začátek (budoucí blok)</option><option value="extend">Prodloužit probíhající blok</option></select>
      <label>O kolik minut (záporné = dřív / zkrátit)</label><input name="minutes" inputmode="numeric" value="5">
      <button class="btn block" type="submit">Zobrazit dopad změny</button></form>
    ${shiftPreview ? `<div style="margin-top:14px"><h3>Náhled: ${shiftPreview.minutes > 0 ? '+' : ''}${shiftPreview.minutes} min</h3>
      <table><thead><tr><th>Blok</th><th>Původně</th><th>Nově</th></tr></thead><tbody>
      ${shiftPreview.blocks.map((b) => `<tr><td>${esc(b.games ? `${b.games} zápas(y)` : b.title)}</td><td>${rng(b.from[0], b.to[0])}</td><td><b>${rng(b.from[1], b.to[1])}</b></td></tr>`).join('')}</tbody></table>
      ${shiftPreview.lunches.length ? `<table><thead><tr><th>Oběd</th><th>Původně</th><th>Nově</th></tr></thead><tbody>${shiftPreview.lunches.map((l) => `<tr><td>${l.teams.map((t) => esc(team(t).code)).join(' + ')}</td><td>${rng(l.from[0], l.to[0])}</td><td><b>${l.freezeNow ? 'beze změny (už začal)' : rng(l.from[1], l.to[1])}</b></td></tr>`).join('')}</tbody></table>` : ''}
      <button class="btn" id="applyShift">Potvrdit posun</button> <button class="btn secondary" id="cancelShift">Zrušit</button></div>` : ''}
    </section>`;
  const f = document.getElementById('sf');
  if (shiftPreview) { f.blockId.value = String(shiftPreview.blockId); f.mode.value = shiftPreview.mode; f.minutes.value = String(shiftPreview.minutes); }
  f.onsubmit = async (e) => {
    e.preventDefault();
    const body = { blockId: Number(f.blockId.value), mode: f.mode.value, minutes: Number(f.minutes.value) };
    try { shiftPreview = { ...(await ctx.call('POST', '/api/admin/schedule/preview', body)), blockId: body.blockId }; }
    catch (err) { if (err.silent) return; ctx.flash('err', err.message); shiftPreview = null; }
    renderSchedule(app, ctx, head);
  };
  document.getElementById('cancelShift')?.addEventListener('click', () => { shiftPreview = null; renderSchedule(app, ctx, head); });
  document.getElementById('applyShift')?.addEventListener('click', async () => {
    try { await ctx.call('POST', '/api/admin/schedule/apply', { blockId: shiftPreview.blockId, mode: shiftPreview.mode, minutes: shiftPreview.minutes }); ctx.flash('ok', 'Rozpis posunut.'); }
    catch (err) { if (err.silent) return; ctx.flash('err', err.message); }
    shiftPreview = null; renderSchedule(app, ctx, head);
  });
}

// ---------- Týmy ----------
export async function renderTeams(app, ctx, head) {
  const { esc } = ctx;
  app.innerHTML = `${ctx.tabs()}<div class="card">Načítání…</div>`;
  try { await loadModel(ctx); } catch (e) { if (!e.silent) app.innerHTML = `${ctx.head()}<div class="banner err">${esc(e.message)}</div>`; return; }
  app.innerHTML = `${ctx.head()}<section class="card"><h2>Týmy</h2><div class="muted">Název je na dvou řádcích (jak se zobrazí v tabulkách). Zkratka a barva se použijí na stadionu.</div>
    ${M.teams.map((t) => `<form class="tf" data-id="${t.id}" style="margin:12px 0;padding:10px;border:1px solid var(--line);border-radius:10px">
      <div style="display:flex;align-items:center;gap:8px">${logo(t.id, esc)}<b>${esc(t.name)}</b><span class="muted">skupina ${t.group}</span></div>
      <div class="edit"><div><label>1. řádek</label><input name="line1" value="${esc(t.lines[0])}" maxlength="30"></div><div><label>2. řádek</label><input name="line2" value="${esc(t.lines[1])}" maxlength="30"></div>
      <div><label>Zkratka</label><input name="code" value="${esc(t.code)}" maxlength="4"></div><div><label>Barva</label><input name="color" type="color" value="${esc(t.color)}" style="height:44px;padding:2px"></div></div>
      <button class="btn small" type="submit" style="margin-top:8px">Uložit</button></form>`).join('')}</section>`;
  app.querySelectorAll('form.tf').forEach((f) => f.onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    try { await ctx.call('PUT', `/api/admin/teams/${f.dataset.id}`, v); ctx.flash('ok', 'Tým uložen.'); }
    catch (err) { if (err.silent) return; ctx.flash('err', err.message); }
    renderTeams(app, ctx, head);
  });
}

// ---------- Propozice: PDF ke stažení ----------
export async function renderPropozice(app, ctx, head) {
  const { esc } = ctx;
  app.innerHTML = `${ctx.tabs()}<div class="card">Načítání…</div>`;
  try { await loadModel(ctx); } catch (e) { if (!e.silent) app.innerHTML = `${ctx.head()}<div class="banner err">${esc(e.message)}</div>`; return; }
  const f = M.propozicePdf;
  const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);
  app.innerHTML = `${ctx.head()}<section class="card"><h2>PDF propozic</h2>
    <p class="muted">Nahrané PDF se zobrazí na webu v záložce Propozice jako tlačítko ke stažení. Nové nahrání nahradí předchozí soubor. Maximálně 8 MB.</p>
    ${f ? `<p><span class="pill ok">nahráno</span> <b>${esc(f.name)}</b> · ${kb(f.size)} · verze ${f.version}<br>
      <a href="${ctx.api()}/api/propozice.pdf?v=${f.version}" target="_blank" rel="noopener">Otevřít PDF</a></p>` : '<p><span class="pill no">zatím nenahráno</span></p>'}
    <form id="pf"><label for="pdf">${f ? 'Nahrát novou verzi' : 'Vybrat PDF'}</label><input id="pdf" name="pdf" type="file" accept="application/pdf,.pdf" required>
      <button class="btn block" type="submit">Nahrát PDF</button></form>
    ${f ? '<button class="btn secondary" id="pdel" style="margin-top:10px">Odebrat PDF z webu</button>' : ''}</section>`;
  document.getElementById('pf').onsubmit = async (e) => {
    e.preventDefault();
    const file = document.getElementById('pdf').files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { ctx.flash('err', 'PDF je větší než 8 MB.'); return renderPropozice(app, ctx, head); }
    e.target.querySelector('button').disabled = true;
    try { await ctx.call('PUT', '/api/admin/propozice-pdf', file); ctx.flash('ok', 'PDF propozic nahráno.'); }
    catch (err) { if (err.silent) return; ctx.flash('err', err.message); }
    renderPropozice(app, ctx, head);
  };
  const del = document.getElementById('pdel');
  if (del) del.onclick = async () => {
    if (!confirm('Odebrat PDF propozic z webu?')) return;
    try { await ctx.call('DELETE', '/api/admin/propozice-pdf'); ctx.flash('ok', 'PDF odebráno.'); }
    catch (err) { if (err.silent) return; ctx.flash('err', err.message); }
    renderPropozice(app, ctx, head);
  };
}

// ---------- Tipy pro rodiče ----------
export async function renderTips(app, ctx, head) {
  const { esc } = ctx;
  app.innerHTML = `${ctx.tabs()}<div class="card">Načítání…</div>`;
  try { await loadModel(ctx); } catch (e) { if (!e.silent) app.innerHTML = `${ctx.head()}<div class="banner err">${esc(e.message)}</div>`; return; }
  app.innerHTML = `${ctx.head()}<section class="card"><h2>Tipy pro rodiče</h2>
    ${M.tips.length ? M.tips.map((t) => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${esc(t.title)}</b> <span class="muted">${esc(t.address)}</span><div>${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">Mapa</a>` : t.address ? '<span class="muted">mapa podle adresy</span>' : ''}${t.web ? ` · <a href="${esc(t.web)}" target="_blank" rel="noopener">Web</a>` : ''}</div>
      <button class="btn small secondary" data-del="${t.id}" style="margin-top:4px">Odebrat</button></div>`).join('') : '<p class="muted">Zatím žádné tipy.</p>'}
    <form id="tf" style="margin-top:12px"><label>Název (např. restaurace)</label><input name="title" maxlength="90" required>
      <label>Adresa</label><input name="address" maxlength="150">
      <label>Odkaz na mapy (Mapy.cz nebo Google Maps)</label><input name="url" type="url" placeholder="https://mapy.cz/…">
      <div class="muted">V mapách klepni na Sdílet → Kopírovat odkaz a vlož ho sem. Když pole necháš prázdné, odkaz na mapu se vytvoří z adresy.</div>
      <label>Webové stránky (nepovinné)</label><input name="web" type="url" placeholder="https://www.restaurace.cz">
      <button class="btn block" type="submit">Přidat tip</button></form></section>`;
  document.getElementById('tf').onsubmit = async (e) => {
    e.preventDefault();
    try { await ctx.call('POST', '/api/admin/tips', Object.fromEntries(new FormData(e.target))); ctx.flash('ok', 'Tip přidán.'); }
    catch (err) { if (err.silent) return; ctx.flash('err', err.message); }
    renderTips(app, ctx, head);
  };
  app.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('Odebrat tip?')) return;
    try { await ctx.call('DELETE', `/api/admin/tips/${b.dataset.del}`); ctx.flash('ok', 'Tip odebrán.'); }
    catch (err) { if (err.silent) return; ctx.flash('err', err.message); }
    renderTips(app, ctx, head);
  });
}

// ---------- Historie ----------
const ACTION = {
  'period.confirm': 'Potvrzena třetina', 'period.correct': 'Opravena třetina', 'period.delete': 'Smazána třetina', 'shootout.set': 'Nájezdy',
  'lot.set': 'Los', 'lot.clear': 'Los zrušen', 'manual_order.set': 'Ruční pořadí', 'schedule.shift': 'Posun rozpisu', 'team.update': 'Úprava týmu',
  'tip.add': 'Přidán tip', 'tip.delete': 'Odebrán tip', 'propozice_pdf.upload': 'Nahráno PDF propozic', 'propozice_pdf.delete': 'Odebráno PDF propozic', 'lunch.settings': 'Cena a menu obědu', 'lunch_order.save': 'Objednávka obědů', 'team_access.generate': 'Nové odkazy týmů',
  'gmail.paired': 'Spárován Gmail', 'mail.retry': 'Znovu odeslat e-mail', 'mail.mark-sent': 'E-mail potvrzen ručně', 'admin_user.add': 'Přidán správce',
};
export async function renderAudit(app, ctx, head) {
  const { esc, fmt } = ctx;
  app.innerHTML = `${ctx.tabs()}<div class="card">Načítání…</div>`;
  let rows;
  try { rows = (await ctx.call('GET', '/api/admin/audit')).rows; } catch (e) { if (!e.silent) app.innerHTML = `${ctx.head()}<div class="banner err">${esc(e.message)}</div>`; return; }
  const short = (o) => (o ? esc(JSON.stringify(o)).slice(0, 160) : '');
  app.innerHTML = `${ctx.head()}<section class="card"><h2>Historie změn</h2><div class="muted">Posledních 50 změn.</div>
    <div class="tablewrap"><table class="stack"><thead><tr><th>Kdy</th><th>Co</th><th>Kdo</th><th class="hide-m">Detail</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td class="muted">${fmt(r.at)}</td><td><b>${esc(ACTION[r.action] || r.action)}</b></td><td class="muted">${esc(String(r.actor).replace(/^admin:/, ''))}</td><td class="hide-m muted">${short(r.before)}${r.before && r.after ? ' → ' : ''}${short(r.after)}</td></tr>`).join('')}
    </tbody></table></div></section>`;
}
