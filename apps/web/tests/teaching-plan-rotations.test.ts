import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeTeachingPlanWorkbook,
  createTeachingPlanWorkbook,
  TEACHING_ROTATIONS_SHEET,
} from "../lib/import/teaching-plan-workbook";
import type { StaffingPlan } from "../lib/local/staffing-plan";
import {
  createTeachingPlanClass,
  createTeachingPlanRow,
  inferredClassProfile,
  rowClassPeriods,
  rowTeacherPeriods,
  validateTeachingPlan,
  type TeachingPlan,
} from "../lib/local/teaching-plan";

function staffingPlan(): StaffingPlan {
  return {
    version: 1,
    updatedAt: "2026-08-02T00:00:00.000Z",
    teachers: [
      {
        id: "teacher-cj",
        firstName: "Český",
        lastName: "Učitel",
        targetWeeklyLoad: 2,
        unavailableDays: [],
        subjectLoads: [{ id: "load-cj", subjectCode: "CJ", weeklyPeriods: 2 }],
      },
      {
        id: "teacher-m",
        firstName: "Matematický",
        lastName: "Učitel",
        targetWeeklyLoad: 2,
        unavailableDays: [],
        subjectLoads: [{ id: "load-m", subjectCode: "M", weeklyPeriods: 2 }],
      },
    ],
  };
}

function rotationPlan(): TeachingPlan {
  const schoolClass = createTeachingPlanClass("6.B");
  const row = {
    ...createTeachingPlanRow("6.B", "CJ"),
    id: "rotation-cj-m",
    secondarySubjectCode: "M",
    weeklyPeriods: 1,
    organization: "ROTATION" as const,
    primaryTeacherId: "teacher-cj",
    secondaryTeacherId: "teacher-m",
  };
  return {
    version: 1,
    updatedAt: "2026-08-02T00:00:00.000Z",
    classes: [schoolClass],
    rows: [row],
  };
}

test("B and D classes are suggested as sports but remain explicit profiles", () => {
  assert.equal(inferredClassProfile("6.B"), "SPORTS");
  assert.equal(inferredClassProfile("8.D"), "SPORTS");
  assert.equal(inferredClassProfile("7.A"), "REGULAR");
  assert.equal(createTeachingPlanClass("6.B").profile, "SPORTS");
});

test("subject rotation counts both legs for the class and both groups for teachers", () => {
  const row = rotationPlan().rows[0]!;
  assert.equal(rowClassPeriods(row), 2);
  assert.equal(rowTeacherPeriods(row, "teacher-cj"), 2);
  assert.equal(rowTeacherPeriods(row, "teacher-m"), 2);
  assert.deepEqual(validateTeachingPlan(rotationPlan(), staffingPlan()), []);
});

test("Excel roundtrip preserves sports profile and atomic Czech-Math exchange", async () => {
  const source = rotationPlan();
  const bytes = await createTeachingPlanWorkbook(staffingPlan(), source);
  const analysis = await analyzeTeachingPlanWorkbook(bytes, staffingPlan());

  assert.equal(analysis.valid, true);
  assert.deepEqual(analysis.issues, []);
  assert.equal(analysis.plan.classes[0]!.profile, "SPORTS");
  assert.equal(analysis.plan.rows[0]!.organization, "ROTATION");
  assert.equal(analysis.plan.rows[0]!.subjectCode, "CJ");
  assert.equal(analysis.plan.rows[0]!.secondarySubjectCode, "M");
  assert.equal(analysis.plan.rows[0]!.primaryTeacherId, "teacher-cj");
  assert.equal(analysis.plan.rows[0]!.secondaryTeacherId, "teacher-m");
  assert.equal(analysis.summary.weeklyClassPeriods, 2);

  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.default.Workbook();
  await workbook.xlsx.load(bytes as never);
  assert.ok(workbook.getWorksheet(TEACHING_ROTATIONS_SHEET));
});

test("rotation validation rejects missing swap semantics", () => {
  const invalid = rotationPlan();
  invalid.rows[0] = {
    ...invalid.rows[0]!,
    secondarySubjectCode: "CJ",
    secondaryTeacherId: "teacher-cj",
  };
  const messages = validateTeachingPlan(invalid, staffingPlan());
  assert.ok(messages.some((message) => message.includes("dva různé předměty")));
  assert.ok(messages.some((message) => message.includes("dva různé učitele")));
});
