import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import { analyzeLegacyStaffingPlan } from "../lib/import/legacy-staffing-plan";

interface SubjectEntry {
  subject: string;
  teachers: string;
  weeklyPeriods: number;
}

function writeClass(
  worksheet: ExcelJS.Worksheet,
  row: number,
  classCode: string,
  entries: SubjectEntry[],
): void {
  worksheet.getCell(row, 1).value = classCode;
  worksheet.getCell(row + 1, 1).value = "Předměty";
  worksheet.getCell(row + 1, 2).value = "Učitel/učitelka";
  worksheet.getCell(row + 1, 3).value = "Časová dotace";

  entries.forEach((entry, index) => {
    worksheet.getCell(row + 2 + index, 1).value = entry.subject;
    worksheet.getCell(row + 2 + index, 2).value = entry.teachers;
    worksheet.getCell(row + 2 + index, 3).value = entry.weeklyPeriods;
  });
}

function teacherHours(
  analysis: NonNullable<ReturnType<typeof analyzeLegacyStaffingPlan>>,
  lastName: string,
): number {
  const teacher = analysis.plan.teachers.find(
    (item) => item.lastName === lastName,
  );
  assert.ok(teacher, `Missing teacher ${lastName}`);
  return teacher.subjectLoads.reduce(
    (total, item) => total + item.weeklyPeriods,
    0,
  );
}

function subjectHours(
  analysis: NonNullable<ReturnType<typeof analyzeLegacyStaffingPlan>>,
  lastName: string,
  subjectCode: string,
): number {
  const teacher = analysis.plan.teachers.find(
    (item) => item.lastName === lastName,
  );
  assert.ok(teacher, `Missing teacher ${lastName}`);
  return teacher.subjectLoads
    .filter((item) => item.subjectCode === subjectCode)
    .reduce((total, item) => total + item.weeklyPeriods, 0);
}

test("actual language matrix keeps every class assignment in teacher workloads", () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Úvazky 20262027");

  writeClass(worksheet, 2, "7.C", [
    { subject: "Vkz", teachers: "Přikrylová", weeklyPeriods: 1 },
  ]);
  writeClass(worksheet, 7, "8.A", [
    { subject: "Vv", teachers: "Přikrylová", weeklyPeriods: 2 },
    { subject: "Německý jazyk", teachers: "Přikrylová", weeklyPeriods: 3 },
    { subject: "Španělský jazyk", teachers: "Špánková", weeklyPeriods: 3 },
  ]);
  writeClass(worksheet, 13, "8.B", [
    { subject: "Španělský jazyk", teachers: "Špánková", weeklyPeriods: 3 },
  ]);
  writeClass(worksheet, 18, "8.C", [
    { subject: "Německý jazyk", teachers: "Přikrylová", weeklyPeriods: 3 },
    { subject: "Španělský jazyk", teachers: "Śpánková", weeklyPeriods: 3 },
  ]);
  writeClass(worksheet, 24, "9.A", [
    { subject: "Německý jazyk", teachers: "Přikrylová", weeklyPeriods: 3 },
  ]);
  writeClass(worksheet, 29, "9.B", [
    {
      subject: "Německý jazyk",
      teachers: "Špánková/Přikrylová",
      weeklyPeriods: 3,
    },
  ]);
  writeClass(worksheet, 34, "9.C", [
    { subject: "Vv", teachers: "Přikrylová", weeklyPeriods: 1 },
    { subject: "Německý jazyk", teachers: "Přikrylová", weeklyPeriods: 3 },
  ]);

  const analysis = analyzeLegacyStaffingPlan(workbook);
  assert.ok(analysis);

  assert.equal(teacherHours(analysis, "Špánková"), 12);
  assert.equal(subjectHours(analysis, "Špánková", "JAZ2"), 12);

  assert.equal(teacherHours(analysis, "Přikrylová"), 19);
  assert.equal(subjectHours(analysis, "Přikrylová", "JAZ2"), 15);
});
