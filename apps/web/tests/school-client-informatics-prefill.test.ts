import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import {
  CLIENT_TEMPLATE_FIRST_DATA_ROW,
  CLIENT_TEMPLATE_LAST_DATA_ROW,
} from "../lib/import/client-workbook";
import { createSchoolClientImportTemplate } from "../lib/import/school-client-workbook";

function assignmentRows(worksheet: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  for (
    let row = CLIENT_TEMPLATE_FIRST_DATA_ROW;
    row <= CLIENT_TEMPLATE_LAST_DATA_ROW;
    row += 1
  ) {
    if (!worksheet.getCell(row, 1).text.trim()) continue;
    rows.push(
      Array.from({ length: 13 }, (_, index) =>
        worksheet.getCell(row, index + 1).text.trim(),
      ),
    );
  }
  return rows;
}

test("informatika je půlená ve všech třídách kromě malé 8.B", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await createSchoolClientImportTemplate()) as never);

  const assignments = workbook.getWorksheet("5. Kdo co učí");
  assert.ok(assignments);
  const informatics = assignmentRows(assignments).filter(
    (row) => row[3] === "INF",
  );

  assert.equal(informatics.length, 25);

  const classCodes = [
    "6A",
    "6B",
    "6C",
    "6D",
    "7A",
    "7B",
    "7C",
    "8A",
    "8B",
    "8C",
    "9A",
    "9B",
    "9C",
  ];

  for (const classCode of classCodes) {
    const rows = informatics.filter((row) => row[1] === classCode);
    if (classCode === "8B") {
      assert.deepEqual(
        rows.map((row) => [row[0], row[5], row[6]]),
        [["8B-INF", "Celá třída", "1"]],
      );
      continue;
    }

    assert.deepEqual(
      rows.map((row) => [row[0], row[5], row[6]]),
      [
        [`${classCode}-INF-S1`, "Skupina 1", "1"],
        [`${classCode}-INF-S2`, "Skupina 2", "1"],
      ],
    );
  }

  const organization = workbook.getWorksheet("8. Organizační pravidla");
  assert.ok(organization);
  assert.match(organization.getCell("B6").text, /Všechny třídy kromě 8\.B/);
  assert.match(organization.getCell("C6").text, /KAD.*VAS/);
  assert.match(organization.getCell("B7").text, /12 hodin týdně/);
  assert.match(organization.getCell("C7").text, /úterý a ve středu/);
});
