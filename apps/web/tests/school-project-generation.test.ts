import assert from "node:assert/strict";
import test from "node:test";

import type { LocalProject } from "../lib/local/api";
import { buildSchoolProjectForGeneration } from "../lib/local/school-project-generation";
import type { StaffingPlan, StaffingTeacher } from "../lib/local/staffing-plan";
import type { TeachingPlan, TeachingPlanRow } from "../lib/local/teaching-plan";

function project(): LocalProject {
  return {
    schemaVersion: 1,
    id: "local-school-year",
    schoolName: "Testovací škola",
    label: "2026/2027",
    status: "ACTIVE",
    periodsPerDay: [8, 8, 8, 8, 7],
    version: 3,
    updatedAt: "2026-01-01T00:00:00.000Z",
    teachers: [],
    classes: [],
    subjects: [],
    roomTypes: [{ id: "type:gym", code: "GYM", name: "Tělocvična" }],
    rooms: [
      {
        id: "room:gym",
        code: "T1",
        name: "Tělocvična",
        capacity: null,
        roomTypeId: "type:gym",
      },
    ],
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
  target = 22,
  nonTeaching = 0,
): StaffingTeacher {
  return {
    id,
    firstName: `Učitel ${id}`,
    lastName: "Testovací",
    targetWeeklyLoad: target,
    subjectLoads: [
      { id: `${id}-subject`, subjectCode, weeklyPeriods: target - nonTeaching },
      ...(nonTeaching
        ? [
            {
              id: `${id}-other`,
              subjectCode: "NEVYUKA",
              weeklyPeriods: nonTeaching,
            },
          ]
        : []),
    ],
    unavailableDays: id === "cj" ? ["MON"] : [],
  };
}

function row(overrides: Partial<TeachingPlanRow> = {}): TeachingPlanRow {
  return {
    id: "row-cj",
    classCode: "7.A",
    subjectCode: "CJ",
    weeklyPeriods: 4,
    lessonShape: "SEPARATE",
    doublePeriodsCount: 0,
    organization: "WHOLE",
    primaryTeacherId: "cj",
    secondaryTeacherId: "",
    ...overrides,
  };
}

function plans(rows: TeachingPlanRow[], teachers: StaffingTeacher[]) {
  const staffingPlan: StaffingPlan = {
    version: 1,
    updatedAt: "test",
    teachers,
  };
  const teachingPlan: TeachingPlan = {
    version: 1,
    updatedAt: "test",
    classes: [{ id: "class-plan", code: "7.A", grade: 7, profile: "REGULAR" }],
    rows,
  };
  return { staffingPlan, teachingPlan };
}

test("atomic generation build uses contractual teaching capacity and preserves rooms", () => {
  const existingProject = project();
  const input = plans([row()], [teacher("cj", "CJ", 22, 5)]);
  const result = buildSchoolProjectForGeneration({
    existingProject,
    ...input,
    forceReplaceGeneratedData: false,
  });

  assert.deepEqual(result.blockers, []);
  assert.equal(result.project.teachers[0]?.targetWeeklyLoad, 17);
  assert.equal(result.project.teachers[0]?.maxWeeklyLoad, 17);
  assert.equal(result.project.teachers[0]?.minWeeklyLoad, null);
  assert.equal(result.project.rooms[0]?.id, "room:gym");
  assert.equal(result.project.assignments.length, 1);
  assert.equal(result.project.availability.length, 8);
  assert.equal(
    result.project.subjects.some((subject) => subject.code === "NEVYUKA"),
    false,
  );
});

test("part-time target 18 blocks a transformed 19-hour plan", () => {
  const input = plans([row({ weeklyPeriods: 19 })], [teacher("cj", "CJ", 18)]);
  const result = buildSchoolProjectForGeneration({
    existingProject: project(),
    ...input,
    forceReplaceGeneratedData: false,
  });

  assert.ok(
    result.blockers.some(
      (message) =>
        message.includes("kapacitu 18") && message.includes("19 hodin"),
    ),
  );
  assert.deepEqual(
    result.project,
    project(),
    "a blocked pure conversion leaves the original project unchanged",
  );
});

test("split produces two assignments and rotation produces four with two legs", () => {
  const rows = [
    row({ organization: "SPLIT", secondaryTeacherId: "m" }),
    row({
      id: "row-rotation",
      organization: "ROTATION",
      subjectCode: "CJ",
      secondarySubjectCode: "M",
      primaryTeacherId: "cj",
      secondaryTeacherId: "m",
      rotationPlacement: "ADJACENT",
    }),
  ];
  const input = plans(rows, [teacher("cj", "CJ"), teacher("m", "M")]);
  const result = buildSchoolProjectForGeneration({
    existingProject: project(),
    ...input,
    forceReplaceGeneratedData: false,
  });

  assert.deepEqual(result.blockers, []);
  assert.equal(result.project.assignments.length, 6);
  const rotation = result.project.assignments.filter(
    (assignment) => assignment.rotationKey,
  );
  assert.equal(rotation.length, 4);
  assert.deepEqual(
    new Set(rotation.map((assignment) => assignment.rotationLeg)),
    new Set([1, 2]),
  );
  assert.equal(
    new Set(rotation.map((assignment) => assignment.parallelKey)).size,
    2,
  );
});

test("a four-hour rotation counts eight hours per teacher and rejects overload", () => {
  const rotation = row({
    organization: "ROTATION",
    secondarySubjectCode: "M",
    secondaryTeacherId: "m",
  });
  const input = plans(
    [rotation],
    [teacher("cj", "CJ", 7), teacher("m", "M", 8)],
  );
  const result = buildSchoolProjectForGeneration({
    existingProject: project(),
    ...input,
    forceReplaceGeneratedData: false,
  });

  assert.ok(
    result.blockers.some(
      (message) =>
        message.includes("kapacitu 7") && message.includes("8 hodin"),
    ),
  );
  assert.equal(
    result.blockers.some(
      (message) => message.includes("Učitel m") && message.includes("kapacitu"),
    ),
    false,
  );
});

test("existing generated data requires explicit replacement confirmation", () => {
  const existingProject = project();
  existingProject.generationRuns.push({
    id: "run:1",
    status: "FEASIBLE",
    inputSnapshotHash: "hash",
    qualityScore: null,
    objectiveValue: null,
    explanation: null,
    candidateVersionId: null,
    createdAt: "test",
    startedAt: null,
    finishedAt: null,
  });
  const input = plans([row()], [teacher("cj", "CJ")]);
  const blocked = buildSchoolProjectForGeneration({
    existingProject,
    ...input,
    forceReplaceGeneratedData: false,
  });
  assert.ok(
    blocked.blockers.some((message) => message.includes("obsahuje návrhy")),
  );
  assert.equal(blocked.project.generationRuns.length, 1);

  const forced = buildSchoolProjectForGeneration({
    existingProject,
    ...input,
    forceReplaceGeneratedData: true,
  });
  assert.deepEqual(forced.blockers, []);
  assert.equal(forced.project.generationRuns.length, 0);
});

test("shared split language creates two assignments for all participating classes", () => {
  const staffingPlan: StaffingPlan = {
    version: 1,
    updatedAt: "test",
    teachers: [
      teacher("language-one", "JAZ2", 3),
      teacher("language-two", "JAZ2", 3),
    ],
  };
  const teachingPlan: TeachingPlan = {
    version: 1,
    updatedAt: "test",
    classes: [
      { id: "8a", code: "8.A", grade: 8, profile: "REGULAR" },
      { id: "8b", code: "8.B", grade: 8, profile: "SPORTS" },
      { id: "8c", code: "8.C", grade: 8, profile: "REGULAR" },
    ],
    rows: [
      row({
        id: "shared-language",
        classCode: "8.A",
        additionalClassCodes: ["8.B", "8.C"],
        subjectCode: "JAZ2",
        weeklyPeriods: 3,
        organization: "SPLIT",
        primaryTeacherId: "language-one",
        secondaryTeacherId: "language-two",
      }),
    ],
  };

  const result = buildSchoolProjectForGeneration({
    existingProject: project(),
    staffingPlan,
    teachingPlan,
    forceReplaceGeneratedData: false,
  });

  assert.deepEqual(result.blockers, []);
  assert.equal(result.project.assignments.length, 2);
  for (const assignment of result.project.assignments) {
    assert.equal(assignment.classId, "class:8-A");
    assert.deepEqual(assignment.additionalClassIds, ["class:8-B", "class:8-C"]);
    assert.equal(assignment.weeklyPeriods, 3);
  }
});
