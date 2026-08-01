# Akceptační brána druhého stupně

Tato brána ověřuje kompletní local-first workflow na realistickém datasetu jedné školy. Test není zmenšené demo; vytváří data vedení školy prostřednictvím stejné české Excel šablony, kterou používá uživatel.

## Rozsah školy

- 40 učitelů;
- 13 tříd: 6.A–6.D, 7.A–7.C, 8.A–8.C a 9.A–9.C;
- kompletní sada předmětů druhého stupně včetně češtiny, matematiky, dvou cizích jazyků, informatiky, TV, fyziky, chemie, dějepisu, zeměpisu, přírodopisu, občanské, hudební a výtvarné výchovy a pracovních činností;
- chemie od 8. ročníku.

## Tomáš Kadleček

- učitel `KAD`;
- informatika ve všech 13 třídách;
- přesně jedna hodina informatiky týdně v každé třídě;
- informatika probíhá s celou třídou;
- jedna společná výuková vazba TV pro 9.A + 9.C;
- čtyři hodiny TV týdně rozdělené do dvou dvojhodin;
- celkový týdenní úvazek v testu je 17 hodin.

## Dělené předměty

Český jazyk, matematika, jazyk 1 a jazyk 2 mají pro každou třídu vazbu Skupina 1 a Skupina 2. Solver musí obě poloviny stejného předmětu umístit ve stejný den, stejnou vyučovací hodinu a se stejnou délkou. Každá polovina může mít jiného učitele a učebnu.

## Dostupnost a tvrdá pravidla

- každý učitel má deterministické nedostupné a preferované sloty;
- Tomáš má vlastní explicitní dostupnost;
- žádná hodina nesmí zasáhnout nedostupnost učitele, třídy ani učebny;
- společná hodina obsadí současně všechny zúčastněné třídy;
- žádná dvojhodina nesmí překročit obědovou hranici mezi 6. a 7. hodinou;
- výsledný rozvrh musí projít nezávislou TypeScript validací po návratu ze solveru.

## Celý workflow

1. vedení školy otevře aplikaci;
2. nastaví název školy;
3. vyplní a nahraje českou Excel šablonu;
4. aplikace provede náhled a bezpečné uložení do IndexedDB;
5. test ověří přesný počet učitelů, tříd, předmětů a vazeb;
6. solver vytvoří rozvrh;
7. test ověří všechny tvrdé podmínky a dostupnosti;
8. uživatel otevře pohled učitele Tomáše;
9. přesune jednu hodinu informatiky do jiného validního slotu;
10. aplikace uloží novou revizi;
11. undo obnoví původní stav;
12. projekt se stáhne jako kontrolovaná lokální záloha.

Brána běží bez automatického retry. Selhání není považováno za flake, dokud není nalezena a odstraněna jeho příčina.
