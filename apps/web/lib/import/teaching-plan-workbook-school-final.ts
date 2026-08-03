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

function setSplitTvExamples(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.getWorksheet(TEACHING_PLAN_SHEET);
  if (!sheet) return;

  sheet.getCell("A4").value =
    "TV v 9.A a 9.C je dělená na kluky a holky. Tomáš Kadleček učí kluky vždy v jedné dvojhodině; učitele dívek vedení doplní.";

  for (let row = 6; row <= 305; row += 1) {
    const classCode = String(sheet.getCell(row, 1).value ?? "").trim();
    const subjectCode = String(sheet.getCell(row, 2).value ?? "").trim();
    if (!(["9.A", "9.C"].includes(classCode) && subjectCode === "TV")) {
      continue;
    }

    sheet.getCell(row, 3).value = 2;
    sheet.getCell(row, 4).value = "Pouze dvojhodiny";
    sheet.getCell(row, 5).value = null;
    sheet.getCell(row, 6).value = "Dvě skupiny";
    sheet.getCell(row, 7).value = "KAD · Tomáš Kadleček";
    sheet.getCell(row, 8).value = null;
    sheet.getCell(row, 8).note =
      "Doplňte učitele pro skupinu dívek. Obě skupiny probíhají současně.";
  }
}

export async function createTeachingPlanWorkbook(
  staffingPlan: StaffingPlan,
  existingPlan?: TeachingPlan,
): Promise<Uint8Array> {
  const source = await createSchoolTeachingPlanWorkbook(staffingPlan, existingPlan);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(source);
  setSplitTvExamples(workbook);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
