# Pravidla pro AI vývoj

## Účel

Tento dokument je závazný pracovní kontrakt pro AI agenty i lidské vývojáře. Cílem je zabránit nekontrolovanému rozšiřování scope, duplicitním implementacím, skrytým regresím a tvrzením, která nejsou podložena testem.

## Zdroj pravdy

Pořadí autority:

1. akceptační kritéria a schválené ADR,
2. dokumentace v `docs/`,
3. databázové a API kontrakty,
4. existující testy,
5. implementace.

Pokud si dokumenty odporují, agent nesmí rozpor tiše vyřešit domněnkou. Musí jej pojmenovat a navrhnout konkrétní rozhodnutí.

## Scope discipline

Agent nesmí bez explicitního zadání:

- přidávat funkce z backlogu po MVP,
- měnit zvolený stack,
- přidávat další UI knihovnu,
- rozšiřovat dělení nad dvě skupiny,
- zavádět přímou integraci se Školou Online,
- přepisovat funkční části jen kvůli osobní preferenci,
- měnit hard constraint na soft constraint,
- měnit scoring váhy bez testu a dokumentace.

## Povinný preflight před změnou

Agent musí ověřit:

- aktuální branch a HEAD,
- čistotu pracovního stromu,
- relevantní dokumenty,
- existující implementaci a testy,
- zda již neexistuje komponenta, služba nebo utilita se stejným účelem,
- přesný scope změny.

Pokud pracuje přímo proti repozitáři, nesmí předpokládat, že lokální stav odpovídá remote.

## Implementační pořadí

1. upřesnit invariant a akceptační scénář,
2. přidat nebo upravit test,
3. provést nejmenší koherentní implementaci,
4. spustit relevantní testy,
5. spustit širší regresní sadu podle dopadu,
6. zkontrolovat diff,
7. aktualizovat dokumentaci, pokud se změnil kontrakt.

## Datová pravidla

- názvy nejsou primární identifikátory,
- school scope je povinný u každého dotazu,
- import je atomický,
- generování pracuje nad immutable snapshotem,
- přijetí verze je transakční,
- ruční editace používá stejný hard-validátor jako solver výstup,
- žádný výsledek solveru se nepublikuje bez post-solve validace.

## Solver pravidla

Agent musí:

- udržovat hard a soft omezení odděleně,
- ke každému novému constraintu přidat pozitivní i negativní fixture,
- zachovat reprodukovatelnost testů,
- ukládat verzi kontraktu a solveru,
- vysvětlit každou novou penalizaci,
- benchmarkovat změnu, která ovlivňuje objective model.

Agent nesmí tvrdit, že řešení je optimální, pokud solver vrátil pouze `FEASIBLE` nebo `TIME_LIMIT`.

## UI pravidla

- používat `docs/10-design-system.md`,
- nevytvářet ad hoc barvy, radius, spacing ani button varianty,
- nepoužívat barvu jako jediný stavový signál,
- kritická chyba nesmí být pouze v toastu,
- drag and drop musí mít klávesnicovou/dialogovou alternativu,
- business logika nepatří do prezentační komponenty,
- každá obrazovka má loading, empty, error a success stav.

## Kvalita kódu

- TypeScript strict bez obcházení přes `any`, pokud není lokálně zdůvodněno,
- validace externích vstupů na hranici systému,
- malé veřejné interface,
- žádné mrtvé feature flagy,
- žádné zakomentované bloky místo historie v Gitu,
- žádné secrets, reálné osobní údaje ani produkční exporty ve fixtures,
- chyby se nepolykají bez logu a uživatelského výsledku.

## Migrace

Agent nesmí:

- resetovat produkční databázi,
- upravit již aplikovanou migraci bez explicitního plánu,
- přidat non-null sloupec bez backfill strategie,
- tvrdit, že migrace je bezpečná bez ověření dopadu.

## Testovací minimum podle změny

### UI komponenta

- unit/interaction test,
- accessibility kontrola kritického ovládání,
- screenshot test u hlavní obrazovky.

### API nebo service

- validní scénář,
- validační chyba,
- autorizace,
- school scope/IDOR test,
- concurrency test, pokud se zapisuje do verzované entity.

### Import

- validní fixture,
- chybná reference,
- atomický rollback,
- idempotence,
- kompatibilita verze šablony.

### Solver

- hard-validita,
- infeasible fixture,
- očekávaný směr optimalizace,
- deterministický testovací režim,
- post-solve validátor.

## Git pravidla

- jedna větev pro jeden ucelený záměr,
- malé logické commity,
- commit message popisuje skutečný dopad,
- žádný force push na sdílenou větev bez explicitního souhlasu,
- žádný merge ani deployment bez explicitního zadání,
- před dokončením ověřit remote branch a CI.

## Reporting

Finální report musí oddělit:

- co bylo skutečně změněno,
- jaké testy skutečně proběhly,
- co nešlo ověřit,
- známá rizika,
- přesný branch/commit nebo PR.

Zakázané formulace bez důkazu:

- „všechno funguje“,
- „produkčně ready“,
- „bez regresí“,
- „optimální rozvrh“.

## Stop conditions

Agent se zastaví a neimprovizuje, pokud:

- zadání vyžaduje destruktivní operaci mimo scope,
- chybí tajný údaj nebo přístup, který nelze bezpečně odvodit,
- dokumentace obsahuje kritický rozpor,
- test odhalí problém mimo povolený scope a jeho obcházení by snížilo bezpečnost,
- nelze rozlišit, zda uživatel žádá pouze analýzu, nebo zápis/merge/deployment.

## Definition of done pro změnu

- scope je splněn a nic navíc nebylo přidáno,
- relevantní testy jsou zelené,
- diff je zkontrolovaný,
- hard invarianty jsou zachovány,
- dokumentace odpovídá implementaci,
- nejsou přidána tajemství ani osobní data,
- report neobsahuje neověřená tvrzení.
