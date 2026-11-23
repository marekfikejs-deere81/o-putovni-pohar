# Vánoční turnaj 2. tříd o Putovní pohár
## Zadání ostrého webu HC Rytíři Vlašim • předání 21. 11. 2026

**Pondělí 28. 12. 2026, Zimní stadion Vlašim, 08:00–18:00, Europe/Prague.** Jeden turnaj má tři rozhraní: veřejný mobilní web pro rodiče a trenéry, neveřejnou správu a samostatnou automatickou stránku pro stadion. Všechna používají jednu publikovanou verzi dat. Majitelem repozitáře, nasazení a přístupů bude Marek.

### 1. Jak pracovat s balíčkem

| Soubor nebo adresář | Účel |
|---|---|
| PROMPT-PRO-CLAUDE.md | Úvodní zadání pro Claude včetně způsobu spolupráce s Markem. |
| DOKUMENTACE.md | Funkce, harmonogram, provoz, etapizace a přejímací zkoušky. |
| Propozice-obsah.md, reference/Puvodni-propozice.pdf | Úplný obsah propozic a původní podklad. Na webu obsah uspořádej do témat, při exportu připoj upřesnění z této specifikace. |
| Razeni-a-priklady.md | Podrobný algoritmus včetně minitabulky, modelových příkladů, losu a ručního pořadí. |
| data/tymy.json, harmonogram.json, obedy.json | Strojově čitelný ostrý rozpis. Časy jsou místní. Všechny výsledky jsou při založení prázdné. |
| loga/web, loga/stadion | Hotové PNG podle zkratek. První sada pro světlý mobilní web, druhá s průhledným okolím pro černou tabuli. |
| predlohy/Zapas.jpg, Krizova.jpg, Poradi.jpg | Vizuální cíl 1600 × 960. Čísla na obrázcích jsou ukázková. |
| reference/mobil.html, stadion.html | Zdroj rozhodující pro vzhled schváleného prototypu. Stadionová stránka očekává veřejný datový vstup. Použij její vykreslení a připrav adaptér na produkční data. |

Změny dohodnuté s pořadatelem mají přednost před staršími propozicemi a pracovními ukázkami. Předlohy určují vzhled. Časy a nasazení určuje datový rozpis níže. Soukromý prototyp používá jiné přihlášení, některé změny ukládá do prohlížeče a má specifická serverová rozhraní. Produkční správa musí ukládat přímo do společné databáze. Ověř zápis ze samostatného telefonu.

### 2. Týmy, znaky a základní rozpis

| Nasazení | Skupina A · pod časomírou | Skupina B · pod restaurací |
|---|---|---|
| 1 | VLA · HC Rytíři Vlašim A | VLB · HC Rytíři Vlašim B |
| 2 | BEN · HC Lev Benešov | SVE · HC Světlá nad Sázavou |
| 3 | CEB · HC Motor Č. Budějovice | SLA · HC Slavia Praha |
| 4 | MBL · BK Mladá Boleslav | KOB · HC Kobra Praha |
| 5 | LIT · HC Verva Litvínov | PLZ · HC Škoda Plzeň |

Stabilní ID identifikuje tým i po přejmenování. Dva domácí týmy mají vlastní ID, stejný znak a odlišné skupiny. Zelený znak se lvem patří BK Mladá Boleslav. V datech jsou schválené barvy, zkratky, obě cesty ke znakům i přesné dvouřádkové názvy. U Slavie zůstává bílé celé nitro kruhového znaku, u Plzně bílý podklad sahá nad nápis HC PLZEŇ. Použij dodané stadionové PNG přímo, bez dalšího odstraňování bílé.

**Základní skupiny** hrají každý s každým. Čtyři soupeři na tým, deset utkání na skupinu. Páté utkání každého týmu je o konečné umístění. Dohromady 25 zápasů. Označení 1A ve finále znamená prvního v konečném pořadí A.

| Čas | A · pod časomírou | B · pod restaurací |
|---|---|---|
| 08:00–08:35 | VLA × BEN | VLB × SVE |
| 08:35–09:10 | CEB × MBL | SLA × KOB |
| 09:10–09:25 | Úprava ledu | Úprava ledu |
| 09:25–10:00 | BEN × LIT | SVE × PLZ |
| 10:00–10:35 | VLA × CEB | VLB × SLA |
| 10:35–10:50 | Úprava ledu | Úprava ledu |
| 10:50–11:25 | MBL × LIT | KOB × PLZ |
| 11:25–12:00 | BEN × CEB | SVE × SLA |
| 12:00–12:20 | Úprava ledu + polední pauza | Úprava ledu + polední pauza |
| 12:20–12:55 | VLA × MBL | VLB × KOB |
| 12:55–13:30 | CEB × LIT | SLA × PLZ |
| 13:30–13:45 | Úprava ledu | Úprava ledu |
| 13:45–14:20 | BEN × MBL | SVE × KOB |
| 14:20–14:55 | VLA × LIT | VLB × PLZ |
| 14:55–15:10 | Úprava ledu | Úprava ledu |
| 15:10–15:45 | O 7. místo · 4A × 4B | O 9. místo · 5A × 5B |
| 15:45–16:20 | O 3. místo · 2A × 2B | O 5. místo · 3A × 3B |
| 16:20–16:35 | Úprava ledu | Úprava ledu |
| 16:35–17:10 | O 1. místo · 1A × 1B | Volno |
| 17:10–18:00 | Vyhlášení výsledků a předání cen | Vyhlášení výsledků a předání cen |

Blok tvoří interval od začátku včetně do konce bez něj. Přesně v 09:10 nastává úprava, v 09:25 zápasy. Polední pauza má 20 minut. Při startu v 08:00 má každý tým mezi svými skupinovými zápasy nejméně 50 minut. Finále hraje pouze plocha A. Vyhlášení trvá 17:10–18:00. Administrativní potvrzení vítěze finále zpřístupní PDF i před skončením vyhlášení.

### 3. Telefon rodiče

- **Přehled** při otevření ukáže nejprve Křížovou listinu, vedle ní tlačítko Průběžné pořadí. A a B pod sebou s popisem plochy. Ze všech výsledkových pohledů musí být jasné, kdo právě hraje na obou plochách. Aktuální dvojici určuje rozpis, stav zápisu určují potvrzené třetiny. Zpožděný zápis a právě hraný zápas rozliš textem.
- **Mobilní křížová listina** má znaky v horním záhlaví i u názvů vlevo. Názvy lámou jen v mezerách, na nejvýše dva řádky podle pole `lines`. První sloupec široký podle obsahu, např. „HC Motor“ / „Č. Budějovice“. Pod názvem malý odstup, na střed samostatné řádky „Skóre: 10:10“ a „Body: 12“. Řádky stejně vysoké i bez výsledku, s úsporným odsazením. V buňce nahoře skóre první třetiny, pod ním body, čára a stejná dvojice pro druhou třetinu. Bez číslic označujících třetiny. Z pohledu týmu v řádku, protější buňka je zrcadlová. Diagonála ×, neodehráno —.
- **Mobilní pořadí** má sloupce Poř., Tým, Odehráno, Skóre, Body. Odehráno ukazuje např. 2/4 a zvýší se až druhou potvrzenou třetinou. Skóre a body se mění už po první. Před první potvrzenou třetinou příslušné skupiny zobraz „–“ v pořadí. Na úzkém telefonu má přednost celé slovo a čitelné skóre, případný vodorovný posun zůstává uvnitř tabulky.
- **Program** rozděl modrými časovými pruhy. V každém bloku dej k sobě obě plochy, názvy soupeřů, stav, celkové skóre, detail skóre a bodů obou třetin. Zvýrazni aktuální zápas, úpravu i vyhlášení.
- **Umístění** ukazuje před nasazením pozice, po nasazení jména a znaky, po zápase výsledky a konečné pozice. **Obědy** mají vlastní záložku. **Propozice** čleň do rozbalitelných témat s kontakty a pravidly. **Pro rodiče** patří do patičky, zde pořadatel spravuje restaurace, adresy a tipy. **⚙ Admin** je vpravo nahoře.
- Veškeré popisky, chybové stavy, PDF i e-maily jsou česky. Vždy „třetina/třetiny“. Veřejný přehled funguje bez účtu.

### 4. Zápis, body, pořadí a finále

Hrají se dvě třetiny po 14 minutách. Nájezdy za odpískané fauly patří do skóre příslušné třetiny. Každá třetina přidělí body 2:0, 1:1 nebo 0:2. Prázdná třetina je nezadaná, potvrzená 0:0 je remíza. Uložená první třetina se okamžitě projeví ve všech pohledech, druhá může mít stav „hraje se“. Rozhodující nájezdy po utkání o místo uchovej zvlášť. Vítěze utkání o místo určuje součet bodů za obě třetiny. Při shodě rozhodují nájezdy podle propozic.

**Výpočet automatického pořadí provádí jeden společný algoritmus.** První klíč je součet bodů ze třetin. Při shodě dvou týmů rozhoduje skóre jejich vzájemného utkání v součtu potvrzených třetin. Příklad: 1:1 a 3:0 znamenají vzájemný výsledek 4:1. Následuje celkový rozdíl branek, vyšší počet vstřelených, nižší počet obdržených, nakonec zadaný los. Dosud nesehrané vzájemné utkání přeskoč.

Při shodě 3+ týmů sestav minitabulku výhradně ze vzájemných utkání dotčených týmů. Řaď podle bodů, rozdílu branek, vstřelených a obdržených. Po rozdělení znovu posuď každou zbývající shodnou podskupinu od prvního použitelného kritéria. Při zúžení na dva znovu rozhoduje jejich vzájemný zápas. Pokud minitabulka nerozdělí nikoho, použij branková kritéria celé skupiny a los. Úplnou průběžnou shodu vypiš např. 1., 2., 2., 4., 5. Příklady pro testy jsou v Razeni-a-priklady.md.

Po dohrání obou skupin se jednoznačně určené příčky dosadí do finálových dvojic. Pokud u některé příčky přetrvá shoda, vyzvi pořadatele v **Admin → Výsledky → Los**. Vypiš dotčené týmy, převezmi skutečné pořadí z losu a ověř unikátní čísla 1 až k. Nevyřešené příčky čekají. Po opravě výsledku zneplatni los dotčené skupiny a přepočti důsledky. Po první potvrzené třetině utkání o umístění uzamkni editaci skupinových výsledků.

**Samostatná správa ručního pořadí.** Admin seřadí týmy v obou skupinách, uvidí staré a nové příčky i všech pět vzniklých dvojic. Až druhý krok „Potvrdit ruční pořadí“ vše atomicky publikuje. Režim lze použít i před koncem skupin. Statistiky stále odvozuj ze zápisů. V Přehledu vyznač zásah pořadatele. „Vrátit pořadí podle pravidel“ nejprve zobrazí dopad a vyžádá potvrzení. Obě operace odmítni, kdyby změnily účastníky již rozehraného utkání o místo. Dvojice i pořadí se musí ve všech zařízeních změnit společně.

### 5. Administrace harmonogramu a klubů

Přihlášení e-mailem **marek.fikejs@gmail.com** a vlastním heslem k aplikaci, včetně odhlášení a obnovy hesla. Založ a ověř vlastníka, přiřaď roli na serveru jeho stabilnímu ID. Formulář pro rodiče, účet Google pro odesílání a přístup do GitHubu mají samostatná oprávnění.

Před prvním výsledkem může pořadatel upravit počet týmů (v prototypu 2–6 na skupinu, obě skupiny stejně velké), sestavit soupisku, přesouvat týmy, měnit názvy, zkratky a nahrát loga. Tým lze použít právě jednou, Vlašim A a B vždy odděleně. Po změně počtu ukaž náhled nových dvojic, bloků, rezervací obědů a zápasů o místa. Až potvrzení zapíše strukturu. Při základních 5+5 zachovej přesný seed. První potvrzená třetina uzamyká členství i velikost skupin. Přejmenování nebo změna loga je nadále možná. Zachovej vazby výsledků, objednávek i PDF přes ID.

V Admin → Harmonogram lze opravit začátek budoucího bloku nebo prodloužit právě probíhající blok. Ukaž původní a nové časy všech dotčených událostí a obědů. Po potvrzení posuň následující části dne stejným rozdílem. Chrání se minulost, zahájené obědy a zapsané výsledky. Změna obou ploch je jedna operace. Rozliš plán a skutečný stav výsledku. Náhled zkontroluje kolize, kladné délky, návaznost a oběd během vlastního zápasu. Po uložení se aktualizují Program, zvýraznění týmů, stadionové hodiny rozpisu, odpočty, obědy, zápasy o místo a podklady zápisu. Hodiny na panelu vždy zobrazují místní čas.

### 6. Stadionová obrazovka a její odkazy

**Stálý vstup pro počítač na stadionu je fyzický soubor `stadion.html` v publikovaném webu.** Otevírá se bez přihlášení a bez parametrů, s tlačítkem Celá obrazovka. Po vstupu zmizí ovládací prvky, po obnovení stránky se režim obnoví podle serverového času. Tento odkaz dej do provozního návodu a do Adminu jako „Otevřít stadionovou obrazovku“. Vytvoř skutečný druhý vstup při buildu, který funguje i při přímém otevření URL.

| Prostředí | Odkaz |
|---|---|
| Aktuální schválený prototyp | https://vlasim-pohar-2019-2026.arcanejet1.chatgpt.site/stadion.html |
| Produkce na GitHub Pages (šablona) | `https://<github-ucet>.github.io/<repozitar>/stadion.html` |
| Po připojení koupené domény (šablona) | `https://<vlastni-domena>/stadion.html` |

Podporuj i `?ukazka=zapas` (první dvojzápas), `?ukazka=led` (první úprava, rotace), `?ukazka=krizova` (obě zvýrazněné modelové matice), `?ukazka=poradi` (vyplněné pořadí, začíná A) a `?ukazka=cislice` (typografický stresový test). Ukázky jsou oddělené od databázového zápisu. U ostrého odkazu se spustí živý stav. Před turnajem ukaž úvod a první dvojice, během vyhlášení popisek a konec v 18:00, poté stav „Turnaj zakončen“.

**Vzhled.** Černé pozadí, návrh 1600 × 960, poměr 5:3, celé plátno zachovat při změně rozlišení bez oříznutí. Písmo tučné, čitelné z tribuny. Pro výstupy při úpravě ledu převzít SVG funkci `stadiumPanel` z reference/stadion.html, včetně souřadnic, barev, velikostí a středu dolního pásu. Uprav pouze přívod dat a obsluhu jednotlivých stavů.

1. **Během hry:** nahoře bílé hodiny HH:MM:SS, obě poloviny vedle sebe, A vlevo, B vpravo. V každé polovině vycentrovat velký znak, název klubu, ×, znak a název soupeře. Kompaktní mezery. V průběhu lze zobrazit součet potvrzených třetin s informací po které třetině. Pro finále vlevo jediný zápas, vpravo „Volno“. Pokud následují zápasy, v dolním pásu vlevo dvojice znaků pro A, vpravo pro B, uprostřed „Připraví se“, velký začátek a celé minuty zbývající do nástupu zaokrouhlené nahoru. Pokud je nejbližší blok úprava ledu, ukaž právě tuto událost.
2. **Při úpravě ledu i v polední pauze:** celý cyklus 40 sekund. Od začátku bloku v sekundách 0–9 křížová A, 10–19 křížová B, 20–29 pořadí A, 30–39 pořadí B. Opakovat. Po refreshi nebo návratu okna spočítat fázi z uplynulého času bloku. Ve spodním pásu jsou dvojice první následující hry tentokrát velkými zkratkami (velikost 100 v návrhu 1600 × 960), čas a odpočet uprostřed. V 09:10 dole BEN × LIT a SVE × PLZ, 09:25, „Za 15 min“.
3. **Křížová · skupina A/B:** v horním řádku název, legenda a zelené hodiny HH:MM. Na obou osách schválené zkratky s barevným proužkem, diagonála ×. Dvě sousední políčka v jedné buňce, první třetina vlevo, druhá vpravo. Bílé skóre, zelená výhra, šedá remíza, červená prohra z pohledu řádku. Nezapsaná třetina má pomlčku na tmavé. Protilehlá buňka obrátí čísla i výhru/prohru. Stadionová matice zobrazuje jen skóre, mobil navíc body.
4. **Pořadí · skupina A/B:** řádky s celými názvy a barevným proužkem, domácí tým světle modře. Sloupce příčka, Tým, Z, V, R, P, Skóre, B. Z je počet potvrzených **třetin**, tedy 0–8 při pěti týmech; V/R/P jsou výhry/remízy/prohry těchto třetin. Platí Z = V+R+P a B = 2V+R. Bodový sloupec zlatě. Pořadí je shodné s mobilem i při ručním zásahu. Při shodě rozhoduje schválené pořadí kritérií, nikoliv vizuální pořadí starého obrázku.
5. **Aktualizace:** nové události i výsledky přejímat bez obsluhy přibližně do 5 sekund (reference kontroluje po 4 s). Zobrazit poslední dostupnou konzistentní revizi a viditelně označit výpadek spojení. Při prvním startu bez dat ukázat čekání. Po obnovení připojení znovu načíst data, srovnat čas se serverem a přejít na správný blok. Nevysílat testovací data jako náhradu za nedostupný ostrý zdroj.

### 7. Obědy a e-mailová komunikace

Menu tvoří hovězí vývar, špagety s boloňskou omáčkou a šťáva. Cena: hráč 140 Kč, člen realizačního týmu 150 Kč; cenu i menu mění pořadatel v Adminu (Obědy → Cena a menu). Formulář zobrazuje znak a tým, počty pro **Hráč** a **Realizační tým**, součet porcí a cenu, poznámku do 100 znaků pro alergie/diety a povinný potvrzovací e-mail. Počty jsou nezáporná celá čísla. Společná objednávka pro VLA + VLB platí pro obě družstva dohromady. Ostatních osm týmů má po jedné objednávce. Zůstává tedy deset sportovních týmů a devět objednatelů.

| Oběd | Týmy | Konec předchozí hry | Další začátek | Odstup po obědě |
|---|---|---|---|---|
| 10:45–11:05 | CEB + SLA | 10:35 | 11:25 | 20 min |
| 11:10–11:30 | VLA + VLB | 10:35 | 12:20 | 50 min |
| 11:35–11:55 | MBL + KOB | 11:25 | 12:20 | 25 min |
| 12:00–12:20 | LIT + PLZ | 11:25 | 12:55 | 35 min |
| 12:25–12:45 | BEN + SVE | 12:00 | 13:45 | 60 min |

Restaurace na stadionu, dvě družstva současně, jídlo připravit před příchodem. Data uvádějí vazbu na konkrétní blok a minutový posun pro změny harmonogramu. Použij stálé ID bloku. Při změně struktury rozpisu znovu zkontroluj a potvrď vazby. Již zahájené obědy se neposouvají.

Na web napiš „Objednávky a změny do **12. 12. 2026 včetně**“. Server uzavře týmové zadávání **13. 12. 2026 v 00:00 Europe/Prague** (12. 12. ve 23:00 UTC). Předem zadané počty lze opakovaně měnit. Tým smí měnit pouze svoji objednávku; pro první přístup navrhuji jednorázovou týmovou pozvánku a ověření e-mailu. Samotné napsání známé adresy nesmí zpřístupnit cizí záznam. Rozeslání týmových pozvánek řídí organizátor. Po uzávěrce týmovému zápisu zabrání i API. Každý návštěvník vidí obědová okna a počty Hráč / Realizační tým, Vlašim společně jen jednou. Poznámky a e-maily čte pouze oprávněný objednatel a pořadatel. Admin může objednávku upravit kdykoliv s historií změny.

**Potvrzení každé objednávky i její změny:** From marek.fikejs@gmail.com, To zadaný ověřený e-mail týmu, Cc m.kakos9@seznam.cz. Uveď název turnaje a týmu, datum, obě kategorie, poznámku, menu, cenu za porci a celkovou cenu. Ulož objednávku a záznam k odeslání v jedné transakci. Teprve po úspěchu Gmail API označ verzi jako odeslanou. Opakování stejného požadavku nesmí zakládat další objednávku. Při nejasném výsledku odeslání ponech stav ke kontrole místo slepého opakování; evidence zahrnuje čas, stav a ID zprávy. U bezpečně odmítnutých požadavků opakuj s prodlevou. Admin musí vidět čekající/chybové zprávy.

**Souhrn dne 13. 12. 2026** se sestavuje ze skutečné ostré databáze, i když nikdo nemá otevřený web. Příjemce m.kakos9@seznam.cz, odesílatel marek.fikejs@gmail.com. Po jednom řádku za objednávku včetně neobjednaných (odlišit od výslovně zadané nuly), počty obou kategorií, poznámka, e-mail objednatele, celkové součty porcí a ceny. Navržený čas je 08:00 v Praze, přesná hodina je provozní volba k potvrzení. Eviduj jediný klíč souhrnu pro turnaj a uzávěrku. Po obnovení služby došli zmeškaný souhrn jednou. Před zapnutím nové úlohy zkontroluj existující naplánovanou úlohu „Souhrn obědů pro Martina Kakose“ a její zdroj. Domluv předání mezi oběma úlohami tak, aby skutečný souhrn odeslal právě jeden systém. V testovacím prostředí odesílej jen na dohodnuté testovací příjemce.

### 8. Závěrečný zápis do PDF

Po uložení obou třetin finále a potvrzení vítěze ukaž nahoře na hlavní stránce „Stáhnout zápis turnaje (PDF)“. Podmínku počítej z výsledků na serveru. Zápis musí být dostupný i jinému anonymnímu zařízení. Obsah začíná úplnými propozicemi, poté uvádí skupiny, průběh a skutečné výsledky všech 25 utkání, třetiny i body, rozhodující nájezdy, tabulky a konečné pořadí týmů. U případného losu a ručního pořadí poznamenej rozhodnutí pořadatele. Soukromé údaje o objednávkách zůstanou v administraci. Použij český font v PDF, opakuj hlavičky vícestránkových tabulek, respektuj celé řádky a otestuj diakritiku. Přímý soubor nabídne uložení nebo systémové sdílení (iOS, WhatsApp, e-mail). Nová potvrzená oprava vygeneruje verzi zápisu odpovídající aktualizovaným výsledkům.

### 9. Produkční návrh a oprávnění

**Architektura pro nasazení od nuly · revize Neon.** Repozitář, testy a sestavení poběží na GitHubu. GitHub Pages obslouží český mobilní web a samostatný vstup `stadion.html`. Sdílená data turnaje uloží jeden nový projekt Neon Postgres. Spravovaný Neon Auth zajistí přihlášení e-mailem a heslem. Jeden Cloudflare Worker poskytne HTTPS API, ověří oprávnění, zpracuje změny a obslouží plánované zprávy přes Gmail API. Marek založí služby pod svými účty. Začni na bezplatných tarifech a před turnajem změř skutečnou spotřebu. [Neon a tarify](https://neon.com/pricing) · [Spravované přihlášení](https://neon.com/blog/handling-auth-in-a-staging-environment) · [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver) · [Plánování na Workeru](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

| Oblast databáze | Vazby, soukromí a chování |
|---|---|
| Turnaj, skupiny, týmy, členství | Stabilní identifikátory, zkratka, barva, názvy pro mobil, odkazy na oba znaky. Jedno členství týmu v turnaji. |
| Časové bloky a utkání | Časové pásmo v turnaji. Blok obsahuje plochu A a/nebo B. Skupinový zápas má oba týmy, utkání o místo zdrojové příčky A/B. Unikátní plocha v rámci bloku. |
| Potvrzené třetiny a nájezdy | Unikátní číslo třetiny 1–2 pro dané utkání, oba nezáporné počty branek nebo žádný řádek. U rozhodujících nájezdů ulož rozhodnutí a vítěze. |
| Los, ruční pořadí, historie změn | Audit zahrnuje aktéra, čas, předchozí a nový stav. Odvozené pořadí, nasazení a publikovaný snapshot mají stejnou revizi. |
| Obědová okna, objednávky, příjemci | Okno se váže na tým a blok, společná Vlašim na samostatný klíč objednávky. Verze pro ochranu souběžné editace. Počty zveřejňuj odděleně od adres, poznámek a týmových oprávnění. |
| Pošta a termíny | Privátní fronta, oddělený záznam pro verzi potvrzení a jediný souhrn. Stav OAuth odděleně od výsledků. |
| Veřejný snapshot a PDF | Revize zahrnuje aktuální program, utkání, třetiny, pořadí, nasazení, veřejné obědy a odkazy na soubory. Klient umí při chybě připojení zobrazit čas poslední aktualizace. |
| Uživatelské účty | Server přiřadí vlastníkovi administrátorskou roli. Týmové oprávnění má rozsah jedné objednávky. Veřejný návštěvník nepotřebuje účet. |

**Rozhraní musí vyjadřovat pravomoci.** Veřejné čtení rozpisu a stadionového snapshotu (např. verze/ETag), veřejný PDF soubor po dokončení turnaje; týmové načtení a uložení vlastní objednávky; admin zápis třetiny, los, potvrzení ručního řazení, změna rozpisu/obědů, správa týmů, nahrání znaků a tipy. Privátní serverové úlohy pro Gmail, souhrn a PDF. Pro společné změny používej transakci a očekávanou revizi. Při konfliktu zobraz nové údaje k posouzení, zabraň přepsání novější verze. Po úspěchu publikuj jednu konzistentní revizi všem odběratelům.

**Hranice přístupu.** Veřejný prohlížeč čte pouze publikovanou projekci přes Worker. Přihlašovací SDK získá pro Admin krátkodobý přístupový token. Worker ověří podpis proti klíčům produkčního poskytovatele, vydavatele, platnost a cílové použití podle konfigurace tokenu. Povolí jen identitu s odpovídajícím stabilním ID v privátní tabulce správců. Při neplatném tokenu vrátí 401, při platném účtu bez role 403. Týmový přístup má samostatné odvolatelné oprávnění k jedné objednávce. Povolené webové origins a návratové adresy eviduj výslovně pro každé prostředí. Otestuj přihlášení v Safari na iPhonu přímo z nasazené adresy.
 
**Databáze a soubory.** Worker přistupuje do Neonu serverovým ovladačem. Migrační vlastník a běhová role mají samostatná připojení. Aplikační roli přiděl jen potřebné granty. Schválené výchozí PNG patří do repozitáře. Nová webová a stadionová loga ukládej jako verzované bitmapy do Postgresu (`bytea`), veřejně je obsluhuj přes Worker podle ID a verze. Stanov limit 512 KiB na variantu, ověř formát i rozměry a vyměň aktivní dvojici jedinou transakcí. Nahrané soubory a privátní data zahrň do testu obnovy.

**Provoz.** Worker Secrets ponesou běhový DATABASE_URL, OAuth client secret a klíč pro ochranu obnovovacího tokenu. Obnovovací token ukládej šifrovaně na serveru. V nastavení frontendu jsou jen veřejné URL. Pro CI vyhraď oddělená oprávnění pro migrace a nasazení. Doručování pošty eviduj v transakční frontě. Po nejednoznačném výsledku odeslání zaznamenej stav ke kontrole, aby opakování neposlalo druhý souhrn. Cron běží v UTC, uzávěrku a první povolené odeslání určuj podle Europe/Prague. Před aktivací vyzkoušej plánovač bez otevřeného webu a domluv jediného aktivního odesílatele se správcem stávající automatizace.

**Zatížení v den turnaje.** Telefon i stadion čtou stejnou revizi veřejného snapshotu. V aktivním programu obnovuj viditelnou stránku přibližně každých 5 sekund, sdílej krátkou veřejnou cache a po návratu na stránku načti data hned. Čas a desetisekundovou rotaci počítej místně. Soukromé odpovědi nesmějí do sdílené cache. Mimo turnaj omez pravidelné dotazování. Při generálce změř požadavky na Worker, čerpání výpočetních hodin Neonu a zpoždění mezi potvrzením třetiny a zobrazením na stadionu.

### 10. Spuštění od nuly – pracovní etapy pro Marka a Claude

1. **GitHub.** Zjisti, zda je Marek v prohlížeči nebo má lokální Git a Claude Code. Proveď jej vytvořením repozitáře ve vlastním účtu (pracovní název např. `vlasim-pohar-2019`), volbou viditelnosti kompatibilní s dostupným Pages a nastavením výchozí větve. Připrav README, .gitignore, .env.example s názvy proměnných a lokální příkazy. První commit je reprodukovatelný ze zdrojů. S účtem a plánem ověř dostupnost požadovaných funkcí.
2. **Vývojové prostředí.** V konzoli Neon vytvoř turnajový projekt v dostupném evropském regionu. Odděl vývojová data a přihlášení od produkce. Připrav verzované SQL migrace, seed a obě sady výchozích PNG. Nasaď testovací Worker, nastav jeho připojení jako tajemství a ověř čtení revize přes HTTPS. Rozliš development a production. Po opakovaném spuštění seedu nesmí zmizet výsledky nebo objednávky. Před importem ověř, zda v dosavadní aplikaci nevznikly skutečné objednávky. Případný přesun soukromých dat proběhne mimo Git, s kontrolou počtu řádků včetně společné Vlašimi.
3. **Správce.** Zapni spravovaný Auth v Neon Console, povol přihlášení přes e-mail a heslo, nastav důvěryhodnou doménu a doručování obnovovacích odkazů. Marek ověří adresu marek.fikejs@gmail.com a sám si nastaví heslo. Po ověření přiřaď ID jeho produkční identity do tabulky správců privilegovaným jednorázovým krokem. Ověř přihlášení, odhlášení, obnovu, přesměrování na správnou doménu i odmítnutý anonymní zápis.
4. **Frontend a stadion.** Do buildu zahrň hlavní stránku i stadion.html, přenes schválené rozložení, odvoď obě z jedné datové služby. Lokálně ověř změnu třetiny na telefonu a monitoru a posun času s odpočtem. Publikuj workflow test → build → upload Pages artifact → deploy-pages. Oprávnění tokenu nastav podle úlohy. Ve výstupu nevystavuj soukromý backend. Ověř web v anonymním okně na skutečné cestě repozitáře. [GitHub Pages a Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
5. **Gmail.** Proveď Marka vytvořením projektu Google Cloud, zapnutím Gmail API, nastavením souhlasu a OAuth klienta typu Web application. Callback musí přesně souhlasit s HTTPS URL serverové funkce. Připrav backendový tok s ověřením state, scope gmail.send a offline přístupem. Marek souhlasí účtem marek.fikejs@gmail.com; ověř spárování s očekávaným účtem, chraň refresh token na serveru. Prověř stav OAuth consent aplikace a platnost obnovení až za termín turnaje. Vyzkoušej skutečné doručení potvrzení i kopie po schválení příjemců. [OAuth pro webové aplikace](https://developers.google.com/identity/protocols/oauth2/web-server) · [Odeslání přes Gmail API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
6. **Uzávěrka a generální zkouška.** Simuluj poslední minutu objednávek a první minutu po uzávěrce na testovacích datech. Ověř souhrn s vypnutým prohlížečem, vyzkoušej návrat z výpadku. Na kopii turnaje odehraj všech 25 utkání, proveď los, zásah pořadatele, kontrolu PDF a kontrolu z tribuny. V produkci příprava skončí s testovacími výsledky pouze v ukázkách.
7. **Vlastní doména až po nákupu.** Marek určí přesnou doménu. Nastav custom domain u existujícího Pages projektu, ověř vlastnictví, nastav odpovídající DNS podle registrátora a typu domény, vyčkej na certifikát a zapni HTTPS. Aktualizuj veřejnou základní URL, povolené origins, seznam návratových adres Auth, odkazy v poště a případný změněný OAuth callback. Při stabilním backendovém callbacku se v Google nic nemění. Ověř samostatný přímý vstup stadion.html, odkazy programu, obědů, obnovy hesla i stažení PDF. Při přechodu původní adresy ověř skutečné chování včetně cesty a parametrů. Vystavené klubové odkazy přepiš na ověřenou produkční adresu. [Vlastní doména GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

### 11. Přejímací scénáře

| Scénář | Co prokázat |
|---|---|
| Nový turnaj | Přesně 10 týmů, 20 různých skupinových utkání + 5 o umístění, všechna skóre prázdná. Každá dvojice ve skupině právě jednou. Oba domácí týmy odděleně. |
| První výsledek 0:0 | Před uložením v celé skupině „–“. Po potvrzení mají oba týmy 1 bod, góly 0:0, mobil 0/4, stadion Z=1 a R=1. Druhá skupina stále pomlčky. Soupisky zamčené. |
| Dvě třetiny 1:2 a 5:3 | Součet 6:5, body 2:2, dokončený zápas 1/4, dvě stadionové třetiny. Protější buňka 2:1 a 3:5. |
| Shoda a minitabulka | Spusť všechny příklady z Razeni-a-priklady.md včetně návratu k přímému zápasu. Oprava výsledku invaliduje los. Úplná shoda bez ukončení obou skupin nedosazuje vítěze. |
| Ruční pořadí | Náhled bez zápisu. Potvrzení změní příčky, párování a obě zařízení ve stejné revizi. Návrat přepočte. Rozehranou dvojici nelze zaměnit. |
| Časy | Testuj 08:00, 09:10, 09:25, 12:00, 12:20, 15:10, 15:45, 16:20, 16:35, 17:10 a 18:00. V 16:35 běží jen A. Při posunu budoucího rozpisu o +10 min se dopočtou navázané bloky, obědy a odpočty. Již proběhlé bloky jsou stejné. |
| Stadion | Přímý přístup bez účtu, dva režimy, 5:3, každých 10 s další tabulka. V 09:10:09 matice A, v 09:10:10 B, v 09:10:20 pořadí A, v 09:10:30 B. Po obnovení sítě a po refreshi navázat na aktuální čas. |
| Obědy | 10 týmů, 9 objednávek, 5 oken. Příklad 12 hráčů a 3 členové = 15 × 170 = 2 550 Kč. Otestuj duplicitní kliknutí, opravu, poznámku 100 a 101 znaků, neoprávněný účet, uzávěrku na serveru, admin výjimku, potvrzení a kopii i sestavení jediného souhrnu. |
| Protokol a soukromí | Po plánovaném konci bez výsledku finále se tlačítko neukáže. Po potvrzení vítěze je PDF dostupné z jiného telefonu, začíná propozicemi a končí výsledky. Veřejné API a PDF nikdy nevydají seznam e-mailů ani zdravotních poznámek. |
| Ostré předání | Test report, skutečné URL webu/stadionu/adminu, přesný plán uzávěrky, vlastnictví účtů, seznam tajemství pouze názvem, záloha a ověřený způsob návratu k předchozí verzi. Odděl test lokální od provozu na fyzické tabuli a od skutečně doručené pošty. |
