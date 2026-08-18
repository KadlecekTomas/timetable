import assert from "node:assert/strict";
import test from "node:test";

import type { LocalProject } from "../lib/local/api";
import {
  BROWSER_PROJECT_LOCAL_STORAGE_KEYS,
  BROWSER_PROJECT_SESSION_STORAGE_KEYS,
  createBrowserProjectShareEnvelope,
  decodeBrowserProjectShare,
  encodeBrowserProjectShare,
  summarizeBrowserProjectShare,
  validateBrowserProjectShareEnvelope,
} from "../lib/local/project-share";

function project(): LocalProject {
  return {
    schemaVersion: 1,
    id: "local-school-year",
    schoolName: "Testovací škola",
    label: "2026/2027",
    status: "ACTIVE",
    periodsPerDay: [8, 8, 8, 8, 7],
    version: 4,
    updatedAt: "2026-08-05T00:00:00.000Z",
    inputFingerprint: "test",
    teachers: [
      {
        id: "teacher-1",
        code: "NOV",
        firstName: "Jana",
        lastName: "Nováková",
        targetWeeklyLoad: 22,
        minWeeklyLoad: null,
        maxWeeklyLoad: 22,
      },
    ],
    classes: [
      {
        id: "class-1",
        code: "6.A",
        grade: 6,
        name: "6.A",
        profile: "REGULAR",
      },
    ],
    subjects: [
      {
        id: "subject-1",
        code: "CJ",
        name: "Český jazyk",
        colorToken: null,
        defaultRoomTypeId: null,
      },
    ],
    roomTypes: [],
    rooms: [],
    assignments: [
      {
        id: "assignment-1",
        assignmentCode: "6A-CJ",
        classId: "class-1",
        additionalClassIds: [],
        subjectId: "subject-1",
        teacherId: "teacher-1",
        group: "WHOLE",
        weeklyPeriods: 5,
        lessonShape: "SINGLE",
        doublePeriodsCount: 0,
        requiredRoomId: null,
        requiredRoomTypeId: null,
        maxPerDay: null,
        minDayGap: null,
        parallelKey: null,
        rotationKey: null,
        rotationLeg: null,
        rotationPlacement: null,
      },
    ],
    availability: [],
    fixedLessons: [],
    importBatches: [],
    generationRuns: [],
    timetableVersions: [],
  };
}

const localStorageData = {
  "rozvrhar:staffing-plan:v1": JSON.stringify({
    version: 1,
    teachers: [{ id: "teacher-1" }],
  }),
  "rozvrhar:teaching-plan:v1": JSON.stringify({
    version: 1,
    classes: [{ code: "6.A" }],
    rows: [{ id: "row-1" }, { id: "row-2" }],
  }),
  "rozvrhar:staffing-allocation-draft:v1": null,
  "rozvrhar:school-curriculum:v1": null,
  "rozvrhar:teaching-plan-workload-credits:v1": null,
  "rozvrhar:pe-external-occupancy:v1": JSON.stringify({
    version: 1,
    updatedAt: "2026-08-05T00:00:00.000Z",
    slots: [{ dayOfWeek: 3, period: 2, occupiedSpaces: 2 }],
  }),
};

test("browser project share round-trips without a database", async () => {
  const envelope = await createBrowserProjectShareEnvelope(
    { localStorage: localStorageData, project: project() },
    "2026-08-05T00:00:00.000Z",
  );
  const payload = await encodeBrowserProjectShare(envelope, {
    compress: false,
  });
  const restored = await decodeBrowserProjectShare(payload);

  assert.equal(restored.checksum, envelope.checksum);
  assert.equal(restored.data.project.schoolName, "Testovací škola");
  assert.equal(
    restored.data.localStorage["rozvrhar:pe-external-occupancy:v1"],
    localStorageData["rozvrhar:pe-external-occupancy:v1"],
  );
  assert.deepEqual(summarizeBrowserProjectShare(restored), {
    teachers: 1,
    classes: 1,
    teachingRows: 2,
    solverTeachers: 1,
    solverClasses: 1,
    subjects: 1,
    assignments: 1,
    timetableVersions: 0,
  });
});

test("browser project share rejects changed data", async () => {
  const envelope = await createBrowserProjectShareEnvelope({
    localStorage: localStorageData,
    project: project(),
  });
  const changed = structuredClone(envelope);
  changed.data.project.schoolName = "Podvržená škola";

  await assert.rejects(
    validateBrowserProjectShareEnvelope(changed),
    /Kontrolní součet nesouhlasí/,
  );
});

test("browser project share rejects unsupported format", async () => {
  await assert.rejects(
    validateBrowserProjectShareEnvelope({
      format: "other",
      version: 1,
      exportedAt: "now",
      checksum: "x",
      data: {},
    }),
    /Formát sdíleného projektu není podporovaný/,
  );
});

test("browser project owns every persisted working-data key needed for full deletion", () => {
  assert.deepEqual(
    new Set(BROWSER_PROJECT_LOCAL_STORAGE_KEYS),
    new Set([
      "rozvrhar:staffing-plan:v1",
      "rozvrhar:teaching-plan:v1",
      "rozvrhar:staffing-allocation-draft:v1",
      "rozvrhar:school-curriculum:v1",
      "rozvrhar:teaching-plan-workload-credits:v1",
      "rozvrhar:teaching-plan-allocation-draft-applied:v1",
      "rozvrhar:teaching-plan-shared:v1",
      "rozvrhar:teaching-plan-split-periods:v1",
      "rozvrhar:pe-external-occupancy:v1",
    ]),
  );
  assert.deepEqual(BROWSER_PROJECT_SESSION_STORAGE_KEYS, [
    "rozvrhar:teaching-plan-import-review:v1",
  ]);
});
