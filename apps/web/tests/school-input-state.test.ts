import assert from "node:assert/strict";
import test from "node:test";

import type { LocalProject } from "../lib/local/api";
import {
  preparedInputState,
  schoolInputFingerprint,
} from "../lib/local/school-input-state";
import type { StaffingPlan } from "../lib/local/staffing-plan";
import type { TeachingPlan } from "../lib/local/teaching-plan";

const staffing: StaffingPlan = {
  version: 1,
  updatedAt: "2026-01-01",
  teachers: [
    {
      id: "teacher-one",
      firstName: "Testovací",
      lastName: "Učitel",
      targetWeeklyLoad: 4,
      unavailableDays: [],
      subjectLoads: [{ id: "load-one", subjectCode: "CJ", weeklyPeriods: 4 }],
    },
  ],
};

const teaching: TeachingPlan = {
  version: 1,
  updatedAt: "2026-01-01",
  classes: [{ id: "class-one", code: "7.A", grade: 7 }],
  rows: [
    {
      id: "row-one",
      classCode: "7.A",
      subjectCode: "CJ",
      weeklyPeriods: 4,
      lessonShape: "SEPARATE",
      doublePeriodsCount: 0,
      organization: "WHOLE",
      primaryTeacherId: "teacher-one",
      secondaryTeacherId: "",
    },
  ],
};

function project(inputFingerprint: string | null = null): LocalProject {
  return {
    schemaVersion: 1,
    id: "local-school-year",
    schoolName: "Testovací škola",
    label: "2026/2027",
    status: "ACTIVE",
    periodsPerDay: [8, 8, 8, 8, 7],
    version: 1,
    updatedAt: "2026-01-01",
    inputFingerprint,
    teachers: [
      {
        id: "teacher:one",
        code: "TES",
        firstName: "Testovací",
        lastName: "Učitel",
        targetWeeklyLoad: 4,
        minWeeklyLoad: null,
        maxWeeklyLoad: 4,
      },
    ],
    classes: [
      {
        id: "class:one",
        code: "7.A",
        grade: 7,
        name: "7.A",
        profile: "REGULAR",
      },
    ],
    subjects: [
      {
        id: "subject:cj",
        code: "CJ",
        name: "Český jazyk",
        colorToken: null,
        defaultRoomTypeId: null,
      },
    ],
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

test("prepared input distinguishes EMPTY, legacy STALE and CURRENT", () => {
  const emptyProject = {
    ...project(),
    teachers: [],
    classes: [],
    subjects: [],
  };
  assert.equal(
    preparedInputState(
      emptyProject,
      { ...staffing, teachers: [] },
      { ...teaching, classes: [], rows: [] },
    ),
    "EMPTY",
  );
  assert.equal(preparedInputState(project(), staffing, teaching), "STALE");
  assert.equal(
    preparedInputState(
      project(schoolInputFingerprint(staffing, teaching)),
      staffing,
      teaching,
    ),
    "CURRENT",
  );
});

test("fingerprint changes with teacher or teaching row but ignores updatedAt", () => {
  const original = schoolInputFingerprint(staffing, teaching);
  assert.notEqual(
    original,
    schoolInputFingerprint(
      {
        ...staffing,
        teachers: staffing.teachers.map((teacher) => ({
          ...teacher,
          targetWeeklyLoad: 5,
        })),
      },
      teaching,
    ),
  );
  assert.notEqual(
    original,
    schoolInputFingerprint(staffing, {
      ...teaching,
      rows: teaching.rows.map((row) => ({ ...row, weeklyPeriods: 5 })),
    }),
  );
  assert.equal(
    original,
    schoolInputFingerprint(
      { ...staffing, updatedAt: "later" },
      { ...teaching, updatedAt: "later" },
    ),
  );
});
