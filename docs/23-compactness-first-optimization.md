# Optimalizace rozvrhu: nejprve kompaktnost

## Cíl

Solver skládá pravidelný rozvrh tak, aby vznikalo co nejméně vnitřních volných hodin pro třídy i učitele.

Jednorázové změny aktuálního týdne — suplování, výlety, Revolution Train, kulturní akce nebo jiné mimořádnosti — nejsou vstupem pro optimalizaci základního rozvrhu.

## Pořadí priorit

1. třídy začínají každý pracovní den v 8:00;
2. pravidelné třídy mají od první do poslední hodiny souvislý blok bez vnitřních oken;
3. minimalizují se mezery v rozvrzích učitelů;
4. omezují se pozdní konce vyučování;
5. respektují se nedoporučené a preferované sloty;
6. více hodin stejného předmětu se rozumně rozkládá do týdne.

Tvrdá pravidla mají vždy přednost:

- žádné kolize učitele, třídy nebo učebny;
- respektování nedostupnosti;
- synchronizace dělených skupin;
- zachování pevných a uzamčených hodin;
- každodenní začátek pravidelných tříd v 8:00;
- žádná vnitřní volná hodina v pravidelném denním rozvrhu třídy;
- Vašáková pouze INF, 12 hodin, pouze úterý a středa;
- 8.B se v INF nedělí.

## Kompaktnostní bezpečnostní profil

Backend nepřijme slabé historické váhy, které by dovolily vyměnit několik oken za malé bonusy v jiných kategoriích. Minimální efektivní váhy jsou:

| Kritérium | Minimální váha |
| --- | ---: |
| mezera třídy | 2 000 |
| mezera učitele | 1 000 |
| pozdní hodina | 10 |
| koncentrace stejné vazby | 50 |
| nedoporučený slot | 25 |
| bonus preferovaného slotu | 3 |

Vyšší hodnota zaslaná klientem se zachová; nižší hodnota se automaticky zvýší na bezpečné minimum.

## Vyhledávací profil

Krátké testovací výpočty používají jedno vlákno a pevný seed, aby byly deterministické.

Velké školní výpočty s limitem alespoň 120 sekund používají portfolio osmi paralelních pracovníků CP-SAT. To je nutné zejména po zavedení tvrdého pravidla souvislých denních bloků tříd.

Stav `UNKNOWN` po vypršení času se nesmí vydávat za matematickou neproveditelnost. Aplikace jej hlásí jako `SEARCH_LIMIT_EXCEEDED` a výslovně uvádí, že řešení pouze nebylo nalezeno v časovém limitu.

## Naměřený výsledek

Referenční stav před změnou:

- 85 vnitřních mezer v rozvrzích tříd;
- 276 vnitřních mezer v rozvrzích učitelů;
- kvalita 26/100.

Ověřený export po zavedení tvrdé kompaktnosti tříd a paralelního hledání:

- **0 vnitřních mezer v rozvrzích tříd**;
- **16 vnitřních mezer v rozvrzích učitelů**;
- kvalita **57/100**;
- 0 tříd bez začátku v 8:00;
- 0 nesouvislých vyučovacích dnů tříd;
- 17 třídních dnů končí 7. nebo 8. hodinou;
- 23 učitelských dnů končí 7. nebo 8. hodinou;
- Vašáková má 12 hodin INF pouze v úterý a ve středu;
- 8.B má jednu nedělenou hodinu INF s KAD;
- export obsahuje 55 listů a žádnou chybu vzorců.

## Verifikace

Finální CI run `30717146803` pro HEAD `0ad5c5c80c1918f57ff3e4276d57021d60563364` prošel celý:

- Prettier, ESLint a TypeScript;
- webové a solverové unit testy;
- produkční Next.js build;
- Docker Compose build a health checks;
- database-free browser workflow;
- realistický 40učitelský školní scénář;
- plný model 13 tříd a 41 učitelů s Vašákovou;
- export výsledného workbooku;
- kritický local-first scénář třikrát bez retry.

CI artefakt:

- ID `8823776361`;
- digest `sha256:8011292bc8ac79cd212cf0883a7008c22791209edd5e1a78a2dc8e25504c4ed9`.

## Zbývající práce

Třídy jsou již zcela bez oken. Další optimalizační fáze má řešit zejména:

- zbývajících 16 učitelských oken;
- omezení dnů končících 7. nebo 8. hodinou;
- pedagogické rozložení náročných předmětů během dne a týdne;
- přesné hodinové dotace školních předmětů `Svs`, `PkČj` a `PřPk`, které zatím nebyly dodány.
