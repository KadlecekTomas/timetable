import type { StaffingPlan } from "@/lib/local/staffing-plan";
import * as base from "./teaching-plan";
import type {
  TeachingClassProfile,
  TeachingPlan,
  TeachingPlanClass,
  TeachingPlanRow,
} from "./teaching-plan";

export * from "./teaching-plan";

declare module "./teaching-plan" {
  interface TeachingPlanRow {
    additionalClassCodes?: string[];
    preferredStartPeriods?: number[];
    preferenceWeight?: number;
    sharedGroupLabel?: string;
  }
}

const SHARED_METADATA_STORAGE_KEY = "rozvrhar:teaching-plan-shared:v1";

interface SharedRowMetadata {
  additionalClassCodes: string[];
  preferredStartPeriods: number[];
  preferenceWeight: number;
  sharedGroupLabel: string;
}

/** School-specific class structure for FZŠ Chodovická. */
export const SCHOOL_CLASS_CODES = [
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

/**
 * School-specific rules for FZŠ Chodovická.
 *
 * B and D are always sports classes. A and C are the regular reference
 * classes whose subject-hour allocations also apply to the sports classes
 * in the same grade. Sports-specific scheduling must therefore be expressed
 * through profile and explicit scheduling rules, never by silently changing
 * the curriculum allocation.
 */
export const SCHOOL_SPORTS_CLASS_SUFFIXES = ["B", "D"] as const;
export const SCHOOL_REFERENCE_CLASS_SUFFIXES = ["A", "C"] as const;

function classSuffix(code: string): string {
  const normalized = base.normalizeClassCode(code);
  return normalized.match(/\.([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])$/)?.[1] ?? "";
}

function isSuffixIn(code: string, suffixes: readonly string[]): boolean {
  return suffixes.includes(classSuffix(code));
}

export function isSchoolSportsClass(code: string): boolean {
  return isSuffixIn(code, SCHOOL_SPORTS_CLASS_SUFFIXES);
}

export function isSchoolReferenceClass(code: string): boolean {
  return isSuffixIn(code, SCHOOL_REFERENCE_CLASS_SUFFIXES);
}

export function inferredClassProfile(code: string): TeachingClassProfile {
  return isSchoolSportsClass(code) ? "SPORTS" : "REGULAR";
}

export function createTeachingPlanClass(code = ""): TeachingPlanClass {
  const schoolClass = base.createTeachingPlanClass(code);
  return {
    ...schoolClass,
    profile: inferredClassProfile(schoolClass.code),
  };
}

function defaultSchoolClasses(): TeachingPlanClass[] {
  return SCHOOL_CLASS_CODES.map((code) => createTeachingPlanClass(code));
}

function enforceClassProfile(
  schoolClass: TeachingPlanClass,
): TeachingPlanClass {
  return {
    ...schoolClass,
    profile: inferredClassProfile(schoolClass.code),
  };
}

function ensureSchoolClasses(
  classes: TeachingPlanClass[],
): TeachingPlanClass[] {
  const byCode = new Map(
    classes.map((schoolClass) => [
      base.normalizeClassCode(schoolClass.code),
      enforceClassProfile(schoolClass),
    ]),
  );

  return SCHOOL_CLASS_CODES.map((code) => {
    const existing = byCode.get(code);
    return existing ?? createTeachingPlanClass(code);
  });
}

function normalizedAdditionalClassCodes(row: TeachingPlanRow): string[] {
  return [
    ...new Set(
      (row.additionalClassCodes ?? [])
        .map(base.normalizeClassCode)
        .filter(
          (code) => code && code !== base.normalizeClassCode(row.classCode),
        ),
    ),
  ];
}

function rowMetadata(row: TeachingPlanRow): SharedRowMetadata {
  return {
    additionalClassCodes: normalizedAdditionalClassCodes(row),
    preferredStartPeriods: [
      ...new Set(
        (row.preferredStartPeriods ?? []).filter(
          (period) => Number.isInteger(period) && period >= 0 && period <= 15,
        ),
      ),
    ],
    preferenceWeight:
      Number.isFinite(row.preferenceWeight) && Number(row.preferenceWeight) > 0
        ? Math.min(10_000, Number(row.preferenceWeight))
        : 0,
    sharedGroupLabel:
      typeof row.sharedGroupLabel === "string"
        ? row.sharedGroupLabel.trim()
        : "",
  };
}

function applyMetadata(
  plan: TeachingPlan,
  metadata: Record<string, SharedRowMetadata>,
): TeachingPlan {
  return {
    ...plan,
    rows: plan.rows.map((row) => {
      const item = metadata[row.id];
      return item
        ? {
            ...row,
            additionalClassCodes: item.additionalClassCodes,
            preferredStartPeriods: item.preferredStartPeriods,
            preferenceWeight: item.preferenceWeight,
            sharedGroupLabel: item.sharedGroupLabel,
          }
        : row;
    }),
  };
}

function metadataForPlan(
  plan: TeachingPlan,
): Record<string, SharedRowMetadata> {
  return Object.fromEntries(
    plan.rows
      .map((row) => [row.id, rowMetadata(row)] as const)
      .filter(
        ([, metadata]) =>
          metadata.additionalClassCodes.length > 0 ||
          metadata.preferredStartPeriods.length > 0 ||
          metadata.sharedGroupLabel,
      ),
  );
}

function readStoredMetadata(): Record<string, SharedRowMetadata> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SHARED_METADATA_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SharedRowMetadata>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredMetadata(
  metadata: Record<string, SharedRowMetadata>,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    SHARED_METADATA_STORAGE_KEY,
    JSON.stringify(metadata),
  );
}

export function createEmptyTeachingPlan(): TeachingPlan {
  const plan = base.createEmptyTeachingPlan();
  return {
    ...plan,
    classes: defaultSchoolClasses(),
  };
}

export function enforceSchoolTeachingPlanRules(
  plan: TeachingPlan,
): TeachingPlan {
  return {
    ...plan,
    classes: ensureSchoolClasses(plan.classes),
    rows: plan.rows.map((row) => ({
      ...row,
      classCode: base.normalizeClassCode(row.classCode),
      additionalClassCodes: normalizedAdditionalClassCodes(row),
    })),
  };
}

function rowTargetsClass(row: TeachingPlanRow, classCode: string): boolean {
  const normalized = base.normalizeClassCode(classCode);
  return (
    base.normalizeClassCode(row.classCode) === normalized ||
    normalizedAdditionalClassCodes(row).includes(normalized)
  );
}

function allocationForClass(
  rows: TeachingPlanRow[],
  classCode: string,
): Map<string, number> {
  const allocation = new Map<string, number>();

  const add = (subjectCode: string | undefined, periods: number) => {
    if (!subjectCode) return;
    allocation.set(subjectCode, (allocation.get(subjectCode) ?? 0) + periods);
  };

  for (const row of rows) {
    if (!rowTargetsClass(row, classCode)) continue;
    add(row.subjectCode, row.weeklyPeriods);
    if (row.organization === "ROTATION") {
      add(row.secondarySubjectCode, row.weeklyPeriods);
    }
  }

  return allocation;
}

function allocationDifferences(
  expected: Map<string, number>,
  actual: Map<string, number>,
): string[] {
  const subjects = new Set([...expected.keys(), ...actual.keys()]);
  return [...subjects]
    .sort((left, right) => left.localeCompare(right, "cs"))
    .flatMap((subjectCode) => {
      const expectedPeriods = expected.get(subjectCode) ?? 0;
      const actualPeriods = actual.get(subjectCode) ?? 0;
      return expectedPeriods === actualPeriods
        ? []
        : [
            `${subjectCode}: očekáváno ${expectedPeriods}, zadáno ${actualPeriods}`,
          ];
    });
}

export function validateSchoolClassAllocations(plan: TeachingPlan): string[] {
  const messages: string[] = [];
  const classesByGrade = new Map<number, TeachingPlanClass[]>();

  for (const schoolClass of plan.classes) {
    const grade = base.classGradeFromCode(schoolClass.code);
    if (!grade) continue;
    const classes = classesByGrade.get(grade) ?? [];
    classes.push(schoolClass);
    classesByGrade.set(grade, classes);
  }

  for (const [grade, classes] of classesByGrade) {
    const activeClasses = classes.filter(
      (schoolClass) => allocationForClass(plan.rows, schoolClass.code).size > 0,
    );
    const references = activeClasses.filter((schoolClass) =>
      isSchoolReferenceClass(schoolClass.code),
    );
    const sportsClasses = activeClasses.filter((schoolClass) =>
      isSchoolSportsClass(schoolClass.code),
    );
    if (sportsClasses.length === 0) continue;

    if (references.length === 0) {
      messages.push(
        `${grade}. ročník: sportovní třídy B/D nemají referenční třídu A nebo C pro kontrolu hodinové dotace.`,
      );
      continue;
    }

    const reference = references[0];
    const expected = allocationForClass(plan.rows, reference.code);

    for (const otherReference of references.slice(1)) {
      const differences = allocationDifferences(
        expected,
        allocationForClass(plan.rows, otherReference.code),
      );
      if (differences.length > 0) {
        messages.push(
          `${grade}. ročník: referenční třídy ${reference.code} a ${otherReference.code} nemají stejnou hodinovou dotaci (${differences.join(", ")}).`,
        );
      }
    }

    for (const sportsClass of sportsClasses) {
      const differences = allocationDifferences(
        expected,
        allocationForClass(plan.rows, sportsClass.code),
      );
      if (differences.length > 0) {
        messages.push(
          `${sportsClass.code}: sportovní třída musí mít stejnou předmětovou hodinovou dotaci jako ${reference.code} (${differences.join(", ")}).`,
        );
      }
    }
  }

  return messages;
}

function validateSharedRows(plan: TeachingPlan): string[] {
  const messages: string[] = [];
  const classCodes = new Set(plan.classes.map((item) => item.code));
  for (const row of plan.rows) {
    for (const code of normalizedAdditionalClassCodes(row)) {
      if (!classCodes.has(code)) {
        messages.push(
          `${row.classCode} ${row.subjectCode}: společná výuka odkazuje na neexistující třídu ${code}.`,
        );
      }
    }
    if (
      (row.preferredStartPeriods?.length ?? 0) > 0 &&
      (!Number.isFinite(row.preferenceWeight) ||
        Number(row.preferenceWeight) <= 0)
    ) {
      messages.push(
        `${row.classCode} ${row.subjectCode}: preference času musí mít kladnou prioritu.`,
      );
    }
  }
  return messages;
}

export function validateTeachingPlan(
  plan: TeachingPlan,
  staffingPlan: StaffingPlan,
): string[] {
  const enforcedPlan = enforceSchoolTeachingPlanRules(plan);
  return [
    ...base.validateTeachingPlan(enforcedPlan, staffingPlan),
    ...validateSharedRows(enforcedPlan),
    ...validateSchoolClassAllocations(enforcedPlan),
  ];
}

export function loadTeachingPlan(): TeachingPlan {
  const loaded = applyMetadata(base.loadTeachingPlan(), readStoredMetadata());
  return enforceSchoolTeachingPlanRules(loaded);
}

export function saveTeachingPlan(plan: TeachingPlan): TeachingPlan {
  const enforced = enforceSchoolTeachingPlanRules(plan);
  const metadata = metadataForPlan(enforced);
  writeStoredMetadata(metadata);
  const saved = base.saveTeachingPlan(enforced);
  return enforceSchoolTeachingPlanRules(applyMetadata(saved, metadata));
}
