import { assignmentBlockDurations, type SnapshotAssignment } from "./contracts";

export interface RoomShareAssignmentGroup {
  key: string;
  assignments: SnapshotAssignment[];
}

export function roomShareAssignmentGroups(
  assignments: SnapshotAssignment[],
): RoomShareAssignmentGroup[] {
  const grouped = new Map<string, SnapshotAssignment[]>();
  for (const assignment of assignments) {
    const key = assignment.room_share_key?.trim();
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), assignment]);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, items]) => ({
      key,
      assignments: [...items].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    }));
}

export function sharedRoomBlockDurations(
  assignments: SnapshotAssignment[],
): number[] {
  if (assignments.length < 2) return [];
  const durations = assignments.map(assignmentBlockDurations);
  const limit = Math.min(...durations.map((items) => items.length));
  const shared: number[] = [];
  for (let index = 0; index < limit; index += 1) {
    const duration = durations[0]?.[index];
    if (
      duration == null ||
      durations.some((items) => items[index] !== duration)
    ) {
      break;
    }
    shared.push(duration);
  }
  return shared;
}

export function roomShareBlockPairKey(
  leftBlockId: string,
  rightBlockId: string,
): string {
  return [leftBlockId, rightBlockId].sort().join("::");
}

export function sharedRoomBlockPairs(
  assignments: SnapshotAssignment[],
): Set<string> {
  const pairs = new Set<string>();
  for (const group of roomShareAssignmentGroups(assignments)) {
    if (group.assignments.length < 2) continue;
    const shared = sharedRoomBlockDurations(group.assignments);
    const leader = group.assignments[0]!;
    for (const follower of group.assignments.slice(1)) {
      shared.forEach((_duration, index) => {
        pairs.add(
          roomShareBlockPairKey(
            `${leader.id}:${index}`,
            `${follower.id}:${index}`,
          ),
        );
      });
    }
  }
  return pairs;
}

export function sharedRoomPeriodDiscount(
  assignments: SnapshotAssignment[],
): number {
  return roomShareAssignmentGroups(assignments).reduce((total, group) => {
    if (group.assignments.length < 2) return total;
    const sharedPeriods = sharedRoomBlockDurations(group.assignments).reduce(
      (sum, duration) => sum + duration,
      0,
    );
    return total + sharedPeriods * (group.assignments.length - 1);
  }, 0);
}
