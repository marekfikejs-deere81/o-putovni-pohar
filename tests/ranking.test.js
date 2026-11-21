import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rankGroup, groupFinished, pendingLots, validateLot, applyManualOrder,
  seedPlacements, guardStartedPlacements, placementWinner, rankLabel, validatePeriods,
} from '../shared/ranking.js';

const g = (home, away, periods = []) => ({ home, away, periods });
const order = (res) => res.rows.map((r) => `${r.rank}.${r.id}${r.tie ? '*' : ''}`);
const row = (res, id) => res.rows.find((r) => r.id === id);

test('Razeni §3: minitabulka oddělí Červené, Modří a Bílí se vrací ke vzájemnému zápasu', () => {
  // Č, M, B po 8 bodech. D, E doplněny tak, aby body souhlasily s příkladem.
  const games = [
    g('C', 'M', [[3, 1], [2, 0]]), g('M', 'B', [[2, 1], [3, 1]]), g('B', 'C', [[5, 4], [4, 3]]),
    g('C', 'D', [[1, 1], [1, 1]]), g('C', 'E', [[0, 0], [0, 0]]),
    g('M', 'D', [[1, 1], [1, 1]]), g('M', 'E', [[0, 0], [0, 0]]),
    g('B', 'D', [[1, 1], [1, 1]]), g('B', 'E', [[0, 0], [0, 0]]),
    g('D', 'E', [[2, 0], [2, 0]]),
  ];
  const res = rankGroup(['C', 'M', 'B', 'D', 'E'], games);
  for (const id of ['C', 'M', 'B']) assert.equal(row(res, id).points, 8);
  assert.deepEqual(order(res), ['1.D', '2.C', '3.M', '4.B', '5.E']);
});

test('Razeni §2: dva týmy – vzájemné 4:0 a 0:1 = 4:1 rozhoduje', () => {
  const games = [
    g('Modri', 'Bili', [[4, 0], [0, 1]]),
    g('Modri', 'X', [[0, 5], [0, 0]]),
    g('Bili', 'X', [[0, 1], [0, 0]]),
  ];
  const res = rankGroup(['Modri', 'Bili', 'X'], games);
  assert.equal(row(res, 'Modri').points, row(res, 'Bili').points);
  assert.deepEqual(order(res), ['1.X', '2.Modri', '3.Bili']);
});

test('Dva týmy – vzájemné 3:3 → rozhoduje rozdíl branek ve skupině', () => {
  const games = [
    g('P', 'Q', [[3, 0], [0, 3]]),
    g('P', 'R', [[5, 0], [0, 0]]),
    g('Q', 'R', [[1, 0], [0, 0]]),
  ];
  const res = rankGroup(['P', 'Q', 'R'], games);
  assert.deepEqual(order(res), ['1.P', '2.Q', '3.R']);
});

test('Dva týmy bez sehraného vzájemného utkání → přeskočit, rozdíl branek', () => {
  const games = [g('P', 'Q'), g('P', 'R', [[2, 0]]), g('Q', 'R', [[5, 0]])];
  const res = rankGroup(['P', 'Q', 'R'], games);
  assert.deepEqual(order(res), ['1.Q', '2.P', '3.R']);
});

test('Přejímka: první výsledek 0:0 – oba 1 bod, 0/4, Z=1 R=1, ostatní beze změny', () => {
  const teams = ['VLA', 'BEN', 'CEB', 'MBL', 'LIT'];
  const empty = rankGroup(teams, [g('VLA', 'BEN'), g('CEB', 'MBL')]);
  assert.equal(empty.started, false);
  assert.equal(rankLabel(empty.rows[0], empty.started), '–');
  const res = rankGroup(teams, [g('VLA', 'BEN', [[0, 0]]), g('CEB', 'MBL')]);
  assert.equal(res.started, true);
  for (const id of ['VLA', 'BEN']) {
    const r = row(res, id);
    assert.deepEqual([r.points, r.goalsFor, r.goalsAgainst, r.played, r.periods, r.draws], [1, 0, 0, 0, 1, 1]);
  }
  assert.deepEqual(order(res), ['1.VLA*', '1.BEN*', '3.CEB*', '3.MBL*', '3.LIT*']);
});

test('Přejímka: třetiny 1:2 a 5:3 → 6:5, body 2:2, dohráno 1/4, Z=2', () => {
  const res = rankGroup(['A', 'B'], [g('A', 'B', [[1, 2], [5, 3]])]);
  const a = row(res, 'A');
  const b = row(res, 'B');
  assert.deepEqual([a.goalsFor, a.goalsAgainst, a.points, a.played, a.periods], [6, 5, 2, 1, 2]);
  assert.deepEqual([b.goalsFor, b.goalsAgainst, b.points, b.wins, b.losses], [5, 6, 2, 1, 1]);
  assert.equal(a.periods, a.wins + a.draws + a.losses);
  assert.equal(a.points, 2 * a.wins + a.draws);
});

test('Úplná shoda: sdílená příčka 1., 2., 2., 4. a los ji vyřeší', () => {
  const games = [
    g('W', 'P', [[3, 0], [3, 0]]), g('W', 'Q', [[3, 0], [3, 0]]), g('W', 'R', [[3, 0], [3, 0]]),
    g('P', 'Q', [[1, 1], [1, 1]]), g('P', 'R', [[2, 0], [2, 0]]), g('Q', 'R', [[2, 0], [2, 0]]),
  ];
  const tied = rankGroup(['W', 'P', 'Q', 'R'], games);
  assert.deepEqual(order(tied), ['1.W', '2.P*', '2.Q*', '4.R']);
  assert.deepEqual(pendingLots(tied.rows), [{ rank: 2, ids: ['P', 'Q'] }]);
  assert.deepEqual(validateLot(['P', 'Q'], { P: 1, Q: 1 }).length, 1);
  assert.deepEqual(validateLot(['P', 'Q'], { P: 2, Q: 1 }), []);
  const lotted = rankGroup(['W', 'P', 'Q', 'R'], games, { Q: 1, P: 2 });
  assert.deepEqual(order(lotted), ['1.W', '2.Q', '3.P', '4.R']);
});

test('Neúplný los se nepoužije', () => {
  const games = [g('P', 'Q', [[1, 1], [1, 1]])];
  assert.deepEqual(order(rankGroup(['P', 'Q'], games, { P: 1 })), ['1.P*', '1.Q*']);
});

test('Nasazení: bez dohrání obou skupin nikdo; nevyřešená shoda čeká', () => {
  const rowsA = [{ id: 'a1', rank: 1, tie: false }, { id: 'a2', rank: 2, tie: true }, { id: 'a3', rank: 2, tie: true }];
  const rowsB = [{ id: 'b1', rank: 1, tie: false }, { id: 'b2', rank: 2, tie: false }, { id: 'b3', rank: 3, tie: false }];
  assert.deepEqual(seedPlacements({ rowsA, rowsB, finishedA: true, finishedB: false })[0], { place: 1, A: null, B: null });
  const seeds = seedPlacements({ rowsA, rowsB, finishedA: true, finishedB: true });
  assert.deepEqual(seeds, [
    { place: 1, A: 'a1', B: 'b1' },
    { place: 3, A: null, B: 'b2' },
    { place: 5, A: null, B: 'b3' },
  ]);
});

test('Ruční pořadí platí i před koncem skupin a chrání rozehrané utkání', () => {
  const rows = [{ id: 'x', rank: 1, tie: true, points: 2 }, { id: 'y', rank: 1, tie: true, points: 2 }];
  const manual = applyManualOrder(rows, ['y', 'x']);
  assert.deepEqual(manual.map((r) => [r.id, r.rank, r.points]), [['y', 1, 2], ['x', 2, 2]]);
  assert.throws(() => applyManualOrder(rows, ['y', 'y']));
  const cur = [{ place: 1, A: 'a', B: 'b' }, { place: 3, A: 'c', B: 'd' }];
  const swap = [{ place: 1, A: 'c', B: 'b' }, { place: 3, A: 'a', B: 'd' }];
  assert.equal(guardStartedPlacements(cur, swap, [3]).length, 1);
  assert.equal(guardStartedPlacements(cur, cur, [1, 3]).length, 0);
  assert.equal(guardStartedPlacements(cur, swap, []).length, 0);
});

test('Vítěz utkání o umístění: body ze třetin, při shodě nájezdy', () => {
  assert.equal(placementWinner([[1, 0]]), null);
  assert.equal(placementWinner([[2, 1], [0, 0]]), 'home');
  assert.equal(placementWinner([[2, 1], [0, 3]]), null); // 2:2 bodů, chybí nájezdy
  assert.equal(placementWinner([[2, 1], [0, 3]], 'away'), 'away');
  // Rozhodují body, ne součet branek (5:4 na branky, ale 2:2 na body):
  assert.equal(placementWinner([[5, 0], [0, 4]], 'away'), 'away');
});

test('Validace zápisu třetin', () => {
  assert.deepEqual(validatePeriods([[0, 0], [3, 2]]), []);
  assert.equal(validatePeriods([[1, -1]]).length, 1);
  assert.equal(validatePeriods([[1, 1], [1, 1], [1, 1]]).length, 1);
  assert.equal(validatePeriods([[1.5, 0]]).length, 1);
});

test('groupFinished', () => {
  assert.equal(groupFinished([g('a', 'b', [[0, 0], [1, 1]])]), true);
  assert.equal(groupFinished([g('a', 'b', [[0, 0]])]), false);
});
