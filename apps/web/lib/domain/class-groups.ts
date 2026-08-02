import type {
  ScheduledLesson,
  SnapshotAssignment,
  TeachingGroup,
} from "./contracts";

export function assignmentClassIds(assignment: SnapshotAssignment): string[] {
  return [
    ...new Set([
      assignment.class_id,
      ...(assignment.additional_class_ids ?? []),
    ]),
  ];
}

export function lessonClassIds(lesson: ScheduledLesson): string[] {
  return [
    ...new Set([lesson.class_id, ...(lesson.additional_class_ids ?? [])]),
  ];
}

function parallelKey(assignment: SnapshotAssignment): string {
  if (assignment.parallel_key) return assignment.parallel_key;

  const normalizedId = assignment.id.toLocaleLowerCase("cs-CZ");
  if (normalizedId.includes("-rot-") || normalizedId.includes("-rotation-")) {
    return `rotation-id:${normalizedId.replace(/-(g1|g2)$/i, "")}`;
  }
  return `subject:${assignment.subject_id}`;
}

export function parallelAssignmentPairs(
  assignments: SnapshotAssignment[],
): Array<[SnapshotAssignment, SnapshotAssignment]> {
  const grouped = new Map<
    string,
    Partial<Record<Exclude<TeachingGroup, "WHOLE">, SnapshotAssignment[]>>
  >();

  for (const assignment of assignments) {
    if (assignment.group === "WHOLE") continue;
    const key = `${assignmentClassIds(assignment).sort().join("|")}::${parallelKey(assignment)}`;
    const groups = grouped.get(key) ?? {};
    const current = groups[assignment.group] ?? [];
    groups[assignment.group] = [...current, assignment];
    grouped.set(key, groups);
  }

  const pairs: Array<[SnapshotAssignment, SnapshotAssignment]> = [];
  for (const groups of grouped.values()) {
    const left = [...(groups.GROUP_1 ?? [])].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const right = [...(groups.GROUP_2 ?? [])].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    if (left.length === 1 && right.length === 1) {
      pairs.push([left[0]!, right[0]!]);
    }
  }
  return pairs;
}

export function rotationAssignmentLegs(
  assignments: SnapshotAssignment[],
): Array<{
  rotationKey: string;
  leg1: [SnapshotAssignment, SnapshotAssignment];
  leg2: [SnapshotAssignment, SnapshotAssignment];
}> {
  const rotations = new Map<
    string,
    Partial<Record<1 | 2, [SnapshotAssignment, SnapshotAssignment]>>
  >();

  for (const pair of parallelAssignmentPairs(assignments)) {
    const [left, right] = pair;
    if (
      !left.rotation_key ||
      left.rotation_key !== right.rotation_key ||
      left.rotation_leg == null ||
      left.rotation_leg !== right.rotation_leg
    ) {
      continue;
    }
    const leg = left.rotation_leg as 1 | 2;
    const current = rotations.get(left.rotation_key) ?? {};
    current[leg] = pair;
    rotations.set(left.rotation_key, current);
  }

  return [...rotations.entries()]
    .filter((entry): entry is [
      string,
      {
        1: [SnapshotAssignment, SnapshotAssignment];
        2: [SnapshotAssignment, SnapshotAssignment];
      },
    ] => Boolean(entry[1][1] && entry[1][2]))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([rotationKey, legs]) => ({
      rotationKey,
      leg1: legs[1],
      leg2: legs[2],
    }));
}

export function classRequiredWeeklyPeriods(
  assignments: SnapshotAssignment[],
): Map<string, number> {
  const totals = new Map<string, number>();
  const pairedIds = new Set<string>();

  for (const [left, right] of parallelAssignmentPairs(assignments)) {
    pairedIds.add(left.id);
    pairedIds.add(right.id);
    const weeklyPeriods = Math.max(left.weekly_periods, right.weekly_periods);
    for (const classId of assignmentClassIds(left)) {
      totals.set(classId, (totals.get(classId) ?? 0) + weeklyPeriods);
    }
  }

  for (const assignment of assignments) {
    if (pairedIds.has(assignment.id)) continue;
    for (const classId of assignmentClassIds(assignment)) {
      totals.set(
        classId,
        (totals.get(classId) ?? 0) + assignment.weekly_periods,
      );
    }
  }

  return totals;
}
