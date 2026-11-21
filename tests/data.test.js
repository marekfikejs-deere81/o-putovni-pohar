import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { normalizeBlocks, blockAt, nextGameBlock, lunchWindows, icePhase, minutesUntil, toMinutes, toHHMM } from '../shared/schedule.js';

const root = new URL('../', import.meta.url);
const load = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const teams = load('data/tymy.json');
const blocks = normalizeBlocks(load('data/harmonogram.json'));
const lunches = load('data/obedy.json');
const byCode = new Map(teams.map((t) => [t.code, t]));
const games = blocks.flatMap((b) => b.games.map((gm) => ({ ...gm, block: b })));

test('Přejímka „Nový turnaj“: 10 týmů, 20 + 5 utkání, prázdná skóre', () => {
  assert.equal(teams.length, 10);
  assert.equal(new Set(teams.map((t) => t.id)).size, 10);
  assert.equal(new Set(teams.map((t) => t.code)).size, 10);
  assert.equal(games.length, 25);
  assert.equal(games.filter((x) => x.place === null).length, 20);
  assert.deepEqual(games.filter((x) => x.place !== null).map((x) => x.place).sort((a, b) => a - b), [1, 3, 5, 7, 9]);
  assert.ok(games.every((x) => x.periods.length === 0));
  assert.deepEqual([...new Set(games.map((x) => x.id))].sort((a, b) => a - b), [...Array(25).keys()]);
});

test('Každá dvojice ve skupině právě jednou, plocha = skupina, Vlašim A a B odděleně', () => {
  const seen = new Set();
  for (const gm of games.filter((x) => x.place === null)) {
    const h = byCode.get(gm.home);
    const a = byCode.get(gm.away);
    assert.ok(h && a, `${gm.home}/${gm.away}`);
    assert.equal(h.group, a.group);
    assert.equal(gm.rink, h.group);
    const key = [gm.home, gm.away].sort().join('-');
    assert.ok(!seen.has(key), key);
    seen.add(key);
  }
  assert.equal(seen.size, 20);
  assert.notEqual(byCode.get('VLA').group, byCode.get('VLB').group);
  assert.notEqual(byCode.get('VLA').id, byCode.get('VLB').id);
});

test('Znaky, zkratky a dvouřádkové názvy', () => {
  for (const t of teams) {
    assert.ok(existsSync(new URL(t.web, root)), t.web);
    assert.ok(existsSync(new URL(t.stadium, root)), t.stadium);
    assert.equal(t.lines.length, 2);
    assert.equal(t.lines.join(' '), t.name);
    assert.match(t.color, /^#[0-9a-f]{6}$/i);
  }
  assert.deepEqual(byCode.get('CEB').lines, ['HC Motor', 'Č. Budějovice']);
  for (const grp of ['A', 'B']) {
    assert.deepEqual(teams.filter((t) => t.group === grp).map((t) => t.slot).sort(), [1, 2, 3, 4, 5]);
  }
});

test('Rozpis 08:00–18:00 navazuje bez mezer, finále jen plocha A', () => {
  assert.equal(blocks[0].start, '08:00');
  assert.equal(blocks.at(-1).end, '18:00');
  for (let i = 1; i < blocks.length; i++) assert.equal(blocks[i].from, blocks[i - 1].to);
  const final = games.find((x) => x.place === 1);
  assert.equal(final.rink, 'A');
  assert.equal(final.block.games.length, 1);
  assert.equal(final.block.start, '16:35');
});

test('Mezi skupinovými zápasy týmu nejméně 50 minut', () => {
  for (const t of teams) {
    const own = games.filter((x) => x.place === null && (x.home === t.code || x.away === t.code)).map((x) => x.block).sort((a, b) => a.from - b.from);
    assert.equal(own.length, 4, t.code);
    for (let i = 1; i < own.length; i++) assert.ok(own[i].from - own[i - 1].to >= 50, t.code);
  }
});

test('Přejímka „Časy“: hraniční okamžiky', () => {
  const at = (hhmm) => blockAt(blocks, toMinutes(hhmm));
  assert.equal(at('08:00').games.length, 2);
  assert.equal(at('09:10').games.length, 0);
  assert.equal(at('09:25').start, '09:25');
  assert.equal(at('12:00').title, 'Úprava ledu + polední pauza');
  assert.equal(at('12:20').games.length, 2);
  assert.equal(at('15:10').games.length, 2);
  assert.equal(at('15:45').games.length, 2);
  assert.equal(at('16:20').games.length, 0);
  assert.deepEqual(at('16:35').games.map((x) => x.rink), ['A']);
  assert.equal(at('17:10').title, 'Vyhlášení výsledků a předání cen');
  assert.equal(at('18:00'), null);
  const next = nextGameBlock(blocks, toMinutes('09:10'));
  assert.deepEqual(next.games.map((x) => `${x.home}×${x.away}`), ['BEN×LIT', 'SVE×PLZ']);
  assert.equal(minutesUntil(next.from, toMinutes('09:10') * 60), 15);
  assert.equal(minutesUntil(next.from, toMinutes('09:10') * 60 + 1), 15); // zaokrouhleno nahoru
});

test('Přejímka „Stadion“: rotace 10 s při úpravě ledu v 09:10', () => {
  const s = (sec) => toMinutes('09:10') * 60 + sec;
  assert.deepEqual(icePhase(toMinutes('09:10'), s(9)), { view: 'krizova', group: 'A' });
  assert.deepEqual(icePhase(toMinutes('09:10'), s(10)), { view: 'krizova', group: 'B' });
  assert.deepEqual(icePhase(toMinutes('09:10'), s(20)), { view: 'poradi', group: 'A' });
  assert.deepEqual(icePhase(toMinutes('09:10'), s(30)), { view: 'poradi', group: 'B' });
  assert.deepEqual(icePhase(toMinutes('09:10'), s(40)), { view: 'krizova', group: 'A' });
});

test('Obědy: 5 oken, 10 týmů, časy z kotev, žádná kolize s vlastním zápasem', () => {
  const windows = lunchWindows(lunches, blocks);
  assert.equal(windows.length, 5);
  assert.equal(new Set(windows.flatMap((w) => w.teams)).size, 10);
  for (const w of windows) {
    assert.equal(toHHMM(w.from), w.start);
    assert.equal(toHHMM(w.to), w.end);
    for (const code of w.teams) {
      for (const gm of games.filter((x) => x.place === null && (x.home === code || x.away === code))) {
        assert.ok(w.to <= gm.block.from || w.from >= gm.block.to, `${code} oběd × zápas ${gm.block.start}`);
      }
    }
  }
  // Posun rozpisu o +10 min od bloku 5 posune navázané obědy
  const shifted = blocks.map((b) => (b.from >= toMinutes('10:35') ? { ...b, from: b.from + 10, to: b.to + 10 } : b));
  assert.equal(toHHMM(lunchWindows(lunches, shifted)[0].from), '10:55');
});

test('Cena obědu: 12 hráčů + 3 RT = 15 × 170 = 2 550 Kč', () => {
  assert.equal((12 + 3) * 170, 2550);
});
