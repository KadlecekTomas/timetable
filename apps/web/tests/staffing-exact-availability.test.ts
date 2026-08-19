import assert from "node:assert/strict";
import test from "node:test";

import type { LocalProject } from "../lib/local/api";
import { staffingExactUnavailableAvailability } from "../lib/local/staffing-exact-availability";
import type { StaffingPlan } from "../lib/local/staffing-plan";

function project(): LocalProject {
  return {
    schemaVersion: 1,
    id: "local-school-year",
    schoolName: "Testovací škola",
    label: "2026/2027",
    status: "ACTIVE",
    periodsPerDay: [8, 8, 8, 8, 7],
    version: 1,
    updatedAt: "test",
    teachers: [
      {
        id: "teacher:hankova",
        code: "HAN",
        firstName: "Eva",
        lastName: "Hanková",
        targetWeeklyLoad: 1,
        minWeeklyLoad: null,
        maxWeeklyLoad: 1,
      },
    ],
    classes: [],
    subjects: [],
    roomTypes: [],
    rooms: [],
    assignments: [],
    availability: [
      {
        id: "availability:hankova:MON:1",
        entityType: "TEACHER",
        entityId: "teacher:hankova",
        dayOfWeek: 0,
        period: 1,
        kind: "UNAVAILABLE",
        weight: null,
        reason: "Celodenní nedostupnost z personálního plánu",
      },
    ],
    fixedLessons: [],
    importBatches: [],
    generationRuns: [],
    timetableVersions: [],
  };
}

const plan: StaffingPlan = {
  version: 1,
  updatedAt: "test",
  teachers: [
    {
      id: "hankova",
      firstName: "Eva",
      lastName: "Hanková",
      targetWeeklyLoad: 1,
      baseWeeklyLoad: 1,
      subjectLoads: [
        { id: "hankova:subject", subjectCode: "CJ", weeklyPeriods: 1 },
      ],
      unavailableDays: [],
      unavailablePeriods: [
        { day: "MON", period: 1 },
        { day: "MON", period: 2 },
        { day: "FRI", period: 4 },
        { day: "FRI", period: 7 },
      ],
    },
  ],
};

test("exact staffing blocks become hard teacher-unavailable solver slots", () => {
  const availability = staffingExactUnavailableAvailability(project(), plan);

  assert.deepEqual(
    availability.map((item) => [item.dayOfWeek, item.period]),
    [
      [0, 2],
      [4, 4],
    ],
    "duplicate whole-day slots and periods outside the real school day are ignored",
  );
  assert.ok(
    availability.every(
      (item) =>
        item.entityType === "TEACHER" &&
        item.entityId === "teacher:hankova" &&
        item.kind === "UNAVAILABLE",
    ),
  );
});
