# Bezpečnost

Projekt pracuje s provozními údaji školy a potenciálně s osobními údaji zaměstnanců. Bezpečnost a minimalizace dat jsou proto součástí návrhu, nikoli dodatečná funkce.

## Hlášení zranitelnosti

Nezveřejňuj bezpečnostní problém v běžném GitHub issue, pokud by jeho popis umožnil zneužití nebo odhaloval citlivá data.

Do zavedení vyhrazeného bezpečnostního kontaktu kontaktuj vlastníka repozitáře soukromým kanálem a uveď:

- stručný popis problému,
- dotčenou verzi nebo commit,
- kroky k reprodukci,
- možný dopad,
- případný návrh opravy,
- zda došlo k přístupu k reálným datům.

Nevyužívej zranitelnost nad cizími nebo produkčními daty a neprováděj destruktivní testování.

## Citlivá data

Do repozitáře, fixture, screenshotů, logů ani issue nepatří:

- hesla, API klíče, tokeny a privátní klíče,
- produkční databázové connection stringy,
- reálné seznamy učitelů nebo žáků,
- osobní e-maily a telefonní čísla,
- exporty školních systémů,
- neveřejné rozvrhy obsahující identifikovatelné osoby,
- session cookies nebo autentizační state soubory.

Testovací data musí být syntetická a nesmí kopírovat skutečné osoby.

## Konfigurace a tajemství

- Tajemství se načítají pouze z prostředí nebo správce tajemství.
- `.env` soubory s hodnotami se necommitují.
- Repozitář může obsahovat pouze bezpečný `.env.example` bez funkčních údajů.
- Tajemství se nesmí zapisovat do klientského bundle, logů ani chybových odpovědí.
- Uniklé tajemství se považuje za kompromitované a musí být okamžitě rotováno; odstranění z posledního commitu nestačí.

## Autentizace a autorizace

- Každá serverová operace ověřuje oprávnění nezávisle na UI.
- Identifikátory objektů nejsou autorizace.
- Data jedné školy nesmí být dostupná jiné škole.
- Privilegované operace musí být auditovatelné.
- Výchozí stav je zamítnutí přístupu, nikoli povolení.

## Import souborů

Excel import musí:

- omezovat velikost a podporované typy souborů,
- ověřovat skutečný obsah, ne pouze příponu,
- odmítat nečekané struktury a nebezpečné hodnoty,
- neprovádět vzorce ani makra,
- zpracovávat data v omezeném a časově limitovaném procesu,
- při chybě nezapsat částečný import.

## Solver a asynchronní úlohy

- Vstup solveru musí být autorizovaný a validovaný.
- Úlohy musí mít limit času, paměti a velikosti vstupu.
- Uživatel nesmí číst stav ani výsledek cizí úlohy.
- Logy solveru nesmí obsahovat citlivé vstupní hodnoty.
- Výstup solveru musí projít nezávislou validací tvrdých omezení před publikováním.

## Závislosti a dodavatelský řetězec

- Používej lockfile a reprodukovatelné instalace.
- Aktualizace závislostí musí projít testy.
- Kritická zranitelnost v runtime závislosti blokuje release, dokud není vyhodnocena a opravena nebo bezpečně mitigována.
- CI workflow mají používat minimální oprávnění.

## Logování a chyby

- Loguj události a technické identifikátory, nikoli kompletní importovaná data.
- Produkční chyba nesmí uživateli vracet stack trace, SQL ani interní konfiguraci.
- Auditní záznam musí zachytit kdo, kdy a co změnil, ale nesmí ukládat tajemství.

## Zálohy a obnova

Před produkčním provozem musí existovat:

- automatické šifrované zálohy,
- definovaná retence,
- oddělení záloh od primární databáze,
- pravidelně ověřený postup obnovy,
- dokumentované RPO a RTO.

## Podporované verze

Dokud nevznikne první stabilní release, bezpečnostní opravy se aplikují pouze na aktuální `main`. Po zavedení verzovaných release bude tato sekce aktualizována.
