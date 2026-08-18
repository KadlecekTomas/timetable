import assert from "node:assert/strict";
import test from "node:test";

import type { StaffingAllocationDraft } from "../lib/local/staffing-allocation-draft";
import {
  createEmptyStaffingPlan,
  type StaffingPlan,
} from "../lib/local/staffing-plan-school-v2";
import {
  SCHOOL_CLASS_CODES,
  createTeachingPlanClass,
  createTeachingPlanRow,
} from "../lib/local/teaching-plan-school";
import { preserveThirdParallelTeachers } from "../lib/local/teaching-plan-allocation-groups";
import {
  applySchoolOperationalRules,
  createEmptyTeachingPlan,
} from "../lib/local/teaching-plan-school-v3";

function staffingPlan(): StaffingPlan {
  const plan = createEmptyStaffingPlan();
  plan.teachers = ["alpha", "beta", "gamma"].map((id) => ({
    id,
    firstName: id,
    lastName: "Teacher",
    targetWeeklyLoad: 5,
    subjectLoads: [{ id: `${id}-tv`, subjectCode: "TV", weeklyPeriods: 5 }],
    unavailableDays: [],
  }));
  return plan;
}

test("authoritative curriculum merge restores the third parallel TV teacher", () => {
  const plan = createEmptyTeachingPlan();
  plan.classes = SCHOOL_CLASS_CODES.map((code) =>
    createTeachingPlanClass(code),
  );
  const tv = createTeachingPlanRow("6.B", "TV");
  tv.weeklyPeriods = 5;
  tv.organization = "SPLIT";
  tv.primaryTeacherId = "alpha";
  tv.secondaryTeacherId = "beta";
  plan.rows = [tv];

  const draft: StaffingAllocationDraft = {
    version: 1,
    source: "LEGACY_SCHOOL_MATRIX",
    rows: [
      {
        classCode: "6.B",
        subjectCode: "TV",
        weeklyPeriods: 5,
        teacherExtraPeriods: 0,
        group: "WHOLE",
        teacherIds: ["alpha", "beta", "gamma"],
        sourceSheet: "Úvazky",
        sourceRow: 45,
      },
    ],
  };

  const restored = preserveThirdParallelTeachers(plan, draft);
  const restoredTv = restored.rows[0]!;
  assert.equal(restoredTv.organization, "SPLIT");
  assert.equal(restoredTv.splitGroupCount, 3);
  assert.equal(restoredTv.primaryTeacherId, "alpha");
  assert.equal(restoredTv.secondaryTeacherId, "beta");
  assert.equal(restoredTv.tertiaryTeacherId, "gamma");

  const enforced = applySchoolOperationalRules(restored, staffingPlan(), draft);
  const enforcedTv = enforced.rows[0]!;
  assert.equal(enforcedTv.splitGroupCount, 3);
  assert.equal(enforcedTv.tertiaryTeacherId, "gamma");
  assert.equal(enforcedTv.lessonShape, "MIXED");
  assert.equal(enforcedTv.doublePeriodsCount, 2);
});
