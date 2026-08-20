import assert from "node:assert/strict";
import test from "node:test";

import { applySchoolTeacherAvailabilityDefaults } from "../lib/local/school-teacher-availability-defaults";
import type { StaffingPlan, StaffingTeacher } from "../lib/local/staffing-plan";

function teacher(id: string, lastName: string): StaffingTeacher {
  return {
    id,
    firstName: "Test",
    lastName,
    targetWeeklyLoad: 1,
    baseWeeklyLoad: 1,
    subjectLoads: [{ id: `${id}-load`, subjectCode: "TEST", weeklyPeriods: 1 }],
    unavailableDays: [],
    unavailablePeriods: [],
  };
}

function plan(...teachers: StaffingTeacher[]): StaffingPlan {
  return {
    version: 1,
    updatedAt: "test",
    teachers,
  };
}

function unavailable(
  result: ReturnType<typeof applySchoolTeacherAvailabilityDefaults>,
  teacherId: string,
): Set<string> {
  const item = result.plan.teachers.find((teacher) => teacher.id === teacherId);
  assert.ok(item);
  return new Set(
    (item.unavailablePeriods ?? []).map((slot) => `${slot.day}:${slot.period}`),
  );
}

test("V8 preset keeps Jakoubková free in fifth and sixth lesson every weekday", () => {
  const result = applySchoolTeacherAvailabilityDefaults(
    plan(teacher("teacher-j", "Jakoubková")),
  );
  const slots = unavailable(result, "teacher-j");

  for (const day of ["MON", "TUE", "WED", "THU", "FRI"] as const) {
    assert.ok(slots.has(`${day}:4`), `${day} fifth lesson must be unavailable`);
    assert.ok(slots.has(`${day}:5`), `${day} sixth lesson must be unavailable`);
  }
});

test("V8 preset blocks late Monday/Thursday teacher windows without making them global solver rules", () => {
  const result = applySchoolTeacherAvailabilityDefaults(
    plan(
      teacher("teacher-slon", "Slončíková"),
      teacher("teacher-jis", "Jislová"),
      teacher("teacher-sch", "Schoberová"),
    ),
  );

  const sloncikova = unavailable(result, "teacher-slon");
  assert.ok(sloncikova.has("MON:6"));
  assert.ok(sloncikova.has("MON:7"));

  const jislova = unavailable(result, "teacher-jis");
  assert.ok(jislova.has("MON:6"));
  assert.ok(jislova.has("MON:7"));

  const schoberova = unavailable(result, "teacher-sch");
  for (const key of ["MON:6", "MON:7", "THU:6", "THU:7"]) {
    assert.ok(schoberova.has(key));
  }
});
