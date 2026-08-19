import assert from "node:assert/strict";
import test from "node:test";

import { schoolSchedulingPreferences } from "../lib/local/school-scheduling-preferences";
import type { LocalAssignment, LocalSubject } from "../lib/local/api";
import type { StaffingPlan } from "../lib/local/staffing-plan";

const subjects: LocalSubject[] = [
  {
    id: "subject:JAZ2",
    code: "JAZ2",
    name: "Druhý cizí jazyk",
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
  ],
};

function assignment(id: string, classId: string): LocalAssignment {
  return {
    id,
    assignmentCode: id,
    classId,
    additionalClassIds: [],
    subjectId: "subject:JAZ2",
    teacherId: "teacher:spankova",
    group: "GROUP_2",
    weeklyPeriods: 3,
    lessonShape: "SINGLE",
    doublePeriodsCount: 0,
    requiredRoomId: null,
    requiredRoomTypeId: null,
    maxPerDay: null,
    minDayGap: null,
    parallelKey: `parallel:${id}`,
    rotationKey: null,
    rotationLeg: null,
    rotationPlacement: null,
  };
}

const assignments = [
  assignment("spanish-8a", "class:8-A"),
  assignment("spanish-8b", "class:8-B"),
  assignment("spanish-8c", "class:8-C"),
  assignment("german-9b", "class:9-B"),
];

test("Špánková gets nine fixed Spanish lessons Tue-Wed-Thu periods 2-4 and German period 5 preference", () => {
  const result = schoolSchedulingPreferences({
    assignments,
    subjects,
    staffingPlan,
    existingFixedLessons: [],
  });

  assert.deepEqual(result.warnings, []);
  assert.equal(result.fixedLessons.length, 9);
  assert.deepEqual(
    result.fixedLessons.map((lesson) => [
      lesson.assignmentId,
      lesson.blockIndex,
      lesson.dayOfWeek,
      lesson.startPeriod,
    ]),
    [
      ["spanish-8a", 0, 1, 1],
      ["spanish-8b", 0, 1, 2],
      ["spanish-8c", 0, 1, 3],
      ["spanish-8b", 1, 2, 1],
      ["spanish-8c", 1, 2, 2],
      ["spanish-8a", 1, 2, 3],
      ["spanish-8c", 2, 3, 1],
      ["spanish-8a", 2, 3, 2],
      ["spanish-8b", 2, 3, 3],
    ],
  );
  assert.equal(result.fixedLessons.every((lesson) => lesson.locked), true);
  assert.deepEqual(
    result.availability.map((rule) => [
      rule.dayOfWeek,
      rule.period,
      rule.weight,
    ]),
    [
      [1, 4, 200],
      [2, 4, 200],
      [3, 4, 200],
    ],
  );
});

test("existing manual fixed lesson wins over the school default for the same Spanish block", () => {
  const result = schoolSchedulingPreferences({
    assignments,
    subjects,
    staffingPlan,
    existingFixedLessons: [
      {
        id: "manual",
        assignmentId: "spanish-8b",
        blockIndex: 1,
        dayOfWeek: 2,
        startPeriod: 5,
        duration: 1,
        roomId: null,
        locked: true,
      },
    ],
  });

  assert.equal(result.fixedLessons.length, 8);
  assert.equal(
    result.fixedLessons.some(
      (lesson) =>
        lesson.assignmentId === "spanish-8b" && lesson.blockIndex === 1,
    ),
    false,
  );
});
