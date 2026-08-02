export const SCHOOL_DAY_START_TIME = "8:00";
export const MORNING_PERIOD_LIMIT = 6;
export const MIN_LUNCH_BREAK_MINUTES = 50;

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
