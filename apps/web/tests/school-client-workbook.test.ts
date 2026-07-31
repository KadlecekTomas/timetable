import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import { createSchoolClientImportTemplate } from "../lib/import/school-client-workbook";

test("school client template prefills classes, split groups and PE organization", async () => {
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
  assert.deepEqual(
    Array.from({ length: 10 }, (_, rowIndex) =>
      Array.from(
        { length: 7 },
        (_, columnIndex) =>
          assignments.getCell(6 + rowIndex, 1 + columnIndex).text,
      ),
    ),
    [
      ["6A-CJ-S1", "6A", "CJ", "", "Skupina 1", "", "Jednotlivé hodiny"],
      ["6A-CJ-S2", "6A", "CJ", "", "Skupina 2", "", "Jednotlivé hodiny"],
      ["6A-M-S1", "6A", "M", "", "Skupina 1", "", "Jednotlivé hodiny"],
      ["6A-M-S2", "6A", "M", "", "Skupina 2", "", "Jednotlivé hodiny"],
      ["6A-INF-S1", "6A", "INF", "", "Skupina 1", "", "Jednotlivé hodiny"],
      ["6A-INF-S2", "6A", "INF", "", "Skupina 2", "", "Jednotlivé hodiny"],
      ["6A-JAZ1-S1", "6A", "JAZ1", "", "Skupina 1", "", "Jednotlivé hodiny"],
      ["6A-JAZ1-S2", "6A", "JAZ1", "", "Skupina 2", "", "Jednotlivé hodiny"],
      ["6A-JAZ2-S1", "6A", "JAZ2", "", "Skupina 1", "", "Jednotlivé hodiny"],
      ["6A-JAZ2-S2", "6A", "JAZ2", "", "Skupina 2", "", "Jednotlivé hodiny"],
    ],
  );

  const organization = workbook.getWorksheet("8. Organizační pravidla");
  assert.ok(organization);
  assert.equal(organization.getCell("B6").text, "9.A + 9.C");
  assert.equal(organization.getCell("C6").text, "Společná výuka");
  assert.equal(organization.getCell("D7").text, "8.B + 9.B");
  assert.equal(organization.getCell("D8").text, "7.B + 8.B");
  assert.match(organization.getCell("A10").text, /automaticky nevynucuje/);
});
