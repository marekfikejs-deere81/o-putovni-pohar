import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migrate, seed, TOURNAMENT_ID } from '../db/apply.mjs';
import { savePropozicePdf, deletePropozicePdf, loadPropozicePdf } from '../worker/src/files.js';
import { loadPublicRaw } from '../worker/src/queries.js';
import { buildPublicModel } from '../shared/public-model.js';

test('PDF propozic: kontrola typu, nová verze přepíše starou, model, smazání', async () => {
  const db = new PGlite();
  const exec = (sql, params) => (params ? db.query(sql, params) : db.exec(sql).then((r) => r.at(-1) || { rows: [] }));
  await migrate(exec, () => {}); await seed(exec, () => {});
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  const pdf = (t) => new TextEncoder().encode(`%PDF-1.4\n${t}\n%%EOF`);
  await assert.rejects(savePropozicePdf(q, new TextEncoder().encode('<html>'), 'x.pdf', 'admin:m'), (e) => e.status === 422);
  await assert.rejects(savePropozicePdf(q, new Uint8Array(8 * 1024 * 1024 + 1), 'x.pdf', 'admin:m'), (e) => e.status === 413);
  assert.equal((await savePropozicePdf(q, pdf('a'), 'Propozice 2026', 'admin:m')).version, 1);
  const r2 = await savePropozicePdf(q, pdf('bb'), '../Propozice/finální.pdf', 'admin:m');
  assert.deepEqual([r2.version, r2.filename], [2, '..Propozicefinální.pdf']);
  const f = await loadPropozicePdf(q);
  assert.equal(new TextDecoder().decode(f.bytes), '%PDF-1.4\nbb\n%%EOF');
  const m = buildPublicModel(await loadPublicRaw(q, TOURNAMENT_ID));
  assert.deepEqual(m.propozicePdf, { name: '..Propozicefinální.pdf', size: f.bytes.length, version: 2 });
  await deletePropozicePdf(q, 'admin:m');
  assert.equal(await loadPropozicePdf(q), null);
  await assert.rejects(deletePropozicePdf(q, 'admin:m'), (e) => e.status === 404);
});
