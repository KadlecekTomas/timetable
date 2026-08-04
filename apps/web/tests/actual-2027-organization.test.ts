import assert from "node:assert/strict";
import test from "node:test";

import type { StaffingAllocationDraft } from "../lib/local/staffing-allocation-draft";
import {
  createEmptyStaffingPlan,
  type StaffingTeacher,
} from "../lib/local/staffing-plan-school-v2";
import {
  applySchoolOperationalRules,
  createEmptyTeachingPlan,
  createTeachingPlanRow,
} from "../lib/local/teaching-plan-school-v2";

function teacher(id: string, lastName: string): StaffingTeacher {
  return {
    id,
    firstName: "Test",
    lastName,
    targetWeeklyLoad: 22,
    subjectLoads: [],
    unavailableDays: [],
  };
}

test("actual 2027 allocation evidence decides whole, split and partial groups", () => {
  const staffingPlan = createEmptyStaffingPlan();
  staffingPlan.teachers = [
    teacher("teacher-a", "Alfa"),
    teacher("teacher-b", "Beta"),
    teacher("teacher-c", "Gama"),
  ];

  const plan = createEmptyTeachingPlan();
  plan.rows = [
    {
      ...createTeachingPlanRow("6.A", "CJ"),
      weeklyPeriods: 5,
      organization: "SPLIT",
      primaryTeacherId: "teacher-a",
      secondaryTeacherId: "",
    },
    {
      ...createTeachingPlanRow("6.A", "JAZ1"),
      weeklyPeriods: 4,
    },
    {
      ...createTeachingPlanRow("8.B", "JAZ2"),
      weeklyPeriods: 3,
    },
    {
      ...createTeachingPlanRow("9.A", "JAZ2"),
      weeklyPeriods: 3,
    },
    {
      ...createTeachingPlanRow("9.B", "JAZ2"),
      weeklyPeriods: 3,
    },
    {
      ...createTeachingPlanRow("8.A", "VOL"),
      weeklyPeriods: 1,
    },
  ];

  const draft: StaffingAllocationDraft = {
    version: 1,
    source: "LEGACY_SCHOOL_MATRIX",
    rows: [
      {
        classCode: "6.A",
        subjectCode: "CJ",
        weeklyPeriods: 5,
        group: "WHOLE",
        teacherIds: ["teacher-a"],
        sourceSheet: "Úvazky 20252026",
        sourceRow: 44,
      },
      {
        classCode: "6.A",
        subjectCode: "JAZ1",
        weeklyPeriods: 4,
        group: "WHOLE",
        teacherIds: ["teacher-a", "teacher-b"],
        sourceSheet: "Úvazky 20252026",
        sourceRow: 46,
      },
      {
        classCode: "8.B",
        subjectCode: "JAZ2",
        weeklyPeriods: 3,
        group: "GROUP_1",
        teacherIds: [],
        sourceSheet: "Úvazky 20252026",
        sourceRow: 99,
      },
      {
        classCode: "8.B",
        subjectCode: "JAZ2",
        weeklyPeriods: 3,
        group: "GROUP_2",
        teacherIds: ["teacher-b"],
        sourceSheet: "Úvazky 20252026",
        sourceRow: 100,
      },
      {
        classCode: "9.A",
        subjectCode: "JAZ2",
        weeklyPeriods: 3,
        group: "GROUP_1",
        teacherIds: ["teacher-a"],
        sourceSheet: "Úvazky 20252026",
        sourceRow: 138,
      },
      {
        classCode: "9.B",
        subjectCode: "JAZ2",
        weeklyPeriods: 3,
        group: "GROUP_1",
        teacherIds: ["teacher-a", "teacher-c"],
        sourceSheet: "Úvazky 20252026",
        sourceRow: 138,
      },
      {
        classCode: "8.A",
        subjectCode: "SVS",
        weeklyPeriods: 1,
        group: "WHOLE",
        teacherIds: ["teacher-c"],
        sourceSheet: "Úvazky 20252026",
        sourceRow: 103,
      },
    ],
  };

  const result = applySchoolOperationalRules(plan, staffingPlan, draft);
  const row = (classCode: string, subjectCode: string) => {
    const found = result.rows.find(
      (item) =>
        item.classCode === classCode && item.subjectCode === subjectCode,
    );
    assert.ok(found, `${classCode} ${subjectCode} must exist`);
    return found;
  };

  assert.equal(row("6.A", "CJ").organization, "WHOLE");
  assert.equal(row("6.A", "CJ").primaryTeacherId, "teacher-a");

  assert.equal(row("6.A", "JAZ1").organization, "SPLIT");
  assert.equal(row("6.A", "JAZ1").primaryTeacherId, "teacher-a");
  assert.equal(row("6.A", "JAZ1").secondaryTeacherId, "teacher-b");

  assert.equal(row("8.B", "JAZ2").organization, "SPLIT");
  assert.equal(row("8.B", "JAZ2").primaryTeacherId, "");
  assert.equal(row("8.B", "JAZ2").secondaryTeacherId, "teacher-b");

  assert.equal(row("9.A", "JAZ2").organization, "WHOLE");
  assert.equal(row("9.A", "JAZ2").primaryTeacherId, "teacher-a");

  assert.equal(row("9.B", "JAZ2").organization, "SPLIT");
  assert.equal(row("9.B", "JAZ2").primaryTeacherId, "teacher-a");
  assert.equal(row("9.B", "JAZ2").secondaryTeacherId, "teacher-c");

  assert.equal(row("8.A", "VOL").organization, "WHOLE");
  assert.equal(row("8.A", "VOL").primaryTeacherId, "teacher-c");
});
