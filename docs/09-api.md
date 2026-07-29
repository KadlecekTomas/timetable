# API kontrakt

## Zásady

- API je interní pro webovou aplikaci, ale kontrakty jsou verzované a testované.
- Vstupy i výstupy jsou validovány.
- Chyby mají stabilní kód, lidskou zprávu a volitelná strukturovaná metadata.
- Každý endpoint ověřuje school scope a oprávnění.
- Dlouhé operace vracejí job, nikoli otevřený HTTP požadavek.

## Formát chyb

```json
{
  "error": {
    "code": "TEACHER_CODE_DUPLICATE",
    "message": "Učitel se zkratkou NOV již existuje.",
    "fieldErrors": {
      "code": ["Zvolte jinou zkratku."]
    },
    "details": {}
  },
  "requestId": "..."
}
```

HTTP status odpovídá významu:

- `400` neplatný požadavek,
- `401` nepřihlášen,
- `403` nedostatečné oprávnění,
- `404` entita není dostupná v aktuálním scope,
- `409` konflikt verze nebo stavu,
- `422` doménově neplatná data,
- `429` limit,
- `500` neočekávaná chyba.

## Školní rok

- `GET /api/school-years`
- `POST /api/school-years`
- `GET /api/school-years/:id`
- `PATCH /api/school-years/:id`
- `POST /api/school-years/:id/archive`
- `GET /api/school-years/:id/readiness`

`readiness` vrací blokující chyby, varování a souhrny úvazků.

## Základní entity

Pro učitele, třídy, předměty, učebny a výukové vazby:

- `GET /api/school-years/:id/<resource>`
- `POST /api/school-years/:id/<resource>`
- `GET /api/school-years/:id/<resource>/:resourceId`
- `PATCH /api/school-years/:id/<resource>/:resourceId`
- `DELETE /api/school-years/:id/<resource>/:resourceId`

Seznam podporuje `query`, `sort`, `order`, `page`, `pageSize` a relevantní filtry. Výchozí a maximální velikost stránky jsou centrálně definované.

## Import

### Stažení šablony

`GET /api/school-years/:id/import-template`

Vrací `.xlsx` s aktuální podporovanou verzí.

### Analýza

`POST /api/school-years/:id/imports`

Multipart upload. Výstup:

```json
{
  "importBatchId": "...",
  "status": "READY",
  "summary": {},
  "issues": []
}
```

Při větších souborech může endpoint vrátit asynchronní job.

### Detail

`GET /api/school-years/:id/imports/:batchId`

### Potvrzení

`POST /api/school-years/:id/imports/:batchId/apply`

Vyžaduje očekávaný `schoolYearVersion` nebo ekvivalentní concurrency token. Nelze aplikovat batch s chybami nebo nad změněným cílovým stavem bez nové analýzy.

### Export chyb

`GET /api/school-years/:id/imports/:batchId/issues.xlsx`

## Generování

### Spuštění

`POST /api/school-years/:id/generation-runs`

```json
{
  "solverProfileId": "...",
  "baseTimetableVersionId": null,
  "mode": "BEST_QUALITY",
  "timeLimitSeconds": 180
}
```

Server limituje povolený rozsah a vytváří snapshot.

### Stav

`GET /api/school-years/:id/generation-runs/:runId`

Vrací stav, časy, solver statistiky, případnou diagnostiku a kandidátní verzi.

### Zrušení

`POST /api/school-years/:id/generation-runs/:runId/cancel`

Zrušení je idempotentní.

## Rozvrhové verze

- `GET /api/school-years/:id/timetables`
- `GET /api/school-years/:id/timetables/:versionId`
- `POST /api/school-years/:id/timetables/:versionId/accept`
- `POST /api/school-years/:id/timetables/:versionId/clone`
- `GET /api/school-years/:id/timetables/compare?left=&right=`

Přijetí verze používá transakci a concurrency token.

## Ruční změny

### Validace přesunu

`POST /api/school-years/:id/timetables/:versionId/moves/validate`

### Provedení přesunu

`POST /api/school-years/:id/timetables/:versionId/moves`

```json
{
  "scheduledLessonId": "...",
  "targetDay": "TUE",
  "targetStartPeriod": 3,
  "targetRoomId": "...",
  "expectedVersion": 12
}
```

Server znovu provede stejnou validaci; výsledek předchozího validačního volání není autorizace k zápisu.

### Zamčení

- `POST /api/school-years/:id/timetables/:versionId/locks`
- `DELETE /api/school-years/:id/timetables/:versionId/locks`

Hromadné operace mají explicitní seznam ID nebo přesně definovaný filtr.

## Scoring

- `GET /api/school-years/:id/timetables/:versionId/score`
- `POST /api/school-years/:id/timetables/:versionId/recalculate-score`

Přepočet používá konkrétní verzi scoring profilu a ukládá ji do výsledku.

## Export

- `POST /api/school-years/:id/exports`
- `GET /api/school-years/:id/exports/:exportId`
- `GET /api/school-years/:id/exports/:exportId/download`

Formáty MVP:

- `.xlsx`
- tiskové PDF lze přidat po potvrzení rozsahu implementace
- JSON snapshot pro diagnostiku pouze administrátorovi

## Idempotence

Operace generování, potvrzení importu a exportu mohou přijmout `Idempotency-Key`. Server nesmí při opakovaném stejném požadavku vytvořit duplicitní běh nebo export.

## Contract testing

- OpenAPI nebo odvozené schéma je generováno z validačních kontraktů,
- CI ověřuje breaking changes,
- solver request/response používá explicitní `contractVersion`,
- fixture snapshoty testují kompatibilitu TypeScript a Python modelů.
