import type { TeachingPlanWorkbookAnalysis } from "@/lib/import/teaching-plan-workbook";
import type { TeachingPlan } from "@/lib/local/teaching-plan";

export const TEACHING_PLAN_IMPORT_REVIEW_STORAGE_KEY =
  "rozvrhar:teaching-plan-import-review:v1";

export interface PendingTeachingPlanImport {
  version: 1;
  fileName: string;
  schoolYearId: string;
  createdAt: string;
  plan: TeachingPlan;
  summary: TeachingPlanWorkbookAnalysis["summary"];
}

export function createPendingTeachingPlanImport(input: {
  fileName: string;
  schoolYearId: string;
  analysis: TeachingPlanWorkbookAnalysis;
}): PendingTeachingPlanImport {
  return {
    version: 1,
    fileName: input.fileName,
    schoolYearId: input.schoolYearId,
    createdAt: new Date().toISOString(),
    plan: input.analysis.plan,
    summary: input.analysis.summary,
  };
}

export function savePendingTeachingPlanImport(
  pending: PendingTeachingPlanImport,
): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    TEACHING_PLAN_IMPORT_REVIEW_STORAGE_KEY,
    JSON.stringify(pending),
  );
}

export function loadPendingTeachingPlanImport(): PendingTeachingPlanImport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(
      TEACHING_PLAN_IMPORT_REVIEW_STORAGE_KEY,
    );
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingTeachingPlanImport>;
    if (
      value.version !== 1 ||
      typeof value.fileName !== "string" ||
      typeof value.schoolYearId !== "string" ||
      typeof value.createdAt !== "string" ||
      !value.plan ||
      value.plan.version !== 1 ||
      !Array.isArray(value.plan.classes) ||
      !Array.isArray(value.plan.rows) ||
      !value.summary
    ) {
      return null;
    }
    return value as PendingTeachingPlanImport;
  } catch {
    return null;
  }
}

export function clearPendingTeachingPlanImport(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(TEACHING_PLAN_IMPORT_REVIEW_STORAGE_KEY);
}
