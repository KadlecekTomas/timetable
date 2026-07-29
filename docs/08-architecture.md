# Technická architektura

## Cíl architektury

Architektura musí oddělit webovou správu, datovou validaci a výpočetně náročný solver. MVP má být jednoduché na lokální spuštění, ale nesmí svazovat solver s životním cyklem HTTP požadavku.

## Doporučený stack

### Web aplikace

- Next.js s App Routerem
- TypeScript v strict režimu
- React
- Tailwind CSS
- shadcn/ui
- Zod pro validační kontrakty
- Prisma
- PostgreSQL

### Solver služba

- Python
- FastAPI nebo interní worker rozhraní
- Google OR-Tools CP-SAT
- Pydantic pro vstupní a výstupní schémata

### Infrastruktura

- Docker Compose pro lokální vývoj
- PostgreSQL
- Redis nebo databázová fronta pro asynchronní joby; konkrétní volba bude potvrzena ADR
- objektové úložiště pro importované/exportované soubory až podle deploymentu

## Monorepo

Doporučená struktura:

```text
apps/
  web/
  solver/
packages/
  contracts/
  config/
  test-fixtures/
docs/
infra/
```

`packages/contracts` obsahuje verzované JSON kontrakty sdílené mezi webem a solverem. Python modely se generují nebo kontrolují proti stejnému JSON Schema; nesmí vzniknout dvě ručně udržované pravdy.

## Vrstvy webové aplikace

1. **UI** — komponenty a stránky bez přímého přístupu do databáze.
2. **Application services** — use-cases, transakce, autorizace.
3. **Domain** — invarianty rozvrhu, importu a verzování.
4. **Infrastructure** — Prisma, soubory, job queue, solver klient.

Doménová pravidla nesmí být implementována pouze ve formulářích.

## Tok generování

1. Web ověří oprávnění a připravenost školního roku.
2. V transakci vytvoří `GenerationRun` a canonical snapshot.
3. Job se vloží do fronty.
4. Worker převezme job a označí jej `RUNNING`.
5. Solver validuje verzi kontraktu a sestaví model.
6. Výsledek projde nezávislým post-solve validátorem.
7. Web uloží kandidátní `TimetableVersion` a incident report.
8. Uživatel kandidáta přijme explicitní akcí.

## Konzistence a souběh

- každá editovatelná entita má `updatedAt` nebo version counter,
- update používá optimistické zamykání,
- přijetí kandidátní verze je transakční,
- dva běhy mohou existovat současně, ale jen jeden výsledek lze označit jako aktuální v jedné transakci,
- běh se snapshotem starších dat je v UI označen jako zastaralý.

## Autorizace

Minimální role:

- `OWNER`
- `ADMIN`
- `EDITOR`
- `VIEWER`

Generování a editace vyžadují `EDITOR`; správa uživatelů `ADMIN`; destruktivní operace školy `OWNER`. Kontrola probíhá na serveru u každého use-casu.

## Audit

Auditovat se musí:

- import a jeho potvrzení,
- změny pravidel,
- ruční přesuny a zamykání,
- spuštění a zrušení generování,
- přijetí verze,
- export.

Auditní log nesmí obsahovat celé binární soubory ani tajné hodnoty.

## Observabilita

- strukturované logy s `requestId`, `schoolYearId`, `generationRunId`,
- metriky délky importu a solver běhu,
- počet feasible/infeasible výsledků,
- velikost modelu,
- počet selhání post-validátoru,
- error tracking bez osobních dat v payloadu.

## Konfigurace

Konfigurace se čte z prostředí a validuje při startu. Tajemství nejsou v repozitáři. `.env.example` obsahuje pouze názvy a bezpečné příklady.

## Migrace

- Prisma migrace jsou verzované,
- produkční migrace nesmí používat nekontrolovaný reset,
- destruktivní změna vyžaduje backfill plán,
- aplikace a solver musí během rollout okna rozumět kompatibilní verzi kontraktu.

## Testovací pyramidy

- domain unit tests,
- service integration tests s PostgreSQL,
- solver fixtures a property testy,
- API contract tests,
- Playwright kritických workflow,
- benchmark solveru oddělený od běžného CI.

## Bezpečnostní minimum

- ochrana proti CSRF podle použité autentizace,
- secure cookies,
- rate limiting importu a generování,
- kontrola MIME i obsahu souboru,
- žádné vyhodnocování Excel vzorců,
- ochrana proti IDOR přes school scope,
- sanitizované exportní názvy,
- pravidelné zálohy databáze.

## ADR

Významná rozhodnutí se ukládají do `docs/adr/`. ADR je povinné pro změnu databáze, job queue, autentizace, solver reprezentace nebo veřejného kontraktu.
