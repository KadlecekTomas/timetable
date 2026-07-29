import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import {
  analyzeImportWorkbook,
  createImportTemplate,
} from "../lib/import/workbook";

async function validWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await createImportTemplate()) as never);
  workbook
    .getWorksheet("Nastavení")!
    .insertRow(2, ["2026/2027", 8, 8, 8, 8, 7]);
  workbook
    .getWorksheet("Učitelé")!
    .insertRow(2, ["NOV", "Jan", "Novák", 2, "", "", "M", "6A"]);
  workbook.getWorksheet("Třídy")!.insertRow(2, ["6A", 6, "6.A"]);
  workbook.getWorksheet("Předměty")!.insertRow(2, ["M", "Matematika", ""]);
  workbook
    .getWorksheet("Učebny")!
    .insertRow(2, ["101", "Učebna 101", "GENERAL", 30]);
  workbook
    .getWorksheet("Výukové_vazby")!
    .insertRow(2, [
      "6A-M-NOV",
      "6A",
      "M",
      "NOV",
      "WHOLE",
      2,
      "SINGLE",
      0,
      "",
      "",
      1,
      "",
    ]);
  workbook
    .getWorksheet("Dostupnost")!
    .insertRow(2, [
      "TEACHER",
      "NOV",
      "FRI",
      7,
      "DISCOURAGED",
      25,
      "Pozdní konec",
    ]);
  return workbook;
}

async function bufferOf(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("generated template can be filled and analyzed as READY", async () => {
  const workbook = await validWorkbook();
  const analysis = await analyzeImportWorkbook(await bufferOf(workbook));
  assert.equal(analysis.status, "READY");
  assert.equal(analysis.summary.errors, 0);
  assert.equal(analysis.summary.teachers, 1);
  assert.equal(analysis.summary.assignments, 1);
  assert.equal(analysis.payload?.assignments[0]?.assignment_code, "6A-M-NOV");
});

test("missing reference blocks the entire import preview", async () => {
  const workbook = await validWorkbook();
  workbook.getWorksheet("Výukové_vazby")!.getCell("B2").value = "UNKNOWN";
  const analysis = await analyzeImportWorkbook(await bufferOf(workbook));
  assert.equal(analysis.status, "VALIDATION_FAILED");
  assert.equal(analysis.payload, null);
  assert.ok(
    analysis.issues.some((item) => item.code === "REFERENCE_NOT_FOUND"),
  );
});

test("formula cells are rejected instead of evaluated", async () => {
  const workbook = await validWorkbook();
  workbook.getWorksheet("Učitelé")!.getCell("B2").value = {
    formula: 'CONCAT("J","an")',
    result: "Jan",
  };
  const analysis = await analyzeImportWorkbook(await bufferOf(workbook));
  assert.equal(analysis.status, "VALIDATION_FAILED");
  assert.ok(
    analysis.issues.some((item) => item.code === "FORMULA_NOT_ALLOWED"),
  );
});

test("corrupted upload produces one structured workbook error", async () => {
  const analysis = await analyzeImportWorkbook(Buffer.from("not-an-xlsx"));
  assert.equal(analysis.status, "VALIDATION_FAILED");
  assert.equal(analysis.issues[0]?.code, "WORKBOOK_INVALID");
});
