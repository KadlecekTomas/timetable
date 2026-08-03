import ExcelJS from "exceljs";

import type { StaffingPlan } from "@/lib/local/staffing-plan";
import type { TeachingPlan } from "@/lib/local/teaching-plan";
import {
  TEACHING_CLASSES_SHEET,
  TEACHING_PLAN_SHEET,
  TEACHING_ROTATIONS_SHEET,
  analyzeTeachingPlanWorkbook,
  createTeachingPlanWorkbook as createLegacyTeachingPlanWorkbook,
  type TeachingPlanWorkbookAnalysis,
  type TeachingPlanWorkbookIssue,
} from "./teaching-plan-workbook";

export {
  analyzeTeachingPlanWorkbook,
  type TeachingPlanWorkbookAnalysis,
  type TeachingPlanWorkbookIssue,
};

const SCHOOL_CLASSES = [
  "6.A",
  "6.B",
  "6.C",
  "6.D",
  "7.A",
  "7.B",
  "7.C",
  "8.A",
  "8.B",
  "8.C",
  "9.A",
  "9.B",
  "9.C",
] as const;

type SubjectAllocation = Array<{
  subjectCode: string;
  weeklyPeriods: number;
}>;

/**
 * Hodinové dotace podle ŠVP FZŠ Chodovická platného od 1. 9. 2023.
 * B a D jsou sportovní třídy, A a C běžné třídy.
 * Volitelné předměty jsou předvyplněné technickými zástupci a vedení školy
 * je musí nahradit skutečnou nabídkou pro daný školní rok.
 */
const REGULAR_SUBJECTS_BY_GRADE: Record<number, SubjectAllocation> = {
  6: [
    { subjectCode: "CJ", weeklyPeriods: 5 },
    { subjectCode: "M", weeklyPeriods: 4 },
    { subjectCode: "JAZ1", weeklyPeriods: 4 },
    { subjectCode: "INF", weeklyPeriods: 1 },
    { subjectCode: "DEJ", weeklyPeriods: 2 },
    { subjectCode: "OV", weeklyPeriods: 1 },
    { subjectCode: "FY", weeklyPeriods: 2 },
    { subjectCode: "PRI", weeklyPeriods: 2 },
    { subjectCode: "ZEM", weeklyPeriods: 2 },
    { subjectCode: "HV", weeklyPeriods: 1 },
    { subjectCode: "VV", weeklyPeriods: 2 },
    { subjectCode: "TV", weeklyPeriods: 2 },
    { subjectCode: "PC", weeklyPeriods: 1 },
    { subjectCode: "PKCJ", weeklyPeriods: 1 },
  ],
  7: [
    { subjectCode: "CJ", weeklyPeriods: 4 },
    { subjectCode: "M", weeklyPeriods: 5 },
    { subjectCode: "JAZ1", weeklyPeriods: 3 },
    { subjectCode: "INF", weeklyPeriods: 1 },
    { subjectCode: "DEJ", weeklyPeriods: 2 },
    { subjectCode: "OV", weeklyPeriods: 1 },
    { subjectCode: "FY", weeklyPeriods: 2 },
    { subjectCode: "PRI", weeklyPeriods: 2 },
    { subjectCode: "ZEM", weeklyPeriods: 2 },
    { subjectCode: "HV", weeklyPeriods: 1 },
    { subjectCode: "VV", weeklyPeriods: 2 },
    { subjectCode: "TV", weeklyPeriods: 2 },
    { subjectCode: "VZ", weeklyPeriods: 1 },
    { subjectCode: "PC", weeklyPeriods: 1 },
    { subjectCode: "PKCJ", weeklyPeriods: 1 },
    { subjectCode: "PRPK", weeklyPeriods: 1 },
  ],
  8: [
    { subjectCode: "CJ", weeklyPeriods: 4 },
    { subjectCode: "M", weeklyPeriods: 4 },
    { subjectCode: "JAZ1", weeklyPeriods: 3 },
    { subjectCode: "JAZ2", weeklyPeriods: 3 },
    { subjectCode: "INF", weeklyPeriods: 1 },
    { subjectCode: "DEJ", weeklyPeriods: 2 },
    { subjectCode: "OV", weeklyPeriods: 1 },
    { subjectCode: "FY", weeklyPeriods: 1 },
    { subjectCode: "CH", weeklyPeriods: 2 },
    { subjectCode: "PRI", weeklyPeriods: 2 },
    { subjectCode: "ZEM", weeklyPeriods: 1 },
    { subjectCode: "HV", weeklyPeriods: 1 },
    { subjectCode: "VV", weeklyPeriods: 1 },
    { subjectCode: "TV", weeklyPeriods: 2 },
    { subjectCode: "VZ", weeklyPeriods: 1 },
    { subjectCode: "PC", weeklyPeriods: 1 },
    { subjectCode: "PKCJ", weeklyPeriods: 1 },
  ],
  9: [
    { subjectCode: "CJ", weeklyPeriods: 4 },
    { subjectCode: "M", weeklyPeriods: 4 },
    { subjectCode: "JAZ1", weeklyPeriods: 4 },
    { subjectCode: "JAZ2", weeklyPeriods: 3 },
    { subjectCode: "INF", weeklyPeriods: 1 },
    { subjectCode: "DEJ", weeklyPeriods: 2 },
    { subjectCode: "OV", weeklyPeriods: 1 },
    { subjectCode: "FY", weeklyPeriods: 2 },
    { subjectCode: "CH", weeklyPeriods: 2 },
    { subjectCode: "PRI", weeklyPeriods: 1 },
    { subjectCode: "ZEM", weeklyPeriods: 2 },
    { subjectCode: "VV", weeklyPeriods: 1 },
    { subjectCode: "TV", weeklyPeriods: 2 },
    { subjectCode: "PKCJ", weeklyPeriods: 1 },
  ],
};

const SPORTS_SUBJECTS_BY_GRADE: Record<number, SubjectAllocation> = {
  6: [
    { subjectCode: "CJ", weeklyPeriods: 4 },
    { subjectCode: "M", weeklyPeriods: 4 },
    { subjectCode: "JAZ1", weeklyPeriods: 3 },
    { subjectCode: "INF", weeklyPeriods: 1 },
    { subjectCode: "DEJ", weeklyPeriods: 2 },
    { subjectCode: "OV", weeklyPeriods: 1 },
    { subjectCode: "FY", weeklyPeriods: 2 },
    { subjectCode: "PRI", weeklyPeriods: 2 },
    { subjectCode: "ZEM", weeklyPeriods: 2 },
    { subjectCode: "HV", weeklyPeriods: 1 },
    { subjectCode: "VV", weeklyPeriods: 2 },
    { subjectCode: "TV", weeklyPeriods: 5 },
    { subjectCode: "PC", weeklyPeriods: 1 },
  ],
  7: [
    { subjectCode: "CJ", weeklyPeriods: 4 },
    { subjectCode: "M", weeklyPeriods: 4 },
    { subjectCode: "JAZ1", weeklyPeriods: 3 },
    { subjectCode: "INF", weeklyPeriods: 1 },
    { subjectCode: "DEJ", weeklyPeriods: 2 },
    { subjectCode: "OV", weeklyPeriods: 1 },
    { subjectCode: "FY", weeklyPeriods: 2 },
    { subjectCode: "PRI", weeklyPeriods: 2 },
    { subjectCode: "ZEM", weeklyPeriods: 2 },
    { subjectCode: "HV", weeklyPeriods: 1 },
    { subjectCode: "VV", weeklyPeriods: 2 },
    { subjectCode: "TV", weeklyPeriods: 5 },
    { subjectCode: "PC", weeklyPeriods: 1 },
  ],
  8: [
    { subjectCode: "CJ", weeklyPeriods: 5 },
    { subjectCode: "M", weeklyPeriods: 4 },
    { subjectCode: "JAZ1", weeklyPeriods: 3 },
    { subjectCode: "JAZ2", weeklyPeriods: 3 },
    { subjectCode: "INF", weeklyPeriods: 1 },
    { subjectCode: "DEJ", weeklyPeriods: 2 },
    { subjectCode: "OV", weeklyPeriods: 1 },
    { subjectCode: "FY", weeklyPeriods: 1 },
    { subjectCode: "CH", weeklyPeriods: 2 },
    { subjectCode: "PRI", weeklyPeriods: 1 },
    { subjectCode: "ZEM", weeklyPeriods: 1 },
    { subjectCode: "HV", weeklyPeriods: 1 },
    { subjectCode: "VV", weeklyPeriods: 1 },
    { subjectCode: "TV", weeklyPeriods: 5 },
    { subjectCode: "PC", weeklyPeriods: 1 },
  ],
  9: [
    { subjectCode: "CJ", weeklyPeriods: 4 },
    { subjectCode: "M", weeklyPeriods: 5 },
    { subjectCode: "JAZ1", weeklyPeriods: 3 },
    { subjectCode: "JAZ2", weeklyPeriods: 3 },
    { subjectCode: "INF", weeklyPeriods: 1 },
    { subjectCode: "DEJ", weeklyPeriods: 2 },
    { subjectCode: "OV", weeklyPeriods: 1 },
    { subjectCode: "FY", weeklyPeriods: 1 },
    { subjectCode: "CH", weeklyPeriods: 2 },
    { subjectCode: "PRI", weeklyPeriods: 1 },
    { subjectCode: "ZEM", weeklyPeriods: 1 },
    { subjectCode: "VV", weeklyPeriods: 1 },
    { subjectCode: "TV", weeklyPeriods: 4 },
    { subjectCode: "PKCJ", weeklyPeriods: 1 },
  ],
};

function isSportsClass(code: string): boolean {
  return /\.(B|D)$/.test(code);
}

function classProfile(code: string): string {
  return isSportsClass(code) ? "Sportovní třída" : "Běžná třída";
}

function subjectsForClass(code: string): SubjectAllocation {
  const grade = Number(code.split(".")[0]);
  return (
    (isSportsClass(code)
      ? SPORTS_SUBJECTS_BY_GRADE
      : REGULAR_SUBJECTS_BY_GRADE)[grade] ?? []
  );
}

function ensureSchoolClasses(workbook: ExcelJS.Workbook): void {
  const classes = workbook.getWorksheet(TEACHING_CLASSES_SHEET);
  if (!classes) return;

  SCHOOL_CLASSES.forEach((code, index) => {
    const row = 5 + index;
    classes.getCell(row, 1).value = code;
    classes.getCell(row, 2).value = Number(code.split(".")[0]);
    classes.getCell(row, 3).value = classProfile(code);
  });

  classes.state = "veryHidden";
}

function hasTeachingRows(plan: ExcelJS.Worksheet): boolean {
  for (let row = 6; row <= 305; row += 1) {
    if (String(plan.getCell(row, 1).value ?? "").trim()) return true;
  }
  return false;
}

function seedSampleTeachingRows(workbook: ExcelJS.Workbook): void {
  const plan = workbook.getWorksheet(TEACHING_PLAN_SHEET);
  if (!plan || hasTeachingRows(plan)) return;

  let row = 6;
  for (const classCode of SCHOOL_CLASSES) {
    for (const subject of subjectsForClass(classCode)) {
      plan.getCell(row, 1).value = classCode;
      plan.getCell(row, 2).value = subject.subjectCode;
      plan.getCell(row, 3).value = subject.weeklyPeriods;
      plan.getCell(row, 4).value = "Samostatné hodiny";
      plan.getCell(row, 5).value = null;
      plan.getCell(row, 6).value = "Celá třída";
      plan.getCell(row, 7).value = null;
      plan.getCell(row, 8).value = null;
      row += 1;
    }
  }
}

function simplifyTeachingSheet(workbook: ExcelJS.Workbook): void {
  const plan = workbook.getWorksheet(TEACHING_PLAN_SHEET);
  if (!plan) return;

  plan.getCell("A1").value = "PŘIŘAZENÍ UČITELŮ K VÝUCE";
  plan.getCell("A2").value =
    "Třídy, předměty a hodinové dotace jsou předvyplněné podle ŠVP FZŠ Chodovická platného od 1. 9. 2023.";
  plan.getCell("A3").value =
    "DŮLEŽITÉ: u volitelných předmětů nahraďte zástupné řádky skutečnou nabídkou pro daný školní rok.";
  plan.getCell("A4").value =
    "Sportovní třídy B/D mají samostatnou dotaci podle ŠVP. Druhého učitele vyplňte jen u dělené výuky.";

  plan.getCell(5, 1).value = "Třída";
  plan.getCell(5, 2).value = "Předmět";
  plan.getCell(5, 3).value = "Hodin týdně";
  plan.getCell(5, 7).value = "Učitel";
  plan.getCell(5, 8).value = "Druhý učitel (jen při dělení)";

  for (const column of [4, 5, 6, 9, 10]) {
    plan.getColumn(column).hidden = true;
  }

  plan.getColumn(1).width = 14;
  plan.getColumn(2).width = 24;
  plan.getColumn(3).width = 16;
  plan.getColumn(7).width = 34;
  plan.getColumn(8).width = 34;
  plan.autoFilter = { from: "A5", to: "H5" };
}

function hideAdvancedSheets(workbook: ExcelJS.Workbook): void {
  const rotations = workbook.getWorksheet(TEACHING_ROTATIONS_SHEET);
  if (rotations) rotations.state = "hidden";
}

export async function createTeachingPlanWorkbook(
  staffingPlan: StaffingPlan,
  existingPlan?: TeachingPlan,
): Promise<Uint8Array> {
  const source = await createLegacyTeachingPlanWorkbook(
    staffingPlan,
    existingPlan,
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(source as never);

  ensureSchoolClasses(workbook);
  seedSampleTeachingRows(workbook);
  simplifyTeachingSheet(workbook);
  hideAdvancedSheets(workbook);

  const output = await workbook.xlsx.writeBuffer();
  return new Uint8Array(output);
}
