import * as base from "./staffing-plan";

export * from "./staffing-plan";

export const NON_TEACHING_SUBJECT_CODES = new Set(["ICT_VEDENI", "NEVYUKA"]);

/**
 * School planning needs explicit pseudo-subjects:
 * - VOL keeps the curriculum envelope for compulsory electives visible.
 * - ICT_VEDENI and NEVYUKA consume contracted workload but are not scheduled.
 * - REZERVA is genuine teaching capacity that is still available to assign.
 */
export const STAFFING_SUBJECTS = [
  ...base.STAFFING_SUBJECTS,
  { code: "VOL", label: "Povinně volitelné předměty" },
  { code: "ICT_VEDENI", label: "Vedoucí ICT / ICT koordinace" },
  { code: "NEVYUKA", label: "Nevýuková činnost / funkce" },
  { code: "REZERVA", label: "Rezerva / zatím nepřiřazeno" },
] as const;

export function nonTeachingWeeklyLoad(teacher: base.StaffingTeacher): number {
  return teacher.subjectLoads
    .filter((item) => NON_TEACHING_SUBJECT_CODES.has(item.subjectCode))
    .reduce((total, item) => total + item.weeklyPeriods, 0);
}

export function teachingTargetWeeklyLoad(
  teacher: base.StaffingTeacher,
): number {
  return Math.max(0, teacher.targetWeeklyLoad - nonTeachingWeeklyLoad(teacher));
}
