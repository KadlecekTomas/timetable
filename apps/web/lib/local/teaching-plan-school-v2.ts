import type { StaffingPlan } from "@/lib/local/staffing-plan";
import {
  loadSchoolCurriculum,
  validatePlanAgainstSchoolCurriculum,
} from "./school-curriculum";
import * as school from "./teaching-plan-school";
import type { TeachingPlan } from "./teaching-plan";

export * from "./teaching-plan-school";

function isObsoleteEqualProfileMessage(message: string): boolean {
  return (
    message.includes(
      "sportovní třída musí mít stejnou předmětovou hodinovou dotaci",
    ) || message.includes("sportovní třídy B/D nemají referenční třídu")
  );
}

/**
 * The uploaded curriculum workbook is the authority for regular/sports class
 * allocations. The previous school adapter assumed both profiles were equal;
 * those obsolete checks are removed and replaced by the imported profile.
 */
export function validateTeachingPlan(
  plan: TeachingPlan,
  staffingPlan: StaffingPlan,
): string[] {
  return [
    ...school
      .validateTeachingPlan(plan, staffingPlan)
      .filter((message) => !isObsoleteEqualProfileMessage(message)),
    ...validatePlanAgainstSchoolCurriculum(plan, loadSchoolCurriculum()),
  ];
}
