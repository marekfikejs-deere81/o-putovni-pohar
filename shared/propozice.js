// Oficiální propozice turnaje ve strukturované podobě (web i PDF zápis).
// Menu a ceny obědu se doplňují z nastavení v Adminu (fillPropozice).
// Text vychází z Puvodni-propozice.pdf / docs/Propozice-obsah.md; stravování upraveno podle rozhodnutí 23. 11. 2026.
export const PROPOZICE = [
  {
    title: 'Základní informace',
    items: [
      ['Datum', 'pondělí 28. 12. 2026'],
      ['Místo', 'Zimní stadion Vlašim'],
      ['Kategorie', 'ročník 2019 a mladší, dívky ročník 2018'],
      ['Startovné', '8 000 Kč za tým'],
      ['Stravování', 'v případě zájmu zajištěno v restauraci na zimním stadionu'],
      ['Pořadatel', 'Tomáš Vondráček, +420 734 362 033, tomas.vondracek@hcvlasim.cz'],
    ],
    text: [
      'Vánoční turnaj 2. tříd o Putovní pohár je určen pro hráče ročníku 2019. Turnaje se zúčastní celkem 10 týmů a každý tým odehraje celkem 5 utkání.',
      'Cílem turnaje je nabídnout dětem dostatek herního prostoru, vyrovnaná utkání a společný hokejový den vedený v duchu fair play. Turnaj se hraje podle platných pravidel ČSLH.',
    ],
  },
  {
    title: 'Systém turnaje a počet hráčů',
    text: [
      'Deset týmů je rozděleno do dvou pětičlenných skupin A a B. Skupiny se hrají systémem každý s každým, každý tým tak odehraje 4 utkání v základní skupině.',
      'Po skončení skupin následují utkání o konečné umístění:',
    ],
    list: ['o 1. místo: 1A × 1B', 'o 3. místo: 2A × 2B', 'o 5. místo: 3A × 3B', 'o 7. místo: 4A × 4B', 'o 9. místo: 5A × 5B'],
    after: [
      'Utkání se hrají na třetině ledové plochy s mantinely na modré čáře ve formátu 3 + 1.',
      'Minimálně 6 hráčů + 1 brankář, maximálně 9 hráčů + 2 brankáři na tým.',
    ],
  },
  {
    title: 'Hrací doba, fauly a body',
    text: [
      'Hrací doba utkání je 2 × 14 minut s pravidelným střídáním po jedné minutě.',
      'Po skončení každého poločasu se provedou samostatné nájezdy za fauly odpískané v daném poločase. Za každý faul získává soupeř jeden nájezd, který provede faulovaný hráč. Výsledek nájezdů se započítává do skóre.',
      'Boduje se každý poločas zvlášť:',
    ],
    list: ['výhra – 2 body', 'remíza – 1 bod', 'prohra – 0 bodů'],
  },
  {
    title: 'Pořadí ve skupinách',
    text: [
      'O pořadí rozhoduje počet získaných bodů. Při rovnosti bodů rozhodují postupně: výsledek vzájemného utkání, rozdíl vstřelených a obdržených branek, vyšší počet vstřelených branek, nižší počet obdržených branek, los pořadatele. Při rovnosti tří a více týmů se pro dotčené týmy vytvoří minitabulka jejich vzájemných utkání.',
      'Upřesnění pořadatele: při shodě bodů dvou týmů rozhoduje součet branek obou poločasů jejich vzájemného zápasu. Při shodném skóre rozhoduje celkový rozdíl branek ve skupině, vyšší počet vstřelených, nižší počet obdržených branek a nakonec los pořadatele. Pokud minitabulka oddělí ostatní týmy a dvojice zůstane shodná, posoudí se znovu podle skóre jejich vzájemného zápasu.',
    ],
  },
  {
    title: 'Utkání o umístění',
    text: [
      'Výsledky utkání o umístění určují konečné pořadí turnaje. Tato utkání musí znát vítěze. Při shodě bodů po základní hrací době rozhodnou samostatné nájezdy.',
      'Každý tým určí 3 hráče, kteří provedou po jednom nájezdu. Pokud nebude rozhodnuto, pokračují nájezdy náhlou smrtí po jedné sérii s obráceným pořadím týmů. Utkání končí, jakmile po stejném počtu nájezdů získá jeden tým rozhodující náskok. Hráči se nesmí opakovat, dokud nájezd neprovedou všichni hráči týmu.',
    ],
  },
  {
    title: 'Startovné a ceny',
    text: [
      'Startovné 8 000 Kč za tým zahrnuje ledovou plochu, časomíru a organizaci utkání, rozhodčí, poháry, medaile a diplomy, občerstvení pro hráče do kabiny a zdravotnickou službu.',
      'Každý tým obdrží sadu medailí pro hráče. Týmy na 1., 2. a 3. místě obdrží pohár. Vítěz turnaje obdrží PUTOVNÍ POHÁR.',
    ],
  },
  {
    title: 'Stravování',
    text: [
      'Pořadatel nabízí oběd pro hráče a členy realizačních týmů: {menu}.',
      'Cena: hráč {cenaHrac}, člen realizačního týmu {cenaRT}. Objednávky do 12. 12. 2026 včetně přes odkaz, který každý tým dostal od pořadatele. Kontakt ke stravování: Martin Kakos, +420 732 773 346.',
    ],
  },
  {
    title: 'Fair play a organizační pravidla',
    text: [
      'Turnaj je pořádán především pro děti. Hlavním cílem je radost ze hry, získávání zkušeností a podpora sportovního chování. Trenéři, rodiče a doprovod jsou žádáni, aby respektovali rozhodčí, soupeře i všechny mladé hráče.',
      'Vedoucí týmů odpovídají za své hráče po celou dobu turnaje. Každý tým má dvě sady dresů, světlé a tmavé. Rozhodnutí rozhodčího během utkání je konečné. Situace neupravené propozicemi řeší hlavní pořadatel. Hrubé nesportovní chování nebude tolerováno.',
    ],
  },
];

const czk = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')}\u00a0Kč`;

/** Propozice s aktuálním menu a cenami z modelu turnaje (lunch = M.tournament.lunch). */
export function fillPropozice(lunch) {
  const menu = String(lunch?.menu || '').trim().replace(/\.$/, '');
  const map = { '{menu}': menu, '{cenaHrac}': czk(lunch?.prices?.player ?? 0), '{cenaRT}': czk(lunch?.prices?.staff ?? 0) };
  const fill = (t) => t.replace(/\{menu\}|\{cenaHrac\}|\{cenaRT\}/g, (k) => map[k]);
  return PROPOZICE.map((s) => ({
    ...s,
    items: s.items?.map(([k, v]) => [k, fill(v)]),
    text: s.text?.map(fill),
    list: s.list?.map(fill),
    after: s.after?.map(fill),
  }));
}
