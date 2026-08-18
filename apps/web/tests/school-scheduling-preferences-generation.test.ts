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
    targetWeeklyLoad: 6,
    baseWeeklyLoad: 6,
    subjectLoads: [{ id: `${id}:jaz2`, subjectCode: "JAZ2", weeklyPeriods: 6 }],
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
      languageRow("language-8", "8.A", "prikrylova", "spankova", [
        "8.B",
        "8.C",
      ]),
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
  const spanishAssignment = result.project.assignments.find(
    (assignment) =>
      assignment.teacherId === "teacher:spankova" &&
      assignment.classId === "class:8-A" &&
      assignment.additionalClassIds.includes("class:8-B") &&
      assignment.additionalClassIds.includes("class:8-C"),
  );
  assert.ok(spanishAssignment);

  assert.deepEqual(
    result.project.fixedLessons
      .filter((lesson) => lesson.assignmentId === spanishAssignment.id)
      .map((lesson) => [
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
  assert.equal(preferences.length, 9);
  assert.deepEqual(
    preferences
      .filter((rule) => rule.weight === 100)
      .map((rule) => [rule.dayOfWeek, rule.period]),
    [
      [1, 2],
      [2, 2],
      [3, 2],
    ],
  );
});
