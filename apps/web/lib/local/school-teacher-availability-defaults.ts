import type {
  StaffingDayCode,
  StaffingPlan,
  StaffingTeacher,
  StaffingUnavailablePeriod,
} from "./staffing-plan";

interface SchoolTeacherAvailabilityRule {
  surname: string;
  firstName?: string;
  unavailableDays?: StaffingDayCode[];
  unavailablePeriods?: StaffingUnavailablePeriod[];
}

const DAY_ORDER: Record<StaffingDayCode, number> = {
  MON: 0,
  TUE: 1,
  WED: 2,
  THU: 3,
  FRI: 4,
};

function periods(
  day: StaffingDayCode,
  ...oneBasedPeriods: number[]
): StaffingUnavailablePeriod[] {
  return oneBasedPeriods.map((period) => ({ day, period: period - 1 }));
}

function fromPeriod(
  day: StaffingDayCode,
  firstOneBasedPeriod: number,
  lastOneBasedPeriod = 8,
): StaffingUnavailablePeriod[] {
  return periods(
    day,
    ...Array.from(
      { length: Math.max(0, lastOneBasedPeriod - firstOneBasedPeriod + 1) },
      (_unused, index) => firstOneBasedPeriod + index,
    ),
  );
}

/**
 * Authoritative school defaults for hard teacher unavailability in 2026/2027.
 * Matching is surname-first because source workbooks may omit first names.
 */
export const SCHOOL_TEACHER_AVAILABILITY_DEFAULTS: readonly SchoolTeacherAvailabilityRule[] = [
  { surname: "Černá", firstName: "Veronika", unavailableDays: ["TUE", "FRI"] },
  {
    surname: "Dostálová",
    firstName: "Kateřina",
    unavailablePeriods: fromPeriod("THU", 5),
  },
  { surname: "Jislová", firstName: "Anežka", unavailableDays: ["FRI"] },
  { surname: "Kadleček", firstName: "Tomáš", unavailableDays: ["FRI"] },
  { surname: "Kvapilová", unavailablePeriods: fromPeriod("THU", 3) },
  { surname: "Lišková", firstName: "Jiřina", unavailableDays: ["MON", "FRI"] },
  {
    surname: "Moravcová",
    firstName: "Myřátská",
    unavailableDays: ["THU", "FRI"],
    unavailablePeriods: periods("MON", 5),
  },
  { surname: "Pokorná", firstName: "Jaroslava", unavailableDays: ["FRI"] },
  { surname: "Šárová", firstName: "Eliška", unavailableDays: ["MON", "FRI"] },
  { surname: "Šobotník", firstName: "Jan", unavailableDays: ["MON"] },
  {
    surname: "Vašáková",
    firstName: "Nikola",
    unavailableDays: ["MON", "THU", "FRI"],
  },
  { surname: "Vavřincová", firstName: "Anna", unavailableDays: ["MON"] },
  { surname: "Vosyková", firstName: "Božena", unavailableDays: ["WED", "FRI"] },
  {
    surname: "Zindulková",
    firstName: "Zina",
    unavailablePeriods: fromPeriod("TUE", 4),
  },
  {
    surname: "Indrakova",
    unavailablePeriods: [
      ...periods("MON", 5),
      ...periods("TUE", 3, 4, 5),
      ...periods("WED", 4, 5),
      ...periods("THU", 3, 4),
    ],
  },
  {
    surname: "Jakoubková",
    firstName: "Zuzana",
    unavailablePeriods: [
      ...periods("MON", 6),
      ...periods("THU", 5),
      ...periods("FRI", 3, 4),
    ],
  },
  {
    surname: "Wild",
    firstName: "Pavel",
    unavailablePeriods: [...periods("MON", 5), ...periods("FRI", 4)],
  },
  {
    surname: "Hanková",
    firstName: "Eva",
    unavailablePeriods: [
      ...periods("MON", 2, 3, 4, 5),
      ...periods("TUE", 1, 3, 4, 5),
      ...periods("WED", 2, 4, 5),
      ...periods("THU", 1, 3, 4, 5),
      ...periods("FRI", 5),
    ],
  },
] as const;

function normalizedPersonToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLocaleLowerCase("cs-CZ");
}

function surnameKey(teacher: StaffingTeacher): string {
  const firstToken = teacher.lastName.trim().split(/\s+/)[0] ?? "";
  return normalizedPersonToken(firstToken);
}

function firstNameKey(teacher: StaffingTeacher): string {
  return normalizedPersonToken(teacher.firstName);
}

function mergeDays(
  current: StaffingDayCode[],
  defaults: readonly StaffingDayCode[],
): StaffingDayCode[] {
  return [...new Set([...current, ...defaults])].sort(
    (left, right) => DAY_ORDER[left] - DAY_ORDER[right],
  );
}

function mergePeriods(
  current: StaffingUnavailablePeriod[] | undefined,
  defaults: readonly StaffingUnavailablePeriod[],
): StaffingUnavailablePeriod[] {
  const merged = new Map<string, StaffingUnavailablePeriod>();
  for (const item of [...(current ?? []), ...defaults]) {
    merged.set(`${item.day}:${item.period}`, { day: item.day, period: item.period });
  }
  return [...merged.values()].sort(
    (left, right) =>
      DAY_ORDER[left.day] - DAY_ORDER[right.day] || left.period - right.period,
  );
}

export interface SchoolTeacherAvailabilityApplyResult {
  plan: StaffingPlan;
  matchedSurnames: string[];
  unmatchedSurnames: string[];
  ambiguousSurnames: string[];
}

export function applySchoolTeacherAvailabilityDefaults(
  plan: StaffingPlan,
): SchoolTeacherAvailabilityApplyResult {
  const replacements = new Map<string, StaffingTeacher>();
  const matchedSurnames: string[] = [];
  const unmatchedSurnames: string[] = [];
  const ambiguousSurnames: string[] = [];

  for (const rule of SCHOOL_TEACHER_AVAILABILITY_DEFAULTS) {
    const surname = normalizedPersonToken(rule.surname);
    let candidates = plan.teachers.filter(
      (teacher) => surnameKey(teacher) === surname,
    );

    if (candidates.length > 1 && rule.firstName) {
      const firstName = normalizedPersonToken(rule.firstName);
      const narrowed = candidates.filter(
        (teacher) => firstNameKey(teacher) === firstName,
      );
      if (narrowed.length === 1) candidates = narrowed;
    }

    if (candidates.length === 0) {
      unmatchedSurnames.push(rule.surname);
      continue;
    }
    if (candidates.length !== 1) {
      ambiguousSurnames.push(rule.surname);
      continue;
    }

    const teacher = replacements.get(candidates[0]!.id) ?? candidates[0]!;
    replacements.set(teacher.id, {
      ...teacher,
      unavailableDays: mergeDays(
        teacher.unavailableDays,
        rule.unavailableDays ?? [],
      ),
      unavailablePeriods: mergePeriods(
        teacher.unavailablePeriods,
        rule.unavailablePeriods ?? [],
      ),
    });
    matchedSurnames.push(rule.surname);
  }

  return {
    plan: {
      ...plan,
      teachers: plan.teachers.map(
        (teacher) => replacements.get(teacher.id) ?? teacher,
      ),
    },
    matchedSurnames,
    unmatchedSurnames,
    ambiguousSurnames,
  };
}
