import assert from "node:assert/strict";
import test from "node:test";

import type { LocalAssignment, LocalSubject } from "../lib/local/api";
import { schoolSchedulingPreferences } from "../lib/local/school-scheduling-preferences";
import type { StaffingPlan } from "../lib/local/staffing-plan";

const subjects: LocalSubject[] = [
  {
    id: "subject:JAZ2",
    code: "JAZ2",
    name: "Druhý cizí jazyk",
    colorToken: null,
    defaultRoomTypeId: null,
  },
  {
    id: "subject:INF",
    code: "INF",
    name: "Informatika",
    colorToken: null,
    defaultRoomTypeId: null,
  },
];

const staffingPlan: StaffingPlan = {
  version: 1,
  updatedAt: "test",
  teachers: [
    {
      id: "spankova",
      firstName: "",
      lastName: "Špánková",
      targetWeeklyLoad: 12,
      baseWeeklyLoad: 12,
      subjectLoads: [
        { id: "spankova-jaz2", subjectCode: "JAZ2", weeklyPeriods: 12 },
      ],
      unavailableDays: ["MON", "FRI"],
      unavailablePeriods: [],
    },
    {
      id: "kadlecek",
      firstName: "Tomáš",
      lastName: "Kadleček",
      targetWeeklyLoad: 13,
      baseWeeklyLoad: 13,
      subjectLoads: [
        { id: "kadlecek-inf", subjectCode: "INF", weeklyPeriods: 13 },
      ],
      unavailableDays: ["FRI"],
      unavailablePeriods: [],
    },
  ],
};

function assignment({
  id,
  classCode,
  subjectCode,
  teacherId,
  weeklyPeriods,
}: {
  id: string;
  classCode: string;
  subjectCode: "JAZ2" | "INF";
  teacherId: string;
  weeklyPeriods: number;
}): LocalAssignment {
  return {
    id,
    assignmentCode: id,
    classId: `class:${classCode.replace(".", "-")}`,
    additionalClassIds: [],
    subjectId: `subject:${subjectCode}`,
    teacherId: `teacher:${teacherId}`,
    group: "WHOLE",
    weeklyPeriods,
    lessonShape: "SINGLE",
    doublePeriodsCount: 0,
    requiredRoomId: null,
    requiredRoomTypeId: null,
    maxPerDay: null,
    minDayGap: null,
    parallelKey: null,
    roomShareKey: null,
    rotationKey: null,
    rotationLeg: null,
    rotationPlacement: null,
  };
}

const spanishAssignments = ["8.A", "8.B", "8.C", "9.B"].map((classCode) =>
  assignment({
    id: `spanish-${classCode}`,
    classCode,
    subjectCode: "JAZ2",
    teacherId: "spankova",
    weeklyPeriods: 3,
  }),
);

const kadlecekClasses = [
  "6.A",
  "6.B",
  "6.C",
  "6.D",
  "7.A",
  "7.B",
  "7.C",
  "8.A",
  "8.B",
  "8.C",
  "9.A",
  "9.B",
  "9.C",
];

const infAssignments = kadlecekClasses.map((classCode) =>
  assignment({
    id: `inf-${classCode}`,
    classCode,
    subjectCode: "INF",
    teacherId: "kadlecek",
    weeklyPeriods: 1,
  }),
);

const assignments = [...spanishAssignments, ...infAssignments];

function fixedForTeacher(
  result: ReturnType<typeof schoolSchedulingPreferences>,
  prefix: string,
) {
  return result.fixedLessons
    .filter((lesson) => lesson.assignmentId.startsWith(prefix))
    .map((lesson) => [
      lesson.assignmentId,
      lesson.blockIndex,
      lesson.dayOfWeek,
      lesson.startPeriod,
    ]);
}

test("V8 preset fixes the exact Špánková sequence and accepted Kadleček INF pattern", () => {
  const result = schoolSchedulingPreferences({
    assignments: structuredClone(assignments),
    subjects,
    staffingPlan,
    existingFixedLessons: [],
  });

  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.availability, []);
  assert.equal(result.fixedLessons.length, 25);
  assert.equal(
    result.fixedLessons.every((lesson) => lesson.locked),
    true,
  );

  assert.deepEqual(fixedForTeacher(result, "spanish-"), [
    ["spanish-8.B", 0, 1, 1],
    ["spanish-8.C", 0, 1, 2],
    ["spanish-8.A", 0, 1, 3],
    ["spanish-9.B", 0, 1, 4],
    ["spanish-8.B", 1, 2, 1],
    ["spanish-8.A", 1, 2, 2],
    ["spanish-8.C", 1, 2, 3],
    ["spanish-9.B", 1, 2, 4],
    ["spanish-8.B", 2, 3, 1],
    ["spanish-8.C", 2, 3, 2],
    ["spanish-8.A", 2, 3, 3],
    ["spanish-9.B", 2, 3, 4],
  ]);

  assert.deepEqual(fixedForTeacher(result, "inf-"), [
    ["inf-8.C", 0, 1, 0],
    ["inf-7.C", 0, 1, 1],
    ["inf-9.A", 0, 1, 2],
    ["inf-6.B", 0, 1, 3],
    ["inf-7.B", 0, 1, 4],
    ["inf-9.C", 0, 1, 5],
    ["inf-9.B", 0, 2, 0],
    ["inf-7.A", 0, 2, 1],
    ["inf-6.C", 0, 2, 2],
    ["inf-6.A", 0, 2, 3],
    ["inf-8.A", 0, 2, 4],
    ["inf-6.D", 0, 2, 5],
    ["inf-8.B", 0, 3, 0],
  ]);
});

test("existing manual fixed lesson wins for that block while remaining V8 defaults are retained", () => {
  const result = schoolSchedulingPreferences({
    assignments: structuredClone(assignments),
    subjects,
    staffingPlan,
    existingFixedLessons: [
      {
        id: "manual",
        assignmentId: "spanish-8.B",
        blockIndex: 1,
        dayOfWeek: 4,
        startPeriod: 3,
        duration: 1,
        roomId: null,
        locked: true,
      },
    ],
  });

  assert.deepEqual(result.warnings, []);
  assert.equal(result.fixedLessons.length, 24);
  assert.deepEqual(
    result.fixedLessons
      .filter((lesson) => lesson.assignmentId === "spanish-8.B")
      .map((lesson) => lesson.blockIndex),
    [0, 2],
  );
  assert.equal(
    result.fixedLessons.some(
      (lesson) =>
        lesson.assignmentId === "spanish-8.B" && lesson.blockIndex === 1,
    ),
    false,
  );
});
