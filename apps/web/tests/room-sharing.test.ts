import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalSnapshot,
  ScheduledLesson,
} from "../lib/domain/contracts";
import { evaluateReadiness } from "../lib/domain/readiness";
import { validateSchedule } from "../lib/domain/validation";

function sharedPeSnapshot(): CanonicalSnapshot {
  const teachers = ["8b-g1", "8b-g2", "8b-g3", "9b-g1", "9b-g2"].map((id) => ({
    id: `teacher:${id}`,
    code: id,
    first_name: "Test",
    last_name: id,
    target_weekly_load: id.startsWith("8b") ? 5 : 4,
    max_weekly_load: id.startsWith("8b") ? 5 : 4,
  }));
  const assignment = (
    id: string,
    classId: string,
    teacherId: string,
    group: "GROUP_1" | "GROUP_2" | "GROUP_3",
    weeklyPeriods: number,
    roomShareKey: string | null,
  ) => ({
    id,
    teacher_id: teacherId,
    class_id: classId,
    subject_id: "subject:TV",
    group,
    weekly_periods: weeklyPeriods,
    lesson_shape:
      weeklyPeriods === 5 ? ("MIXED" as const) : ("DOUBLE" as const),
    double_periods_count: 2,
    required_room_type_id: "room-type:TV",
    parallel_key: `parallel:${classId}`,
    room_share_key: roomShareKey,
  });
  return {
    contract_version: "1.0",
    school_year: { id: "sy", label: "2026/2027", version: 1 },
    periods_per_day: [6],
    teachers,
    classes: [
      {
        id: "class:8-B",
        code: "8.B",
        name: "8.B",
        grade: 8,
        profile: "SPORTS",
      },
      {
        id: "class:9-B",
        code: "9.B",
        name: "9.B",
        grade: 9,
        profile: "SPORTS",
      },
    ],
    subjects: [
      {
        id: "subject:TV",
        code: "TV",
        name: "Tělesná výchova",
        default_room_type_id: "room-type:TV",
      },
    ],
    rooms: ["1", "2", "3"].map((id) => ({
      id: `room:${id}`,
      code: id,
      name: id,
      room_type_id: "room-type:TV",
    })),
    assignments: [
      assignment(
        "8b-g1",
        "class:8-B",
        "teacher:8b-g1",
        "GROUP_1",
        5,
        "share:g1",
      ),
      assignment(
        "8b-g2",
        "class:8-B",
        "teacher:8b-g2",
        "GROUP_2",
        5,
        "share:g2",
      ),
      assignment("8b-g3", "class:8-B", "teacher:8b-g3", "GROUP_3", 5, null),
      assignment(
        "9b-g1",
        "class:9-B",
        "teacher:9b-g1",
        "GROUP_1",
        4,
        "share:g1",
      ),
      assignment(
        "9b-g2",
        "class:9-B",
        "teacher:9b-g2",
        "GROUP_2",
        4,
        "share:g2",
      ),
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

test("8.B + 9.B room sharing turns a five-room-hour deficit into three hours of reserve", () => {
  const snapshot = sharedPeSnapshot();
  const withoutSharing = structuredClone(snapshot);
  for (const assignment of withoutSharing.assignments) {
    assignment.room_share_key = null;
  }
  const blocked = evaluateReadiness(withoutSharing);
  assert.equal(blocked.ready, false);
  assert.ok(
    blocked.blockers.some(
      (issue) =>
        issue.code === "PE_TOTAL_ROOM_CAPACITY_EXCEEDED" &&
        issue.message.includes("23 prostorohodin") &&
        issue.message.includes("18") &&
        issue.message.includes("5 prostorohodin"),
    ),
  );

  const shared = evaluateReadiness(snapshot);
  assert.equal(shared.ready, true);
  assert.ok(
    shared.warnings.some(
      (issue) =>
        issue.code === "PE_TOTAL_ROOM_CAPACITY_TIGHT" &&
        issue.message.includes("rezervu jen 3 prostorohodin"),
    ),
  );
});

test("validator allows only the declared co-teaching pair to share one room", () => {
  const snapshot = sharedPeSnapshot();
  snapshot.assignments = snapshot.assignments
    .filter((assignment) => ["8b-g1", "9b-g1"].includes(assignment.id))
    .map((assignment) => ({
      ...assignment,
      weekly_periods: 2,
      lesson_shape: "DOUBLE" as const,
      double_periods_count: 1,
    }));
  snapshot.teachers = snapshot.teachers.filter((teacher) =>
    ["teacher:8b-g1", "teacher:9b-g1"].includes(teacher.id),
  );
  snapshot.periods_per_day = [2];

  const lessons: ScheduledLesson[] = snapshot.assignments.map((assignment) => ({
    block_id: `${assignment.id}:0`,
    assignment_id: assignment.id,
    teacher_id: assignment.teacher_id,
    class_id: assignment.class_id,
    subject_id: assignment.subject_id,
    group: assignment.group,
    room_id: "room:1",
    day: 0,
    period: 0,
    duration: 2,
    locked: false,
    origin: "SOLVER",
  }));
  assert.deepEqual(validateSchedule(snapshot, lessons), []);

  snapshot.assignments[1]!.room_share_key = null;
  assert.ok(
    validateSchedule(snapshot, lessons).some(
      (issue) => issue.code === "ROOM_COLLISION",
    ),
  );
});
