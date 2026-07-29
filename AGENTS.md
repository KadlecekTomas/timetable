# Instrukce pro AI agenty

Tento soubor platí pro celý repozitář. Podrobnější pravidla jsou v `docs/13-vibecode-rules.md`; při rozporu má přednost přesnější produktová nebo technická specifikace v `docs/`.

## Než začneš

1. Přečti `README.md` a dokumenty relevantní k úkolu.
2. Ověř aktuální větev, HEAD a čistotu pracovního stromu.
3. Urči přesný scope změny a dotčené invarianty.
4. Neměň nesouvisející soubory.

## Zdroj pravdy

- Produkt a hranice MVP: `docs/01-product-scope.md`
- Uživatelský tok: `docs/02-user-flow.md`
- Data: `docs/03-data-model.md`
- Excel import: `docs/04-excel-import.md`
- Solver: `docs/05-solver.md`
- Scoring: `docs/06-scoring.md`
- UI/UX a design: `docs/07-ui-ux.md`, `docs/10-design-system.md`
- Architektura a API: `docs/08-architecture.md`, `docs/09-api.md`
- Akceptace: `docs/12-acceptance-tests.md`

Nevymýšlej nové chování tam, kde specifikace mlčí. Zvol nejmenší bezpečný krok nebo explicitně popiš nevyřešené rozhodnutí.

## Povinné invarianty

- Tvrdé omezení solveru se nikdy nesmí porušit.
- Učitel, třída ani učebna nesmí mít kolizi.
- Zamčené hodiny se při regeneraci nesmí přesunout.
- Import je atomický: při chybě nevznikne částečný zápis.
- Ruční přesun používá stejnou validační logiku jako automatické generování.
- Skóre nesmí zakrýt nevalidní rozvrh; při tvrdém konfliktu není rozvrh validní.
- Dělená výuka má v MVP právě dvě skupiny.

## Implementační pravidla

- Upřednostni jednoduché, explicitní řešení před chytrou abstrakcí bez aktuální potřeby.
- Doménová pravidla neumisťuj pouze do UI.
- Validace musí být znovupoužitelná serverem, solverem a editorem rozvrhu.
- Veřejná API a persistence používají stabilní identifikátory, nikoli zobrazované názvy.
- Chyby musí být strukturované a vysvětlitelné uživateli.
- Nezapisuj tajné hodnoty, osobní údaje ani reálná školní data do fixture, logů či dokumentace.

## Testování

Každá oprava chyby musí přidat regresní test. Každé nové pravidlo solveru potřebuje minimálně:

- pozitivní fixture,
- negativní nebo konfliktní fixture,
- ověření vysvětlení či penalizace,
- ověření determinismu tam, kde je vyžadován.

E2E setup musí vytvářet vlastní data a nesmí spoléhat na aktuální obsah sdílené databáze.

## Práce s gitem

- Nevytvářej commit, merge, push ani deployment, pokud to uživatel výslovně nepožaduje.
- Nepoužívej force push bez explicitního souhlasu.
- Nepřepisuj cizí rozpracované změny.
- Před závěrečným verdiktem ověř skutečný diff a výsledky testů na aktuálním HEAD.

## Výstup agenta

Závěrečná zpráva musí uvést:

- verdikt,
- větev a HEAD,
- změněné soubory,
- provedené testy a výsledky,
- neprovedené kontroly,
- rizika nebo následné kroky.

Nikdy netvrď `READY`, pokud chybí požadovaná verifikační brána.
