import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import { analyzeStaffingWorkbook } from "../lib/import/staffing-workbook-school-v2";

async function compactWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("List 1");
  sheet.getCell("B4").value = "6.A";
  sheet.getCell("F4").value = "6.B";
  for (const column of ["B", "F"]) {
    sheet.getCell(`${column}5`).value = "Předměty";
    sheet.getCell(`${String.fromCharCode(column.charCodeAt(0) + 1)}5`).value =
      "Učitel/učitelka";
    sheet.getCell(`${String.fromCharCode(column.charCodeAt(0) + 2)}5`).value =
      "Časová dotace";
  }
  sheet.getCell("B6").value = "Čj";
  sheet.getCell("C6").value = "Novotná";
  sheet.getCell("D6").value = "5+1";
  sheet.getCell("B7").value = "M";
  sheet.getCell("C7").value = "Pilat";
  sheet.getCell("D7").value = "4+1";
  sheet.getCell("B8").value = "Aj";
  sheet.getCell("C8").value = "Syrůčková/Rus/Testová";
  sheet.getCell("D8").value = 4;
  sheet.getCell("B9").value = "Tv";
  sheet.getCell("C9").value = "Mašek/Šárová/Náhradní";
  sheet.getCell("D9").value = 2;

  sheet.getCell("F6").value = "Čj";
  sheet.getCell("G6").value = "Kvapilová";
  sheet.getCell("H6").value = "4+1";
  sheet.getCell("F7").value = "M";
  sheet.getCell("G7").value = "Dostálová";
  sheet.getCell("H7").value = "4+1";
  sheet.getCell("F8").value = "Španělský jazyk";
  sheet.getCell("G8").value = "Śpánková";
  sheet.getCell("H8").value = 3;

  sheet.getCell("B12").value = "7.A";
  sheet.getCell("B13").value = "Předměty";
  sheet.getCell("C13").value = "Učitel/učitelka";
  sheet.getCell("D13").value = "Časová dotace";
  sheet.getCell("B14").value = "Španělský jazyk";
  sheet.getCell("C14").value = "Špánková";
  sheet.getCell("D14").value = 3;
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function hours(
  analysis: Awaited<ReturnType<typeof analyzeStaffingWorkbook>>,
  lastName: string,
  subjectCode: string,
): number {
  const teacher = analysis.plan.teachers.find(
    (item) => item.lastName === lastName,
  );
  assert.ok(teacher, lastName);
  return teacher.subjectLoads
    .filter((item) => item.subjectCode === subjectCode)
    .reduce((total, item) => total + item.weeklyPeriods, 0);
}

test("compact school matrix imports X+1 as teacher hours and normalizes names", async () => {
  const analysis = await analyzeStaffingWorkbook(await compactWorkbook());
  assert.equal(analysis.valid, true);
  assert.equal(hours(analysis, "Novotná", "CJ"), 6);
  assert.equal(hours(analysis, "Pilat", "M"), 5);
  assert.equal(hours(analysis, "Kvapilová", "CJ"), 5);
  assert.equal(hours(analysis, "Dostálová", "M"), 5);
  assert.equal(hours(analysis, "Syrůčková", "JAZ1"), 4);
  assert.equal(hours(analysis, "Rus", "JAZ1"), 4);
  assert.equal(hours(analysis, "Testová", "JAZ1"), 4);
  assert.equal(hours(analysis, "Mašek", "TV"), 2);
  assert.equal(hours(analysis, "Šárová", "TV"), 2);
  const spankova = analysis.plan.teachers.filter((teacher) =>
    teacher.lastName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .includes("spankova"),
  );
  assert.equal(spankova.length, 1);
  assert.equal(
    spankova[0]?.subjectLoads.find((item) => item.subjectCode === "JAZ2")
      ?.weeklyPeriods,
    6,
  );
  assert.ok("allocationDraft" in analysis);
  if (!("allocationDraft" in analysis)) return;
  const czech = analysis.allocationDraft?.rows.find(
    (row) => row.classCode === "6.A" && row.subjectCode === "CJ",
  );
  assert.equal(czech?.weeklyPeriods, 5);
  assert.equal(czech?.teacherIds.length, 1);
  const english = analysis.allocationDraft?.rows.find(
    (row) => row.classCode === "6.A" && row.subjectCode === "JAZ1",
  );
  assert.equal(english?.teacherIds.length, 3);
  const pe = analysis.allocationDraft?.rows.find(
    (row) => row.classCode === "6.A" && row.subjectCode === "TV",
  );
  assert.equal(pe?.teacherIds.length, 2);
  assert.ok(
    analysis.issues.some((item) =>
      item.message.includes("TV zůstává rozdělená jen na dvě žákovské skupiny"),
    ),
  );
});
