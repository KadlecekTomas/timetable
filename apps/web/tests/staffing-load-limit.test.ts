import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_WEEKLY_TEACHER_LOAD,
  baseWeeklyLoad,
  overtimeWeeklyLoad,
  validateStaffingTeacher,
  type StaffingTeacher,
} from "../lib/local/staffing-plan";

function teacher(baseLoad: number, overtimeLoad = 0): StaffingTeacher {
  const total = baseLoad + overtimeLoad;
  return {
    id: "teacher-test",
    firstName: "Test",
    lastName: "Teacher",
    baseWeeklyLoad: baseLoad,
    targetWeeklyLoad: total,
    subjectLoads: [
      { id: "load-test", subjectCode: "CJ", weeklyPeriods: total },
    ],
    unavailableDays: [],
  };
}

test("base load accepts 22, rejects 23 and permits explicit overtime", () => {
  assert.equal(MAX_WEEKLY_TEACHER_LOAD, 22);
  assert.equal(validateStaffingTeacher(teacher(22)).valid, true);
  assert.equal(validateStaffingTeacher(teacher(23)).valid, false);

  const overtimeTeacher = teacher(22, 3);
  assert.equal(baseWeeklyLoad(overtimeTeacher), 22);
  assert.equal(overtimeWeeklyLoad(overtimeTeacher), 3);
  assert.equal(validateStaffingTeacher(overtimeTeacher).valid, true);
});
