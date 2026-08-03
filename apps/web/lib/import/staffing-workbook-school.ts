import ExcelJS from "exceljs";

import {
  STAFFING_WORKBOOK_SHEET,
  analyzeStaffingWorkbook,
  createStaffingWorkbookTemplate as createLegacyStaffingWorkbookTemplate,
  type StaffingWorkbookAnalysis,
  type StaffingWorkbookIssue,
} from "./staffing-workbook";

export {
  analyzeStaffingWorkbook,
  type StaffingWorkbookAnalysis,
  type StaffingWorkbookIssue,
};

const FIRST_DAY_COLUMN = 14;

function seedTeacherExamples(workbook: ExcelJS.Workbook): void {
  const worksheet = workbook.getWorksheet(STAFFING_WORKBOOK_SHEET);
  if (!worksheet) return;

  worksheet.getCell("A2").value =
    "Každý učitel je jeden řádek. První dva řádky jsou předvyplněný vzor školy; vedení je může opravit a doplnit.";
  worksheet.getCell("A4").value =
    "Kadleček: 17 h = INF 13 + TV 4. Vašáková: INF 12 h, učí pouze v úterý a ve středu.";

  // Tomáš Kadleček: 13 hodin informatiky + 4 hodiny TV.
  worksheet.getCell(6, 1).value = "Tomáš";
  worksheet.getCell(6, 2).value = "Kadleček";
  worksheet.getCell(6, 3).value = 17;
  worksheet.getCell(6, 4).value = "INF";
  worksheet.getCell(6, 5).value = 13;
  worksheet.getCell(6, 6).value = "TV";
  worksheet.getCell(6, 7).value = 4;
  for (let index = 0; index < 5; index += 1) {
    worksheet.getCell(6, FIRST_DAY_COLUMN + index).value = "Ne";
  }

  // Křestní jméno nebylo zadáno, proto zůstává prázdné a vedení ho musí doplnit.
  worksheet.getCell(7, 1).value = null;
  worksheet.getCell(7, 2).value = "Vašáková";
  worksheet.getCell(7, 3).value = 12;
  worksheet.getCell(7, 4).value = "INF";
  worksheet.getCell(7, 5).value = 12;
  worksheet.getCell(7, FIRST_DAY_COLUMN + 0).value = "Ano"; // pondělí
  worksheet.getCell(7, FIRST_DAY_COLUMN + 1).value = "Ne"; // úterý
  worksheet.getCell(7, FIRST_DAY_COLUMN + 2).value = "Ne"; // středa
  worksheet.getCell(7, FIRST_DAY_COLUMN + 3).value = "Ano"; // čtvrtek
  worksheet.getCell(7, FIRST_DAY_COLUMN + 4).value = "Ano"; // pátek

  const example = workbook.getWorksheet("Příklad");
  if (example) {
    example.spliceRows(1, example.rowCount);
    example.addRows([
      ["Učitel", "Úvazek", "Předměty", "Učí pouze"],
      ["Tomáš Kadleček", 17, "INF 13 + TV 4", "bez omezení dnů"],
      ["Vašáková (doplnit jméno)", 12, "INF 12", "Út + St"],
      ["TV 9.A kluci", 2, "jedna dvojhodina", "dělená výuka"],
      ["TV 9.C kluci", 2, "jedna dvojhodina", "dělená výuka"],
    ]);
    example.columns = [
      { width: 30 },
      { width: 12 },
      { width: 24 },
      { width: 24 },
    ];
    example.getRow(1).font = { bold: true };
  }
}

export async function createStaffingWorkbookTemplate(): Promise<Uint8Array> {
  const source = await createLegacyStaffingWorkbookTemplate();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(source);
  seedTeacherExamples(workbook);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
