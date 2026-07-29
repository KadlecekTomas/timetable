# Přispívání do projektu

Tento dokument definuje minimální pracovní standard pro změny v repozitáři. Dokumentace v `docs/` je zdroj pravdy pro produkt, solver, API a UX.

## Zásady

- Neměň produktový scope, tvrdá omezení solveru ani význam skóre bez současné aktualizace dokumentace a testů.
- Každá změna musí být malá, dohledatelná a ověřitelná.
- Neobcházej validační, autorizační ani datové invarianty kvůli rychlejšímu dokončení.
- Do repozitáře nepatří hesla, tokeny, reálná školní data ani produkční exporty.

## Větve

Používej krátké tematické větve vytvořené z aktuálního `main`:

- `feat/<popis>` pro funkce,
- `fix/<popis>` pro opravy,
- `docs/<popis>` pro dokumentaci,
- `chore/<popis>` pro infrastrukturu a údržbu,
- `test/<popis>` pro testovací změny.

Do `main` se běžně neposílá rozpracovaný nebo neověřený kód.

## Commity

Preferovaný formát:

```text
<typ>(<oblast>): <stručný imperativní popis>
```

Příklady:

```text
feat(import): validate teacher availability rows
fix(solver): preserve locked lessons during regeneration
docs(api): define generation status response
```

Jeden commit má představovat jednu logickou změnu. Nemíchej refaktor, novou funkci a nesouvisející formátování.

## Pull request

PR musí obsahovat:

1. účel změny,
2. přesný scope,
3. odkazy na relevantní dokumentaci,
4. přehled změněných invariantů,
5. provedené testy a jejich výsledky,
6. rizika a známá omezení,
7. screenshoty u vizuálních změn.

PR nesmí tvrdit, že je hotový, pokud některá požadovaná verifikace neproběhla.

## Povinná verifikace

Podle rozsahu změny spusť:

- lint a typecheck,
- unit testy,
- integrační testy,
- databázové migrace na čisté databázi,
- solver fixture testy,
- Playwright scénáře pro dotčené uživatelské toky,
- build produkční konfigurace.

Přesné příkazy budou doplněny po vytvoření monorepo skeletonu.

## Databáze

- Každá změna schématu musí mít migraci.
- Migrace musí fungovat z čisté databáze i nad předchozí verzí.
- Testy nesmí záviset na pořadí nebo zbytcích dat ze sdílené databáze.
- Mazání nebo transformace dat vyžaduje explicitní popis dopadu.

## Solver

- Tvrdé omezení nesmí být převedeno na penalizaci bez schválené změny specifikace.
- Nová měkká penalizace musí mít stabilní identifikátor, váhu a testovací fixture.
- Výsledek solveru musí projít nezávislou validační vrstvou.
- Změna vah vyžaduje verzování scoring konfigurace a regresní porovnání fixture dat.

## UI a přístupnost

- Používej komponenty a tokeny z design systému.
- Nevytvářej nový vizuální vzor, pokud existující komponenta řeší stejný problém.
- Stav nesmí být sdělen pouze barvou.
- Formuláře musí mít popisky, chybové zprávy a ovládání z klávesnice.

## Hotovo znamená

Změna je dokončená pouze tehdy, když:

- odpovídá dokumentovanému chování,
- nemá známý tvrdý konflikt,
- testy jsou zelené,
- dokumentace je aktuální,
- pracovní strom neobsahuje nesouvisející změny,
- výsledek je reprodukovatelný jiným vývojářem nebo agentem.
