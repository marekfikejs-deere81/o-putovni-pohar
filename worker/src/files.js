// PDF propozic: pořadatel ho nahraje v Adminu, veřejnost stahuje z /api/propozice.pdf.
import { ApiError } from './errors.js';
import { withTx, TOURNAMENT_ID } from './orders.js';

export const MAX_PDF = 8 * 1024 * 1024;

const toB64 = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const cleanName = (n) => {
  const s = String(n || '').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 120);
  return s ? (/\.pdf$/i.test(s) ? s : `${s}.pdf`) : 'propozice.pdf';
};

export async function savePropozicePdf(q, bytes, filename, actor) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 5) throw new ApiError(422, 'Soubor je prázdný.');
  if (bytes.length > MAX_PDF) throw new ApiError(413, 'PDF je větší než 8 MB.');
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new ApiError(422, 'Soubor není PDF.');
  const name = cleanName(filename);
  return withTx(q, async () => {
    const [r] = await q(
      `INSERT INTO propozice_pdf (id, filename, bytes, uploaded_by) VALUES (1, $1, decode($2, 'base64'), $3)
       ON CONFLICT (id) DO UPDATE SET filename = EXCLUDED.filename, bytes = EXCLUDED.bytes, uploaded_by = EXCLUDED.uploaded_by,
         uploaded_at = now(), version = propozice_pdf.version + 1
       RETURNING version`,
      [name, toB64(bytes), actor],
    );
    await q(`INSERT INTO audit_log (actor, action, after) VALUES ($1, 'propozice_pdf.upload', $2)`, [actor, JSON.stringify({ filename: name, size: bytes.length })]);
    await q(`UPDATE tournament SET revision = revision + 1 WHERE id = $1`, [TOURNAMENT_ID]);
    return { filename: name, size: bytes.length, version: r.version };
  });
}

export async function deletePropozicePdf(q, actor) {
  return withTx(q, async () => {
    const r = await q(`DELETE FROM propozice_pdf WHERE id = 1 RETURNING filename`);
    if (!r.length) throw new ApiError(404, 'PDF propozic není nahrané.');
    await q(`INSERT INTO audit_log (actor, action, before) VALUES ($1, 'propozice_pdf.delete', $2)`, [actor, JSON.stringify({ filename: r[0].filename })]);
    await q(`UPDATE tournament SET revision = revision + 1 WHERE id = $1`, [TOURNAMENT_ID]);
    return { ok: true };
  });
}

export async function loadPropozicePdf(q) {
  const [r] = await q(`SELECT filename, version, encode(bytes, 'base64') AS b64 FROM propozice_pdf WHERE id = 1`);
  if (!r) return null;
  return { filename: r.filename, version: r.version, bytes: Uint8Array.from(atob(r.b64), (c) => c.charCodeAt(0)) };
}
