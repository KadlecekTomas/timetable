import assert from "node:assert/strict";
import test from "node:test";

import type { LocalProject } from "../lib/local/api";
import { buildSchoolProjectForGeneration } from "../lib/local/school-project-generation";
import type { StaffingPlan, StaffingTeacher } from "../lib/local/staffing-plan";
import type { TeachingPlan, TeachingPlanRow } from "../lib/local/teaching-plan";

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
  additionalClassCodes: string[] = [],
): TeachingPlanRow {
  return {
    id,
    classCode,
    additionalClassCodes,
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

test("prepared solver project contains Špánková fixed Spanish and German follow-up preferences", () => {
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
    classes: [
      { id: "8a", code: "8.A", grade: 8, profile: "REGULAR" },
      { id: "8b", code: "8.B", grade: 8, profile: "SPORTS" },
      { id: "8c", code: "8.C", grade: 8, profile: "REGULAR" },
      { id: "9b", code: "9.B", grade: 9, profile: "SPORTS" },
    ],
    rows: [
      languageRow("language-8a", "8.A", "prikrylova", "spankova"),
      languageRow("language-8b", "8.B", "prikrylova", "spankova"),
      languageRow("language-8c", "8.C", "prikrylova", "spankova"),
      languageRow("language-9b", "9.B", "spankova", "prikrylova"),
    ],
  };

  const result = buildSchoolProjectForGeneration({
    existingProject: project(),
    staffingPlan,
    teachingPlan,
    forceReplaceGeneratedData: false,
  });

  assert.deepEqual(result.blockers, []);
  const spanishAssignments = result.project.assignments
    .filter(
      (assignment) =>
        assignment.teacherId === "teacher:spankova" &&
        ["class:8-A", "class:8-B", "class:8-C"].includes(assignment.classId),
    )
    .sort((left, right) => left.classId.localeCompare(right.classId));
  assert.equal(spanishAssignments.length, 3);
  assert.equal(
    spanishAssignments.every(
      (assignment) => assignment.additionalClassIds.length === 0,
    ),
    true,
  );

  assert.equal(result.project.fixedLessons.length, 9);
  assert.deepEqual(
    result.project.fixedLessons.map((lesson) => [
      lesson.blockIndex,
      lesson.dayOfWeek,
      lesson.startPeriod,
    ]),
    [
      [0, 1, 1],
      [0, 1, 2],
      [0, 1, 3],
      [1, 2, 1],
      [1, 2, 2],
      [1, 2, 3],
      [2, 3, 1],
      [2, 3, 2],
      [2, 3, 3],
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
      [1, 4, 200],
      [2, 4, 200],
      [3, 4, 200],
    ],
  );
});
