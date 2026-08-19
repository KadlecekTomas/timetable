export const SCHOOL_DAY_START_TIME = "8:00";
export const MORNING_PERIOD_LIMIT = 6;
export const MIN_LUNCH_BREAK_MINUTES = 50;
export const FRIDAY_DAY_INDEX = 4;
export const TEACHER_BREAK_PERIODS = [3, 4, 5] as const;
export const HISTORY_SUBJECT_CODE = "DEJ";

export function schoolPeriodLabel(period: number): string {
  const ordinal = `${period + 1}. hodina`;
  return period === 0 ? `${ordinal} · ${SCHOOL_DAY_START_TIME}` : ordinal;
}

export function crossesLunchBreak(period: number, duration: number): boolean {
  return (
    period < MORNING_PERIOD_LIMIT && period + duration > MORNING_PERIOD_LIMIT
  );
}

export function isAfternoonPeriod(period: number): boolean {
  return period >= MORNING_PERIOD_LIMIT;
}

export function isForbiddenFridayLesson(
  day: number,
  period: number,
  duration: number,
): boolean {
  return day === FRIDAY_DAY_INDEX && period + duration > MORNING_PERIOD_LIMIT;
}
