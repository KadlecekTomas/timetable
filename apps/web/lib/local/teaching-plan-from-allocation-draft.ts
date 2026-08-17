import type {
  StaffingAllocationDraft,
  StaffingAllocationDraftRow,
} from "./staffing-allocation-draft";
import * as school from "./teaching-plan-school";
import type { TeachingPlan } from "./teaching-plan";

const AUTHORITATIVE_SCHOOL_CLASS_CODES = [
  "6.A",
  "6.B",
  "6.C",
  "6.D",
  "7.A",
  "7.B",
  "7.C",
  "8.A",
  "8.B",
  "8.C",
  "9.A",
  "9.B",
  "9.C",
] as const;

export function isAuthoritativeAllocationDraft(
  draft: StaffingAllocationDraft | null,
): draft is StaffingAllocationDraft {
  if (!draft?.rows.length) return false;
  return AUTHORITATIVE_SCHOOL_CLASS_CODES.every((classCode) => {
    const rows = draft.rows.filter((row) => row.classCode === classCode);
    return (
      rows.some((row) => row.subjectCode === "CJ") &&
      rows.some((row) => row.subjectCode === "M")
    );
  });
}

function sortedClassCodes(draft: StaffingAllocationDraft): string[] {
  return [
    ...new Set(draft.rows.map((row) => row.classCode).filter(Boolean)),
  ].sort((left, right) =>
    left.localeCompare(right, "cs-CZ", { numeric: true }),
  );
}

function rowFingerprint(row: StaffingAllocationDraftRow): string {
  return [
    row.classCode,
    row.subjectCode,
    row.weeklyPeriods,
    row.teacherExtraPeriods ?? 0,
    row.group,
    [...row.teacherIds].sort().join(","),
  ].join("|");
}

export function allocationDraftFingerprint(
  draft: StaffingAllocationDraft | null,
): string {
  if (!draft?.rows.length) return "";
  return [...draft.rows]
    .map(rowFingerprint)
    .sort((left, right) =>
      left.localeCompare(right, "cs-CZ", { numeric: true }),
    )
    .join("\n");
}

function uniqueTeacherIds(rows: StaffingAllocationDraftRow[]): string[] {
  return [...new Set(rows.flatMap((row) => row.teacherIds).filter(Boolean))];
}

function weeklyPeriods(rows: StaffingAllocationDraftRow[]): number {
  const values = [...new Set(rows.map((row) => row.weeklyPeriods))];
  return Math.max(...values, 0);
}

export function createTeachingPlanFromAllocationDraft(
  draft: StaffingAllocationDraft,
): TeachingPlan {
  const plan = school.createEmptyTeachingPlan();
  plan.classes = sortedClassCodes(draft).map((code) =>
    school.createTeachingPlanClass(code),
  );
  plan.rows = [];

  const grouped = new Map<string, StaffingAllocationDraftRow[]>();
  for (const item of draft.rows) {
    const key = `${item.classCode}|${item.subjectCode}`;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  for (const [key, rows] of [...grouped.entries()].sort(([left], [right]) =>
    left.localeCompare(right, "cs-CZ", { numeric: true }),
  )) {
    const [classCode = "", subjectCode = ""] = key.split("|");
    const group1 = rows.find((row) => row.group === "GROUP_1");
    const group2 = rows.find((row) => row.group === "GROUP_2");
    const whole = rows.find((row) => row.group === "WHOLE");
    const allTeacherIds = uniqueTeacherIds(rows);
    const explicitGroups = rows.filter((row) => row.group !== "WHOLE").length;
    const split = explicitGroups >= 2 || allTeacherIds.length >= 2;
    const primaryTeacherId = group1
      ? (group1.teacherIds[0] ?? allTeacherIds[0] ?? "")
      : (whole?.teacherIds[0] ?? allTeacherIds[0] ?? "");
    const secondaryTeacherId = group2
      ? (group2.teacherIds[0] ?? "")
      : (allTeacherIds.find((teacherId) => teacherId !== primaryTeacherId) ??
        "");

    const row = school.createTeachingPlanRow(classCode, subjectCode);
    row.weeklyPeriods = weeklyPeriods(rows);
    row.organization = split ? "SPLIT" : "WHOLE";
    row.primaryTeacherId = primaryTeacherId;
    row.secondaryTeacherId = split ? secondaryTeacherId : "";
    plan.rows.push(row);
  }

  return plan;
}
