# Integrovaná verifikace MVP

Tento dokument popisuje verifikační brány implementace Fází 3–7.

## Rozsah

- master data a readiness kontrola,
- verzovaný Excel import s náhledem a atomickým potvrzením,
- immutable canonical snapshot,
- asynchronní generation run a CP-SAT solver,
- nezávislý post-solve validátor,
- deterministický scoring a incident report,
- verzovaný editor rozvrhu, zamykání, validovaný přesun a undo.

## Povinné brány

- Prisma schema validace a nasazení migrací do prázdného PostgreSQL,
- format, lint a TypeScript typecheck,
- webové, worker a solver testy,
- produkční build webu a workeru,
- Docker Compose konfigurace a build všech image,
- žádný merge ani deployment v rámci feature práce.

Finální verdikt se vztahuje vždy ke konkrétnímu HEAD a výsledkům CI na jeho přesných bajtech.
