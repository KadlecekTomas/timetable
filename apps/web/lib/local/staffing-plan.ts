export const STAFFING_PLAN_STORAGE_KEY = "rozvrhar:staffing-plan:v1";
export const STAFFING_PLAN_CHANGE_EVENT = "rozvrhar:staffing-plan-changed";
export const MAX_WEEKLY_TEACHER_LOAD = 22;

export const STAFFING_DAYS = [
  { code: "MON", shortLabel: "Po", label: "Pondělí", dayIndex: 0 },
  { code: "TUE", shortLabel: "Út", label: "Úterý", dayIndex: 1 },
  { code: "WED", shortLabel: "St", label: "Středa", dayIndex: 2 },
  { code: "THU", shortLabel: "Čt", label: "Čtvrtek", dayIndex: 3 },
  { code: "FRI", shortLabel: "Pá", label: "Pátek", dayIndex: 4 },
] as const;

export type StaffingDayCode = (typeof STAFFING_DAYS)[number]["code"];

export const STAFFING_SUBJECTS = [
  { code: "CJ", label: "Český jazyk" },
  { code: "M", label: "Matematika" },
  { code: "JAZ1", label: "Anglický jazyk" },
  { code: "JAZ2", label: "Německý / druhý cizí jazyk" },
  { code: "INF", label: "Informatika" },
  { code: "TV", label: "Tělesná výchova" },
  { code: "FY", label: "Fyzika" },
  { code: "DEJ", label: "Dějepis" },
  { code: "ZEM", label: "Zeměpis" },
  { code: "PRI", label: "Přírodopis" },
  { code: "CH", label: "Chemie" },
  { code: "OV", label: "Občanská výchova" },
  { code: "VZ", label: "Výchova ke zdraví" },
  { code: "HV", label: "Hudební výchova" },
  { code: "VV", label: "Výtvarná výchova" },
  { code: "PC", label: "Pracovní činnosti" },
  { code: "SVS", label: "Svs" },
  { code: "PKCJ", label: "PkČj" },
  { code: "PRPK", label: "PřPk" },
] as const;

export type StaffingSubjectCode = (typeof STAFFING_SUBJECTS)[number]["code"];

export interface StaffingSubjectLoad {
  id: string;
  subjectCode: string;
  weeklyPeriods: number;
}

export interface StaffingTeacher {
  id: string;
  firstName: string;
  lastName: string;
  targetWeeklyLoad: number;
  subjectLoads: StaffingSubjectLoad[];
  unavailableDays: StaffingDayCode[];
}

export interface StaffingPlan {
  version: 1;
  updatedAt: string;
  teachers: StaffingTeacher[];
}

export interface StaffingTeacherValidation {
  valid: boolean;
  assignedWeeklyLoad: number;
  difference: number;
  messages: string[];
}

function newId(prefix: string): string {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${randomPart}`;
}

export function createEmptySubjectLoad(): StaffingSubjectLoad {
  return { id: newId("subject-load"), subjectCode: "", weeklyPeriods: 0 };
}

export function createEmptyStaffingTeacher(): StaffingTeacher {
  return {
    id: newId("staffing-teacher"),
    firstName: "",
    lastName: "",
    targetWeeklyLoad: 22,
    subjectLoads: [createEmptySubjectLoad()],
    unavailableDays: [],
  };
}

export function createEmptyStaffingPlan(): StaffingPlan {
  return { version: 1, updatedAt: new Date().toISOString(), teachers: [] };
}

export function assignedWeeklyLoad(teacher: StaffingTeacher): number {
  return teacher.subjectLoads.reduce(
    (total, item) =>
      total + (Number.isFinite(item.weeklyPeriods) ? item.weeklyPeriods : 0),
    0,
  );
}

export function validateStaffingTeacher(
  teacher: StaffingTeacher,
): StaffingTeacherValidation {
  const messages: string[] = [];
  const assigned = assignedWeeklyLoad(teacher);
  const target = Number.isFinite(teacher.targetWeeklyLoad)
    ? teacher.targetWeeklyLoad
    : 0;

  if (!teacher.firstName.trim()) messages.push("Doplňte jméno.");
  if (!teacher.lastName.trim()) messages.push("Doplňte příjmení.");
  if (
    !Number.isInteger(target) ||
    target < 0 ||
    target > MAX_WEEKLY_TEACHER_LOAD
  ) {
    messages.push(
      `Úvazek musí být celé číslo od 0 do ${MAX_WEEKLY_TEACHER_LOAD} hodin.`,
    );
  }

  const usedSubjects = new Set<string>();
  for (const item of teacher.subjectLoads) {
    if (!item.subjectCode && item.weeklyPeriods === 0) continue;
    if (!item.subjectCode) {
      messages.push("U každého počtu hodin vyberte předmět.");
      continue;
    }
    if (!Number.isInteger(item.weeklyPeriods) || item.weeklyPeriods <= 0) {
      messages.push(
        `U předmětu ${item.subjectCode} zadejte kladný počet hodin.`,
      );
    }
    if (usedSubjects.has(item.subjectCode)) {
      messages.push(`Předmět ${item.subjectCode} je uveden vícekrát.`);
    }
    usedSubjects.add(item.subjectCode);
  }

  if (usedSubjects.size === 0 && target > 0) {
    messages.push("Doplňte alespoň jeden předmět.");
  }
  if (assigned !== target) {
    const difference = target - assigned;
    messages.push(
      difference > 0
        ? `Ještě chybí rozdělit ${difference} hodin.`
        : `Rozděleno je o ${Math.abs(difference)} hodin více než úvazek.`,
    );
  }

  return {
    valid: messages.length === 0,
    assignedWeeklyLoad: assigned,
    difference: target - assigned,
    messages,
  };
}

export function validateStaffingPlan(plan: StaffingPlan): string[] {
  const messages: string[] = [];
  if (plan.teachers.length === 0)
    messages.push("Přidejte alespoň jednoho učitele.");

  const names = new Set<string>();
  for (const teacher of plan.teachers) {
    const validation = validateStaffingTeacher(teacher);
    messages.push(
      ...validation.messages.map(
        (message) =>
          `${teacher.lastName || "Učitel"} ${teacher.firstName}: ${message}`,
      ),
    );
    const key =
      `${teacher.lastName.trim()}|${teacher.firstName.trim()}`.toLocaleLowerCase(
        "cs-CZ",
      );
    if (key !== "|" && names.has(key)) {
      messages.push(
        `${teacher.lastName} ${teacher.firstName}: učitel je uveden vícekrát.`,
      );
    }
    names.add(key);
  }
  return messages;
}

function normalizePlan(value: unknown): StaffingPlan {
  if (!value || typeof value !== "object") return createEmptyStaffingPlan();
  const candidate = value as Partial<StaffingPlan>;
  if (candidate.version !== 1 || !Array.isArray(candidate.teachers)) {
    return createEmptyStaffingPlan();
  }
  return {
    version: 1,
    updatedAt:
      typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : new Date().toISOString(),
    teachers: candidate.teachers.map((teacher) => ({
      id:
        typeof teacher.id === "string" ? teacher.id : newId("staffing-teacher"),
      firstName: typeof teacher.firstName === "string" ? teacher.firstName : "",
      lastName: typeof teacher.lastName === "string" ? teacher.lastName : "",
      targetWeeklyLoad: Number.isFinite(teacher.targetWeeklyLoad)
        ? Number(teacher.targetWeeklyLoad)
        : 0,
      subjectLoads: Array.isArray(teacher.subjectLoads)
        ? teacher.subjectLoads.map((item) => ({
            id: typeof item.id === "string" ? item.id : newId("subject-load"),
            subjectCode:
              typeof item.subjectCode === "string" ? item.subjectCode : "",
            weeklyPeriods: Number.isFinite(item.weeklyPeriods)
              ? Number(item.weeklyPeriods)
              : 0,
          }))
        : [],
      unavailableDays: Array.isArray(teacher.unavailableDays)
        ? teacher.unavailableDays.filter((day): day is StaffingDayCode =>
            STAFFING_DAYS.some((option) => option.code === day),
          )
        : [],
    })),
  };
}

export function loadStaffingPlan(): StaffingPlan {
  if (typeof window === "undefined") return createEmptyStaffingPlan();
  try {
    const raw = window.localStorage.getItem(STAFFING_PLAN_STORAGE_KEY);
    return raw ? normalizePlan(JSON.parse(raw)) : createEmptyStaffingPlan();
  } catch {
    return createEmptyStaffingPlan();
  }
}

export function saveStaffingPlan(plan: StaffingPlan): StaffingPlan {
  const normalized = normalizePlan({
    ...plan,
    version: 1,
    updatedAt: new Date().toISOString(),
  });
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      STAFFING_PLAN_STORAGE_KEY,
      JSON.stringify(normalized),
    );
    window.dispatchEvent(new Event(STAFFING_PLAN_CHANGE_EVENT));
  }
  return normalized;
}

export function subscribeStaffingPlan(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const storageListener = (event: StorageEvent) => {
    if (event.key === STAFFING_PLAN_STORAGE_KEY) listener();
  };
  window.addEventListener(STAFFING_PLAN_CHANGE_EVENT, listener);
  window.addEventListener("storage", storageListener);
  return () => {
    window.removeEventListener(STAFFING_PLAN_CHANGE_EVENT, listener);
    window.removeEventListener("storage", storageListener);
  };
}

function asciiToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase();
}

export function teacherCodesForPlan(plan: StaffingPlan): Map<string, string> {
  const used = new Set<string>();
  const result = new Map<string, string>();
  for (const teacher of plan.teachers) {
    const surname = asciiToken(teacher.lastName);
    const firstName = asciiToken(teacher.firstName);
    const base = (surname.slice(0, 3) || firstName.slice(0, 3) || "UCI").padEnd(
      3,
      "X",
    );
    let candidate = base;
    if (used.has(candidate))
      candidate = `${base}${firstName.slice(0, 1) || "X"}`;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    result.set(teacher.id, candidate);
  }
  return result;
}
