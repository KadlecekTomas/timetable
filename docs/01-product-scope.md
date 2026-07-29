# Produktový scope

## Problém

Zástupkyně školy skládá rozvrh 2. stupně ručně nebo v příliš komplexním systému. Potřebuje rychle vytvořit první kvalitní návrh, který respektuje povinné podmínky a nevytváří zbytečně dlouhé mezery mezi hodinami.

## Cíl MVP

Webová aplikace umožní:

1. stáhnout Excel šablonu,
2. vyplnit a importovat data,
3. opravit validační chyby,
4. doplnit výukové vazby a pravidla,
5. vygenerovat návrh rozvrhu,
6. prohlížet jej podle tříd a učitelů,
7. ručně přesouvat a zamykat hodiny,
8. přegenerovat pouze nezamčenou část,
9. exportovat výsledek.

## Primární uživatel

Zástupkyně nebo ředitel školy odpovědný za sestavení rozvrhu.

## MVP scope

- pouze 2. stupeň ZŠ,
- pondělí až pátek,
- konfigurovatelný počet vyučovacích hodin denně,
- učitelé, třídy, předměty a volitelně učebny,
- běžná hodina, dvojhodina a dělená hodina,
- u dělení právě Skupina 1 a Skupina 2,
- nedostupnost a preference učitelů,
- pevné a zamčené hodiny,
- generování přes constraint solver,
- vysvětlení kvality a nesplněných preferencí.

## Mimo MVP

- suplování,
- známky, docházka a třídní kniha,
- přímá integrace se Školou Online,
- mobilní aplikace,
- více než dvě skupiny,
- automatické rozesílání rozvrhu,
- úplné plánování 1. stupně,
- optimalizace přes více budov a přesunové časy,
- AI chat nahrazující strukturované zadání.

## Klíčová metrika

Uživatel získá použitelný první návrh, který vyžaduje podstatně méně ručních zásahů než tvorba od nuly.

## Guardrails

- Aplikace nesmí tvrdit, že rozvrh je validní, pokud obsahuje tvrdý konflikt.
- Preference nesmí být zaměňovány za povinná omezení.
- Solver musí být deterministicky testovatelný na fixture datech.
- Každá ruční úprava musí proběhnout přes stejnou validační vrstvu jako generování.
