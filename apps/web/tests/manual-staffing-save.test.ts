import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyStaffingTeacher,
  validateStaffingTeacher,
} from "../lib/local/staffing-plan";

test("manual save keeps an invalid teacher draft intact for later correction", () => {
  const teacher = {
    ...createEmptyStaffingTeacher(),
    firstName: "Testovací",
    lastName: "Učitelka",
    targetWeeklyLoad: 25,
    subjectLoads: [
      {
        id: "manual-save-load",
        subjectCode: "M",
        weeklyPeriods: 22,
      },
    ],
  };

  const validation = validateStaffingTeacher(teacher);

  assert.equal(validation.valid, false);
  assert.equal(teacher.targetWeeklyLoad, 25);
  assert.match(
    validation.messages.join(" "),
    /Úvazek musí být celé číslo od 0 do 22 hodin/,
  );
});
