import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import {
  STAFFING_WORKBOOK_SHEET,
  analyzeStaffingWorkbook,
  createStaffingWorkbookTemplate,
} from "../lib/import/staffing-workbook";

test("simple staffing workbook imports mixed subjects and whole unavailable days", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await createStaffingWorkbookTemplate()) as never);
  const worksheet = workbook.getWorksheet(STAFFING_WORKBOOK_SHEET);
  assert.ok(worksheet);

  worksheet.getCell("A6").value = "Jana";
  worksheet.getCell("B6").value = "Nováková";
  worksheet.getCell("C6").value = 22;
  worksheet.getCell("D6").value = "TV";
  worksheet.getCell("E6").value = 10;
  worksheet.getCell("F6").value = "M";
  worksheet.getCell("G6").value = 2;
  worksheet.getCell("H6").value = "CJ";
  worksheet.getCell("I6").value = 4;
  worksheet.getCell("J6").value = "JAZ2";
  worksheet.getCell("K6").value = 6;
  worksheet.getCell("N6").value = "Ano";
  worksheet.getCell("O6").value = "Ne";
  worksheet.getCell("P6").value = "Ne";
  worksheet.getCell("Q6").value = "Ne";
  worksheet.getCell("R6").value = "Ne";

  const analysis = await analyzeStaffingWorkbook(
    new Uint8Array(await workbook.xlsx.writeBuffer()),
  );

  assert.equal(analysis.valid, true);
  assert.deepEqual(analysis.issues, []);
  assert.deepEqual(analysis.summary, {
    teachers: 1,
    targetWeeklyLoad: 22,
    assignedWeeklyLoad: 22,
    unavailableWholeDays: 1,
  });
  assert.equal(analysis.plan.teachers.length, 1);
  const teacher = analysis.plan.teachers[0]!;
  assert.equal(teacher.firstName, "Jana");
  assert.equal(teacher.lastName, "Nováková");
  assert.equal(teacher.targetWeeklyLoad, 22);
  assert.equal(teacher.baseWeeklyLoad, 22);
  assert.deepEqual(
    teacher.subjectLoads.map((item) => [item.subjectCode, item.weeklyPeriods]),
    [
      ["TV", 10],
      ["M", 2],
      ["CJ", 4],
      ["JAZ2", 6],
    ],
  );
  assert.deepEqual(teacher.unavailableDays, ["MON"]);
});

test("simple staffing workbook rejects a workload that does not add up", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await createStaffingWorkbookTemplate()) as never);
  const worksheet = workbook.getWorksheet(STAFFING_WORKBOOK_SHEET);
  assert.ok(worksheet);

  worksheet.getCell("A6").value = "Jan";
  worksheet.getCell("B6").value = "Novák";
  worksheet.getCell("C6").value = 22;
  worksheet.getCell("D6").value = "TV";
  worksheet.getCell("E6").value = 10;
  worksheet.getCell("F6").value = "M";
  worksheet.getCell("G6").value = 2;

  const analysis = await analyzeStaffingWorkbook(
    new Uint8Array(await workbook.xlsx.writeBuffer()),
  );

  assert.equal(analysis.valid, false);
  assert.ok(
    analysis.issues.some((issue) =>
      issue.message.includes("Ještě chybí rozdělit 10 hodin"),
    ),
  );
});

test("generated staffing workbook keeps the beginner sheets visible", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await createStaffingWorkbookTemplate()) as never);

  assert.ok(workbook.getWorksheet(STAFFING_WORKBOOK_SHEET));
  assert.ok(workbook.getWorksheet("Příklad"));
  assert.equal(workbook.getWorksheet("Číselník předmětů")?.state, "veryHidden");
  assert.match(
    workbook.getWorksheet(STAFFING_WORKBOOK_SHEET)!.getCell("A2").text,
    /nadúvazek/i,
  );
});
