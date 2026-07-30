import { expect, test, type APIRequestContext } from "@playwright/test";
import ExcelJS, { type Worksheet } from "exceljs";

interface LessonView {
  id: string;
  day: number;
  period: number;
  duration: number;
  room_id: string | null;
  locked: boolean;
}

interface TimetablePayload {
  version: {
    revision: number;
    qualityScore: number | null;
  };
  periodsPerDay: number[];
  lessons: LessonView[];
}

function writeRow(worksheet: Worksheet, values: Array<string | number>) {
  values.forEach((value, index) => {
    worksheet.getCell(2, index + 1).value = value;
  });
}

async function loadTimetable(
  request: APIRequestContext,
  versionId: string,
): Promise<TimetablePayload> {
  const response = await request.get(
    `/api/timetable-versions/${versionId}?view=class`,
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as TimetablePayload;
}

function inGridOrder(lessons: LessonView[]) {
  return [...lessons].sort(
    (left, right) =>
      left.period - right.period ||
      left.day - right.day ||
      left.id.localeCompare(right.id),
  );
}

function findLateFreeSlot(payload: TimetablePayload, moving: LessonView) {
  for (let day = payload.periodsPerDay.length - 1; day >= 0; day -= 1) {
    const latestStart = payload.periodsPerDay[day]! - moving.duration;
    for (let period = latestStart; period >= 0; period -= 1) {
      if (day === moving.day && period === moving.period) continue;
      const overlaps = payload.lessons.some((lesson) => {
        if (lesson.id === moving.id || lesson.day !== day) return false;
        return (
          period < lesson.period + lesson.duration &&
          lesson.period < period + moving.duration
        );
      });
      if (!overlaps) return { day, period };
    }
  }
  throw new Error("E2E dataset nemá volný cílový slot.");
}

test("Excel import → solver → lock → validated move → score → undo", async ({
  page,
  request,
}) => {
  const schoolYearResponse = await request.post("/api/school-years", {
    data: {
      schoolName: `E2E škola ${Date.now()}`,
      label: "2026/2027",
      startsOn: "2026-09-01T00:00:00.000Z",
      endsOn: "2027-06-30T00:00:00.000Z",
      periodsPerDay: [8, 8, 8, 8, 7],
    },
  });
  expect(schoolYearResponse.status()).toBe(201);
  const schoolYear = (await schoolYearResponse.json()) as { id: string };

  const templateResponse = await request.get(
    `/api/school-years/${schoolYear.id}/import-template`,
  );
  expect(templateResponse.ok()).toBeTruthy();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await templateResponse.body()) as never);
  writeRow(workbook.getWorksheet("Nastavení")!, [
    "2026/2027",
    8,
    8,
    8,
    8,
    7,
  ]);
  writeRow(workbook.getWorksheet("Učitelé")!, [
    "NOV",
    "Jan",
    "Novák",
    2,
    2,
    2,
    "M",
    "6A",
  ]);
  writeRow(workbook.getWorksheet("Třídy")!, ["6A", 6, "6.A"]);
  writeRow(workbook.getWorksheet("Předměty")!, ["M", "Matematika", ""]);
  writeRow(workbook.getWorksheet("Učebny")!, [
    "101",
    "Učebna 101",
    "GENERAL",
    30,
  ]);
  writeRow(workbook.getWorksheet("Výukové_vazby")!, [
    "6A-M-NOV",
    "6A",
    "M",
    "NOV",
    "WHOLE",
    2,
    "SINGLE",
    0,
    "101",
    "",
    1,
    1,
  ]);
  const workbookBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

  await page.goto(`/import?schoolYearId=${schoolYear.id}`);
  await page.locator("#import-file").setInputFiles({
    name: "e2e-school-data.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: workbookBuffer,
  });
  await page.getByRole("button", { name: "Analyzovat soubor" }).click();
  await expect(
    page.getByRole("heading", { name: "Náhled je připraven k potvrzení" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Potvrdit změny atomicky" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Import byl atomicky potvrzen" }),
  ).toBeVisible();

  await page.goto(`/generate?schoolYearId=${schoolYear.id}`);
  await expect(
    page.getByRole("heading", { name: "Předletová kontrola prošla" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vytvořit nový návrh" }).click();
  await expect(page.getByText(/^(FEASIBLE|OPTIMAL)$/)).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole("link", { name: "Otevřít návrh" }).click();
  await expect(
    page.getByRole("heading", { name: "Kvalita návrhu" }),
  ).toBeVisible();

  const versionId = new URL(page.url()).searchParams.get("versionId");
  expect(versionId).toBeTruthy();
  const initial = await loadTimetable(request, versionId!);
  expect(initial.lessons).toHaveLength(2);
  expect(initial.version.qualityScore).not.toBeNull();

  const ordered = inGridOrder(initial.lessons);
  const lockLesson = ordered[0]!;
  const moveLesson = ordered[1]!;
  const lockIndex = ordered.findIndex((lesson) => lesson.id === lockLesson.id);
  const moveIndex = ordered.findIndex((lesson) => lesson.id === moveLesson.id);
  const lessonButtons = page.getByRole("button", { name: /M\s+NOV\s+101/ });
  await expect(lessonButtons).toHaveCount(2);

  await lessonButtons.nth(lockIndex).click();
  await page.getByRole("button", { name: "Zamknout" }).click();
  await expect(
    page.getByText(`Revision ${initial.version.revision + 1}`, { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zavřít" }).click();
  await expect(lessonButtons.nth(lockIndex).getByLabel("Zamčeno")).toBeVisible();

  const afterLock = await loadTimetable(request, versionId!);
  const lockedAfterSave = afterLock.lessons.find(
    (lesson) => lesson.id === lockLesson.id,
  );
  expect(lockedAfterSave?.locked).toBe(true);
  const target = findLateFreeSlot(afterLock, moveLesson);

  await lessonButtons.nth(moveIndex).click();
  await page.getByLabel("Den").selectOption(String(target.day));
  await page.getByLabel("Hodina").selectOption(String(target.period));
  const moveResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/timetable-versions/${versionId}/moves`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Ověřit a přesunout" }).click();
  const moveResponse = await moveResponsePromise;
  expect(moveResponse.ok()).toBeTruthy();
  const moveResult = (await moveResponse.json()) as {
    revision: number;
    qualityScore: number;
  };
  expect(moveResult.revision).toBe(initial.version.revision + 2);
  expect(typeof moveResult.qualityScore).toBe("number");
  await expect(page.getByRole("dialog")).toBeHidden();

  const afterMove = await loadTimetable(request, versionId!);
  const moved = afterMove.lessons.find(
    (lesson) => lesson.id === moveLesson.id,
  )!;
  expect({ day: moved.day, period: moved.period }).toEqual(target);
  expect(afterMove.version.qualityScore).toBe(moveResult.qualityScore);

  const undoResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/timetable-versions/${versionId}/undo`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Undo" }).click();
  const undoResponse = await undoResponsePromise;
  expect(undoResponse.ok()).toBeTruthy();
  const undoResult = (await undoResponse.json()) as {
    revision: number;
    qualityScore: number;
  };
  expect(undoResult.revision).toBe(initial.version.revision + 3);

  const afterUndo = await loadTimetable(request, versionId!);
  const restored = afterUndo.lessons.find(
    (lesson) => lesson.id === moveLesson.id,
  )!;
  expect({ day: restored.day, period: restored.period }).toEqual({
    day: moveLesson.day,
    period: moveLesson.period,
  });
  expect(afterUndo.version.qualityScore).toBe(undoResult.qualityScore);
  const lockedAfterUndo = afterUndo.lessons.find(
    (lesson) => lesson.id === lockLesson.id,
  );
  expect(lockedAfterUndo?.locked).toBe(true);
});
