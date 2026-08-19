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

function assignment(
  id: string,
  classId: string,
  additionalClassIds: string[] = [],
): LocalAssignment {
  return {
    id,
    assignmentCode: id,
    classId,
    additionalClassIds,
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
  assignment("spanish-8", "class:8-A", ["class:8-B", "class:8-C"]),
  assignment("german-9", "class:9-A", ["class:9-B", "class:9-C"]),
];

test("shared Špánková Spanish is fixed Tue-Wed-Thu second period and German follow-up is preferred", () => {
  const result = schoolSchedulingPreferences({
    assignments,
    subjects,
    staffingPlan,
    existingFixedLessons: [],
  });

  assert.deepEqual(result.warnings, []);
  assert.deepEqual(
    result.fixedLessons.map((lesson) => [
      lesson.assignmentId,
      lesson.blockIndex,
      lesson.dayOfWeek,
      lesson.startPeriod,
    ]),
    [
      ["spanish-8", 0, 1, 1],
      ["spanish-8", 1, 2, 1],
      ["spanish-8", 2, 3, 1],
    ],
  );
  assert.equal(
    result.fixedLessons.every((lesson) => lesson.locked),
    true,
  );
  assert.deepEqual(
    result.availability.map((rule) => [
      rule.dayOfWeek,
      rule.period,
      rule.weight,
    ]),
    [
      [1, 2, 100],
      [1, 3, 60],
      [1, 4, 30],
      [2, 2, 100],
      [2, 3, 60],
      [2, 4, 30],
      [3, 2, 100],
      [3, 3, 60],
      [3, 4, 30],
    ],
  );
});

test("existing manual fixed lesson wins over the shared Spanish school default", () => {
  const result = schoolSchedulingPreferences({
    assignments,
    subjects,
    staffingPlan,
    existingFixedLessons: [
      {
        id: "manual",
        assignmentId: "spanish-8",
        blockIndex: 1,
        dayOfWeek: 4,
        startPeriod: 3,
        duration: 1,
        roomId: null,
        locked: true,
      },
    ],
  });

  assert.deepEqual(
    result.fixedLessons.map((lesson) => lesson.blockIndex),
    [0, 2],
  );
});
