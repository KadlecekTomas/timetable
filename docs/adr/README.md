# Architecture Decision Records

Tato složka obsahuje Architecture Decision Records (ADR) — stručné, verzované záznamy důležitých technických rozhodnutí, jejich kontextu a důsledků.

## Kdy vytvořit ADR

ADR je povinné, pokud změna:

- zásadně mění architekturu,
- přidává nebo nahrazuje klíčovou technologii,
- mění hranice mezi webovou aplikací, databází a solverem,
- mění způsob verzování dat, API nebo scoringu,
- zavádí významný provozní nebo bezpečnostní kompromis,
- ruší dříve schválené technické rozhodnutí.

Běžné opravy, malé refaktory a lokální implementační detaily ADR nepotřebují.

## Číslování a názvy

Používejte čtyřmístné pořadové číslo a krátký kebab-case název:

```text
0001-use-monorepo.md
0002-separate-python-solver-service.md
0003-version-scoring-model.md
```

Čísla se nikdy znovu nepoužívají, ani pokud je ADR později nahrazené.

## Stav

Každé ADR má právě jeden stav:

- `Proposed`
- `Accepted`
- `Deprecated`
- `Superseded by ADR-XXXX`

Implementace rozhodnutí nesmí začít, dokud ADR vyžadující schválení není ve stavu `Accepted`.

## Šablona

```md
# ADR-XXXX: Název rozhodnutí

- Status: Proposed
- Date: YYYY-MM-DD
- Deciders: jména nebo role
- Related: odkazy na issue, PR nebo dokumentaci

## Context

Jaký problém řešíme, jaké jsou požadavky a omezení?

## Decision

Jaké rozhodnutí přijímáme?

## Alternatives considered

Jaké reálné varianty byly zváženy a proč nebyly zvoleny?

## Consequences

### Positive

- přínos

### Negative

- kompromis nebo náklad

### Risks and mitigations

- riziko a jeho zmírnění

## Validation

Jak ověříme, že rozhodnutí funguje?
```

## Pravidla údržby

- ADR se po přijetí nepřepisuje tak, aby měnilo historii rozhodnutí.
- Nové rozhodnutí, které staré ruší, vznikne jako nové ADR a odkáže na původní.
- Relevantní ADR musí být propojeno s PR a s dotčenou produktovou nebo technickou dokumentací.
- Kód a dokumentace nesmí dlouhodobě odporovat přijatému ADR.

## První očekávaná ADR

Při vytváření skeletonu projektu pravděpodobně vzniknou minimálně:

1. monorepo a jeho struktura,
2. oddělená Python služba pro OR-Tools,
3. komunikační kontrakt mezi webem a solverem,
4. verzování scoringu a solver vstupu,
5. strategie asynchronních solver jobů.
