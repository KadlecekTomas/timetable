import assert from "node:assert/strict";
import test from "node:test";

import { proposeCzechMathRotations } from "../lib/domain/rotation-proposal";
import type { StaffingPlan } from "../lib/local/staffing-plan";
import {
  rowTeacherPeriods,
  type TeachingPlan,
  type TeachingPlanRow,
} from "../lib/local/teaching-plan";

function row(
  id: string,
  subjectCode: string,
  teacherId: string,
  weeklyPeriods: number,
): TeachingPlanRow {
  return {
    id,
    classCode: "7.A",
    subjectCode,
    weeklyPeriods,
    lessonShape: "SEPARATE",
    doublePeriodsCount: 0,
    organization: "SPLIT",
    primaryTeacherId: teacherId,
    secondaryTeacherId: "",
  };
}

function input(czechHours = 4, mathHours = 4, target = 12) {
  const plan: TeachingPlan = {
    version: 1,
    updatedAt: "test",
    classes: [{ id: "class", code: "7.A", grade: 7 }],
    rows: [
      row("cj", "CJ", "teacher-cj", czechHours),
      row("m", "M", "teacher-m", mathHours),
    ],
  };
  const staffingPlan: StaffingPlan = {
    version: 1,
    updatedAt: "test",
    teachers: [
      {
        id: "teacher-cj",
        firstName: "Český",
        lastName: "Učitel",
        targetWeeklyLoad: target,
        unavailableDays: [],
        subjectLoads: [
          { id: "load-cj", subjectCode: "CJ", weeklyPeriods: target },
        ],
      },
      {
        id: "teacher-m",
        firstName: "Matematický",
        lastName: "Učitel",
        targetWeeklyLoad: target,
        unavailableDays: [],
        subjectLoads: [
          { id: "load-m", subjectCode: "M", weeklyPeriods: target },
        ],
      },
    ],
  };
  return { plan, staffingPlan };
}

test("four-hour CJ/M rotation counts eight hours for each teacher", () => {
  const { plan, staffingPlan } = input();
  const proposal = proposeCzechMathRotations(plan, staffingPlan);
  assert.equal(proposal.candidates.length, 1);
  assert.equal(proposal.plan.rows.length, 1);
  assert.equal(proposal.plan.rows[0]?.organization, "ROTATION");
  assert.equal(proposal.plan.rows[0]?.rotationPlacement, "ADJACENT");
  assert.equal(rowTeacherPeriods(proposal.plan.rows[0]!, "teacher-cj"), 8);
  assert.equal(rowTeacherPeriods(proposal.plan.rows[0]!, "teacher-m"), 8);
});

test("CJ 5 / M 4 keeps one uncovered split CJ hour", () => {
  const { plan, staffingPlan } = input(5, 4);
  const proposal = proposeCzechMathRotations(plan, staffingPlan);
  assert.equal(proposal.candidates[0]?.residualHours, 1);
  assert.equal(proposal.residualUncoveredHours, 1);
  const residual = proposal.plan.rows.find((item) => item.id === "cj:residual");
  assert.equal(residual?.weeklyPeriods, 1);
  assert.equal(residual?.organization, "SPLIT");
  assert.equal(residual?.primaryTeacherId, "teacher-cj");
  assert.equal(residual?.secondaryTeacherId, "");
});

test("rotation is rejected when transformed load exceeds contractual capacity", () => {
  const { plan, staffingPlan } = input(4, 4, 7);
  const proposal = proposeCzechMathRotations(plan, staffingPlan);
  assert.equal(proposal.candidates.length, 0);
  assert.ok(proposal.rejected[0]?.reason.includes("8 hodin"));
  assert.deepEqual(proposal.plan, plan);
});
