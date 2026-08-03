import type { StaffingPlan } from "@/lib/local/staffing-plan";
import { loadStaffingAllocationDraft } from "@/lib/local/staffing-allocation-draft";
import { saveSchoolCurriculum } from "@/lib/local/school-curriculum";
import {
  analyzeTeachingPlanWorkbook as analyzeExistingSchoolWorkbook,
  createTeachingPlanWorkbook,
  type TeachingPlanWorkbookAnalysis,
  type TeachingPlanWorkbookIssue,
} from "./teaching-plan-workbook-school-entry";
import {
  analyzeSchoolCurriculumWorkbook,
  type SchoolCurriculumWorkbookAnalysis,
} from "./school-curriculum-workbook";

export {
  createTeachingPlanWorkbook,
  type TeachingPlanWorkbookAnalysis,
  type TeachingPlanWorkbookIssue,
};

export async function analyzeTeachingPlanWorkbook(
  input: ArrayBuffer | Uint8Array,
  staffingPlan: StaffingPlan,
): Promise<TeachingPlanWorkbookAnalysis | SchoolCurriculumWorkbookAnalysis> {
  const curriculum = await analyzeSchoolCurriculumWorkbook(
    input,
    staffingPlan,
    loadStaffingAllocationDraft(),
  );
  if (curriculum) {
    if (curriculum.valid && curriculum.curriculum) {
      saveSchoolCurriculum(curriculum.curriculum);
    }
    return curriculum;
  }
  return analyzeExistingSchoolWorkbook(input, staffingPlan);
}
