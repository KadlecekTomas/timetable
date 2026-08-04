import {
  MAX_WEEKLY_TEACHER_LOAD,
  type StaffingPlan,
} from "../local/staffing-plan";
import { teachingTargetWeeklyLoad } from "../local/staffing-plan-school-v2";
import {
  rowTeacherPeriods,
  type TeachingPlan,
  type TeachingPlanRow,
} from "../local/teaching-plan";

export interface RotationCandidate {
  classCode: string;
  sourceRowIds: [string, string];
  rotationHours: number;
  residualHours: number;
  teacherLoadsBefore: Record<string, number>;
  teacherLoadsAfter: Record<string, number>;
  transformedRows: TeachingPlanRow[];
}

export interface RotationRejection {
  classCode: string;
  reason: string;
}
export interface RotationProposal {
  candidates: RotationCandidate[];
  rejected: RotationRejection[];
  residualUncoveredHours: number;
  plan: TeachingPlan;
}

function matchesSubject(
  staffingPlan: StaffingPlan,
  teacherId: string,
  subjectCode: string,
) {
  return (
    staffingPlan.teachers
      .find((teacher) => teacher.id === teacherId)
      ?.subjectLoads.some(
        (load) => load.subjectCode === subjectCode && load.weeklyPeriods > 0,
      ) ?? false
  );
}

function workload(plan: TeachingPlan, teacherId: string): number {
  return plan.rows.reduce(
    (total, row) => total + rowTeacherPeriods(row, teacherId),
    0,
  );
}

function eligible(row: TeachingPlanRow | undefined): row is TeachingPlanRow {
  return Boolean(
    row &&
      row.organization === "SPLIT" &&
      row.primaryTeacherId &&
      !row.secondaryTeacherId,
  );
}

export function proposeCzechMathRotations(
  plan: TeachingPlan,
  staffingPlan: StaffingPlan,
): RotationProposal {
  const candidates: RotationCandidate[] = [];
  const rejected: RotationRejection[] = [];
  let projected = structuredClone(plan);

  for (const schoolClass of plan.classes) {
    const rows = plan.rows.filter((row) => row.classCode === schoolClass.code);
    const czech = rows.find((row) => row.subjectCode === "CJ");
    const math = rows.find((row) => row.subjectCode === "M");
    if (!czech && !math) continue;
    if (!eligible(czech) || !eligible(math)) {
      rejected.push({
        classCode: schoolClass.code,
        reason:
          "ČJ a M musí být neúplně dělené řádky s jedním hlavním učitelem.",
      });
      continue;
    }
    if (czech.primaryTeacherId === math.primaryTeacherId) {
      rejected.push({
        classCode: schoolClass.code,
        reason: "Rotace vyžaduje dva různé učitele.",
      });
      continue;
    }
    if (
      !matchesSubject(staffingPlan, czech.primaryTeacherId, "CJ") ||
      !matchesSubject(staffingPlan, math.primaryTeacherId, "M")
    ) {
      rejected.push({
        classCode: schoolClass.code,
        reason: "Učitelé neodpovídají předmětům ČJ a M.",
      });
      continue;
    }
    const rotationHours = Math.min(czech.weeklyPeriods, math.weeklyPeriods);
    if (rotationHours <= 0) {
      rejected.push({
        classCode: schoolClass.code,
        reason: "Pro rotaci chybí kladná hodinová dotace.",
      });
      continue;
    }
    const rotation: TeachingPlanRow = {
      ...czech,
      id: `rotation:${czech.id}:${math.id}`,
      weeklyPeriods: rotationHours,
      organization: "ROTATION",
      secondarySubjectCode: "M",
      secondaryTeacherId: math.primaryTeacherId,
      rotationPlacement: "ADJACENT",
    };
    const transformedRows: TeachingPlanRow[] = [rotation];
    for (const source of [czech, math]) {
      const remaining = source.weeklyPeriods - rotationHours;
      if (remaining > 0) {
        transformedRows.push({
          ...source,
          id: `${source.id}:residual`,
          weeklyPeriods: remaining,
          secondaryTeacherId: "",
        });
      }
    }
    const next = {
      ...projected,
      rows: projected.rows
        .filter((row) => row.id !== czech.id && row.id !== math.id)
        .concat(transformedRows),
    };
    const teacherIds = [czech.primaryTeacherId, math.primaryTeacherId];
    const before = Object.fromEntries(
      teacherIds.map((id) => [id, workload(projected, id)]),
    );
    const after = Object.fromEntries(
      teacherIds.map((id) => [id, workload(next, id)]),
    );
    const overloaded = teacherIds.find((id) => {
      const teacher = staffingPlan.teachers.find((item) => item.id === id)!;
      const limit = Math.min(
        MAX_WEEKLY_TEACHER_LOAD,
        teachingTargetWeeklyLoad(teacher),
      );
      return after[id]! > limit;
    });
    if (overloaded) {
      const teacher = staffingPlan.teachers.find(
        (item) => item.id === overloaded,
      )!;
      rejected.push({
        classCode: schoolClass.code,
        reason: `${teacher.firstName} ${teacher.lastName}: rotace by zvýšila výuku na ${after[overloaded]} hodin nad kapacitu ${teachingTargetWeeklyLoad(teacher)} hodin.`,
      });
      continue;
    }
    candidates.push({
      classCode: schoolClass.code,
      sourceRowIds: [czech.id, math.id],
      rotationHours,
      residualHours: transformedRows
        .slice(1)
        .reduce((sum, row) => sum + row.weeklyPeriods, 0),
      teacherLoadsBefore: before,
      teacherLoadsAfter: after,
      transformedRows,
    });
    projected = next;
  }

  return {
    candidates,
    rejected,
    residualUncoveredHours: candidates.reduce(
      (sum, item) => sum + item.residualHours,
      0,
    ),
    plan: projected,
  };
}
