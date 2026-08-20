import type {
  CanonicalSnapshot,
  MoveValidationResult,
  ScheduledLesson,
  TimetableMove,
  ValidationIssue,
} from "./contracts";
import { classRequiredWeeklyPeriods, lessonClassIds } from "./class-groups";
import {
  validateMove as validateLegacyMove,
  validateSchedule as validateLegacySchedule,
} from "./validation";

const FULL_WEEK_CLASS_MINIMUM_PERIODS = 20;

function subjectCode(snapshot: CanonicalSnapshot, subjectId: string): string {
  return (
    snapshot.subjects.find((subject) => subject.id === subjectId)?.code ?? ""
  )
    .trim()
    .toUpperCase();
}

function isPrefix(periods: number[]): boolean {
  return periods.every((period, index) => period === index);
}

function classDayPatternAllowed(
  snapshot: CanonicalSnapshot,
  occupiedPeriods: Iterable<number>,
): boolean {
  const occupied = [...new Set(occupiedPeriods)].sort((a, b) => a - b);
  if (occupied.length === 0) return true;
  const policy = snapshot.policy;
  if (!policy) return isPrefix(occupied);
  if (policy.class_day.require_first_period && occupied[0] !== 0) return false;

  const afternoonStart = policy.teacher_afternoon_break.afternoon_start_period;
  if (!occupied.some((period) => period >= afternoonStart)) {
    return isPrefix(occupied);
  }
  return policy.class_day.allowed_afternoon_patterns.some(
    (pattern) => JSON.stringify(pattern) === JSON.stringify(occupied),
  );
}

function policyIssues(
  snapshot: CanonicalSnapshot,
  lessons: ScheduledLesson[],
): ValidationIssue[] {
  const policy = snapshot.policy;
  if (!policy) return [];

  const issues: ValidationIssue[] = [];
  const assignments = new Map(
    snapshot.assignments.map((assignment) => [assignment.id, assignment]),
  );
  const requiredPeriodsByClass = classRequiredWeeklyPeriods(
    snapshot.assignments,
  );
  const fullWeekClassIds = new Set(
    [...requiredPeriodsByClass.entries()]
      .filter(([, required]) => required >= FULL_WEEK_CLASS_MINIMUM_PERIODS)
      .map(([classId]) => classId),
  );
  const classPeriods = new Map<string, Set<number>>();
  const teacherPeriods = new Map<string, Set<number>>();
  const classSubjectPeriods = new Map<string, Set<number>>();

  function add(map: Map<string, Set<number>>, key: string, period: number) {
    const values = map.get(key) ?? new Set<number>();
    values.add(period);
    map.set(key, values);
  }

  for (const lesson of lessons) {
    const assignment = assignments.get(lesson.assignment_id);
    if (!assignment) continue;
    const code = subjectCode(snapshot, assignment.subject_id);
    const occupied = Array.from(
      { length: lesson.duration },
      (_unused, offset) => lesson.period + offset,
    );

    for (const rule of policy.forbidden_subject_windows) {
      if (!rule.subject_codes.includes(code)) continue;
      if (rule.days && !rule.days.includes(lesson.day)) continue;
      if (!occupied.some((period) => rule.periods.includes(period))) continue;
      issues.push({
        code: "POLICY_SUBJECT_WINDOW",
        message: `Předmět ${code} je umístěný do zakázaného časového okna.`,
        entity_ids: [lesson.block_id, assignment.subject_id],
        day: lesson.day,
        period: lesson.period,
      });
      break;
    }

    const latest = policy.class_day.latest_period_by_day[lesson.day];
    if (latest != null && lesson.period + lesson.duration - 1 > latest) {
      issues.push({
        code: "POLICY_DAY_BOUNDARY",
        message: "Výuka přesahuje poslední povolenou hodinu daného dne.",
        entity_ids: [lesson.block_id, lesson.class_id],
        day: lesson.day,
        period: lesson.period,
      });
    }

    for (const period of occupied) {
      add(teacherPeriods, `${lesson.teacher_id}:${lesson.day}`, period);
      for (const classId of lessonClassIds(lesson)) {
        add(classPeriods, `${classId}:${lesson.day}`, period);
        if (assignment.rotation_key == null) {
          add(classSubjectPeriods, `${classId}:${code}:${lesson.day}`, period);
        }
      }
    }
  }

  for (const [key, values] of classPeriods) {
    const separator = key.lastIndexOf(":");
    const classId = key.slice(0, separator);
    const day = Number(key.slice(separator + 1));
    if (!fullWeekClassIds.has(classId)) continue;
    if (classDayPatternAllowed(snapshot, values)) continue;
    issues.push({
      code: "POLICY_CLASS_DAY_PATTERN",
      message:
        "Třída nemá kompaktní dopoledne ani jeden z povolených obědových/odpoledních vzorů.",
      entity_ids: [classId],
      day,
      details: { occupiedPeriods: [...values].sort((a, b) => a - b) },
    });
  }

  const breakPolicy = policy.teacher_afternoon_break;
  if (breakPolicy.enabled) {
    for (const [key, values] of teacherPeriods) {
      const separator = key.lastIndexOf(":");
      const teacherId = key.slice(0, separator);
      const day = Number(key.slice(separator + 1));
      if (
        ![...values].some(
          (period) => period >= breakPolicy.afternoon_start_period,
        )
      ) {
        continue;
      }
      const free = breakPolicy.break_periods.filter(
        (period) => !values.has(period),
      ).length;
      if (free >= breakPolicy.minimum_free_periods) continue;
      issues.push({
        code: "POLICY_TEACHER_AFTERNOON_BREAK",
        message:
          "Učitel při odpolední výuce nemá požadovanou volnou hodinu v obědovém okně.",
        entity_ids: [teacherId],
        day,
        details: { occupiedPeriods: [...values].sort((a, b) => a - b) },
      });
    }
  }

  const dailyLimitByCode = new Map<string, number>();
  for (const rule of policy.subject_daily_limits) {
    for (const code of rule.subject_codes) {
      const current = dailyLimitByCode.get(code);
      dailyLimitByCode.set(
        code,
        current == null
          ? rule.max_periods_per_day
          : Math.min(current, rule.max_periods_per_day),
      );
    }
  }
  for (const [key, values] of classSubjectPeriods) {
    const parts = key.split(":");
    const day = Number(parts.pop());
    const code = String(parts.pop() ?? "");
    const classId = parts.join(":");
    const limit = dailyLimitByCode.get(code);
    if (limit == null || values.size <= limit) continue;
    issues.push({
      code: "POLICY_SUBJECT_DAILY_LIMIT",
      message: `Třída má předmět ${code} v jednom dni ${values.size}×, povolené maximum je ${limit}.`,
      entity_ids: [classId],
      day,
      details: {
        occupiedPeriods: [...values].sort((a, b) => a - b),
        limit,
      },
    });
  }

  return issues;
}

export function validateSchedule(
  snapshot: CanonicalSnapshot,
  lessons: ScheduledLesson[],
): ValidationIssue[] {
  const legacy = validateLegacySchedule(snapshot, lessons);
  if (!snapshot.policy) return legacy;

  const ignored = new Set([
    "LUNCH_BREAK_CROSSED",
    "CLASS_HAS_INTERNAL_GAP",
    "CONSECUTIVE_CLASS_AFTERNOONS",
  ]);
  if (!snapshot.policy.class_day.require_first_period) {
    ignored.add("CLASS_DOES_NOT_START_AT_EIGHT");
  }
  return [
    ...legacy.filter((issue) => !ignored.has(issue.code)),
    ...policyIssues(snapshot, lessons),
  ].sort((left, right) => {
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
  if (!snapshot.policy) return validateLegacyMove(snapshot, lessons, move);

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
