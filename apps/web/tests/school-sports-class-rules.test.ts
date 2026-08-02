import assert from "node:assert/strict";
import test from "node:test";

import {
  createTeachingPlanClass,
  createTeachingPlanRow,
  enforceSchoolTeachingPlanRules,
  inferredClassProfile,
  validateSchoolClassAllocations,
  type TeachingPlan,
  type TeachingPlanRow,
} from "../lib/local/teaching-plan-school";

function row(
  classCode: string,
  subjectCode: string,
  weeklyPeriods: number,
): TeachingPlanRow {
  return {
    ...createTeachingPlanRow(classCode, subjectCode),
    id: `${classCode}-${subjectCode}`,
    weeklyPeriods,
    primaryTeacherId: `teacher-${subjectCode.toLowerCase()}`,
  };
}

function plan(rows: TeachingPlanRow[]): TeachingPlan {
  return {
    version: 1,
    updatedAt: "2026-08-02T00:00:00.000Z",
    classes: ["6.A", "6.B", "6.C", "6.D"].map(createTeachingPlanClass),
    rows,
  };
}

test("B and D are always inferred as sports classes", () => {
  assert.equal(inferredClassProfile("6.A"), "REGULAR");
  assert.equal(inferredClassProfile("6.B"), "SPORTS");
  assert.equal(inferredClassProfile("9.C"), "REGULAR");
  assert.equal(inferredClassProfile("9.D"), "SPORTS");
});

test("school rules repair an accidentally changed B or D profile", () => {
  const source = plan([]);
  source.classes = source.classes.map((schoolClass) => ({
    ...schoolClass,
    profile: "REGULAR",
  }));

  const enforced = enforceSchoolTeachingPlanRules(source);
  assert.equal(
    enforced.classes.find((item) => item.code === "6.B")?.profile,
    "SPORTS",
  );
  assert.equal(
    enforced.classes.find((item) => item.code === "6.D")?.profile,
    "SPORTS",
  );
  assert.equal(
    enforced.classes.find((item) => item.code === "6.A")?.profile,
    "REGULAR",
  );
});

test("sports B and D accept the same subject-hour allocation as A and C", () => {
  const rows = ["6.A", "6.B", "6.C", "6.D"].flatMap((classCode) => [
    row(classCode, "CJ", 4),
    row(classCode, "M", 4),
    row(classCode, "TV", 2),
  ]);

  assert.deepEqual(validateSchoolClassAllocations(plan(rows)), []);
});

test("a different sports allocation is rejected before solving", () => {
  const rows = ["6.A", "6.B", "6.C", "6.D"].flatMap((classCode) => [
    row(classCode, "CJ", 4),
    row(classCode, "M", 4),
    row(classCode, "TV", classCode === "6.B" ? 4 : 2),
  ]);

  const messages = validateSchoolClassAllocations(plan(rows));
  assert.equal(messages.length, 1);
  assert.match(messages[0], /6\.B/);
  assert.match(messages[0], /TV: očekáváno 2, zadáno 4/);
});

test("A and C must also agree before they can be references", () => {
  const rows = ["6.A", "6.B", "6.C", "6.D"].flatMap((classCode) => [
    row(classCode, "CJ", classCode === "6.C" ? 5 : 4),
    row(classCode, "M", 4),
    row(classCode, "TV", 2),
  ]);

  const messages = validateSchoolClassAllocations(plan(rows));
  assert.ok(messages.some((message) => /6\.A a 6\.C/.test(message)));
});
