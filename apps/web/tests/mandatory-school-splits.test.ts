import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCoverageOverview,
  coverageCellKey,
} from "../lib/domain/coverage-overview";
import { createEmptyStaffingPlan } from "../lib/local/staffing-plan-school-v2";
import {
  applySchoolOperationalRules,
  createEmptyTeachingPlan,
  createTeachingPlanRow,
} from "../lib/local/teaching-plan-school-v3";

const mandatorySubjects = ["CJ", "M", "INF", "TV", "JAZ1", "JAZ2"];

test("current school plan always requires two groups for mandatory split subjects", () => {
  const staffingPlan = createEmptyStaffingPlan();
  const plan = createEmptyTeachingPlan();
  plan.rows = [
    ...mandatorySubjects.map((subjectCode) => ({
      ...createTeachingPlanRow("6.A", subjectCode),
      weeklyPeriods: subjectCode === "INF" ? 1 : 2,
      organization: "WHOLE" as const,
    })),
    {
      ...createTeachingPlanRow("6.A", "DEJ"),
      weeklyPeriods: 2,
      organization: "WHOLE" as const,
    },
  ];

  const enforced = applySchoolOperationalRules(plan, staffingPlan, null);

  for (const subjectCode of mandatorySubjects) {
    const row = enforced.rows.find(
      (item) => item.classCode === "6.A" && item.subjectCode === subjectCode,
    );
    assert.equal(row?.organization, "SPLIT", subjectCode);
  }
  assert.equal(
    enforced.rows.find((item) => item.subjectCode === "DEJ")?.organization,
    "WHOLE",
  );

  const overview = buildCoverageOverview(enforced, staffingPlan);
  for (const subjectCode of mandatorySubjects) {
    const cell = overview.cellByKey.get(coverageCellKey("6.A", subjectCode));
    assert.equal(cell?.requiredSlots, 2, subjectCode);
    assert.equal(cell?.assignedSlots, 0, subjectCode);
  }
  assert.equal(
    overview.cellByKey.get(coverageCellKey("6.A", "DEJ"))?.requiredSlots,
    1,
  );
});

test("rotations remain rotations even when they contain split subject codes", () => {
  const staffingPlan = createEmptyStaffingPlan();
  const plan = createEmptyTeachingPlan();
  plan.rows = [
    {
      ...createTeachingPlanRow("6.A", "M"),
      secondarySubjectCode: "CJ",
      weeklyPeriods: 2,
      organization: "ROTATION",
    },
  ];

  const enforced = applySchoolOperationalRules(plan, staffingPlan, null);
  assert.equal(enforced.rows[0]?.organization, "ROTATION");
});
