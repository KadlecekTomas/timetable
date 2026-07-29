# Datový model

## Zásady

- Všechna data jsou oddělena podle školy a školního roku.
- Importované záznamy mají stabilní interní ID; názvy nejsou primární klíče.
- Historie generování a ručních změn je auditovatelná.
- Tvrdá a měkká pravidla jsou ukládána odděleně.
- Solver pracuje nad neměnným snapshotem vstupních dat.

## Hlavní entity

### School

- `id`
- `name`
- `timezone`
- `createdAt`
- `updatedAt`

### SchoolYear

- `id`
- `schoolId`
- `label`, například `2026/2027`
- `startsOn`
- `endsOn`
- `status`: `DRAFT | ACTIVE | ARCHIVED`
- `periodsPerDayJson`

### Teacher

- `id`
- `schoolYearId`
- `code` — unikátní zkratka v rámci školního roku
- `firstName`
- `lastName`
- `targetWeeklyLoad`
- `minWeeklyLoad` nullable
- `maxWeeklyLoad` nullable
- `isActive`

### Class

- `id`
- `schoolYearId`
- `code`, například `6.A`
- `grade`
- `name`
- `isActive`

### Subject

- `id`
- `schoolYearId`
- `code`
- `name`
- `defaultRoomTypeId` nullable
- `colorToken` nullable

### Room

- `id`
- `schoolYearId`
- `code`
- `name`
- `capacity` nullable
- `roomTypeId` nullable
- `isActive`

### RoomType

- `id`
- `schoolYearId`
- `code`
- `name`

### TeachingAssignment

Centrální vazba popisující, co se musí rozvrhnout.

- `id`
- `schoolYearId`
- `classId`
- `subjectId`
- `teacherId`
- `group`: `WHOLE | GROUP_1 | GROUP_2`
- `weeklyPeriods`
- `lessonShape`: `SINGLE | DOUBLE | MIXED`
- `doublePeriodsCount`
- `requiredRoomId` nullable
- `requiredRoomTypeId` nullable
- `priority`
- `notes` nullable

Invarianty:

- `weeklyPeriods > 0`
- `doublePeriodsCount * 2 <= weeklyPeriods`
- rozpad `MIXED` musí být jednoznačný
- pro dělenou výuku musí existovat kompatibilní dvojice vazeb

### AvailabilityRule

- `id`
- `schoolYearId`
- `entityType`: `TEACHER | CLASS | ROOM`
- `entityId`
- `dayOfWeek`
- `period`
- `kind`: `UNAVAILABLE | PREFERRED | DISCOURAGED`
- `weight` nullable
- `reason` nullable

### FixedLessonRule

- `id`
- `teachingAssignmentId`
- `dayOfWeek`
- `startPeriod`
- `duration`
- `locked`

### DistributionRule

- `id`
- `teachingAssignmentId`
- `type`: `MAX_PER_DAY | MIN_DAY_GAP | SAME_DAY_FORBIDDEN | CONSECUTIVE_REQUIRED`
- `value`
- `hard`
- `weight` nullable

### SolverProfile

- `id`
- `schoolYearId`
- `name`
- `weightsJson`
- `timeLimitSeconds`
- `randomSeed`
- `isDefault`

### GenerationRun

- `id`
- `schoolYearId`
- `solverProfileId`
- `inputSnapshotHash`
- `status`: `QUEUED | RUNNING | FEASIBLE | OPTIMAL | INFEASIBLE | TIME_LIMIT | FAILED | CANCELLED`
- `objectiveValue` nullable
- `qualityScore` nullable
- `startedAt`
- `finishedAt` nullable
- `solverStatsJson`
- `explanationJson`

### TimetableVersion

- `id`
- `schoolYearId`
- `generationRunId` nullable
- `name`
- `versionNumber`
- `source`: `GENERATED | MANUAL_COPY | IMPORTED`
- `isCurrent`
- `createdBy`
- `createdAt`

### ScheduledLesson

- `id`
- `timetableVersionId`
- `teachingAssignmentId`
- `dayOfWeek`
- `startPeriod`
- `duration`
- `roomId` nullable
- `isLocked`
- `origin`: `SOLVER | MANUAL | FIXED_RULE`

### ImportBatch

- `id`
- `schoolYearId`
- `fileName`
- `fileHash`
- `templateVersion`
- `status`: `ANALYZED | VALIDATION_FAILED | READY | APPLIED | FAILED`
- `summaryJson`
- `createdAt`
- `appliedAt` nullable

### ImportIssue

- `id`
- `importBatchId`
- `severity`: `ERROR | WARNING`
- `sheet`
- `row`
- `column`
- `code`
- `message`
- `rawValue` nullable
- `suggestion` nullable

### AuditEvent

- `id`
- `schoolYearId`
- `actorId`
- `action`
- `entityType`
- `entityId`
- `beforeJson` nullable
- `afterJson` nullable
- `createdAt`

## Důležité unikátní klíče

- Teacher: `(schoolYearId, code)`
- Class: `(schoolYearId, code)`
- Subject: `(schoolYearId, code)`
- Room: `(schoolYearId, code)`
- právě jedna `TimetableVersion.isCurrent = true` na školní rok

## Mazání

Používá se primárně soft-delete nebo archivace. Entitu, na kterou odkazuje publikovaná verze rozvrhu, nelze fyzicky smazat bez explicitní migrační operace.

## Snapshot pro solver

Před spuštěním se vytvoří canonical JSON obsahující učitele, třídy, vazby, pravidla, časy, zamčené hodiny a solver profil. Snapshot se hashne. Výsledek generování vždy odkazuje na přesný hash, aby byl běh reprodukovatelný.
