import assert from "node:assert/strict";
import test from "node:test";

import type { LocalProject } from "../lib/local/api";
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

test("generic TV uses school sport facilities, never Monday, and hall is Thursday-only", () => {
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
          {
            id: "tv-load",
            subjectCode: "TV",
            weeklyPeriods: 2,
          },
        ],
        unavailableDays: [],
      },
    ],
  };
  const teachingPlan: TeachingPlan = {
    version: 1,
    updatedAt: "test",
    classes: [{ id: "class-plan", code: "7.A", grade: 7, profile: "REGULAR" }],
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

  const sportRoomType = result.project.roomTypes.find(
    (roomType) => roomType.id === "room-type:TV",
  );
  assert.equal(sportRoomType?.name, "Sportovní prostor");

  assert.deepEqual(
    result.project.rooms
      .filter((room) => room.roomTypeId === "room-type:TV")
      .map((room) => room.name)
      .sort((left, right) => left.localeCompare(right, "cs-CZ")),
    ["Hala 1", "Hala 2", "Sál", "Tělocvična 1", "Tělocvična 2"].sort(
      (left, right) => left.localeCompare(right, "cs-CZ"),
    ),
  );

  const assignment = result.project.assignments[0];
  assert.equal(assignment?.requiredRoomTypeId, "room-type:TV");
  assert.equal(
    result.project.subjects.find((subject) => subject.code === "TV")
      ?.defaultRoomTypeId,
    "room-type:TV",
  );

  const unavailableDays = (roomId: string) =>
    [
      ...new Set(
        result.project.availability
          .filter(
            (rule) =>
              rule.entityType === "ROOM" &&
              rule.entityId === roomId &&
              rule.kind === "UNAVAILABLE",
          )
          .map((rule) => rule.dayOfWeek),
      ),
    ].sort((left, right) => left - right);

  assert.deepEqual(unavailableDays("room:TV1"), [0]);
  assert.deepEqual(unavailableDays("room:TV2"), [0]);
  assert.deepEqual(unavailableDays("room:SAL"), [0]);
  assert.deepEqual(unavailableDays("room:HALA1"), [0, 1, 2, 4]);
  assert.deepEqual(unavailableDays("room:HALA2"), [0, 1, 2, 4]);

  for (const roomId of [
    "room:TV1",
    "room:TV2",
    "room:SAL",
    "room:HALA1",
    "room:HALA2",
  ]) {
    assert.equal(
      result.project.availability.filter(
        (rule) =>
          rule.entityType === "ROOM" &&
          rule.entityId === roomId &&
          rule.dayOfWeek === 0,
      ).length,
      8,
      `${roomId} must be unavailable for every Monday period`,
    );
  }

  assert.equal(
    result.project.availability.some(
      (rule) =>
        rule.entityType === "ROOM" &&
        ["room:HALA1", "room:HALA2"].includes(rule.entityId) &&
        rule.dayOfWeek === 3,
    ),
    false,
    "both hall capacity slots must be fully available on Thursday",
  );
});
