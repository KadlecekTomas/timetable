# Timetable

Jednoduchá webová aplikace pro vytvoření kvalitního návrhu školního rozvrhu pro 2. stupeň základní školy.

## Cíl MVP

Zástupkyně školy nahraje připravenou Excel šablonu, doplní omezení a spustí generování. Aplikace vytvoří návrh rozvrhu bez tvrdých konfliktů a s důrazem na minimalizaci dlouhých mezer mezi hodinami učitelů i tříd.

## Základní principy

- Povinná pravidla se nikdy nesmí porušit.
- Preference se optimalizují podle verzovaných vah.
- Učitel, třída ani učebna nesmí být ve stejný čas na dvou místech.
- Dělená výuka má v MVP právě dvě skupiny: Skupina 1 a Skupina 2.
- Import je atomický, validovaný a ukazuje chybu na konkrétním listu, řádku a sloupci.
- Výsledek solveru prochází nezávislou kontrolou tvrdých omezení.
- Uživatel může rozvrh ručně upravit, zamknout a přegenerovat jeho nezamčenou část.
- Každý návrh obsahuje vysvětlitelné hodnocení kvality.

## Plánovaný stack

- Next.js, React a TypeScript
- Tailwind CSS a shadcn/ui
- PostgreSQL a Prisma
- Python a Google OR-Tools CP-SAT
- Docker Compose
- Playwright

## Dokumentace

Dokumentace v `docs/` je hlavním zdrojem pravdy pro produkt i implementaci:

1. [Produktový scope](docs/01-product-scope.md)
2. [Uživatelský tok](docs/02-user-flow.md)
3. [Datový model](docs/03-data-model.md)
4. [Excel importní kontrakt](docs/04-excel-import.md)
5. [Solver](docs/05-solver.md)
6. [Scoring a kvalita](docs/06-scoring.md)
7. [UI a UX](docs/07-ui-ux.md)
8. [Technická architektura](docs/08-architecture.md)
9. [API kontrakt](docs/09-api.md)
10. [Design systém](docs/10-design-system.md)
11. [Roadmapa](docs/11-roadmap.md)
12. [Akceptační testy](docs/12-acceptance-tests.md)
13. [Pravidla pro AI vývoj](docs/13-vibecode-rules.md)
14. [Budoucí funkce](docs/14-future-features.md)

## Aktuální stav

Projekt je ve fázi dokumentačního základu. Další krok je vytvoření monorepo skeletonu podle roadmapy. Implementace nesmí měnit produktový scope nebo tvrdá pravidla bez aktualizace příslušné dokumentace a akceptačních testů.
