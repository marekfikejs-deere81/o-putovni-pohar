# O putovní pohár – Vánoční turnaj 2. tříd

HC Rytíři Vlašim · pondělí 28. 12. 2026 · Zimní stadion Vlašim · 08:00–18:00 (Europe/Prague)

Veřejný mobilní web, zabezpečený Admin a samostatná stadionová obrazovka nad jednou publikovanou verzí dat.

## Adresy

| Co | URL |
|---|---|
| Web | https://marekfikejs-deere81.github.io/o-putovni-pohar/ |
| Stadion (přímý vstup) | https://marekfikejs-deere81.github.io/o-putovni-pohar/stadion.html |
| API (Cloudflare Worker) | doplní se v etapě 2 |

## Architektura

- **GitHub Pages** – statický mobilní web a `stadion.html` (build z `web/`, `shared/`, `data/`, `loga/`).
- **Cloudflare Worker** (`worker/`, etapa 2) – HTTPS API, ověření oprávnění, cron, Gmail API.
- **Neon Postgres** (`db/`, etapa 2) – výsledky, rozpis, objednávky, fronta pošty, audit. Oddělená větev pro test a produkci.
- **Neon Auth** – přihlášení správce e-mailem a heslem.
- `shared/` – jediná implementace bodování, pořadí, minitabulky, losu, nasazení a časů. Používá ji web, stadion i Worker.

## Struktura

```
data/        ostrý rozpis: tymy.json, harmonogram.json, obedy.json (bez výsledků)
loga/web     znaky pro světlý mobilní web
loga/stadion schválené průhledné znaky pro černou tabuli (bez dalšího odstraňování bílé)
shared/      ranking.js (pořadí), schedule.js (časy, obědy, rotace stadionu)
tests/       node:test – závazné příklady z Razeni-a-priklady.md a přejímací scénáře
web/         index.html, stadion.html
scripts/     build.mjs
docs/        zadání, propozice, předlohy 1600×960, referenční prototyp
```

## Lokální spuštění

Potřebuješ Node.js 22+.

```bash
npm test          # všechny testy
npm run build     # sestaví dist/
npm run dev       # build + lokální server na http://localhost:5173
```

## Nasazení

Push na `main` spustí workflow **Test, build a nasazení**: testy → build → GitHub Pages.
Jednorázově je potřeba v repozitáři zapnout *Settings → Pages → Source: GitHub Actions*.

## Tajemství

Žádná tajemství nepatří do Gitu. Názvy proměnných jsou v `.env.example`; hodnoty jsou ve Worker Secrets (Cloudflare) a v GitHub Secrets pro CI.
