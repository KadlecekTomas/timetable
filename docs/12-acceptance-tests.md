# Akceptační testy

## Účel

Tento dokument definuje produktové scénáře, které musí být prokazatelně splněny před označením MVP za hotové. Jednotkové testy nenahrazují tyto end-to-end scénáře.

## A. Založení školního roku

### A1 — Validní školní rok

Uživatel vytvoří školní rok `2026/2027`, nastaví počet hodin pro každý pracovní den a uloží jej.

Očekávání:

- školní rok je vytvořen,
- zobrazí se v navigaci,
- readiness report jasně ukáže, že chybí vstupní data.

### A2 — Neplatný rozsah

Uživatel zadá nulu nebo neplatnou hodnotu počtu hodin.

Očekávání:

- server zápis odmítne,
- chyba je u konkrétního pole,
- nevznikne částečný záznam.

## B. Excel import

### B1 — Validní šablona

Uživatel nahraje referenční `.xlsx`.

Očekávání:

- analýza dokončí bez chyb,
- souhrn počtů odpovídá souboru,
- data se zapíší až po potvrzení,
- druhý import stejného souboru nevytvoří duplicity.

### B2 — Neznámý učitel ve vazbě

Ve `Výukové_vazby` je neexistující `teacher_code`.

Očekávání:

- import je blokován,
- hláška obsahuje list, řádek a sloupec,
- databáze se nezmění.

### B3 — Nesedící úvazek

Součet výuky neodpovídá cílovému úvazku.

Očekávání:

- jde o varování, pokud není porušen explicitní min/max limit,
- uživatel může import potvrdit,
- readiness report problém zobrazí.

### B4 — Poškozená dvojhodina

`double_periods_count * 2 > weekly_periods`.

Očekávání: blokující chyba s konkrétní opravou.

## C. Hard constraints solveru

### C1 — Kolize učitele

Dvě vazby stejného učitele mají omezenou dostupnost tak, že se překrývají.

Očekávání: solver nikdy nevrátí rozvrh s dvojím nasazením učitele.

### C2 — Kolize třídy

Dvě celé výuky stejné třídy nesmí být ve stejném slotu.

### C3 — Dělená výuka

`GROUP_1` a `GROUP_2` stejné třídy mohou probíhat současně s různými učiteli a bez `WHOLE` výuky.

### C4 — Učebna

Jedna specializovaná učebna nesmí hostit dvě výuky současně.

### C5 — Nedostupnost

Žádná hodina nesmí zasáhnout `UNAVAILABLE` slot učitele, třídy nebo učebny.

### C6 — Dvojhodina

Blok délky 2 je ve stejný den, v navazujících periodách a ve stejné učebně.

### C7 — Pevná hodina

Pevně určená hodina je vždy na přesném místě, nebo je model označen jako neřešitelný.

### C8 — Přestávka učitele

Učitel nesmí v jednom dni učit současně 4., 5. a 6. vyučovací hodinu. Libovolná jedna volná hodina z této trojice podmínku splní.

### C9 — Pátek bez odpolední výuky

V pátek nesmí žádný výukový blok zasáhnout 7. ani pozdější vyučovací hodinu.

### C10 — Dějepis bez dvojhodiny

Dvě hodiny dějepisu stejné třídy mohou být ve stejný den pouze tehdy, když nejsou bezprostředně po sobě.

## D. Optimalizace

### D1 — Mezery učitelů

Na kontrolním datasetu existuje řešení s mezerou a řešení bez mezery.

Očekávání: při aktivní výchozí váze solver zvolí řešení bez mezery.

### D2 — Nelineární mezery

Řešení se třemi mezerami v jednom dni má vyšší penalizaci než řešení s jedinou mezerou.

### D3 — Mezery tříd

Solver preferuje řešení bez neexplicitních oken třídy.

### D4 — Preference

Při jinak rovnocenných řešeních vyhraje preferovaný slot. Nesplnění preference nikdy nevytvoří hard konflikt.

### D5 — Rozložení předmětu

Při zadaném pravidle se hodiny stejného předmětu rozloží do více dnů, pokud je to proveditelné.

## E. Neřešitelnost

### E1 — Konflikt pevných hodin

Stejný učitel má dvě pevné hodiny ve stejném slotu.

Očekávání:

- stav `INFEASIBLE`,
- diagnostika jmenuje obě vazby a slot,
- nevznikne kandidátní verze.

### E2 — Nedostatek dostupných slotů

Počet požadovaných hodin převyšuje dostupné sloty učitele.

Očekávání: diagnostika uvede požadovaný a dostupný počet.

## F. Ruční editace

### F1 — Validní přesun

Uživatel přesune hodinu do volného kompatibilního slotu.

Očekávání:

- server přesun ověří,
- verze se inkrementuje,
- změna je auditována,
- skóre se přepočítá.

### F2 — Nevalidní přesun

Cíl koliduje s jinou výukou učitele.

Očekávání:

- přesun je odmítnut,
- karta se vrátí,
- UI jmenuje kolidující hodinu.

### F3 — Dvojhodina

Přesun dvojhodiny přesune celý blok; nelze ji nechtěně rozdělit.

### F4 — Optimistický konflikt

Dva uživatelé upraví stejnou verzi.

Očekávání: druhý zápis dostane `409` a možnost obnovit aktuální data; žádná změna se tiše nepřepíše.

## G. Zamykání a regenerace

### G1 — Zamčená hodina

Uživatel zamkne hodinu a spustí regeneraci.

Očekávání: kandidátní verze zachová den, čas, délku a explicitně zamčenou učebnu.

### G2 — Minimal changes

Režim `MINIMAL_CHANGES` preferuje méně přesunů než `BEST_QUALITY` na kontrolním datasetu.

### G3 — Zastaralý snapshot

Po spuštění solveru uživatel změní vstupní data.

Očekávání: výsledek je označen jako založený na starší verzi a nelze jej přijmout bez explicitního potvrzení nebo nového běhu podle produktového rozhodnutí.

## H. Scoring

### H1 — Determinismus

Stejný rozvrh a scoring profil vždy vrátí stejné skóre a incidenty.

### H2 — Součet

Součet kategorií je přesně celkové skóre.

### H3 — Hard konflikt

Rozvrh s hard konfliktem nedostane validní skóre.

### H4 — Vysvětlitelnost

Každý odečet má kód, entitu, slot a lidské vysvětlení.

## I. Verze a export

### I1 — Přijetí kandidáta

Přijetí vytvoří jedinou aktuální verzi v transakci.

### I2 — Porovnání

Porovnání přesně zobrazí přidané, odstraněné, přesunuté a pouze učebnou změněné hodiny.

### I3 — Excel export

Export obsahuje všechny třídy, učitele, skupiny, dny, periody a učebny a odpovídá zvolené verzi.

## J. Přístupnost a UX

### J1 — Klávesnice

Uživatel zvládne navigaci, otevření detailu, přesun přes dialog, zamknutí a potvrzení bez myši.

### J2 — Stav bez barvy

Zamčená hodina, konflikt a varování jsou rozpoznatelné i bez rozlišení barev.

### J3 — Neuložené změny

Pokus opustit neuložený formulář zobrazí potvrzení.

## K. Provozní scénáře

### K1 — Zrušení solveru

Zrušený běh přejde do koncového stavu a nevytvoří přijatou verzi.

### K2 — Pád workeru

Job nezůstane neomezeně ve stavu `RUNNING`; watchdog jej označí k retry nebo jako failed podle politiky.

### K3 — Post-solve validátor

Pokud nezávislý validátor najde konflikt, výsledek se nepublikuje a incident se zaloguje jako kritická chyba.

## Definition of MVP done

MVP je hotové pouze tehdy, když:

- všechny scénáře označené pro MVP automatizací procházejí,
- pilotní referenční dataset vytvoří hard-validní rozvrh,
- neexistuje otevřený blocker critical/high,
- workflow import → generování → úprava → regenerace → export projde v Playwrightu,
- dokumentace odpovídá skutečné implementaci.
