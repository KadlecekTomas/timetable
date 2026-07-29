# Excel importní kontrakt

## Cíl

Excel je řízený vstupní formát, nikoli volný dokument. Uživatel stahuje verzovanou šablonu generovanou aplikací. Import stejné verze musí být deterministický.

## Formát

- `.xlsx`
- první list `README` s návodem
- skryté listy `Číselníky` a `Metadata`
- metadata obsahují `templateVersion`, například `1.0.0`
- záhlaví jsou stabilní technické názvy; uživatelský popis je v komentáři buňky
- datum a čas se nepřenášejí volným textem, pokud existuje číselník

## Listy MVP

### `Nastavení`

| Sloupec | Povinný | Příklad |
|---|---:|---|
| school_year | ano | 2026/2027 |
| monday_periods | ano | 8 |
| tuesday_periods | ano | 8 |
| wednesday_periods | ano | 8 |
| thursday_periods | ano | 8 |
| friday_periods | ano | 7 |

### `Učitelé`

| Sloupec | Povinný | Pravidlo |
|---|---:|---|
| teacher_code | ano | unikátní, bez mezer |
| first_name | ano | neprázdné |
| last_name | ano | neprázdné |
| target_weekly_load | ano | celé číslo >= 0 |
| min_weekly_load | ne | celé číslo |
| max_weekly_load | ne | celé číslo |
| subjects | ne | kódy oddělené středníkem |
| classes | ne | kódy oddělené středníkem |

`subjects` a `classes` jsou informativní kvalifikační omezení. Skutečnou výuku definuje list `Výukové_vazby`.

### `Třídy`

| Sloupec | Povinný | Příklad |
|---|---:|---|
| class_code | ano | 6.A |
| grade | ano | 6 |
| class_name | ne | 6.A |

### `Předměty`

| Sloupec | Povinný | Příklad |
|---|---:|---|
| subject_code | ano | MAT |
| subject_name | ano | Matematika |
| default_room_type | ne | PC |

### `Učebny`

| Sloupec | Povinný | Příklad |
|---|---:|---|
| room_code | ano | PC1 |
| room_name | ano | Počítačová učebna 1 |
| room_type | ne | PC |
| capacity | ne | 30 |

### `Výukové_vazby`

Každý řádek představuje jeden požadavek na výuku.

| Sloupec | Povinný | Hodnoty |
|---|---:|---|
| assignment_code | ano | stabilní unikátní kód |
| class_code | ano | reference |
| subject_code | ano | reference |
| teacher_code | ano | reference |
| group | ano | WHOLE, GROUP_1, GROUP_2 |
| weekly_periods | ano | celé číslo > 0 |
| lesson_shape | ano | SINGLE, DOUBLE, MIXED |
| double_periods_count | ano | celé číslo >= 0 |
| required_room | ne | kód učebny |
| required_room_type | ne | typ učebny |
| max_per_day | ne | celé číslo |
| min_day_gap | ne | celé číslo |

### `Dostupnost`

| Sloupec | Povinný | Hodnoty |
|---|---:|---|
| entity_type | ano | TEACHER, CLASS, ROOM |
| entity_code | ano | reference |
| day | ano | MON, TUE, WED, THU, FRI |
| period | ano | celé číslo od 1 |
| kind | ano | UNAVAILABLE, PREFERRED, DISCOURAGED |
| weight | ne | 1–100, pouze preference |
| reason | ne | text |

### `Pevné_hodiny`

| Sloupec | Povinný |
|---|---:|
| assignment_code | ano |
| day | ano |
| start_period | ano |
| duration | ano |
| locked | ano |

## Validace

### Blokující chyby

- chybějící povinný list nebo sloupec,
- neznámá verze šablony,
- duplicitní kód,
- neexistující reference,
- nedostupná pevná hodina,
- nekonzistentní počet dvojhodin,
- perioda mimo rozsah dne,
- neplatná enum hodnota,
- více řádků představujících stejnou jednoznačnou vazbu bez odlišného `assignment_code`.

### Varování

- úvazek učitele nesedí se součtem přiřazených hodin,
- učitel má velmi omezenou dostupnost,
- požadovaná učebna není zadána,
- předmět nemá doporučený typ učebny,
- dělená skupina nemá nalezený protějšek,
- vysoký počet dvojhodin může snížit řešitelnost.

## Atomický import

Analýza nesmí měnit produkční data. Po potvrzení se celý import aplikuje v jedné databázové transakci. Při jediné chybě se transakce vrátí.

## Idempotence

Opětovný import stejného souboru nad nezměněnými daty nesmí vytvářet duplicity. Identifikace probíhá podle stabilních kódů, ne podle názvů.

## Bezpečnost

- maximální velikost souboru je konfigurovatelná,
- nepovolují se makra,
- vzorce se nevyhodnocují,
- externí odkazy se ignorují,
- původní soubor se uchovává pouze podle retention policy,
- chybové hlášky nesmí vypisovat interní stack trace.

## Export chyb

Uživatel může stáhnout kopii šablony s listem `Chyby_importu`, kde je každý problém svázán s listem, řádkem, sloupcem, kódem chyby a doporučením.

## Akceptační kritéria

- validní referenční šablona projde bez varování,
- chybná reference ukáže přesnou buňku,
- import s chybou nezmění žádnou tabulku,
- stejný soubor lze bezpečně analyzovat opakovaně,
- import 500 vazeb dokončí analýzu v rozumném interaktivním čase,
- parser má fixture testy pro každou podporovanou verzi šablony.
