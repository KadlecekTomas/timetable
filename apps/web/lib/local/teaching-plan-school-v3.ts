import type { StaffingAllocationDraft } from "./staffing-allocation-draft";
import { SCHOOL_SPLIT_SUBJECT_CODES } from "./school-default-data";
import type { SchoolCurriculum } from "./school-curriculum";
import type { StaffingPlan } from "./staffing-plan-school-v2";
import { SCHOOL_CLASS_CODES } from "./teaching-plan-school";
import type { TeachingPlan } from "./teaching-plan";
import * as base from "./teaching-plan-school-v2";

export * from "./teaching-plan-school-v2";

function isCurrentSchoolPlan(plan: TeachingPlan): boolean {
  const allowedCodes = new Set<string>(SCHOOL_CLASS_CODES);
  const classCodes = new Set(plan.classes.map((schoolClass) => schoolClass.code));
  return (
    classCodes.size >= 10 &&
    [...classCodes].every((classCode) => allowedCodes.has(classCode))
  );
}

export function enforceMandatorySchoolSplits(
  plan: TeachingPlan,
): TeachingPlan {
  if (!isCurrentSchoolPlan(plan)) return plan;

  return {
    ...plan,
    rows: plan.rows.map((row) =>
      row.organization !== "ROTATION" &&
      SCHOOL_SPLIT_SUBJECT_CODES.has(row.subjectCode)
        ? { ...row, organization: "SPLIT" as const }
        : row,
    ),
  };
}

export function applySchoolOperationalRules(
  plan: TeachingPlan,
  staffingPlan: StaffingPlan,
  allocationDraft: StaffingAllocationDraft | null = null,
): TeachingPlan {
  return enforceMandatorySchoolSplits(
    base.applySchoolOperationalRules(plan, staffingPlan, allocationDraft),
  );
}

export function createDefaultSchoolTeachingPlan(
  curriculum: SchoolCurriculum,
  staffingPlan: StaffingPlan,
  allocationDraft: StaffingAllocationDraft | null,
): TeachingPlan {
  return enforceMandatorySchoolSplits(
    base.createDefaultSchoolTeachingPlan(
      curriculum,
      staffingPlan,
      allocationDraft,
    ),
  );
}

export function loadTeachingPlan(): TeachingPlan {
  return enforceMandatorySchoolSplits(base.loadTeachingPlan());
}

export function saveTeachingPlan(plan: TeachingPlan): TeachingPlan {
  const enforced = enforceMandatorySchoolSplits(plan);
  return enforceMandatorySchoolSplits(base.saveTeachingPlan(enforced));
}

export function validateTeachingPlan(
  plan: TeachingPlan,
  staffingPlan: StaffingPlan,
): string[] {
  return base.validateTeachingPlan(
    enforceMandatorySchoolSplits(plan),
    staffingPlan,
  );
}
