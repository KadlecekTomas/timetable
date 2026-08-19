import {
  assignmentBlockDurations,
  type CanonicalSnapshot,
  type MoveValidationResult,
  type ScheduledLesson,
  type TeachingGroup,
  type TimetableMove,
  type ValidationIssue,
} from "./contracts";
import {
  classRequiredWeeklyPeriods,
  lessonClassIds,
  parallelAssignmentGroups,
} from "./class-groups";
import {
  roomShareAssignmentGroups,
  roomShareBlockPairKey,
  sharedRoomBlockDurations,
  sharedRoomBlockPairs,
} from "./room-sharing";
import {
  crossesLunchBreak,
  MIN_LUNCH_BREAK_MINUTES,
  MORNING_PERIOD_LIMIT,
} from "./school-day";
import { validateRotationSchedule } from "./rotation-validation";

function groupsConflict(left: TeachingGroup, right: TeachingGroup): boolean {
  return left === "WHOLE" || right === "WHOLE" || left === right;
}

function fixedLessonsByBlock(snapshot: CanonicalSnapshot) {
  return new Map(
    [...snapshot.fixed_lessons, ...snapshot.locked_lessons].map((item) => [
      `${item.assignment_id}:${item.block_index}`,
      item,
    ]),
  );
}

function pushIssue(
  issues: ValidationIssue[],
  code: string,
  message: string,
  entityIds: string[],
  day?: number,
  period?: number,
  details?: Record<string, unknown>,
) {
  issues.push({ code, message, entity_ids: entityIds, day, period, details });
}

export function validateSchedule(
  snapshot: CanonicalSnapshot,
  lessons: ScheduledLesson[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const assignments = new Map(
    snapshot.assignments.map((assignment) => [assignment.id, assignment]),
  );
  const sharedRoomPairs = sharedRoomBlockPairs(snapshot.assignments);
  const rooms = new Map(snapshot.rooms.map((room) => [room.id, room]));
  const fixed = fixedLessonsByBlock(snapshot);
  const expectedBlocks = new Map<
    string,
    { assignmentId: string; duration: number }
  >();

  for (const assignment of snapshot.assignments) {
    assignmentBlockDurations(assignment).forEach((duration, index) => {
      expectedBlocks.set(`${assignment.id}:${index}`, {
        assignmentId: assignment.id,
        duration,
      });
    });
  }

  const seen = new Set<string>();
  for (const lesson of lessons) {
    if (seen.has(lesson.block_id)) {
      pushIssue(
        issues,
        "DUPLICATE_BLOCK",
        `Výukový blok ${lesson.block_id} je ve výsledku vícekrát.`,
        [lesson.block_id],
      );
      continue;
    }
    seen.add(lesson.block_id);

    const expected = expectedBlocks.get(lesson.block_id);
    const assignment = assignments.get(lesson.assignment_id);
    if (!expected || !assignment) {
      pushIssue(
        issues,
        "UNKNOWN_BLOCK",
        `Výsledek obsahuje neznámý blok ${lesson.block_id}.`,
        [lesson.block_id],
      );
      continue;
    }

    if (
      expected.assignmentId !== lesson.assignment_id ||
      expected.duration !== lesson.duration
    ) {
      pushIssue(
        issues,
        "BLOCK_CONTRACT_MISMATCH",
        `Blok ${lesson.block_id} neodpovídá vstupní vazbě.`,
        [lesson.block_id, lesson.assignment_id],
      );
    }

    if (
      lesson.teacher_id !== assignment.teacher_id ||
      lesson.class_id !== assignment.class_id ||
      JSON.stringify(lesson.additional_class_ids ?? []) !==
        JSON.stringify(assignment.additional_class_ids ?? []) ||
      lesson.subject_id !== assignment.subject_id ||
      lesson.group !== assignment.group
    ) {
      pushIssue(
        issues,
        "ASSIGNMENT_DATA_MISMATCH",
        `Blok ${lesson.block_id} změnil učitele, třídu, předmět nebo skupinu.`,
        [lesson.block_id, assignment.id],
      );
    }

    const periods = snapshot.periods_per_day[lesson.day];
    if (periods == null) {
      pushIssue(
        issues,
        "DAY_OUT_OF_RANGE",
        `Blok ${lesson.block_id} leží mimo pracovní týden.`,
        [lesson.block_id],
        lesson.day,
      );
      continue;
    }
    if (lesson.period < 0 || lesson.period + lesson.duration > periods) {
      pushIssue(
        issues,
        "PERIOD_OUT_OF_RANGE",
        `Blok ${lesson.block_id} se nevejde do rozsahu dne.`,
        [lesson.block_id],
        lesson.day,
        lesson.period,
      );
      continue;
    }

    if (crossesLunchBreak(lesson.period, lesson.duration)) {
      pushIssue(
        issues,
        "LUNCH_BREAK_CROSSED",
        `Blok ${lesson.block_id} nesmí spojit dopolední a odpolední vyučování přes obědovou přestávku.`,
        [lesson.block_id, lesson.class_id],
        lesson.day,
        lesson.period,
        {
          morningPeriodLimit: MORNING_PERIOD_LIMIT,
          minimumLunchBreakMinutes: MIN_LUNCH_BREAK_MINUTES,
        },
      );
      continue;
    }

    if (
      assignment.required_room_id &&
      lesson.room_id !== assignment.required_room_id
    ) {
      pushIssue(
        issues,
        "REQUIRED_ROOM_MISMATCH",
        `Blok ${lesson.block_id} není v povinné učebně.`,
        [lesson.block_id, assignment.required_room_id],
        lesson.day,
        lesson.period,
      );
    }
    if (assignment.required_room_type_id) {
      const room = lesson.room_id ? rooms.get(lesson.room_id) : undefined;
      if (!room || room.room_type_id !== assignment.required_room_type_id) {
        pushIssue(
          issues,
          "REQUIRED_ROOM_TYPE_MISMATCH",
          `Blok ${lesson.block_id} není v učebně požadovaného typu.`,
          [lesson.block_id, assignment.required_room_type_id],
          lesson.day,
          lesson.period,
        );
      }
    }

    const fixedLesson = fixed.get(lesson.block_id);
    if (
      fixedLesson &&
      (lesson.day !== fixedLesson.day ||
        lesson.period !== fixedLesson.period ||
        (fixedLesson.room_id != null && lesson.room_id !== fixedLesson.room_id))
    ) {
      pushIssue(
        issues,
        "FIXED_LESSON_MOVED",
        `Pevný nebo zamčený blok ${lesson.block_id} změnil své umístění.`,
        [lesson.block_id],
        lesson.day,
        lesson.period,
      );
    }
  }

  for (const blockId of [...expectedBlocks.keys()]
    .filter((blockId) => !seen.has(blockId))
    .sort()) {
    pushIssue(
      issues,
      "MISSING_BLOCK",
      `Výukový blok ${blockId} ve výsledku chybí.`,
      [blockId],
    );
  }

  const unavailable = new Set(
    snapshot.availability
      .filter((rule) => rule.kind === "UNAVAILABLE")
      .map(
        (rule) =>
          `${rule.entity_type}:${rule.entity_id}:${rule.day}:${rule.period}`,
      ),
  );
  const teacherSlots = new Map<string, ScheduledLesson>();
  const roomSlots = new Map<string, ScheduledLesson>();
  const classSlots = new Map<string, ScheduledLesson[]>();

  for (const lesson of lessons) {
    const periods = snapshot.periods_per_day[lesson.day];
    if (periods == null) continue;
    for (
      let period = lesson.period;
      period < lesson.period + lesson.duration;
      period += 1
    ) {
      if (period < 0 || period >= periods) continue;
      const unavailableEntities: Array<["TEACHER" | "CLASS" | "ROOM", string]> =
        [
          ["TEACHER", lesson.teacher_id],
          ...lessonClassIds(lesson).map(
            (classId) => ["CLASS", classId] as ["CLASS", string],
          ),
        ];
      if (lesson.room_id) unavailableEntities.push(["ROOM", lesson.room_id]);
      for (const [entityType, entityId] of unavailableEntities) {
        if (
          unavailable.has(`${entityType}:${entityId}:${lesson.day}:${period}`)
        ) {
          pushIssue(
            issues,
            "UNAVAILABLE_SLOT",
            `Blok ${lesson.block_id} zasahuje do nedostupného slotu.`,
            [lesson.block_id, entityId],
            lesson.day,
            period,
          );
        }
      }

      const teacherKey = `${lesson.teacher_id}:${lesson.day}:${period}`;
      const teacherConflict = teacherSlots.get(teacherKey);
      if (teacherConflict) {
        pushIssue(
          issues,
          "TEACHER_COLLISION",
          `Učitel ${lesson.teacher_id} má současně bloky ${teacherConflict.block_id} a ${lesson.block_id}.`,
          [lesson.teacher_id, teacherConflict.block_id, lesson.block_id],
          lesson.day,
          period,
        );
      } else {
        teacherSlots.set(teacherKey, lesson);
      }

      if (lesson.room_id) {
        const roomKey = `${lesson.room_id}:${lesson.day}:${period}`;
        const roomConflict = roomSlots.get(roomKey);
        if (
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
        }
      }

      for (const classId of lessonClassIds(lesson)) {
        const classKey = `${classId}:${lesson.day}:${period}`;
        const existingLessons = classSlots.get(classKey) ?? [];
        for (const existing of existingLessons) {
          if (groupsConflict(existing.group, lesson.group)) {
            pushIssue(
              issues,
              "CLASS_COLLISION",
              `Třída ${classId} má současně bloky ${existing.block_id} a ${lesson.block_id}.`,
              [classId, existing.block_id, lesson.block_id],
              lesson.day,
              period,
            );
          }
        }
        classSlots.set(classKey, [...existingLessons, lesson]);
      }
    }
  }

  const requiredPeriodsByClass = classRequiredWeeklyPeriods(
    snapshot.assignments,
  );
  if (snapshot.periods_per_day.length >= 5) {
    for (const [classId, weeklyPeriods] of requiredPeriodsByClass) {
      if (weeklyPeriods < snapshot.periods_per_day.length) continue;
      snapshot.periods_per_day.forEach((periods, day) => {
        if (periods <= 0 || classSlots.has(`${classId}:${day}:0`)) return;
        pushIssue(
          issues,
          "CLASS_DOES_NOT_START_AT_EIGHT",
          `Třída ${classId} musí každý vyučovací den začínat první hodinou v 8:00.`,
          [classId],
          day,
          0,
          { requiredStartTime: "8:00" },
        );
      });
    }
  }

  const lessonsByAssignment = new Map<string, ScheduledLesson[]>();
  for (const lesson of lessons) {
    lessonsByAssignment.set(lesson.assignment_id, [
      ...(lessonsByAssignment.get(lesson.assignment_id) ?? []),
      lesson,
    ]);
  }
  for (const group of roomShareAssignmentGroups(snapshot.assignments)) {
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
    const lessonGroups = group.map((assignment) =>
      [...(lessonsByAssignment.get(assignment.id) ?? [])].sort((a, b) =>
        a.block_id.localeCompare(b.block_id),
      ),
    );
    const expectedLength = lessonGroups[0]?.length ?? 0;
    if (lessonGroups.some((items) => items.length !== expectedLength)) continue;
    for (let index = 0; index < expectedLength; index += 1) {
      const reference = lessonGroups[0]![index]!;
      for (const candidateGroup of lessonGroups.slice(1)) {
        const candidate = candidateGroup[index]!;
        if (
          reference.day !== candidate.day ||
          reference.period !== candidate.period ||
          reference.duration !== candidate.duration
        ) {
          pushIssue(
            issues,
            "PARALLEL_GROUP_DESYNCHRONIZED",
            "Všechny paralelní skupiny dělené výuky musí probíhat současně.",
            [reference.block_id, candidate.block_id],
            reference.day,
            reference.period,
          );
        }
      }
    }
  }

  issues.push(...validateRotationSchedule(snapshot, lessonsByAssignment));

  return issues.sort((left, right) => {
    const leftKey = `${left.code}:${left.day ?? -1}:${left.period ?? -1}:${left.message}`;
    const rightKey = `${right.code}:${right.day ?? -1}:${right.period ?? -1}:${right.message}`;
    return leftKey.localeCompare(rightKey, "cs");
  });
}

export function validateMove(
  snapshot: CanonicalSnapshot,
  lessons: ScheduledLesson[],
  move: TimetableMove,
): MoveValidationResult {
  const target = lessons.find(
    (lesson) => (lesson.id ?? lesson.block_id) === move.lesson_id,
  );
  if (!target) {
    return {
      valid: false,
      issues: [
        {
          code: "LESSON_NOT_FOUND",
          message: "Přesouvaná hodina nebyla v aktuální verzi nalezena.",
          entity_ids: [move.lesson_id],
        },
      ],
      preview: lessons,
    };
  }
  if (target.locked) {
    return {
      valid: false,
      issues: [
        {
          code: "LESSON_LOCKED",
          message: "Zamčenou hodinu nelze přesunout. Nejprve ji odemkněte.",
          entity_ids: [move.lesson_id],
          day: target.day,
          period: target.period,
        },
      ],
      preview: lessons,
    };
  }

  const preview = lessons.map((lesson) =>
    (lesson.id ?? lesson.block_id) === move.lesson_id
      ? {
          ...lesson,
          day: move.target_day,
          period: move.target_period,
          room_id: move.target_room_id,
          origin: "MANUAL" as const,
          manually_changed: true,
        }
      : lesson,
  );
  const issues = validateSchedule(snapshot, preview);
  return { valid: issues.length === 0, issues, preview };
}
