import type {
  TeachingClassProfile,
  TeachingPlan,
  TeachingPlanRow as BaseTeachingPlanRow,
} from "./teaching-plan";

type TeachingPlanRow = BaseTeachingPlanRow & {
  additionalClassCodes?: string[];
};

export const SCHOOL_CURRICULUM_STORAGE_KEY = "rozvrhar:school-curriculum:v1";

export interface SchoolCurriculumSubject {
  subjectCode: string;
  subjectName: string;
  weeklyPeriodsByGrade: Record<string, number>;
}

export interface SchoolCurriculumProfile {
  profile: "REGULAR" | "SPORTS";
  sourceSheet: string;
  subjects: SchoolCurriculumSubject[];
}

export interface SchoolCurriculum {
  version: 1;
  profiles: {
    REGULAR: SchoolCurriculumProfile;
    SPORTS: SchoolCurriculumProfile;
  };
}

function normalize(value: unknown): SchoolCurriculum | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SchoolCurriculum>;
  if (candidate.version !== 1 || !candidate.profiles) return null;

  const normalizeProfile = (
    value: unknown,
    profile: "REGULAR" | "SPORTS",
  ): SchoolCurriculumProfile | null => {
    if (!value || typeof value !== "object") return null;
    const item = value as Partial<SchoolCurriculumProfile>;
    if (
      item.profile !== profile ||
      typeof item.sourceSheet !== "string" ||
      !Array.isArray(item.subjects)
    ) {
      return null;
    }
    const subjects = item.subjects.flatMap((subject) => {
      if (!subject || typeof subject !== "object") return [];
      const row = subject as Partial<SchoolCurriculumSubject>;
      if (
        typeof row.subjectCode !== "string" ||
        typeof row.subjectName !== "string" ||
        !row.weeklyPeriodsByGrade ||
        typeof row.weeklyPeriodsByGrade !== "object"
      ) {
        return [];
      }
      const weeklyPeriodsByGrade = Object.fromEntries(
        [6, 7, 8, 9].map((grade) => {
          const value = Number(row.weeklyPeriodsByGrade?.[String(grade)] ?? 0);
          return [
            String(grade),
            Number.isInteger(value) && value >= 0 ? value : 0,
          ];
        }),
      );
      return [
        {
          subjectCode: row.subjectCode,
          subjectName: row.subjectName,
          weeklyPeriodsByGrade,
        },
      ];
    });
    return { profile, sourceSheet: item.sourceSheet, subjects };
  };

  const regular = normalizeProfile(candidate.profiles.REGULAR, "REGULAR");
  const sports = normalizeProfile(candidate.profiles.SPORTS, "SPORTS");
  return regular && sports
    ? { version: 1, profiles: { REGULAR: regular, SPORTS: sports } }
    : null;
}

export function saveSchoolCurriculum(
  curriculum: SchoolCurriculum,
): SchoolCurriculum {
  const normalized = normalize(curriculum);
  if (!normalized) throw new Error("Neplatná časová dotace školy.");
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      SCHOOL_CURRICULUM_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  }
  return normalized;
}

export function loadSchoolCurriculum(): SchoolCurriculum | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SCHOOL_CURRICULUM_STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function rowTargetsClass(row: TeachingPlanRow, classCode: string): boolean {
  return (
    row.classCode === classCode ||
    (row.additionalClassCodes ?? []).includes(classCode)
  );
}

function actualAllocation(
  plan: TeachingPlan,
  classCode: string,
): Map<string, number> {
  const result = new Map<string, number>();
  const add = (subjectCode: string | undefined, periods: number) => {
    if (!subjectCode) return;
    result.set(subjectCode, (result.get(subjectCode) ?? 0) + periods);
  };
  for (const row of plan.rows) {
    if (!rowTargetsClass(row, classCode)) continue;
    add(row.subjectCode, row.weeklyPeriods);
    if (row.organization === "ROTATION") {
      add(row.secondarySubjectCode, row.weeklyPeriods);
    }
  }
  return result;
}

function expectedAllocation(
  curriculum: SchoolCurriculum,
  profile: TeachingClassProfile,
  grade: number,
): Map<string, number> {
  if (profile === "CUSTOM") return new Map();
  const source = curriculum.profiles[profile];
  return new Map(
    source.subjects
      .map(
        (subject) =>
          [
            subject.subjectCode,
            subject.weeklyPeriodsByGrade[String(grade)] ?? 0,
          ] as const,
      )
      .filter(([, periods]) => periods > 0),
  );
}

export function validatePlanAgainstSchoolCurriculum(
  plan: TeachingPlan,
  curriculum: SchoolCurriculum | null,
): string[] {
  if (!curriculum) return [];
  const messages: string[] = [];
  for (const schoolClass of plan.classes) {
    const profile = schoolClass.profile ?? "REGULAR";
    if (profile === "CUSTOM") continue;
    const expected = expectedAllocation(curriculum, profile, schoolClass.grade);
    const actual = actualAllocation(plan, schoolClass.code);
    const subjectCodes = new Set([...expected.keys(), ...actual.keys()]);
    const differences = [...subjectCodes].flatMap((subjectCode) => {
      const expectedPeriods = expected.get(subjectCode) ?? 0;
      const actualPeriods = actual.get(subjectCode) ?? 0;
      return expectedPeriods === actualPeriods
        ? []
        : [
            `${subjectCode}: očekáváno ${expectedPeriods}, zadáno ${actualPeriods}`,
          ];
    });
    if (differences.length > 0) {
      messages.push(
        `${schoolClass.code}: hodinová dotace neodpovídá profilu ${profile === "SPORTS" ? "sportovní třídy" : "běžné třídy"} (${differences.join(", ")}).`,
      );
    }
  }
  return messages;
}
