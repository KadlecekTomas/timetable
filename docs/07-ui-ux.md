# UI a UX specifikace

## Produktový princip

Aplikace je pracovní nástroj pro člověka, který potřebuje během omezeného času zkontrolovat velké množství vazeb. Prioritou je přehlednost, rychlé opravy a důvěryhodnost výsledku, nikoli dekorativní dashboard.

## Informační architektura

### Přehled

- připravenost dat ke generování,
- blokující chyby,
- varování,
- poslední verze rozvrhu,
- poslední běh solveru,
- rychlé akce.

### Data

Samostatné stránky:

- Učitelé
- Třídy
- Předměty
- Učebny
- Výukové vazby
- Dostupnost a preference

Každá stránka podporuje filtrování, řazení, editaci a jasný prázdný stav.

### Import

Wizard:

1. stáhnout šablonu,
2. nahrát soubor,
3. analyzovat,
4. zobrazit chyby a varování,
5. potvrdit změny,
6. zobrazit výsledný souhrn.

### Generátor

- výběr solver profilu,
- režim nejlepší kvality nebo minimálních změn,
- časový limit,
- souhrn vstupních dat,
- předletová kontrola,
- spuštění a možnost zrušení,
- průběžný stav bez falešného procenta, pokud solver skutečné procento nezná.

### Rozvrh

Pohledy:

- podle tříd,
- podle učitelů,
- detail jedné třídy,
- detail jednoho učitele,
- porovnání dvou verzí.

## Rozvrhová karta

Musí zobrazit v kompaktní podobě:

- zkratku předmětu,
- učitele nebo třídu podle pohledu,
- skupinu,
- učebnu,
- zámek,
- indikátor ruční změny.

Detail po kliknutí zobrazí úplná data, původ hodiny a související pravidla.

## Drag and drop

- během tažení se zvýrazní validní a nevalidní cíle,
- před uložením se spustí serverová validace,
- při konfliktu se karta vrátí a zobrazí přesnou příčinu,
- přesun dvojhodiny zachovává celý blok,
- přesun jedné skupiny nesmí automaticky přesunout druhou bez explicitní akce,
- každá úspěšná změna je undoable alespoň do opuštění stránky.

## Zamykání

Uživatel může zamknout:

- jednu hodinu,
- celý blok,
- všechny hodiny třídy v daném dni,
- všechny ručně změněné hodiny.

Hromadné zamknutí musí před potvrzením ukázat počet dotčených hodin.

## Konflikty a upozornění

Tři úrovně:

- `ERROR`: tvrdý konflikt, blokuje akci,
- `WARNING`: povolený, ale problematický stav,
- `INFO`: vysvětlení nebo doporučení.

Každé hlášení obsahuje co se stalo, koho se týká, proč to vadí a jak problém opravit.

## Formuláře

- pole používají české názvy a příklady,
- technické kódy jsou viditelné, ale vysvětlené,
- chyba je u konkrétního pole,
- uložit lze klávesovou zkratkou,
- zavření neuloženého formuláře vyžaduje potvrzení,
- výběry učitelů, tříd a předmětů podporují hledání.

## Tabulky

- sticky header,
- serverové stránkování až při skutečné potřebě,
- hustý a pohodlný režim,
- viditelný počet výsledků,
- filtry se promítají do URL,
- export respektuje aktivní filtry,
- řazení musí být vizuálně jednoznačné.

## Responzivita

Desktop je primární. Minimální podporovaná pracovní šířka MVP je 1280 px. Na menších displejích je možné data číst a provádět základní změny, ale plná rozvrhová mřížka může používat horizontální scroll. Mobilní optimalizace není cílem MVP.

## Přístupnost

- ovládání klávesnicí,
- viditelný focus,
- textové alternativy ikon,
- dostatečný kontrast,
- barva není jediný indikátor,
- dialogy správně spravují focus,
- tabulky mají sémantická záhlaví,
- drag and drop má alternativní akci „Přesunout“ přes dialog.

## Stavy obrazovek

Každá datová obrazovka musí mít definován:

- loading,
- skeleton pouze tam, kde odpovídá výslednému layoutu,
- empty state,
- error state,
- partial state,
- success feedback,
- stale-data conflict.

## Copy pravidla

- používat „hodina“ pro vyučovací periodu a „výukový blok“ pro jednu plánovanou jednotku,
- netvrdit „optimalizováno“, pokud solver vrátil pouze feasible řešení,
- místo technických názvů constraintů používat srozumitelné věty,
- potvrzovací dialogy přesně popisují dopad.

## Akceptační kritéria

- hlavní workflow lze dokončit bez znalosti interního datového modelu,
- konflikt při ručním přesunu je vysvětlen konkrétně,
- uživatel rozpozná zamčené a ručně změněné hodiny bez otevření detailu,
- všechny kritické akce jsou dostupné klávesnicí,
- porovnání verzí jednoznačně ukáže přidané, odebrané a přesunuté hodiny.
