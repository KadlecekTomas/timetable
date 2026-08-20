import assert from "node:assert/strict";
import test from "node:test";

import type { LocalAssignment, LocalSubject } from "../lib/local/api";
import { schoolSchedulingPreferences } from "../lib/local/school-scheduling-preferences";
import { createEmptyStaffingPlan } from "../lib/local/staffing-plan-school-v2";
import {
  applySchoolOperationalRules,
  createEmptyTeachingPlan,
  createTeachingPlanRow,
} from "../lib/local/teaching-plan-school-v3";

function teacher(id: string, lastName: string) {
  return {
    id,
    firstName: "",
    lastName,
    targetWeeklyLoad: 20,
    baseWeeklyLoad: 20,
    subjectLoads: [{ id: `${id}-tv`, subjectCode: "TV", weeklyPeriods: 20 }],
    unavailableDays: [],
    unavailablePeriods: [],
  };
}

test("9.A and 9.C PE keep imported split staffing instead of being rewritten to Přikrylová", () => {
  const staffingPlan = createEmptyStaffingPlan();
  staffingPlan.teachers = [
    teacher("prikrylova", "Přikrylová"),
    teacher("sobotnik", "Šobotník"),
    teacher("masek", "Mašek"),
  ];

  const plan = createEmptyTeachingPlan();
  plan.rows = [
    ...["8.A", "8.B", "8.C", "9.B"].map((classCode) => {
      const row = createTeachingPlanRow(classCode, "TV");
      row.weeklyPeriods = classCode === "8.B" ? 5 : 2;
      row.organization = "SPLIT";
      row.primaryTeacherId = "sobotnik";
      row.secondaryTeacherId = "masek";
      if (classCode === "8.B") {
        row.splitGroupCount = 3;
        row.tertiaryTeacherId = "prikrylova";
      }
      return row;
    }),
    ...["9.A", "9.C"].map((classCode) => {
      const row = createTeachingPlanRow(classCode, "TV");
      row.weeklyPeriods = 2;
      row.organization = "SPLIT";
      row.primaryTeacherId = "sobotnik";
      row.secondaryTeacherId = "masek";
      return row;
    }),
  ];

  const enforced = applySchoolOperationalRules(plan, staffingPlan, null);

  for (const classCode of ["9.A", "9.C"]) {
    const row = enforced.rows.find(
      (item) => item.classCode === classCode && item.subjectCode === "TV",
    );
    assert.equal(row?.organization, "SPLIT", classCode);
    assert.equal(row?.primaryTeacherId, "sobotnik", classCode);
    assert.equal(row?.secondaryTeacherId, "masek", classCode);
    assert.equal(row?.lessonShape, "DOUBLE", classCode);
    assert.equal(row?.doublePeriodsCount, 1, classCode);
  }

  for (const classCode of ["8.A", "8.B", "8.C", "9.B"]) {
    const row = enforced.rows.find(
      (item) => item.classCode === classCode && item.subjectCode === "TV",
    );
    assert.equal(row?.organization, "SPLIT", classCode);
  }

  const eightB = enforced.rows.find(
    (item) => item.classCode === "8.B" && item.subjectCode === "TV",
  );
  assert.equal(eightB?.splitGroupCount, 3);
  assert.equal(eightB?.lessonShape, "MIXED");
  assert.equal(eightB?.doublePeriodsCount, 2);
});

test("every generated PE assignment is capped at two periods per day", () => {
  const staffingPlan = createEmptyStaffingPlan();
  const assignments: LocalAssignment[] = [
    {
      id: "assignment:8-b-tv-g3",
      assignmentCode: "8-B-TV-G3",
      classId: "class:8-B",
      additionalClassIds: [],
      subjectId: "subject:TV",
      teacherId: "teacher:sobotnik",
      group: "GROUP_3",
      weeklyPeriods: 5,
      lessonShape: "MIXED",
      doublePeriodsCount: 2,
      requiredRoomId: null,
      requiredRoomTypeId: "room-type:TV",
      maxPerDay: null,
      minDayGap: null,
      parallelKey: "8-B-TV",
      roomShareKey: null,
      rotationKey: null,
      rotationLeg: null,
      rotationPlacement: null,
    },
  ];
  const subjects: LocalSubject[] = [
    {
      id: "subject:TV",
      code: "TV",
      name: "Tělesná výchova",
      colorToken: null,
      defaultRoomTypeId: "room-type:TV",
    },
  ];

  schoolSchedulingPreferences({
    assignments,
    subjects,
    staffingPlan,
    existingFixedLessons: [],
  });

  assert.equal(assignments[0]?.maxPerDay, 2);
});
