import { createHash } from "node:crypto";

import type { CanonicalSnapshot } from "./contracts";

function sorted<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((left, right) => key(left).localeCompare(key(right)));
}

function sortJsonObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonObjectKeys);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJsonObjectKeys(item)]),
  );
}

export function canonicalizeSnapshot(
  snapshot: CanonicalSnapshot,
): CanonicalSnapshot {
  return {
    ...snapshot,
    periods_per_day: [...snapshot.periods_per_day],
    teachers: sorted(snapshot.teachers, (item) => `${item.code}:${item.id}`),
    classes: sorted(snapshot.classes, (item) => `${item.code}:${item.id}`),
    subjects: sorted(snapshot.subjects, (item) => `${item.code}:${item.id}`),
    rooms: sorted(snapshot.rooms, (item) => `${item.code ?? ""}:${item.id}`),
    assignments: sorted(
      snapshot.assignments,
      (item) => `${item.code ?? ""}:${item.id}`,
    ),
    availability: sorted(
      snapshot.availability,
      (item) =>
        `${item.entity_type}:${item.entity_id}:${item.day}:${item.period}:${item.kind}`,
    ),
    fixed_lessons: sorted(
      snapshot.fixed_lessons,
      (item) => `${item.assignment_id}:${item.block_index}`,
    ),
    locked_lessons: sorted(
      snapshot.locked_lessons,
      (item) => `${item.assignment_id}:${item.block_index}`,
    ),
    weights: { ...snapshot.weights },
  };
}

export function serializeCanonicalSnapshot(
  snapshot: CanonicalSnapshot,
): string {
  return JSON.stringify(sortJsonObjectKeys(canonicalizeSnapshot(snapshot)));
}

export function createSnapshotHash(snapshot: CanonicalSnapshot): string {
  return createHash("sha256")
    .update(serializeCanonicalSnapshot(snapshot))
    .digest("hex");
}

export function toSolverRequest(snapshot: CanonicalSnapshot) {
  const canonical = canonicalizeSnapshot(snapshot);
  return {
    contract_version: canonical.contract_version,
    periods_per_day: canonical.periods_per_day,
    assignments: canonical.assignments,
    rooms: canonical.rooms.map((room) => ({
      id: room.id,
      room_type_id: room.room_type_id ?? null,
    })),
    availability: canonical.availability,
    fixed_lessons: canonical.fixed_lessons,
    locked_lessons: canonical.locked_lessons,
    weights: canonical.weights,
    random_seed: canonical.random_seed,
    time_limit_seconds: canonical.time_limit_seconds,
  };
}
