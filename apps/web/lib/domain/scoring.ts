import type {
  AvailabilityEntityType,
  CanonicalSnapshot,
  ScheduledLesson,
  ScoreCategory,
  ScoreIncident,
  ScoreReport,
} from "./contracts";
import { validateSchedule } from "./validation";

export const SCORE_MAXIMUMS: Record<ScoreCategory, number> = {
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
  incident: Omit<ScoreIncident, "points"> & { points: number },
) {
  const applied = Math.min(incident.points, categories[incident.category]);
  if (applied <= 0) return;
  categories[incident.category] -= applied;
  incidents.push({ ...incident, points: applied });
}

function occupancy(
  lessons: ScheduledLesson[],
  attribute: "class_id" | "teacher_id",
): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>();
  for (const lesson of lessons) {
    const key = `${lesson[attribute]}:${lesson.day}`;
    const periods = result.get(key) ?? new Set<number>();
    for (let period = lesson.period; period < lesson.period + lesson.duration; period += 1) {
      periods.add(period);
    }
    result.set(key, periods);
  }
  return result;
}

function entityOccupies(
  lessons: ScheduledLesson[],
  entityType: AvailabilityEntityType,
  entityId: string,
  day: number,
  period: number,
): boolean {
  return lessons.some((lesson) => {
    if (lesson.day !== day || period < lesson.period || period >= lesson.period + lesson.duration) {
      return false;
    }
    if (entityType === "TEACHER") return lesson.teacher_id === entityId;
    if (entityType === "CLASS") return lesson.class_id === entityId;
    return lesson.room_id === entityId;
  });
}

export function scoreSchedule(
  snapshot: CanonicalSnapshot,
  lessons: ScheduledLesson[],
): ScoreReport {
  const hardIssues = validateSchedule(snapshot, lessons);
  if (hardIssues.length > 0) {
    return {
      valid: false,
      total: null,
      label: null,
      categories: {},
      incidents: [],
      hard_issues: hardIssues,
    };
  }

  const categories = { ...SCORE_MAXIMUMS };
  const incidents: ScoreIncident[] = [];

  const gapDefinitions: Array<{
    category: ScoreCategory;
    attribute: "class_id" | "teacher_id";
    code: "CLASS_GAP" | "TEACHER_GAP";
    noun: string;
  }> = [
    {
      category: "class_compactness",
      attribute: "class_id",
      code: "CLASS_GAP",
      noun: "Třída",
    },
    {
      category: "teacher_compactness",
      attribute: "teacher_id",
      code: "TEACHER_GAP",
      noun: "Učitel",
    },
  ];

  for (const definition of gapDefinitions) {
    for (const [key, occupied] of [...occupancy(lessons, definition.attribute).entries()].sort()) {
      if (occupied.size < 2) continue;
      const [entityId, dayValue] = key.split(":");
      const day = Number(dayValue);
      const first = Math.min(...occupied);
      const last = Math.max(...occupied);
      const gaps = Array.from({ length: last - first + 1 }, (_, index) => first + index).filter(
        (period) => !occupied.has(period),
      );
      gaps.forEach((period, index) => {
        const points = index === 0 ? 1 : index === 1 ? 2 : 3;
        deduct(categories, incidents, {
          category: definition.category,
          code: definition.code,
          points,
          message: `${definition.noun} ${entityId} má v rozvrhu vnitřní volnou hodinu.`,
          entity_ids: [entityId],
          day,
          period,
          suggestion: "Přesuňte sousední výuku blíže k sobě, pokud to tvrdá omezení dovolí.",
        });
      });
    }
  }

  const assignments = new Map(snapshot.assignments.map((assignment) => [assignment.id, assignment]));
  const assignmentDays = new Map<string, ScheduledLesson[]>();
  const subjectDays = new Map<string, number>();
  for (const lesson of lessons) {
    const assignmentKey = `${lesson.assignment_id}:${lesson.day}`;
    assignmentDays.set(assignmentKey, [...(assignmentDays.get(assignmentKey) ?? []), lesson]);
    const subjectKey = `${lesson.class_id}:${lesson.subject_id}:${lesson.day}`;
    subjectDays.set(subjectKey, (subjectDays.get(subjectKey) ?? 0) + lesson.duration);
  }

  for (const [key, dayLessons] of [...assignmentDays.entries()].sort()) {
    const separator = key.lastIndexOf(":");
    const assignmentId = key.slice(0, separator);
    const day = Number(key.slice(separator + 1));
    const assignment = assignments.get(assignmentId);
    if (assignment && dayLessons.length > 1 && assignment.lesson_shape !== "DOUBLE") {
      deduct(categories, incidents, {
        category: "distribution",
        code: "ASSIGNMENT_SAME_DAY_CONCENTRATION",
        points: dayLessons.length - 1,
        message: `Výuková vazba ${assignment.code ?? assignment.id} má více samostatných bloků v jednom dni.`,
        entity_ids: [assignment.id],
        day,
        suggestion: "Rozložte výuku do více dnů.",
      });
    }
  }

  for (const [key, periods] of [...subjectDays.entries()].sort()) {
    if (periods <= 2) continue;
    const parts = key.split(":");
    const day = Number(parts.pop());
    const subjectId = parts.pop() ?? "";
    const classId = parts.join(":");
    deduct(categories, incidents, {
      category: "distribution",
      code: "SUBJECT_SAME_DAY_CONCENTRATION",
      points: periods - 2,
      message: `Třída ${classId} má předmět ${subjectId} soustředěný do jednoho dne.`,
      entity_ids: [classId, subjectId],
      day,
      suggestion: "Rozložte předmět do více pracovních dnů.",
    });
  }

  for (const rule of [...snapshot.availability].sort((left, right) =>
    `${left.entity_type}:${left.entity_id}:${left.day}:${left.period}:${left.kind}`.localeCompare(
      `${right.entity_type}:${right.entity_id}:${right.day}:${right.period}:${right.kind}`,
    ),
  )) {
    const occupied = entityOccupies(
      lessons,
      rule.entity_type,
      rule.entity_id,
      rule.day,
      rule.period,
    );
    if (rule.kind === "DISCOURAGED" && occupied) {
      deduct(categories, incidents, {
        category: "teacher_preferences",
        code: "DISCOURAGED_SLOT",
        points: Math.max(1, Math.floor((rule.weight ?? 25) / 25)),
        message: `Výuka zasahuje do nedoporučeného slotu entity ${rule.entity_id}.`,
        entity_ids: [rule.entity_id],
        day: rule.day,
        period: rule.period,
        suggestion: rule.reason ?? "Zvažte přesun do vhodnějšího slotu.",
      });
    } else if (rule.kind === "PREFERRED" && !occupied) {
      deduct(categories, incidents, {
        category: "teacher_preferences",
        code: "PREFERRED_SLOT_UNUSED",
        points: 1,
        message: `Preferovaný slot entity ${rule.entity_id} nebyl využit.`,
        entity_ids: [rule.entity_id],
        day: rule.day,
        period: rule.period,
        suggestion: rule.reason ?? "Při další optimalizaci zkuste preferovaný slot využít.",
      });
    }
  }

  for (const [key, occupied] of [...occupancy(lessons, "teacher_id").entries()].sort()) {
    if (occupied.size !== 1) continue;
    const [teacherId, dayValue] = key.split(":");
    const day = Number(dayValue);
    const period = [...occupied][0];
    if (period === 0 || period === snapshot.periods_per_day[day] - 1) {
      deduct(categories, incidents, {
        category: "day_edges",
        code: "ISOLATED_EDGE_LESSON",
        points: 1,
        message: `Učitel ${teacherId} má v daný den jedinou hodinu na okraji dne.`,
        entity_ids: [teacherId],
        day,
        period,
        suggestion: "Zvažte spojení této hodiny s další výukou stejného dne.",
      });
    }
  }

  for (const [key, occupied] of [...occupancy(lessons, "class_id").entries()].sort()) {
    const [classId, dayValue] = key.split(":");
    const day = Number(dayValue);
    const lastPeriod = Math.max(...occupied);
    if (lastPeriod >= Math.max(6, snapshot.periods_per_day[day] - 1)) {
      deduct(categories, incidents, {
        category: "day_edges",
        code: "LATE_CLASS_FINISH",
        points: 1,
        message: `Třída ${classId} končí pozdě.`,
        entity_ids: [classId],
        day,
        period: lastPeriod,
        suggestion: "Zvažte přesun některé výuky do dřívějšího slotu.",
      });
    }
  }

  const total = Object.values(categories).reduce((sum, value) => sum + value, 0);
  return {
    valid: true,
    total,
    label: scoreLabel(total),
    categories,
    incidents: incidents.sort((left, right) =>
      `${left.category}:${left.code}:${left.day ?? -1}:${left.period ?? -1}:${left.message}`.localeCompare(
        `${right.category}:${right.code}:${right.day ?? -1}:${right.period ?? -1}:${right.message}`,
        "cs",
      ),
    ),
    hard_issues: [],
  };
}
