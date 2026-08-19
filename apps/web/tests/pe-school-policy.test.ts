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
    subjectLoads: [
      { id: `${id}-tv`, subjectCode: "TV", weeklyPeriods: 10 },
      { id: `${id}-jaz2`, subjectCode: "JAZ2", weeklyPeriods: 10 },
    ],
    unavailableDays: [],
    unavailablePeriods: [],
  };
}

test("9.A and 9.C JAZ2 use only Přikrylová while shared organization and 9.B staffing stay intact", () => {
  const staffingPlan = createEmptyStaffingPlan();
  staffingPlan.teachers = [
    teacher("prikrylova", "Přikrylová"),
    teacher("sobotnik", "Šobotník"),
    teacher("masek", "Mašek"),
  ];

  const plan = createEmptyTeachingPlan();
  const language9A = createTeachingPlanRow("9.A", "JAZ2");
  language9A.organization = "SPLIT";
  language9A.primaryTeacherId = "sobotnik";
  language9A.secondaryTeacherId = "masek";
  const language9B = createTeachingPlanRow("9.B", "JAZ2");
  language9B.organization = "SPLIT";
  language9B.primaryTeacherId = "masek";
  language9B.secondaryTeacherId = "prikrylova";
  const language9C = createTeachingPlanRow("9.C", "JAZ2");
  language9C.organization = "SPLIT";
  language9C.primaryTeacherId = "sobotnik";
  language9C.secondaryTeacherId = "masek";
  plan.rows = [language9A, language9B, language9C];

  const enforced = applySchoolOperationalRules(plan, staffingPlan, null);

  const row = enforced.rows.find((item) => item.subjectCode === "JAZ2");
  assert.ok(row);
  assert.equal(row.organization, "SPLIT");
  assert.deepEqual(
    [row.classCode, ...(row.additionalClassCodes ?? [])].sort(),
    ["9.A", "9.B", "9.C"],
  );
  assert.deepEqual(row.teacherClassCodes?.prikrylova, ["9.A", "9.B", "9.C"]);
  assert.deepEqual(row.teacherClassCodes?.masek, ["9.B"]);
});

test("9.A and 9.C PE keep source organization and teachers", () => {
  const staffingPlan = createEmptyStaffingPlan();
  staffingPlan.teachers = [
    teacher("prikrylova", "Přikrylová"),
    teacher("sobotnik", "Šobotník"),
    teacher("masek", "Mašek"),
  ];
  const plan = createEmptyTeachingPlan();
  plan.rows = [
    ["9.A", "sobotnik", "masek"],
    ["9.C", "masek", "sobotnik"],
  ].map(([classCode, primaryTeacherId, secondaryTeacherId]) => {
    const row = createTeachingPlanRow(classCode!, "TV");
    row.weeklyPeriods = 2;
    row.organization = "SPLIT";
    row.primaryTeacherId = primaryTeacherId!;
    row.secondaryTeacherId = secondaryTeacherId!;
    return row;
  });

  const enforced = applySchoolOperationalRules(plan, staffingPlan, null);
  for (const [classCode, primaryTeacherId, secondaryTeacherId] of [
    ["9.A", "sobotnik", "masek"],
    ["9.C", "masek", "sobotnik"],
  ]) {
    const row = enforced.rows.find(
      (item) => item.classCode === classCode && item.subjectCode === "TV",
    );
    assert.equal(row?.organization, "SPLIT", classCode);
    assert.equal(row?.primaryTeacherId, primaryTeacherId, classCode);
    assert.equal(row?.secondaryTeacherId, secondaryTeacherId, classCode);
    assert.equal(row?.lessonShape, "DOUBLE", classCode);
    assert.equal(row?.doublePeriodsCount, 1, classCode);
  }
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
