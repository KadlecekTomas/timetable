import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalSnapshot,
  RotationPlacement,
  ScheduledLesson,
} from "../lib/domain/contracts";
import { validateMove, validateSchedule } from "../lib/domain/validation";

function snapshot(placement: RotationPlacement): CanonicalSnapshot {
  const common = {
    class_id: "class-6b",
    weekly_periods: 1,
    lesson_shape: "SINGLE" as const,
    double_periods_count: 0,
    rotation_key: "rotation-6b-cj-m",
    rotation_placement: placement,
  };
  return {
    contract_version: "1.0",
    school_year: { id: "school", label: "2026/2027", version: 1 },
    periods_per_day: [8, 8],
    teachers: [
      {
        id: "teacher-cj",
        code: "CJ",
        first_name: "Český",
        last_name: "Učitel",
        target_weekly_load: 2,
      },
      {
        id: "teacher-m",
        code: "M",
        first_name: "Matematický",
        last_name: "Učitel",
        target_weekly_load: 2,
      },
    ],
    classes: [
      {
        id: "class-6b",
        code: "6.B",
        name: "6.B",
        grade: 6,
        profile: "SPORTS",
      },
    ],
    subjects: [
      { id: "subject-cj", code: "CJ", name: "Český jazyk" },
      { id: "subject-m", code: "M", name: "Matematika" },
    ],
    rooms: [],
    assignments: [
      {
        ...common,
        id: "rotation-l1-g1",
        teacher_id: "teacher-cj",
        subject_id: "subject-cj",
        group: "GROUP_1",
        parallel_key: "rotation-l1",
        rotation_leg: 1,
      },
      {
        ...common,
        id: "rotation-l1-g2",
        teacher_id: "teacher-m",
        subject_id: "subject-m",
        group: "GROUP_2",
        parallel_key: "rotation-l1",
        rotation_leg: 1,
      },
      {
        ...common,
        id: "rotation-l2-g1",
        teacher_id: "teacher-m",
        subject_id: "subject-m",
        group: "GROUP_1",
        parallel_key: "rotation-l2",
        rotation_leg: 2,
      },
      {
        ...common,
        id: "rotation-l2-g2",
        teacher_id: "teacher-cj",
        subject_id: "subject-cj",
        group: "GROUP_2",
        parallel_key: "rotation-l2",
        rotation_leg: 2,
      },
    ],
    availability: [],
    fixed_lessons: [],
    locked_lessons: [],
    weights: {
      teacher_gap: 20,
      class_gap: 25,
      discouraged_slot: 8,
      preferred_slot_bonus: 3,
      same_day_concentration: 6,
      late_period: 1,
      rotation_spread: 75,
    },
    random_seed: 1,
    time_limit_seconds: 30,
  };
}

function lesson(
  assignmentId: string,
  teacherId: string,
  subjectId: string,
  group: "GROUP_1" | "GROUP_2",
  day: number,
  period: number,
): ScheduledLesson {
  return {
    id: `lesson-${assignmentId}`,
    block_id: `${assignmentId}:0`,
    assignment_id: assignmentId,
    teacher_id: teacherId,
    class_id: "class-6b",
    subject_id: subjectId,
    group,
    room_id: null,
    day,
    period,
    duration: 1,
    locked: false,
    origin: "SOLVER",
  };
}

function schedule(
  leg1: [number, number],
  leg2: [number, number],
): ScheduledLesson[] {
  return [
    lesson(
      "rotation-l1-g1",
      "teacher-cj",
      "subject-cj",
      "GROUP_1",
      leg1[0],
      leg1[1],
    ),
    lesson(
      "rotation-l1-g2",
      "teacher-m",
      "subject-m",
      "GROUP_2",
      leg1[0],
      leg1[1],
    ),
    lesson(
      "rotation-l2-g1",
      "teacher-m",
      "subject-m",
      "GROUP_1",
      leg2[0],
      leg2[1],
    ),
    lesson(
      "rotation-l2-g2",
      "teacher-cj",
      "subject-cj",
      "GROUP_2",
      leg2[0],
      leg2[1],
    ),
  ];
}

test("adjacent exchange is valid in either chronological leg order", () => {
  assert.deepEqual(
    validateSchedule(snapshot("ADJACENT"), schedule([0, 2], [0, 1])),
    [],
  );
});

test("manual move cannot detach one half or one leg of an adjacent exchange", () => {
  const source = snapshot("ADJACENT");
  const lessons = schedule([0, 1], [0, 2]);
  const result = validateMove(source, lessons, {
    lesson_id: "lesson-rotation-l2-g1",
    target_day: 0,
    target_period: 4,
    target_room_id: null,
    expected_version: 1,
  });

  assert.equal(result.valid, false);
  assert.ok(
    result.issues.some(
      (item) => item.code === "PARALLEL_GROUP_DESYNCHRONIZED",
    ),
  );
  assert.ok(
    result.issues.some((item) => item.code === "ROTATION_NOT_ADJACENT"),
  );
});

test("same-day exchange may use morning and afternoon", () => {
  assert.deepEqual(
    validateSchedule(snapshot("SAME_DAY"), schedule([0, 0], [0, 6])),
    [],
  );
});

test("flexible exchange may use different days", () => {
  assert.deepEqual(
    validateSchedule(snapshot("FLEXIBLE"), schedule([0, 0], [1, 4])),
    [],
  );
});

test("adjacent exchange cannot be split by lunch", () => {
  const issues = validateSchedule(
    snapshot("ADJACENT"),
    schedule([0, 5], [0, 6]),
  );
  assert.ok(
    issues.some((item) => item.code === "ROTATION_CROSSES_LUNCH_BREAK"),
  );
});
