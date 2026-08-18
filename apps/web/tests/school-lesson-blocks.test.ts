import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyTeachingPlan,
  createTeachingPlanRow,
  enforceCurrentSchoolTeachingStructure,
  lessonBlockDurations,
} from "../lib/local/teaching-plan-school-v3";

function enforcedRow(subjectCode: string, weeklyPeriods: number) {
  const plan = createEmptyTeachingPlan();
  plan.rows = [
    {
      ...createTeachingPlanRow("6.A", subjectCode),
      weeklyPeriods,
      lessonShape: "SEPARATE",
      doublePeriodsCount: 0,
    },
  ];
  return enforceCurrentSchoolTeachingStructure(plan).rows[0]!;
}

test("two weekly physical education periods are one double lesson", () => {
  const row = enforcedRow("TV", 2);
  assert.equal(row.lessonShape, "DOUBLE");
  assert.equal(row.doublePeriodsCount, 1);
  assert.deepEqual(lessonBlockDurations(row), [2]);
});

test("two weekly art periods are one double lesson", () => {
  const row = enforcedRow("VV", 2);
  assert.equal(row.lessonShape, "DOUBLE");
  assert.equal(row.doublePeriodsCount, 1);
  assert.deepEqual(lessonBlockDurations(row), [2]);
});

test("five weekly physical education periods are two doubles and one single", () => {
  const row = enforcedRow("TV", 5);
  assert.equal(row.lessonShape, "MIXED");
  assert.equal(row.doublePeriodsCount, 2);
  assert.deepEqual(lessonBlockDurations(row), [2, 2, 1]);
});

test("other two-period subjects keep their configured lesson shape", () => {
  const row = enforcedRow("DEJ", 2);
  assert.equal(row.lessonShape, "SEPARATE");
  assert.equal(row.doublePeriodsCount, 0);
  assert.deepEqual(lessonBlockDurations(row), [1, 1]);
});
