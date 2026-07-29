# Design systém

## Směr

**Moderní školní administrace bez chaosu.** Rozhraní má být klidné, profesionální, přehledné a informačně husté. Rozvrhová mřížka je hlavní pracovní plocha; dashboard ani dekorace ji nesmí vizuálně přebít.

## Stack

- Tailwind CSS
- shadcn/ui
- Lucide Icons
- Geist Sans nebo Inter
- CSS custom properties pro design tokeny

## Zásady

1. Jedna hlavní akce na obrazovce.
2. Stav je sdělen barvou, ikonou a textem nebo tvarem.
3. Existující systémová komponenta má přednost před novou variantou.
4. Hustota informací je žádoucí, pokud zůstane čitelnost.
5. Barvy mají sémantický význam a nepoužívají se náhodně.

## Tokeny

### Neutrální

`background`, `surface`, `surface-subtle`, `border`, `border-strong`, `text-primary`, `text-secondary`, `text-muted`.

### Akcent

`primary`, `primary-hover`, `primary-subtle`, `primary-foreground`. Doporučený směr je tlumená modrá nebo indigo.

### Sémantické

`success`, `warning`, `danger`, `info`; každá má variantu pro jemné pozadí, border a text.

Komponenty nepoužívají přímo pevné barvy tam, kde má být token. MVP může začít pouze světlým režimem, ale struktura tokenů musí umožnit dark mode.

## Typografie

- Page title: 24–30 px, semibold
- Section title: 18–20 px, semibold
- Card title: 14–16 px, semibold
- Body: 14 px
- Dense table: 13–14 px
- Helper text: 12–13 px

Velké marketingové nadpisy do pracovní aplikace nepatří.

## Spacing

Základ je 4 px. Preferované hodnoty: 4, 8, 12, 16, 24 a 32 px. Jednorázové hodnoty mimo škálu musí mít důvod.

## Radius a stíny

- malé prvky: 6 px
- inputy a tlačítka: 8 px
- karty a dialogy: 10–12 px
- rozvrhové karty: 6 px

Stín se používá pro skutečně vyvýšené vrstvy: dropdown, dialog a drag preview. Běžné karty odděluje plocha a border.

## Ikony

Používají se pouze Lucide Icons. Standardní velikost je 16 px. Ikona bez textu má tooltip a accessible label. Emoji nejsou systémové ikony.

## Tlačítka

Varianty: `primary`, `secondary`, `outline`, `ghost`, `destructive`. Velikosti: `sm`, `md`, výjimečně `lg`.

Zakázáno je vytvářet barvu tlačítka pro každý modul, zobrazovat dvě stejně výrazné primární akce vedle sebe nebo používat destructive styl pro obyčejné zrušení.

## Formuláře

Každé pole má label, required stav, případné vysvětlení, inline chybu, disabled/readonly stav a konzistentní focus. Placeholder nenahrazuje label. Výběry učitelů, tříd a předmětů podporují hledání.

## Tabulky

- standardní řádek 40–44 px,
- dense režim 32–36 px,
- sticky header,
- jasný aktivní sort,
- akce v posledním sloupci,
- prázdná hodnota jako tlumená pomlčka tam, kde by prázdno bylo nejasné,
- hover nikdy nepřebije stav chyby nebo výběru.

## Rozvrhová karta

Hierarchie:

1. předmět,
2. učitel nebo třída,
3. skupina a učebna,
4. stav zámku, ruční změny nebo konfliktu.

Povinné stavy: standardní, hover, selected, locked, manually changed, warning, conflict, dragging, valid drop target, invalid drop target a changed in comparison.

Zamčená hodina používá ikonu zámku a jemně odlišnou plochu. Konflikt používá danger border, ikonu a textový detail; ne jen červené pozadí.

## Barvy předmětů

Předměty používají omezenou paletu jemných tokenů. Barva pomáhá orientaci, nevyjadřuje validitu. Uživatel v MVP vybírá ze schválené palety, nezadává libovolný hex.

## Navigace

Desktop používá levý sidebar. Nahoře je název školy a školního roku. Aktivní položka je označena plochou i textem. Globální topbar obsahuje pouze globální kontext a účet; lokální akce patří do page headeru.

## Dialogy a panely

- dialog pro potvrzení a krátkou editaci,
- drawer pro detail při zachování kontextu,
- stránka pro dlouhé formuláře,
- žádný dialog uvnitř dialogu,
- neuložené změny vyžadují potvrzení před zavřením.

## Loading a empty states

Aplikace nevymýšlí procento solveru. Ukazuje fázi a uplynulý čas. Skeleton odpovídá výslednému layoutu. Empty state vysvětluje, proč je oblast prázdná, a nabízí jednu doporučenou akci.

## Přístupnost

Cíl je WCAG 2.2 AA. Focus je vždy viditelný, tab order odpovídá layoutu, barva není jediný nositel významu, tooltip není jediný zdroj kritické informace a drag and drop má dialogovou alternativu.

## Motion

Animace trvají přibližně 120–200 ms a respektují `prefers-reduced-motion`. Nepoužívají se efekty, které zpomalují práci s mřížkou.

## Základní komponenty

`AppShell`, `PageHeader`, `StatusBadge`, `DataTable`, `FilterBar`, `EntityCombobox`, `FormField`, `ImportDropzone`, `ImportIssueTable`, `ReadinessPanel`, `SolverRunPanel`, `QualityScoreCard`, `ScoreBreakdown`, `TimetableGrid`, `TimetableLessonCard`, `ConflictExplanation`, `VersionCompareLegend`, `ConfirmActionDialog`.

## Definition of done

UI komponenta používá tokeny, pokrývá relevantní stavy, funguje klávesnicí, má viditelný focus, test kritického chování a neobsahuje ad hoc barvy ani spacing. Klíčové pracovní obrazovky mají screenshot regresní test.
