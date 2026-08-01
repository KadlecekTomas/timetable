from pathlib import Path
import re

SOURCE = Path("apps/web/e2e/school-scale.spec.ts")
TARGET = Path("apps/web/e2e/full-curriculum.spec.ts")
CI = Path(".github/workflows/ci.yml")

source = SOURCE.read_text()

def replace_once(old: str, new: str) -> None:
    global source
    if source.count(old) != 1:
        raise SystemExit(f"Expected exactly one occurrence of: {old[:80]!r}, got {source.count(old)}")
    source = source.replace(old, new, 1)

replace_once(
    'import { readFile } from "node:fs/promises";',
    'import { copyFile, readFile } from "node:fs/promises";',
)
replace_once(
    '  ["OV", "Občanská výchova", ""],\n  ["HV", "Hudební výchova", ""],',
    '  ["OV", "Občanská výchova", ""],\n  ["VZ", "Výchova ke zdraví a bezpečí", ""],\n  ["HV", "Hudební výchova", ""],',
)
replace_once(
    '  OV: ["OV1"],\n  HV: ["HV1"],',
    '  OV: ["OV1"],\n  VZ: ["OV1"],\n  HV: ["HV1"],',
)

old_curriculum = '''const SPLIT_WEEKLY_PERIODS = {
  CJ: 3,
  M: 3,
  JAZ1: 2,
  JAZ2: 1,
} as const;

const GENERAL_SUBJECTS = [
  "FY",
  "DEJ",
  "ZEM",
  "PRI",
  "CH",
  "OV",
  "HV",
  "VV",
  "PC",
] as const;'''
new_curriculum = '''type SplitSubjectCode = (typeof SPLIT_SUBJECTS)[number];
type GeneralSubjectCode =
  | "FY"
  | "DEJ"
  | "ZEM"
  | "PRI"
  | "CH"
  | "OV"
  | "VZ"
  | "HV"
  | "VV"
  | "PC";

function splitWeeklyPeriods(
  classCode: string,
  grade: number,
  subjectCode: SplitSubjectCode,
): number {
  if (subjectCode === "CJ") {
    if (grade === 6) return 5;
    if (grade === 7) return 4;
    return classCode.endsWith("B") ? 4 : 3;
  }
  if (subjectCode === "M") return grade === 6 ? 5 : 4;
  if (subjectCode === "JAZ1") return 3;
  return grade === 6 ? 0 : 2;
}

const GENERAL_SUBJECTS: GeneralSubjectCode[] = [
  "FY",
  "DEJ",
  "ZEM",
  "PRI",
  "CH",
  "OV",
  "VZ",
  "HV",
  "VV",
  "PC",
];

function wholeClassWeeklyPeriods(
  grade: number,
  subjectCode: GeneralSubjectCode,
): number {
  if (["FY", "DEJ", "ZEM", "PRI"].includes(subjectCode)) return 2;
  if (subjectCode === "CH") return grade >= 8 ? 2 : 0;
  if (subjectCode === "VV") return grade <= 7 ? 2 : 1;
  return 1;
}

function expectedClassWeeklyPeriods(classCode: string, grade: number): number {
  if (grade <= 7) return 30;
  if (grade === 8) return classCode.endsWith("B") ? 31 : 30;
  return classCode.endsWith("B") ? 31 : 32;
}'''
replace_once(old_curriculum, new_curriculum)

replace_once(
    '    SPLIT_SUBJECTS.forEach((subjectCode) => {\n      const pool = TEACHER_POOLS[subjectCode];',
    '    SPLIT_SUBJECTS.forEach((subjectCode) => {\n      const weeklyPeriods = splitWeeklyPeriods(classCode, grade, subjectCode);\n      if (weeklyPeriods === 0) return;\n      const pool = TEACHER_POOLS[subjectCode];',
)
replace_once(
    '          weeklyPeriods: SPLIT_WEEKLY_PERIODS[subjectCode],',
    '          weeklyPeriods,',
)
replace_once(
    '    GENERAL_SUBJECTS.forEach((subjectCode) => {\n      if (subjectCode === "CH" && grade < 8) return;\n      const pool = TEACHER_POOLS[subjectCode];',
    '    GENERAL_SUBJECTS.forEach((subjectCode) => {\n      const weeklyPeriods = wholeClassWeeklyPeriods(grade, subjectCode);\n      if (weeklyPeriods === 0) return;\n      const pool = TEACHER_POOLS[subjectCode];',
)

marker = '''        group: "Celá třída",
        weeklyPeriods: 1,
        shape: "Jednotlivé hodiny",
        doublePeriodsCount: 0,
        requiredRoom: null,
        requiredRoomType: null,
        maxPerDay: 1,
        minDayGap: 0,
      });
    });'''
replacement = marker.replace('weeklyPeriods: 1,', 'weeklyPeriods,')
idx = source.rfind(marker)
if idx < 0:
    raise SystemExit("Could not locate general-subject weekly period block")
source = source[:idx] + replacement + source[idx + len(marker):]

replace_once('  expect(assignments).toHaveLength(239);', '  expect(assignments).toHaveLength(244);')
replace_once(
    'test("school leadership can import 40 teachers, generate the complete second-stage timetable and move a lesson", async ({',
    'test("school leadership can import 40 teachers, generate the full 122-hour second-stage curriculum, export it and move a lesson", async ({',
)
replace_once('  test.setTimeout(420_000);', '  test.setTimeout(600_000);')
replace_once('  ).toBeVisible({ timeout: 240_000 });', '  ).toBeVisible({ timeout: 330_000 });')

replace_once(
    '''    const classAssignments = imported.assignments.filter(
      (assignment) =>
        assignment.classId === schoolClass.id ||
        assignment.additionalClassIds.includes(schoolClass.id),
    );
    expect(''',
    '''    const classAssignments = imported.assignments.filter(
      (assignment) =>
        assignment.classId === schoolClass.id ||
        assignment.additionalClassIds.includes(schoolClass.id),
    );
    const assignmentsBySubject = new Map<string, StoredAssignment[]>();
    classAssignments.forEach((assignment) => {
      assignmentsBySubject.set(assignment.subjectId, [
        ...(assignmentsBySubject.get(assignment.subjectId) ?? []),
        assignment,
      ]);
    });
    const occupiedWeeklyPeriods = [...assignmentsBySubject.values()].reduce(
      (total, subjectAssignments) => {
        const wholeClassPeriods = subjectAssignments
          .filter((assignment) => assignment.group === "WHOLE")
          .reduce((sum, assignment) => sum + assignment.weeklyPeriods, 0);
        const periods =
          wholeClassPeriods ||
          Math.max(...subjectAssignments.map((assignment) => assignment.weeklyPeriods));
        return total + periods;
      },
      0,
    );
    expect(occupiedWeeklyPeriods).toBe(
      expectedClassWeeklyPeriods(classCode, schoolClass.grade),
    );
    expect(''',
)
replace_once(
    '''        .filter((subjectCode) => subjectCode !== "CH" || schoolClass.grade >= 8)
        .sort(),''',
    '''        .filter(
          (subjectCode) =>
            (subjectCode !== "CH" || schoolClass.grade >= 8) &&
            (subjectCode !== "JAZ2" || schoolClass.grade >= 7),
        )
        .sort(),''',
)
replace_once(
    '''    for (const subjectCode of SPLIT_SUBJECTS) {
      const subject = subjectByCode.get(subjectCode)!;''',
    '''    for (const subjectCode of SPLIT_SUBJECTS) {
      if (subjectCode === "JAZ2" && schoolClass.grade < 7) continue;
      const subject = subjectByCode.get(subjectCode)!;''',
)
replace_once(
    '''  assertAvailabilityRespected(generated, generatedVersion.lessons);

  const generatedKadLessons''',
    '''  assertAvailabilityRespected(generated, generatedVersion.lessons);
  for (const [classCode] of CLASSES) {
    const schoolClass = classByCode.get(classCode)!;
    const occupiedSlots = new Set<string>();
    generatedVersion.lessons
      .filter((lesson) =>
        [lesson.class_id, ...(lesson.additional_class_ids ?? [])].includes(
          schoolClass.id,
        ),
      )
      .forEach((lesson) => {
        for (let offset = 0; offset < lesson.duration; offset += 1) {
          occupiedSlots.add(`${lesson.day}:${lesson.period + offset}`);
        }
      });
    expect(occupiedSlots.size).toBe(
      expectedClassWeeklyPeriods(classCode, schoolClass.grade),
    );
  }

  const generatedKadLessons''',
)
replace_once(
    '''  expect(validateSchedule(afterUndo.snapshot, afterUndo.lessons)).toEqual([]);

  await page.getByRole("link", { name: "Nastavení" }).click();''',
    '''  expect(validateSchedule(afterUndo.snapshot, afterUndo.lessons)).toEqual([]);

  const exportDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportovat rozvrh do Excelu" })
    .click();
  const exportDownload = await exportDownloadPromise;
  expect(exportDownload.suggestedFilename()).toMatch(/\\.xlsx$/);
  const exportPath = await exportDownload.path();
  expect(exportPath).not.toBeNull();
  const artifactPath = "/tmp/rozvrh-vedeni-plny-druhy-stupen.xlsx";
  await copyFile(exportPath!, artifactPath);
  const exportedWorkbook = new ExcelJS.Workbook();
  await exportedWorkbook.xlsx.readFile(artifactPath);
  expect(exportedWorkbook.worksheets).toHaveLength(54);
  expect(exportedWorkbook.getWorksheet("Přehled")).toBeDefined();
  expect(exportedWorkbook.getWorksheet("Třída 6A")).toBeDefined();
  expect(exportedWorkbook.getWorksheet("Třída 9A")).toBeDefined();
  expect(exportedWorkbook.getWorksheet("Učitel KAD")).toBeDefined();
  expect(exportedWorkbook.getWorksheet("Učitel KAD")?.getCell("A1").text).toContain(
    "Tomáš Kadleček",
  );

  await page.getByRole("link", { name: "Nastavení" }).click();''',
)

TARGET.write_text(source)

ci = CI.read_text()
old_upload = '''      - name: Upload leadership timetable example
        uses: actions/upload-artifact@v4
        with:
          name: leadership-timetable-export
          path: apps/web/artifacts/rozvrh-vedeni-ukazka.xlsx
          if-no-files-found: error
'''
if old_upload not in ci:
    raise SystemExit("Old leadership artifact step not found")
ci = ci.replace(old_upload, "", 1)
ci = ci.replace(
    '''      # Release gate: complete 40-teacher second-stage school workflow.
      - name: Run realistic 40-teacher school workflow
        run: npm run e2e --workspace @timetable/web -- e2e/school-scale.spec.ts --retries=0
''',
    '''      # Release gate: complete 122-hour second-stage curriculum with 40 teachers.
      - name: Run full-curriculum 40-teacher school workflow
        run: npm run e2e --workspace @timetable/web -- e2e/full-curriculum.spec.ts --retries=0
      - name: Upload full-curriculum leadership export
        uses: actions/upload-artifact@v4
        with:
          name: leadership-full-curriculum-timetable
          path: /tmp/rozvrh-vedeni-plny-druhy-stupen.xlsx
          if-no-files-found: error
''',
    1,
)
CI.write_text(ci)
