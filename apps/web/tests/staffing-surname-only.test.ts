import assert from "node:assert/strict";
import test from "node:test";

import {
  validateStaffingPlan,
  validateStaffingTeacher,
  type StaffingPlan,
  type StaffingTeacher,
} from "../lib/local/staffing-plan";

const surnameOnlyTeacher: StaffingTeacher = {
  id: "teacher-kvapilova",
  firstName: "",
  lastName: "Kvapilová",
  targetWeeklyLoad: 3,
  baseWeeklyLoad: 3,
  subjectLoads: [
    { id: "teacher-kvapilova:jaz2", subjectCode: "JAZ2", weeklyPeriods: 3 },
  ],
  unavailableDays: [],
  unavailablePeriods: [],
};

test("surname alone is enough to identify and validate a teacher", () => {
  const validation = validateStaffingTeacher(surnameOnlyTeacher);
  assert.equal(validation.valid, true);
  assert.equal(
    validation.messages.some((message) => message.includes("Doplňte jméno")),
    false,
  );

  const plan: StaffingPlan = {
    version: 1,
    updatedAt: "test",
    teachers: [surnameOnlyTeacher],
  };
  assert.deepEqual(validateStaffingPlan(plan), []);
});
