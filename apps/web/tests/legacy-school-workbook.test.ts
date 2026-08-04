import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS, { type Worksheet } from "exceljs";

import { analyzeClientImportWorkbook } from "../lib/import/client-workbook-school";

function writeClassHeader(
  worksheet: Worksheet,
  row: number,
  classes: Array<{ column: number; code: string; teacher: string }>,
): void {
  for (const schoolClass of classes) {
    worksheet.getCell(row, schoolClass.column).value = schoolClass.code;
    worksheet.getCell(row, schoolClass.column + 1).value = schoolClass.teacher;
    worksheet.getCell(row + 2, schoolClass.column).value = "Předměty";
    worksheet.getCell(row + 2, schoolClass.column + 1).value =
      "Učitel/učitelka";
    worksheet.getCell(row + 2, schoolClass.column + 2).value = "Časová dotace";
  }
}

function writeSubject(
  worksheet: Worksheet,
  row: number,
  column: number,
  subject: string,
  teacher: string,
  weeklyPeriods: number,
): void {
  worksheet.getCell(row, column).value = subject;
  worksheet.getCell(row, column + 1).value = teacher;
  worksheet.getCell(row, column + 2).value = weeklyPeriods;
}

async function createLegacyWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Úvazky 20252026");
  workbook.addWorksheet("Jednotlivci");

  worksheet.getCell("C5").value = "Kadleček Tomáš+5";
  worksheet.getCell("C6").value = "Šárová Eliška";
  worksheet.getCell("C7").value = "Přikrylová Radana+3";
  worksheet.getCell("C8").value = "Špánková Michaela";

  writeClassHeader(worksheet, 41, [
    { column: 3, code: "8.A", teacher: "Zdena Schoberová" },
    { column: 7, code: "8.B", teacher: "Tomáš Vodička" },
    { column: 11, code: "8.C", teacher: "Michaela Špánková" },
  ]);
  writeSubject(worksheet, 44, 3, "Německý jazyk", "Přikrylová", 3);
  writeSubject(worksheet, 44, 7, "Německý jazyk", "", 3);
  writeSubject(worksheet, 44, 11, "Německý jazyk", "", 3);
  writeSubject(worksheet, 45, 3, "Španělský jazyk", "Špánková", 3);
  writeSubject(worksheet, 45, 7, "Španělský jazyk", "Špánková", 3);
  writeSubject(worksheet, 45, 11, "Španělský jazyk", "Śpánková", 3);

  writeClassHeader(worksheet, 61, [
    { column: 3, code: "9.A", teacher: "Zuzana Jakoubková" },
    { column: 7, code: "9.C", teacher: "Karla Šubrtová" },
  ]);
  writeSubject(worksheet, 64, 3, "Tv", "Kadleček/Šárová", 2);
  writeSubject(worksheet, 64, 7, "Tv", "Kadleček/Šárová", 2);

  return workbook;
}

test("legacy staffing matrix reports uncovered subject allocation", async () => {
  const workbook = await createLegacyWorkbook();
  const analysis = await analyzeClientImportWorkbook(
    new Uint8Array(await workbook.xlsx.writeBuffer()),
  );

  assert.equal(analysis.templateVersion, "legacy-school-matrix-1");
  assert.equal(analysis.status, "READY");
  assert.ok(analysis.payload);
  assert.equal(analysis.summary.requiredWeeklyPeriods, 22);
  assert.equal(analysis.summary.coveredWeeklyPeriods, 16);
  assert.equal(analysis.summary.uncoveredWeeklyPeriods, 6);
  assert.equal(analysis.summary.coveragePercent, 72.7);
  assert.ok(
    analysis.issues
      .filter((issue) => issue.code === "TEACHING_COVERAGE_MISSING")
      .every((issue) => issue.severity === "WARNING"),
  );
  assert.deepEqual(
    analysis.issues
      .filter((issue) => issue.code === "TEACHING_COVERAGE_MISSING")
      .map((issue) => [issue.row, issue.column]),
    [
      [44, "H"],
      [44, "L"],
    ],
  );
});

test("legacy staffing matrix preserves separate class rows and teacher loads", async () => {
  const workbook = await createLegacyWorkbook();
  const worksheet = workbook.getWorksheet("Úvazky 20252026")!;
  worksheet.getCell("H44").value = "Přikrylová";
  worksheet.getCell("L44").value = "Přikrylová";

  const analysis = await analyzeClientImportWorkbook(
    new Uint8Array(await workbook.xlsx.writeBuffer()),
  );

  assert.equal(
    analysis.status,
    "READY",
    JSON.stringify(analysis.issues, null, 2),
  );
  assert.equal(analysis.summary.requiredWeeklyPeriods, 22);
  assert.equal(analysis.summary.coveredWeeklyPeriods, 22);
  assert.equal(analysis.summary.uncoveredWeeklyPeriods, 0);
  assert.equal(analysis.summary.coveragePercent, 100);
  assert.equal(analysis.payload?.assignments.length, 10);

  const secondLanguages =
    analysis.payload?.assignments.filter(
      (assignment) => assignment.subject_code === "JAZ2",
    ) ?? [];
  assert.equal(
    secondLanguages.filter((assignment) => assignment.group === "GROUP_1")
      .length,
    3,
  );
  assert.equal(
    secondLanguages.filter((assignment) => assignment.group === "GROUP_2")
      .length,
    3,
  );

  const physicalEducation =
    analysis.payload?.assignments.filter(
      (assignment) => assignment.subject_code === "TV",
    ) ?? [];
  assert.equal(physicalEducation.length, 4);
  assert.ok(
    physicalEducation.every(
      (assignment) =>
        assignment.lesson_shape === "DOUBLE" &&
        assignment.additional_class_codes.length === 0,
    ),
  );

  const kadlecek = analysis.payload?.teachers.find(
    (teacher) => teacher.teacher_code === "KAD",
  );
  assert.equal(kadlecek?.target_weekly_load, 4);
});
