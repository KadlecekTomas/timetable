export const generationStatusLabels: Record<string, string> = {
  QUEUED: "Ve frontě",
  RUNNING: "Probíhá výpočet",
  FEASIBLE: "Proveditelný návrh",
  OPTIMAL: "Optimální návrh",
  INFEASIBLE: "Řešení nebylo nalezeno",
  FAILED: "Výpočet selhal",
  CANCELLED: "Zrušeno",
};

export const importSeverityLabels: Record<string, string> = {
  ERROR: "Chyba",
  WARNING: "Varování",
};

export const importSummaryLabels: Record<string, string> = {
  teachers: "Učitelé",
  classes: "Třídy",
  subjects: "Předměty",
  rooms: "Učebny",
  assignments: "Výukové vazby",
  availabilityRules: "Pravidla dostupnosti",
  fixedLessons: "Pevně umístěné hodiny",
  requiredWeeklyPeriods: "Požadováno h/týden",
  coveredWeeklyPeriods: "Pokryto h/týden",
  uncoveredWeeklyPeriods: "Chybí pokrýt h/týden",
  coveragePercent: "Pokrytí v %",
};

export const teachingGroupLabels: Record<string, string> = {
  WHOLE: "Celá třída",
  GROUP_1: "Skupina 1",
  GROUP_2: "Skupina 2",
};

export const lessonShapeLabels: Record<string, string> = {
  SINGLE: "Jednotlivé hodiny",
  DOUBLE: "Dvojhodiny",
  MIXED: "Kombinace hodin a dvojhodin",
};

export const availabilityKindLabels: Record<string, string> = {
  UNAVAILABLE: "Nedostupné",
  PREFERRED: "Upřednostněné",
  DISCOURAGED: "Nevhodné",
};

export const entityTypeLabels: Record<string, string> = {
  TEACHER: "Učitel",
  CLASS: "Třída",
  ROOM: "Učebna",
};
