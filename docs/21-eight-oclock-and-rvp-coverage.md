# Začátek výuky v 8:00 a pokrytí RVP

## Povinný začátek tříd

První vyučovací hodina začíná vždy v **8:00**. Nultá hodina se v modelu nepoužívá.

U pravidelné třídy s výukou alespoň v rozsahu počtu pracovních dnů solver vyžaduje obsazenou první hodinu každý vyučovací den. Stejné pravidlo kontroluje serverový i lokální validátor pod kódem `CLASS_DOES_NOT_START_AT_EIGHT`.

Požadavek se ověřuje na čtyřech úrovních:

- solver nesmí vrátit pravidelnou třídu bez první hodiny;
- lokální validace nesmí takový rozvrh přijmout ani po ručním přesunu;
- plný E2E průchod ověřuje první slot všech 13 tříd ve všech pěti dnech;
- aplikace i export označují první řádek jako `1. hodina · 8:00`.

## Školní předměty a vzdělávací obory

RVP vymezuje vzdělávací obory, zatímco konkrétní školní předměty a jejich integraci určuje ŠVP. Testovací model používá 16 školních předmětů, které pokrývají všech 17 relevantních vzdělávacích oborů druhého stupně.

| Kód | Školní předmět v modelu | Pokryté vzdělávací obory |
|---|---|---|
| CJ | Český jazyk a literatura | Český jazyk a literatura |
| M | Matematika | Matematika |
| JAZ1 | Anglický jazyk | Anglický jazyk |
| JAZ2 | Další cizí jazyk | Další cizí jazyk |
| INF | Informatika | Informatika |
| DEJ | Dějepis | Dějepis |
| OV | Výchova k občanství a osobnostní a sociální výchova | Výchova k občanství; Osobnostní a sociální výchova |
| ZEM | Geografie (zeměpis) | Geografie |
| FY | Fyzika | Fyzika |
| CH | Chemie | Chemie |
| PRI | Přírodopis | Přírodopis |
| VV | Výtvarná a filmová výchova | Výtvarná a filmová výchova |
| HV | Hudební, taneční a dramatická výchova | Hudební, taneční a dramatická výchova |
| VZ | Výchova ke zdraví a bezpečí | Výchova ke zdraví a bezpečí |
| TV | Tělesná výchova | Tělesná výchova |
| PC | Polytechnická výchova a praktické činnosti | Polytechnická výchova a praktické činnosti |

`VZ` je tedy v modelu samostatně a není skryté pouze v tělesné nebo občanské výchově. Osobnostní a sociální výchova je v tomto konkrétním ŠVP modelu integrovaná s výchovou k občanství, aby se nezvyšovala celková týdenní dotace nad 122 hodin.

Stejných 16 předmětů je předvyplněno také v klientské importní šabloně. Automatický test kontroluje zejména přítomnost Výchovy ke zdraví a bezpečí, osobnostní a sociální výchovy a polytechnické výchovy.
