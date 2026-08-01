import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalSnapshot,
  ScheduledLesson,
} from "../lib/domain/contracts";
import { validateSchedule } from "../lib/domain/validation";

function snapshot(): CanonicalSnapshot {
  return {
    contract_version: "1.0",
    school_year: { id: "school", label: "2026/2027", version: 1 },
    periods_per_day: [8, 8, 8, 8, 7],
    teachers: [
      {
        id: "teacher-a",
        code: "A",
        first_name: "Anna",
        last_name: "První",
        target_weekly_load: 3,
      },
      {
        id: "teacher-b",
        code: "B",
        first_name: "Boris",
        last_name: "Druhý",
        target_weekly_load: 1,
      },
    ],
    classes: [
      { id: "9a", code: "9A", name: "9.A", grade: 9 },
      { id: "9c", code: "9C", name: "9.C", grade: 9 },
    ],
    subjects: [
      { id: "tv", code: "TV", name: "Tělesná výchova" },
      { id: "cj", code: "CJ", name: "Český jazyk" },
    ],
    rooms: [],
    assignments: [
      {
        id: "shared-tv",
        teacher_id: "teacher-a",
        class_id: "9a",
        additional_class_ids: ["9c"],
        subject_id: "tv",
        group: "WHOLE",
        weekly_periods: 2,
        lesson_shape: "DOUBLE",
        double_periods_count: 0,
      },
      {
        id: "cj-group-1",
        teacher_id: "teacher-a",
        class_id: "9a",
        subject_id: "cj",
        group: "GROUP_1",
        weekly_periods: 1,
        lesson_shape: "SINGLE",
        double_periods_count: 0,
      },
      {
        id: "cj-group-2",
        teacher_id: "teacher-b",
        class_id: "9a",
        subject_id: "cj",
        group: "GROUP_2",
        weekly_periods: 1,
        lesson_shape: "SINGLE",
        double_periods_count: 0,
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
      id: "shared-tv-lesson",
      block_id: "shared-tv:0",
      assignment_id: "shared-tv",
      teacher_id: "teacher-a",
      class_id: "9a",
      additional_class_ids: ["9c"],
      subject_id: "tv",
      group: "WHOLE",
      room_id: null,
      day: 0,
      period: 2,
      duration: 2,
      locked: false,
      origin: "SOLVER",
    },
    {
      id: "cj-group-1-lesson",
      block_id: "cj-group-1:0",
      assignment_id: "cj-group-1",
      teacher_id: "teacher-a",
      class_id: "9a",
      subject_id: "cj",
      group: "GROUP_1",
      room_id: null,
      day: 1,
      period: 1,
      duration: 1,
      locked: false,
      origin: "SOLVER",
    },
    {
      id: "cj-group-2-lesson",
      block_id: "cj-group-2:0",
      assignment_id: "cj-group-2",
      teacher_id: "teacher-b",
      class_id: "9a",
      subject_id: "cj",
      group: "GROUP_2",
      room_id: null,
      day: 1,
      period: 1,
      duration: 1,
      locked: false,
      origin: "SOLVER",
    },
  ];
}

test("shared lesson occupies every participating class", () => {
  const source = snapshot();
  const result = lessons();
  result.push({
    id: "collision",
    block_id: "collision",
    assignment_id: "cj-group-2",
    teacher_id: "teacher-b",
    class_id: "9c",
    subject_id: "cj",
    group: "WHOLE",
    room_id: null,
    day: 0,
    period: 2,
    duration: 1,
    locked: false,
    origin: "MANUAL",
  });

  assert.ok(
    validateSchedule(source, result).some(
      (issue) =>
        issue.code === "CLASS_COLLISION" && issue.entity_ids.includes("9c"),
    ),
  );
});

test("both halves of split teaching must stay synchronized", () => {
  const source = snapshot();
  const result = lessons();
  result[2] = { ...result[2]!, period: 2 };

  assert.ok(
    validateSchedule(source, result).some(
      (issue) => issue.code === "PARALLEL_GROUP_DESYNCHRONIZED",
    ),
  );
});

test("valid shared lesson and synchronized split groups pass validation", () => {
  assert.deepEqual(validateSchedule(snapshot(), lessons()), []);
});
