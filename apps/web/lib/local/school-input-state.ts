import type { LocalProject } from "./api";
import type { StaffingPlan } from "./staffing-plan";
import type { TeachingPlan } from "./teaching-plan";

export type PreparedInputState = "EMPTY" | "STALE" | "CURRENT";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "updatedAt")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

/** Stable 64-bit FNV-1a fingerprint encoded as a versioned string. */
export function schoolInputFingerprint(
  staffingPlan: StaffingPlan,
  teachingPlan: TeachingPlan,
): string {
  const serialized = JSON.stringify(canonical({ staffingPlan, teachingPlan }));
  let hash = 0xcbf29ce484222325n;
  for (const character of serialized) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

export function preparedInputState(
  project: LocalProject,
  staffingPlan: StaffingPlan,
  teachingPlan: TeachingPlan,
): PreparedInputState {
  const hasWorkingData =
    staffingPlan.teachers.length > 0 ||
    teachingPlan.classes.length > 0 ||
    teachingPlan.rows.length > 0;
  const hasPreparedData =
    project.teachers.length > 0 ||
    project.classes.length > 0 ||
    project.subjects.length > 0 ||
    project.assignments.length > 0;
  if (!hasWorkingData && !hasPreparedData) return "EMPTY";
  if (!hasPreparedData) return "EMPTY";
  if (!project.inputFingerprint) return "STALE";
  return project.inputFingerprint ===
    schoolInputFingerprint(staffingPlan, teachingPlan)
    ? "CURRENT"
    : "STALE";
}
