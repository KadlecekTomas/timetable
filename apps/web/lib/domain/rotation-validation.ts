import type {
  CanonicalSnapshot,
  ScheduledLesson,
  ValidationIssue,
} from "./contracts";
import { rotationAssignmentLegs } from "./class-groups";
import { crossesLunchBreak } from "./school-day";

function intervalsOverlap(
  leftPeriod: number,
  rightPeriod: number,
  duration: number,
): boolean {
  return !(
    leftPeriod + duration <= rightPeriod ||
    rightPeriod + duration <= leftPeriod
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

export function validateRotationSchedule(
  snapshot: CanonicalSnapshot,
  lessonsByAssignment: Map<string, ScheduledLesson[]>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

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

      if (
        (placement === "ADJACENT" || placement === "SAME_DAY") &&
        !sameDay
      ) {
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
