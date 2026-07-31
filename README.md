# Rozvrhář

Webová aplikace pro vytvoření a ruční doladění školního rozvrhu pro jednu školu a jedno vedení.

## Provozní model

Aplikace je navržená jako **local-first**:

- učitelé, třídy, předměty, učebny a pravidla se ukládají do IndexedDB v prohlížeči;
- vytvořené návrhy, zámky, ruční přesuny a historie vrácení změn zůstávají ve stejném lokálním projektu;
- není potřeba PostgreSQL, Prisma, serverová fronta ani permanentně běžící worker;
- plánovací výpočet provádí samostatná FastAPI služba s Google OR-Tools;
- data školy se na serveru trvale neukládají.

Tento režim je určený pro práci na jednom hlavním počítači nebo v jednom stabilním profilu prohlížeče. Data různých prohlížečů, zařízení, domén a Vercel Preview deploymentů se automaticky nesynchronizují.

## Povinné zálohování

IndexedDB přežije zavření karty i restart počítače, ale může být odstraněná vymazáním dat webu, resetem profilu nebo poruchou zařízení.

V části **Nastavení** proto aplikace umožňuje:

- stáhnout úplnou zálohu projektu;
- ověřit zálohu pomocí SHA-256 kontrolního součtu;
- obnovit celý projekt na stejném nebo jiném zařízení;
- bezpečně vymazat lokální projekt až po dvojím potvrzení.

Doporučený postup je stáhnout zálohu po každé významné změně a uložit ji na školní Google Disk nebo jiné spravované úložiště.

## Hlavní workflow

1. Nastavit školu a školní rok.
2. Stáhnout Excel šablonu.
3. Vyplnit učitele, třídy, předměty, učebny, vazby a omezení.
4. Nechat soubor analyzovat bez zápisu.
5. Potvrdit validní import do lokálního projektu.
6. Spustit přímý výpočet rozvrhu.
7. Zkontrolovat kvalitu a konflikty.
8. Ručně přesouvat a zamykat hodiny.
9. Stáhnout zálohu projektu.

## Základní pravidla

- Povinná omezení se nesmí porušit.
- Učitel, třída ani učebna nesmí být ve stejný čas na dvou místech.
- Dělená výuka používá skupiny 1 a 2.
- Import je atomický a ukazuje chybu na konkrétním listu, řádku a sloupci.
- Výsledek solveru prochází nezávislou kontrolou tvrdých omezení v prohlížeči.
- Každý návrh obsahuje vysvětlitelné hodnocení kvality.
- Ruční změny jsou verzované a lze je vracet.

## Stack

- Next.js 15, React 19 a TypeScript strict
- Tailwind CSS
- IndexedDB a Web Crypto API
- ExcelJS
- Python, FastAPI a Google OR-Tools CP-SAT
- Playwright
- Docker Compose
- GitHub Actions

## Rychlé spuštění přes Docker

```bash
cp .env.example .env
docker compose up --build
```

Po startu:

- web: `http://localhost:3000`
- solver API: `http://localhost:8000/docs`

Docker Compose spouští pouze web a solver. Žádná databáze ani worker nejsou součástí runtime.

## Vývoj bez Dockeru

Web:

```bash
npm install
SOLVER_URL=http://127.0.0.1:8000 npm run dev
```

Solver v druhém terminálu:

```bash
cd apps/solver
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Struktura repozitáře

```text
apps/
  web/       Next.js UI, IndexedDB úložiště a lokální doménová logika
  solver/    FastAPI a OR-Tools plánovací služba
docs/        Produktová a technická dokumentace
vercel.json  Konfigurace Vercel Services pro web a solver
```

## Nasazení na Vercel

Repozitář obsahuje konfiguraci pro dvě služby v jednom Vercel projektu:

- `web` jako Next.js frontend;
- `solver` jako FastAPI backend pod cestou `/solver`.

Vercel projekt musí používat režim **Services**. Před produkčním použitím musí proběhnout Preview deployment a stejný local-first Playwright scénář proti jeho veřejné URL. CI v GitHub Actions ověřuje databázově nezávislý runtime lokálně, nikoli dostupnost konkrétního Vercel účtu nebo povolení beta funkce Services.

## Automatická verifikace

CI ověřuje:

- formátování, lint a TypeScript;
- webové a doménové jednotkové testy;
- produkční build webu bez databáze;
- solver lint a testy;
- kompletní workflow Excel → IndexedDB → solver → rozvrh → záloha → vymazání → obnova;
- stejnou kritickou browserovou bránu třikrát za sebou bez retry.

## Důležité omezení

Tato varianta není víceuživatelský cloudový systém. Neobsahuje účty, synchronizaci mezi zařízeními ani centrální historii. Přístup k datům určuje přístup k danému počítači a profilu prohlížeče.
