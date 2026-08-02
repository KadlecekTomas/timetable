# Synchronizované výměny předmětů

Výměna předmětů mezi dvěma skupinami je jedna atomická organizace výuky se dvěma rameny.

Příklad ČJ/M:

- rameno 1: skupina 1 má ČJ a skupina 2 má M;
- rameno 2: skupina 1 má M a skupina 2 má ČJ.

Obě poloviny každého ramene musí začít současně. Solver vždy vytvoří obě ramena, přesně prohodí předměty i učitele a smí automaticky otočit pořadí ramen podle dostupnosti.

Uživatel vybírá jeden ze tří režimů:

1. `ADJACENT` — ramena jsou bezprostředně za sebou a nesmějí být rozdělena obědovou přestávkou;
2. `SAME_DAY` — obě ramena proběhnou ve stejný den, klidně jedno ráno a druhé odpoledne;
3. `FLEXIBLE` — ramena mohou být i v různých dnech, ale optimalizace je stále drží co nejblíže.

Třídy mají profil `REGULAR`, `SPORTS` nebo `CUSTOM`. Pro tuto školu se označení končící `.B` nebo `.D` pouze nabízí jako sportovní profil. Skutečná hodinová dotace zůstává explicitně uložená po jednotlivých třídách, takže například 6.A a 6.B mohou mít odlišný počet matematiky, tělesné výchovy i dalších předmětů bez skrytého kopírování.
