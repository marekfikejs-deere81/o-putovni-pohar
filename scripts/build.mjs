// Sestaví statický web pro GitHub Pages do dist/.
// Obsahuje hlavní stránku, samostatný vstup stadion.html, sdílený kód, data a loga.
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';

const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const [src, dst] of [['web', '.'], ['shared', 'shared'], ['data', 'data'], ['loga', 'loga']]) {
  cpSync(src, `${out}/${dst}`, { recursive: true });
}

// Veřejná konfigurace (jen veřejné URL, nikdy tajemství).
// Do ostrého spuštění míří web na testovací API; při přepnutí stačí změnit DEFAULT_API.
const DEFAULT_API = 'https://o-putovni-pohar-api-test.marek-fikejs.workers.dev';
const config = { apiBase: process.env.PUBLIC_API_BASE || DEFAULT_API, builtAt: new Date().toISOString(), commit: process.env.GITHUB_SHA || 'local' };
writeFileSync(`${out}/config.json`, JSON.stringify(config, null, 2));

// GitHub Pages nemá Jekyll zpracovávat soubory.
writeFileSync(`${out}/.nojekyll`, '');

for (const required of ['index.html', 'stadion.html', 'obedy.html']) {
  if (!existsSync(`${out}/${required}`)) throw new Error(`Chybí ${required} v buildu`);
}
const size = readFileSync(`${out}/stadion.html`).length;
console.log(`Build hotov → ${out}/ (stadion.html ${size} B, commit ${config.commit.slice(0, 7)})`);
