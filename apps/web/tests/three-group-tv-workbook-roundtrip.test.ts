import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeTeachingPlanWorkbook as analyzeLegacyWorkbook,
  createTeachingPlanWorkbook as createLegacyWorkbook,
} from "../lib/import/teaching-plan-workbook";
import {
  preserveThreeGroupTvOnExport,
  preserveThreeGroupTvOnImport,
} from "../lib/import/teaching-plan-workbook-third-groups";
import type { StaffingPlan } from "../lib/local/staffing-plan-school-v2";
import {
  createEmptyTeachingPlan,
  createTeachingPlanClass,
  createTeachingPlanRow,
} from "../lib/local/teaching-plan-school-v3";

function staffingPlan(): StaffingPlan {
  return {
    version: 1,
    updatedAt: "2026-08-18T00:00:00.000Z",
    teachers: ["Alpha", "Beta", "Gamma"].map((lastName, index) => ({
      id: `teacher-${index + 1}`,
      firstName: "TV",
      lastName,
      targetWeeklyLoad: 5,
      subjectLoads: [
        {
          id: `teacher-${index + 1}-tv`,
          subjectCode: "TV",
          weeklyPeriods: 5,
        },
      ],
      unavailableDays: [],
    })),
  };
}

test("three-group TV survives technical Excel export and re-import", async () => {
  const staffing = staffingPlan();
  const plan = createEmptyTeachingPlan();
  plan.classes = [createTeachingPlanClass("8.A")];
  const tv = createTeachingPlanRow("8.A", "TV");
  tv.weeklyPeriods = 5;
  tv.lessonShape = "MIXED";
  tv.doublePeriodsCount = 2;
  tv.organization = "SPLIT";
  tv.primaryTeacherId = "teacher-1";
  tv.secondaryTeacherId = "teacher-2";
  tv.tertiaryTeacherId = "teacher-3";
  tv.splitGroupCount = 3;
  plan.rows = [tv];

  const legacyBytes = await createLegacyWorkbook(staffing, plan);
  const exported = await preserveThreeGroupTvOnExport(
    legacyBytes,
    staffing,
    plan,
  );
  const legacyAnalysis = await analyzeLegacyWorkbook(exported, staffing);
  assert.equal(legacyAnalysis.valid, false);
  assert.ok(
    legacyAnalysis.issues.some((issue) =>
      issue.message.includes("pouze u dělené angličtiny"),
    ),
  );

  const repaired = await preserveThreeGroupTvOnImport(
    exported,
    staffing,
    legacyAnalysis,
  );
  assert.equal(repaired.valid, true);
  const imported = repaired.plan.rows.find(
    (row) => row.classCode === "8.A" && row.subjectCode === "TV",
  );
  assert.equal(imported?.organization, "SPLIT");
  assert.equal(imported?.splitGroupCount, 3);
  assert.equal(imported?.primaryTeacherId, "teacher-1");
  assert.equal(imported?.secondaryTeacherId, "teacher-2");
  assert.equal(imported?.tertiaryTeacherId, "teacher-3");
  assert.equal(imported?.lessonShape, "MIXED");
  assert.equal(imported?.doublePeriodsCount, 2);
});
