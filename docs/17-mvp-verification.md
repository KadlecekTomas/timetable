# Integrovaná verifikace MVP

Tento dokument popisuje verifikační brány implementace Fází 3–7. Verdikt se vždy vztahuje ke konkrétnímu commitu a neznamená matematickou záruku, že software nemůže obsahovat žádnou další chybu. Znamená, že uvedené chování bylo na daném commitu reprodukovatelně ověřeno automatizovanými testy.

## Ověřovaný rozsah

- školní rok, master data a kontrola připravenosti,
- verzovaný Excel import s náhledem a atomickým potvrzením,
- neměnný canonical snapshot,
- asynchronní běh generování a CP-SAT solver,
- nezávislý post-solve validátor,
- deterministické skórování a incident report,
- verzovaný editor rozvrhu, zamykání, validovaný přesun, undo a přijetí verze,
- hlavní české obrazovky včetně stránky Nastavení,
- databázové migrace a runtime Docker Compose stacku.

## Povinné technické brány

Před kladným verdiktem musí projít všechny následující kroky:

1. Prisma generate a validace schématu.
2. Nasazení migrací do prázdného PostgreSQL.
3. Opakované nasazení stejných migrací a kontrola stavu bez driftu.
4. Prettier kontrola.
5. ESLint.
6. TypeScript typecheck.
7. Webové a doménové jednotkové testy.
8. Solver lint a testy.
9. Produkční build webu, databázového balíčku a workeru.
10. Docker Compose konfigurace, build, start služeb a health check webu.
11. Celá Playwright sada se skutečnou databází, solverem a workerem.
12. Kritická release-gate třikrát za sebou s vypnutými retry.

## Integrovaná release-gate

Každý scénář vytváří vlastní školní rok a vlastní data. Testy nejsou závislé na pořadí ani na předchozím obsahu databáze.

### Založení školního roku

- neplatný počet hodin je odmítnut stavem 422,
- po odmítnutí nevznikne částečný záznam,
- následný validní požadavek projde,
- duplicita je odmítnuta stavem 409,
- health endpoint zůstane dostupný.

### Excel import

- import používá skutečný `.xlsx` vytvořený z aplikační šablony,
- odkaz na neznámého učitele vyvolá validační chybu,
- neplatný náhled nelze potvrdit,
- po chybě zůstávají master data prázdná,
- následný opravený import projde,
- opakovaná analýza stejných vstupů znovu použije náhled,
- opakované potvrzení stejné dávky je idempotentní,
- nový import stejných dat nevytvoří duplicitní entity,
- verze školního roku se zvyšuje pouze při potvrzené změně.

### Generování rozvrhu

- nepřipravený školní rok nelze zařadit do fronty,
- neplatný požadavek na běh je odmítnut,
- validní běh projde přes worker a solver do koncového stavu,
- vznikne kandidátní verze a skóre,
- nezávislá kontrola ověří kolize učitelů, tříd a učeben,
- součet kategorií skóre odpovídá celkovému skóre,
- dokončený běh nelze zrušit,
- neexistující běh vrátí 404 bez pádu služby,
- web a solver zůstanou po scénáři zdravé.

### Editor rozvrhu

- kolizní přesun je odmítnut v náhledu i při zápisu,
- odmítnutý přesun nezmění revizi ani polohu hodiny,
- zamknutí a odemknutí zvyšuje revizi,
- zamčenou hodinu nelze přesunout,
- zápis se zastaralou revizí je odmítnut stavem 409,
- validní přesun se uloží a znovu projde kontrolou tvrdých omezení,
- opakování stejného zápisu se starou revizí je odmítnuto,
- undo obnoví původní umístění,
- přijetí verze se zastaralou revizí je odmítnuto,
- přijetí aktuální revize označí verzi jako aktuální.

### Souběh a rušení

- několik běhů je zařazeno současně,
- okamžité požadavky na zrušení nezanechají žádný běh ve stavu `QUEUED` nebo `RUNNING`,
- skutečně zrušené běhy nevytvoří kandidátní verzi.

### Stabilita uživatelského rozhraní

- hlavní workflow projde přes Přehled, Školní data, Tvorbu rozvrhu a Editor,
- stránka Nastavení existuje, načte kontext školního roku a nevrací 404,
- detail hodiny lze otevřít a zavřít klávesnicí,
- během průchodu nevznikne `pageerror`, neočekávaná konzolová chyba ani HTTP 500.

## Solver release-gate

- stejné vstupy, seed a konfigurace vytvoří stejný rozvrh, objective i skóre,
- jediná učebna nemůže hostit dvě třídy ve stejném slotu,
- nedostatek kapacity učitele má strukturované vysvětlení,
- dvojhodina nesmí zasáhnout nedostupný slot,
- preferovaný slot ovlivní výsledek, pokud jsou tvrdé podmínky rovnocenné.

## Doménové regresní testy

- neplatná konfigurace dvojhodiny blokuje připravenost,
- kolize učebny zneplatní rozvrh i jeho skóre,
- nedostupnost druhé části dvojhodiny je zachycena,
- validace přesunu nemění původní pole hodin.

## Co tento verdikt zatím nepokrývá

Následující oblasti nelze označit za ověřené, dokud nejsou implementované nebo dokud pro ně nevznikne samostatná brána:

- export rozvrhu do PDF, Excelu nebo jiného výstupního formátu,
- regenerace existujícího rozvrhu se zachováním zamčených hodin,
- porovnávání více kandidátních verzí v uživatelském rozhraní,
- dlouhodobý watchdog zaseknutého workeru a obnova po tvrdém ukončení procesu,
- výkon a kvalita na anonymizovaném datasetu velikosti skutečné velké školy,
- víceuživatelské zatížení ve stovkách souběžných požadavků,
- bezpečnostní penetrační test, autentizace a autorizace, dokud nejsou součástí MVP.

Tyto položky nesmějí být v závěrečném reportu vydávány za hotové nebo stoprocentně ověřené.

## Pravidla verdiktu

- **RELEASE_GATE_GREEN**: všechny implementované povinné brány na přesném HEAD jsou zelené.
- **RELEASE_GATE_BLOCKED**: alespoň jedna povinná brána selhala nebo nebyla spuštěna.
- **OUT_OF_SCOPE_NOT_VERIFIED**: funkce není implementována nebo není součástí aktuálního ověřovaného rozsahu.

Žádný merge ani deployment se v rámci této verifikační práce neprovádí.
