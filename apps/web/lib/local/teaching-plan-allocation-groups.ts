import type {
  StaffingAllocationDraft,
  StaffingAllocationDraftRow,
} from "./staffing-allocation-draft";
import type { TeachingPlan, TeachingPlanRow } from "./teaching-plan";

const ELECTIVE_ALLOCATION_CODES = new Set(["VOL", "PRPK", "SVS"]);

function subjectMatches(
  planSubjectCode: string,
  draftSubjectCode: string,
): boolean {
  return planSubjectCode === "VOL"
    ? ELECTIVE_ALLOCATION_CODES.has(draftSubjectCode)
    : planSubjectCode === draftSubjectCode;
}

function uniqueTeacherIds(rows: StaffingAllocationDraftRow[]): string[] {
  return [...new Set(rows.flatMap((row) => row.teacherIds).filter(Boolean))];
}

function restoreThirdGroup(
  row: TeachingPlanRow,
  draft: StaffingAllocationDraft,
): TeachingPlanRow {
  const candidates = draft.rows.filter(
    (item) =>
      item.classCode === row.classCode &&
      subjectMatches(row.subjectCode, item.subjectCode),
  );
  if (candidates.length === 0) return row;

  const group1 = candidates.find((item) => item.group === "GROUP_1");
  const group2 = candidates.find((item) => item.group === "GROUP_2");
  const group3 = candidates.find((item) => item.group === "GROUP_3");
  const whole = candidates.find((item) => item.group === "WHOLE");
  const allTeacherIds = uniqueTeacherIds(candidates);

  const primaryTeacherId =
    group1?.teacherIds[0] ?? whole?.teacherIds[0] ?? allTeacherIds[0] ?? "";
  const secondaryTeacherId =
    group2?.teacherIds[0] ??
    allTeacherIds.find((teacherId) => teacherId !== primaryTeacherId) ??
    "";
  const tertiaryTeacherId =
    group3?.teacherIds[0] ??
    allTeacherIds.find(
      (teacherId) =>
        teacherId !== primaryTeacherId && teacherId !== secondaryTeacherId,
    ) ??
    "";

  if (!primaryTeacherId || !secondaryTeacherId || !tertiaryTeacherId) {
    return row;
  }

  return {
    ...row,
    organization: "SPLIT",
    primaryTeacherId,
    secondaryTeacherId,
    tertiaryTeacherId,
    splitGroupCount: 3,
  };
}

/**
 * The authoritative curriculum workbook supplies weekly hours, while the
 * staffing allocation draft supplies the actual parallel teachers. The older
 * curriculum merger only carried two teachers, so restore a third explicit
 * parallel teacher before school operational rules normalize the plan.
 */
export function preserveThirdParallelTeachers(
  plan: TeachingPlan,
  draft: StaffingAllocationDraft | null,
): TeachingPlan {
  if (!draft?.rows.length) return plan;
  return {
    ...plan,
    rows: plan.rows.map((row) => restoreThirdGroup(row, draft)),
  };
}
