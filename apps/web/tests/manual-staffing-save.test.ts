import assert from "node:assert/strict";
import test from "node:test";

import {
  baseWeeklyLoad,
  createEmptyStaffingTeacher,
  overtimeWeeklyLoad,
  validateStaffingTeacher,
} from "../lib/local/staffing-plan";

test("legacy 25-hour total is interpreted as 22 base plus 3 overtime", () => {
  const teacher = {
    ...createEmptyStaffingTeacher(),
    firstName: "Testovací",
    lastName: "Učitelka",
    targetWeeklyLoad: 25,
    baseWeeklyLoad: undefined,
    subjectLoads: [
      {
        id: "manual-save-load",
        subjectCode: "M",
        weeklyPeriods: 25,
      },
    ],
  };

  const validation = validateStaffingTeacher(teacher);
  const baseLoad = baseWeeklyLoad(teacher);
  const overtimeLoad = overtimeWeeklyLoad(teacher);

  assert.equal(baseLoad, 22);
  assert.equal(overtimeLoad, 3);
  assert.equal(baseLoad + overtimeLoad, teacher.targetWeeklyLoad);
  assert.equal(validation.assignedWeeklyLoad, 25);
  assert.equal(validation.difference, 0);
  assert.deepEqual(validation.messages, []);
  assert.equal(validation.valid, true);
});

test("base load above 22 remains a blocking validation error", () => {
  const teacher = {
    ...createEmptyStaffingTeacher(),
    firstName: "Testovací",
    lastName: "Učitelka",
    baseWeeklyLoad: 23,
    targetWeeklyLoad: 23,
    subjectLoads: [
      {
        id: "invalid-base-load",
        subjectCode: "M",
        weeklyPeriods: 23,
      },
    ],
  };

  const validation = validateStaffingTeacher(teacher);

  assert.equal(validation.valid, false);
  assert.match(
    validation.messages.join(" "),
    /Základní úvazek musí být celé číslo od 0 do 22 hodin/,
  );
});
