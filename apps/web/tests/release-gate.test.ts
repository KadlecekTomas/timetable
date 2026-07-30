import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalSnapshot,
  ScheduledLesson,
} from "../lib/domain/contracts";
import { evaluateReadiness } from "../lib/domain/readiness";
import { scoreSchedule } from "../lib/domain/scoring";
import { validateMove, validateSchedule } from "../lib/domain/validation";

function snapshot(): CanonicalSnapshot {
  return {
    contract_version: "1.0",
    school_year: { id: "school-year", label: "2026/2027", version: 1 },
    periods_per_day: [4, 4, 4, 4, 4],
    teachers: [
      {
        id: "teacher-1",
        code: "NOV",
        first_name: "Jan",
        last_name: "Novák",
        target_weekly_load: 1,
      },
      {
        id: "teacher-2",
        code: "SVO",
        first_name: "Petra",
        last_name: "Svobodová",
        target_weekly_load: 1,
      },
    ],
    classes: [
      { id: "class-6a", code: "6A", name: "6.A", grade: 6 },
      { id: "class-7a", code: "7A", name: "7.A", grade: 7 },
    ],
    subjects: [
      { id: "math", code: "M", name: "Matematika" },
      { id: "czech", code: "CJ", name: "Český jazyk" },
    ],
    rooms: [
      { id: "room-1", code: "101", name: "101", room_type_id: "general" },
    ],
    assignments: [
      {
        id: "math-6a",
        code: "6A-M-NOV",
        teacher_id: "teacher-1",
        class_id: "class-6a",
        subject_id: "math",
        group: "WHOLE",
        weekly_periods: 1,
        lesson_shape: "SINGLE",
        double_periods_count: 0,
        required_room_id: "room-1",
      },
      {
        id: "czech-7a",
        code: "7A-CJ-SVO",
        teacher_id: "teacher-2",
        class_id: "class-7a",
        subject_id: "czech",
        group: "WHOLE",
        weekly_periods: 1,
        lesson_shape: "SINGLE",
        double_periods_count: 0,
        required_room_id: "room-1",
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
    },
    random_seed: 1,
    time_limit_seconds: 30,
  };
}

function validLessons(): ScheduledLesson[] {
  return [
    {
      id: "lesson-1",
      block_id: "math-6a:0",
      assignment_id: "math-6a",
      teacher_id: "teacher-1",
      class_id: "class-6a",
      subject_id: "math",
      group: "WHOLE",
      room_id: "room-1",
      day: 0,
      period: 0,
      duration: 1,
      locked: false,
      origin: "SOLVER",
    },
    {
      id: "lesson-2",
      block_id: "czech-7a:0",
      assignment_id: "czech-7a",
      teacher_id: "teacher-2",
      class_id: "class-7a",
      subject_id: "czech",
      group: "WHOLE",
      room_id: "room-1",
      day: 0,
      period: 1,
      duration: 1,
      locked: false,
      origin: "SOLVER",
    },
  ];
}

test("readiness blocks a malformed double-lesson contract", () => {
  const source = snapshot();
  source.assignments[0]!.weekly_periods = 1;
  source.assignments[0]!.lesson_shape = "MIXED";
  source.assignments[0]!.double_periods_count = 1;

  const report = evaluateReadiness(source);
  assert.equal(report.ready, false);
  assert.ok(
    report.blockers.some(
      (item) => item.code === "ASSIGNMENT_DOUBLE_PERIODS_INVALID",
    ),
  );
});

test("room collision invalidates both the schedule and its score", () => {
  const source = snapshot();
  const lessons = validLessons();
  lessons[1]!.period = lessons[0]!.period;

  const issues = validateSchedule(source, lessons);
  assert.ok(issues.some((item) => item.code === "ROOM_COLLISION"));

  const score = scoreSchedule(source, lessons);
  assert.equal(score.valid, false);
  assert.equal(score.total, null);
  assert.equal(score.label, null);
  assert.ok(score.hard_issues.some((item) => item.code === "ROOM_COLLISION"));
});

test("a double lesson is rejected when its second period is unavailable", () => {
  const source = snapshot();
  source.assignments = [
    {
      ...source.assignments[0]!,
      weekly_periods: 2,
      lesson_shape: "DOUBLE",
      double_periods_count: 1,
    },
  ];
  source.teachers = [source.teachers[0]!];
  source.classes = [source.classes[0]!];
  source.subjects = [source.subjects[0]!];
  source.availability = [
    {
      entity_type: "TEACHER",
      entity_id: "teacher-1",
      day: 0,
      period: 1,
      kind: "UNAVAILABLE",
    },
  ];

  const lessons: ScheduledLesson[] = [
    {
      id: "double-lesson",
      block_id: "math-6a:0",
      assignment_id: "math-6a",
      teacher_id: "teacher-1",
      class_id: "class-6a",
      subject_id: "math",
      group: "WHOLE",
      room_id: "room-1",
      day: 0,
      period: 0,
      duration: 2,
      locked: false,
      origin: "SOLVER",
    },
  ];

  const issues = validateSchedule(source, lessons);
  assert.ok(
    issues.some(
      (item) =>
        item.code === "UNAVAILABLE_SLOT" && item.day === 0 && item.period === 1,
    ),
  );
});

test("move validation never mutates the stored lesson array", () => {
  const source = snapshot();
  const lessons = validLessons();
  const original = structuredClone(lessons);

  const result = validateMove(source, lessons, {
    lesson_id: "lesson-1",
    target_day: 0,
    target_period: 1,
    target_room_id: "room-1",
    expected_version: 1,
  });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((item) => item.code === "ROOM_COLLISION"));
  assert.deepEqual(lessons, original);
});
