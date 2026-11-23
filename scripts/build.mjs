// Sestaví statický web pro GitHub Pages do dist/.
// Obsahuje hlavní stránku, samostatný vstup stadion.html, sdílený kód, data a loga.
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';

const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const [src, dst] of [['web', '.'], ['shared', 'shared'], ['data', 'data'], ['loga', 'loga']]) {
  cpSync(src, `${out}/${dst}`, { recursive: true });
}

// Písmo pro export rozpisu (stejné jako v PDF zápisu).
cpSync('worker/fonts', `${out}/fonts`, { recursive: true });

// Veřejná konfigurace (jen veřejné URL, nikdy tajemství).
// Web míří na ostré API. Testovací API: https://o-putovni-pohar-api-test.marek-fikejs.workers.dev
const DEFAULT_API = 'https://o-putovni-pohar-api.marek-fikejs.workers.dev'; // OSTRÝ provoz od 23. 11. 2026
const config = { apiBase: process.env.PUBLIC_API_BASE || DEFAULT_API, builtAt: new Date().toISOString(), commit: process.env.GITHUB_SHA || 'local' };
writeFileSync(`${out}/config.json`, JSON.stringify(config, null, 2));

// GitHub Pages nemá Jekyll zpracovávat soubory.
writeFileSync(`${out}/.nojekyll`, '');

// Krátké odkazy týmů …/obedy-xxxxxx: GitHub Pages pro neznámou adresu vrátí 404.html = formulář obědů,
// který si kód přečte z adresy. Jiné neznámé adresy ukážou „Stránka nenalezena“.
writeFileSync(`${out}/404.html`, readFileSync(`${out}/obedy.html`, 'utf8').replace('<html lang="cs">', '<html lang="cs" data-notfound>'));

for (const required of ['index.html', 'stadion.html', 'obedy.html', 'admin.html', 'soukromi.html', '404.html']) {
  if (!existsSync(`${out}/${required}`)) throw new Error(`Chybí ${required} v buildu`);
}
const size = readFileSync(`${out}/stadion.html`).length;
console.log(`Build hotov → ${out}/ (stadion.html ${size} B, commit ${config.commit.slice(0, 7)})`);
