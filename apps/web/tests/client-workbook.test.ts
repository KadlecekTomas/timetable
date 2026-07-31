import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS, { type Worksheet } from "exceljs";

import {
  analyzeClientImportWorkbook,
  createClientImportTemplate,
  CLIENT_TEMPLATE_FIRST_DATA_ROW,
} from "../lib/import/client-workbook";

function writeRows(worksheet: Worksheet, rows: Array<Array<string | number>>) {
  rows.forEach((values, rowIndex) => {
    values.forEach((value, columnIndex) => {
      worksheet.getCell(
        rowIndex + CLIENT_TEMPLATE_FIRST_DATA_ROW,
        columnIndex + 1,
      ).value = value;
    });
  });
}

test("client template is Czech, guided and imports friendly values", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await createClientImportTemplate()) as never);

  assert.ok(workbook.getWorksheet("Začněte zde"));
  assert.ok(workbook.getWorksheet("Příklady"));
  assert.equal(
    workbook.getWorksheet("1. Učitelé")?.getCell("A5").text,
    "Zkratka učitele *",
  );
  assert.equal(
    workbook.getWorksheet("5. Kdo co učí")?.getCell("E6").dataValidation.type,
    "list",
  );

  writeRows(workbook.getWorksheet("Nastavení")!, [
    ["2026/2027", 8, 8, 8, 8, 7],
  ]);
  writeRows(workbook.getWorksheet("1. Učitelé")!, [
    ["NOV", "Jan", "Novák", 2, "", "", "M", "6A"],
  ]);
  writeRows(workbook.getWorksheet("2. Třídy")!, [["6A", 6, "6.A"]]);
  writeRows(workbook.getWorksheet("3. Předměty")!, [["M", "Matematika", ""]]);
  writeRows(workbook.getWorksheet("4. Učebny")!, [
    ["101", "Kmenová učebna", "BĚŽNÁ", 30],
  ]);
  writeRows(workbook.getWorksheet("5. Kdo co učí")!, [
    [
      "6A-M-NOV",
      "6A",
      "M",
      "NOV",
      "Celá třída",
      2,
      "Jednotlivé hodiny",
      0,
      "101",
      "",
      1,
      1,
    ],
  ]);
  writeRows(workbook.getWorksheet("6. Dostupnost")!, [
    ["Učitel", "NOV", "Pátek", 7, "Raději ne", 25, "Pozdní konec"],
  ]);

  const analysis = await analyzeClientImportWorkbook(
    new Uint8Array(await workbook.xlsx.writeBuffer()),
  );
  assert.equal(analysis.status, "READY");
  assert.equal(analysis.summary.errors, 0);
  assert.equal(analysis.payload?.assignments[0]?.group, "WHOLE");
  assert.equal(analysis.payload?.assignments[0]?.lesson_shape, "SINGLE");
  assert.equal(analysis.payload?.availability[0]?.day, "FRI");
  assert.equal(analysis.payload?.availability[0]?.kind, "DISCOURAGED");
});
