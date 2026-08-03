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

// Normalize class metadata after every workbook import boundary.
function activeAnalysis(
  analysis: TeachingPlanWorkbookAnalysis,
): TeachingPlanWorkbookAnalysis {
  const activeClassCodes = new Set(
    analysis.plan.rows.flatMap((row) => [
      row.classCode,
      ...(row.additionalClassCodes ?? []),
    ]),
  );
  const seen = new Set<string>();
  const classes = analysis.plan.classes.filter((schoolClass) => {
    if (!activeClassCodes.has(schoolClass.code) || seen.has(schoolClass.code)) {
      return false;
    }
    seen.add(schoolClass.code);
    return true;
  });

  return {
    ...analysis,
    plan: {
      ...analysis.plan,
      classes,
    },
    summary: {
      ...analysis.summary,
      classes: classes.length,
    },
  };
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
  const workbook = hasKadlecek(staffingPlan)
    ? input
    : await withoutSchoolExample(input);
  return activeAnalysis(await analyzeSchoolWorkbook(workbook, staffingPlan));
}
