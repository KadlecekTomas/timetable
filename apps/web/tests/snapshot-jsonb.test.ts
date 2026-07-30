import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalSnapshot } from "../lib/domain/contracts";
import { createSnapshotHash } from "../lib/domain/snapshot";

const emptyEntities = {
  teachers: [],
  classes: [],
  subjects: [],
  rooms: [],
  assignments: [],
  availability: [],
  fixed_lessons: [],
  locked_lessons: [],
} as const;

test("snapshot hash survives JSONB object-key reordering", () => {
  const original: CanonicalSnapshot = {
    contract_version: "1.0",
    school_year: { id: "school-year", label: "2026/2027", version: 2 },
    periods_per_day: [8, 8, 8, 8, 7],
    ...emptyEntities,
    weights: {
      teacher_gap: 20,
      class_gap: 25,
      discouraged_slot: 8,
      preferred_slot_bonus: 3,
      same_day_concentration: 6,
      late_period: 1,
    },
    random_seed: 1,
    time_limit_seconds: 60,
  };

  const jsonbOrdered = {
    time_limit_seconds: 60,
    random_seed: 1,
    weights: {
      late_period: 1,
      same_day_concentration: 6,
      preferred_slot_bonus: 3,
      discouraged_slot: 8,
      class_gap: 25,
      teacher_gap: 20,
    },
    periods_per_day: [8, 8, 8, 8, 7],
    locked_lessons: [],
    fixed_lessons: [],
    availability: [],
    assignments: [],
    rooms: [],
    subjects: [],
    classes: [],
    teachers: [],
    school_year: { version: 2, label: "2026/2027", id: "school-year" },
    contract_version: "1.0",
  } as CanonicalSnapshot;

  assert.equal(createSnapshotHash(original), createSnapshotHash(jsonbOrdered));
});
