import type {
  ScheduledLesson,
  SnapshotAssignment,
  TeachingGroup,
} from "./contracts";

const PARALLEL_GROUP_ORDER: Array<Exclude<TeachingGroup, "WHOLE">> = [
  "GROUP_1",
  "GROUP_2",
  "GROUP_3",
];

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

export function parallelAssignmentGroups(
  assignments: SnapshotAssignment[],
): SnapshotAssignment[][] {
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

  return [...grouped.values()].flatMap((groups) => {
    const present = PARALLEL_GROUP_ORDER.flatMap((group) => {
      const items = [...(groups[group] ?? [])].sort((a, b) =>
        a.id.localeCompare(b.id),
      );
      return items.length === 1 ? [items[0]!] : [];
    });
    const rawCount = PARALLEL_GROUP_ORDER.reduce(
      (total, group) => total + (groups[group]?.length ?? 0),
      0,
    );
    return present.length >= 2 && present.length === rawCount ? [present] : [];
  });
}

export function parallelAssignmentPairs(
  assignments: SnapshotAssignment[],
): Array<[SnapshotAssignment, SnapshotAssignment]> {
  return parallelAssignmentGroups(assignments).flatMap((group) =>
    group.length === 2 &&
    group[0]?.group === "GROUP_1" &&
    group[1]?.group === "GROUP_2"
      ? [[group[0], group[1]] as [SnapshotAssignment, SnapshotAssignment]]
      : [],
  );
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
    .filter(
      (
        entry,
      ): entry is [
        string,
        {
          1: [SnapshotAssignment, SnapshotAssignment];
          2: [SnapshotAssignment, SnapshotAssignment];
        },
      ] => Boolean(entry[1][1] && entry[1][2]),
    )
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
  const groupedIds = new Set<string>();

  for (const group of parallelAssignmentGroups(assignments)) {
    group.forEach((assignment) => groupedIds.add(assignment.id));
    const weeklyPeriods = Math.max(...group.map((item) => item.weekly_periods));
    for (const classId of assignmentClassIds(group[0]!)) {
      totals.set(classId, (totals.get(classId) ?? 0) + weeklyPeriods);
    }
  }

  for (const assignment of assignments) {
    if (groupedIds.has(assignment.id)) continue;
    for (const classId of assignmentClassIds(assignment)) {
      totals.set(
        classId,
        (totals.get(classId) ?? 0) + assignment.weekly_periods,
      );
    }
  }

  return totals;
}
