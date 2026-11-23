// Objednávky obědů: validace, ceny a text potvrzovacího e-mailu. Čisté funkce.
import { toHHMM } from './schedule.js';

export const NOTE_MAX = 100;
export const ORGANIZER_CC = 'm.kakos9@seznam.cz';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Ověří vstup formuláře. Vrací { value, errors }; errors je objekt pole → česká hláška. */
export function validateOrder(input) {
  const errors = {};
  const int = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  const players = int(input?.players);
  const staff = int(input?.staff);
  if (!Number.isInteger(players) || players < 0 || players > 99) errors.players = 'Zadej celé číslo 0 až 99.';
  if (!Number.isInteger(staff) || staff < 0 || staff > 99) errors.staff = 'Zadej celé číslo 0 až 99.';
  const note = ''; // poznámka k objednávce byla zrušena (23. 11. 2026)
  const email = typeof input?.email === 'string' ? input.email.trim() : '';
  if (!email) errors.email = 'Vyplň e-mail pro potvrzení.';
  else if (!EMAIL_RE.test(email) || email.length > 200) errors.email = 'E-mail nemá platný tvar.';
  const version = input?.version === null || input?.version === undefined ? null : int(input.version);
  if (version !== null && !Number.isInteger(version)) errors.version = 'Neplatná verze objednávky.';
  return { value: { players, staff, note, email, version }, errors };
}

export const portions = (o) => o.players + o.staff;
/** Cena objednávky: hráči a realizační tým mají různou cenu. prices = { player, staff } */
export const totalPrice = (o, prices) => o.players * prices.player + o.staff * prices.staff;

/** Formát ceny „2 190 Kč“ (pevná mezera mezi tisíci). */
export const czk = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Kč`;

/**
 * Potvrzovací e-mail. Neobsahuje týmový odkaz (ten se v databázi neukládá v čitelné podobě).
 * @param {{label, version, players, staff, note, email}} order
 * @param {{name, dayText, prices: {player, staff}, menu, organizer}} t
 * @param {{from, to}|null} lunch okno obědu v minutách
 */
export function confirmationMail(order, t, lunch) {
  const change = order.version > 1;
  const subject = `${change ? 'Změna objednávky' : 'Objednávka'} obědů – ${order.label} – ${t.name}`;
  const lines = [
    `Dobrý den,`,
    ``,
    change
      ? `potvrzujeme změnu objednávky obědů (verze ${order.version}).`
      : `potvrzujeme přijetí objednávky obědů.`,
    ``,
    `Turnaj: ${t.name}`,
    `Datum: ${t.dayText}`,
    `Tým: ${order.label}`,
    lunch ? `Oběd: ${toHHMM(lunch.from)}–${toHHMM(lunch.to)} – předběžně (restaurace na zimním stadionu)` : null,
    ``,
    `Hráči: ${order.players} × ${czk(t.prices.player)} = ${czk(order.players * t.prices.player)}`,
    `Realizační tým: ${order.staff} × ${czk(t.prices.staff)} = ${czk(order.staff * t.prices.staff)}`,
    `Celkem porcí: ${portions(order)}`,
    `Celková cena: ${czk(totalPrice(order, t.prices))}`,
    ``,
    `Menu: ${t.menu}`,
    ``,
    `Přesný časový rozpis zápasů a časová okna obědů pro jednotlivé týmy budou finální v den turnaje. Aktuální časy najdete vždy na www.vlasimskypohar.cz.`,
    ``,
    change
      ? `Změnu provedl pořadatel turnaje.`
      : `Objednávka je odeslaná a závazná. Případnou změnu domluvte s pořadatelem (${t.organizer}).`,
    ``,
    `HC Rytíři Vlašim`,
  ].filter((l) => l !== null);
  return { subject, body: lines.join('\n') };
}
