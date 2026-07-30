# Lokální vývoj

## Požadavky

- Docker Desktop nebo Docker Engine s Docker Compose
- volitelně Node.js 22 a Python 3.11 pro běh mimo kontejnery

## První spuštění

```bash
cp .env.example .env
docker compose up --build
```

Po úspěšném startu jsou dostupné:

- web: `http://localhost:3000`
- web health check: `http://localhost:3000/api/health`
- solver OpenAPI: `http://localhost:8000/docs`
- solver health check: `http://localhost:8000/health`
- PostgreSQL: `localhost:5432`

Stack zastavíš pomocí:

```bash
docker compose down
```

Databázový volume odstraníš pouze vědomě:

```bash
docker compose down --volumes
```

## Vývoj webu bez Dockeru

```bash
npm install
npm run db:generate
npm run dev
```

`DATABASE_URL` musí ukazovat na dostupný PostgreSQL server.

## Vývoj solveru bez Dockeru

```bash
cd apps/solver
python -m venv .venv
source .venv/bin/activate
pip install ".[dev]"
uvicorn app.main:app --reload
```

## Verifikační příkazy

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build

cd apps/solver
ruff check .
pytest

cd ../..
docker compose config
docker compose build
```

## Databáze

Prisma schema je v `packages/database/prisma/schema.prisma`.

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

Fáze 1 obsahuje pouze technický model `SystemHealth`. Doménové modely školního roku a rozvrhu patří do Fáze 3 a musí vycházet z `docs/03-data-model.md`.
