import type { LocalAvailability, LocalProject } from "./api";
import { STAFFING_DAYS, type StaffingPlan } from "./staffing-plan";

function availabilityKey(
  entityId: string,
  dayOfWeek: number,
  period: number,
): string {
  return `${entityId}:${dayOfWeek}:${period}`;
}

export function staffingExactUnavailableAvailability(
  project: LocalProject,
  staffingPlan: StaffingPlan,
): LocalAvailability[] {
  const existing = new Set(
    project.availability
      .filter(
        (item) => item.entityType === "TEACHER" && item.kind === "UNAVAILABLE",
      )
      .map((item) =>
        availabilityKey(item.entityId, item.dayOfWeek, item.period),
      ),
  );
  const result: LocalAvailability[] = [];

  for (const teacher of staffingPlan.teachers) {
    const entityId = `teacher:${teacher.id}`;
    for (const item of teacher.unavailablePeriods ?? []) {
      const day = STAFFING_DAYS.find((option) => option.code === item.day);
      if (!day) continue;
      const maxPeriods = project.periodsPerDay[day.dayIndex] ?? 0;
      if (item.period < 0 || item.period >= maxPeriods) continue;
      const key = availabilityKey(entityId, day.dayIndex, item.period);
      if (existing.has(key)) continue;
      existing.add(key);
      result.push({
        id: `availability:${teacher.id}:${item.day}:${item.period}:exact`,
        entityType: "TEACHER",
        entityId,
        dayOfWeek: day.dayIndex,
        period: item.period,
        kind: "UNAVAILABLE",
        weight: null,
        reason: "Přesná nedostupnost z personálního plánu",
      });
    }
  }

  return result;
}
