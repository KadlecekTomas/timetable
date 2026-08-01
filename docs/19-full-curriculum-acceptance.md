# Akceptace plného učebního plánu druhého stupně

Tato release gate nahrazuje zmenšený demonstrační rozvrh při ověřování exportu pro vedení školy. Export se považuje za realisticky ověřený pouze tehdy, když každá třída obsahuje celý týdenní učební plán, nikoli několik ukázkových hodin.

## Rozsah školy

- 40 aktivně použitých učitelů;
- 13 tříd: 6.A–6.D, 7.A–7.C, 8.A–8.C a 9.A–9.C;
- 16 předmětů;
- 244 výukových vazeb;
- český jazyk, matematika, anglický jazyk a další cizí jazyk jsou dělené na dvě souběžné skupiny;
- další cizí jazyk začíná od 7. ročníku;
- chemie začíná od 8. ročníku.

## Týdenní počet hodin

Model respektuje celkových 122 hodin za průchod 6.–9. ročníkem:

- 6. ročník: 30 hodin;
- 7. ročník: 30 hodin;
- 8. ročník: 30 nebo 31 hodin;
- 9. ročník: 31 nebo 32 hodin.

Větve A a C mají 30 + 30 + 30 + 32 = 122 hodin. Větev B má 30 + 30 + 31 + 31 = 122 hodin.

## Tomáš Kadleček

Učitel `KAD` má přesně 17 hodin:

- jednu hodinu informatiky týdně ve všech 13 třídách;
- společnou tělesnou výchovu 9.A + 9.C v rozsahu čtyř hodin;
- tělesnou výchovu rozdělenou do dvou dvojhodin.

## Povinné kontroly

Playwright musí projít stejným workflow jako vedení školy:

1. vytvořit plný český Excel se školními daty;
2. nahrát, analyzovat a uložit data;
3. ověřit počet tříd, učitelů, předmětů a výukových vazeb;
4. ověřit kompletní seznam předmětů v každé třídě;
5. ověřit přesný týdenní počet obsazených hodin každé třídy;
6. vytvořit rozvrh solverem;
7. nezávisle ověřit kolize, dostupnosti a synchronizaci skupin;
8. exportovat rozvrh přes uživatelské tlačítko;
9. znovu otevřít stažený `.xlsx`;
10. ověřit 13 třídních a 40 učitelských listů;
11. ověřit 30–32 obsazených hodin na každém třídním listu a 17 hodin na listu učitele KAD.

Test běží bez retry. Menší fixture může zůstat jako rychlý technický test, ale nesmí být označena za realistickou akceptaci exportu pro vedení školy.
