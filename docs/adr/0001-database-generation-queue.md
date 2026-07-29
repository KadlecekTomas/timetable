# ADR 0001 — Databázová fronta generování

- Stav: Accepted
- Datum: 2026-07-30

## Kontext

Generování rozvrhu nesmí být svázané s životním cyklem HTTP požadavku. Potřebujeme trvalý stav jobu, možnost zrušení, obnovu po restartu a jednoduché lokální spuštění bez další infrastruktury.

## Rozhodnutí

MVP používá tabulku `GenerationRun` jako databázovou frontu a samostatný Node worker.

1. Web vytvoří immutable canonical snapshot, jeho SHA-256 hash a záznam `QUEUED`.
2. Worker přes interní endpoint atomicky převezme nejstarší `QUEUED` job a změní jej na `RUNNING`.
3. Worker odešle snapshot solver službě.
4. Výsledek vrátí internímu web endpointu.
5. Web provede nezávislou hard validaci a vlastní deterministický scoring.
6. Teprve poté v transakci uloží kandidátní `TimetableVersion` a označí run jako `FEASIBLE` nebo `OPTIMAL`.

Interní endpointy vyžadují `WORKER_TOKEN`. Claim používá podmíněný `updateMany`, takže dva workery nemohou úspěšně převzít stejný `QUEUED` job.

## Důsledky

### Pozitivní

- žádná vazba solveru na HTTP timeout uživatele,
- trvalý a auditovatelný lifecycle,
- jednoduchý Docker Compose stack,
- lze později nahradit Redis frontou bez změny veřejného API.

### Negativní

- polling přidává malé zpoždění,
- PostgreSQL není vhodná fronta pro vysokou propustnost,
- MVP worker zpracovává jeden job v jednom procesu.

## Náhrada v budoucnu

Přechod na Redis nebo spravovanou frontu vyžaduje nové ADR a zachování stavového kontraktu `GenerationRun`.
