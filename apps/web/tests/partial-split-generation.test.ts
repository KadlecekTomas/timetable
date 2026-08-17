import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCoverageOverview,
  coverageCellKey,
} from "../lib/domain/coverage-overview";
import type { LocalProject } from "../lib/local/api";
import { buildSchoolProjectForGeneration } from "../lib/local/school-project-generation";
import type { StaffingPlan, StaffingTeacher } from "../lib/local/staffing-plan";
import {
  applySchoolOperationalRules,
  createEmptyTeachingPlan,
  createTeachingPlanRow,
  rowTeacherPeriods,
} from "../lib/local/teaching-plan-school-v3";

function project(): LocalProject {
  return {
    schemaVersion: 1,
    id: "local-school-year",
    schoolName: "Testovací škola",
    label: "2026/2027",
    status: "ACTIVE",
    periodsPerDay: [8, 8, 8, 8, 7],
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
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

function teacher(
  id: string,
  subjectCode: string,
  weeklyPeriods: number,
): StaffingTeacher {
  return {
    id,
    firstName: `Učitel ${id}`,
    lastName: "Testovací",
    targetWeeklyLoad: weeklyPeriods,
    subjectLoads: [{ id: `${id}-${subjectCode}`, subjectCode, weeklyPeriods }],
    unavailableDays: [],
  };
}

test("CJ/M partial split keeps one teacher per subject and generates a two-leg swap", () => {
  const staffingPlan: StaffingPlan = {
    version: 1,
    updatedAt: "test",
    teachers: [teacher("cj-main", "CJ", 6), teacher("m-main", "M", 5)],
  };
  const teachingPlan = createEmptyTeachingPlan();
  teachingPlan.rows = [
    {
      ...createTeachingPlanRow("6.A", "CJ"),
      id: "6a-cj",
      weeklyPeriods: 5,
      organization: "WHOLE",
      primaryTeacherId: "cj-main",
    },
    {
      ...createTeachingPlanRow("6.A", "M"),
      id: "6a-m",
      weeklyPeriods: 4,
      organization: "WHOLE",
      primaryTeacherId: "m-main",
    },
  ];

  const enforced = applySchoolOperationalRules(
    teachingPlan,
    staffingPlan,
    null,
  );
  const czech = enforced.rows.find((row) => row.subjectCode === "CJ");
  const math = enforced.rows.find((row) => row.subjectCode === "M");
  assert.ok(czech);
  assert.ok(math);
  assert.equal(czech.organization, "SPLIT");
  assert.equal(czech.splitWeeklyPeriods, 1);
  assert.equal(czech.secondaryTeacherId, "cj-main");
  assert.equal(math.secondaryTeacherId, "m-main");
  assert.equal(rowTeacherPeriods(czech, "cj-main"), 6);
  assert.equal(rowTeacherPeriods(math, "m-main"), 5);

  const overview = buildCoverageOverview(enforced, staffingPlan);
  const czechCell = overview.cellByKey.get(coverageCellKey("6.A", "CJ"));
  const mathCell = overview.cellByKey.get(coverageCellKey("6.A", "M"));
  assert.equal(czechCell?.requiredClassPeriods, 5);
  assert.equal(czechCell?.requiredTeacherHours, 6);
  assert.equal(czechCell?.requiredSlots, 1);
  assert.equal(czechCell?.assignedTeacherHours, 6);
  assert.equal(czechCell?.rows[0]?.teacherId, "cj-main");
  assert.equal(mathCell?.requiredClassPeriods, 4);
  assert.equal(mathCell?.requiredTeacherHours, 5);
  assert.equal(mathCell?.requiredSlots, 1);

  const result = buildSchoolProjectForGeneration({
    existingProject: project(),
    staffingPlan,
    teachingPlan: enforced,
    forceReplaceGeneratedData: false,
  });
  assert.deepEqual(result.blockers, []);
  assert.equal(result.project.assignments.length, 6);
  assert.ok(
    result.project.assignments.every((assignment) =>
      assignment.assignmentCode.includes(
        assignment.subjectId.replace("subject:", ""),
      ),
    ),
  );
  const whole = result.project.assignments.filter(
    (assignment) => assignment.group === "WHOLE",
  );
  assert.deepEqual(
    whole
      .map((assignment) => [assignment.subjectId, assignment.weeklyPeriods])
      .sort(),
    [
      ["subject:CJ", 4],
      ["subject:M", 3],
    ],
  );
  const rotation = result.project.assignments.filter(
    (assignment) => assignment.rotationKey,
  );
  assert.equal(rotation.length, 4);
  assert.equal(
    new Set(rotation.map((assignment) => assignment.rotationKey)).size,
    1,
  );
  assert.deepEqual(
    rotation
      .map((assignment) => [
        assignment.rotationLeg,
        assignment.group,
        assignment.subjectId,
        assignment.teacherId,
      ])
      .sort(),
    [
      [1, "GROUP_1", "subject:CJ", "teacher:cj-main"],
      [1, "GROUP_2", "subject:M", "teacher:m-main"],
      [2, "GROUP_1", "subject:M", "teacher:m-main"],
      [2, "GROUP_2", "subject:CJ", "teacher:cj-main"],
    ],
  );
});

test("missing CJ teacher is one missing 6-hour role, not a fake second teacher", () => {
  const staffingPlan: StaffingPlan = {
    version: 1,
    updatedAt: "test",
    teachers: [teacher("m-main", "M", 5)],
  };
  const teachingPlan = createEmptyTeachingPlan();
  teachingPlan.rows = [
    {
      ...createTeachingPlanRow("6.A", "CJ"),
      weeklyPeriods: 5,
      primaryTeacherId: "",
    },
    {
      ...createTeachingPlanRow("6.A", "M"),
      weeklyPeriods: 4,
      primaryTeacherId: "m-main",
    },
  ];
  const enforced = applySchoolOperationalRules(
    teachingPlan,
    staffingPlan,
    null,
  );
  const overview = buildCoverageOverview(enforced, staffingPlan);
  const cell = overview.cellByKey.get(coverageCellKey("6.A", "CJ"));
  assert.equal(cell?.requiredClassPeriods, 5);
  assert.equal(cell?.requiredTeacherHours, 6);
  assert.equal(cell?.requiredSlots, 1);
  assert.equal(cell?.assignedTeacherHours, 0);
  assert.equal(cell?.missingTeacherHours, 6);
  assert.deepEqual(cell?.missingRoles, [
    "učitel celé třídy + obou dělených skupin",
  ]);
});
