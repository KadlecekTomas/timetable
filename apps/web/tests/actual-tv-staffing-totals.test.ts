import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import { analyzeLegacyStaffingPlan } from "../lib/import/legacy-staffing-plan";

function writeClass(
  worksheet: ExcelJS.Worksheet,
  row: number,
  classCode: string,
  teachers: string,
  weeklyPeriods: number,
): void {
  worksheet.getCell(row, 1).value = classCode;
  worksheet.getCell(row, 2).value = "Třídní Učitel";
  worksheet.getCell(row + 1, 1).value = "Předměty";
  worksheet.getCell(row + 1, 2).value = "Učitel/učitelka";
  worksheet.getCell(row + 1, 3).value = "Časová dotace";
  worksheet.getCell(row + 2, 1).value = "Tv";
  worksheet.getCell(row + 2, 2).value = teachers;
  worksheet.getCell(row + 2, 3).value = weeklyPeriods;
}

function tvHours(
  analysis: NonNullable<ReturnType<typeof analyzeLegacyStaffingPlan>>,
  lastName: string,
): number {
  const teacher = analysis.plan.teachers.find((item) => item.lastName === lastName);
  assert.ok(teacher, `Missing teacher ${lastName}`);
  return teacher.subjectLoads
    .filter((item) => item.subjectCode === "TV")
    .reduce((total, item) => total + item.weeklyPeriods, 0);
}

test("actual TV matrix gives Mašek 22 h and Šobotník 18 h", () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Úvazky 20262027");

  writeClass(worksheet, 2, "6.A", "Rašková/Šobotník", 2);
  writeClass(worksheet, 7, "6.B", "Lišková/Vodička/Mašek", 5);
  writeClass(worksheet, 12, "6.C", "Mašek/Šárová", 2);
  writeClass(worksheet, 17, "6.D", "Rašková/Mašek", 5);
  writeClass(worksheet, 22, "7.A", "Šárová/Mašek", 2);
  writeClass(worksheet, 27, "7.B", "Lišková/Šobotník", 5);
  writeClass(worksheet, 32, "7.C", "Šárová/Mašek", 2);
  writeClass(worksheet, 37, "8.A", "Mašek/Šárová", 2);
  writeClass(worksheet, 42, "8.B", "Vodička/Rašková/Šobotník", 5);
  writeClass(worksheet, 47, "8.C", "Šobotník/Rašková", 2);
  writeClass(worksheet, 52, "9.A", "Mašek/Rašková", 2);
  writeClass(worksheet, 57, "9.B", "Šobotník/Lišková", 4);
  writeClass(worksheet, 62, "9.C", "Mašek/Šárová", 2);

  const analysis = analyzeLegacyStaffingPlan(workbook);
  assert.ok(analysis);
  assert.equal(tvHours(analysis, "Mašek"), 22);
  assert.equal(tvHours(analysis, "Šobotník"), 18);

  const tv6B = analysis.allocationDraft?.rows.find(
    (row) => row.classCode === "6.B" && row.subjectCode === "TV",
  );
  const tv8B = analysis.allocationDraft?.rows.find(
    (row) => row.classCode === "8.B" && row.subjectCode === "TV",
  );
  assert.equal(tv6B?.teacherIds.length, 3);
  assert.equal(tv8B?.teacherIds.length, 3);
});
