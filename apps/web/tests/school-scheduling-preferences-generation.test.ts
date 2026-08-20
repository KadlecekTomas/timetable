import assert from "node:assert/strict";
import test from "node:test";

import type { LocalProject } from "../lib/local/api";
import { buildSchoolProjectForGeneration } from "../lib/local/school-project-generation";
import type { StaffingPlan, StaffingTeacher } from "../lib/local/staffing-plan";
import type { TeachingPlan, TeachingPlanRow } from "../lib/local/teaching-plan";
import { enforceCurrentSchoolTeachingStructure } from "../lib/local/teaching-plan-school-v3";

function project(): LocalProject {
  return {
    schemaVersion: 1,
    id: "local-school-year",
    schoolName: "Testovací škola",
    label: "2026/2027",
    status: "ACTIVE",
    periodsPerDay: [8, 8, 8, 8, 7],
    version: 1,
    updatedAt: "test",
    teachers: [],
    classes: [],
    subjects: [],
    roomTypes: [],
    rooms: [],
    assignments: [],
    availability: [],
    fixedLessons: [],
    importBatches: [],
    generationRuns: [],
    timetableVersions: [],
  };
}

function teacher(
  id: string,
  lastName: string,
  subjectCode: string,
  weeklyPeriods: number,
): StaffingTeacher {
  return {
    id,
    firstName: "",
    lastName,
    targetWeeklyLoad: weeklyPeriods,
    baseWeeklyLoad: Math.min(weeklyPeriods, 22),
    subjectLoads: [{ id: `${id}:${subjectCode}`, subjectCode, weeklyPeriods }],
    unavailableDays: [],
    unavailablePeriods: [],
  };
}

function languageRow(
  id: string,
  classCode: string,
  organization: "WHOLE" | "SPLIT",
  primaryTeacherId: string,
  secondaryTeacherId = "",
): TeachingPlanRow {
  return {
    id,
    classCode,
    subjectCode: "JAZ2",
    weeklyPeriods: 3,
    lessonShape: "SEPARATE",
    doublePeriodsCount: 0,
    organization,
    primaryTeacherId,
    secondaryTeacherId,
    splitGroupCount: 2,
  };
}

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

function classes() {
  return classCodes.map((code, index) => ({
    id: `class-${index}`,
    code,
    grade: Number(code.split(".")[0]),
    profile: /\.(B|D)$/.test(code) ? ("SPORTS" as const) : ("REGULAR" as const),
  }));
}

function fixedSlotsByClass(
  result: ReturnType<typeof buildSchoolProjectForGeneration>,
  teacherId: string,
): Array<readonly [string, number, number]> {
  const assignmentById = new Map(
    result.project.assignments.map((assignment) => [assignment.id, assignment]),
  );
  return result.project.fixedLessons
    .flatMap((lesson) => {
      const assignment = assignmentById.get(lesson.assignmentId);
      if (!assignment || assignment.teacherId !== teacherId) return [];
      const classCode = assignment.classId
        .replace(/^class:/, "")
        .replace(/-/g, ".");
      return [[classCode, lesson.dayOfWeek, lesson.startPeriod] as const];
    })
    .sort(
      (left, right) =>
        left[1] - right[1] ||
        left[2] - right[2] ||
        left[0].localeCompare(right[0]),
    );
}

test("Špánková keeps class-scoped JAZ2 and receives the exact V8 Tue-Wed-Thu sequence", () => {
  const staffingPlan: StaffingPlan = {
    version: 1,
    updatedAt: "test",
    teachers: [
      teacher("prikrylova", "Přikrylová", "JAZ2", 15),
      teacher("spankova", "Špánková", "JAZ2", 12),
    ],
  };
  const teachingPlan: TeachingPlan = {
    version: 1,
    updatedAt: "test",
    classes: classes(),
    rows: [
      languageRow("language-8a", "8.A", "SPLIT", "prikrylova", "spankova"),
      languageRow("language-8b", "8.B", "WHOLE", "spankova"),
      languageRow("language-8c", "8.C", "SPLIT", "prikrylova", "spankova"),
      languageRow("language-9a", "9.A", "WHOLE", "prikrylova"),
      languageRow("language-9b", "9.B", "SPLIT", "spankova", "prikrylova"),
      languageRow("language-9c", "9.C", "WHOLE", "prikrylova"),
    ],
  };

  const structured = enforceCurrentSchoolTeachingStructure(teachingPlan);
  const languageRows = structured.rows.filter(
    (row) => row.subjectCode === "JAZ2",
  );
  assert.equal(languageRows.length, 6);
  assert.equal(
    languageRows.find((row) => row.classCode === "8.B")?.organization,
    "WHOLE",
  );
  assert.equal(
    languageRows.find((row) => row.classCode === "9.A")?.organization,
    "WHOLE",
  );
  assert.equal(
    languageRows.find((row) => row.classCode === "9.C")?.organization,
    "WHOLE",
  );

  const result = buildSchoolProjectForGeneration({
    existingProject: project(),
    staffingPlan,
    teachingPlan: structured,
    forceReplaceGeneratedData: false,
  });

  assert.deepEqual(result.blockers, []);
  assert.deepEqual(fixedSlotsByClass(result, "teacher:spankova"), [
    ["8.B", 1, 1],
    ["8.C", 1, 2],
    ["8.A", 1, 3],
    ["9.B", 1, 4],
    ["8.B", 2, 1],
    ["8.A", 2, 2],
    ["8.C", 2, 3],
    ["9.B", 2, 4],
    ["8.B", 3, 1],
    ["8.C", 3, 2],
    ["8.A", 3, 3],
    ["9.B", 3, 4],
  ]);
});

test("Kadleček receives the exact accepted V5/V8 INF pattern", () => {
  const staffingPlan: StaffingPlan = {
    version: 1,
    updatedAt: "test",
    teachers: [
      teacher("kadlecek", "Kadleček", "INF", 13),
      teacher("vasakova", "Vašáková", "INF", 12),
    ],
  };
  const teachingPlan: TeachingPlan = {
    version: 1,
    updatedAt: "test",
    classes: classes(),
    rows: classCodes.map((classCode) => ({
      id: `inf-${classCode}`,
      classCode,
      subjectCode: "INF",
      weeklyPeriods: 1,
      lessonShape: "SEPARATE" as const,
      doublePeriodsCount: 0,
      organization:
        classCode === "8.B" ? ("WHOLE" as const) : ("SPLIT" as const),
      primaryTeacherId: "kadlecek",
      secondaryTeacherId: classCode === "8.B" ? "" : "vasakova",
      splitGroupCount: 2 as const,
    })),
  };

  const result = buildSchoolProjectForGeneration({
    existingProject: project(),
    staffingPlan,
    teachingPlan: enforceCurrentSchoolTeachingStructure(teachingPlan),
    forceReplaceGeneratedData: false,
  });

  assert.deepEqual(result.blockers, []);
  assert.deepEqual(fixedSlotsByClass(result, "teacher:kadlecek"), [
    ["8.C", 1, 0],
    ["7.C", 1, 1],
    ["9.A", 1, 2],
    ["6.B", 1, 3],
    ["7.B", 1, 4],
    ["9.C", 1, 5],
    ["9.B", 2, 0],
    ["7.A", 2, 1],
    ["6.C", 2, 2],
    ["6.A", 2, 3],
    ["8.A", 2, 4],
    ["6.D", 2, 5],
    ["8.B", 3, 0],
  ]);
});
