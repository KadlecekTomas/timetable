import type {
  CanonicalSnapshot,
  ScheduledLesson,
  ScoreCategory,
  ScoreIncident,
  ScoreReport,
} from "./contracts";
import { scoreSchedule as scoreLegacySchedule } from "./scoring";
import { validateSchedule } from "./validation-policy";

const MAXIMUMS: Record<ScoreCategory, number> = {
  class_compactness: 25,
  teacher_compactness: 25,
  distribution: 15,
  teacher_preferences: 15,
  day_edges: 10,
  stability_and_rooms: 10,
};

function scoreLabel(total: number): string {
  if (total >= 95) return "Výborný návrh";
  if (total >= 85) return "Velmi dobrý návrh";
  if (total >= 70) return "Použitelný návrh s rezervami";
  if (total >= 50) return "Vyžaduje výraznější úpravy";
  return "Slabý návrh";
}

function deduct(
  categories: Record<ScoreCategory, number>,
  incidents: ScoreIncident[],
  category: ScoreCategory,
  points: number,
  code: string,
  message: string,
  entityIds: string[],
  day?: number,
  period?: number,
) {
  const applied = Math.min(Math.max(0, points), categories[category]);
  if (!applied) return;
  categories[category] -= applied;
  incidents.push({
    category,
    code,
    points: applied,
    message,
    entity_ids: entityIds,
    day,
    period,
  });
}

function occupancy(
  lessons: ScheduledLesson[],
  kind: "class" | "teacher",
): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>();
  for (const lesson of lessons) {
    const ids =
      kind === "class"
        ? [lesson.class_id, ...(lesson.additional_class_ids ?? [])]
        : [lesson.teacher_id];
    for (const id of ids) {
      const key = `${id}:${lesson.day}`;
      const periods = result.get(key) ?? new Set<number>();
      for (
        let period = lesson.period;
        period < lesson.period + lesson.duration;
        period += 1
      ) {
        periods.add(period);
      }
      result.set(key, periods);
    }
  }
  return result;
}

export function scoreSchedule(
  snapshot: CanonicalSnapshot,
  lessons: ScheduledLesson[],
): ScoreReport {
  if (!snapshot.policy) return scoreLegacySchedule(snapshot, lessons);

  const hardIssues = validateSchedule(snapshot, lessons);
  if (hardIssues.length) {
    return {
      valid: false,
      total: null,
      label: null,
      categories: {},
      incidents: [],
      hard_issues: hardIssues,
    };
  }

  const categories = { ...MAXIMUMS };
  const incidents: ScoreIncident[] = [];
  const policy = snapshot.policy;
  const teacherOccupancy = occupancy(lessons, "teacher");

  // Teacher compactness still matters, but the mandatory afternoon break is not
  // scored as a gap — it is an intentional operational requirement.
  for (const [key, occupied] of [...teacherOccupancy.entries()].sort()) {
    if (occupied.size < 2) continue;
    const separator = key.lastIndexOf(":");
    const teacherId = key.slice(0, separator);
    const day = Number(key.slice(separator + 1));
    const first = Math.min(...occupied);
    const last = Math.max(...occupied);
    const hasAfternoon = [...occupied].some(
      (period) =>
        period >= policy.teacher_afternoon_break.afternoon_start_period,
    );
    for (let period = first + 1; period < last; period += 1) {
      if (occupied.has(period)) continue;
      const intentionalBreak =
        hasAfternoon &&
        policy.teacher_afternoon_break.break_periods.includes(period);
      if (intentionalBreak) continue;
      deduct(
        categories,
        incidents,
        "teacher_compactness",
        1,
        "TEACHER_GAP",
        `Učitel ${teacherId} má v rozvrhu vnitřní volnou hodinu.`,
        [teacherId],
        day,
        period,
      );
    }
  }

  const assignmentDays = new Map<string, number>();
  for (const lesson of lessons) {
    const key = `${lesson.assignment_id}:${lesson.day}`;
    assignmentDays.set(key, (assignmentDays.get(key) ?? 0) + 1);
  }
  for (const [key, count] of assignmentDays) {
    if (count <= 1) continue;
    const separator = key.lastIndexOf(":");
    const assignmentId = key.slice(0, separator);
    const assignment = snapshot.assignments.find(
      (item) => item.id === assignmentId,
    );
    if (!assignment || assignment.lesson_shape === "DOUBLE") continue;
    deduct(
      categories,
      incidents,
      "distribution",
      count - 1,
      "ASSIGNMENT_SAME_DAY_CONCENTRATION",
      `Výuková vazba ${assignment.code ?? assignment.id} má více samostatných bloků v jednom dni.`,
      [assignmentId],
      Number(key.slice(separator + 1)),
    );
  }

  const classOccupancy = occupancy(lessons, "class");
  const classIds = [
    ...new Set(
      [...classOccupancy.keys()].map((key) =>
        key.slice(0, key.lastIndexOf(":")),
      ),
    ),
  ].sort();
  for (const classId of classIds) {
    const loads = snapshot.periods_per_day.map(
      (_periods, day) => classOccupancy.get(`${classId}:${day}`)?.size ?? 0,
    );
    const nonZero = loads.filter((load) => load > 0);
    if (nonZero.length < 2) continue;
    const spread = Math.max(...nonZero) - Math.min(...nonZero);
    if (spread > 1) {
      deduct(
        categories,
        incidents,
        "day_edges",
        Math.min(3, spread - 1),
        "CLASS_DAY_LOAD_IMBALANCE",
        `Třída ${classId} má nevyrovnanou délku vyučovacích dnů.`,
        [classId],
      );
    }
  }

  const total = Object.values(categories).reduce(
    (sum, value) => sum + value,
    0,
  );
  return {
    valid: true,
    total,
    label: scoreLabel(total),
    categories,
    incidents: incidents.sort((left, right) =>
      `${left.category}:${left.code}:${left.day ?? -1}:${left.period ?? -1}`.localeCompare(
        `${right.category}:${right.code}:${right.day ?? -1}:${right.period ?? -1}`,
      ),
    ),
    hard_issues: [],
  };
}
