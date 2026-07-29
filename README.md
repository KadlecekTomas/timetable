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

## Stack

- Next.js, React a TypeScript strict
- Tailwind CSS a shadcn/ui
- PostgreSQL a Prisma
- Python, FastAPI a Google OR-Tools CP-SAT
- Docker Compose
- GitHub Actions

## Rychlé spuštění

```bash
cp .env.example .env
docker compose up --build
```

Po startu je web dostupný na `http://localhost:3000` a dokumentace solver API na `http://localhost:8000/docs`.

Podrobný postup a verifikační příkazy jsou v [lokálním vývojovém setupu](docs/16-development-setup.md).

## Monorepo

```text
apps/
  web/       Next.js aplikace
  solver/    FastAPI a OR-Tools služba
packages/
  database/  Prisma schema a sdílený klient
docs/        Produktová a technická dokumentace
```

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
15. [Architecture Decision Records](docs/adr/README.md)
16. [Lokální vývoj](docs/16-development-setup.md)

## Pravidla repozitáře

- [Pokyny pro přispívání](CONTRIBUTING.md)
- [Instrukce pro AI agenty](AGENTS.md)
- [Bezpečnostní zásady](SECURITY.md)
- [Proces architektonických rozhodnutí](docs/adr/README.md)

## Aktuální stav

Fáze 1 — repository foundation je implementována na feature větvi. Skeleton obsahuje web, databázovou vrstvu, solver službu, Docker Compose, health checks a CI. Doménové funkce se budou přidávat až v dalších fázích podle roadmapy.
