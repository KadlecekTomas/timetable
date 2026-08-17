import type { StaffingAllocationDraft } from "./staffing-allocation-draft";
import {
  SCHOOL_SINGLE_SPLIT_PERIOD_SUBJECT_CODES,
  SCHOOL_SPLIT_SUBJECT_CODES,
} from "./school-default-data";
import type { SchoolCurriculum } from "./school-curriculum";
import type { StaffingPlan } from "./staffing-plan-school-v2";
import { SCHOOL_CLASS_CODES } from "./teaching-plan-school";
import {
  classGradeFromCode,
  normalizeClassCode,
  type TeachingPlan,
  type TeachingPlanRow,
} from "./teaching-plan";
import * as base from "./teaching-plan-school-v2";

export * from "./teaching-plan-school-v2";

declare module "./teaching-plan" {
  interface TeachingPlanRow {
    splitWeeklyPeriods?: number;
  }
}

const SECOND_FOREIGN_LANGUAGE_CODE = "JAZ2";
const ELECTIVE_SUBJECT_CODE = "VOL";
const ELECTIVE_EXCLUDED_GRADES = new Set([6, 7]);

let migratingTeachingPlan = false;

function isCurrentSchoolPlan(plan: TeachingPlan): boolean {
  const allowedCodes = new Set<string>(SCHOOL_CLASS_CODES);
  const classCodes = new Set(
    plan.classes.map((schoolClass) => schoolClass.code),
  );
  return (
    classCodes.size >= 10 &&
    [...classCodes].every((classCode) => allowedCodes.has(classCode))
  );
}

function sortedClassCodes(codes: string[]): string[] {
  return [...new Set(codes.map(normalizeClassCode).filter(Boolean))].sort(
    (left, right) =>
      left.localeCompare(right, "cs-CZ", {
        numeric: true,
      }),
  );
}

function rowClassCodes(row: TeachingPlanRow): string[] {
  return sortedClassCodes([row.classCode, ...(row.additionalClassCodes ?? [])]);
}

function rowWithClassCodes(
  row: TeachingPlanRow,
  classCodes: string[],
): TeachingPlanRow {
  const targets = sortedClassCodes(classCodes);
  return {
    ...row,
    classCode: targets[0] ?? normalizeClassCode(row.classCode),
    additionalClassCodes: targets.slice(1),
  };
}

function removeUnavailableElectives(plan: TeachingPlan): TeachingPlan {
  return {
    ...plan,
    rows: plan.rows.flatMap((row) => {
      if (row.subjectCode !== ELECTIVE_SUBJECT_CODE) return [row];
      const remainingClasses = rowClassCodes(row).filter(
        (classCode) =>
          !ELECTIVE_EXCLUDED_GRADES.has(classGradeFromCode(classCode)),
      );
      return remainingClasses.length > 0
        ? [rowWithClassCodes(row, remainingClasses)]
        : [];
    }),
  };
}

export function enforceMandatorySchoolSplits(plan: TeachingPlan): TeachingPlan {
  if (!isCurrentSchoolPlan(plan)) return plan;

  return {
    ...plan,
    rows: plan.rows.map((row) => {
      if (
        row.organization === "ROTATION" ||
        !SCHOOL_SPLIT_SUBJECT_CODES.has(row.subjectCode)
      ) {
        return row;
      }

      return {
        ...row,
        organization: "SPLIT" as const,
        splitWeeklyPeriods: SCHOOL_SINGLE_SPLIT_PERIOD_SUBJECT_CODES.has(
          row.subjectCode,
        )
          ? 1
          : row.weeklyPeriods,
      };
    }),
  };
}

function languageStructureKey(row: TeachingPlanRow): string {
  const grade = classGradeFromCode(row.classCode);
  return [
    grade,
    row.weeklyPeriods,
    row.lessonShape,
    row.doublePeriodsCount,
    row.organization,
    row.secondarySubjectCode ?? "",
    row.rotationPlacement ?? "",
  ].join("|");
}

function mergedTeacherPair(
  rows: TeachingPlanRow[],
): { primaryTeacherId: string; secondaryTeacherId: string } | null {
  const allTeacherIds = [
    ...new Set(
      rows
        .flatMap((row) => [row.primaryTeacherId, row.secondaryTeacherId])
        .filter(Boolean),
    ),
  ];
  if (allTeacherIds.length > 2) return null;

  const primaryTeacherId =
    rows.map((row) => row.primaryTeacherId).find(Boolean) ??
    allTeacherIds[0] ??
    "";
  const secondaryTeacherId =
    rows
      .map((row) => row.secondaryTeacherId)
      .find((teacherId) => teacherId && teacherId !== primaryTeacherId) ??
    allTeacherIds.find((teacherId) => teacherId !== primaryTeacherId) ??
    "";

  return { primaryTeacherId, secondaryTeacherId };
}

function mergedWorkloadCredits(
  rows: TeachingPlanRow[],
): Record<string, number> | undefined {
  const credits = new Map<string, number>();
  for (const row of rows) {
    for (const [teacherId, hours] of Object.entries(
      row.workloadCredits ?? {},
    )) {
      credits.set(teacherId, (credits.get(teacherId) ?? 0) + hours);
    }
  }
  return credits.size > 0 ? Object.fromEntries(credits) : undefined;
}

export function combineSecondForeignLanguageByGrade(
  plan: TeachingPlan,
): TeachingPlan {
  if (!isCurrentSchoolPlan(plan)) return plan;

  const groups = new Map<string, number[]>();
  plan.rows.forEach((row, index) => {
    const targets = rowClassCodes(row);
    const grade = classGradeFromCode(row.classCode);
    const eligible =
      row.subjectCode === SECOND_FOREIGN_LANGUAGE_CODE &&
      row.organization === "SPLIT" &&
      grade >= 8 &&
      targets.length > 0 &&
      targets.every((classCode) => classGradeFromCode(classCode) === grade);
    if (!eligible) return;
    const key = languageStructureKey(row);
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });

  const replacements = new Map<number, TeachingPlanRow>();
  const removed = new Set<number>();

  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    const rows = indexes.map((index) => plan.rows[index]!);
    const teachers = mergedTeacherPair(rows);
    if (!teachers) continue;

    const classCodes = sortedClassCodes(rows.flatMap(rowClassCodes));
    if (classCodes.length < 2) continue;
    const firstIndex = indexes[0]!;
    const grade = classGradeFromCode(classCodes[0]!);
    const preferredStartPeriods = [
      ...new Set(rows.flatMap((row) => row.preferredStartPeriods ?? [])),
    ].sort((left, right) => left - right);
    const preferenceWeight = Math.max(
      0,
      ...rows.map((row) => Number(row.preferenceWeight ?? 0)),
    );

    replacements.set(firstIndex, {
      ...rows[0]!,
      ...teachers,
      classCode: classCodes[0]!,
      additionalClassCodes: classCodes.slice(1),
      preferredStartPeriods,
      preferenceWeight,
      sharedGroupLabel: `Společný druhý cizí jazyk – ${grade}. ročník`,
      workloadCredits: mergedWorkloadCredits(rows),
    });
    indexes.slice(1).forEach((index) => removed.add(index));
  }

  return {
    ...plan,
    rows: plan.rows.flatMap((row, index) => {
      if (removed.has(index)) return [];
      return [replacements.get(index) ?? row];
    }),
  };
}

export function enforceCurrentSchoolTeachingStructure(
  plan: TeachingPlan,
): TeachingPlan {
  if (!isCurrentSchoolPlan(plan)) return plan;
  return combineSecondForeignLanguageByGrade(
    enforceMandatorySchoolSplits(removeUnavailableElectives(plan)),
  );
}

export function applySchoolOperationalRules(
  plan: TeachingPlan,
  staffingPlan: StaffingPlan,
  allocationDraft: StaffingAllocationDraft | null = null,
): TeachingPlan {
  return enforceCurrentSchoolTeachingStructure(
    base.applySchoolOperationalRules(plan, staffingPlan, allocationDraft),
  );
}

export function createDefaultSchoolTeachingPlan(
  curriculum: SchoolCurriculum,
  staffingPlan: StaffingPlan,
  allocationDraft: StaffingAllocationDraft | null,
): TeachingPlan {
  return enforceCurrentSchoolTeachingStructure(
    base.createDefaultSchoolTeachingPlan(
      curriculum,
      staffingPlan,
      allocationDraft,
    ),
  );
}

export function loadTeachingPlan(): TeachingPlan {
  const loaded = base.loadTeachingPlan();
  const enforced = enforceCurrentSchoolTeachingStructure(loaded);
  if (
    typeof window !== "undefined" &&
    !migratingTeachingPlan &&
    JSON.stringify(loaded.rows) !== JSON.stringify(enforced.rows)
  ) {
    migratingTeachingPlan = true;
    try {
      return enforceCurrentSchoolTeachingStructure(
        base.saveTeachingPlan(enforced),
      );
    } finally {
      migratingTeachingPlan = false;
    }
  }
  return enforced;
}

export function saveTeachingPlan(plan: TeachingPlan): TeachingPlan {
  const enforced = enforceCurrentSchoolTeachingStructure(plan);
  return enforceCurrentSchoolTeachingStructure(base.saveTeachingPlan(enforced));
}

export function validateTeachingPlan(
  plan: TeachingPlan,
  staffingPlan: StaffingPlan,
): string[] {
  return base.validateTeachingPlan(
    enforceCurrentSchoolTeachingStructure(plan),
    staffingPlan,
  );
}
