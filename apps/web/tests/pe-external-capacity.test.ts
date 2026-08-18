import assert from "node:assert/strict";
import test from "node:test";

import type { LocalProject } from "../lib/local/api";
import {
  normalizePhysicalEducationExternalOccupancySlots,
  physicalEducationExternalAvailability,
} from "../lib/local/physical-education-external-occupancy";
import { buildSchoolProjectForGeneration } from "../lib/local/school-project-generation";
import type { StaffingPlan } from "../lib/local/staffing-plan";
import type { TeachingPlan } from "../lib/local/teaching-plan";

function emptyProject(): LocalProject {
  return {
    schemaVersion: 1,
    id: "local-school-year",
    schoolName: "Testovací škola",
    label: "2026/2027",
    status: "ACTIVE",
    periodsPerDay: [8, 8, 8, 8, 7],
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    inputFingerprint: null,
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

function generatedPeProject(): LocalProject {
  const staffingPlan: StaffingPlan = {
    version: 1,
    updatedAt: "test",
    teachers: [
      {
        id: "tv",
        firstName: "Tělocvik",
        lastName: "Testovací",
        targetWeeklyLoad: 2,
        subjectLoads: [
          { id: "tv-load", subjectCode: "TV", weeklyPeriods: 2 },
        ],
        unavailableDays: [],
      },
    ],
  };
  const teachingPlan: TeachingPlan = {
    version: 1,
    updatedAt: "test",
    classes: [
      { id: "class-plan", code: "7.A", grade: 7, profile: "REGULAR" },
    ],
    rows: [
      {
        id: "row-tv",
        classCode: "7.A",
        subjectCode: "TV",
        weeklyPeriods: 2,
        lessonShape: "DOUBLE",
        doublePeriodsCount: 1,
        organization: "WHOLE",
        primaryTeacherId: "tv",
        secondaryTeacherId: "",
      },
    ],
  };

  const result = buildSchoolProjectForGeneration({
    existingProject: emptyProject(),
    staffingPlan,
    teachingPlan,
    forceReplaceGeneratedData: false,
  });
  assert.deepEqual(result.blockers, []);
  return result.project;
}

test(
  "external first-grade occupancy reduces only currently available PE capacity",
  () => {
    const project = generatedPeProject();
    const rules = physicalEducationExternalAvailability(project, [
      { dayOfWeek: 3, period: 2, occupiedSpaces: 2 },
    ]);

    assert.equal(rules.length, 2);
    assert.equal(new Set(rules.map((rule) => rule.entityId)).size, 2);
    assert.ok(rules.every((rule) => rule.dayOfWeek === 3 && rule.period === 2));
    assert.ok(
      rules.every((rule) =>
        rule.reason?.startsWith("PE_EXTERNAL_CAPACITY:"),
      ),
    );
  },
);

test("external occupancy is capped by the real daily PE capacity", () => {
  const project = generatedPeProject();

  assert.equal(
    physicalEducationExternalAvailability(project, [
      { dayOfWeek: 1, period: 0, occupiedSpaces: 5 },
    ]).length,
    3,
    "Tuesday has only the two gyms and the hall room",
  );
  assert.equal(
    physicalEducationExternalAvailability(project, [
      { dayOfWeek: 3, period: 0, occupiedSpaces: 5 },
    ]).length,
    5,
    "Thursday also has both external halls",
  );
});

test("occupancy input rejects Monday and clamps impossible values", () => {
  assert.deepEqual(
    normalizePhysicalEducationExternalOccupancySlots([
      { dayOfWeek: 0, period: 1, occupiedSpaces: 2 },
      { dayOfWeek: 1, period: 1, occupiedSpaces: 9 },
      { dayOfWeek: 3, period: 1, occupiedSpaces: 9 },
    ]),
    [
      { dayOfWeek: 1, period: 1, occupiedSpaces: 3 },
      { dayOfWeek: 3, period: 1, occupiedSpaces: 5 },
    ],
  );
});
