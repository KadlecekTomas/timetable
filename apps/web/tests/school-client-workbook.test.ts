import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import {
  CLIENT_TEMPLATE_FIRST_DATA_ROW,
  CLIENT_TEMPLATE_LAST_DATA_ROW,
} from "../lib/import/client-workbook";
import { createSchoolClientImportTemplate } from "../lib/import/school-client-workbook";

function filledRows(
  worksheet: ExcelJS.Worksheet,
  columnCount: number,
): string[][] {
  const rows: string[][] = [];
  for (
    let rowNumber = CLIENT_TEMPLATE_FIRST_DATA_ROW;
    rowNumber <= CLIENT_TEMPLATE_LAST_DATA_ROW;
    rowNumber += 1
  ) {
    if (!worksheet.getCell(rowNumber, 1).text.trim()) continue;
    rows.push(
      Array.from(
        { length: columnCount },
        (_, columnIndex) => worksheet.getCell(rowNumber, columnIndex + 1).text,
      ),
    );
  }
  return rows;
}

test("school client template prefills split subjects, whole-class informatics and PE organization", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await createSchoolClientImportTemplate()) as never);

  const classes = workbook.getWorksheet("2. Třídy");
  assert.ok(classes);
  assert.deepEqual(
    Array.from({ length: 13 }, (_, index) => [
      classes.getCell(6 + index, 1).text,
      Number(classes.getCell(6 + index, 2).value),
      classes.getCell(6 + index, 3).text,
    ]),
    [
      ["6A", 6, "6.A"],
      ["6B", 6, "6.B"],
      ["6C", 6, "6.C"],
      ["6D", 6, "6.D"],
      ["7A", 7, "7.A"],
      ["7B", 7, "7.B"],
      ["7C", 7, "7.C"],
      ["8A", 8, "8.A"],
      ["8B", 8, "8.B"],
      ["8C", 8, "8.C"],
      ["9A", 9, "9.A"],
      ["9B", 9, "9.B"],
      ["9C", 9, "9.C"],
    ],
  );

  const assignments = workbook.getWorksheet("5. Kdo co učí");
  assert.ok(assignments);
  const assignmentRows = filledRows(assignments, 12);
  assert.deepEqual(
    assignmentRows.slice(0, 9).map((row) => row.slice(0, 7)),
    [
      ["6A-CJ-S1", "6A", "CJ", "", "Skupina 1", "", "Jednotlivé hodiny"],
      ["6A-CJ-S2", "6A", "CJ", "", "Skupina 2", "", "Jednotlivé hodiny"],
      ["6A-M-S1", "6A", "M", "", "Skupina 1", "", "Jednotlivé hodiny"],
      ["6A-M-S2", "6A", "M", "", "Skupina 2", "", "Jednotlivé hodiny"],
      ["6A-INF", "6A", "INF", "", "Celá třída", "1", "Jednotlivé hodiny"],
      ["6A-JAZ1-S1", "6A", "JAZ1", "", "Skupina 1", "", "Jednotlivé hodiny"],
      ["6A-JAZ1-S2", "6A", "JAZ1", "", "Skupina 2", "", "Jednotlivé hodiny"],
      ["6A-JAZ2-S1", "6A", "JAZ2", "", "Skupina 1", "", "Jednotlivé hodiny"],
      ["6A-JAZ2-S2", "6A", "JAZ2", "", "Skupina 2", "", "Jednotlivé hodiny"],
    ],
  );

  const informaticsRows = assignmentRows.filter((row) => row[2] === "INF");
  assert.equal(informaticsRows.length, 13);
  assert.deepEqual(
    informaticsRows.map((row) => [
      row[0],
      row[1],
      row[4],
      row[5],
      row[6],
      row[7],
      row[9],
      row[10],
      row[11],
    ]),
    [
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
    ].map((classCode) => [
      `${classCode}-INF`,
      classCode,
      "Celá třída",
      "1",
      "Jednotlivé hodiny",
      "0",
      "POČÍTAČOVÁ UČEBNA",
      "1",
      "0",
    ]),
  );
  assert.equal(
    assignmentRows.some((row) => row[0].endsWith("-INF-S2")),
    false,
  );
  assert.match(assignments.getCell("A2").text, /Informatika je jednou týdně/);

  const organization = workbook.getWorksheet("8. Organizační pravidla");
  assert.ok(organization);
  assert.equal(organization.getCell("B6").text, "9.A + 9.C");
  assert.equal(organization.getCell("C6").text, "Společná výuka");
  assert.equal(organization.getCell("D7").text, "8.B + 9.B");
  assert.equal(organization.getCell("D8").text, "7.B + 8.B");
  assert.equal(organization.getCell("A9").text, "Informatika");
  assert.match(organization.getCell("C9").text, /1 hodina týdně/);
  assert.match(organization.getCell("A10").text, /automaticky nevynucuje/);
});
