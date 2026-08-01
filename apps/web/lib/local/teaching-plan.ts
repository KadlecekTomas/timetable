import {
  STAFFING_SUBJECTS,
  type StaffingPlan,
} from "@/lib/local/staffing-plan";

export const TEACHING_PLAN_STORAGE_KEY = "rozvrhar:teaching-plan:v1";
export const TEACHING_PLAN_CHANGE_EVENT = "rozvrhar:teaching-plan-changed";

export type TeachingLessonShape = "SEPARATE" | "DOUBLE" | "MIXED";
export type TeachingOrganization = "WHOLE" | "SPLIT";

export const TEACHING_SHAPES: Array<{
  value: TeachingLessonShape;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    value: "SEPARATE",
    label: "Samostatné hodiny",
    shortLabel: "Po jedné",
    description: "Každá hodina proběhne zvlášť v jiném čase.",
  },
  {
    value: "DOUBLE",
    label: "Pouze dvojhodiny",
    shortLabel: "Dvojhodiny",
    description: "Hodiny budou vždy dvě bezprostředně za sebou.",
  },
  {
    value: "MIXED",
    label: "Kombinace",
    shortLabel: "Kombinace",
    description: "Část proběhne v dvojhodinách a zbytek samostatně.",
  },
];

export const TEACHING_ORGANIZATIONS: Array<{
  value: TeachingOrganization;
  label: string;
  description: string;
}> = [
  {
    value: "WHOLE",
    label: "Celá třída",
    description: "Všichni žáci mají jednoho učitele společně.",
  },
  {
    value: "SPLIT",
    label: "Dvě skupiny",
    description: "Obě skupiny probíhají současně, každá s vlastním učitelem.",
  },
];

export interface TeachingPlanClass {
  id: string;
  code: string;
  grade: number;
}

export interface TeachingPlanRow {
  id: string;
  classCode: string;
  subjectCode: string;
  weeklyPeriods: number;
  lessonShape: TeachingLessonShape;
  doublePeriodsCount: number;
  organization: TeachingOrganization;
  primaryTeacherId: string;
  secondaryTeacherId: string;
}

export interface TeachingPlan {
  version: 1;
  updatedAt: string;
  classes: TeachingPlanClass[];
  rows: TeachingPlanRow[];
}

export interface TeachingPlanRowValidation {
  valid: boolean;
  messages: string[];
  blockDurations: number[];
}

function newId(prefix: string): string {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${randomPart}`;
}

export function classGradeFromCode(code: string): number {
  const match = code.trim().match(/^(\d{1,2})/);
  const grade = match ? Number(match[1]) : 0;
  return Number.isInteger(grade) && grade >= 1 && grade <= 13 ? grade : 0;
}

export function normalizeClassCode(value: string): string {
  return value
    .trim()
    .toLocaleUpperCase("cs-CZ")
    .replace(/\s+/g, "")
    .replace(/^(\d{1,2})([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])$/, "$1.$2");
}

export function createTeachingPlanClass(code = ""): TeachingPlanClass {
  const normalized = normalizeClassCode(code);
  return {
    id: newId("teaching-class"),
    code: normalized,
    grade: classGradeFromCode(normalized),
  };
}

export function createTeachingPlanRow(
  classCode = "",
  subjectCode = "",
): TeachingPlanRow {
  return {
    id: newId("teaching-row"),
    classCode: normalizeClassCode(classCode),
    subjectCode,
    weeklyPeriods: 1,
    lessonShape: "SEPARATE",
    doublePeriodsCount: 0,
    organization: "WHOLE",
    primaryTeacherId: "",
    secondaryTeacherId: "",
  };
}

export function createEmptyTeachingPlan(): TeachingPlan {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    classes: [],
    rows: [],
  };
}

export function lessonBlockDurations(row: TeachingPlanRow): number[] {
  if (!Number.isInteger(row.weeklyPeriods) || row.weeklyPeriods <= 0) return [];
  if (row.lessonShape === "SEPARATE") {
    return Array.from({ length: row.weeklyPeriods }, () => 1);
  }
  if (row.lessonShape === "DOUBLE") {
    if (row.weeklyPeriods % 2 !== 0) return [];
    return Array.from({ length: row.weeklyPeriods / 2 }, () => 2);
  }
  const doubles = Math.max(0, Math.min(row.doublePeriodsCount, 20));
  const singles = row.weeklyPeriods - doubles * 2;
  if (doubles < 1 || singles < 1) return [];
  return [
    ...Array.from({ length: doubles }, () => 2),
    ...Array.from({ length: singles }, () => 1),
  ];
}

export function humanBlockSummary(row: TeachingPlanRow): string {
  const blocks = lessonBlockDurations(row);
  if (blocks.length === 0) return "Neplatné rozložení";
  const doubles = blocks.filter((duration) => duration === 2).length;
  const singles = blocks.filter((duration) => duration === 1).length;
  const parts: string[] = [];
  if (doubles) parts.push(`${doubles}× dvojhodina`);
  if (singles) parts.push(`${singles}× samostatná hodina`);
  return parts.join(" + ");
}

export function validateTeachingPlanRow(
  row: TeachingPlanRow,
  plan: TeachingPlan,
  staffingPlan: StaffingPlan,
): TeachingPlanRowValidation {
  const messages: string[] = [];
  const classCode = normalizeClassCode(row.classCode);
  if (!classCode || !plan.classes.some((item) => item.code === classCode)) {
    messages.push("Vyberte třídu ze seznamu.");
  }
  if (!STAFFING_SUBJECTS.some((item) => item.code === row.subjectCode)) {
    messages.push("Vyberte předmět.");
  }
  if (
    !Number.isInteger(row.weeklyPeriods) ||
    row.weeklyPeriods < 1 ||
    row.weeklyPeriods > 20
  ) {
    messages.push("Počet hodin týdně musí být celé číslo od 1 do 20.");
  }

  if (row.lessonShape === "DOUBLE" && row.weeklyPeriods % 2 !== 0) {
    messages.push("Pouze dvojhodiny vyžadují sudý počet hodin týdně.");
  }
  if (row.lessonShape === "MIXED") {
    if (
      !Number.isInteger(row.doublePeriodsCount) ||
      row.doublePeriodsCount < 1
    ) {
      messages.push("U kombinace zadejte alespoň jednu dvojhodinu.");
    }
    if (row.doublePeriodsCount * 2 >= row.weeklyPeriods) {
      messages.push(
        "Kombinace musí obsahovat dvojhodinu i alespoň jednu samostatnou hodinu.",
      );
    }
  }

  const teacherIds = new Set(
    staffingPlan.teachers.map((teacher) => teacher.id),
  );
  if (!row.primaryTeacherId || !teacherIds.has(row.primaryTeacherId)) {
    messages.push(
      row.organization === "SPLIT"
        ? "Vyberte učitele první skupiny."
        : "Vyberte učitele celé třídy.",
    );
  }
  if (row.organization === "SPLIT") {
    if (!row.secondaryTeacherId || !teacherIds.has(row.secondaryTeacherId)) {
      messages.push("Vyberte učitele druhé skupiny.");
    }
    if (
      row.primaryTeacherId &&
      row.primaryTeacherId === row.secondaryTeacherId
    ) {
      messages.push("Každá skupina musí mít jiného učitele.");
    }
  }

  return {
    valid: messages.length === 0,
    messages,
    blockDurations: lessonBlockDurations(row),
  };
}

export function validateTeachingPlan(
  plan: TeachingPlan,
  staffingPlan: StaffingPlan,
): string[] {
  const messages: string[] = [];
  if (plan.classes.length === 0) messages.push("Přidejte alespoň jednu třídu.");
  if (plan.rows.length === 0) messages.push("Přidejte alespoň jeden předmět.");

  const classCodes = new Set<string>();
  for (const schoolClass of plan.classes) {
    const code = normalizeClassCode(schoolClass.code);
    if (!code) messages.push("Každá třída musí mít označení.");
    if (classCodes.has(code))
      messages.push(`Třída ${code} je uvedena vícekrát.`);
    classCodes.add(code);
  }

  const teachingKeys = new Set<string>();
  for (const row of plan.rows) {
    const validation = validateTeachingPlanRow(row, plan, staffingPlan);
    messages.push(
      ...validation.messages.map(
        (message) =>
          `${row.classCode || "Třída"} ${row.subjectCode || "předmět"}: ${message}`,
      ),
    );
    const key = `${normalizeClassCode(row.classCode)}|${row.subjectCode}`;
    if (teachingKeys.has(key)) {
      messages.push(
        `${row.classCode} ${row.subjectCode}: předmět je pro třídu uveden vícekrát.`,
      );
    }
    teachingKeys.add(key);
  }
  return messages;
}

function normalizeTeachingPlan(value: unknown): TeachingPlan {
  if (!value || typeof value !== "object") return createEmptyTeachingPlan();
  const candidate = value as Partial<TeachingPlan>;
  if (candidate.version !== 1) return createEmptyTeachingPlan();
  return {
    version: 1,
    updatedAt:
      typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : new Date().toISOString(),
    classes: Array.isArray(candidate.classes)
      ? candidate.classes.map((item) => {
          const code = normalizeClassCode(
            typeof item.code === "string" ? item.code : "",
          );
          return {
            id: typeof item.id === "string" ? item.id : newId("teaching-class"),
            code,
            grade:
              Number.isInteger(item.grade) && Number(item.grade) > 0
                ? Number(item.grade)
                : classGradeFromCode(code),
          };
        })
      : [],
    rows: Array.isArray(candidate.rows)
      ? candidate.rows.map((item) => ({
          id: typeof item.id === "string" ? item.id : newId("teaching-row"),
          classCode: normalizeClassCode(
            typeof item.classCode === "string" ? item.classCode : "",
          ),
          subjectCode:
            typeof item.subjectCode === "string" ? item.subjectCode : "",
          weeklyPeriods: Number.isFinite(item.weeklyPeriods)
            ? Number(item.weeklyPeriods)
            : 1,
          lessonShape: ["SEPARATE", "DOUBLE", "MIXED"].includes(
            String(item.lessonShape),
          )
            ? (item.lessonShape as TeachingLessonShape)
            : "SEPARATE",
          doublePeriodsCount: Number.isFinite(item.doublePeriodsCount)
            ? Number(item.doublePeriodsCount)
            : 0,
          organization: ["WHOLE", "SPLIT"].includes(String(item.organization))
            ? (item.organization as TeachingOrganization)
            : "WHOLE",
          primaryTeacherId:
            typeof item.primaryTeacherId === "string"
              ? item.primaryTeacherId
              : "",
          secondaryTeacherId:
            typeof item.secondaryTeacherId === "string"
              ? item.secondaryTeacherId
              : "",
        }))
      : [],
  };
}

export function loadTeachingPlan(): TeachingPlan {
  if (typeof window === "undefined") return createEmptyTeachingPlan();
  try {
    const raw = window.localStorage.getItem(TEACHING_PLAN_STORAGE_KEY);
    return raw
      ? normalizeTeachingPlan(JSON.parse(raw))
      : createEmptyTeachingPlan();
  } catch {
    return createEmptyTeachingPlan();
  }
}

export function saveTeachingPlan(plan: TeachingPlan): TeachingPlan {
  const normalized = normalizeTeachingPlan({
    ...plan,
    updatedAt: new Date().toISOString(),
  });
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      TEACHING_PLAN_STORAGE_KEY,
      JSON.stringify(normalized),
    );
    window.dispatchEvent(new Event(TEACHING_PLAN_CHANGE_EVENT));
  }
  return normalized;
}
