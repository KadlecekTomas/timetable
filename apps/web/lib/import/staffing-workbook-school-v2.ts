import ExcelJS from "exceljs";

import {
  clearStaffingAllocationDraft,
  saveStaffingAllocationDraft,
} from "@/lib/local/staffing-allocation-draft";
import {
  analyzeStaffingWorkbook as analyzeSchoolStaffingWorkbook,
  createStaffingWorkbookTemplate,
  type StaffingWorkbookAnalysis,
  type StaffingWorkbookIssue,
} from "./staffing-workbook-school";
import {
  analyzeLegacyStaffingPlan,
  type LegacyStaffingPlanAnalysis,
} from "./legacy-staffing-plan";

export {
  createStaffingWorkbookTemplate,
  type StaffingWorkbookAnalysis,
  type StaffingWorkbookIssue,
};

export async function analyzeStaffingWorkbook(
  input: ArrayBuffer | Uint8Array,
): Promise<StaffingWorkbookAnalysis | LegacyStaffingPlanAnalysis> {
  const workbook = new ExcelJS.Workbook();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  try {
    await workbook.xlsx.load(bytes as never);
  } catch {
    return analyzeSchoolStaffingWorkbook(input);
  }

  const legacy = analyzeLegacyStaffingPlan(workbook);
  if (legacy) {
    if (legacy.valid && legacy.allocationDraft) {
      saveStaffingAllocationDraft(legacy.allocationDraft);
    }
    return legacy;
  }

  const analysis = await analyzeSchoolStaffingWorkbook(input);
  if (analysis.valid) clearStaffingAllocationDraft();
  return analysis;
}
