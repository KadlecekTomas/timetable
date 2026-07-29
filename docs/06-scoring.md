# Scoring a hodnocení kvality

## Účel

Interní objective value solveru není vhodná pro uživatele. Aplikace proto odděluje:

1. optimalizační penalizaci používanou solverem,
2. srozumitelné produktové skóre 0–100,
3. detailní report jednotlivých problémů.

Skóre se počítá pouze pro rozvrh, který prošel nezávislou kontrolou všech tvrdých omezení. Rozvrh s tvrdým konfliktem nemá platné skóre.

## Výchozí kategorie

| Kategorie | Maximum |
|---|---:|
| Kompaktnost tříd | 25 |
| Kompaktnost učitelů | 25 |
| Rozložení výuky | 15 |
| Preference učitelů | 15 |
| Začátky a konce dnů | 10 |
| Stabilita a učebny | 10 |
| Celkem | 100 |

Váhy jsou verzované. Změna vah vyžaduje změnu verze scoring profilu.

## Kompaktnost tříd

Penalizuje:

- každý vnitřní volný slot,
- více mezer v jednom dni nelineárně,
- dlouhou souvislou mezeru,
- zbytečně roztažený den.

Výchozí cíl: třída nemá žádné neexplicitní okno.

## Kompaktnost učitelů

Penalizuje:

- mezery mezi první a poslední výukou,
- více dnů s mezerou,
- jednu osamocenou hodinu v dlouhém dni,
- velmi dlouhou přítomnost ve škole vůči počtu odučených hodin.

Úvazek ani počet pracovních dnů se nesmí automaticky odvozovat pouze ze součtu hodin; případná pravidla musí být explicitní.

## Rozložení výuky

Penalizuje:

- příliš mnoho hodin stejného předmětu v jednom dni,
- nedodržení doporučeného odstupu mezi dny,
- nevhodné rozpadnutí dvojhodin,
- silně nerovnoměrnou koncentraci předmětu v týdnu.

## Preference učitelů

- `PREFERRED` přidává bonus nebo snižuje penalizaci.
- `DISCOURAGED` přidává penalizaci.
- Nesplnění preference není konflikt.
- Report vždy ukazuje počet splněných a nesplněných preferencí.

Bonus nesmí vykompenzovat závažný problém ve vyšší prioritě tak, že by vznikl výrazně horší rozvrh. Proto jsou kategorie v solveru používány lexikograficky nebo s bezpečně oddělenými rozsahy vah.

## Začátky a konce dnů

Penalizuje zejména:

- osamocenou první hodinu učitele,
- osamocenou poslední hodinu,
- zbytečně pozdní konec třídy,
- nevhodné poslední hodiny náročných předmětů, pokud škola toto pravidlo aktivuje.

## Stabilita a učebny

Při regeneraci se hodnotí počet změn oproti výchozí verzi. Dále se může penalizovat:

- přesun mezi učebnami bez důvodu,
- použití pouze kompatibilní, ale nepreferované učebny,
- časté střídání učeben během navazující výuky.

## Přepočet na 0–100

Každá kategorie začíná na svém maximu. Ověřené incidenty odečítají body podle verzované tabulky. Kategorie neklesne pod nulu. Celkové skóre je součet kategorií.

Příklad výstupu:

```text
Kvalita: 91/100

Kompaktnost tříd       25/25
Kompaktnost učitelů    20/25
Rozložení výuky        14/15
Preference učitelů     13/15
Začátky a konce         9/10
Stabilita a učebny     10/10
```

## Kvalitativní štítky

- 95–100: Výborný návrh
- 85–94: Velmi dobrý návrh
- 70–84: Použitelný návrh s rezervami
- 50–69: Vyžaduje výraznější úpravy
- pod 50: Slabý návrh

Štítek nesmí tvrdit, že rozvrh je objektivně „dobrý“ pro každou školu. UI uvede, že jde o hodnocení vůči nastaveným pravidlům.

## Report incidentů

Každá penalizace má:

- stabilní kód,
- kategorii,
- závažnost,
- počet odečtených bodů,
- dotčený den a slot,
- učitele/třídu/vazbu,
- lidské vysvětlení,
- případný návrh opravy.

Příklady kódů:

- `TEACHER_GAP`
- `CLASS_GAP`
- `DISCOURAGED_SLOT`
- `SUBJECT_SAME_DAY_CONCENTRATION`
- `LATE_CLASS_FINISH`
- `REGENERATION_DAY_CHANGED`

## Porovnání verzí

Při porovnání dvou rozvrhů UI zobrazí:

- rozdíl celkového skóre,
- rozdíl po kategoriích,
- vzniklé a odstraněné incidenty,
- počet přesunutých hodin,
- seznam změněných dnů, časů a učeben.

## Anti-gaming pravidla

- Skóre se nepočítá z neúplného rozvrhu.
- Explicitně povolené volno se nepovažuje za chybu.
- Stejný problém se nesmí započítat vícekrát pod různými kódy bez dokumentovaného důvodu.
- Zaokrouhlení probíhá až na konci.
- Scoring musí být čistá deterministická funkce vstupu.

## Kalibrace

Před změnou výchozích vah se spustí benchmark nad referenčními školami. Změna je přijata jen tehdy, pokud:

- nezhorší hard-validitu,
- nevytvoří zjevné regresní chování,
- report zůstane vysvětlitelný,
- produktově lepší rozvrh má ve většině kontrolních párů vyšší skóre.

## Akceptační kritéria

- stejné vstupy vždy vytvoří stejné skóre a incidenty,
- součet kategorií přesně odpovídá celkovému skóre,
- každý odečet je dohledatelný v reportu,
- rozvrh s tvrdým konfliktem nedostane skóre,
- porovnání dvou verzí přesně identifikuje změněné hodiny.
