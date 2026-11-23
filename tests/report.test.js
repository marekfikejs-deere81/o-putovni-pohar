import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { migrate, seed } from '../db/apply.mjs';
import { model, savePeriod } from '../worker/src/results.js';
import { generateReport, reportPdf } from '../worker/src/report.js';

const fonts = {
  regular: readFileSync(new URL('../worker/fonts/DejaVuSans.ttf', import.meta.url)),
  bold: readFileSync(new URL('../worker/fonts/DejaVuSans-Bold.ttf', import.meta.url)),
};
const A = 'admin:test';

async function playAll() {
  const db = new PGlite();
  const exec = (sql, params) => (params ? db.query(sql, params) : db.exec(sql).then((r) => r.at(-1) || { rows: [] }));
  await migrate(exec, () => {});
  await seed(exec, () => {});
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  for (let id = 0; id < 20; id++) { await savePeriod(q, id, 1, { home: (id * 7) % 5, away: (id * 3) % 4 }, A); await savePeriod(q, id, 2, { home: id % 3, away: (id + 1) % 4 }, A); }
  return q;
}

test('PDF zápis: není před finále, po finále obsahuje vše a cache drží jednu verzi na revizi', async () => {
  const q = await playAll();
  let M = await model(q);
  assert.equal(M.reportReady, false);
  assert.equal(await reportPdf(q, fonts), null);
  for (const g of M.matches.filter((m) => m.place)) {
    await savePeriod(q, g.id, 1, { home: 3, away: 1 }, A);
    await savePeriod(q, g.id, 2, { home: 2, away: 2 }, A);
  }
  M = await model(q);
  assert.equal(M.reportReady, true);
  const r1 = await reportPdf(q, fonts);
  assert.ok(r1.bytes.length > 20000);
  assert.equal(new TextDecoder().decode(r1.bytes.slice(0, 5)), '%PDF-');
  const r2 = await reportPdf(q, fonts);
  assert.deepEqual(Buffer.from(r2.bytes), Buffer.from(r1.bytes)); // z cache
  assert.equal((await q(`SELECT count(*)::int n FROM report_pdf`))[0].n, 1);
  await savePeriod(q, M.matches.find((m) => m.place === 9).id, 2, { home: 0, away: 1 }, A); // oprava → nová verze
  await reportPdf(q, fonts);
  assert.equal((await q(`SELECT count(*)::int n FROM report_pdf`))[0].n, 2);
  if (process.env.REPORT_OUT) writeFileSync(process.env.REPORT_OUT, (await generateReport(q, fonts)).bytes);
});
