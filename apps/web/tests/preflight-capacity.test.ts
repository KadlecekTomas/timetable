import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalSnapshot } from "../lib/domain/contracts";
import { evaluateReadiness } from "../lib/domain/readiness";

function baseSnapshot(): CanonicalSnapshot {
  return {
    contract_version: "1.0",
    school_year: { id: "sy", label: "2026/2027", version: 1 },
    periods_per_day: [2, 2],
    teachers: [
      {
        id: "teacher",
        code: "T",
        first_name: "Eva",
        last_name: "Testová",
        target_weekly_load: 3,
      },
    ],
    classes: [
      { id: "class", code: "6.A", name: "6.A", grade: 6, profile: "REGULAR" },
    ],
    subjects: [
      {
        id: "tv",
        code: "TV",
        name: "Tělesná výchova",
        default_room_type_id: "gym",
      },
    ],
    rooms: [
      { id: "gym-1", code: "G1", name: "Tělocvična 1", room_type_id: "gym" },
      { id: "gym-2", code: "G2", name: "Tělocvična 2", room_type_id: "gym" },
    ],
    assignments: [
      {
        id: "tv-a",
        teacher_id: "teacher",
        class_id: "class",
        subject_id: "tv",
        group: "WHOLE",
        weekly_periods: 3,
        lesson_shape: "SINGLE",
        double_periods_count: 0,
        required_room_type_id: "gym",
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

test("preflight blocks a teacher whose availability cannot fit the assigned load", () => {
  const snapshot = baseSnapshot();
  snapshot.availability.push(
    {
      entity_type: "TEACHER",
      entity_id: "teacher",
      day: 0,
      period: 0,
      kind: "UNAVAILABLE",
    },
    {
      entity_type: "TEACHER",
      entity_id: "teacher",
      day: 0,
      period: 1,
      kind: "UNAVAILABLE",
    },
  );
  const report = evaluateReadiness(snapshot);
  assert.equal(report.ready, false);
  assert.ok(
    report.blockers.some(
      (item) =>
        item.code === "TEACHER_AVAILABLE_SLOT_CAPACITY_EXCEEDED" &&
        item.message.includes("3 hodin výuky") &&
        item.message.includes("2 použitelných hodin"),
    ),
  );
});

test("preflight blocks insufficient total PE room capacity after external occupancy", () => {
  const snapshot = baseSnapshot();
  snapshot.assignments[0]!.weekly_periods = 4;
  snapshot.teachers[0]!.target_weekly_load = 4;
  snapshot.availability.push(
    {
      entity_type: "ROOM",
      entity_id: "gym-1",
      day: 0,
      period: 0,
      kind: "UNAVAILABLE",
      reason: "PE_EXTERNAL_CAPACITY:first grade",
    },
    {
      entity_type: "ROOM",
      entity_id: "gym-2",
      day: 0,
      period: 0,
      kind: "UNAVAILABLE",
      reason: "PE_EXTERNAL_CAPACITY:first grade",
    },
    {
      entity_type: "ROOM",
      entity_id: "gym-1",
      day: 0,
      period: 1,
      kind: "UNAVAILABLE",
      reason: "PE_EXTERNAL_CAPACITY:first grade",
    },
    {
      entity_type: "ROOM",
      entity_id: "gym-2",
      day: 0,
      period: 1,
      kind: "UNAVAILABLE",
      reason: "PE_EXTERNAL_CAPACITY:first grade",
    },
    {
      entity_type: "ROOM",
      entity_id: "gym-1",
      day: 1,
      period: 0,
      kind: "UNAVAILABLE",
      reason: "PE_EXTERNAL_CAPACITY:first grade",
    },
  );
  const report = evaluateReadiness(snapshot);
  assert.equal(report.ready, false);
  assert.ok(
    report.blockers.some(
      (item) =>
        item.code === "PE_TOTAL_ROOM_CAPACITY_EXCEEDED" &&
        item.message.includes("4 prostorohodin") &&
        item.message.includes("3"),
    ),
  );
});
