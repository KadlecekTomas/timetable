# Uživatelský tok a UX

## Hlavní scénář

1. Uživatel vytvoří školní rok a nastaví počet vyučovacích hodin v jednotlivých dnech.
2. Stáhne Excel šablonu.
3. Vyplní učitele, třídy, předměty, výukové vazby, dostupnost a preference.
4. Nahraje soubor.
5. Aplikace provede validaci bez částečného zápisu.
6. Uživatel opraví chyby nebo potvrdí import.
7. V přehledu zkontroluje úvazky, chybějící přiřazení a konfliktní požadavky.
8. Nastaví dělené hodiny, dvojhodiny, pevné bloky a případné učebny.
9. Spustí generování.
10. Sleduje stav řešení a získá návrh s hodnocením kvality.
11. Přepíná pohled Třídy / Učitelé.
12. Ručně přesouvá hodiny; nevalidní přesun aplikace odmítne a vysvětlí.
13. Vybrané hodiny zamkne.
14. Použije „Vygenerovat znovu“ pro nezamčenou část.
15. Exportuje rozvrh a report kvality.

## Navigace MVP

- Přehled
- Import dat
- Učitelé
- Třídy
- Výukové vazby
- Pravidla
- Generátor
- Rozvrh
- Export

## Přehled

Musí zobrazit:

- počet učitelů, tříd a výukových vazeb,
- součet požadovaných hodin,
- učitele s nesedícím úvazkem,
- chybějící nebo neúplná data,
- blokující chyby před generováním,
- poslední výsledek generování.

## Importní UX

Import je dvoufázový:

1. analyzovat soubor,
2. potvrdit zápis.

Chyba musí obsahovat list, řádek, sloupec, původní hodnotu a doporučenou opravu. Varování lze potvrdit; chyba blokuje import.

## Rozvrhová mřížka

- Sloupce představují dny a hodiny.
- Řádky v pohledu tříd představují třídy; v detailu lze zobrazit celý týden jedné třídy.
- Buňka zobrazuje předmět, učitele, skupinu, učebnu a stav zámku.
- Hover nebo detail ukáže původ pravidla a případnou penalizaci.
- Přesun má před uložením okamžitou validaci.

## Generování

Před spuštěním se zobrazí souhrn:

- počet povinných pravidel,
- počet preferencí,
- počet zamčených hodin,
- odhad obtížnosti dat,
- blokující problémy.

Po dokončení se zobrazí:

- stav `FEASIBLE`, `OPTIMAL`, `INFEASIBLE` nebo `TIME_LIMIT`,
- skóre a jeho rozpad,
- počet mezer učitelů a tříd,
- nesplněné preference,
- doporučené další kroky.

## Pravidla použitelnosti

- Destruktivní operace vyžadují potvrzení.
- Automatické změny musí být vratné.
- Uživatel nikdy nesmí přijít o ruční úpravy bez upozornění.
- Aplikace nesmí používat barvu jako jediný nositel významu.
- Nevalidní stav musí být vysvětlen lidským jazykem.
