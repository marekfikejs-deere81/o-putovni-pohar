// Generálka na testu: skutečná doména + testovací API + testovací databáze Neon.
// Spouští workflow „Generálka (test)“. Nikdy nesahá na produkci (kontroluje ENVIRONMENT=test).
//  1) vyčistí testovací data (výsledky, objednávky, odkazy, frontu e-mailů, tipy, PDF) – Gmail a správce zůstávají
//  2) objednávky přes HTTP s krátkými odkazy (jednorázovost, idempotence, neplatný kód, limit pokusů, uzávěrka)
//  3) celý turnaj: 25 zápasů, los, nájezdy, nasazení, PDF zápis
//  4) web na doméně v prohlížeči (Playwright): stránky, krátký odkaz, stadion, výpadek a obnova spojení
//  5) pošta: potvrzení odejdou přes Gmail (MAIL_MODE=test → jen pořadateli)
import pg from 'pg';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { adminGenerateLinks, adminLunchSettings } from '../worker/src/orders.js';
import { model, savePeriod, setShootout, setLots, addTip, shiftSchedule } from '../worker/src/results.js';
import { buildSummary, queueTest } from '../worker/src/mail.js';
import { savePropozicePdf } from '../worker/src/files.js';

const API = process.env.API || 'https://o-putovni-pohar-api-test.marek-fikejs.workers.dev';
const SITE = process.env.SITE || 'https://www.vlasimskypohar.cz';
const OUT = 'generalka';
mkdirSync(OUT, { recursive: true });
const A = 'admin:generalka';

const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: Boolean(cond), detail }); console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' – ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const q = async (text, params = []) => (await client.query(text, params)).rows;

// ---------- 0) pojistka: jen test ----------
const health = await fetch(`${API}/api/health`).then((r) => r.json());
if (health.env !== 'test') { console.error('API není testovací – generálka se nespustí.'); process.exit(1); }
ok('API běží (test)', health.ok, `revize ${health.revision}`);

// ---------- 1) vyčištění testovacích dat ----------
await q('BEGIN');
for (const t of ['order_fail', 'shootout', 'period', 'lot', 'lunch_order_history', 'lunch_order', 'request_key', 'team_access', 'mail_outbox', 'parent_tip', 'report_pdf', 'propozice_pdf']) await q(`DELETE FROM ${t}`);
await q(`UPDATE tournament SET manual_order = NULL, lunch_price_player_czk = 140, lunch_price_staff_czk = 150, lunch_deadline = '2026-12-13T00:00:00+01:00', revision = revision + 1`);
await q('COMMIT');
ok('Testovací data vyčištěna (Gmail a správce ponechány)', true);

// ---------- 2) objednávky přes HTTP ----------
const links = await adminGenerateLinks(q, null, A, new Date().toISOString());
ok('9 krátkých odkazů', links.length === 9 && links.every((l) => /^[a-hjkmnp-z2-9]{6}$/.test(l.token)), links.map((l) => `${l.key}:${l.token}`).join(' '));
const order = (token, method = 'GET', body, idem) => fetch(`${API}/api/order`, {
  method, headers: { 'X-Order-Token': token, Origin: SITE, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(idem ? { 'Idempotency-Key': idem } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});
const v = await order(links[1].token.toUpperCase());
const vj = await v.json();
ok('Odkaz funguje i velkými písmeny, tým vidí své údaje', v.ok && vj.prices?.staff === 150, `${vj.label || ''} · ceny ${vj.prices?.player}/${vj.prices?.staff}`);
ok('CORS pro doménu', v.headers.get('access-control-allow-origin') === SITE);

let sent = 0;
for (const [i, l] of links.entries()) {
  if (l.key === 'SLA') continue; // jeden tým schválně neobjedná → NEOBJEDNÁNO v souhrnu
  const body = { players: 8 + i, staff: (i % 3) + 1, email: 'marek.fikejs@gmail.com' };
  const idem = `gen-${l.key}-${Date.now()}`;
  const r = await order(l.token, 'POST', body, idem);
  if (r.ok) sent++;
  if (i === 0) {
    const again = await order(l.token, 'POST', body, idem);
    ok('Dvojklik (stejný Idempotency-Key) nezaloží druhou objednávku', again.ok);
    const second = await order(l.token, 'POST', { ...body, players: 99 }, idem + '-b');
    ok('Druhé odeslání týmem odmítnuto (změny jen pořadatel)', second.status === 409, `HTTP ${second.status}`);
  }
}
ok('8 objednávek odesláno přes web', sent === 8);
const hist = await q(`SELECT count(*)::int n FROM lunch_order_history`);
ok('Historie objednávek: 8 záznamů', hist[0].n === 8, `${hist[0].n}`);
const bad = await order('zzzzzz');
ok('Neplatný kód → 404', bad.status === 404);

// uzávěrka: dočasně do minulosti
const slaToken = links.find((l) => l.key === 'SLA').token;
await q(`UPDATE tournament SET lunch_deadline = now() - interval '1 minute'`);
const late = await order(slaToken, 'POST', { players: 5, staff: 1, email: 'marek.fikejs@gmail.com' }, `gen-late-${Date.now()}`);
ok('Po uzávěrce tým objednat nemůže', late.status >= 400 && late.status < 500, `HTTP ${late.status}`);
await q(`UPDATE tournament SET lunch_deadline = '2026-12-13T00:00:00+01:00'`);

// cena a menu (změna se propíše do veřejného modelu)
await adminLunchSettings(q, { player: 140, staff: 150, menu: 'Hovězí vývar, špagety s boloňskou omáčkou, šťáva' }, A);

// ---------- 3) celý turnaj ----------
let M = await model(q);
const groupIds = M.matches.filter((m) => m.place === null).map((m) => m.id);
for (const id of groupIds) {
  const m = M.matches.find((x) => x.id === id);
  // skupina A: všechny třetiny 1:1 → úplná shoda → los; skupina B: různé výsledky
  const p = m.rink === 'A' ? [[1, 1], [1, 1]] : [[(id * 7) % 4, (id * 3) % 3], [(id + 2) % 3, (id * 5) % 4]];
  await savePeriod(q, id, 1, { home: p[0][0], away: p[0][1] }, A);
  await savePeriod(q, id, 2, { home: p[1][0], away: p[1][1] }, A);
}
M = await model(q);
ok('Skupiny dohrané', M.groups.A.finished && M.groups.B.finished);
const tiesA = M.groups.A.pendingLots;
ok('Skupina A: shoda po všech kritériích → čeká na los', tiesA.length === 1 && tiesA[0].ids.length === 5);
const placeholder = M.matches.find((m) => m.place === 1);
ok('Bez losu se finále nenasadí', placeholder.home === null || placeholder.away === null);
for (const g of ['A', 'B']) for (const t of M.groups[g].pendingLots) await setLots(q, g, { lots: Object.fromEntries(t.ids.map((id, k) => [id, k + 1])) }, A);
M = await model(q);
ok('Po losu jsou nasazená všechna utkání o umístění', M.matches.filter((m) => m.place).every((m) => m.home !== null && m.away !== null));
for (const m of M.matches.filter((x) => x.place).sort((a, b) => b.place - a.place)) {
  if (m.place === 9) { // remíza na body → nájezdy
    await savePeriod(q, m.id, 1, { home: 2, away: 1 }, A); await savePeriod(q, m.id, 2, { home: 1, away: 2 }, A);
    M = await model(q);
    ok('Utkání o 9. místo: shoda bodů → bez vítěze, čeká na nájezdy', M.matches.find((x) => x.id === m.id).winner === null);
    await setShootout(q, m.id, { winner: 'away' }, A);
  } else {
    await savePeriod(q, m.id, 1, { home: 3, away: 1 }, A); await savePeriod(q, m.id, 2, { home: 2, away: 2 }, A);
  }
}
M = await model(q);
ok('Všech 25 zápasů zapsáno', M.matches.every((m) => m.periods.length === 2), `${M.matches.filter((m) => m.periods.length === 2).length}/25`);
ok('Finále potvrzeno → zápis připraven', M.finalDone && M.reportReady);
const prev = await shiftSchedule(q, { mode: 'start', blockId: M.blocks[5].id, minutes: 10 }, A, 9 * 60, false).catch((e) => ({ error: e.message }));
ok('Náhled posunu rozpisu (bez uložení)', !prev.error, prev.error || '');

await addTip(q, { title: 'Ukázková restaurace', address: 'Palackého náměstí, Vlašim', web: 'https://www.vlasim.cz' }, A);
const pdfBytes = readFileSync('docs/reference/Puvodni-propozice.pdf', { encoding: null });
await savePropozicePdf(q, new Uint8Array(pdfBytes), 'Propozice-O-putovni-pohar-2026.pdf', A).then(
  (r) => ok('PDF propozic nahráno', true, `${Math.round(r.size / 1024)} kB`),
  (e) => ok('PDF propozic nahráno', false, e.message),
);

// veřejná data přes HTTP
const pub = await fetch(`${API}/api/public`, { headers: { Origin: SITE } });
const PM = await pub.json();
const etag = pub.headers.get('etag');
ok('Veřejný model přes API ukazuje dohraný turnaj', PM.finalDone === true && PM.matches.every((m) => m.periods.length === 2), `revize ${PM.revision}`);
ok('Veřejný model neobsahuje e-maily', !JSON.stringify(PM).includes('@'));
const p304 = await fetch(`${API}/api/public`, { headers: { 'If-None-Match': `W/${etag.replace(/^W\//, '')}` } });
ok('Obnova bez změny → 304', p304.status === 304);
const rep = await fetch(`${API}/api/report.pdf`);
const repBytes = new Uint8Array(await rep.arrayBuffer());
writeFileSync(`${OUT}/zapis-turnaje.pdf`, repBytes);
ok('PDF zápis turnaje ke stažení', rep.ok && new TextDecoder().decode(repBytes.slice(0, 5)) === '%PDF-', `${Math.round(repBytes.length / 1024)} kB`);
const prop = await fetch(`${API}/api/propozice.pdf`);
ok('PDF propozic ke stažení', prop.ok && prop.headers.get('content-type') === 'application/pdf');
const adm = await fetch(`${API}/api/admin/orders`, { headers: { Origin: SITE } });
ok('Admin API bez přihlášení → 401', adm.status === 401);

// souhrn obědů (obsah) + zkušební odeslání souhrnu
const sum = await buildSummary(q);
writeFileSync(`${OUT}/souhrn-obedu.txt`, `${sum.subject}\n\n${sum.body}`);
ok('Souhrn: 9 řádků, 1× NEOBJEDNÁNO', sum.body.split('\n').filter((l) => l.startsWith('• ')).length === 9 && (sum.body.match(/NEOBJEDNÁNO/g) || []).length === 1);
await queueTest(q, 'summary', 'marek.fikejs@gmail.com');

// ---------- 4) web na doméně ----------
const page = async (path) => { const r = await fetch(`${SITE}${path}`, { redirect: 'manual' }); return { status: r.status, text: r.status < 300 || r.status === 404 ? await r.text() : '', loc: r.headers.get('location') }; };
for (const p of ['/', '/admin.html', '/stadion.html', '/soukromi.html', '/config.json']) { const r = await page(p); ok(`Doména ${p}`, r.status === 200, `HTTP ${r.status}`); }
const short = await page(`/obedy-${links[1].token}`);
ok('Krátký odkaz na doméně vrací formulář obědů', short.status === 404 && short.text.includes('data-notfound') && short.text.includes('Objednávka obědů'));
const apex = await fetch('https://vlasimskypohar.cz/', { redirect: 'manual' });
ok('vlasimskypohar.cz → www', [301, 302, 308].includes(apex.status) && /www\.vlasimskypohar\.cz/.test(apex.headers.get('location') || ''), `${apex.status} ${apex.headers.get('location') || ''}`);
const http = await fetch('http://www.vlasimskypohar.cz/', { redirect: 'manual' });
ok('http → https', [301, 302, 308].includes(http.status) && (http.headers.get('location') || '').startsWith('https://'), `${http.status}`);

// prohlížeč
const { chromium } = await import('playwright');
const br = await chromium.launch();
const phone = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pg1 = await phone.newPage();
const errors = [];
pg1.on('pageerror', (e) => errors.push(String(e)));
await pg1.goto(`${SITE}/?cas=16:40#prehled`);
await pg1.waitForSelector('.matrix', { timeout: 20000 });
await pg1.screenshot({ path: `${OUT}/01-prehled.png`, fullPage: true });
ok('Přehled: tlačítko PDF výsledků aktivní', await pg1.locator('.export a.pdf').count() === 1);
for (const [i, tab] of ['program', 'umisteni', 'rodice', 'obedy', 'propozice'].entries()) {
  await pg1.click(`nav [data-page=${tab}]`); await pg1.waitForTimeout(500);
  await pg1.screenshot({ path: `${OUT}/0${i + 2}-${tab}.png`, fullPage: true });
}
await pg1.click('nav [data-page=umisteni]'); await pg1.waitForTimeout(300);
const order9 = await pg1.locator('.place h3').allTextContents();
ok('Umístění podle času (finále poslední)', order9.at(-1) === 'O 1. místo', order9.join(', '));
// výpadek spojení a obnova
await pg1.click('nav [data-page=prehled]');
await pg1.route('**/api/public', (r) => r.abort());
await pg1.waitForTimeout(12000);
const offline = await pg1.locator('#status').textContent();
await pg1.unroute('**/api/public');
await pg1.waitForTimeout(8000);
const online = await pg1.locator('#status').textContent();
ok('Výpadek: web ukáže „Bez spojení“ a data zůstanou', /Bez spojení/.test(offline) && await pg1.locator('.matrix').count() > 0);
ok('Po obnovení spojení se web sám vrátí', /Aktualizováno/.test(online));
// program skočí na aktuální blok
await pg1.goto(`${SITE}/?cas=12:30#prehled`); await pg1.waitForSelector('.matrix');
await pg1.click('nav [data-page=program]'); await pg1.waitForTimeout(500);
const y = await pg1.evaluate(() => [window.scrollY, document.getElementById('nyni')?.getBoundingClientRect().top]);
ok('Program se posune na právě probíhající blok', y[0] > 100 && Math.abs(y[1]) < 40, `scrollY ${y[0]}`);
await pg1.screenshot({ path: `${OUT}/08-program-nyni.png` });
// krátký odkaz týmu (už objednáno)
await pg1.goto(`${SITE}/obedy-${links[2].token}`); await pg1.waitForTimeout(2500);
await pg1.screenshot({ path: `${OUT}/09-obedy-odkaz.png`, fullPage: true });
ok('Krátký odkaz otevře objednávku týmu', /Objednávka|objednáno|odeslán/i.test(await pg1.textContent('body')));
await pg1.goto(`${SITE}/neexistuje`); await pg1.waitForTimeout(1500);
ok('Neznámá adresa → „Stránka nenalezena“', /Stránka nenalezena/.test(await pg1.textContent('body')));
await pg1.goto(`${SITE}/admin.html`); await pg1.waitForTimeout(1500);
await pg1.screenshot({ path: `${OUT}/10-admin-login.png` });
ok('Admin: přihlašovací stránka', /Přihlásit|heslo/i.test(await pg1.textContent('body')));
const sw = await pg1.evaluate(() => document.documentElement.scrollWidth);
ok('Admin se vejde na šířku telefonu', sw <= 390, `${sw} px`);
ok('Bez chyb JavaScriptu', errors.length === 0, errors.slice(0, 3).join(' | '));
// stadion
const tv = await br.newContext({ viewport: { width: 1600, height: 960 } });
const st = await tv.newPage();
for (const [cas, n] of [['10:55', 'zapas'], ['12:05', 'uprava-ledu'], ['16:40', 'finale']]) {
  await st.goto(`${SITE}/stadion.html?cas=${cas}`); await st.waitForTimeout(4000);
  await st.screenshot({ path: `${OUT}/11-stadion-${n}.png` });
}
ok('Stadion se vykreslí', (await st.textContent('body')).length > 20);
await br.close();

// ---------- 5) pošta ----------
// Potvrzení odesílá Worker hned po každé objednávce. Zkušební souhrn čeká ve frontě na hodinový běh serveru –
// ověří, že souhrn odejde i bez otevřeného prohlížeče (výsledek uvidíš v Adminu → Pošta a ve Gmailu).
let byStatus = {};
for (let i = 0; i < 12; i++) {
  byStatus = Object.fromEntries((await q(`SELECT status, count(*)::int n FROM mail_outbox WHERE kind <> 'test' GROUP BY status`)).map((m) => [m.status, m.n]));
  if ((byStatus.sent || 0) >= 8 || byStatus.failed || byStatus.unknown) break;
  await sleep(10000);
}
ok('8 potvrzení objednávek odesláno přes Gmail', (byStatus.sent || 0) >= 8, JSON.stringify(byStatus));
const waiting = await q(`SELECT kind, status FROM mail_outbox WHERE kind = 'test'`);
ok('Zkušební souhrn čeká na automatické odeslání serverem', waiting.length === 1, waiting.map((w) => w.status).join(','));

// limit pokusů o hádání kódů (na konci, aby nebrzdil ostatní kontroly)
let limited = 0;
for (let i = 0; i < 30; i++) { const r = await order('zzzzzz'); if (r.status === 429) limited++; await sleep(150); }
ok('Hádání kódů brzdí limit pokusů (HTTP 429)', limited > 0, `${limited}× 429 ze 30`);
await q(`DELETE FROM order_fail`);

await client.end();
const passed = results.filter((r) => r.pass).length;
const md = [`# Generálka – ${new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}`, '', `**${passed}/${results.length} v pořádku**`, '',
  '| | Kontrola | Detail |', '|---|---|---|', ...results.map((r) => `| ${r.pass ? '✅' : '❌'} | ${r.name} | ${String(r.detail).replace(/\|/g, '/')} |`)].join('\n');
writeFileSync(`${OUT}/vysledek.md`, md);
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, md);
process.exit(passed === results.length ? 0 : 1);
