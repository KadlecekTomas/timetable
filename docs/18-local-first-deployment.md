# Local-first nasazení a provoz

## Produkční topologie

Aplikace nemá serverovou databázi ani permanentní worker.

```text
prohlížeč vedení školy
├── IndexedDB: projekt, importy, rozvrhy, zámky a undo
├── Web Crypto: kontrolní součet záloh
└── HTTPS
    ├── Next.js web
    └── FastAPI / OR-Tools solver pod cestou /solver
```

Solver zpracuje pouze aktuální požadavek a vrátí výsledek. Projekt trvale neukládá.

## Vercel

Repozitář obsahuje `vercel.json` pro dvě služby:

- `web` z `apps/web`,
- `solver` z `apps/solver`.

Solver je veřejně dostupný pouze přes top-level rewrite `/solver/:path*`. Next.js používá stejnou origin cestu, takže v prohlížeči není potřeba CORS ani veřejná adresa druhé služby.

Vercel Services jsou samostatná funkce platformy. Před importem repozitáře je nutné ověřit, že účet má přístup k Services a že framework projektu je nastaven na Services.

## Povinný Preview postup

1. Nasadit větev jako Vercel Preview.
2. Ověřit `GET /api/health`.
3. Ověřit `GET /solver/health`.
4. V čistém profilu prohlížeče vytvořit lokální projekt.
5. Stáhnout Excel šablonu.
6. Provést validní import.
7. Vytvořit návrh rozvrhu.
8. Stáhnout zálohu.
9. Vymazat lokální projekt.
10. Obnovit projekt ze zálohy.
11. Znovu otevřít obnovený rozvrh.
12. Zkontrolovat konzoli prohlížeče a Vercel Function logy.

Produkční doménu je možné doporučit až po úspěšném Preview průchodu.

## Důležitá vlastnost originu

IndexedDB je izolovaná podle originu. Následující adresy mají oddělená data:

- každá Vercel Preview URL,
- produkční `*.vercel.app` URL,
- vlastní doména,
- `localhost`.

Před přechodem na jinou doménu je proto povinné:

1. na staré doméně stáhnout zálohu,
2. otevřít novou doménu,
3. obnovit zálohu,
4. ověřit rozvrh,
5. teprve potom starou doménu přestat používat.

## Provozní zálohování

Doporučený minimální režim:

- stáhnout zálohu po každém importu,
- stáhnout zálohu po každém přijatém návrhu,
- stáhnout zálohu před změnou domény nebo prohlížeče,
- uložit zálohu do školního Google Disku,
- ponechat alespoň tři poslední datované kopie.

Název souboru obsahuje školu a školní rok. Obsah zahrnuje také SHA-256 kontrolní součet; aplikace odmítne poškozenou nebo ručně změněnou zálohu.

## Obnova po havárii

1. Otevřít aplikaci ve podporovaném prohlížeči.
2. Přejít do Nastavení.
3. Zvolit **Obnovit projekt ze zálohy**.
4. Vybrat poslední ověřený soubor.
5. Otevřít Přehled a zkontrolovat počty dat.
6. Otevřít Rozvrh a ověřit poslední přijatou verzi.
7. Ihned stáhnout novou kontrolní zálohu.

## Bezpečnost

Data školy jsou dostupná každému, kdo má přístup k danému profilu prohlížeče nebo k záložnímu souboru. Provozní počítač proto musí mít:

- přihlášení do operačního systému,
- automatické zamykání obrazovky,
- šifrovaný disk,
- aktualizovaný prohlížeč,
- řízený přístup ke složce se zálohami.

Local-first režim nenahrazuje autentizaci víceuživatelské cloudové aplikace. Je určen pro jeden řízený pracovní počítač vedení školy.

## Návrat k Dockeru

Pro lokální nebo školní server:

```bash
docker compose up --build
```

Stack spustí pouze:

- `solver` na portu 8000,
- `web` na portu 3000.

PostgreSQL, Prisma ani worker nejsou součástí provozu.
