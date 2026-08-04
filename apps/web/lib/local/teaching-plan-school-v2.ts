import type {
  StaffingAllocationDraft,
  StaffingAllocationDraftRow,
} from "./staffing-allocation-draft";
import { loadStaffingAllocationDraft } from "./staffing-allocation-draft";
import {
  createDefaultSchoolCurriculum,
  SCHOOL_SPLIT_SUBJECT_CODES,
} from "./school-default-data";
import {
  loadSchoolCurriculum,
  saveSchoolCurriculum,
  validatePlanAgainstSchoolCurriculum,
  type SchoolCurriculum,
} from "./school-curriculum";
import {
  loadStaffingPlan,
  nonTeachingWeeklyLoad,
  type StaffingPlan,
} from "./staffing-plan-school-v2";
import * as school from "./teaching-plan-school";
import type {
  TeachingPlan,
  TeachingPlanRow,
  TeachingOrganization,
} from "./teaching-plan";

export * from "./teaching-plan-school";

declare module "./teaching-plan" {
  interface TeachingPlanRow {
    workloadCredits?: Record<string, number>;
  }
}

const WORKLOAD_CREDITS_STORAGE_KEY =
  "rozvrhar:teaching-plan-workload-credits:v1";

const CURRENT_SCHOOL_CLASS_CODES = [
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

function isObsoleteEqualProfileMessage(message: string): boolean {
  return (
    message.includes(
      "sportovní třída musí mít stejnou předmětovou hodinovou dotaci",
    ) || message.includes("sportovní třídy B/D nemají referenční třídu")
  );
}

function isCurrentSchoolPlan(plan: TeachingPlan): boolean {
  const classCodes = new Set(
    plan.classes.map((schoolClass) => schoolClass.code),
  );
  return CURRENT_SCHOOL_CLASS_CODES.every((code) => classCodes.has(code));
}

function gradeForClass(code: string): number {
  return Number(code.split(".")[0]);
}

function profileForClass(code: string): "REGULAR" | "SPORTS" {
  return /\.(B|D)$/.test(code) ? "SPORTS" : "REGULAR";
}

function allocationRows(
  draft: StaffingAllocationDraft | null,
  classCode: string,
  subjectCode: string,
): StaffingAllocationDraftRow[] {
  return (
    draft?.rows.filter(
      (row) => row.classCode === classCode && row.subjectCode === subjectCode,
    ) ?? []
  );
}

function candidateTeacherIds(
  draft: StaffingAllocationDraft | null,
  classCode: string,
  subjectCode: string,
): { primaryTeacherId: string; secondaryTeacherId: string } {
  const candidates = allocationRows(draft, classCode, subjectCode);
  const group1 = candidates.find((item) => item.group === "GROUP_1");
  const group2 = candidates.find((item) => item.group === "GROUP_2");
  const whole = candidates.find((item) => item.group === "WHOLE");
  const all = [
    ...new Set(candidates.flatMap((item) => item.teacherIds).filter(Boolean)),
  ];
  const primaryTeacherId =
    group1?.teacherIds[0] ?? whole?.teacherIds[0] ?? all[0] ?? "";
  const secondaryTeacherId =
    group2?.teacherIds[0] ??
    whole?.teacherIds.find((teacherId) => teacherId !== primaryTeacherId) ??
    all.find((teacherId) => teacherId !== primaryTeacherId) ??
    "";
  return { primaryTeacherId, secondaryTeacherId };
}

function organizationForRow(
  row: TeachingPlanRow,
  mustSplit: boolean,
  candidateSecondaryTeacherId: string,
): TeachingOrganization {
  if (mustSplit) return "SPLIT";
  if (row.organization === "ROTATION") return "ROTATION";
  if (row.organization === "SPLIT" || candidateSecondaryTeacherId) {
    return "SPLIT";
  }
  return "WHOLE";
}

function operationalRow(
  row: TeachingPlanRow,
  draft: StaffingAllocationDraft | null,
): TeachingPlanRow {
  const candidates = candidateTeacherIds(draft, row.classCode, row.subjectCode);
  const mustSplit = SCHOOL_SPLIT_SUBJECT_CODES.has(row.subjectCode);
  const organization = organizationForRow(
    row,
    mustSplit,
    candidates.secondaryTeacherId,
  );
  const isNinthGradeRegularTv =
    row.subjectCode === "TV" &&
    ["9.A", "9.C"].includes(row.classCode) &&
    row.weeklyPeriods === 2;

  return {
    ...row,
    organization,
    primaryTeacherId: row.primaryTeacherId || candidates.primaryTeacherId,
    secondaryTeacherId:
      organization === "WHOLE"
        ? ""
        : row.secondaryTeacherId || candidates.secondaryTeacherId,
    lessonShape: isNinthGradeRegularTv ? "DOUBLE" : row.lessonShape,
    doublePeriodsCount: isNinthGradeRegularTv ? 1 : row.doublePeriodsCount,
    additionalClassCodes: isNinthGradeRegularTv
      ? []
      : (row.additionalClassCodes ?? []),
    workloadCredits: undefined,
  };
}

function teacherHasRow(row: TeachingPlanRow, teacherId: string): boolean {
  return (
    row.primaryTeacherId === teacherId ||
    (row.organization !== "WHOLE" && row.secondaryTeacherId === teacherId)
  );
}

function addNonTeachingCredits(
  plan: TeachingPlan,
  staffingPlan: StaffingPlan,
): TeachingPlan {
  const rows: TeachingPlanRow[] = plan.rows.map((row) => ({
    ...row,
    workloadCredits: undefined,
  }));

  for (const teacher of staffingPlan.teachers) {
    const credit = nonTeachingWeeklyLoad(teacher);
    if (credit <= 0) continue;
    const row = rows
      .filter((item) => teacherHasRow(item, teacher.id))
      .sort((left, right) =>
        `${left.classCode}|${left.subjectCode}|${left.id}`.localeCompare(
          `${right.classCode}|${right.subjectCode}|${right.id}`,
          "cs-CZ",
          { numeric: true },
        ),
      )[0];
    if (!row) continue;
    row.workloadCredits = {
      ...(row.workloadCredits ?? {}),
      [teacher.id]: credit,
    };
  }

  return { ...plan, rows };
}

function readStoredWorkloadCredits(): Record<string, Record<string, number>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(WORKLOAD_CREDITS_STORAGE_KEY);
    if (!raw) return {};
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object"
      ? (value as Record<string, Record<string, number>>)
      : {};
  } catch {
    return {};
  }
}

function applyStoredWorkloadCredits(plan: TeachingPlan): TeachingPlan {
  const stored = readStoredWorkloadCredits();
  return {
    ...plan,
    rows: plan.rows.map((row) => ({
      ...row,
      workloadCredits: stored[row.id],
    })),
  };
}

function writeStoredWorkloadCredits(plan: TeachingPlan): void {
  if (typeof window === "undefined") return;
  const value = Object.fromEntries(
    plan.rows.flatMap((row) =>
      row.workloadCredits && Object.keys(row.workloadCredits).length > 0
        ? [[row.id, row.workloadCredits] as const]
        : [],
    ),
  );
  window.localStorage.setItem(
    WORKLOAD_CREDITS_STORAGE_KEY,
    JSON.stringify(value),
  );
}

export function applySchoolOperationalRules(
  plan: TeachingPlan,
  staffingPlan: StaffingPlan,
  allocationDraft: StaffingAllocationDraft | null = null,
): TeachingPlan {
  const enforced = school.enforceSchoolTeachingPlanRules({
    ...plan,
    rows: plan.rows.map((row) => operationalRow(row, allocationDraft)),
  });
  return addNonTeachingCredits(enforced, staffingPlan);
}

export function createDefaultSchoolTeachingPlan(
  curriculum: SchoolCurriculum,
  staffingPlan: StaffingPlan,
  allocationDraft: StaffingAllocationDraft | null,
): TeachingPlan {
  const plan = school.createEmptyTeachingPlan();
  plan.rows = [];

  for (const schoolClass of plan.classes) {
    const profile = profileForClass(schoolClass.code);
    const grade = gradeForClass(schoolClass.code);
    const source = curriculum.profiles[profile];
    for (const subject of source.subjects) {
      const weeklyPeriods = subject.weeklyPeriodsByGrade[String(grade)] ?? 0;
      if (weeklyPeriods <= 0) continue;
      const row = school.createTeachingPlanRow(
        schoolClass.code,
        subject.subjectCode,
      );
      row.weeklyPeriods = weeklyPeriods;
      plan.rows.push(row);
    }
  }

  return applySchoolOperationalRules(plan, staffingPlan, allocationDraft);
}

export function createEmptyTeachingPlan(): TeachingPlan {
  return school.createEmptyTeachingPlan();
}

export function loadTeachingPlan(): TeachingPlan {
  const staffingPlan = loadStaffingPlan();
  const allocationDraft = loadStaffingAllocationDraft();
  const curriculum =
    loadSchoolCurriculum() ??
    saveSchoolCurriculum(createDefaultSchoolCurriculum());
  const loaded = applyStoredWorkloadCredits(school.loadTeachingPlan());
  const plan =
    loaded.rows.length > 0
      ? applySchoolOperationalRules(loaded, staffingPlan, allocationDraft)
      : createDefaultSchoolTeachingPlan(
          curriculum,
          staffingPlan,
          allocationDraft,
        );

  if (typeof window !== "undefined" && loaded.rows.length === 0) {
    return saveTeachingPlan(plan);
  }
  return plan;
}

export function saveTeachingPlan(plan: TeachingPlan): TeachingPlan {
  const enforced = applySchoolOperationalRules(
    plan,
    loadStaffingPlan(),
    loadStaffingAllocationDraft(),
  );
  writeStoredWorkloadCredits(enforced);
  const saved = school.saveTeachingPlan(enforced);
  return applyStoredWorkloadCredits(saved);
}

export function rowTeacherPeriods(
  row: TeachingPlanRow,
  teacherId: string,
): number {
  return (
    school.rowTeacherPeriods(row, teacherId) +
    (row.workloadCredits?.[teacherId] ?? 0)
  );
}

/**
 * The supplied curriculum workbook is the authority for regular/sports class
 * allocations. School operational rules add required splits without changing
 * the number of class periods.
 */
export function validateTeachingPlan(
  plan: TeachingPlan,
  staffingPlan: StaffingPlan,
): string[] {
  const curriculum = isCurrentSchoolPlan(plan)
    ? (loadSchoolCurriculum() ?? createDefaultSchoolCurriculum())
    : null;
  return [
    ...school
      .validateTeachingPlan(plan, staffingPlan)
      .filter((message) => !isObsoleteEqualProfileMessage(message)),
    ...(curriculum
      ? validatePlanAgainstSchoolCurriculum(plan, curriculum)
      : []),
  ];
}
