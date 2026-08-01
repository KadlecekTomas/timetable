import type ExcelJS from "exceljs";

import {
  CLIENT_TEMPLATE_FIRST_DATA_ROW,
  CLIENT_TEMPLATE_LAST_DATA_ROW,
  CLIENT_TEMPLATE_SHEET_NAMES,
} from "./client-workbook";

const ASSIGNMENT_COLUMN_COUNT = 12;

function readAssignmentRows(
  worksheet: ExcelJS.Worksheet,
): Array<Array<string | number | null>> {
  const rows: Array<Array<string | number | null>> = [];
  for (
    let rowNumber = CLIENT_TEMPLATE_FIRST_DATA_ROW;
    rowNumber <= CLIENT_TEMPLATE_LAST_DATA_ROW;
    rowNumber += 1
  ) {
    const code = worksheet.getCell(rowNumber, 1).text.trim();
    if (!code) continue;
    rows.push(
      Array.from({ length: ASSIGNMENT_COLUMN_COUNT }, (_, columnIndex) => {
        const value = worksheet.getCell(rowNumber, columnIndex + 1).value;
        return typeof value === "string" || typeof value === "number"
          ? value
          : null;
      }),
    );
  }
  return rows;
}

function clearAssignmentRows(worksheet: ExcelJS.Worksheet) {
  for (
    let rowNumber = CLIENT_TEMPLATE_FIRST_DATA_ROW;
    rowNumber <= CLIENT_TEMPLATE_LAST_DATA_ROW;
    rowNumber += 1
  ) {
    for (let column = 1; column <= ASSIGNMENT_COLUMN_COUNT; column += 1) {
      worksheet.getCell(rowNumber, column).value = null;
    }
  }
}

function replaceSplitInformatics(
  rows: Array<Array<string | number | null>>,
): Array<Array<string | number | null>> {
  return rows.flatMap((row) => {
    const subjectCode = String(row[2] ?? "").trim();
    const group = String(row[4] ?? "").trim();
    if (subjectCode !== "INF") return [row];
    if (group === "Skupina 2") return [];

    const classCode = String(row[1] ?? "").trim();
    return [
      [
        `${classCode}-INF`,
        classCode,
        "INF",
        null,
        "Celá třída",
        1,
        "Jednotlivé hodiny",
        0,
        null,
        "POČÍTAČOVÁ UČEBNA",
        1,
        0,
      ],
    ];
  });
}

function writeAssignmentRows(
  worksheet: ExcelJS.Worksheet,
  rows: Array<Array<string | number | null>>,
) {
  rows.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      worksheet.getCell(
        CLIENT_TEMPLATE_FIRST_DATA_ROW + rowIndex,
        columnIndex + 1,
      ).value = value;
    });
  });
}

function updateGuidance(workbook: ExcelJS.Workbook) {
  const guide = workbook.getWorksheet(CLIENT_TEMPLATE_SHEET_NAMES.guide);
  const assignments = workbook.getWorksheet(
    CLIENT_TEMPLATE_SHEET_NAMES.assignments,
  );
  const organization = workbook.getWorksheet("8. Organizační pravidla");
  if (!guide || !assignments || !organization) {
    throw new Error("Školní šablona nemá očekávané informační listy.");
  }

  assignments.getCell("A2").value =
    "Předpřipravené řádky rozdělí češtinu, matematiku a oba cizí jazyky na dvě poloviny. Informatika je jednou týdně pro celou třídu. Doplňte učitele a hodinovou dotaci; nepotřebné řádky smažte.";
  assignments.getRow(2).height = 56;

  guide.getCell("B33").value =
    "Na listu 5. Kdo co učí jsou připravené dvě poloviny pro český jazyk, matematiku a dva cizí jazyky. Informatika je připravená jako jedna hodina týdně pro celou třídu. Doplňte učitele; nepotřebné řádky smažte.";

  organization.getCell("E5").value =
    "Připraveno pro český jazyk, matematiku a dva cizí jazyky.";
  const informatics = [
    "Informatika",
    "Všechny třídy 6.A–9.C včetně 6.D",
    "1 hodina týdně pro celou třídu",
    "Bez dělení na skupiny",
    "Předpřipraveno jako 13 samostatných celotřídních vazeb.",
  ];
  informatics.forEach((value, columnIndex) => {
    const cell = organization.getCell(9, columnIndex + 1);
    cell.value = value;
    cell.alignment = { vertical: "top", wrapText: true };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFD0D5DD" } },
      left: { style: "thin", color: { argb: "FFD0D5DD" } },
      right: { style: "thin", color: { argb: "FFD0D5DD" } },
    };
  });
  organization.getCell("A9").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF4CC" },
  };
  organization.getCell("C9").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F5E9" },
  };
  organization.getCell("D9").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF3F5F7" },
  };
  organization.getRow(9).height = 48;
}

export function applySchoolStaffingOverrides(workbook: ExcelJS.Workbook) {
  const assignments = workbook.getWorksheet(
    CLIENT_TEMPLATE_SHEET_NAMES.assignments,
  );
  if (!assignments) {
    throw new Error("Školní šablona nemá list 5. Kdo co učí.");
  }

  const transformed = replaceSplitInformatics(readAssignmentRows(assignments));
  clearAssignmentRows(assignments);
  writeAssignmentRows(assignments, transformed);
  updateGuidance(workbook);
}
