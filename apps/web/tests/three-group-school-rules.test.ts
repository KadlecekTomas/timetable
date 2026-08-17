import assert from "node:assert/strict";
import test from "node:test";

import type { LocalProject } from "../lib/local/api";
import { buildSchoolProjectForGeneration } from "../lib/local/school-project-generation";
import { createEmptyStaffingPlan } from "../lib/local/staffing-plan-school-v2";
import {
  SCHOOL_CLASS_CODES,
  createTeachingPlanClass,
  createTeachingPlanRow,
} from "../lib/local/teaching-plan-school";
import {
  applySchoolOperationalRules,
  createEmptyTeachingPlan,
} from "../lib/local/teaching-plan-school-v3";

function emptyProject(): LocalProject {
  return {
    schemaVersion: 1,
    id: "local-school-year",
    schoolName: "Test",
    label: "2026/2027",
    status: "ACTIVE",
    periodsPerDay: [8, 8, 8, 8, 7],
    version: 1,
    updatedAt: "test",
    teachers: [],
    classes: [],
    subjects: [],
    roomTypes: [],
    rooms: [],
    assignments: [],
    availability: [],
    fixedLessons: [],
    importBatches: [],
    generationRuns: [],
    timetableVersions: [],
  };
}

test("8.B informatics stays solo and does not require a second teacher", () => {
  const staffing = createEmptyStaffingPlan();
  staffing.teachers = [
    {
      id: "inf-one",
      firstName: "A",
      lastName: "Teacher",
      targetWeeklyLoad: 1,
      subjectLoads: [{ id: "inf", subjectCode: "INF", weeklyPeriods: 1 }],
      unavailableDays: [],
    },
  ];
  const plan = createEmptyTeachingPlan();
  plan.classes = SCHOOL_CLASS_CODES.map((code) =>
    createTeachingPlanClass(code),
  );
  const row = createTeachingPlanRow("8.B", "INF");
  row.weeklyPeriods = 1;
  row.organization = "SPLIT";
  row.primaryTeacherId = "inf-one";
  row.secondaryTeacherId = "";
  plan.rows = [row];

  const enforced = applySchoolOperationalRules(plan, staffing, null);
  assert.equal(enforced.rows[0]?.organization, "WHOLE");
  assert.equal(enforced.rows[0]?.primaryTeacherId, "inf-one");
  assert.equal(enforced.rows[0]?.secondaryTeacherId, "");
});

test("three-group English generates three synchronized solver assignments", () => {
  const staffing = createEmptyStaffingPlan();
  staffing.teachers = ["one", "two", "three"].map((id) => ({
    id,
    firstName: id,
    lastName: "Teacher",
    targetWeeklyLoad: 3,
    subjectLoads: [{ id: `${id}-aj`, subjectCode: "JAZ1", weeklyPeriods: 3 }],
    unavailableDays: [],
  }));
  const plan = createEmptyTeachingPlan();
  plan.classes = [createTeachingPlanClass("6.A")];
  const row = createTeachingPlanRow("6.A", "JAZ1");
  row.weeklyPeriods = 3;
  row.organization = "SPLIT";
  row.primaryTeacherId = "one";
  row.secondaryTeacherId = "two";
  row.tertiaryTeacherId = "three";
  row.splitGroupCount = 3;
  plan.rows = [row];

  const generated = buildSchoolProjectForGeneration({
    existingProject: emptyProject(),
    staffingPlan: staffing,
    teachingPlan: plan,
    forceReplaceGeneratedData: false,
  });
  assert.deepEqual(generated.blockers, []);
  assert.deepEqual(
    generated.project.assignments.map((item) => item.group).sort(),
    ["GROUP_1", "GROUP_2", "GROUP_3"],
  );
  assert.equal(
    new Set(generated.project.assignments.map((item) => item.parallelKey)).size,
    1,
  );
});
