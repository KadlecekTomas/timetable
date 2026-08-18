import ExcelJS from "exceljs";

import {
  teacherCodesForPlan,
  type StaffingPlan,
} from "@/lib/local/staffing-plan";
import type { TeachingPlan } from "@/lib/local/teaching-plan";
import type { TeachingPlanWorkbookAnalysis } from "./teaching-plan-workbook";

const TEACHING_PLAN_SHEET = "Výuka tříd";
const PLAN_FIRST_ROW = 6;

function teacherLabels(staffingPlan: StaffingPlan): Map<string, string> {
  const codes = teacherCodesForPlan(staffingPlan);
  return new Map(
    staffingPlan.teachers.map((teacher) => [
      teacher.id,
      `${codes.get(teacher.id)} · ${teacher.firstName} ${teacher.lastName}`.trim(),
    ]),
  );
}

function teacherLookup(staffingPlan: StaffingPlan): Map<string, string> {
  const codes = teacherCodesForPlan(staffingPlan);
  const lookup = new Map<string, string>();
  for (const teacher of staffingPlan.teachers) {
    const code = codes.get(teacher.id) ?? "";
    const fullName = `${teacher.firstName} ${teacher.lastName}`.trim();
    for (const value of [code, fullName, `${code} · ${fullName}`.trim()]) {
      if (value) lookup.set(value.toLocaleUpperCase("cs-CZ"), teacher.id);
    }
  }
  return lookup;
}

function cellText(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * The legacy workbook layer originally exposed the third teacher only for JAZ1.
 * The current school also has three parallel TV groups, so keep GROUP_3 when
 * exporting the technical workbook used by the editor roundtrip.
 */
export async function preserveThreeGroupTvOnExport(
  input: Uint8Array,
  staffingPlan: StaffingPlan,
  existingPlan?: TeachingPlan,
): Promise<Uint8Array> {
  if (!existingPlan?.rows.some(
    (row) =>
      row.subjectCode === "TV" &&
      row.organization === "SPLIT" &&
      row.splitGroupCount === 3 &&
      Boolean(row.tertiaryTeacherId),
  )) {
    return input;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input as never);
  const sheet = workbook.getWorksheet(TEACHING_PLAN_SHEET);
  if (!sheet) return input;

  const labels = teacherLabels(staffingPlan);
  const regularRows = existingPlan.rows.filter(
    (row) => row.organization !== "ROTATION",
  );

  regularRows.forEach((row, index) => {
    if (
      row.subjectCode !== "TV" ||
      row.organization !== "SPLIT" ||
      row.splitGroupCount !== 3 ||
      !row.tertiaryTeacherId
    ) {
      return;
    }
    sheet.getCell(PLAN_FIRST_ROW + index, 9).value =
      labels.get(row.tertiaryTeacherId) ?? null;
  });

  sheet.getCell("I5").value = "Učitel skupiny 3 (AJ / TV)";
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/**
 * Repair the legacy parser result for a real three-group TV row. We only
 * suppress the old "third group only English" error when the third teacher is
 * a known staffing teacher and the source row is explicitly TV + SPLIT.
 */
export async function preserveThreeGroupTvOnImport(
  input: ArrayBuffer | Uint8Array,
  staffingPlan: StaffingPlan,
  analysis: TeachingPlanWorkbookAnalysis,
): Promise<TeachingPlanWorkbookAnalysis> {
  const workbook = new ExcelJS.Workbook();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  await workbook.xlsx.load(bytes as never);
  const sheet = workbook.getWorksheet(TEACHING_PLAN_SHEET);
  if (!sheet) return analysis;

  const lookup = teacherLookup(staffingPlan);
  const repairedRows = new Set<number>();
  const rows = analysis.plan.rows.map((planRow) => {
    const match = /^teaching-row-(\d+)$/.exec(planRow.id);
    if (!match) return planRow;
    const rowNumber = Number(match[1]);
    const subjectCode = cellText(sheet.getCell(rowNumber, 2).value).toLocaleUpperCase(
      "cs-CZ",
    );
    const organization = cellText(sheet.getCell(rowNumber, 6).value);
    const rawThirdTeacher = cellText(sheet.getCell(rowNumber, 9).value);
    if (
      subjectCode !== "TV" ||
      organization !== "Dvě skupiny" ||
      !rawThirdTeacher
    ) {
      return planRow;
    }

    const tertiaryTeacherId =
      lookup.get(rawThirdTeacher.toLocaleUpperCase("cs-CZ")) ?? "";
    if (!tertiaryTeacherId) return planRow;
    if (
      tertiaryTeacherId === planRow.primaryTeacherId ||
      tertiaryTeacherId === planRow.secondaryTeacherId
    ) {
      return planRow;
    }

    repairedRows.add(rowNumber);
    return {
      ...planRow,
      tertiaryTeacherId,
      splitGroupCount: 3 as const,
    };
  });

  if (repairedRows.size === 0) return analysis;

  const issues = analysis.issues.filter(
    (issue) =>
      !(
        issue.sheet === TEACHING_PLAN_SHEET &&
        issue.row !== null &&
        repairedRows.has(issue.row) &&
        issue.field === "Učitel skupiny 3" &&
        issue.message.includes("pouze u dělené angličtiny")
      ),
  );

  return {
    ...analysis,
    valid: issues.every((issue) => issue.severity !== "ERROR"),
    plan: { ...analysis.plan, rows },
    issues,
  };
}
