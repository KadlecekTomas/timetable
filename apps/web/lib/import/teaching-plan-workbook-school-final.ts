import ExcelJS from "exceljs";

import type { StaffingPlan } from "@/lib/local/staffing-plan";
import type { TeachingPlan } from "@/lib/local/teaching-plan";
import {
  analyzeTeachingPlanWorkbook,
  createTeachingPlanWorkbook as createSchoolTeachingPlanWorkbook,
  type TeachingPlanWorkbookAnalysis,
  type TeachingPlanWorkbookIssue,
} from "./teaching-plan-workbook-school";

export {
  analyzeTeachingPlanWorkbook,
  type TeachingPlanWorkbookAnalysis,
  type TeachingPlanWorkbookIssue,
};

const TEACHING_PLAN_SHEET = "Výuka tříd";
const SHARED_GROUPS_SHEET = "Společné skupiny";

function removeIncorrectSeparateTvExamples(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.getWorksheet(TEACHING_PLAN_SHEET);
  if (!sheet) return;

  sheet.getCell("A4").value =
    "Společnou nebo dělenou výuku více tříd nastavte na listu Společné skupiny. Zde zůstává pouze hodinová dotace jednotlivých tříd.";

  for (let row = 6; row <= 305; row += 1) {
    const classCode = String(sheet.getCell(row, 1).value ?? "").trim();
    const subjectCode = String(sheet.getCell(row, 2).value ?? "").trim();
    if (!["9.A", "9.C"].includes(classCode) || subjectCode !== "TV")
      continue;

    // Dotace třídy zůstává 2 h. Konkrétní společná skupina kluků se nesmí
    // modelovat jako dvě samostatné výuky, jinak by solver započítal učitele 2×.
    sheet.getCell(row, 3).value = 2;
    sheet.getCell(row, 4).value = "Pouze dvojhodiny";
    sheet.getCell(row, 5).value = null;
    sheet.getCell(row, 6).value = "Celá třída";
    sheet.getCell(row, 7).value = null;
    sheet.getCell(row, 8).value = null;
  }
}

function addSharedGroupsSheet(workbook: ExcelJS.Workbook): void {
  const oldSheet = workbook.getWorksheet(SHARED_GROUPS_SHEET);
  if (oldSheet) workbook.removeWorksheet(oldSheet.id);

  const sheet = workbook.addWorksheet(SHARED_GROUPS_SHEET, {
    views: [{ state: "frozen", ySplit: 5 }],
  });

  sheet.mergeCells("A1:K1");
  sheet.getCell("A1").value = "SPOLEČNÁ A DĚLENÁ VÝUKA VÍCE TŘÍD";
  sheet.getCell("A1").font = {
    bold: true,
    size: 16,
    color: { argb: "FFFFFFFF" },
  };
  sheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF3157C8" },
  };

  sheet.mergeCells("A2:K2");
  sheet.getCell("A2").value =
    "Jeden řádek = jedna skutečná skupina. Třídy oddělte čárkou. Vedení školy zde může měnit spojení tříd i učitele.";
  sheet.mergeCells("A3:K3");
  sheet.getCell("A3").value =
    "Stejný paralelní klíč znamená: skupiny mají probíhat ve stejném čase. Preferované hodiny jsou měkké přání, ne blokace řešení.";
  sheet.mergeCells("A4:K4");
  sheet.getCell("A4").value =
    "Vzor: kluci 9.A + 9.C mají společně 4 h TV = 2× dvojhodina. Paralelní skupinu holek doplní vedení podle skutečné organizace školy.";

  sheet.getRow(5).values = [
    "Předmět",
    "Třídy",
    "Skupina",
    "Hodin týdně",
    "Počet dvojhodin",
    "Učitel",
    "Paralelní klíč",
    "Musí současně?",
    "Preferovaný začátek",
    "Priorita preference",
    "Poznámka",
  ];
  sheet.getRow(5).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(5).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF17355C" },
  };
  sheet.getRow(5).alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };

  sheet.columns = [
    { width: 16 },
    { width: 18 },
    { width: 18 },
    { width: 15 },
    { width: 18 },
    { width: 30 },
    { width: 22 },
    { width: 18 },
    { width: 20 },
    { width: 20 },
    { width: 42 },
  ];

  const row = 6;
  sheet.getCell(row, 1).value = "TV";
  sheet.getCell(row, 2).value = "9.A, 9.C";
  sheet.getCell(row, 3).value = "Kluci";
  sheet.getCell(row, 4).value = 4;
  sheet.getCell(row, 5).value = 2;
  sheet.getCell(row, 6).value = "KAD · Tomáš Kadleček";
  sheet.getCell(row, 7).value = "TV-9AC";
  sheet.getCell(row, 8).value = "Ano";
  sheet.getCell(row, 9).value = "6.–7. hodina";
  sheet.getCell(row, 10).value = "Vysoká";
  sheet.getCell(row, 11).value =
    "Jedna společná skupina kluků z 9.A a 9.C; celkem 4 h týdně, ideálně 2× dvojhodina.";

  const girlsRow = 7;
  sheet.getCell(girlsRow, 1).value = "TV";
  sheet.getCell(girlsRow, 2).value = "9.A, 9.C";
  sheet.getCell(girlsRow, 3).value = "Holky – upravit podle školy";
  sheet.getCell(girlsRow, 4).value = 4;
  sheet.getCell(girlsRow, 5).value = 2;
  sheet.getCell(girlsRow, 6).value = null;
  sheet.getCell(girlsRow, 7).value = "TV-9AC";
  sheet.getCell(girlsRow, 8).value = "Ano";
  sheet.getCell(girlsRow, 9).value = "6.–7. hodina";
  sheet.getCell(girlsRow, 10).value = "Vysoká";
  sheet.getCell(girlsRow, 11).value =
    "Vedení upraví třídy, skupinu i učitele podle skutečné organizace TV.";

  for (let dataRow = 6; dataRow <= 105; dataRow += 1) {
    sheet.getCell(dataRow, 8).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Ano,Ne"'],
    };
    sheet.getCell(dataRow, 9).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [
        '"Bez preference,1.–2. hodina,3.–4. hodina,5.–6. hodina,6.–7. hodina,7.–8. hodina"',
      ],
    };
    sheet.getCell(dataRow, 10).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Nízká,Střední,Vysoká"'],
    };
  }

  sheet.autoFilter = { from: "A5", to: "K5" };
}

export async function createTeachingPlanWorkbook(
  staffingPlan: StaffingPlan,
  existingPlan?: TeachingPlan,
): Promise<Uint8Array> {
  const source = await createSchoolTeachingPlanWorkbook(
    staffingPlan,
    existingPlan,
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(source);
  removeIncorrectSeparateTvExamples(workbook);
  addSharedGroupsSheet(workbook);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
