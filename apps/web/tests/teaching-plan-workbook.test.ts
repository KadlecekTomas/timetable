import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import {
  TEACHING_PLAN_SHEET,
  analyzeTeachingPlanWorkbook,
  createTeachingPlanWorkbook,
} from "../lib/import/teaching-plan-workbook";
import type { StaffingPlan } from "../lib/local/staffing-plan";
import {
  createTeachingPlanClass,
  createTeachingPlanRow,
  humanBlockSummary,
  lessonBlockDurations,
  type TeachingPlan,
  validateTeachingPlan,
} from "../lib/local/teaching-plan";

function staffingPlan(): StaffingPlan {
  return {
    version: 1,
    updatedAt: "2026-08-01T00:00:00.000Z",
    teachers: [
      {
        id: "teacher-kad",
        firstName: "Tomáš",
        lastName: "Kadleček",
        targetWeeklyLoad: 3,
        unavailableDays: [],
        subjectLoads: [
          { id: "kad-inf", subjectCode: "INF", weeklyPeriods: 1 },
          { id: "kad-vv", subjectCode: "VV", weeklyPeriods: 2 },
        ],
      },
      {
        id: "teacher-vas",
        firstName: "N.",
        lastName: "Vašáková",
        targetWeeklyLoad: 1,
        unavailableDays: [],
        subjectLoads: [
          { id: "vas-inf", subjectCode: "INF", weeklyPeriods: 1 },
        ],
      },
    ],
  };
}

function validPlan(): TeachingPlan {
  const schoolClass = createTeachingPlanClass("8.A");
  const art = {
    ...createTeachingPlanRow("8.A", "VV"),
    id: "row-vv",
    weeklyPeriods: 2,
    lessonShape: "DOUBLE" as const,
    doublePeriodsCount: 1,
    organization: "WHOLE" as const,
    primaryTeacherId: "teacher-kad",
  };
  const informatics = {
    ...createTeachingPlanRow("8.A", "INF"),
    id: "row-inf",
    weeklyPeriods: 1,
    lessonShape: "SEPARATE" as const,
    organization: "SPLIT" as const,
    primaryTeacherId: "teacher-kad",
    secondaryTeacherId: "teacher-vas",
  };
  return {
    version: 1,
    updatedAt: "2026-08-01T00:00:00.000Z",
    classes: [schoolClass],
    rows: [art, informatics],
  };
}

test("lesson shapes present visual blocks without technical syntax", () => {
  const art = validPlan().rows[0]!;
  assert.deepEqual(lessonBlockDurations(art), [2]);
  assert.equal(humanBlockSummary(art), "1× dvojhodina");

  const mixed = {
    ...art,
    weeklyPeriods: 3,
    lessonShape: "MIXED" as const,
    doublePeriodsCount: 1,
  };
  assert.deepEqual(lessonBlockDurations(mixed), [2, 1]);
  assert.equal(
    humanBlockSummary(mixed),
    "1× dvojhodina + 1× samostatná hodina",
  );
});

test("teaching plan validates a double VV lesson and parallel INF groups", () => {
  const messages = validateTeachingPlan(validPlan(), staffingPlan());
  assert.deepEqual(messages, []);
});

test("human friendly workbook roundtrips double lessons and split teachers", async () => {
  const sourcePlan = validPlan();
  const analysis = await analyzeTeachingPlanWorkbook(
    await createTeachingPlanWorkbook(staffingPlan(), sourcePlan),
    staffingPlan(),
  );

  assert.equal(analysis.valid, true);
  assert.deepEqual(analysis.issues, []);
  assert.deepEqual(analysis.summary, {
    classes: 1,
    subjects: 2,
    splitSubjects: 1,
    doubleBlocks: 1,
    weeklyClassPeriods: 3,
  });
  assert.equal(analysis.plan.rows[0]!.subjectCode, "VV");
  assert.equal(analysis.plan.rows[0]!.lessonShape, "DOUBLE");
  assert.equal(analysis.plan.rows[0]!.doublePeriodsCount, 1);
  assert.equal(analysis.plan.rows[1]!.organization, "SPLIT");
  assert.equal(analysis.plan.rows[1]!.primaryTeacherId, "teacher-kad");
  assert.equal(analysis.plan.rows[1]!.secondaryTeacherId, "teacher-vas");
});

test("workbook rejects an odd number marked as only double periods", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    (await createTeachingPlanWorkbook(staffingPlan(), validPlan())) as never,
  );
  const worksheet = workbook.getWorksheet(TEACHING_PLAN_SHEET);
  assert.ok(worksheet);
  worksheet.getCell("C6").value = 3;
  worksheet.getCell("D6").value = "Pouze dvojhodiny";

  const analysis = await analyzeTeachingPlanWorkbook(
    new Uint8Array(await workbook.xlsx.writeBuffer()),
    staffingPlan(),
  );

  assert.equal(analysis.valid, false);
  assert.ok(
    analysis.issues.some((issue) =>
      issue.message.includes("sudý počet hodin týdně"),
    ),
  );
});

test("workbook rejects a split lesson with the same teacher twice", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    (await createTeachingPlanWorkbook(staffingPlan(), validPlan())) as never,
  );
  const worksheet = workbook.getWorksheet(TEACHING_PLAN_SHEET);
  assert.ok(worksheet);
  worksheet.getCell("H7").value = worksheet.getCell("G7").value;

  const analysis = await analyzeTeachingPlanWorkbook(
    new Uint8Array(await workbook.xlsx.writeBuffer()),
    staffingPlan(),
  );

  assert.equal(analysis.valid, false);
  assert.ok(
    analysis.issues.some((issue) =>
      issue.message.includes("jiného učitele"),
    ),
  );
});
