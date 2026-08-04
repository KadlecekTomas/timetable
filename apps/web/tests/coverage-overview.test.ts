import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCoverageOverview,
  coverageCellKey,
} from "../lib/domain/coverage-overview";
import type { StaffingPlan } from "../lib/local/staffing-plan-school-v2";
import type { TeachingPlan } from "../lib/local/teaching-plan-school-v2";

const staffingPlan: StaffingPlan = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  teachers: [
    {
      id: "teacher-one",
      firstName: "Tomáš",
      lastName: "Kadleček",
      targetWeeklyLoad: 11,
      subjectLoads: [
        { id: "one-cj", subjectCode: "CJ", weeklyPeriods: 5 },
        { id: "one-inf", subjectCode: "INF", weeklyPeriods: 1 },
        { id: "one-ict", subjectCode: "ICT_VEDENI", weeklyPeriods: 5 },
      ],
      unavailableDays: [],
    },
    {
      id: "teacher-two",
      firstName: "Eliška",
      lastName: "Šárová",
      targetWeeklyLoad: 5,
      subjectLoads: [
        { id: "two-cj", subjectCode: "CJ", weeklyPeriods: 5 },
      ],
      unavailableDays: [],
    },
  ],
};

const teachingPlan: TeachingPlan = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  classes: [{ id: "class-6a", code: "6.A", grade: 6, profile: "REGULAR" }],
  rows: [
    {
      id: "row-cj",
      classCode: "6.A",
      subjectCode: "CJ",
      weeklyPeriods: 5,
      lessonShape: "SEPARATE",
      doublePeriodsCount: 0,
      organization: "SPLIT",
      primaryTeacherId: "teacher-one",
      secondaryTeacherId: "teacher-two",
    },
    {
      id: "row-inf",
      classCode: "6.A",
      subjectCode: "INF",
      weeklyPeriods: 1,
      lessonShape: "SEPARATE",
      doublePeriodsCount: 0,
      organization: "SPLIT",
      primaryTeacherId: "teacher-one",
      secondaryTeacherId: "",
    },
    {
      id: "row-dej",
      classCode: "6.A",
      subjectCode: "DEJ",
      weeklyPeriods: 2,
      lessonShape: "SEPARATE",
      doublePeriodsCount: 0,
      organization: "WHOLE",
      primaryTeacherId: "",
      secondaryTeacherId: "",
    },
  ],
};

test("coverage overview exposes green, orange and red cells with exact breakdown", () => {
  const overview = buildCoverageOverview(teachingPlan, staffingPlan);

  const czech = overview.cellByKey.get(coverageCellKey("6.A", "CJ"));
  const informatics = overview.cellByKey.get(coverageCellKey("6.A", "INF"));
  const history = overview.cellByKey.get(coverageCellKey("6.A", "DEJ"));

  assert.ok(czech && informatics && history);
  assert.equal(czech.status, "FULL");
  assert.equal(czech.assignedSlots, 2);
  assert.equal(czech.requiredSlots, 2);
  assert.equal(czech.requiredClassPeriods, 5);
  assert.equal(czech.requiredTeacherHours, 10);

  assert.equal(informatics.status, "PARTIAL");
  assert.equal(informatics.assignedSlots, 1);
  assert.equal(informatics.requiredSlots, 2);
  assert.equal(informatics.missingTeacherHours, 1);
  assert.deepEqual(informatics.missingRoles, ["učitel 2. skupiny"]);

  assert.equal(history.status, "MISSING");
  assert.equal(history.assignedSlots, 0);
  assert.equal(history.requiredSlots, 1);
  assert.equal(history.missingTeacherHours, 2);

  assert.equal(overview.summary.requiredClassPeriods, 8);
  assert.equal(overview.summary.requiredTeacherHours, 14);
  assert.equal(overview.summary.assignedTeacherHours, 11);
  assert.equal(overview.summary.missingTeacherHours, 3);
  assert.equal(overview.summary.coveragePercent, 79);
  assert.equal(overview.summary.fullCells, 1);
  assert.equal(overview.summary.partialCells, 1);
  assert.equal(overview.summary.missingCells, 1);

  assert.equal(overview.problems[0]?.subjectCode, "DEJ");
  assert.equal(overview.problems[1]?.subjectCode, "INF");
});

test("non-teaching leadership is visible in workload but never counted as a lesson", () => {
  const overview = buildCoverageOverview(teachingPlan, staffingPlan);
  const kadlecek = overview.teachers.find(
    (teacher) => teacher.teacherId === "teacher-one",
  );

  assert.ok(kadlecek);
  assert.equal(kadlecek.scheduledTeachingHours, 6);
  assert.equal(kadlecek.nonTeachingHours, 5);
  assert.equal(kadlecek.totalUsedHours, 11);
  assert.equal(kadlecek.targetWeeklyLoad, 11);
  assert.equal(kadlecek.difference, 0);
  assert.equal(kadlecek.status, "FULL");
});

test("rotation shows each subject separately and keeps shared classes readable", () => {
  const plan: TeachingPlan = {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    classes: [
      { id: "class-6a", code: "6.A", grade: 6, profile: "REGULAR" },
      { id: "class-6b", code: "6.B", grade: 6, profile: "SPORTS" },
    ],
    rows: [
      {
        id: "row-rotation",
        classCode: "6.A",
        additionalClassCodes: ["6.B"],
        subjectCode: "M",
        secondarySubjectCode: "CJ",
        weeklyPeriods: 2,
        lessonShape: "SEPARATE",
        doublePeriodsCount: 0,
        organization: "ROTATION",
        rotationPlacement: "SAME_DAY",
        primaryTeacherId: "teacher-one",
        secondaryTeacherId: "",
      },
    ],
  };

  const overview = buildCoverageOverview(plan, staffingPlan);

  assert.equal(
    overview.cellByKey.get(coverageCellKey("6.A", "M"))?.status,
    "FULL",
  );
  assert.equal(
    overview.cellByKey.get(coverageCellKey("6.A", "CJ"))?.status,
    "MISSING",
  );
  assert.equal(
    overview.cellByKey.get(coverageCellKey("6.B", "M"))?.status,
    "FULL",
  );
  assert.equal(
    overview.cellByKey.get(coverageCellKey("6.B", "CJ"))?.status,
    "MISSING",
  );
  assert.equal(overview.summary.requiredTeacherHours, 8);
  assert.equal(overview.summary.assignedTeacherHours, 4);
});
