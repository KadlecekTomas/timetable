import type { StaffingPlan } from "@/lib/local/staffing-plan";
import { loadStaffingAllocationDraft } from "@/lib/local/staffing-allocation-draft";
import { saveSchoolCurriculum } from "@/lib/local/school-curriculum";
import {
  applySchoolOperationalRules,
  type TeachingPlan,
} from "@/lib/local/teaching-plan";
import { preserveThirdParallelTeachers } from "@/lib/local/teaching-plan-allocation-groups";
import {
  analyzeTeachingPlanWorkbook as analyzeExistingSchoolWorkbook,
  createTeachingPlanWorkbook as createExistingSchoolWorkbook,
  type TeachingPlanWorkbookAnalysis,
  type TeachingPlanWorkbookIssue,
} from "./teaching-plan-workbook-school-entry";
import {
  preserveThreeGroupTvOnExport,
  preserveThreeGroupTvOnImport,
} from "./teaching-plan-workbook-third-groups";
import {
  analyzeSchoolCurriculumWorkbook,
  type SchoolCurriculumWorkbookAnalysis,
} from "./school-curriculum-workbook";

export type { TeachingPlanWorkbookAnalysis, TeachingPlanWorkbookIssue };

export async function createTeachingPlanWorkbook(
  staffingPlan: StaffingPlan,
  existingPlan?: TeachingPlan,
): Promise<Uint8Array> {
  const workbook = await createExistingSchoolWorkbook(
    staffingPlan,
    existingPlan,
  );
  return preserveThreeGroupTvOnExport(workbook, staffingPlan, existingPlan);
}

export async function analyzeTeachingPlanWorkbook(
  input: ArrayBuffer | Uint8Array,
  staffingPlan: StaffingPlan,
): Promise<TeachingPlanWorkbookAnalysis | SchoolCurriculumWorkbookAnalysis> {
  const allocationDraft = loadStaffingAllocationDraft();
  const curriculum = await analyzeSchoolCurriculumWorkbook(
    input,
    staffingPlan,
    allocationDraft,
  );
  if (curriculum) {
    curriculum.plan = preserveThirdParallelTeachers(
      curriculum.plan,
      allocationDraft,
    );
    curriculum.plan = applySchoolOperationalRules(
      curriculum.plan,
      staffingPlan,
      allocationDraft,
    );
    if (curriculum.valid && curriculum.curriculum) {
      saveSchoolCurriculum(curriculum.curriculum);
    }
    return curriculum;
  }

  const existing = await analyzeExistingSchoolWorkbook(input, staffingPlan);
  return preserveThreeGroupTvOnImport(input, staffingPlan, existing);
}
