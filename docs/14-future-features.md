# Budoucí funkce po MVP

## Pravidlo

Tento dokument je backlog, nikoli aktuální scope. Žádná položka nesmí být implementována bez explicitního rozhodnutí, priority a posouzení dopadu na datový model, solver a UX.

## Integrace školních systémů

- import/export formátů Škola Online,
- import z Bakalářů,
- mapování externích kódů na interní entity,
- bezpečný sync s preview změn,
- audit rozdílů a možnost rollbacku.

## Pokročilé skupiny

- více než dvě skupiny,
- průnikové skupiny napříč třídami,
- volitelné semináře,
- jazykové skupiny,
- paralelní bloky s více učiteli.

## Více budov

- budovy a patra,
- přesunové časy,
- zákaz nereálných přesunů mezi hodinami,
- preferované domovské učebny,
- optimalizace počtu přesunů.

## Pokročilý solver

- více kandidátních variant,
- Pareto porovnání kvality,
- automatické návrhy uvolnění konfliktů,
- incremental solving,
- warm start z předchozí verze,
- školou definované lexikografické priority,
- vysvětlení „co změnit, aby bylo řešení možné“.

## Spolupráce

- komentáře u hodin a pravidel,
- schvalovací workflow,
- role vedoucích předmětových komisí,
- změnové návrhy bez přímého zápisu,
- notifikace o změnách,
- současná editace s přítomností uživatelů.

## Publikace

- veřejný nebo přihlášený pohled učitele,
- rozvrh pro žáky a rodiče,
- export iCalendar,
- tiskové šablony,
- automatické rozeslání po publikaci,
- historie publikovaných verzí.

## Suplování a provoz během roku

- absence učitele,
- návrh suplování,
- jednorázové změny,
- výměny hodin,
- provozní omezení učeben,
- oddělení stálého rozvrhu od denních změn.

## Analytika

- vytížení učitelů a učeben,
- vývoj kvality mezi verzemi,
- nejčastější typy kompromisů,
- kapacitní problémy školy,
- report dopadu nového omezení před regenerací.

## Personalizace pravidel

- vlastní scoring profil školy,
- šablony pravidel,
- preference podle typu úvazku,
- pravidla pro náročné předměty,
- konfigurovatelné volné hodiny tříd,
- specifická pravidla pro školní jídelnu a odpolední výuku.

## Internacionalizace

- lokalizované názvy dnů a předmětů,
- rozdílné struktury školního týdne,
- více časových pásem,
- lokalizované Excel šablony,
- legislativní a provozní profily podle země.

## Kritéria pro přijetí funkce do roadmapy

Nová funkce musí mít:

- jasný problém a cílového uživatele,
- důkaz z pilotu nebo opakovanou poptávku,
- definovaný dopad na MVP workflow,
- datový a solver návrh,
- akceptační kritéria,
- odhad provozní a UX složitosti,
- plán migrace a zpětné kompatibility.
