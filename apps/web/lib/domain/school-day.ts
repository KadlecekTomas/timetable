export const MORNING_PERIOD_LIMIT = 6;
export const MIN_LUNCH_BREAK_MINUTES = 50;

export function crossesLunchBreak(period: number, duration: number): boolean {
  return period < MORNING_PERIOD_LIMIT && period + duration > MORNING_PERIOD_LIMIT;
}

export function isAfternoonPeriod(period: number): boolean {
  return period >= MORNING_PERIOD_LIMIT;
}
