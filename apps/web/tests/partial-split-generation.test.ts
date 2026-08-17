import assert from "node:assert/strict";
import test from "node:test";

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
    subjectLoads: [
      {
        id: `${id}-${subjectCode}`,
        subjectCode,
        weeklyPeriods,
      },
    ],
    unavailableDays: [],
  };
}

test("five-hour Czech creates four whole periods plus exactly one parallel split period", () => {
  const staffingPlan: StaffingPlan = {
    version: 1,
    updatedAt: "test",
    teachers: [teacher("cj-main", "CJ", 5), teacher("cj-split", "CJ", 1)],
  };
  const teachingPlan = createEmptyTeachingPlan();
  teachingPlan.rows = [
    {
      ...createTeachingPlanRow("6.A", "CJ"),
      weeklyPeriods: 5,
      organization: "WHOLE",
      primaryTeacherId: "cj-main",
      secondaryTeacherId: "cj-split",
    },
  ];

  const enforced = applySchoolOperationalRules(teachingPlan, staffingPlan, null);
  const row = enforced.rows[0];
  assert.equal(row?.organization, "SPLIT");
  assert.equal(row?.splitWeeklyPeriods, 1);
  assert.ok(row);
  if (!row) throw new Error("Czech row must exist.");
  assert.equal(rowTeacherPeriods(row, "cj-main"), 5);
  assert.equal(rowTeacherPeriods(row, "cj-split"), 1);

  const result = buildSchoolProjectForGeneration({
    existingProject: project(),
    staffingPlan,
    teachingPlan: enforced,
    forceReplaceGeneratedData: false,
  });

  assert.deepEqual(result.blockers, []);
  assert.equal(result.project.assignments.length, 3);

  const whole = result.project.assignments.find(
    (assignment) => assignment.group === "WHOLE",
  );
  assert.ok(whole);
  assert.equal(whole?.weeklyPeriods, 4);
  assert.equal(whole?.teacherId, "teacher:cj-main");
  assert.equal(whole?.lessonShape, "SINGLE");

  const split = result.project.assignments.filter(
    (assignment) => assignment.group !== "WHOLE",
  );
  assert.equal(split.length, 2);
  assert.deepEqual(
    split.map((assignment) => assignment.weeklyPeriods).sort(),
    [1, 1],
  );
  assert.equal(split[0]?.parallelKey, split[1]?.parallelKey);
  assert.ok(split[0]?.parallelKey);
  assert.deepEqual(
    new Set(split.map((assignment) => assignment.teacherId)),
    new Set(["teacher:cj-main", "teacher:cj-split"]),
  );
});
