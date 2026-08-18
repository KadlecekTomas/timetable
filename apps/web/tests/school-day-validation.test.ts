import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalSnapshot,
  ScheduledLesson,
} from "../lib/domain/contracts";
import { validateMove, validateSchedule } from "../lib/domain/validation";

function fixture(): {
  snapshot: CanonicalSnapshot;
  lessons: ScheduledLesson[];
} {
  const assignments = Array.from({ length: 30 }, (_, index) => ({
    id: `a-${index}`,
    code: `A-${index}`,
    teacher_id: `t-${index}`,
    class_id: "9a",
    subject_id: `s-${index}`,
    group: "WHOLE" as const,
    weekly_periods: 1,
    lesson_shape: "SINGLE" as const,
    double_periods_count: 0,
  }));

  const snapshot: CanonicalSnapshot = {
    contract_version: "1.0",
    school_year: { id: "sy", label: "2026/2027", version: 1 },
    periods_per_day: [8, 8, 8, 8, 8],
    teachers: assignments.map((assignment, index) => ({
      id: assignment.teacher_id,
      code: `T${index}`,
      first_name: "Test",
      last_name: `${index}`,
      target_weekly_load: 1,
    })),
    classes: [
      {
        id: "9a",
        code: "9A",
        name: "9.A",
        grade: 9,
        profile: "REGULAR",
      },
    ],
    subjects: assignments.map((assignment, index) => ({
      id: assignment.subject_id,
      code: `S${index}`,
      name: `Subject ${index}`,
    })),
    rooms: [],
    assignments,
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

  const lessons: ScheduledLesson[] = [];
  let index = 0;
  for (let day = 0; day < 5; day += 1) {
    for (let period = 0; period < 6; period += 1) {
      lessons.push({
        id: `lesson-${index}`,
        block_id: `a-${index}:0`,
        assignment_id: `a-${index}`,
        teacher_id: `t-${index}`,
        class_id: "9a",
        additional_class_ids: [],
        subject_id: `s-${index}`,
        group: "WHOLE",
        room_id: null,
        day,
        period,
        duration: 1,
        locked: false,
        origin: "SOLVER",
      });
      index += 1;
    }
  }

  return { snapshot, lessons };
}

test("manual move cannot create a Friday afternoon", () => {
  const { snapshot, lessons } = fixture();
  assert.deepEqual(validateSchedule(snapshot, lessons), []);

  const fridayLast = lessons.find(
    (lesson) => lesson.day === 4 && lesson.period === 5,
  )!;
  const result = validateMove(snapshot, lessons, {
    lesson_id: fridayLast.id!,
    target_day: 4,
    target_period: 6,
    target_room_id: null,
  });

  assert.equal(result.valid, false);
  assert.equal(
    result.issues.some(
      (issue) => issue.code === "CLASS_AFTERNOON_FORBIDDEN_DAY",
    ),
    true,
  );
});

test("validator rejects consecutive class afternoons", () => {
  const { snapshot, lessons } = fixture();
  for (const day of [1, 2]) {
    const last = lessons.find(
      (lesson) => lesson.day === day && lesson.period === 5,
    )!;
    last.period = 6;
  }

  const issues = validateSchedule(snapshot, lessons);
  assert.equal(
    issues.some((issue) => issue.code === "CONSECUTIVE_CLASS_AFTERNOONS"),
    true,
  );
});
