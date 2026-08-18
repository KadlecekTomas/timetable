import assert from "node:assert/strict";
import test from "node:test";

import type { StaffingAllocationDraft } from "../lib/local/staffing-allocation-draft";
import {
  createEmptyStaffingPlan,
  type StaffingPlan,
} from "../lib/local/staffing-plan-school-v2";
import { preserveThirdParallelTeachers } from "../lib/local/teaching-plan-allocation-groups";
import {
  applySchoolOperationalRules,
  createEmptyTeachingPlan,
} from "../lib/local/teaching-plan-school-v3";
import {
  SCHOOL_CLASS_CODES,
  createTeachingPlanClass,
  createTeachingPlanRow,
} from "../lib/local/teaching-plan-school";

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

test("curriculum merge keeps the third parallel TV teacher", () => {
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
        sourceRow: 14,
      },
    ],
  };

  const restored = preserveThirdParallelTeachers(plan, draft);
  const enforced = applySchoolOperationalRules(restored, staffingPlan(), draft);
  const enforcedTv = enforced.rows.find(
    (row) => row.classCode === "6.B" && row.subjectCode === "TV",
  );

  assert.equal(enforcedTv?.organization, "SPLIT");
  assert.equal(enforcedTv?.splitGroupCount, 3);
  assert.equal(enforcedTv?.primaryTeacherId, "alpha");
  assert.equal(enforcedTv?.secondaryTeacherId, "beta");
  assert.equal(enforcedTv?.tertiaryTeacherId, "gamma");
});
