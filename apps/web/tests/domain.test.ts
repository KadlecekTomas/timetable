import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalSnapshot,
  ScheduledLesson,
} from "../lib/domain/contracts";
import { evaluateReadiness } from "../lib/domain/readiness";
import { scoreSchedule } from "../lib/domain/scoring";
import { createSnapshotHash } from "../lib/domain/snapshot";
import { validateMove, validateSchedule } from "../lib/domain/validation";

function snapshot(): CanonicalSnapshot {
  return {
    contract_version: "1.0",
    school_year: { id: "sy", label: "2026/2027", version: 1 },
    periods_per_day: [4, 4, 4, 4, 4],
    teachers: [
      {
        id: "teacher-1",
        code: "NOV",
        first_name: "Jan",
        last_name: "Novák",
        target_weekly_load: 2,
      },
      {
        id: "teacher-2",
        code: "SVO",
        first_name: "Eva",
        last_name: "Svobodová",
        target_weekly_load: 1,
      },
    ],
    classes: [{ id: "class-6a", code: "6A", name: "6.A", grade: 6 }],
    subjects: [
      { id: "math", code: "M", name: "Matematika" },
      { id: "english", code: "AJ", name: "Angličtina" },
    ],
    rooms: [
      { id: "room-1", code: "101", name: "101", room_type_id: "general" },
      { id: "room-2", code: "102", name: "102", room_type_id: "general" },
    ],
    assignments: [
      {
        id: "math-6a",
        code: "6A-M-NOV",
        teacher_id: "teacher-1",
        class_id: "class-6a",
        subject_id: "math",
        group: "WHOLE",
        weekly_periods: 2,
        lesson_shape: "SINGLE",
        double_periods_count: 0,
      },
      {
        id: "english-6a-g1",
        code: "6A-AJ-G1",
        teacher_id: "teacher-2",
        class_id: "class-6a",
        subject_id: "english",
        group: "GROUP_1",
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

function lessons(): ScheduledLesson[] {
  return [
    {
      id: "lesson-1",
      block_id: "math-6a:0",
      assignment_id: "math-6a",
      teacher_id: "teacher-1",
      class_id: "class-6a",
      subject_id: "math",
      group: "WHOLE",
      room_id: null,
      day: 0,
      period: 0,
      duration: 1,
      locked: false,
      origin: "SOLVER",
    },
    {
      id: "lesson-2",
      block_id: "math-6a:1",
      assignment_id: "math-6a",
      teacher_id: "teacher-1",
      class_id: "class-6a",
      subject_id: "math",
      group: "WHOLE",
      room_id: null,
      day: 1,
      period: 0,
      duration: 1,
      locked: false,
      origin: "SOLVER",
    },
    {
      id: "lesson-3",
      block_id: "english-6a-g1:0",
      assignment_id: "english-6a-g1",
      teacher_id: "teacher-2",
      class_id: "class-6a",
      subject_id: "english",
      group: "GROUP_1",
      room_id: "room-1",
      day: 0,
      period: 1,
      duration: 1,
      locked: false,
      origin: "SOLVER",
    },
  ];
}

test("readiness blocks missing references and reports load warning", () => {
  const source = snapshot();
  const report = evaluateReadiness(source);
  assert.equal(report.ready, true);
  assert.equal(report.blockers.length, 0);
  assert.ok(
    report.warnings.some(
      (item) => item.code === "SPLIT_GROUP_COUNTERPART_MISSING",
    ),
  );

  source.assignments[0]!.teacher_id = "missing";
  const invalid = evaluateReadiness(source);
  assert.equal(invalid.ready, false);
  assert.ok(
    invalid.blockers.some((item) => item.code === "ASSIGNMENT_TEACHER_UNKNOWN"),
  );
});

test("valid schedule receives deterministic score", () => {
  const source = snapshot();
  const timetable = lessons();
  assert.deepEqual(validateSchedule(source, timetable), []);
  const first = scoreSchedule(source, timetable);
  const second = scoreSchedule(source, timetable);
  assert.deepEqual(first, second);
  assert.equal(first.valid, true);
  assert.equal(
    first.total,
    Object.values(first.categories).reduce((sum, value) => sum + value, 0),
  );
});

test("whole class lesson conflicts with split group but two distinct groups may overlap", () => {
  const source = snapshot();
  source.assignments.push({
    id: "english-6a-g2",
    code: "6A-AJ-G2",
    teacher_id: "teacher-1",
    class_id: "class-6a",
    subject_id: "english",
    group: "GROUP_2",
    weekly_periods: 1,
    lesson_shape: "SINGLE",
    double_periods_count: 0,
    required_room_id: "room-2",
  });
  const timetable = lessons();
  timetable.push({
    id: "lesson-4",
    block_id: "english-6a-g2:0",
    assignment_id: "english-6a-g2",
    teacher_id: "teacher-1",
    class_id: "class-6a",
    subject_id: "english",
    group: "GROUP_2",
    room_id: "room-2",
    day: 0,
    period: 1,
    duration: 1,
    locked: false,
    origin: "SOLVER",
  });
  const issues = validateSchedule(source, timetable);
  assert.equal(
    issues.some((item) => item.code === "CLASS_COLLISION"),
    false,
  );

  timetable[0]!.day = 0;
  timetable[0]!.period = 1;
  const conflict = validateSchedule(source, timetable);
  assert.ok(conflict.some((item) => item.code === "CLASS_COLLISION"));
});

test("move validation rejects locked lesson and hard collision", () => {
  const source = snapshot();
  const timetable = lessons();
  timetable[0]!.locked = true;
  const locked = validateMove(source, timetable, {
    lesson_id: "lesson-1",
    target_day: 2,
    target_period: 0,
    target_room_id: null,
    expected_version: 1,
  });
  assert.equal(locked.valid, false);
  assert.equal(locked.issues[0]?.code, "LESSON_LOCKED");

  timetable[0]!.locked = false;
  const collision = validateMove(source, timetable, {
    lesson_id: "lesson-1",
    target_day: 0,
    target_period: 1,
    target_room_id: null,
    expected_version: 1,
  });
  assert.equal(collision.valid, false);
  assert.ok(collision.issues.some((item) => item.code === "CLASS_COLLISION"));
});

test("canonical snapshot hash is independent of entity ordering", () => {
  const left = snapshot();
  const right = snapshot();
  right.teachers.reverse();
  right.assignments.reverse();
  assert.equal(createSnapshotHash(left), createSnapshotHash(right));
});
