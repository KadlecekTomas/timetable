from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"marker not found in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


# Web contract and local persisted model.
replace_once(
    "apps/web/lib/domain/contracts.ts",
    "  parallel_key?: string | null;\n  rotation_key?: string | null;",
    "  parallel_key?: string | null;\n  room_share_key?: string | null;\n  rotation_key?: string | null;",
)
replace_once(
    "apps/web/lib/local/api.ts",
    "  parallelKey: string | null;\n  rotationKey: string | null;",
    "  parallelKey: string | null;\n  roomShareKey?: string | null;\n  rotationKey: string | null;",
)
replace_once(
    "apps/web/lib/local/api.ts",
    "      parallelKey: assignment.parallelKey ?? null,\n      rotationKey: assignment.rotationKey ?? null,",
    "      parallelKey: assignment.parallelKey ?? null,\n      roomShareKey: assignment.roomShareKey ?? null,\n      rotationKey: assignment.rotationKey ?? null,",
)
replace_once(
    "apps/web/lib/local/api.ts",
    "      parallel_key: assignment.parallelKey,\n      rotation_key: assignment.rotationKey,",
    "      parallel_key: assignment.parallelKey,\n      room_share_key: assignment.roomShareKey ?? null,\n      rotation_key: assignment.rotationKey,",
)
replace_once(
    "apps/web/lib/local/api.ts",
    "        parallelKey: stringField(body, \"parallelKey\") || null,\n        rotationKey: stringField(body, \"rotationKey\") || null,",
    "        parallelKey: stringField(body, \"parallelKey\") || null,\n        roomShareKey: stringField(body, \"roomShareKey\") || null,\n        rotationKey: stringField(body, \"rotationKey\") || null,",
)

Path("apps/web/lib/domain/room-sharing.ts").write_text(
    '''import {
  assignmentBlockDurations,
  type SnapshotAssignment,
} from "./contracts";

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
      assignments: [...items].sort((left, right) => left.id.localeCompare(right.id)),
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
    if (duration == null || durations.some((items) => items[index] !== duration)) {
      break;
    }
    shared.push(duration);
  }
  return shared;
}

export function roomShareBlockPairKey(leftBlockId: string, rightBlockId: string): string {
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
'''
)

# Mark the current-school 8.B and 9.B TV groups as co-teaching room shares.
replace_once(
    "apps/web/lib/local/school-project-generation.ts",
    "      parallelKey,\n      rotationKey,",
    "      parallelKey,\n      roomShareKey: null,\n      rotationKey,",
)
replace_once(
    "apps/web/lib/local/school-project-generation.ts",
    "export function buildSchoolProjectForGeneration({",
    '''function applySharedSportsClassRooms(
  assignments: LocalAssignment[],
  subjectIdByCode: Map<string, string>,
  warnings: string[],
): void {
  const physicalEducationSubjectId = subjectIdByCode.get(
    PHYSICAL_EDUCATION_SUBJECT_CODE,
  );
  if (!physicalEducationSubjectId) return;

  const sharedGroups = ["GROUP_1", "GROUP_2"] as const;
  let paired = 0;
  for (const group of sharedGroups) {
    const eighth = assignments.find(
      (assignment) =>
        assignment.subjectId === physicalEducationSubjectId &&
        assignment.classId === "class:8-B" &&
        assignment.group === group,
    );
    const ninth = assignments.find(
      (assignment) =>
        assignment.subjectId === physicalEducationSubjectId &&
        assignment.classId === "class:9-B" &&
        assignment.group === group,
    );
    if (!eighth || !ninth) continue;
    const roomShareKey = `school:tv:8-b:9-b:${group.toLowerCase()}`;
    eighth.roomShareKey = roomShareKey;
    ninth.roomShareKey = roomShareKey;
    paired += 1;
  }

  if (paired === 2) {
    warnings.push(
      "8.B + 9.B: čtyři společné hodiny TV jsou naplánované jako co-teaching ve dvou sdílených sportovních prostorech; pátá hodina 8.B zůstává samostatně.",
    );
  } else if (paired > 0) {
    warnings.push(
      "8.B + 9.B: podařilo se propojit jen část společné TV. Zkontrolujte rozdělení skupin obou tříd.",
    );
  }
}

export function buildSchoolProjectForGeneration({''',
)
replace_once(
    "apps/web/lib/local/school-project-generation.ts",
    "  for (const teacher of staffingPlan.teachers) {\n    const assigned = teachingPlan.rows.reduce(",
    "  applySharedSportsClassRooms(assignments, subjectIdByCode, warnings);\n\n  for (const teacher of staffingPlan.teachers) {\n    const assigned = teachingPlan.rows.reduce(",
)

# Capacity preflight understands that a room-share pair consumes one room, not two.
replace_once(
    "apps/web/lib/domain/readiness.ts",
    '''import type {
  CanonicalSnapshot,
  ReadinessIssue,
  ReadinessReport,
  SnapshotAssignment,
} from "./contracts";''',
    '''import type {
  CanonicalSnapshot,
  ReadinessIssue,
  ReadinessReport,
  SnapshotAssignment,
} from "./contracts";
import {
  roomShareAssignmentGroups,
  sharedRoomBlockDurations,
  sharedRoomPeriodDiscount,
} from "./room-sharing";''',
)
replace_once(
    "apps/web/lib/domain/readiness.ts",
    "  const peSubjectIds = new Set(\n",
    '''  for (const group of roomShareAssignmentGroups(snapshot.assignments)) {
    if (group.assignments.length !== 2) {
      add(
        issue(
          "ROOM_SHARE_GROUP_INVALID",
          "ERROR",
          `Sdílený prostor ${group.key} musí spojovat právě dvě výukové vazby.`,
          group.assignments.map((assignment) => assignment.id),
        ),
      );
      continue;
    }
    if (sharedRoomBlockDurations(group.assignments).length === 0) {
      add(
        issue(
          "ROOM_SHARE_SHAPE_MISMATCH",
          "ERROR",
          `Sdílený prostor ${group.key} nemá žádný společný kompatibilní blok.`,
          group.assignments.map((assignment) => assignment.id),
        ),
      );
    }
  }

  const peSubjectIds = new Set(
''',
)
replace_once(
    "apps/web/lib/domain/readiness.ts",
    '''    const requiredPeRoomPeriods = peAssignments.reduce(
      (total, assignment) => total + assignment.weekly_periods,
      0,
    );''',
    '''    const requiredPeRoomPeriods =
      peAssignments.reduce(
        (total, assignment) => total + assignment.weekly_periods,
        0,
      ) - sharedRoomPeriodDiscount(peAssignments);''',
)

# Browser-side validator permits only declared co-teaching room collisions and checks sync.
replace_once(
    "apps/web/lib/domain/validation.ts",
    '''import {
  classRequiredWeeklyPeriods,
  lessonClassIds,
  parallelAssignmentGroups,
} from "./class-groups";''',
    '''import {
  classRequiredWeeklyPeriods,
  lessonClassIds,
  parallelAssignmentGroups,
} from "./class-groups";
import {
  roomShareAssignmentGroups,
  roomShareBlockPairKey,
  sharedRoomBlockDurations,
  sharedRoomBlockPairs,
} from "./room-sharing";''',
)
replace_once(
    "apps/web/lib/domain/validation.ts",
    '''  const assignments = new Map(
    snapshot.assignments.map((assignment) => [assignment.id, assignment]),
  );''',
    '''  const assignments = new Map(
    snapshot.assignments.map((assignment) => [assignment.id, assignment]),
  );
  const sharedRoomPairs = sharedRoomBlockPairs(snapshot.assignments);''',
)
replace_once(
    "apps/web/lib/domain/validation.ts",
    '''        if (roomConflict) {
          pushIssue(
            issues,
            "ROOM_COLLISION",
            `Učebna ${lesson.room_id} je současně použita bloky ${roomConflict.block_id} a ${lesson.block_id}.`,
            [lesson.room_id, roomConflict.block_id, lesson.block_id],
            lesson.day,
            period,
          );
        } else {
          roomSlots.set(roomKey, lesson);
        }''',
    '''        if (
          roomConflict &&
          !sharedRoomPairs.has(
            roomShareBlockPairKey(roomConflict.block_id, lesson.block_id),
          )
        ) {
          pushIssue(
            issues,
            "ROOM_COLLISION",
            `Učebna ${lesson.room_id} je současně použita bloky ${roomConflict.block_id} a ${lesson.block_id}.`,
            [lesson.room_id, roomConflict.block_id, lesson.block_id],
            lesson.day,
            period,
          );
        } else if (!roomConflict) {
          roomSlots.set(roomKey, lesson);
        }''',
)
replace_once(
    "apps/web/lib/domain/validation.ts",
    '''  for (const group of parallelAssignmentGroups(snapshot.assignments)) {
''',
    '''  for (const group of roomShareAssignmentGroups(snapshot.assignments)) {
    if (group.assignments.length !== 2) continue;
    const sharedDurations = sharedRoomBlockDurations(group.assignments);
    const [leftAssignment, rightAssignment] = group.assignments;
    for (let index = 0; index < sharedDurations.length; index += 1) {
      const left = (lessonsByAssignment.get(leftAssignment!.id) ?? []).find(
        (lesson) => lesson.block_id === `${leftAssignment!.id}:${index}`,
      );
      const right = (lessonsByAssignment.get(rightAssignment!.id) ?? []).find(
        (lesson) => lesson.block_id === `${rightAssignment!.id}:${index}`,
      );
      if (!left || !right) continue;
      if (
        left.day !== right.day ||
        left.period !== right.period ||
        left.duration !== right.duration ||
        left.room_id !== right.room_id
      ) {
        pushIssue(
          issues,
          "ROOM_SHARE_DESYNCHRONIZED",
          "Co-teaching ve sdíleném prostoru musí probíhat současně a ve stejné místnosti.",
          [left.block_id, right.block_id],
          left.day,
          left.period,
        );
      }
    }
  }

  for (const group of parallelAssignmentGroups(snapshot.assignments)) {
''',
)

# Solver contract and shared-room helpers.
replace_once(
    "apps/solver/app/models.py",
    "    parallel_key: str | None = None\n    rotation_key: str | None = None",
    "    parallel_key: str | None = None\n    room_share_key: str | None = None\n    rotation_key: str | None = None",
)
replace_once(
    "apps/solver/app/models.py",
    '''        rotations: dict[str, list[Assignment]] = {}
        for assignment in self.assignments:
            if assignment.rotation_key:
                rotations.setdefault(assignment.rotation_key, []).append(assignment)
''',
    '''        room_shares: dict[str, list[Assignment]] = {}
        for assignment in self.assignments:
            if assignment.room_share_key:
                room_shares.setdefault(assignment.room_share_key, []).append(assignment)
        for room_share_key, assignments in room_shares.items():
            if len(assignments) != 2:
                raise ValueError(
                    f"Room share {room_share_key} must contain exactly two assignments"
                )
            if len({assignment.subject_id for assignment in assignments}) != 1:
                raise ValueError(
                    f"Room share {room_share_key} must contain the same subject"
                )
            room_requirements = {
                (assignment.required_room_id, assignment.required_room_type_id)
                for assignment in assignments
            }
            if len(room_requirements) != 1 or room_requirements == {(None, None)}:
                raise ValueError(
                    f"Room share {room_share_key} must use the same required room or room type"
                )
            durations = [assignment.block_durations() for assignment in assignments]
            shared_blocks = 0
            for index in range(min(len(items) for items in durations)):
                if len({items[index] for items in durations}) != 1:
                    break
                shared_blocks += 1
            if shared_blocks == 0:
                raise ValueError(
                    f"Room share {room_share_key} has no compatible shared block"
                )

        rotations: dict[str, list[Assignment]] = {}
        for assignment in self.assignments:
            if assignment.rotation_key:
                rotations.setdefault(assignment.rotation_key, []).append(assignment)
''',
)
Path("apps/solver/app/room_sharing.py").write_text(
    '''from collections import defaultdict

from app.models import Assignment


def room_share_assignment_groups(
    assignments: list[Assignment],
) -> list[tuple[str, list[Assignment]]]:
    grouped: dict[str, list[Assignment]] = defaultdict(list)
    for assignment in assignments:
        if assignment.room_share_key:
            grouped[assignment.room_share_key].append(assignment)
    return [
        (key, sorted(items, key=lambda item: item.id))
        for key, items in sorted(grouped.items())
    ]


def shared_room_block_durations(assignments: list[Assignment]) -> list[int]:
    if len(assignments) < 2:
        return []
    durations = [assignment.block_durations() for assignment in assignments]
    shared: list[int] = []
    for index in range(min(len(items) for items in durations)):
        duration = durations[0][index]
        if any(items[index] != duration for items in durations[1:]):
            break
        shared.append(duration)
    return shared


def room_share_block_pairs(assignments: list[Assignment]) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for _key, group in room_share_assignment_groups(assignments):
        if len(group) < 2:
            continue
        shared = shared_room_block_durations(group)
        leader = group[0]
        for follower in group[1:]:
            for index in range(len(shared)):
                pairs.append((f"{leader.id}:{index}", f"{follower.id}:{index}"))
    return pairs


def room_share_block_pair_key(left_block_id: str, right_block_id: str) -> tuple[str, str]:
    return tuple(sorted((left_block_id, right_block_id)))
'''
)

# Solver placement: followers reuse the leader room and are synchronized by day/period/room.
replace_once(
    "apps/solver/app/main.py",
    "from app.rotations import add_rotation_constraints\nfrom app.school_day import crosses_lunch_break",
    '''from app.room_sharing import (
    room_share_block_pair_key,
    room_share_block_pairs,
)
from app.rotations import add_rotation_constraints
from app.school_day import crosses_lunch_break''',
)
replace_once(
    "apps/solver/app/main.py",
    '''    for teacher_id in sorted({item.teacher_id for item in payload.assignments}):
''',
    '''    blocks_by_id = {block.id: block for block in blocks}
    for left_block_id, right_block_id in room_share_block_pairs(payload.assignments):
        left_block = blocks_by_id[left_block_id]
        right_block = blocks_by_id[right_block_id]
        left_candidates = set(
            _candidate_keys(payload, left_block, fixed.get(left_block_id))
        )
        right_candidates = set(
            _candidate_keys(payload, right_block, fixed.get(right_block_id))
        )
        if not left_candidates.intersection(right_candidates):
            diagnostics.append(
                {
                    "code": "ROOM_SHARE_EMPTY_INTERSECTION",
                    "message": (
                        f"Sdílené bloky {left_block_id} a {right_block_id} nemají společné umístění a místnost."
                    ),
                    "entityIds": [left_block.assignment.id, right_block.assignment.id],
                }
            )

    for teacher_id in sorted({item.teacher_id for item in payload.assignments}):
''',
)
replace_once(
    "apps/solver/app/main.py",
    '''    assignments = {assignment.id: assignment for assignment in payload.assignments}
    fixed_items = [*payload.fixed_lessons, *payload.locked_lessons]
    diagnostics: list[dict[str, Any]] = []
''',
    '''    assignments = {assignment.id: assignment for assignment in payload.assignments}
    fixed_items = [*payload.fixed_lessons, *payload.locked_lessons]
    diagnostics: list[dict[str, Any]] = []
    shared_room_pairs = {
        room_share_block_pair_key(left, right)
        for left, right in room_share_block_pairs(payload.assignments)
    }
''',
)
replace_once(
    "apps/solver/app/main.py",
    '''            shares_resource = (
                left_assignment.teacher_id == right_assignment.teacher_id
                or class_conflict
                or (left.room_id is not None and right.room_id is not None and left.room_id == right.room_id)
            )''',
    '''            left_block_id = f"{left.assignment_id}:{left.block_index}"
            right_block_id = f"{right.assignment_id}:{right.block_index}"
            is_shared_room_pair = (
                room_share_block_pair_key(left_block_id, right_block_id)
                in shared_room_pairs
            )
            same_room_conflict = (
                left.room_id is not None
                and right.room_id is not None
                and left.room_id == right.room_id
                and not is_shared_room_pair
            )
            shares_resource = (
                left_assignment.teacher_id == right_assignment.teacher_id
                or class_conflict
                or same_room_conflict
            )''',
)
replace_once(
    "apps/solver/app/main.py",
    '''    model = cp_model.CpModel()
    variables: dict[str, list[tuple[CandidateKey, cp_model.IntVar]]] = {}
''',
    '''    model = cp_model.CpModel()
    variables: dict[str, list[tuple[CandidateKey, cp_model.IntVar]]] = {}
    room_share_pairs = room_share_block_pairs(payload.assignments)
    shared_room_follower_blocks = {right for _left, right in room_share_pairs}
''',
)
replace_once(
    "apps/solver/app/main.py",
    '''                if candidate.room_id:
                    room_slots[(candidate.room_id, candidate.day, period)].append(variable)
''',
    '''                if candidate.room_id and block.id not in shared_room_follower_blocks:
                    room_slots[(candidate.room_id, candidate.day, period)].append(variable)
''',
)
replace_once(
    "apps/solver/app/main.py",
    '''    rotation_diagnostics = add_rotation_constraints(
''',
    '''    for left_block_id, right_block_id in room_share_pairs:
        positions = {
            (candidate.day, candidate.period, candidate.room_id)
            for block_id in (left_block_id, right_block_id)
            for candidate, _variable in variables[block_id]
        }
        for day, period, room_id in positions:
            left_at_position = [
                variable
                for candidate, variable in variables[left_block_id]
                if (
                    candidate.day == day
                    and candidate.period == period
                    and candidate.room_id == room_id
                )
            ]
            right_at_position = [
                variable
                for candidate, variable in variables[right_block_id]
                if (
                    candidate.day == day
                    and candidate.period == period
                    and candidate.room_id == room_id
                )
            ]
            model.add(sum(left_at_position) == sum(right_at_position))

    rotation_diagnostics = add_rotation_constraints(
''',
)

# Solver validator mirrors the allowed shared room collision and synchronization.
replace_once(
    "apps/solver/app/validator.py",
    "from app.rotations import validate_rotation_schedule\nfrom app.school_day import crosses_lunch_break",
    '''from app.room_sharing import (
    room_share_assignment_groups,
    room_share_block_pair_key,
    room_share_block_pairs,
    shared_room_block_durations,
)
from app.rotations import validate_rotation_schedule
from app.school_day import crosses_lunch_break''',
)
replace_once(
    "apps/solver/app/validator.py",
    '''    assignments = {assignment.id: assignment for assignment in payload.assignments}
    rooms = {room.id: room for room in payload.rooms}
''',
    '''    assignments = {assignment.id: assignment for assignment in payload.assignments}
    shared_room_pairs = {
        room_share_block_pair_key(left, right)
        for left, right in room_share_block_pairs(payload.assignments)
    }
    rooms = {room.id: room for room in payload.rooms}
''',
)
replace_once(
    "apps/solver/app/validator.py",
    '''                if conflicting_room_lesson:
                    issues.append(
                        ValidationIssue(
                            code="ROOM_COLLISION",
                            message=(
                                f"Učebna {lesson.room_id} je současně použita bloky {conflicting_room_lesson.block_id} a {lesson.block_id}."
                            ),
                            entity_ids=[
                                lesson.room_id,
                                conflicting_room_lesson.block_id,
                                lesson.block_id,
                            ],
                            day=lesson.day,
                            period=period,
                        )
                    )
                else:
                    room_slots[room_key] = lesson
''',
    '''                if (
                    conflicting_room_lesson
                    and room_share_block_pair_key(
                        conflicting_room_lesson.block_id, lesson.block_id
                    )
                    not in shared_room_pairs
                ):
                    issues.append(
                        ValidationIssue(
                            code="ROOM_COLLISION",
                            message=(
                                f"Učebna {lesson.room_id} je současně použita bloky {conflicting_room_lesson.block_id} a {lesson.block_id}."
                            ),
                            entity_ids=[
                                lesson.room_id,
                                conflicting_room_lesson.block_id,
                                lesson.block_id,
                            ],
                            day=lesson.day,
                            period=period,
                        )
                    )
                elif conflicting_room_lesson is None:
                    room_slots[room_key] = lesson
''',
)
replace_once(
    "apps/solver/app/validator.py",
    '''    for parallel_group in parallel_assignment_groups(payload.assignments):
''',
    '''    for _key, group in room_share_assignment_groups(payload.assignments):
        if len(group) != 2:
            continue
        shared_durations = shared_room_block_durations(group)
        left_assignment, right_assignment = group
        for index in range(len(shared_durations)):
            left = next(
                (
                    lesson
                    for lesson in lessons_by_assignment[left_assignment.id]
                    if lesson.block_id == f"{left_assignment.id}:{index}"
                ),
                None,
            )
            right = next(
                (
                    lesson
                    for lesson in lessons_by_assignment[right_assignment.id]
                    if lesson.block_id == f"{right_assignment.id}:{index}"
                ),
                None,
            )
            if left is None or right is None:
                continue
            if (
                left.day != right.day
                or left.period != right.period
                or left.duration != right.duration
                or left.room_id != right.room_id
            ):
                issues.append(
                    ValidationIssue(
                        code="ROOM_SHARE_DESYNCHRONIZED",
                        message=(
                            "Co-teaching ve sdíleném prostoru musí probíhat současně a ve stejné místnosti."
                        ),
                        entity_ids=[left.block_id, right.block_id],
                        day=left.day,
                        period=left.period,
                    )
                )

    for parallel_group in parallel_assignment_groups(payload.assignments):
''',
)

# Web regression tests: capacity, generated school rule, and validator semantics.
Path("apps/web/tests/room-sharing.test.ts").write_text(
    '''import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalSnapshot, ScheduledLesson } from "../lib/domain/contracts";
import { evaluateReadiness } from "../lib/domain/readiness";
import { validateSchedule } from "../lib/domain/validation";

function sharedPeSnapshot(): CanonicalSnapshot {
  const teachers = ["8b-g1", "8b-g2", "8b-g3", "9b-g1", "9b-g2"].map(
    (id) => ({
      id: `teacher:${id}`,
      code: id,
      first_name: "Test",
      last_name: id,
      target_weekly_load: id.startsWith("8b") ? 5 : 4,
      max_weekly_load: id.startsWith("8b") ? 5 : 4,
    }),
  );
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
    lesson_shape: weeklyPeriods === 5 ? ("MIXED" as const) : ("DOUBLE" as const),
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
      { id: "class:8-B", code: "8.B", name: "8.B", grade: 8, profile: "SPORTS" },
      { id: "class:9-B", code: "9.B", name: "9.B", grade: 9, profile: "SPORTS" },
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
      assignment("8b-g1", "class:8-B", "teacher:8b-g1", "GROUP_1", 5, "share:g1"),
      assignment("8b-g2", "class:8-B", "teacher:8b-g2", "GROUP_2", 5, "share:g2"),
      assignment("8b-g3", "class:8-B", "teacher:8b-g3", "GROUP_3", 5, null),
      assignment("9b-g1", "class:9-B", "teacher:9b-g1", "GROUP_1", 4, "share:g1"),
      assignment("9b-g2", "class:9-B", "teacher:9b-g2", "GROUP_2", 4, "share:g2"),
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
  snapshot.assignments = snapshot.assignments.filter((assignment) =>
    ["8b-g1", "9b-g1"].includes(assignment.id),
  );
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
    validateSchedule(snapshot, lessons).some((issue) => issue.code === "ROOM_COLLISION"),
  );
});
'''
)

# Add a generation-level test that the school-specific pair keys are emitted.
path = Path("apps/web/tests/school-project-generation.test.ts")
text = path.read_text()
text += r'''

test("8.B and 9.B physical education groups share rooms for their four common hours", () => {
  const staffingPlan: StaffingPlan = {
    version: 1,
    updatedAt: "test",
    teachers: [
      teacher("8b-one", "TV", 5),
      teacher("8b-two", "TV", 5),
      teacher("8b-three", "TV", 5),
      teacher("9b-one", "TV", 4),
      teacher("9b-two", "TV", 4),
    ],
  };
  const teachingPlan: TeachingPlan = {
    version: 1,
    updatedAt: "test",
    classes: [
      { id: "8b", code: "8.B", grade: 8, profile: "SPORTS" },
      { id: "9b", code: "9.B", grade: 9, profile: "SPORTS" },
    ],
    rows: [
      row({
        id: "tv-8b",
        classCode: "8.B",
        subjectCode: "TV",
        weeklyPeriods: 5,
        lessonShape: "MIXED",
        doublePeriodsCount: 2,
        organization: "SPLIT",
        primaryTeacherId: "8b-one",
        secondaryTeacherId: "8b-two",
        tertiaryTeacherId: "8b-three",
        splitGroupCount: 3,
      }),
      row({
        id: "tv-9b",
        classCode: "9.B",
        subjectCode: "TV",
        weeklyPeriods: 4,
        lessonShape: "DOUBLE",
        doublePeriodsCount: 2,
        organization: "SPLIT",
        primaryTeacherId: "9b-one",
        secondaryTeacherId: "9b-two",
        splitGroupCount: 2,
      }),
    ],
  };

  const result = buildSchoolProjectForGeneration({
    existingProject: project(),
    staffingPlan,
    teachingPlan,
    forceReplaceGeneratedData: false,
  });
  assert.deepEqual(result.blockers, []);

  const tv8b = result.project.assignments.filter(
    (assignment) => assignment.classId === "class:8-B",
  );
  const tv9b = result.project.assignments.filter(
    (assignment) => assignment.classId === "class:9-B",
  );
  assert.equal(tv8b.length, 3);
  assert.equal(tv9b.length, 2);
  assert.equal(tv8b.find((item) => item.group === "GROUP_1")?.roomShareKey, tv9b.find((item) => item.group === "GROUP_1")?.roomShareKey);
  assert.equal(tv8b.find((item) => item.group === "GROUP_2")?.roomShareKey, tv9b.find((item) => item.group === "GROUP_2")?.roomShareKey);
  assert.equal(tv8b.find((item) => item.group === "GROUP_3")?.roomShareKey ?? null, null);
  assert.ok(result.warnings.some((warning) => warning.includes("čtyři společné hodiny TV")));
});
'''
path.write_text(text)

# Solver integration: one physical room can host two declared co-teachers, but only when synchronized.
Path("apps/solver/tests/test_room_sharing.py").write_text(
    '''from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def payload(shared: bool) -> dict:
    return {
        "periods_per_day": [2],
        "classes": [
            {"id": "class-8b", "code": "8.B", "profile": "SPORTS"},
            {"id": "class-9b", "code": "9.B", "profile": "SPORTS"},
        ],
        "subjects": [{"id": "tv", "code": "TV"}],
        "rooms": [{"id": "gym", "room_type_id": "gym"}],
        "assignments": [
            {
                "id": "tv-8b",
                "teacher_id": "teacher-8b",
                "class_id": "class-8b",
                "subject_id": "tv",
                "group": "GROUP_1",
                "weekly_periods": 2,
                "lesson_shape": "DOUBLE",
                "double_periods_count": 1,
                "required_room_type_id": "gym",
                "room_share_key": "shared-tv" if shared else None,
            },
            {
                "id": "tv-9b",
                "teacher_id": "teacher-9b",
                "class_id": "class-9b",
                "subject_id": "tv",
                "group": "GROUP_1",
                "weekly_periods": 2,
                "lesson_shape": "DOUBLE",
                "double_periods_count": 1,
                "required_room_type_id": "gym",
                "room_share_key": "shared-tv" if shared else None,
            },
        ],
        "time_limit_seconds": 5,
    }


def test_declared_co_teachers_share_the_same_room_and_time() -> None:
    response = client.post("/solve", json=payload(True))
    assert response.status_code == 200, response.text
    lessons = response.json()["lessons"]
    assert len(lessons) == 2
    assert {(lesson["day"], lesson["period"], lesson["room_id"]) for lesson in lessons} == {
        (0, 0, "gym")
    }
    assert response.json()["score"]["valid"] is True


def test_same_single_room_is_infeasible_without_room_share() -> None:
    response = client.post("/solve", json=payload(False))
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "INFEASIBLE"
'''
)
