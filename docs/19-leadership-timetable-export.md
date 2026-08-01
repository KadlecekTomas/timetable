# Export rozvrhu pro vedení školy

## Primární formát

Primárním provozním výstupem je `.xlsx`. Technická JSON záloha projektu není považována za export rozvrhu pro vedení školy.

## Povinný obsah

- souhrnný list s názvem školy, školním rokem, verzí, revizí, stavem a kvalitou;
- samostatný list pro každou třídu;
- samostatný list pro každého učitele;
- předmět, učitel nebo třída, skupina a učebna v každém výukovém bloku;
- explicitní označení společné výuky více tříd;
- vyznačené pokračování dvojhodiny;
- označení zamčených a ručně změněných bloků;
- obědová přestávka mezi šestou a sedmou hodinou;
- interní odkazy ze souhrnného listu na jednotlivé rozvrhy.

## Tisk

Každý třídní a učitelský list musí být nastavený na tisk na šířku, na jednu stránku, s opakovanou hlavičkou a číslováním stran.

## Ověření

Strukturální test vytváří 54 listů pro 13 tříd a 40 učitelů. Kontroluje také přesný sedmnáctihodinový rozvrh učitele KAD, třináct hodin informatiky, dvě dvojhodiny společné TV 9.A + 9.C, synchronní skupiny a tiskové nastavení.

Browserový test prochází importem, vytvořením rozvrhu, kliknutím na export a opětovným otevřením staženého Excelu. Export je platný pouze tehdy, pokud jsou čitelné třídní i učitelské listy a soubor nevyvolá chybu stránky, konzole ani serveru.
