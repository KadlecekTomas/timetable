# Roadmapa

## Fáze 0 — Dokumentace a rozhodnutí

Výstup:

- produktový scope,
- datový model,
- Excel kontrakt,
- solver a scoring,
- UI a design systém,
- architektura a API,
- akceptační testy,
- pravidla pro AI vývoj.

Brána: žádná implementace nesmí začít s nevyřešeným kritickým rozporem mezi dokumenty.

## Fáze 1 — Repository foundation

- monorepo struktura,
- Next.js + TypeScript strict,
- Tailwind + shadcn/ui,
- Python solver service,
- PostgreSQL + Prisma,
- Docker Compose,
- lint, format, typecheck a test scripts,
- CI,
- `.env.example`,
- základní health checks.

Brána: nový vývojář spustí projekt jedním dokumentovaným postupem; CI je zelené.

## Fáze 2 — Design foundation

- tokeny,
- AppShell a navigace,
- PageHeader,
- formulářové komponenty,
- DataTable,
- statusy, dialogy a empty states,
- Storybook nebo ekvivalentní izolovaný katalog podle ADR.

Brána: žádná funkční stránka nevytváří vlastní paralelní komponentový systém.

## Fáze 3 — Školní rok a master data

- SchoolYear,
- učitelé,
- třídy,
- předměty,
- učebny,
- výukové vazby,
- dostupnost a preference,
- readiness report.

Brána: data lze plně zadat ručně a všechny invarianty jsou serverově validované.

## Fáze 4 — Excel import

- generátor šablony,
- parser,
- validační pipeline,
- náhled změn,
- atomické potvrzení,
- export chyb,
- fixture testy.

Brána: referenční školní dataset lze opakovaně importovat bez duplicit a bez ručních zásahů do databáze.

## Fáze 5 — Solver MVP

- canonical snapshot,
- job lifecycle,
- CP-SAT model,
- hard constraints,
- první feasible řešení,
- post-solve validátor,
- diagnostika základních infeasible stavů.

Brána: všechny solver fixtures projdou a žádný vrácený rozvrh neporuší hard constraint.

## Fáze 6 — Optimalizace a scoring

- mezery tříd,
- mezery učitelů,
- rozložení předmětů,
- preference,
- začátky a konce,
- scoring 0–100,
- incident report,
- benchmark suite.

Brána: kontrolní datasety prokazují očekávaný směr optimalizace a skóre je deterministické.

## Fáze 7 — Editor rozvrhu

- pohled tříd a učitelů,
- drag and drop,
- dialogový přesun,
- serverová validace,
- zamykání,
- undo,
- verzování a porovnání.

Brána: ruční editace nemůže vytvořit hard konflikt a zamčené hodiny přežijí regeneraci.

## Fáze 8 — Export a pilot

- Excel export,
- tiskový výstup podle potvrzeného scope,
- pilotní dataset školy,
- měření času a kvality,
- zpětná vazba zástupkyně,
- opravy kritických UX problémů.

Brána: uživatel bez asistence dokončí import, generování, úpravu a export.

## Fáze 9 — Hardening

- autorizace a audit,
- rate limiting,
- zálohy a restore test,
- observabilita,
- performance benchmark,
- security review,
- accessibility review,
- disaster and cancellation scenarios solveru.

Brána: produkční checklist je kompletní a neexistuje otevřený blocker severity critical/high.

## Backlog po MVP

- přímé integrační formáty školních systémů,
- více skupin,
- více budov a přesunové časy,
- suplování,
- preference pedagogických kabinetů,
- automatické návrhy změn,
- více variant rozvrhu,
- publikace pro učitele a rodiče,
- pokročilá týmová spolupráce.

## Pravidla prioritizace

1. Hard validita.
2. Správnost dat a importu.
3. Kompaktnost rozvrhu.
4. Vysvětlitelnost výsledku.
5. Rychlost pracovního workflow.
6. Vizuální polish.
7. Funkce mimo MVP.

Nová funkce nesmí přeskočit nehotovou bránu předchozí fáze bez explicitního rozhodnutí a zaznamenaného rizika.
