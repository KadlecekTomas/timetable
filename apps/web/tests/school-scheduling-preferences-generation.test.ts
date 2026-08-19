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
  firstName: string,
  lastName: string,
): StaffingTeacher {
  return {
    id,
    firstName,
    lastName,
    targetWeeklyLoad: 12,
    baseWeeklyLoad: 12,
    subjectLoads: [
      { id: `${id}:jaz2`, subjectCode: "JAZ2", weeklyPeriods: 12 },
    ],
    unavailableDays: [],
    unavailablePeriods: [],
  };
}

function languageRow(
  id: string,
  classCode: string,
  primaryTeacherId: string,
  secondaryTeacherId: string,
): TeachingPlanRow {
  return {
    id,
    classCode,
    subjectCode: "JAZ2",
    weeklyPeriods: 3,
    lessonShape: "SEPARATE",
    doublePeriodsCount: 0,
    organization: "SPLIT",
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

function targetClassCodes(row: TeachingPlanRow): string[] {
  return [row.classCode, ...(row.additionalClassCodes ?? [])].sort((left, right) =>
    left.localeCompare(right, "cs-CZ", { numeric: true }),
  );
}

test("JAZ2 merges every class in grades 8 and 9 even when Špánková has a 12-hour staffing load", () => {
  const staffingPlan: StaffingPlan = {
    version: 1,
    updatedAt: "test",
    teachers: [
      teacher("prikrylova", "", "Přikrylová"),
      teacher("spankova", "", "Špánková"),
    ],
  };
  const teachingPlan: TeachingPlan = {
    version: 1,
    updatedAt: "test",
    classes: classCodes.map((code, index) => ({
      id: `class-${index}`,
      code,
      grade: Number(code.split(".")[0]),
      profile: /\.(B|D)$/.test(code) ? "SPORTS" : "REGULAR",
    })),
    rows: [
      languageRow("language-8a", "8.A", "prikrylova", "spankova"),
      languageRow("language-8b", "8.B", "spankova", ""),
      languageRow("language-8c", "8.C", "prikrylova", "spankova"),
      languageRow("language-9a", "9.A", "prikrylova", ""),
      languageRow("language-9b", "9.B", "spankova", "prikrylova"),
      languageRow("language-9c", "9.C", "prikrylova", ""),
    ],
  };

  const structured = enforceCurrentSchoolTeachingStructure(teachingPlan);
  const languageRows = structured.rows.filter((row) => row.subjectCode === "JAZ2");
  assert.equal(languageRows.length, 2);
  assert.deepEqual(targetClassCodes(languageRows[0]!), ["8.A", "8.B", "8.C"]);
  assert.deepEqual(targetClassCodes(languageRows[1]!), ["9.A", "9.B", "9.C"]);
  assert.deepEqual(
    languageRows.map((row) => [row.primaryTeacherId, row.secondaryTeacherId]),
    [
      ["prikrylova", "spankova"],
      ["prikrylova", "spankova"],
    ],
  );

  const result = buildSchoolProjectForGeneration({
    existingProject: project(),
    staffingPlan,
    teachingPlan: structured,
    forceReplaceGeneratedData: false,
  });

  assert.deepEqual(result.blockers, []);
  const spankovaAssignments = result.project.assignments
    .filter((assignment) => assignment.teacherId === "teacher:spankova")
    .sort((left, right) => left.classId.localeCompare(right.classId));
  assert.equal(spankovaAssignments.length, 2);
  assert.deepEqual(
    spankovaAssignments.map((assignment) => [
      assignment.classId,
      [...assignment.additionalClassIds].sort(),
    ]),
    [
      ["class:8-A", ["class:8-B", "class:8-C"]],
      ["class:9-A", ["class:9-B", "class:9-C"]],
    ],
  );

  assert.deepEqual(
    result.project.fixedLessons.map((lesson) => [
      lesson.blockIndex,
      lesson.dayOfWeek,
      lesson.startPeriod,
    ]),
    [
      [0, 1, 1],
      [1, 2, 1],
      [2, 3, 1],
    ],
  );

  const preferences = result.project.availability.filter(
    (rule) =>
      rule.entityType === "TEACHER" &&
      rule.entityId === "teacher:spankova" &&
      rule.kind === "PREFERRED",
  );
  assert.deepEqual(
    preferences.map((rule) => [rule.dayOfWeek, rule.period, rule.weight]),
    [
      [1, 2, 100],
      [1, 3, 60],
      [1, 4, 30],
      [2, 2, 100],
      [2, 3, 60],
      [2, 4, 30],
      [3, 2, 100],
      [3, 3, 60],
      [3, 4, 30],
    ],
  );
});
