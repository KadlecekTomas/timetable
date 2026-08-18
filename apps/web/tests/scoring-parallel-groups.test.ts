import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalSnapshot,
  ScheduledLesson,
} from "../lib/domain/contracts";
import { scoreSchedule } from "../lib/domain/scoring";

const snapshot: CanonicalSnapshot = {
  contract_version: "1.0",
  school_year: { id: "sy", label: "2026/2027", version: 1 },
  periods_per_day: [2],
  teachers: [1, 2, 3].map((index) => ({
    id: `teacher-${index}`,
    code: `T${index}`,
    first_name: `Teacher ${index}`,
    last_name: "Test",
    target_weekly_load: 1,
  })),
  classes: [
    {
      id: "class-7a",
      code: "7A",
      name: "7.A",
      grade: 7,
      profile: "REGULAR",
    },
  ],
  subjects: [{ id: "english", code: "JAZ1", name: "Angličtina" }],
  rooms: [],
  assignments: [1, 2, 3].map((group) => ({
    id: `english-g${group}`,
    code: `7A-AJ-G${group}`,
    teacher_id: `teacher-${group}`,
    class_id: "class-7a",
    subject_id: "english",
    group: `GROUP_${group}` as "GROUP_1" | "GROUP_2" | "GROUP_3",
    weekly_periods: 1,
    lesson_shape: "SINGLE" as const,
    double_periods_count: 0,
    parallel_key: "7a-english",
  })),
  availability: [],
  fixed_lessons: [],
  locked_lessons: [],
  weights: {
    teacher_gap: 1_000,
    class_gap: 2_000,
    discouraged_slot: 25,
    preferred_slot_bonus: 3,
    same_day_concentration: 50,
    late_period: 10,
    rotation_spread: 75,
  },
  random_seed: 1,
  time_limit_seconds: 30,
};

const lessons: ScheduledLesson[] = [1, 2, 3].map((group) => ({
  id: `lesson-${group}`,
  block_id: `english-g${group}:0`,
  assignment_id: `english-g${group}`,
  teacher_id: `teacher-${group}`,
  class_id: "class-7a",
  additional_class_ids: [],
  subject_id: "english",
  group: `GROUP_${group}` as "GROUP_1" | "GROUP_2" | "GROUP_3",
  room_id: null,
  day: 0,
  period: 0,
  duration: 1,
  locked: false,
  origin: "SOLVER",
}));

test("three parallel language groups count as one class period", () => {
  const score = scoreSchedule(snapshot, lessons);
  assert.equal(score.valid, true);
  assert.equal(score.categories.class_compactness, 25);
  assert.equal(score.categories.distribution, 15);
});
