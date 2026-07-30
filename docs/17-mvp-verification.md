# Integrovaná verifikace local-first MVP

Tento dokument popisuje povinné brány varianty určené pro jednu školu a jedno vedení. Verdikt se vždy vztahuje ke konkrétnímu commitu a neznamená matematickou záruku nulového počtu budoucích chyb. Znamená, že uvedené chování bylo na přesných bajtech daného commitu reprodukovatelně ověřeno.

## Ověřovaný rozsah

- jeden lokální projekt školy uložený v IndexedDB,
- nastavení školy a školního roku,
- Excel šablona, validace a atomické potvrzení importu,
- přímé volání FastAPI/OR-Tools solveru bez databázové fronty,
- nezávislá kontrola tvrdých omezení a skórování v prohlížeči,
- lokálně verzované návrhy rozvrhu,
- zamykání, ruční přesuny, undo a přijetí verze,
- úplná exportovatelná záloha s SHA-256 kontrolním součtem,
- vymazání a obnova projektu,
- runtime webu a solveru bez PostgreSQL a permanentního workeru.

## Povinné technické brány

Před kladným verdiktem musí projít:

1. Prettier kontrola.
2. ESLint.
3. TypeScript typecheck.
4. Webové a doménové jednotkové testy.
5. Produkční build Next.js bez `DATABASE_URL`.
6. Solver lint a testy.
7. Docker Compose konfigurace a build pouze služeb `web` a `solver`.
8. Start obou kontejnerů a health check webu, solveru a proxy `/solver`.
9. Databázově nezávislá Playwright cesta.
10. Kritická local-first cesta třikrát za sebou s vypnutými retry.

## Databázově nezávislá Playwright cesta

Scénář běží v čistém izolovaném browser contextu a nevyžaduje PostgreSQL ani worker.

### Vytvoření projektu

- při první návštěvě vznikne jediný lokální projekt,
- nastavení názvu školy a školního roku se uloží do IndexedDB,
- projekt přežije tvrdý reload stránky,
- navigace používá stabilní lokální identifikátor projektu.

### Excel import

- test používá skutečný `.xlsx` vytvořený z aplikační šablony,
- soubor se nejprve analyzuje bez změny aktivních dat,
- pouze validní náhled lze potvrdit,
- potvrzení nahradí související lokální číselníky atomicky,
- po potvrzení projde kontrola připravenosti.

### Generování

- web odešle neměnný snapshot přímo solveru,
- nevzniká databázová fronta ani dlouhodobě běžící worker,
- solver vrátí kandidátní rozvrh,
- web znovu ověří kolize učitelů, tříd a učeben,
- skóre a incidenty se uloží do lokální verze,
- návrh lze otevřít i po další navigaci.

### Záloha a obnova

- stažený soubor obsahuje vstupní data i vytvořenou verzi rozvrhu,
- záloha obsahuje SHA-256 kontrolní součet,
- poškozená záloha je odmítnuta a aktivní projekt zůstane nezměněný,
- úplné vymazání vyžaduje dvě potvrzení,
- po vymazání je projekt skutečně prázdný,
- platná záloha obnoví učitele, pravidla, návrhy, zámky i historii,
- obnovený rozvrh lze znovu otevřít.

### Stabilita UI

Během celé cesty nesmí vzniknout:

- `pageerror`,
- neočekávaná konzolová chyba,
- HTTP odpověď 500 nebo vyšší.

## Solver release-gate

- stejné vstupy a seed vytvoří deterministický výsledek,
- učitel, třída ani učebna nejsou ve stejném slotu použiti dvakrát,
- nedostatek kapacity má strukturované vysvětlení,
- dvojhodina nesmí zasáhnout nedostupný slot,
- preference ovlivní výsledek pouze při zachování tvrdých omezení.

## Co local-first režim záměrně neumí

- automatickou synchronizaci mezi různými počítači nebo prohlížeči,
- centrální víceuživatelskou historii,
- obnovu bez záložního souboru po vymazání IndexedDB,
- současnou editaci více lidmi,
- účty, role a autorizaci,
- garantované zachování dat mezi různými doménami nebo Vercel Preview URL.

## Co dosud není ověřené

- skutečný Vercel Preview deployment v konkrétním účtu,
- dostupnost Vercel Services Private Beta pro vlastníka projektu,
- velikost výsledného Python function bundle s OR-Tools na Vercelu,
- výkon solveru nad anonymizovaným datasetem velikosti reálné velké školy,
- export výsledného rozvrhu do PDF nebo Excelu,
- dlouhodobé chování po měsících používání bez pravidelných záloh.

## Pravidla verdiktu

- **LOCAL_FIRST_GATE_GREEN**: všechny implementované povinné brány na přesném HEAD jsou zelené.
- **LOCAL_FIRST_GATE_BLOCKED**: alespoň jedna povinná brána selhala nebo nebyla spuštěna.
- **VERCEL_PREVIEW_PENDING**: lokální a Docker brány jsou zelené, ale konkrétní Vercel Preview nebyl ověřen.
- **OUT_OF_SCOPE_NOT_VERIFIED**: funkce není součástí local-first MVP.

Žádný merge ani deployment se v rámci této verifikační práce neprovádí.
