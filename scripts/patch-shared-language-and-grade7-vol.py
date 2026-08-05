from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Missing patch anchor: {label}")
    return text.replace(old, new, 1)


# 1) Correct the authoritative school curriculum and expose a migration helper.
path = Path("apps/web/lib/local/school-default-data.ts")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    '  subject("VOL", "Povinně volitelné předměty", 1, 2, 1, 1),',
    '  subject("VOL", "Povinně volitelné předměty", 1, 0, 1, 1),',
    "regular grade-seven electives",
)
text = replace_once(
    text,
    '''export const DEFAULT_SCHOOL_CURRICULUM: SchoolCurriculum = {
''',
    '''export function enforceCurrentSchoolCurriculumRules(
  curriculum: SchoolCurriculum,
): SchoolCurriculum {
  const enforced = structuredClone(curriculum);
  for (const profile of [
    enforced.profiles.REGULAR,
    enforced.profiles.SPORTS,
  ]) {
    const elective = profile.subjects.find(
      (subject) => subject.subjectCode === "VOL",
    );
    if (elective) {
      elective.weeklyPeriodsByGrade["7"] = 0;
    }
  }
  return enforced;
}

export const DEFAULT_SCHOOL_CURRICULUM: SchoolCurriculum = {
''',
    "curriculum enforcement helper",
)
text = replace_once(
    text,
    '''export function createDefaultSchoolCurriculum(): SchoolCurriculum {
  return structuredClone(DEFAULT_SCHOOL_CURRICULUM);
}
''',
    '''export function createDefaultSchoolCurriculum(): SchoolCurriculum {
  return enforceCurrentSchoolCurriculumRules(DEFAULT_SCHOOL_CURRICULUM);
}
''',
    "default curriculum enforcement",
)
path.write_text(text, encoding="utf-8")


# 2) Sanitize both stored and imported curriculum before constructing/validating the plan.
path = Path("apps/web/lib/local/teaching-plan-school-v2.ts")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''import { createDefaultSchoolCurriculum } from "./school-default-data";
''',
    '''import {
  createDefaultSchoolCurriculum,
  enforceCurrentSchoolCurriculumRules,
} from "./school-default-data";
''',
    "curriculum imports",
)
text = replace_once(
    text,
    '''  const plan = school.createEmptyTeachingPlan();
  plan.rows = [];

  for (const schoolClass of plan.classes) {
''',
    '''  const enforcedCurriculum =
    enforceCurrentSchoolCurriculumRules(curriculum);
  const plan = school.createEmptyTeachingPlan();
  plan.rows = [];

  for (const schoolClass of plan.classes) {
''',
    "default plan curriculum normalization",
)
text = replace_once(
    text,
    '''    const source = curriculum.profiles[profile];
''',
    '''    const source = enforcedCurriculum.profiles[profile];
''',
    "default plan uses enforced curriculum",
)
text = replace_once(
    text,
    '''  const curriculum =
    loadSchoolCurriculum() ??
    saveSchoolCurriculum(createDefaultSchoolCurriculum());
''',
    '''  const curriculum = saveSchoolCurriculum(
    enforceCurrentSchoolCurriculumRules(
      loadSchoolCurriculum() ?? createDefaultSchoolCurriculum(),
    ),
  );
''',
    "stored curriculum migration",
)
text = replace_once(
    text,
    '''  const curriculum = isCurrentSchoolPlan(plan)
    ? (loadSchoolCurriculum() ?? createDefaultSchoolCurriculum())
    : null;
''',
    '''  const curriculum = isCurrentSchoolPlan(plan)
    ? enforceCurrentSchoolCurriculumRules(
        loadSchoolCurriculum() ?? createDefaultSchoolCurriculum(),
      )
    : null;
''',
    "validation curriculum normalization",
)
path.write_text(text, encoding="utf-8")


# 3) Replace the school-v3 wrapper with one canonical structure:
#    no grade-seven VOL and one shared JAZ2 row per compatible grade.
Path("apps/web/lib/local/teaching-plan-school-v3.ts").write_text(
r'''import type { StaffingAllocationDraft } from "./staffing-allocation-draft";
import { SCHOOL_SPLIT_SUBJECT_CODES } from "./school-default-data";
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

const SECOND_FOREIGN_LANGUAGE_CODE = "JAZ2";
const ELECTIVE_SUBJECT_CODE = "VOL";

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
  return sortedClassCodes([
    row.classCode,
    ...(row.additionalClassCodes ?? []),
  ]);
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

function removeSeventhGradeElectives(plan: TeachingPlan): TeachingPlan {
  return {
    ...plan,
    rows: plan.rows.flatMap((row) => {
      if (row.subjectCode !== ELECTIVE_SUBJECT_CODE) return [row];
      const remainingClasses = rowClassCodes(row).filter(
        (classCode) => classGradeFromCode(classCode) !== 7,
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
    rows: plan.rows.map((row) =>
      row.organization !== "ROTATION" &&
      SCHOOL_SPLIT_SUBJECT_CODES.has(row.subjectCode)
        ? { ...row, organization: "SPLIT" as const }
        : row,
    ),
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
    enforceMandatorySchoolSplits(removeSeventhGradeElectives(plan)),
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
    JSON.stringify(loaded.rows) !== JSON.stringify(enforced.rows)
  ) {
    return enforceCurrentSchoolTeachingStructure(base.saveTeachingPlan(enforced));
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
''',
    encoding="utf-8",
)


# 4) Preserve shared classes in generated solver assignments.
path = Path("apps/web/lib/local/school-project-generation.ts")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''function assignmentShape(row: TeachingPlanRow) {
''',
    '''function assignmentShape(
  row: TeachingPlanRow,
  additionalClassIds: string[],
) {
''',
    "assignment shape signature",
)
text = replace_once(
    text,
    '''    additionalClassIds: [],
''',
    '''    additionalClassIds,
''',
    "assignment shape shared classes",
)
text = replace_once(
    text,
    '''    const classId = classIdByCode.get(row.classCode);
    const subjectId = subjectIdByCode.get(subjectCode);
''',
    '''    const classId = classIdByCode.get(row.classCode);
    const additionalClassIds = [
      ...new Set(
        (row.additionalClassCodes ?? [])
          .map((classCode) => {
            const additionalClassId = classIdByCode.get(classCode);
            if (!additionalClassId) {
              blockers.push(
                `${row.classCode} ${subjectCode}: společná třída ${classCode} neexistuje.`,
              );
            }
            return additionalClassId ?? "";
          })
          .filter(
            (additionalClassId) =>
              additionalClassId && additionalClassId !== classId,
          ),
      ),
    ];
    const subjectId = subjectIdByCode.get(subjectCode);
''',
    "resolve shared class ids",
)
text = replace_once(
    text,
    '''      ...assignmentShape(row),
''',
    '''      ...assignmentShape(row, additionalClassIds),
''',
    "assignment uses shared classes",
)
path.write_text(text, encoding="utf-8")


# 5) Expose shared grouping in coverage data.
path = Path("apps/web/lib/domain/coverage-overview.ts")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''  missingRoles: string[];
  rows: CoverageCellRow[];
}
''',
    '''  missingRoles: string[];
  sharedClassCodes: string[];
  rows: CoverageCellRow[];
}
''',
    "coverage cell shared classes",
)
text = replace_once(
    text,
    '''  for (const row of plan.rows) {
    const roles = rolesForRow(row);
''',
    '''  for (const row of plan.rows) {
    const roles = rolesForRow(row);
    const targetClasses = rowTargetClasses(row);
''',
    "coverage target classes",
)
text = replace_once(
    text,
    '''    for (const classCode of rowTargetClasses(row)) {
''',
    '''    for (const classCode of targetClasses) {
''',
    "coverage target class loop",
)
text = replace_once(
    text,
    '''            missingRoles: [],
            rows: [],
''',
    '''            missingRoles: [],
            sharedClassCodes: [],
            rows: [],
''',
    "coverage cell initialization",
)
text = replace_once(
    text,
    '''        cell.rows.push({
''',
    '''        if (targetClasses.length > 1) {
          cell.sharedClassCodes = [
            ...new Set([...cell.sharedClassCodes, ...targetClasses]),
          ];
        }
        cell.rows.push({
''',
    "coverage shared class union",
)
text = replace_once(
    text,
    '''      missingRoles: [...new Set(cell.missingRoles)],
    }))
''',
    '''      missingRoles: [...new Set(cell.missingRoles)],
      sharedClassCodes: [...cell.sharedClassCodes].sort((left, right) =>
        left.localeCompare(right, "cs-CZ", { numeric: true }),
      ),
    }))
''',
    "coverage shared class finalization",
)
path.write_text(text, encoding="utf-8")


# 6) Mark shared cells clearly in the coverage UI and explain them in detail.
path = Path("apps/web/app/coverage/page.tsx")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''                            data-status={cell.status}
                            onClick={() => setSelectedKey(key)}
''',
    '''                            data-status={cell.status}
                            data-shared={
                              cell.sharedClassCodes.length > 1 ? "true" : "false"
                            }
                            onClick={() => setSelectedKey(key)}
''',
    "coverage shared data attribute",
)
text = replace_once(
    text,
    '''                            aria-label={`${classCode} ${subject.label}: ${statusLabels[cell.status]}, ${cell.assignedSlots} z ${cell.requiredSlots} učitelů nebo skupin`}
''',
    '''                            aria-label={`${classCode} ${subject.label}: ${statusLabels[cell.status]}, ${cell.assignedSlots} z ${cell.requiredSlots} učitelů nebo skupin${cell.sharedClassCodes.length > 1 ? `, společně pro třídy ${cell.sharedClassCodes.join(", ")}` : ""}`}
''',
    "coverage shared aria label",
)
text = replace_once(
    text,
    '''                            <span className="text-[10px] font-medium">
                              {formatHours(cell.requiredClassPeriods)} h
                            </span>
''',
    '''                            <span className="text-[10px] font-medium">
                              {formatHours(cell.requiredClassPeriods)} h
                            </span>
                            {cell.sharedClassCodes.length > 1 ? (
                              <span className="text-[9px] font-semibold uppercase tracking-wide opacity-80">
                                společně
                              </span>
                            ) : null}
''',
    "coverage shared marker",
)
text = replace_once(
    text,
    '''          {rotationHours > 0 && residualHours > 0 ? (
''',
    '''          {cell.sharedClassCodes.length > 1 ? (
            <p className="mt-2 text-sm font-medium text-primary">
              Společná výuka tříd {cell.sharedClassCodes.join(", ")}. Učitelům
              se tyto hodiny započítají pouze jednou.
            </p>
          ) : null}
          {rotationHours > 0 && residualHours > 0 ? (
''',
    "coverage shared detail",
)
path.write_text(text, encoding="utf-8")


# 7) Update existing default-data expectations after removing two grade-seven hours.
path = Path("apps/web/tests/school-default-data.test.ts")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''  assert.equal(regularTotal, 122);
  assert.equal(sportsTotal, 122);
''',
    '''  assert.equal(regularTotal, 120);
  assert.equal(sportsTotal, 122);
  assert.equal(
    curriculum.profiles.REGULAR.subjects.find(
      (subject) => subject.subjectCode === "VOL",
    )?.weeklyPeriodsByGrade["7"],
    0,
  );
''',
    "default curriculum totals",
)
text = text.replace(
    '''    396,
''',
    '''    392,
''',
)
path.write_text(text, encoding="utf-8")


# 8) Add focused domain tests for JAZ2 consolidation and grade-seven VOL removal.
path = Path("apps/web/tests/mandatory-school-splits.test.ts")
text = path.read_text(encoding="utf-8")
text += r'''

test("second foreign language is shared by grade and grade-seven electives disappear", () => {
  const staffingPlan = createEmptyStaffingPlan();
  staffingPlan.teachers = [
    {
      id: "teacher-language-one",
      firstName: "Jana",
      lastName: "Němcová",
      targetWeeklyLoad: 3,
      subjectLoads: [
        {
          id: "language-one",
          subjectCode: "JAZ2",
          weeklyPeriods: 3,
        },
      ],
      unavailableDays: [],
    },
    {
      id: "teacher-language-two",
      firstName: "Petr",
      lastName: "Francouz",
      targetWeeklyLoad: 3,
      subjectLoads: [
        {
          id: "language-two",
          subjectCode: "JAZ2",
          weeklyPeriods: 3,
        },
      ],
      unavailableDays: [],
    },
  ];
  const plan = createEmptyTeachingPlan();
  plan.rows = [
    ...["7.A", "7.B", "7.C"].map((classCode) => ({
      ...createTeachingPlanRow(classCode, "VOL"),
      weeklyPeriods: 2,
      primaryTeacherId: "teacher-language-one",
    })),
    ...["8.A", "8.B", "8.C"].map((classCode, index) => ({
      ...createTeachingPlanRow(classCode, "JAZ2"),
      weeklyPeriods: 3,
      organization: "SPLIT" as const,
      primaryTeacherId: "teacher-language-one",
      secondaryTeacherId:
        index === 1 ? "teacher-language-two" : "",
    })),
  ];

  const enforced = applySchoolOperationalRules(plan, staffingPlan, null);
  assert.equal(
    enforced.rows.some(
      (row) =>
        row.subjectCode === "VOL" &&
        [row.classCode, ...(row.additionalClassCodes ?? [])].some((classCode) =>
          classCode.startsWith("7."),
        ),
    ),
    false,
  );

  const languages = enforced.rows.filter(
    (row) => row.subjectCode === "JAZ2",
  );
  assert.equal(languages.length, 1);
  assert.equal(languages[0]?.classCode, "8.A");
  assert.deepEqual(languages[0]?.additionalClassCodes, ["8.B", "8.C"]);
  assert.equal(languages[0]?.primaryTeacherId, "teacher-language-one");
  assert.equal(languages[0]?.secondaryTeacherId, "teacher-language-two");
  assert.match(languages[0]?.sharedGroupLabel ?? "", /8\. ročník/);

  const overview = buildCoverageOverview(enforced, staffingPlan);
  for (const classCode of ["8.A", "8.B", "8.C"]) {
    const cell = overview.cellByKey.get(
      coverageCellKey(classCode, "JAZ2"),
    );
    assert.equal(cell?.status, "FULL");
    assert.deepEqual(cell?.sharedClassCodes, ["8.A", "8.B", "8.C"]);
  }
  assert.equal(
    overview.teachers.find(
      (teacher) => teacher.teacherId === "teacher-language-one",
    )?.scheduledTeachingHours,
    3,
  );
  assert.equal(
    overview.teachers.find(
      (teacher) => teacher.teacherId === "teacher-language-two",
    )?.scheduledTeachingHours,
    3,
  );
});
'''
path.write_text(text, encoding="utf-8")


# 9) Verify shared class IDs reach the solver project.
path = Path("apps/web/tests/school-project-generation.test.ts")
text = path.read_text(encoding="utf-8")
text += r'''

test("shared split language creates two assignments for all participating classes", () => {
  const staffingPlan: StaffingPlan = {
    version: 1,
    updatedAt: "test",
    teachers: [
      teacher("language-one", "JAZ2", 3),
      teacher("language-two", "JAZ2", 3),
    ],
  };
  const teachingPlan: TeachingPlan = {
    version: 1,
    updatedAt: "test",
    classes: [
      { id: "8a", code: "8.A", grade: 8, profile: "REGULAR" },
      { id: "8b", code: "8.B", grade: 8, profile: "SPORTS" },
      { id: "8c", code: "8.C", grade: 8, profile: "REGULAR" },
    ],
    rows: [
      row({
        id: "shared-language",
        classCode: "8.A",
        additionalClassCodes: ["8.B", "8.C"],
        subjectCode: "JAZ2",
        weeklyPeriods: 3,
        organization: "SPLIT",
        primaryTeacherId: "language-one",
        secondaryTeacherId: "language-two",
      }),
    ],
  };

  const result = buildSchoolProjectForGeneration({
    existingProject: project(),
    staffingPlan,
    teachingPlan,
    forceReplaceGeneratedData: false,
  });

  assert.deepEqual(result.blockers, []);
  assert.equal(result.project.assignments.length, 2);
  for (const assignment of result.project.assignments) {
    assert.equal(assignment.classId, "class:8-A");
    assert.deepEqual(assignment.additionalClassIds, [
      "class:8-B",
      "class:8-C",
    ]);
    assert.equal(assignment.weeklyPeriods, 3);
  }
});
'''
path.write_text(text, encoding="utf-8")


# 10) Strengthen existing shared coverage test.
path = Path("apps/web/tests/coverage-overview.test.ts")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''  assert.equal(overview.summary.requiredTeacherHours, 8);
  assert.equal(overview.summary.assignedTeacherHours, 8);
''',
    '''  assert.deepEqual(
    overview.cellByKey.get(coverageCellKey("6.A", "M"))?.sharedClassCodes,
    ["6.A", "6.B"],
  );
  assert.equal(overview.summary.requiredTeacherHours, 8);
  assert.equal(overview.summary.assignedTeacherHours, 8);
''',
    "shared coverage metadata assertion",
)
path.write_text(text, encoding="utf-8")


# 11) Add a browser regression proving migration, shared display and one-time load counting.
path = Path("apps/web/e2e/auto-cover.spec.ts")
text = path.read_text(encoding="utf-8")
text += r'''

test("current school shares second language by grade and removes grade-seven electives", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const classCodes = [
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
    ];
    localStorage.setItem(
      "rozvrhar:staffing-plan:v1",
      JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        teachers: [
          {
            id: "teacher-language-one",
            firstName: "Jana",
            lastName: "Němcová",
            targetWeeklyLoad: 3,
            baseWeeklyLoad: 3,
            subjectLoads: [
              {
                id: "load-language-one",
                subjectCode: "JAZ2",
                weeklyPeriods: 3,
              },
            ],
            unavailableDays: [],
          },
          {
            id: "teacher-language-two",
            firstName: "Petr",
            lastName: "Francouz",
            targetWeeklyLoad: 3,
            baseWeeklyLoad: 3,
            subjectLoads: [
              {
                id: "load-language-two",
                subjectCode: "JAZ2",
                weeklyPeriods: 3,
              },
            ],
            unavailableDays: [],
          },
        ],
      }),
    );
    localStorage.setItem(
      "rozvrhar:teaching-plan:v1",
      JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        classes: classCodes.map((code, index) => ({
          id: `class-${index}`,
          code,
          grade: Number(code.split(".")[0]),
          profile: /\.(B|D)$/.test(code) ? "SPORTS" : "REGULAR",
        })),
        rows: [
          ...["7.A", "7.B", "7.C"].map((classCode, index) => ({
            id: `row-vol-${index}`,
            classCode,
            subjectCode: "VOL",
            secondarySubjectCode: "",
            weeklyPeriods: 2,
            lessonShape: "SEPARATE",
            doublePeriodsCount: 0,
            organization: "WHOLE",
            rotationPlacement: "SAME_DAY",
            primaryTeacherId: "teacher-language-one",
            secondaryTeacherId: "",
          })),
          ...["8.A", "8.B", "8.C"].map((classCode, index) => ({
            id: `row-language-${index}`,
            classCode,
            subjectCode: "JAZ2",
            secondarySubjectCode: "",
            weeklyPeriods: 3,
            lessonShape: "SEPARATE",
            doublePeriodsCount: 0,
            organization: "SPLIT",
            rotationPlacement: "SAME_DAY",
            primaryTeacherId: "teacher-language-one",
            secondaryTeacherId: "",
          })),
        ],
      }),
    );
  });

  await page.goto("/coverage?schoolYearId=local-school-year");

  await expect(page.getByTestId("coverage-7.A-VOL")).toHaveCount(0);
  for (const classCode of ["8.A", "8.B", "8.C"]) {
    await expect(
      page.getByTestId(`coverage-${classCode}-JAZ2`),
    ).toHaveAttribute("data-status", "PARTIAL");
    await expect(
      page.getByTestId(`coverage-${classCode}-JAZ2`),
    ).toHaveAttribute("data-shared", "true");
  }

  await page.getByRole("button", { name: "Doplnit vše automaticky" }).click();

  for (const classCode of ["8.A", "8.B", "8.C"]) {
    await expect(
      page.getByTestId(`coverage-${classCode}-JAZ2`),
    ).toHaveAttribute("data-status", "FULL");
  }

  const stored = await page.evaluate(() => ({
    staffing: JSON.parse(
      localStorage.getItem("rozvrhar:staffing-plan:v1") ?? "{}",
    ),
    teaching: JSON.parse(
      localStorage.getItem("rozvrhar:teaching-plan:v1") ?? "{}",
    ),
    shared: JSON.parse(
      localStorage.getItem("rozvrhar:teaching-plan-shared:v1") ?? "{}",
    ),
  }));

  expect(
    stored.teaching.rows.filter(
      (row: { subjectCode: string }) => row.subjectCode === "VOL",
    ),
  ).toHaveLength(0);
  const languageRows = stored.teaching.rows.filter(
    (row: { subjectCode: string }) => row.subjectCode === "JAZ2",
  );
  expect(languageRows).toHaveLength(1);
  expect(languageRows[0].primaryTeacherId).toBe("teacher-language-one");
  expect(languageRows[0].secondaryTeacherId).toBe("teacher-language-two");
  expect(stored.shared[languageRows[0].id].additionalClassCodes).toEqual([
    "8.B",
    "8.C",
  ]);
  expect(
    stored.staffing.teachers.map(
      (teacher: {
        id: string;
        subjectLoads: Array<{ subjectCode: string; weeklyPeriods: number }>;
      }) => [
        teacher.id,
        teacher.subjectLoads.find(
          (load) => load.subjectCode === "JAZ2",
        )?.weeklyPeriods,
      ],
    ),
  ).toEqual([
    ["teacher-language-one", 3],
    ["teacher-language-two", 3],
  ]);
});
'''
path.write_text(text, encoding="utf-8")
