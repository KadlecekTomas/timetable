import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_WEEKLY_TEACHER_LOAD,
  validateStaffingTeacher,
  type StaffingTeacher,
} from "../lib/local/staffing-plan";

function teacher(targetWeeklyLoad: number): StaffingTeacher {
  return {
    id: "teacher-test",
    firstName: "Test",
    lastName: "Teacher",
    targetWeeklyLoad,
    subjectLoads: [
      { id: "load-test", subjectCode: "CJ", weeklyPeriods: targetWeeklyLoad },
    ],
    unavailableDays: [],
  };
}

test("teacher load accepts 22 hours and rejects 23 and 25", () => {
  assert.equal(MAX_WEEKLY_TEACHER_LOAD, 22);
  assert.equal(validateStaffingTeacher(teacher(22)).valid, true);
  assert.equal(validateStaffingTeacher(teacher(23)).valid, false);
  assert.equal(validateStaffingTeacher(teacher(25)).valid, false);
});
