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

test("school template uses current subjects and splits informatics except 8.B", async () => {
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

  const subjects = workbook.getWorksheet("3. Předměty");
  assert.ok(subjects);
  const subjectRows = filledRows(subjects, 3);
  assert.deepEqual(subjectRows, [
    ["CJ", "Český jazyk a literatura (ČJ / ČJL)", ""],
    ["M", "Matematika (M)", ""],
    ["JAZ1", "Anglický jazyk (Aj)", "JAZYKOVÁ UČEBNA"],
    [
      "JAZ2",
      "Druhý cizí jazyk – německý jazyk (2.Nj)",
      "JAZYKOVÁ UČEBNA",
    ],
    ["INF", "Informatika (Inf)", "POČÍTAČOVÁ UČEBNA"],
    ["TV", "Tělesná výchova (Tv)", "TĚLOCVIČNA"],
    ["FY", "Fyzika (F)", ""],
    ["DEJ", "Dějepis (D)", ""],
    ["ZEM", "Zeměpis (Z)", ""],
    ["PRI", "Přírodopis (Př)", ""],
    ["CH", "Chemie (Ch)", ""],
    ["OV", "Občanská výchova (Ov)", ""],
    ["VZ", "Výchova ke zdraví (Vkz)", ""],
    ["HV", "Hudební výchova (Hv)", ""],
    ["VV", "Výtvarná výchova (Vv)", ""],
    ["PC", "Pracovní činnosti (Pč)", ""],
    ["SVS", "Svs", ""],
    ["PKCJ", "PkČj", ""],
    ["PRPK", "PřPk", ""],
  ]);
  assert.match(subjects.getCell("A2").text, /aktuálních školních rozvrzích/);
  assert.doesNotMatch(
    subjectRows.map((row) => row[1]).join("\n"),
    /Revolution Train|Jumppark|Kampa|suplování/i,
  );

  const assignments = workbook.getWorksheet("5. Kdo co učí");
  assert.ok(assignments);
  const assignmentRows = filledRows(assignments, 13);
  const informaticsRows = assignmentRows.filter((row) => row[3] === "INF");
  assert.equal(informaticsRows.length, 25);

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
    const rows = informaticsRows.filter((row) => row[1] === classCode);
    const compactRows = rows.map((row) => [row[0], row[5], row[6]]);

    if (classCode === "8B") {
      assert.deepEqual(compactRows, [["8B-INF", "Celá třída", "1"]]);
      continue;
    }

    assert.deepEqual(compactRows, [
      [`${classCode}-INF-S1`, "Skupina 1", "1"],
      [`${classCode}-INF-S2`, "Skupina 2", "1"],
    ]);
  }

  assert.match(assignments.getCell("A2").text, /8\.B zůstává pro celou třídu/);

  const organization = workbook.getWorksheet("8. Organizační pravidla");
  assert.ok(organization);
  assert.match(organization.getCell("B6").text, /Všechny třídy kromě 8\.B/);
  assert.match(organization.getCell("C6").text, /KAD.*VAS/);
  assert.match(organization.getCell("B7").text, /12 hodin týdně/);
  assert.match(organization.getCell("C7").text, /úterý a ve středu/);
  assert.equal(organization.getCell("B8").text, "9.A + 9.C");
  assert.equal(organization.getCell("C8").text, "Společná výuka");
  assert.match(
    organization.getCell("A12").text,
    /9A a další společná třída 9C/,
  );
});
