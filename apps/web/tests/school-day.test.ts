import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalSnapshot,
  ScheduledLesson,
} from "../lib/domain/contracts";
import {
  crossesLunchBreak,
  MIN_LUNCH_BREAK_MINUTES,
  MORNING_PERIOD_LIMIT,
  SCHOOL_DAY_START_TIME,
  schoolPeriodLabel,
} from "../lib/domain/school-day";
import { validateSchedule } from "../lib/domain/validation";

const snapshot: CanonicalSnapshot = {
  contract_version: "1.0",
  school_year: { id: "school-year", label: "2026/2027", version: 1 },
  periods_per_day: [8],
  teachers: [
    {
      id: "teacher-1",
      code: "NOV",
      first_name: "Jan",
      last_name: "Novák",
      target_weekly_load: 2,
    },
  ],
  classes: [
    {
      id: "class-1",
      code: "6A",
      name: "6.A",
      grade: 6,
      profile: "REGULAR",
    },
  ],
  subjects: [{ id: "subject-1", code: "M", name: "Matematika" }],
  rooms: [],
  assignments: [
    {
      id: "assignment-1",
      teacher_id: "teacher-1",
      class_id: "class-1",
      subject_id: "subject-1",
      group: "WHOLE",
      weekly_periods: 2,
      lesson_shape: "DOUBLE",
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
    rotation_spread: 75,
  },
  random_seed: 1,
  time_limit_seconds: 30,
};

function lesson(period: number): ScheduledLesson {
  return {
    block_id: "assignment-1:0",
    assignment_id: "assignment-1",
    teacher_id: "teacher-1",
    class_id: "class-1",
    subject_id: "subject-1",
    group: "WHOLE",
    room_id: null,
    day: 0,
    period,
    duration: 2,
    locked: false,
    origin: "SOLVER",
  };
}

test("Czech school day starts at eight and uses six morning periods", () => {
  assert.equal(SCHOOL_DAY_START_TIME, "8:00");
  assert.equal(schoolPeriodLabel(0), "1. hodina · 8:00");
  assert.equal(schoolPeriodLabel(1), "2. hodina");
  assert.equal(MORNING_PERIOD_LIMIT, 6);
  assert.equal(MIN_LUNCH_BREAK_MINUTES, 50);
  assert.equal(crossesLunchBreak(5, 2), true);
  assert.equal(crossesLunchBreak(6, 2), false);
});

test("local validation rejects a double lesson crossing lunch", () => {
  const issues = validateSchedule(snapshot, [lesson(5)]);
  assert.ok(issues.some((issue) => issue.code === "LUNCH_BREAK_CROSSED"));
});

test("local validation allows an afternoon double lesson after lunch", () => {
  assert.deepEqual(validateSchedule(snapshot, [lesson(6)]), []);
});

test("regular five-day class must start at eight every day", () => {
  const fullWeekSnapshot: CanonicalSnapshot = {
    ...snapshot,
    periods_per_day: [2, 2, 2, 2, 2],
    assignments: [
      {
        ...snapshot.assignments[0]!,
        weekly_periods: 5,
        lesson_shape: "SINGLE",
      },
    ],
  };
  const fullWeekLessons: ScheduledLesson[] = Array.from(
    { length: 5 },
    (_, day) => ({
      ...lesson(0),
      block_id: `assignment-1:${day}`,
      day,
      duration: 1,
    }),
  );
  assert.deepEqual(validateSchedule(fullWeekSnapshot, fullWeekLessons), []);

  const lateStart = fullWeekLessons.map((item) => ({ ...item }));
  lateStart[2] = { ...lateStart[2]!, period: 1 };
  assert.ok(
    validateSchedule(fullWeekSnapshot, lateStart).some(
      (issue) => issue.code === "CLASS_DOES_NOT_START_AT_EIGHT",
    ),
  );
});
