import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

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
  rotationPlacementLabel,
  rowClassPeriods,
  rowTeacherPeriods,
  validateTeachingPlan,
  type TeachingPlan,
  type TeachingRotationPlacement,
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
        targetWeeklyLoad: 6,
        unavailableDays: [],
        subjectLoads: [{ id: "load-cj", subjectCode: "CJ", weeklyPeriods: 6 }],
      },
      {
        id: "teacher-m",
        firstName: "Matematický",
        lastName: "Učitel",
        targetWeeklyLoad: 6,
        unavailableDays: [],
        subjectLoads: [{ id: "load-m", subjectCode: "M", weeklyPeriods: 6 }],
      },
      {
        id: "teacher-tv",
        firstName: "Sportovní",
        lastName: "Učitel",
        targetWeeklyLoad: 6,
        unavailableDays: [],
        subjectLoads: [{ id: "load-tv", subjectCode: "TV", weeklyPeriods: 6 }],
      },
    ],
  };
}

function rotationPlan(
  rotationPlacement: TeachingRotationPlacement = "SAME_DAY",
): TeachingPlan {
  const regularClass = {
    ...createTeachingPlanClass("6.A"),
    profile: "REGULAR" as const,
  };
  const sportsClass = {
    ...createTeachingPlanClass("6.B"),
    profile: "SPORTS" as const,
  };
  const rows = [
    {
      ...createTeachingPlanRow("6.A", "CJ"),
      id: "6a-cj",
      weeklyPeriods: 4,
      primaryTeacherId: "teacher-cj",
    },
    {
      ...createTeachingPlanRow("6.A", "M"),
      id: "6a-m",
      weeklyPeriods: 4,
      primaryTeacherId: "teacher-m",
    },
    {
      ...createTeachingPlanRow("6.A", "TV"),
      id: "6a-tv",
      weeklyPeriods: 2,
      primaryTeacherId: "teacher-tv",
    },
    {
      ...createTeachingPlanRow("6.B", "CJ"),
      id: "rotation-cj-m",
      secondarySubjectCode: "M",
      weeklyPeriods: 1,
      organization: "ROTATION" as const,
      rotationPlacement,
      primaryTeacherId: "teacher-cj",
      secondaryTeacherId: "teacher-m",
    },
    {
      ...createTeachingPlanRow("6.B", "TV"),
      id: "6b-tv",
      weeklyPeriods: 4,
      primaryTeacherId: "teacher-tv",
    },
  ];
  return {
    version: 1,
    updatedAt: "2026-08-02T00:00:00.000Z",
    classes: [regularClass, sportsClass],
    rows,
  };
}

test("B and D classes are suggested as sports but remain explicit profiles", () => {
  assert.equal(inferredClassProfile("6.B"), "SPORTS");
  assert.equal(inferredClassProfile("8.D"), "SPORTS");
  assert.equal(inferredClassProfile("7.A"), "REGULAR");
  assert.equal(createTeachingPlanClass("6.B").profile, "SPORTS");

  const explicitRegularB = {
    ...createTeachingPlanClass("7.B"),
    profile: "REGULAR" as const,
  };
  assert.equal(explicitRegularB.profile, "REGULAR");
});

test("subject rotation counts both legs and class allocations stay independent", () => {
  const plan = rotationPlan("ADJACENT");
  const rotation = plan.rows.find((row) => row.organization === "ROTATION")!;
  assert.equal(rowClassPeriods(rotation), 2);
  assert.equal(rowTeacherPeriods(rotation, "teacher-cj"), 2);
  assert.equal(rowTeacherPeriods(rotation, "teacher-m"), 2);
  assert.equal(
    rotationPlacementLabel(rotation.rotationPlacement),
    "Hned po sobě",
  );

  const totals = new Map(
    plan.classes.map((schoolClass) => [
      schoolClass.code,
      plan.rows
        .filter((row) => row.classCode === schoolClass.code)
        .reduce((sum, row) => sum + rowClassPeriods(row), 0),
    ]),
  );
  assert.equal(totals.get("6.A"), 10);
  assert.equal(totals.get("6.B"), 6);
  assert.deepEqual(validateTeachingPlan(plan, staffingPlan()), []);
});

test("Excel roundtrip preserves sport profile, explicit allocations and rotation timing", async () => {
  const source = rotationPlan("FLEXIBLE");
  const bytes = await createTeachingPlanWorkbook(staffingPlan(), source);
  const analysis = await analyzeTeachingPlanWorkbook(bytes, staffingPlan());

  assert.equal(analysis.valid, true);
  assert.deepEqual(analysis.issues, []);
  assert.deepEqual(
    analysis.plan.classes.map((schoolClass) => [
      schoolClass.code,
      schoolClass.profile,
    ]),
    [
      ["6.A", "REGULAR"],
      ["6.B", "SPORTS"],
    ],
  );
  const rotation = analysis.plan.rows.find(
    (row) => row.organization === "ROTATION",
  )!;
  assert.equal(rotation.subjectCode, "CJ");
  assert.equal(rotation.secondarySubjectCode, "M");
  assert.equal(rotation.primaryTeacherId, "teacher-cj");
  assert.equal(rotation.secondaryTeacherId, "teacher-m");
  assert.equal(rotation.rotationPlacement, "FLEXIBLE");
  assert.equal(analysis.summary.weeklyClassPeriods, 16);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never);
  const worksheet = workbook.getWorksheet(TEACHING_ROTATIONS_SHEET);
  assert.ok(worksheet);
  assert.equal(worksheet.getCell("I6").text, "Kdykoliv během týdne");
});

test("Excel rejects a rotation without a timing mode", async () => {
  const bytes = await createTeachingPlanWorkbook(
    staffingPlan(),
    rotationPlan("SAME_DAY"),
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never);
  const worksheet = workbook.getWorksheet(TEACHING_ROTATIONS_SHEET);
  assert.ok(worksheet);
  worksheet.getCell("I6").value = "";

  const analysis = await analyzeTeachingPlanWorkbook(
    new Uint8Array(await workbook.xlsx.writeBuffer()),
    staffingPlan(),
  );
  assert.equal(analysis.valid, false);
  assert.ok(
    analysis.issues.some((issue) =>
      issue.message.includes("Vyberte režim výměny"),
    ),
  );
});

test("rotation validation rejects missing swap semantics", () => {
  const invalid = rotationPlan();
  const rotationIndex = invalid.rows.findIndex(
    (row) => row.organization === "ROTATION",
  );
  invalid.rows[rotationIndex] = {
    ...invalid.rows[rotationIndex]!,
    secondarySubjectCode: "CJ",
    secondaryTeacherId: "teacher-cj",
  };
  const messages = validateTeachingPlan(invalid, staffingPlan());
  assert.ok(messages.some((message) => message.includes("dva různé předměty")));
  assert.ok(messages.some((message) => message.includes("dva různé učitele")));
});
