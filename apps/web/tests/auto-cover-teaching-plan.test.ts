import assert from "node:assert/strict";
import test from "node:test";

import { autoCoverTeachingPlan } from "../lib/domain/auto-cover-teaching-plan";
import { buildCoverageOverview } from "../lib/domain/coverage-overview";
import type { StaffingPlan } from "../lib/local/staffing-plan-school-v2";
import type { TeachingPlan } from "../lib/local/teaching-plan";

function staffingPlan(teachers: StaffingPlan["teachers"]): StaffingPlan {
  return {
    version: 1,
    updatedAt: "2026-08-05T00:00:00.000Z",
    teachers,
  };
}

function teachingPlan(rows: TeachingPlan["rows"]): TeachingPlan {
  return {
    version: 1,
    updatedAt: "2026-08-05T00:00:00.000Z",
    classes: [
      { id: "class-6-a", code: "6.A", grade: 6, profile: "REGULAR" },
      { id: "class-6-b", code: "6.B", grade: 6, profile: "SPORTS" },
    ],
    rows,
  };
}

function teacher(
  id: string,
  firstName: string,
  lastName: string,
  subjectCode: string,
  weeklyPeriods: number,
): StaffingPlan["teachers"][number] {
  return {
    id,
    firstName,
    lastName,
    targetWeeklyLoad: weeklyPeriods,
    baseWeeklyLoad: Math.min(22, weeklyPeriods),
    subjectLoads: [
      {
        id: `load-${id}`,
        subjectCode,
        weeklyPeriods,
      },
    ],
    unavailableDays: [],
  };
}

test("fills a missing split-group teacher with a qualified colleague", () => {
  const result = autoCoverTeachingPlan(
    teachingPlan([
      {
        id: "row-cj",
        classCode: "6.A",
        subjectCode: "CJ",
        secondarySubjectCode: "",
        weeklyPeriods: 4,
        lessonShape: "SEPARATE",
        doublePeriodsCount: 0,
        organization: "SPLIT",
        rotationPlacement: "SAME_DAY",
        primaryTeacherId: "teacher-a",
        secondaryTeacherId: "",
      },
    ]),
    staffingPlan([
      teacher("teacher-a", "Anna", "První", "CJ", 4),
      teacher("teacher-b", "Bára", "Druhá", "CJ", 4),
    ]),
  );

  assert.equal(result.unresolved.length, 0);
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0]?.teacherId, "teacher-b");
  assert.equal(result.assignments[0]?.forcedOutsideDeclaredSubjects, false);
  assert.equal(result.teachingPlan.rows[0]?.primaryTeacherId, "teacher-a");
  assert.equal(result.teachingPlan.rows[0]?.secondaryTeacherId, "teacher-b");

  const overview = buildCoverageOverview(
    result.teachingPlan,
    result.staffingPlan,
  );
  assert.equal(overview.summary.missingTeacherHours, 0);
  assert.equal(overview.summary.coveragePercent, 100);
});

test("raises the total load when no contracted capacity remains", () => {
  const result = autoCoverTeachingPlan(
    teachingPlan([
      {
        id: "row-m",
        classCode: "6.A",
        subjectCode: "M",
        secondarySubjectCode: "",
        weeklyPeriods: 5,
        lessonShape: "SEPARATE",
        doublePeriodsCount: 0,
        organization: "WHOLE",
        rotationPlacement: "SAME_DAY",
        primaryTeacherId: "",
        secondaryTeacherId: "",
      },
    ]),
    staffingPlan([teacher("teacher-m", "Milan", "Matematik", "M", 2)]),
  );

  const updated = result.staffingPlan.teachers[0];
  assert.equal(result.unresolved.length, 0);
  assert.equal(result.assignments.length, 1);
  assert.equal(updated?.baseWeeklyLoad, 2);
  assert.equal(updated?.targetWeeklyLoad, 5);
  assert.deepEqual(
    updated?.subjectLoads.map((item) => [item.subjectCode, item.weeklyPeriods]),
    [["M", 5]],
  );
  assert.deepEqual(result.increasedTeachers, [
    {
      teacherId: "teacher-m",
      teacherName: "Milan Matematik",
      previousTargetWeeklyLoad: 2,
      targetWeeklyLoad: 5,
      increasedBy: 3,
    },
  ]);
  assert.equal(result.totalIncreasedHours, 3);
});

test("uses the least-loaded real teacher as a transparent emergency fallback", () => {
  const result = autoCoverTeachingPlan(
    teachingPlan([
      {
        id: "row-cj",
        classCode: "6.A",
        subjectCode: "CJ",
        secondarySubjectCode: "",
        weeklyPeriods: 2,
        lessonShape: "SEPARATE",
        doublePeriodsCount: 0,
        organization: "WHOLE",
        rotationPlacement: "SAME_DAY",
        primaryTeacherId: "",
        secondaryTeacherId: "",
      },
    ]),
    staffingPlan([teacher("teacher-m", "Milan", "Matematik", "M", 2)]),
  );

  assert.equal(result.unresolved.length, 0);
  assert.equal(result.forcedAssignmentCount, 1);
  assert.equal(result.assignments[0]?.teacherId, "teacher-m");
  assert.equal(result.assignments[0]?.forcedOutsideDeclaredSubjects, true);
  assert.deepEqual(
    result.staffingPlan.teachers[0]?.subjectLoads.map((item) => [
      item.subjectCode,
      item.weeklyPeriods,
    ]),
    [["CJ", 2]],
  );
});

test("a shared lesson increases teacher load only once", () => {
  const plan = teachingPlan([
    {
      id: "row-shared",
      classCode: "6.A",
      additionalClassCodes: ["6.B"],
      subjectCode: "TV",
      secondarySubjectCode: "",
      weeklyPeriods: 4,
      lessonShape: "DOUBLE",
      doublePeriodsCount: 0,
      organization: "WHOLE",
      rotationPlacement: "SAME_DAY",
      primaryTeacherId: "",
      secondaryTeacherId: "",
    },
  ]);
  const result = autoCoverTeachingPlan(
    plan,
    staffingPlan([teacher("teacher-tv", "Tereza", "Tělocvik", "TV", 1)]),
  );

  assert.equal(result.staffingPlan.teachers[0]?.targetWeeklyLoad, 4);
  assert.equal(result.totalIncreasedHours, 3);
  assert.equal(result.assignments[0]?.teacherHours, 4);
  assert.equal(
    buildCoverageOverview(result.teachingPlan, result.staffingPlan).summary
      .coveragePercent,
    100,
  );
});
