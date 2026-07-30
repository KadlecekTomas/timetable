import { expect, test, type Page } from "@playwright/test";

import {
  analyzeWorkbook,
  applyImport,
  assertNoHardCollisions,
  buildWorkbook,
  createSchoolYear,
  findFreeSlot,
  loadReadiness,
  loadTimetable,
  prepareGeneratedWorkflow,
  prepareReadySchool,
  uniqueToken,
  waitForGenerationRun,
  type GenerationRunView,
  type TimetableLessonView,
} from "./release-gate.helpers";

interface ErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

function watchRuntime(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  return { pageErrors, consoleErrors, serverErrors };
}

function coordinates(lesson: TimetableLessonView) {
  return {
    day: lesson.day,
    period: lesson.period,
    roomId: lesson.room_id,
  };
}

test.describe("Release gate celého workflow", () => {
  test("neplatné založení školního roku je atomicky odmítnuto a aplikace zůstane zdravá", async ({
    request,
  }) => {
    const schoolName = uniqueToken("Neplatný školní rok");
    const invalidResponse = await request.post("/api/school-years", {
      data: {
        schoolName,
        label: "2026/2027",
        startsOn: "2026-09-01T00:00:00.000Z",
        endsOn: "2027-06-30T00:00:00.000Z",
        periodsPerDay: [8, 0, 8, 8, 7],
      },
    });
    expect(invalidResponse.status()).toBe(422);
    const invalidPayload = (await invalidResponse.json()) as ErrorPayload;
    expect(invalidPayload.error?.code).toBe("SCHOOL_YEAR_INVALID");

    const listAfterInvalid = await request.get("/api/school-years");
    expect(listAfterInvalid.ok()).toBeTruthy();
    const afterInvalid = (await listAfterInvalid.json()) as {
      items: Array<{ schoolName: string }>;
    };
    expect(
      afterInvalid.items.some((item) => item.schoolName === schoolName),
    ).toBe(false);

    const validResponse = await request.post("/api/school-years", {
      data: {
        schoolName,
        label: "2026/2027",
        startsOn: "2026-09-01T00:00:00.000Z",
        endsOn: "2027-06-30T00:00:00.000Z",
        periodsPerDay: [8, 8, 8, 8, 7],
      },
    });
    expect(validResponse.status()).toBe(201);

    const duplicateResponse = await request.post("/api/school-years", {
      data: {
        schoolName,
        label: "2026/2027",
        startsOn: "2026-09-01T00:00:00.000Z",
        endsOn: "2027-06-30T00:00:00.000Z",
        periodsPerDay: [8, 8, 8, 8, 7],
      },
    });
    expect(duplicateResponse.status()).toBe(409);
    const duplicatePayload = (await duplicateResponse.json()) as ErrorPayload;
    expect(duplicatePayload.error?.code).toBe("SCHOOL_YEAR_DUPLICATE");

    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();
  });

  test("chybný import nic nezapíše, následná oprava projde a opakování nevytvoří duplicity", async ({
    request,
  }) => {
    const schoolYear = await createSchoolYear(request, "Atomický import");
    const invalidBuffer = await buildWorkbook(
      request,
      schoolYear.id,
      "unknown-teacher",
    );
    const invalid = await analyzeWorkbook(
      request,
      schoolYear.id,
      invalidBuffer,
      "neplatny-import.xlsx",
    );
    expect(invalid.preview.status).toBe("VALIDATION_FAILED");
    expect(
      invalid.preview.issues.some(
        (issue) =>
          issue.severity === "ERROR" && issue.code === "REFERENCE_NOT_FOUND",
      ),
    ).toBe(true);

    const invalidApply = await applyImport(
      request,
      schoolYear.id,
      invalid.preview.importBatchId,
    );
    expect(invalidApply.status()).toBe(422);
    const invalidApplyPayload = (await invalidApply.json()) as ErrorPayload;
    expect(invalidApplyPayload.error?.code).toBe("IMPORT_BATCH_NOT_READY");

    const readinessAfterInvalid = await loadReadiness(request, schoolYear.id);
    expect(readinessAfterInvalid.ready).toBe(false);
    expect(readinessAfterInvalid.summary.teachers).toBe(0);
    expect(readinessAfterInvalid.summary.classes).toBe(0);
    expect(readinessAfterInvalid.summary.subjects).toBe(0);
    expect(readinessAfterInvalid.summary.assignments).toBe(0);

    const validBuffer = await buildWorkbook(request, schoolYear.id, "valid");
    const firstPreview = await analyzeWorkbook(
      request,
      schoolYear.id,
      validBuffer,
      "spravny-import.xlsx",
    );
    expect(firstPreview.preview.status).toBe("READY");
    expect(firstPreview.preview.reused).toBe(false);

    const reusedPreview = await analyzeWorkbook(
      request,
      schoolYear.id,
      validBuffer,
      "spravny-import.xlsx",
    );
    expect(reusedPreview.preview.reused).toBe(true);
    expect(reusedPreview.preview.importBatchId).toBe(
      firstPreview.preview.importBatchId,
    );

    const firstApply = await applyImport(
      request,
      schoolYear.id,
      firstPreview.preview.importBatchId,
    );
    expect(firstApply.ok()).toBeTruthy();
    const firstApplyPayload = (await firstApply.json()) as {
      status: string;
      schoolYearVersion: number;
    };
    expect(firstApplyPayload.status).toBe("APPLIED");
    expect(firstApplyPayload.schoolYearVersion).toBe(2);

    const idempotentApply = await applyImport(
      request,
      schoolYear.id,
      firstPreview.preview.importBatchId,
    );
    expect(idempotentApply.ok()).toBeTruthy();
    expect(((await idempotentApply.json()) as { status: string }).status).toBe(
      "APPLIED",
    );

    const secondPreview = await analyzeWorkbook(
      request,
      schoolYear.id,
      validBuffer,
      "spravny-import.xlsx",
    );
    expect(secondPreview.preview.status).toBe("READY");
    expect(secondPreview.preview.importBatchId).not.toBe(
      firstPreview.preview.importBatchId,
    );
    const secondApply = await applyImport(
      request,
      schoolYear.id,
      secondPreview.preview.importBatchId,
    );
    expect(secondApply.ok()).toBeTruthy();

    const readiness = await loadReadiness(request, schoolYear.id);
    expect(readiness.ready).toBe(true);
    expect(readiness.summary).toMatchObject({
      teachers: 2,
      classes: 1,
      subjects: 2,
      rooms: 2,
      assignments: 2,
      weekly_periods: 4,
    });

    const schoolYears = await request.get("/api/school-years");
    const schoolYearList = (await schoolYears.json()) as {
      items: Array<{ id: string; version: number }>;
    };
    expect(
      schoolYearList.items.find((item) => item.id === schoolYear.id)?.version,
    ).toBe(3);
  });

  test("generování zvládne odmítnutí, vytvoří validní návrh a všechny služby zůstanou dostupné", async ({
    request,
  }) => {
    const unreadySchoolYear = await createSchoolYear(
      request,
      "Nepřipravený běh",
    );
    const unreadyResponse = await request.post(
      `/api/school-years/${unreadySchoolYear.id}/generation-runs`,
      { data: { timeLimitSeconds: 30 } },
    );
    expect(unreadyResponse.status()).toBe(422);
    expect(((await unreadyResponse.json()) as ErrorPayload).error?.code).toBe(
      "SCHOOL_YEAR_NOT_READY",
    );

    const workflow = await prepareGeneratedWorkflow(
      request,
      "Validní generování",
    );

    const invalidRequest = await request.post(
      `/api/school-years/${workflow.schoolYear.id}/generation-runs`,
      { data: { timeLimitSeconds: 0 } },
    );
    expect(invalidRequest.status()).toBe(422);
    expect(((await invalidRequest.json()) as ErrorPayload).error?.code).toBe(
      "GENERATION_REQUEST_INVALID",
    );

    expect(workflow.timetable.lessons).toHaveLength(4);
    expect(workflow.timetable.version.qualityScore).not.toBeNull();
    assertNoHardCollisions(workflow.timetable);

    const scoreBreakdown = workflow.timetable.version.scoreBreakdown;
    expect(scoreBreakdown).not.toBeNull();
    expect(
      Object.values(scoreBreakdown!).reduce((sum, value) => sum + value, 0),
    ).toBe(workflow.timetable.version.qualityScore);

    const cancelFinished = await request.delete(
      `/api/generation-runs/${workflow.generationRun.id}`,
    );
    expect(cancelFinished.status()).toBe(409);
    expect(((await cancelFinished.json()) as ErrorPayload).error?.code).toBe(
      "GENERATION_RUN_NOT_CANCELLABLE",
    );

    const missingRun = await request.get(
      "/api/generation-runs/neexistujici-beh-release-gate",
    );
    expect(missingRun.status()).toBe(404);

    const [webHealth, solverHealth] = await Promise.all([
      request.get("/api/health"),
      request.get("http://127.0.0.1:8000/health"),
    ]);
    expect(webHealth.ok()).toBeTruthy();
    expect(solverHealth.ok()).toBeTruthy();
  });

  test("editor odmítne kolize i zastaralé zápisy, zachová data a bezpečně provede přesun, vrácení i přijetí", async ({
    request,
  }) => {
    const workflow = await prepareGeneratedWorkflow(request, "Editor rozvrhu");
    const initial = workflow.timetable;
    const [moving, occupied] = [...initial.lessons].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    expect(moving).toBeDefined();
    expect(occupied).toBeDefined();
    const originalCoordinates = coordinates(moving!);

    const conflictingMove = {
      lessonId: moving!.id,
      targetDay: occupied!.day,
      targetPeriod: occupied!.period,
      targetRoomId: moving!.room_id,
      expectedRevision: initial.version.revision,
    };
    const previewConflict = await request.post(
      `/api/timetable-versions/${workflow.versionId}/moves/validate`,
      { data: conflictingMove },
    );
    expect(previewConflict.ok()).toBeTruthy();
    const previewConflictPayload = (await previewConflict.json()) as {
      valid: boolean;
      issues: Array<{ code: string }>;
    };
    expect(previewConflictPayload.valid).toBe(false);
    expect(
      previewConflictPayload.issues.some((issue) =>
        ["CLASS_COLLISION", "TEACHER_COLLISION", "ROOM_COLLISION"].includes(
          issue.code,
        ),
      ),
    ).toBe(true);

    const applyConflict = await request.post(
      `/api/timetable-versions/${workflow.versionId}/moves`,
      { data: conflictingMove },
    );
    expect(applyConflict.status()).toBe(422);
    expect(((await applyConflict.json()) as ErrorPayload).error?.code).toBe(
      "TIMETABLE_MOVE_CONFLICT",
    );

    const unchangedAfterConflict = await loadTimetable(
      request,
      workflow.versionId,
    );
    expect(unchangedAfterConflict.version.revision).toBe(
      initial.version.revision,
    );
    expect(
      coordinates(
        unchangedAfterConflict.lessons.find(
          (lesson) => lesson.id === moving!.id,
        )!,
      ),
    ).toEqual(originalCoordinates);

    const lockResponse = await request.post(
      `/api/timetable-versions/${workflow.versionId}/locks`,
      {
        data: {
          lessonIds: [moving!.id],
          expectedRevision: initial.version.revision,
        },
      },
    );
    expect(lockResponse.ok()).toBeTruthy();
    const lockResult = (await lockResponse.json()) as { revision: number };
    expect(lockResult.revision).toBe(initial.version.revision + 1);

    const staleLock = await request.post(
      `/api/timetable-versions/${workflow.versionId}/locks`,
      {
        data: {
          lessonIds: [occupied!.id],
          expectedRevision: initial.version.revision,
        },
      },
    );
    expect(staleLock.status()).toBe(409);
    expect(((await staleLock.json()) as ErrorPayload).error?.code).toBe(
      "TIMETABLE_VERSION_CONFLICT",
    );

    const lockedState = await loadTimetable(request, workflow.versionId);
    expect(
      lockedState.lessons.find((lesson) => lesson.id === moving!.id)?.locked,
    ).toBe(true);
    const lockedMove = await request.post(
      `/api/timetable-versions/${workflow.versionId}/moves/validate`,
      {
        data: {
          lessonId: moving!.id,
          targetDay: 4,
          targetPeriod: 6,
          targetRoomId: moving!.room_id,
          expectedRevision: lockedState.version.revision,
        },
      },
    );
    expect(lockedMove.ok()).toBeTruthy();
    const lockedMovePayload = (await lockedMove.json()) as {
      valid: boolean;
      issues: Array<{ code: string }>;
    };
    expect(lockedMovePayload.valid).toBe(false);
    expect(
      lockedMovePayload.issues.some((item) => item.code === "LESSON_LOCKED"),
    ).toBe(true);

    const unlockResponse = await request.delete(
      `/api/timetable-versions/${workflow.versionId}/locks`,
      {
        data: {
          lessonIds: [moving!.id],
          expectedRevision: lockedState.version.revision,
        },
      },
    );
    expect(unlockResponse.ok()).toBeTruthy();
    const unlockResult = (await unlockResponse.json()) as { revision: number };
    expect(unlockResult.revision).toBe(lockedState.version.revision + 1);

    const unlockedState = await loadTimetable(request, workflow.versionId);
    const target = findFreeSlot(unlockedState, moving!);
    const validMove = {
      lessonId: moving!.id,
      targetDay: target.day,
      targetPeriod: target.period,
      targetRoomId: moving!.room_id,
      expectedRevision: unlockedState.version.revision,
    };
    const moveResponse = await request.post(
      `/api/timetable-versions/${workflow.versionId}/moves`,
      { data: validMove },
    );
    expect(moveResponse.ok()).toBeTruthy();
    const moveResult = (await moveResponse.json()) as {
      revision: number;
      qualityScore: number;
    };
    expect(moveResult.revision).toBe(unlockedState.version.revision + 1);

    const staleMove = await request.post(
      `/api/timetable-versions/${workflow.versionId}/moves`,
      { data: validMove },
    );
    expect(staleMove.status()).toBe(409);
    expect(((await staleMove.json()) as ErrorPayload).error?.code).toBe(
      "TIMETABLE_VERSION_CONFLICT",
    );

    const movedState = await loadTimetable(request, workflow.versionId);
    expect(
      coordinates(
        movedState.lessons.find((lesson) => lesson.id === moving!.id)!,
      ),
    ).toEqual({
      day: target.day,
      period: target.period,
      roomId: moving!.room_id,
    });
    assertNoHardCollisions(movedState);

    const undoResponse = await request.post(
      `/api/timetable-versions/${workflow.versionId}/undo`,
      { data: { expectedRevision: movedState.version.revision } },
    );
    expect(undoResponse.ok()).toBeTruthy();
    const undoResult = (await undoResponse.json()) as { revision: number };
    expect(undoResult.revision).toBe(movedState.version.revision + 1);

    const restoredState = await loadTimetable(request, workflow.versionId);
    expect(
      coordinates(
        restoredState.lessons.find((lesson) => lesson.id === moving!.id)!,
      ),
    ).toEqual(originalCoordinates);
    assertNoHardCollisions(restoredState);

    const staleAccept = await request.post(
      `/api/timetable-versions/${workflow.versionId}/accept`,
      { data: { expectedRevision: movedState.version.revision } },
    );
    expect(staleAccept.status()).toBe(409);
    expect(((await staleAccept.json()) as ErrorPayload).error?.code).toBe(
      "TIMETABLE_VERSION_CONFLICT",
    );

    const acceptResponse = await request.post(
      `/api/timetable-versions/${workflow.versionId}/accept`,
      { data: { expectedRevision: restoredState.version.revision } },
    );
    expect(acceptResponse.ok()).toBeTruthy();
    expect(
      ((await acceptResponse.json()) as { isCurrent: boolean }).isCurrent,
    ).toBe(true);
    expect(
      (await loadTimetable(request, workflow.versionId)).version.isCurrent,
    ).toBe(true);
  });

  test("hromadné zrušení běhů nenechá žádný job viset a zrušené běhy nevytvoří kandidáta", async ({
    request,
  }) => {
    const ready = await prepareReadySchool(request, "Zrušení běhů");
    const startResponses = await Promise.all(
      Array.from({ length: 6 }, () =>
        request.post(
          `/api/school-years/${ready.schoolYear.id}/generation-runs`,
          { data: { timeLimitSeconds: 30 } },
        ),
      ),
    );
    startResponses.forEach((response) => expect(response.status()).toBe(202));
    const starts = await Promise.all(
      startResponses.map(
        async (response) =>
          (await response.json()) as { generationRunId: string },
      ),
    );

    const cancellationResponses = await Promise.all(
      starts.map((item) =>
        request.delete(`/api/generation-runs/${item.generationRunId}`),
      ),
    );
    const cancelledRunIds = starts
      .filter((_item, index) => cancellationResponses[index]!.ok())
      .map((item) => item.generationRunId);
    expect(cancelledRunIds.length).toBeGreaterThan(0);

    const terminalRuns = await Promise.all(
      starts.map((item) => waitForGenerationRun(request, item.generationRunId)),
    );
    expect(
      terminalRuns.some(
        (run) => run.status === "QUEUED" || run.status === "RUNNING",
      ),
    ).toBe(false);

    for (const run of terminalRuns.filter((item) =>
      cancelledRunIds.includes(item.id),
    )) {
      expect(run.status).toBe("CANCELLED");
      expect(run.candidateVersion).toBeNull();
    }
  });

  test("celá uživatelská cesta proběhne bez page erroru, konzolové chyby nebo HTTP 500", async ({
    page,
    request,
  }) => {
    const runtime = watchRuntime(page);
    const workflow = await prepareGeneratedWorkflow(
      request,
      "Browser stabilita",
    );
    const context = `schoolYearId=${encodeURIComponent(workflow.schoolYear.id)}`;

    await page.goto(`/?${context}`);
    await expect(
      page.getByRole("heading", { name: "Připravenost školního roku" }),
    ).toBeVisible();
    await expect(page.getByText("Rozvrh lze vytvořit")).toBeVisible();

    await page.goto(`/data?${context}`);
    await expect(
      page.getByRole("heading", { name: "Školní data" }),
    ).toBeVisible();
    await expect(page.getByText("2 záznamů", { exact: true })).toBeVisible();

    await page.goto(`/generate?${context}`);
    await expect(
      page.getByRole("heading", { name: "Kontrola připravenosti prošla" }),
    ).toBeVisible();
    await expect(
      page.getByText(/^(Proveditelný návrh|Optimální návrh)$/),
    ).toBeVisible();

    await page.goto(
      `/timetable?${context}&versionId=${encodeURIComponent(workflow.versionId)}`,
    );
    await expect(
      page.getByRole("heading", { name: "Kvalita návrhu" }),
    ).toBeVisible();
    const lessonButton = page
      .getByRole("button", { name: /M\s+NOV\s+101/ })
      .first();
    await lessonButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    const closeButton = page.getByRole("button", { name: "Zavřít" });
    await closeButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByRole("button", { name: "Učitelé" }).click();
    await expect(page.getByLabel("Učitel")).toBeVisible();

    expect(runtime.pageErrors).toEqual([]);
    expect(runtime.consoleErrors).toEqual([]);
    expect(runtime.serverErrors).toEqual([]);
  });
});
