import type {
  CanonicalSnapshot,
  ScheduledLesson,
  ValidationIssue,
} from "./contracts";
import {
  classRequiredWeeklyPeriods,
  lessonClassIds,
  rotationAssignmentLegs,
} from "./class-groups";
import { crossesLunchBreak } from "./school-day";

const AFTERNOON_START_PERIOD = 6;
const ALLOWED_CLASS_AFTERNOON_DAYS = new Set([1, 2, 3]);

function intervalsOverlap(
  leftPeriod: number,
  rightPeriod: number,
  duration: number,
): boolean {
  return !(
    leftPeriod + duration <= rightPeriod || rightPeriod + duration <= leftPeriod
  );
}

function issue(
  code: string,
  message: string,
  entityIds: string[],
  day?: number,
  period?: number,
): ValidationIssue {
  return {
    code,
    message,
    entity_ids: entityIds,
    day,
    period,
  };
}

function validateSchoolDayPolicy(
  snapshot: CanonicalSnapshot,
  lessonsByAssignment: Map<string, ScheduledLesson[]>,
): ValidationIssue[] {
  if (snapshot.periods_per_day.length !== 5) return [];

  const issues: ValidationIssue[] = [];
  const occupancy = new Map<string, Set<number>>();
  const seenBlocks = new Set<string>();

  for (const assignmentLessons of lessonsByAssignment.values()) {
    for (const lesson of assignmentLessons) {
      if (seenBlocks.has(lesson.block_id)) continue;
      seenBlocks.add(lesson.block_id);
      for (const classId of lessonClassIds(lesson)) {
        const key = `${classId}:${lesson.day}`;
        const periods = occupancy.get(key) ?? new Set<number>();
        for (
          let period = lesson.period;
          period < lesson.period + lesson.duration;
          period += 1
        ) {
          periods.add(period);
        }
        occupancy.set(key, periods);
      }
    }
  }

  for (const [classId, weeklyPeriods] of classRequiredWeeklyPeriods(
    snapshot.assignments,
  )) {
    if (weeklyPeriods < 5) continue;

    const minimumDailyLoad = Math.max(1, Math.ceil(weeklyPeriods / 5) - 1);
    const afternoonDays = new Set<number>();

    for (let day = 0; day < 5; day += 1) {
      const occupied = occupancy.get(`${classId}:${day}`) ?? new Set<number>();
      if (occupied.size < minimumDailyLoad) {
        issues.push(
          issue(
            "CLASS_DAY_TOO_SHORT",
            `Třída ${classId} má nepřiměřeně krátký vyučovací den.`,
            [classId],
            day,
          ),
        );
      }

      if ([...occupied].some((period) => period >= AFTERNOON_START_PERIOD)) {
        afternoonDays.add(day);
        if (!ALLOWED_CLASS_AFTERNOON_DAYS.has(day)) {
          issues.push(
            issue(
              "CLASS_AFTERNOON_FORBIDDEN_DAY",
              `Třída ${classId} může mít 7.–8. hodinu pouze v úterý, středu nebo čtvrtek.`,
              [classId],
              day,
              AFTERNOON_START_PERIOD,
            ),
          );
        }
      }
    }

    for (let day = 0; day < 4; day += 1) {
      if (!afternoonDays.has(day) || !afternoonDays.has(day + 1)) continue;
      issues.push(
        issue(
          "CONSECUTIVE_CLASS_AFTERNOONS",
          `Třída ${classId} nesmí mít odpolední výuku dva dny po sobě.`,
          [classId],
          day + 1,
          AFTERNOON_START_PERIOD,
        ),
      );
    }
  }

  return issues;
}

export function validateRotationSchedule(
  snapshot: CanonicalSnapshot,
  lessonsByAssignment: Map<string, ScheduledLesson[]>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = validateSchoolDayPolicy(
    snapshot,
    lessonsByAssignment,
  );

  for (const { rotationKey, leg1, leg2 } of rotationAssignmentLegs(
    snapshot.assignments,
  )) {
    const placement = leg1[0].rotation_placement ?? "SAME_DAY";
    const leftLessons = [...(lessonsByAssignment.get(leg1[0].id) ?? [])].sort(
      (left, right) => left.block_id.localeCompare(right.block_id),
    );
    const rightLessons = [...(lessonsByAssignment.get(leg2[0].id) ?? [])].sort(
      (left, right) => left.block_id.localeCompare(right.block_id),
    );

    if (leftLessons.length !== rightLessons.length) continue;

    leftLessons.forEach((left, index) => {
      const right = rightLessons[index]!;
      const entityIds = [left.block_id, right.block_id];
      const sameDay = left.day === right.day;
      const combinedStart = Math.min(left.period, right.period);

      if (
        sameDay &&
        intervalsOverlap(left.period, right.period, left.duration)
      ) {
        issues.push(
          issue(
            "ROTATION_LEGS_OVERLAP",
            `Ramena výměny ${rotationKey} se nesmějí překrývat.`,
            entityIds,
            left.day,
            combinedStart,
          ),
        );
        return;
      }

      if ((placement === "ADJACENT" || placement === "SAME_DAY") && !sameDay) {
        issues.push(
          issue(
            "ROTATION_NOT_SAME_DAY",
            `Obě ramena výměny ${rotationKey} musí proběhnout ve stejný den.`,
            entityIds,
          ),
        );
        return;
      }

      if (placement !== "ADJACENT") return;

      if (Math.abs(left.period - right.period) !== left.duration) {
        issues.push(
          issue(
            "ROTATION_NOT_ADJACENT",
            `Obě ramena výměny ${rotationKey} musí být bezprostředně za sebou.`,
            entityIds,
            left.day,
            combinedStart,
          ),
        );
        return;
      }

      if (crossesLunchBreak(combinedStart, left.duration * 2)) {
        issues.push(
          issue(
            "ROTATION_CROSSES_LUNCH_BREAK",
            `Výměna ${rotationKey} nesmí být rozdělena obědovou přestávkou.`,
            entityIds,
            left.day,
            combinedStart,
          ),
        );
      }
    });
  }

  return issues;
}
