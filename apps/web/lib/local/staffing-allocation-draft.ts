export const STAFFING_ALLOCATION_DRAFT_STORAGE_KEY =
  "rozvrhar:staffing-allocation-draft:v1";

export type StaffingAllocationGroup = "WHOLE" | "GROUP_1" | "GROUP_2";

export interface StaffingAllocationDraftRow {
  classCode: string;
  subjectCode: string;
  weeklyPeriods: number;
  group: StaffingAllocationGroup;
  teacherIds: string[];
  sourceSheet: string;
  sourceRow: number;
}

export interface StaffingAllocationDraft {
  version: 1;
  source: "LEGACY_SCHOOL_MATRIX";
  rows: StaffingAllocationDraftRow[];
}

function normalize(value: unknown): StaffingAllocationDraft | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StaffingAllocationDraft>;
  if (
    candidate.version !== 1 ||
    candidate.source !== "LEGACY_SCHOOL_MATRIX" ||
    !Array.isArray(candidate.rows)
  ) {
    return null;
  }

  const rows = candidate.rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Partial<StaffingAllocationDraftRow>;
    if (
      typeof item.classCode !== "string" ||
      typeof item.subjectCode !== "string" ||
      !Number.isInteger(item.weeklyPeriods) ||
      Number(item.weeklyPeriods) <= 0 ||
      !["WHOLE", "GROUP_1", "GROUP_2"].includes(String(item.group)) ||
      !Array.isArray(item.teacherIds) ||
      typeof item.sourceSheet !== "string" ||
      !Number.isInteger(item.sourceRow)
    ) {
      return [];
    }
    return [
      {
        classCode: item.classCode,
        subjectCode: item.subjectCode,
        weeklyPeriods: Number(item.weeklyPeriods),
        group: item.group as StaffingAllocationGroup,
        teacherIds: item.teacherIds.filter(
          (teacherId): teacherId is string => typeof teacherId === "string",
        ),
        sourceSheet: item.sourceSheet,
        sourceRow: Number(item.sourceRow),
      },
    ];
  });

  return { version: 1, source: "LEGACY_SCHOOL_MATRIX", rows };
}

export function loadStaffingAllocationDraft(): StaffingAllocationDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(
      STAFFING_ALLOCATION_DRAFT_STORAGE_KEY,
    );
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveStaffingAllocationDraft(
  draft: StaffingAllocationDraft,
): StaffingAllocationDraft {
  const normalized = normalize(draft);
  if (!normalized) throw new Error("Neplatný návrh přiřazení učitelů.");
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      STAFFING_ALLOCATION_DRAFT_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  }
  return normalized;
}

export function clearStaffingAllocationDraft(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STAFFING_ALLOCATION_DRAFT_STORAGE_KEY);
  }
}
