import ExcelJS from "exceljs";

import type { StaffingPlan } from "@/lib/local/staffing-plan";
import type { TeachingPlan } from "@/lib/local/teaching-plan";
import {
  TEACHING_CLASSES_SHEET,
  TEACHING_PLAN_SHEET,
  TEACHING_ROTATIONS_SHEET,
  analyzeTeachingPlanWorkbook,
  createTeachingPlanWorkbook as createLegacyTeachingPlanWorkbook,
  type TeachingPlanWorkbookAnalysis,
  type TeachingPlanWorkbookIssue,
} from "./teaching-plan-workbook";

export {
  analyzeTeachingPlanWorkbook,
  type TeachingPlanWorkbookAnalysis,
  type TeachingPlanWorkbookIssue,
};

const SCHOOL_CLASSES = [
  "6.A",
  "6.B",
  "6.C",
  "6.D",
  "7.A",
  "7.B",
  "7.C",
  "8.A",
  "8.B",
  "8.C",
  "9.A",
  "9.B",
  "9.C",
] as const;

function classProfile(code: string): string {
  return /\.(B|D)$/.test(code) ? "Sportovní třída" : "Běžná třída";
}

function ensureSchoolClasses(workbook: ExcelJS.Workbook): void {
  const classes = workbook.getWorksheet(TEACHING_CLASSES_SHEET);
  if (!classes) return;

  SCHOOL_CLASSES.forEach((code, index) => {
    const row = 5 + index;
    classes.getCell(row, 1).value = code;
    classes.getCell(row, 2).value = Number(code.split(".")[0]);
    classes.getCell(row, 3).value = classProfile(code);
  });

  classes.state = "veryHidden";
}

function simplifyTeachingSheet(workbook: ExcelJS.Workbook): void {
  const plan = workbook.getWorksheet(TEACHING_PLAN_SHEET);
  if (!plan) return;

  plan.getCell("A1").value = "PŘIŘAZENÍ UČITELŮ K VÝUCE";
  plan.getCell("A2").value =
    "Třídy, předměty a hodinové dotace jsou připravené systémem. V běžném řádku pouze vyberte učitele.";
  plan.getCell("A3").value =
    "Druhého učitele vyplňte jen u dělené výuky. Ostatní technická nastavení lze později upravit přímo v aplikaci.";
  plan.getCell("A4").value =
    "Sportovní třídy systém rozpozná automaticky; jejich dotace zůstává stejná jako v daném ročníku.";

  plan.getCell(5, 1).value = "Třída";
  plan.getCell(5, 2).value = "Předmět";
  plan.getCell(5, 3).value = "Hodin týdně";
  plan.getCell(5, 7).value = "Učitel";
  plan.getCell(5, 8).value = "Druhý učitel (jen při dělení)";

  for (const column of [4, 5, 6, 9, 10]) {
    plan.getColumn(column).hidden = true;
  }

  plan.getColumn(1).width = 14;
  plan.getColumn(2).width = 24;
  plan.getColumn(3).width = 16;
  plan.getColumn(7).width = 34;
  plan.getColumn(8).width = 34;
  plan.autoFilter = { from: "A5", to: "H5" };
}

function hideAdvancedSheets(workbook: ExcelJS.Workbook): void {
  const rotations = workbook.getWorksheet(TEACHING_ROTATIONS_SHEET);
  if (rotations) rotations.state = "hidden";
}

export async function createTeachingPlanWorkbook(
  staffingPlan: StaffingPlan,
  existingPlan?: TeachingPlan,
): Promise<Uint8Array> {
  const source = await createLegacyTeachingPlanWorkbook(
    staffingPlan,
    existingPlan,
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(source);

  ensureSchoolClasses(workbook);
  simplifyTeachingSheet(workbook);
  hideAdvancedSheets(workbook);

  const output = await workbook.xlsx.writeBuffer();
  return new Uint8Array(output);
}
