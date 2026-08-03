import ExcelJS from "exceljs";

import type { StaffingPlan } from "@/lib/local/staffing-plan";
import type { TeachingPlan } from "@/lib/local/teaching-plan";
import {
  analyzeTeachingPlanWorkbook as analyzeSchoolWorkbook,
  createTeachingPlanWorkbook as createSchoolWorkbook,
  type TeachingPlanWorkbookAnalysis,
  type TeachingPlanWorkbookIssue,
} from "./teaching-plan-workbook-school-final";

export type { TeachingPlanWorkbookAnalysis, TeachingPlanWorkbookIssue };

const SHARED_GROUPS_SHEET = "Společné skupiny";

function hasKadlecek(staffingPlan: StaffingPlan): boolean {
  return staffingPlan.teachers.some(
    (teacher) =>
      `${teacher.firstName} ${teacher.lastName}`
        .trim()
        .toLocaleLowerCase("cs-CZ") === "tomáš kadleček",
  );
}

async function withoutSchoolExample(
  input: ArrayBuffer | Uint8Array,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  await workbook.xlsx.load(bytes as never);
  const sheet = workbook.getWorksheet(SHARED_GROUPS_SHEET);
  if (sheet) {
    for (let column = 1; column <= 11; column += 1) {
      sheet.getCell(6, column).value = null;
    }
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function createTeachingPlanWorkbook(
  staffingPlan: StaffingPlan,
  existingPlan?: TeachingPlan,
): Promise<Uint8Array> {
  const workbook = await createSchoolWorkbook(staffingPlan, existingPlan);
  if (hasKadlecek(staffingPlan)) return workbook;
  return withoutSchoolExample(workbook);
}

export async function analyzeTeachingPlanWorkbook(
  input: ArrayBuffer | Uint8Array,
  staffingPlan: StaffingPlan,
): Promise<TeachingPlanWorkbookAnalysis> {
  if (hasKadlecek(staffingPlan)) {
    return analyzeSchoolWorkbook(input, staffingPlan);
  }
  const workbook = await withoutSchoolExample(input);
  return analyzeSchoolWorkbook(workbook, staffingPlan);
}
