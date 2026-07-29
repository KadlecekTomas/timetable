# Solver

## Technologie

MVP používá Google OR-Tools CP-SAT v samostatné solver službě. Webová aplikace vytváří validovaný snapshot, odešle úlohu a uloží výsledek jako novou verzi rozvrhu.

## Jednotka rozhodování

Každá `TeachingAssignment` se rozpadne na plánovatelné bloky:

- `SINGLE`: bloky délky 1,
- `DOUBLE`: bloky délky 2,
- `MIXED`: přesný počet bloků délky 2 a zbývající bloky délky 1.

Každý blok má kandidátní kombinace `(den, počáteční hodina, učebna)`. Neplatné kombinace se odstraní ještě před konstrukcí modelu.

## Proměnné

Doporučená základní reprezentace:

`x[block, day, start, room] ∈ {0,1}`

Hodnota 1 znamená, že blok začíná v daném slotu a učebně. Pro diagnostiku lze odvodit pomocné proměnné obsazení učitele, třídy, skupiny a učebny v jednotlivých slotech.

## Tvrdá omezení

### Jedno umístění každého bloku

Každý blok musí být naplánován právě jednou.

### Kolize učitele

Učitel nesmí v jednom slotu vyučovat více bloků.

### Kolize třídy a skupiny

- `WHOLE` blok koliduje s každou výukou stejné třídy.
- `GROUP_1` a `GROUP_2` mohou probíhat současně.
- Každá skupina sama se sebou koliduje.
- Skupinová výuka nesmí současně kolidovat s výukou celé třídy.

### Kolize učebny

Jedna učebna nesmí být v jednom slotu použita vícekrát.

### Dostupnost

Blok nesmí zasáhnout slot označený `UNAVAILABLE` pro učitele, třídu nebo učebnu.

### Rozsah dne

Celý blok musí ležet uvnitř konfigurovaného počtu hodin daného dne.

### Pevné a zamčené hodiny

Pevné pravidlo nebo zamčená existující hodina nastavuje přesnou kombinaci dne, začátku a případně učebny. Při regeneraci se zamčené hodiny stávají tvrdými omezeními.

### Požadovaná učebna nebo typ

Blok s `requiredRoomId` smí být pouze v dané učebně. Blok s `requiredRoomTypeId` smí být pouze v kompatibilní učebně.

### Denní limity

`MAX_PER_DAY` omezuje počet period stejné výukové vazby v jednom dni.

### Dvojhodiny

Dvojhodina zabírá dva bezprostředně navazující sloty stejného dne, učitele, třídy/skupiny a učebny.

## Měkká omezení

- mezery učitelů,
- mezery tříd,
- výuka v preferovaných a nedoporučených slotech,
- příliš časná nebo pozdní výuka,
- nerovnoměrné rozložení předmětu v týdnu,
- více výskytů stejného předmětu v jednom dni,
- osamocená první nebo poslední hodina učitele,
- změny oproti předchozí verzi při regeneraci,
- nevhodné umístění náročných předmětů,
- nedodržení minimálního odstupu mezi dny, pokud je pravidlo měkké.

Přesné váhy definuje `06-scoring.md` a verzovaný solver profil.

## Minimalizace mezer učitelů

Mezera je neobsazený slot mezi první a poslední výukou učitele v jednom dni. Slot před první nebo po poslední výuce není mezera.

Solver musí rozlišovat:

- jednu izolovanou mezeru,
- více po sobě jdoucích mezer,
- počet dnů s alespoň jednou mezerou,
- celkový počet mezer.

Doporučená penalizace je nelineární: druhá a další mezera v jednom dni je dražší než první. Tím se zabrání řešením se soustředěnými dlouhými okny.

Příklad relativní penalizace:

- první mezera v dni: 20,
- druhá: dalších 35,
- třetí a další: každá 60,
- den s mezerou: dalších 10.

Konkrétní hodnoty jsou konfigurovatelné a musí být testované na referenčních datech.

## Minimalizace mezer tříd

Stejná definice jako u učitele. U tříd je mezera obvykle závažnější, proto výchozí váha nesmí být nižší než u učitele. Volné okno dané školy lze modelovat jako explicitní povolený slot a pak se nepočítá jako mezera.

## Stabilita regenerace

Při přegenerování existujícího rozvrhu:

1. zamčené hodiny se nesmí změnit,
2. nezamčené hodiny mohou být přesunuty,
3. změna dne je penalizována více než změna hodiny v témže dni,
4. změna učebny je penalizována nejméně,
5. uživatel může zvolit režim `MINIMAL_CHANGES` nebo `BEST_QUALITY`.

## Vícefázová optimalizace

Doporučený lexikografický postup:

1. najít proveditelné řešení,
2. minimalizovat kritické mezery tříd a učitelů,
3. minimalizovat ostatní vysoké penalizace,
4. optimalizovat preference a stabilitu,
5. zlepšovat řešení do časového limitu.

Tvrdé omezení nikdy nesmí být převedeno na velmi vysokou penalizaci.

## Stavy výsledku

- `OPTIMAL`: solver prokázal optimum pro daný model,
- `FEASIBLE`: nalezeno validní řešení, optimum neprokázáno,
- `TIME_LIMIT`: vypršel limit; může obsahovat nejlepší validní řešení,
- `INFEASIBLE`: model nemá řešení,
- `FAILED`: technická chyba.

UI nesmí prezentovat `FEASIBLE` jako matematicky optimální řešení.

## Diagnostika neřešitelnosti

Při `INFEASIBLE` služba provede diagnostický průchod:

- ověří konflikty pevných hodin,
- přetížené učitele, třídy a učebny,
- nedostatečný počet dostupných slotů,
- nemožný počet dvojhodin,
- konfliktní skupinovou výuku,
- pravidla s prázdnou množinou kandidátů.

Výstupem není jen „nelze vygenerovat“, ale seznam pravděpodobných příčin s odkazy na konkrétní entity. Diagnostika nemusí být úplný důkaz minimálního konfliktního jádra v MVP, ale nesmí si příčiny vymýšlet.

## Reprodukovatelnost

Každý běh ukládá:

- hash snapshotu,
- verzi solveru,
- solver profil,
- časový limit,
- random seed,
- počet workerů,
- statistiky modelu a řešení.

Testovací a CI běhy používají jeden worker a pevný seed. Produkce může používat více workerů, ale musí výsledek označit jako potenciálně nedeterministický.

## Výkonové cíle MVP

Referenční škola:

- 20–40 učitelů,
- 8–16 tříd,
- do 800 plánovaných period týdně,
- do 30 učeben.

Cíl je získat první proveditelné řešení do 30 sekund a kvalitní návrh do konfigurovatelného limitu 2–5 minut na běžném serveru. Jde o produktový cíl, nikoli garantovaný SLA; musí být měřen benchmarkem.

## Bezpečné publikování výsledku

Solver nikdy nepřepisuje aktuální rozvrh přímo. Vytvoří kandidátní `TimetableVersion`. Uživatel ji může porovnat, přijmout nebo zahodit.

## Testovací strategie

- jednotkové testy každého hard constraintu,
- testy každého scoring komponentu,
- malé instance s ručně známým optimem,
- infeasible fixtures pro každý hlavní typ konfliktu,
- regresní školní dataset,
- property test: žádný vrácený výsledek nesmí porušit validátor,
- nezávislý post-solve validátor mimo CP-SAT model.

## Akceptační kritéria

- vrácený rozvrh projde nezávislou validací,
- zamčená hodina se při regeneraci nezmění,
- zvýšení váhy mezer prokazatelně preferuje kompaktnější řešení na kontrolním datasetu,
- `INFEASIBLE` poskytne alespoň jednu ověřitelnou příčinu, pokud ji diagnostika nalezne,
- stejný snapshot, profil, seed a počet workerů v testovacím režimu vytvoří stejný výsledek.
