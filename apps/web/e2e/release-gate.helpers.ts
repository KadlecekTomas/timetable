import { expect, type APIRequestContext } from "@playwright/test";
import ExcelJS, { type Worksheet } from "exceljs";

export interface SchoolYearView {
  id: string;
  schoolName?: string;
  label?: string;
  version?: number;
}

export interface ReadinessView {
  ready: boolean;
  blockers: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
  summary: {
    teachers: number;
    classes: number;
    subjects: number;
    rooms: number;
    assignments: number;
    weekly_periods: number;
  };
}

export interface ImportPreviewView {
  importBatchId: string;
  status: "READY" | "VALIDATION_FAILED" | "APPLIED";
  summary: Record<string, number>;
  issues: Array<{
    severity: "ERROR" | "WARNING";
    code: string;
    sheet: string;
    row: number | null;
    column: string | null;
    message: string;
  }>;
  reused: boolean;
}

export interface GenerationRunView {
  id: string;
  schoolYearId: string;
  status:
    | "QUEUED"
    | "RUNNING"
    | "FEASIBLE"
    | "OPTIMAL"
    | "INFEASIBLE"
    | "FAILED"
    | "CANCELLED";
  inputSnapshotHash: string;
  qualityScore: number | null;
  explanation: unknown;
  candidateVersion: { id: string; qualityScore: number | null } | null;
}

export interface TimetableLessonView {
  id: string;
  block_id: string;
  assignment_id: string;
  teacher_id: string;
  class_id: string;
  subject_id: string;
  group: "WHOLE" | "GROUP_1" | "GROUP_2";
  room_id: string | null;
  day: number;
  period: number;
  duration: number;
  locked: boolean;
  manually_changed?: boolean;
  origin: string;
}

export interface TimetableView {
  version: {
    id: string;
    revision: number;
    isCurrent: boolean;
    qualityScore: number | null;
    scoreBreakdown: Record<string, number> | null;
  };
  periodsPerDay: number[];
  lessons: TimetableLessonView[];
}

export interface ReadyWorkflow {
  schoolYear: SchoolYearView;
  workbookBuffer: Buffer;
  importBatchId: string;
}

export interface GeneratedWorkflow extends ReadyWorkflow {
  generationRun: GenerationRunView;
  versionId: string;
  timetable: TimetableView;
}

export type WorkbookVariant =
  | "valid"
  | "unknown-teacher"
  | "broken-double"
  | "wrong-school-year";

const terminalRunStates = new Set<GenerationRunView["status"]>([
  "FEASIBLE",
  "OPTIMAL",
  "INFEASIBLE",
  "FAILED",
  "CANCELLED",
]);

export function uniqueToken(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function writeRows(worksheet: Worksheet, rows: Array<Array<string | number>>) {
  rows.forEach((values, rowIndex) => {
    values.forEach((value, columnIndex) => {
      worksheet.getCell(rowIndex + 2, columnIndex + 1).value = value;
    });
  });
}

export async function createSchoolYear(
  request: APIRequestContext,
  prefix: string,
): Promise<SchoolYearView> {
  const response = await request.post("/api/school-years", {
    data: {
      schoolName: uniqueToken(prefix),
      label: "2026/2027",
      startsOn: "2026-09-01T00:00:00.000Z",
      endsOn: "2027-06-30T00:00:00.000Z",
      periodsPerDay: [8, 8, 8, 8, 7],
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as SchoolYearView;
}

export async function buildWorkbook(
  request: APIRequestContext,
  schoolYearId: string,
  variant: WorkbookVariant = "valid",
): Promise<Buffer> {
  const templateResponse = await request.get(
    `/api/school-years/${schoolYearId}/import-template`,
  );
  expect(templateResponse.ok()).toBeTruthy();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await templateResponse.body()) as never);

  writeRows(workbook.getWorksheet("Nastavení")!, [
    [variant === "wrong-school-year" ? "2025/2026" : "2026/2027", 8, 8, 8, 8, 7],
  ]);
  writeRows(workbook.getWorksheet("Učitelé")!, [
    ["NOV", "Jan", "Novák", 2, 2, 2, "M", "6A"],
    ["SVO", "Petra", "Svobodová", 2, 2, 2, "CJ", "6A"],
  ]);
  writeRows(workbook.getWorksheet("Třídy")!, [["6A", 6, "6.A"]]);
  writeRows(workbook.getWorksheet("Předměty")!, [
    ["M", "Matematika", ""],
    ["CJ", "Český jazyk", ""],
  ]);
  writeRows(workbook.getWorksheet("Učebny")!, [
    ["101", "Učebna 101", "GENERAL", 30],
    ["102", "Učebna 102", "GENERAL", 30],
  ]);

  const firstTeacher = variant === "unknown-teacher" ? "NEEXISTUJE" : "NOV";
  const firstWeeklyPeriods = variant === "broken-double" ? 1 : 2;
  const firstShape = variant === "broken-double" ? "MIXED" : "SINGLE";
  const firstDoubleCount = variant === "broken-double" ? 1 : 0;
  writeRows(workbook.getWorksheet("Výukové_vazby")!, [
    [
      "6A-M-NOV",
      "6A",
      "M",
      firstTeacher,
      "WHOLE",
      firstWeeklyPeriods,
      firstShape,
      firstDoubleCount,
      "101",
      "",
      1,
      1,
    ],
    [
      "6A-CJ-SVO",
      "6A",
      "CJ",
      "SVO",
      "WHOLE",
      2,
      "SINGLE",
      0,
      "102",
      "",
      1,
      1,
    ],
  ]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function analyzeWorkbook(
  request: APIRequestContext,
  schoolYearId: string,
  buffer: Buffer,
  fileName = "release-gate.xlsx",
): Promise<{ status: number; preview: ImportPreviewView }> {
  const response = await request.post(
    `/api/school-years/${schoolYearId}/imports`,
    {
      multipart: {
        file: {
          name: fileName,
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer,
        },
      },
    },
  );
  expect([200, 201]).toContain(response.status());
  return {
    status: response.status(),
    preview: (await response.json()) as ImportPreviewView,
  };
}

export async function applyImport(
  request: APIRequestContext,
  schoolYearId: string,
  batchId: string,
) {
  return request.post(
    `/api/school-years/${schoolYearId}/imports/${batchId}/apply`,
  );
}

export async function loadReadiness(
  request: APIRequestContext,
  schoolYearId: string,
): Promise<ReadinessView> {
  const response = await request.get(
    `/api/school-years/${schoolYearId}/readiness`,
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ReadinessView;
}

export async function prepareReadySchool(
  request: APIRequestContext,
  prefix: string,
): Promise<ReadyWorkflow> {
  const schoolYear = await createSchoolYear(request, prefix);
  const workbookBuffer = await buildWorkbook(request, schoolYear.id);
  const { preview } = await analyzeWorkbook(
    request,
    schoolYear.id,
    workbookBuffer,
  );
  expect(preview.status).toBe("READY");
  expect(preview.issues.filter((issue) => issue.severity === "ERROR")).toEqual(
    [],
  );

  const applyResponse = await applyImport(
    request,
    schoolYear.id,
    preview.importBatchId,
  );
  expect(applyResponse.ok()).toBeTruthy();
  const readiness = await loadReadiness(request, schoolYear.id);
  expect(readiness.ready).toBe(true);

  return {
    schoolYear,
    workbookBuffer,
    importBatchId: preview.importBatchId,
  };
}

export async function waitForGenerationRun(
  request: APIRequestContext,
  runId: string,
  timeoutMs = 90_000,
): Promise<GenerationRunView> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await request.get(`/api/generation-runs/${runId}`);
    expect(response.ok()).toBeTruthy();
    const run = (await response.json()) as GenerationRunView;
    if (terminalRunStates.has(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Běh ${runId} nedosáhl koncového stavu do ${timeoutMs} ms.`);
}

export async function loadTimetable(
  request: APIRequestContext,
  versionId: string,
): Promise<TimetableView> {
  const response = await request.get(
    `/api/timetable-versions/${versionId}?view=class`,
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as TimetableView;
}

export async function prepareGeneratedWorkflow(
  request: APIRequestContext,
  prefix: string,
): Promise<GeneratedWorkflow> {
  const ready = await prepareReadySchool(request, prefix);
  const startResponse = await request.post(
    `/api/school-years/${ready.schoolYear.id}/generation-runs`,
    { data: { timeLimitSeconds: 30 } },
  );
  expect(startResponse.status()).toBe(202);
  const started = (await startResponse.json()) as {
    generationRunId: string;
    status: "QUEUED";
    inputSnapshotHash: string;
  };
  expect(started.status).toBe("QUEUED");
  expect(started.inputSnapshotHash).toMatch(/^[a-f0-9]{64}$/);

  const generationRun = await waitForGenerationRun(
    request,
    started.generationRunId,
  );
  expect(["FEASIBLE", "OPTIMAL"]).toContain(generationRun.status);
  expect(generationRun.candidateVersion).not.toBeNull();
  expect(generationRun.qualityScore).not.toBeNull();

  const versionId = generationRun.candidateVersion!.id;
  const timetable = await loadTimetable(request, versionId);
  return { ...ready, generationRun, versionId, timetable };
}

export function findFreeSlot(
  timetable: TimetableView,
  moving: TimetableLessonView,
): { day: number; period: number } {
  for (let day = timetable.periodsPerDay.length - 1; day >= 0; day -= 1) {
    const latestStart = timetable.periodsPerDay[day]! - moving.duration;
    for (let period = latestStart; period >= 0; period -= 1) {
      if (day === moving.day && period === moving.period) continue;
      const overlap = timetable.lessons.some((lesson) => {
        if (lesson.id === moving.id || lesson.day !== day) return false;
        return (
          period < lesson.period + lesson.duration &&
          lesson.period < period + moving.duration
        );
      });
      if (!overlap) return { day, period };
    }
  }
  throw new Error("Testovací dataset nemá volný cílový slot.");
}

export function assertNoHardCollisions(timetable: TimetableView): void {
  const occupied = new Map<string, string>();
  for (const lesson of timetable.lessons) {
    for (
      let period = lesson.period;
      period < lesson.period + lesson.duration;
      period += 1
    ) {
      const teacherKey = `teacher:${lesson.teacher_id}:${lesson.day}:${period}`;
      expect(occupied.get(teacherKey), teacherKey).toBeUndefined();
      occupied.set(teacherKey, lesson.id);

      if (lesson.room_id) {
        const roomKey = `room:${lesson.room_id}:${lesson.day}:${period}`;
        expect(occupied.get(roomKey), roomKey).toBeUndefined();
        occupied.set(roomKey, lesson.id);
      }

      for (const other of timetable.lessons) {
        if (
          other.id === lesson.id ||
          other.class_id !== lesson.class_id ||
          other.day !== lesson.day ||
          period < other.period ||
          period >= other.period + other.duration
        ) {
          continue;
        }
        const classConflict =
          lesson.group === "WHOLE" ||
          other.group === "WHOLE" ||
          lesson.group === other.group;
        expect(classConflict, `Kolize třídy ${lesson.class_id}`).toBe(false);
      }
    }
  }
}
