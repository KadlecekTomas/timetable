# Optimalizace rozvrhu: nejprve kompaktnost

## Cíl

Solver musí skládat pravidelný rozvrh tak, aby vznikalo co nejméně vnitřních volných hodin pro třídy i učitele.

Jednorázové změny aktuálního týdne — suplování, výlety, Revolution Train, kulturní akce nebo jiné mimořádnosti — nejsou vstupem pro optimalizaci základního rozvrhu.

## Pořadí měkkých priorit

1. minimalizovat mezery v rozvrhu tříd;
2. minimalizovat mezery v rozvrhu učitelů;
3. omezit pozdní konce vyučování;
4. respektovat nedoporučené a preferované sloty;
5. rozumně rozložit více hodin stejného předmětu do týdne.

Tvrdá pravidla mají vždy přednost:

- žádné kolize učitele, třídy nebo učebny;
- respektování nedostupnosti;
- synchronizace dělených skupin;
- zachování pevných a uzamčených hodin;
- každodenní začátek pravidelných tříd v 8:00;
- Vašáková pouze INF, 12 hodin, pouze úterý a středa;
- 8.B se v INF nedělí.

## Kompaktnostní bezpečnostní profil

Backend nepřijme slabé historické váhy, které by dovolily vyměnit několik oken za malé bonusy v jiných kategoriích. Minimální efektivní váhy jsou:

| Kritérium | Minimální váha |
| --- | ---: |
| mezera třídy | 2 000 |
| mezera učitele | 1 000 |
| pozdní hodina | 10 |
| koncentrace stejné vazby | 50 |
| nedoporučený slot | 25 |
| bonus preferovaného slotu | 3 |

Vyšší hodnota zaslaná klientem se zachová; nižší hodnota se automaticky zvýší na bezpečné minimum.

## Výchozí stav před změnou

Referenční export před zavedením profilu obsahoval přibližně:

- 85 vnitřních mezer v rozvrzích tříd;
- 276 vnitřních mezer v rozvrzích učitelů;
- kvalitu 26/100.

Tyto hodnoty slouží jako baseline pro porovnání nového exportu, nikoli jako akceptovatelný produkční stav.
