import {
  STAFFING_SUBJECTS,
  type StaffingPlan,
} from "@/lib/local/staffing-plan";

export const TEACHING_PLAN_STORAGE_KEY = "rozvrhar:teaching-plan:v1";
export const TEACHING_PLAN_CHANGE_EVENT = "rozvrhar:teaching-plan-changed";

export type TeachingLessonShape = "SEPARATE" | "DOUBLE" | "MIXED";
export type TeachingOrganization = "WHOLE" | "SPLIT" | "ROTATION";
export type TeachingClassProfile = "REGULAR" | "SPORTS" | "CUSTOM";
export type TeachingRotationPlacement = "ADJACENT" | "SAME_DAY" | "FLEXIBLE";

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
    label: "Dvě skupiny – stejný předmět",
    description: "Obě skupiny probíhají současně, každá s vlastním učitelem.",
  },
  {
    value: "ROTATION",
    label: "Dvě skupiny – výměna předmětů",
    description:
      "Skupiny mají současně dva různé předměty a v druhém rameni si je přesně prohodí.",
  },
];

export const TEACHING_ROTATION_PLACEMENTS: Array<{
  value: TeachingRotationPlacement;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    value: "ADJACENT",
    label: "Hned po sobě",
    shortLabel: "Bezprostředně",
    description:
      "Druhé rameno začne okamžitě po prvním. Pořadí obou ramen vybere algoritmus.",
  },
  {
    value: "SAME_DAY",
    label: "Ve stejný den",
    shortLabel: "Stejný den",
    description:
      "Ramena mohou být ráno a odpoledne, ale obě proběhnou v jednom dni.",
  },
  {
    value: "FLEXIBLE",
    label: "Kdykoliv během týdne",
    shortLabel: "Flexibilně",
    description:
      "Použijte jen při složitých dostupnostech. Algoritmus je stále drží co nejblíž.",
  },
];

export const TEACHING_CLASS_PROFILES: Array<{
  value: TeachingClassProfile;
  label: string;
  description: string;
}> = [
  {
    value: "REGULAR",
    label: "Běžná třída",
    description: "Standardní hodinová dotace školy.",
  },
  {
    value: "SPORTS",
    label: "Sportovní třída",
    description: "Může mít vlastní dotace a větší počet sportovních bloků.",
  },
  {
    value: "CUSTOM",
    label: "Vlastní profil",
    description: "Individuální vzdělávací skladba této konkrétní třídy.",
  },
];

export interface TeachingPlanClass {
  id: string;
  code: string;
  grade: number;
  profile?: TeachingClassProfile;
}

export interface TeachingPlanRow {
  id: string;
  classCode: string;
  subjectCode: string;
  secondarySubjectCode?: string;
  weeklyPeriods: number;
  lessonShape: TeachingLessonShape;
  doublePeriodsCount: number;
  organization: TeachingOrganization;
  rotationPlacement?: TeachingRotationPlacement;
  primaryTeacherId: string;
  secondaryTeacherId: string;
  tertiaryTeacherId?: string;
  splitGroupCount?: 2 | 3;
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

export function inferredClassProfile(code: string): TeachingClassProfile {
  const normalized = normalizeClassCode(code);
  return /\.(B|D)$/.test(normalized) ? "SPORTS" : "REGULAR";
}

export function classProfileLabel(profile: TeachingClassProfile): string {
  return (
    TEACHING_CLASS_PROFILES.find((item) => item.value === profile)?.label ??
    profile
  );
}

export function createTeachingPlanClass(code = ""): TeachingPlanClass {
  const normalized = normalizeClassCode(code);
  return {
    id: newId("teaching-class"),
    code: normalized,
    grade: classGradeFromCode(normalized),
    profile: inferredClassProfile(normalized),
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
    secondarySubjectCode: "",
    weeklyPeriods: 1,
    lessonShape: "SEPARATE",
    doublePeriodsCount: 0,
    organization: "WHOLE",
    rotationPlacement: "SAME_DAY",
    primaryTeacherId: "",
    secondaryTeacherId: "",
    tertiaryTeacherId: "",
    splitGroupCount: 2,
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

export function rowClassPeriods(row: TeachingPlanRow): number {
  return row.organization === "ROTATION"
    ? row.weeklyPeriods * 2
    : row.weeklyPeriods;
}

export function rowTeacherPeriods(
  row: TeachingPlanRow,
  teacherId: string,
): number {
  if (row.organization === "ROTATION") {
    return row.primaryTeacherId === teacherId ||
      row.secondaryTeacherId === teacherId
      ? row.weeklyPeriods * 2
      : 0;
  }
  if (row.primaryTeacherId === teacherId) return row.weeklyPeriods;
  if (row.organization === "SPLIT" && row.secondaryTeacherId === teacherId) {
    return row.weeklyPeriods;
  }
  if (
    row.organization === "SPLIT" &&
    row.splitGroupCount === 3 &&
    row.tertiaryTeacherId === teacherId
  ) {
    return row.weeklyPeriods;
  }
  return 0;
}

export function rotationPlacementLabel(
  placement: TeachingRotationPlacement | undefined,
): string {
  return (
    TEACHING_ROTATION_PLACEMENTS.find(
      (item) => item.value === (placement ?? "SAME_DAY"),
    )?.label ?? "Ve stejný den"
  );
}

export function rotationSummary(row: TeachingPlanRow): string {
  if (row.organization !== "ROTATION") return "";
  return `1. rameno: skupina 1 ${row.subjectCode} / skupina 2 ${row.secondarySubjectCode} → 2. rameno: skupina 1 ${row.secondarySubjectCode} / skupina 2 ${row.subjectCode} · ${rotationPlacementLabel(row.rotationPlacement)}`;
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
  if (row.organization === "ROTATION") {
    if (
      !STAFFING_SUBJECTS.some((item) => item.code === row.secondarySubjectCode)
    ) {
      messages.push("Vyberte druhý předmět pro výměnu skupin.");
    }
    if (row.subjectCode && row.subjectCode === row.secondarySubjectCode) {
      messages.push("Při výměně musí být zvoleny dva různé předměty.");
    }
    if (
      !["ADJACENT", "SAME_DAY", "FLEXIBLE"].includes(
        String(row.rotationPlacement ?? "SAME_DAY"),
      )
    ) {
      messages.push("Vyberte, kdy se mají obě ramena výměny uskutečnit.");
    }
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
      row.organization === "WHOLE"
        ? "Vyberte učitele celé třídy."
        : row.organization === "ROTATION"
          ? "Vyberte učitele prvního předmětu."
          : "Vyberte učitele první skupiny.",
    );
  }
  if (row.organization !== "WHOLE") {
    if (!row.secondaryTeacherId || !teacherIds.has(row.secondaryTeacherId)) {
      messages.push(
        row.organization === "ROTATION"
          ? "Vyberte učitele druhého předmětu."
          : "Vyberte učitele druhé skupiny.",
      );
    }
    if (
      row.primaryTeacherId &&
      row.primaryTeacherId === row.secondaryTeacherId
    ) {
      messages.push(
        row.organization === "ROTATION"
          ? "Dva různé předměty musí mít dva různé učitele."
          : "Každá skupina musí mít jiného učitele.",
      );
    }
    if (row.organization === "SPLIT" && row.splitGroupCount === 3) {
      if (!row.tertiaryTeacherId || !teacherIds.has(row.tertiaryTeacherId)) {
        messages.push("Vyberte učitele třetí skupiny.");
      }
      if (
        row.tertiaryTeacherId &&
        [row.primaryTeacherId, row.secondaryTeacherId].includes(
          row.tertiaryTeacherId,
        )
      ) {
        messages.push("Každá ze tří skupin musí mít jiného učitele.");
      }
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
    const subjectCodes = [
      row.subjectCode,
      ...(row.organization === "ROTATION" ? [row.secondarySubjectCode] : []),
    ].filter(Boolean);
    for (const subjectCode of subjectCodes) {
      const key = `${normalizeClassCode(row.classCode)}|${subjectCode}`;
      if (teachingKeys.has(key)) {
        messages.push(
          `${row.classCode} ${subjectCode}: předmět je pro třídu uveden vícekrát.`,
        );
      }
      teachingKeys.add(key);
    }
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
          const profile = ["REGULAR", "SPORTS", "CUSTOM"].includes(
            String(item.profile),
          )
            ? (item.profile as TeachingClassProfile)
            : inferredClassProfile(code);
          return {
            id: typeof item.id === "string" ? item.id : newId("teaching-class"),
            code,
            grade:
              Number.isInteger(item.grade) && Number(item.grade) > 0
                ? Number(item.grade)
                : classGradeFromCode(code),
            profile,
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
          secondarySubjectCode:
            typeof item.secondarySubjectCode === "string"
              ? item.secondarySubjectCode
              : "",
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
          organization: ["WHOLE", "SPLIT", "ROTATION"].includes(
            String(item.organization),
          )
            ? (item.organization as TeachingOrganization)
            : "WHOLE",
          rotationPlacement: ["ADJACENT", "SAME_DAY", "FLEXIBLE"].includes(
            String(item.rotationPlacement),
          )
            ? (item.rotationPlacement as TeachingRotationPlacement)
            : "SAME_DAY",
          primaryTeacherId:
            typeof item.primaryTeacherId === "string"
              ? item.primaryTeacherId
              : "",
          secondaryTeacherId:
            typeof item.secondaryTeacherId === "string"
              ? item.secondaryTeacherId
              : "",
          tertiaryTeacherId:
            typeof item.tertiaryTeacherId === "string"
              ? item.tertiaryTeacherId
              : "",
          splitGroupCount: item.splitGroupCount === 3 ? 3 : 2,
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

export function subscribeTeachingPlan(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const storageListener = (event: StorageEvent) => {
    if (event.key === TEACHING_PLAN_STORAGE_KEY) listener();
  };
  window.addEventListener(TEACHING_PLAN_CHANGE_EVENT, listener);
  window.addEventListener("storage", storageListener);
  return () => {
    window.removeEventListener(TEACHING_PLAN_CHANGE_EVENT, listener);
    window.removeEventListener("storage", storageListener);
  };
}
