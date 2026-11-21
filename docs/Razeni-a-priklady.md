# Jak se určuje pořadí ve skupině
**Vánoční turnaj 2. tříd ve Vlašimi · 28. prosince 2026**  
Stav ukázkového webu k 21. 11. 2026. Podklad pro trenéry a pořadatele k odsouhlasení.

## 1. Co vstupuje do tabulky
Skupiny A a B se vyhodnocují odděleně. Každá potvrzená třetina přináší za výhru 2 body, za remízu každému 1 bod a za prohru 0 bodů. Do skóre se započítají branky obou týmů včetně proměněných nájezdů za fauly připsaných k dané třetině.

Body a branky se aktualizují už po zápisu první třetiny. Počet odehraných zápasů se zvýší až po zápisu druhé. Při pěti týmech ve skupině tedy může mít tým 2 body a současně odehráno 0/4. Počet odehraných zápasů slouží pro orientaci. Řadí se podle celkových bodů, bez přepočtu na zápas.

## 2. Základní postup
Nejvýše je tým s největším počtem bodů ze všech skupinových utkání. Každou skupinu týmů se stejným počtem bodů posuďte samostatně. Uplatňujte kritéria v uvedeném pořadí.

| Priorita | Při shodě dvou týmů | Při shodě tří a více týmů |
|---|---|---|
| 1 | Součet branek obou třetin jejich vzájemného utkání | Body ze vzájemných utkání dotčených týmů |
| 2 | Rozdíl branek v celé skupině | Rozdíl branek v minitabulce |
| 3 | Více vstřelených branek v celé skupině | Více vstřelených branek v minitabulce |
| 4 | Méně obdržených branek v celé skupině | Méně obdržených branek v minitabulce |
| 5 | Los pořadatele | Rozdíl branek v celé skupině |
| 6 | | Více vstřelených branek v celé skupině |
| 7 | | Méně obdržených branek v celé skupině |
| 8 | | Los pořadatele |

**Jak číst tabulku:** K dalšímu řádku přejděte, jen pokud dosavadní kritérium nikoho neoddělilo. Jakmile oddělí část týmů, zachovejte pořadí oddělených částí a každou dosud shodnou část posuďte znovu od začátku podle její nové velikosti. Rozdíl branek je počet vstřelených minus počet obdržených branek.

### Dva týmy: rozhoduje součet branek
Modří porazili Bílé v první třetině 4:0 a druhou prohráli 0:1. Za utkání získali oba 2 body. Pokud mají stejně bodů i v celé skupině, jsou výše **Modří díky vzájemnému skóre 4:1**. Při vzájemném skóre například 3:3 přichází na řadu rozdíl branek v celé skupině.

### Tři nebo více týmů: sestavte minitabulku
Vyberte pouze utkání, ve kterých **oba soupeři** patří mezi posuzované týmy. Z jejich třetin znovu sečtěte body a branky. Pokud po některém kritériu zůstanou dva týmy spolu, rozhodujte od jejich **vzájemného utkání**. Zůstanou-li spolu alespoň tři, přepočítejte minitabulku jen z utkání této užší skupiny. Tím odpadnou i zápasy proti týmu, který se právě oddělil.

Stejné pravidlo o novém posouzení zbytku web uplatní i tehdy, když část týmů oddělí až některé z celoskupinových kritérií.

## 3. Kontrolní příklad: kdy se vrátit ke vzájemnému utkání
Červení, Modří a Bílí mají po čtyřech zápasech každý 8 bodů. Do minitabulky vstoupí tyto tři výsledky. Údaje čtěte v pořadí uvedených týmů.

| Utkání | První třetina | Druhá třetina | Součet branek | Body za třetiny celkem |
|---|---:|---:|---:|---:|
| Červení – Modří | 3:1 | 2:0 | 5:1 | 4:0 |
| Modří – Bílí | 2:1 | 3:1 | 5:2 | 4:0 |
| Bílí – Červení | 5:4 | 4:3 | 9:7 | 4:0 |

| Tým | Body v minitabulce | Skóre v minitabulce | Rozdíl |
|---|---:|---:|---:|
| Červení | 4 | 12:10 | +2 |
| Modří | 4 | 6:7 | −1 |
| Bílí | 4 | 11:12 | −1 |

1. Body v minitabulce jsou shodné. Rozdíl branek posune Červené na první místo v této trojici.
2. Modří a Bílí mají oba rozdíl −1. Zůstaly dva týmy, proto je znovu posoudíme podle jejich vzájemného utkání.
3. Modří ho vyhráli 5:2. Pořadí trojice je **Červení, Modří, Bílí**, přestože Bílí vstřelili v původní minitabulce více branek než Modří.

## 4. Průběžná tabulka, společná příčka a los
- **Během skupin** používá web stejný algoritmus se všemi dosud potvrzenými třetinami. I jedna třetina vzájemného zápasu může průběžně změnit pořadí. Při shodě dvou týmů se vzájemný zápas bez zapsané třetiny přeskočí. Rozhodne celkový rozdíl branek, poté počet vstřelených a obdržených branek. Při úplné shodě týmy průběžně sdílejí příčku. Skutečně zapsaná třetina 0:0 se počítá jako remíza za 1 bod pro každý tým.
- **Při nevyřešené shodě** mají týmy společnou příčku. Například pořadí pěti týmů může být 1., 2., 2., 4., 5. To, který z dvojice se na obrazovce vypíše dřív, mu nedává postupovou výhodu.
- **Los** nabídne web po zápisu obou třetin všech skupinových utkání v obou skupinách. V nabídce **Admin → Výsledky** pořadatel zadá výsledek vlastního losu. Pro trojici na společné druhé příčce zadá pořadí 1, 2 a 3 uvnitř trojice. Tím obsadí celkové příčky 2, 3 a 4. Každé číslo se použije jednou. Případná další shoda se vyřeší samostatně.
- **Oprava výsledku** skupinového utkání přepočítá tabulku a zruší dosavadní výsledky losů v dotčené skupině. Jakmile je uložena třetina kteréhokoli utkání o umístění, web skupinové výsledky uzamkne.

## 5. Co uvidí rodiče a jak vzniknou finálové dvojice
**Průběžné pořadí** zobrazuje vypočtené příčky. **Křížová listina** má v automatickém režimu řádky i sloupce v pořadí týmů z nastavení skupiny. Pod názvem každého týmu ukazuje stejné aktuální celkové skóre a body jako průběžná tabulka. Pozice řádku v křížové listině proto sama o sobě neurčuje postup.

V automatickém režimu se účastníci zápasů o umístění doplní po dokončení všech skupinových utkání v obou skupinách. Každá jednoznačně určená příčka se může obsadit ihned. Jen pozice dotčené nevyřešenou shodou čekají na los.

| Příčka v A i B | Dvojice | Zápas |
|---:|---|---|
| 1. | 1A × 1B | o 1. místo |
| 2. | 2A × 2B | o 3. místo |
| 3. | 3A × 3B | o 5. místo |
| 4. | 4A × 4B | o 7. místo |
| 5. | 5A × 5B | o 9. místo |

## 6. Výjimka: ruční pořadí pořadatele
V **Admin → Ruční pořadí** může pořadatel seřadit obě skupiny, zkontrolovat navržené dvojice a teprve potom změnu potvrdit. Po potvrzení ruční pořadí určuje příčky, řazení řádků a sloupců křížové listiny i nasazení do zápasů o umístění. Platí i před dohráním skupin. Body, skóre a počet odehraných utkání se nadále počítají ze zadaných výsledků.

Tlačítko **Vrátit pořadí podle pravidel** zobrazí návrh dvojic podle aktuálních výsledků. Po potvrzení se znovu použije automatické řazení včetně případného losu. Při obou změnách režimu web ochrání každý zápas o umístění, který už má zapsanou alespoň jednu třetinu: změnu dovolí pouze tehdy, když oba jeho účastníci zůstanou na svých stranách.


Před první potvrzenou třetinou ve skupině je veřejná příčka zobrazena pomlčkou. Stadionový sloupec Z počítá potvrzené třetiny.
