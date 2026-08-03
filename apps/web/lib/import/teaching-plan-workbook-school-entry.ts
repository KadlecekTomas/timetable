import ExcelJS from "exceljs";

import type { StaffingPlan } from "@/lib/local/staffing-plan";
import type { TeachingPlan } from "@/lib/local/teaching-plan";
import {
  analyzeTeachingPlanWorkbook as analyzeSchoolWorkbook,
  createTeachingPlanWorkbook as createSchoolWorkbook,
  type TeachingPlanWorkbookAnalysis,
  type TeachingPlanWorkbookIssue,
} from "./teaching-plan-workbook-school-final";

export type { TeachingPlanWorkbookAnalysis, TeachingPlanWorkbookIssue };

const SHARED_GROUPS_SHEET = "Společné skupiny";
const TECHNICAL_TEACHING_SHEET = "Výuka tříd";
const MATRIX_SHEET = "Předměty a dotace";
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

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function hours(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasKadlecek(staffingPlan: StaffingPlan): boolean {
  return staffingPlan.teachers.some(
    (teacher) =>
      `${teacher.firstName} ${teacher.lastName}`
        .trim()
        .toLocaleLowerCase("cs-CZ") === "tomáš kadleček",
  );
}

function subjectDictionary(
  workbook: ExcelJS.Workbook,
): Array<{ code: string; label: string }> {
  const dictionary = workbook.getWorksheet("Číselníky");
  if (!dictionary) return [];
  const subjects: Array<{ code: string; label: string }> = [];
  for (let row = 2; row <= 100; row += 1) {
    const code = text(dictionary.getCell(row, 1).value).toLocaleUpperCase("cs-CZ");
    if (!code) continue;
    subjects.push({
      code,
      label: text(dictionary.getCell(row, 2).value) || code,
    });
  }
  return subjects;
}

function addAllocationMatrix(workbook: ExcelJS.Workbook): void {
  const technical = workbook.getWorksheet(TECHNICAL_TEACHING_SHEET);
  if (!technical) return;

  const allocation = new Map<string, number>();
  for (let row = 6; row <= 305; row += 1) {
    const classCode = text(technical.getCell(row, 1).value).toLocaleUpperCase("cs-CZ");
    const subjectCode = text(technical.getCell(row, 2).value).toLocaleUpperCase("cs-CZ");
    const weeklyHours = hours(technical.getCell(row, 3).value);
    if (classCode && subjectCode && weeklyHours > 0) {
      allocation.set(`${subjectCode}|${classCode}`, weeklyHours);
    }
  }

  const previous = workbook.getWorksheet(MATRIX_SHEET);
  if (previous) workbook.removeWorksheet(previous.id);
  const sheet = workbook.addWorksheet(MATRIX_SHEET, {
    views: [{ state: "frozen", ySplit: 5, xSplit: 2 }],
  });
  sheet.properties.tabColor = { argb: "FF3157C8" };

  sheet.mergeCells("A1:O1");
  sheet.getCell("A1").value = "PŘEDMĚTY A HODINOVÉ DOTACE VŠECH TŘÍD";
  sheet.getCell("A1").font = {
    bold: true,
    size: 17,
    color: { argb: "FFFFFFFF" },
  };
  sheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF3157C8" },
  };
  sheet.getRow(1).height = 34;

  sheet.mergeCells("A2:O2");
  sheet.getCell("A2").value =
    "Každý předmět je pouze jeden řádek. Vpravo zkontrolujte nebo opravte počet hodin ve všech 13 třídách.";
  sheet.getCell("A2").font = { bold: true, color: { argb: "FF172B4D" } };
  sheet.getCell("A2").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEAF1FF" },
  };

  sheet.mergeCells("A3:O3");
  sheet.getCell("A3").value =
    "Sportovní třídy B a D mají stejnou předmětovou dotaci jako ostatní třídy stejného ročníku.";
  sheet.getCell("A3").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF4CC" },
  };

  sheet.mergeCells("A4:O4");
  sheet.getCell("A4").value =
    "Prázdná buňka nebo 0 znamená, že se předmět v dané třídě neučí. Společnou a dělenou výuku nastavte na listu Společné skupiny.";
  sheet.getCell("A4").font = { italic: true, color: { argb: "FF667085" } };

  sheet.getRow(5).values = ["Zkratka", "Předmět", ...SCHOOL_CLASSES];
  sheet.getRow(5).height = 38;
  sheet.getRow(5).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(5).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF17355C" },
  };
  sheet.getRow(5).alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  sheet.columns = [
    { width: 12 },
    { width: 30 },
    ...SCHOOL_CLASSES.map(() => ({ width: 9 })),
  ];

  const subjects = subjectDictionary(workbook);
  subjects.forEach((subject, subjectIndex) => {
    const row = subjectIndex + 6;
    sheet.getCell(row, 1).value = subject.code;
    sheet.getCell(row, 2).value = subject.label;
    SCHOOL_CLASSES.forEach((classCode, classIndex) => {
      const cell = sheet.getCell(row, classIndex + 3);
      cell.value = allocation.get(`${subject.code}|${classCode}`) ?? null;
      cell.dataValidation = {
        type: "whole",
        operator: "between",
        allowBlank: true,
        formulae: [0, 15],
        showErrorMessage: true,
        errorTitle: "Neplatná hodinová dotace",
        error: "Zadejte celé číslo od 0 do 15.",
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    sheet.getRow(row).height = 22;
    if (subjectIndex % 2 === 0) {
      sheet.getRow(row).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8FAFD" },
      };
    }
  });
  sheet.autoFilter = {
    from: "A5",
    to: `O${Math.max(6, subjects.length + 5)}`,
  };
  technical.state = "veryHidden";
}

function syncMatrixIntoTechnicalSheet(workbook: ExcelJS.Workbook): void {
  const matrix = workbook.getWorksheet(MATRIX_SHEET);
  const technical = workbook.getWorksheet(TECHNICAL_TEACHING_SHEET);
  if (!matrix || !technical) return;

  technical.spliceRows(6, Math.max(0, technical.rowCount - 5));
  let targetRow = 6;
  for (let matrixRow = 6; matrixRow <= matrix.rowCount; matrixRow += 1) {
    const subjectCode = text(matrix.getCell(matrixRow, 1).value).toLocaleUpperCase("cs-CZ");
    if (!subjectCode) continue;
    SCHOOL_CLASSES.forEach((classCode, classIndex) => {
      const weeklyHours = hours(matrix.getCell(matrixRow, classIndex + 3).value);
      if (weeklyHours <= 0) return;
      technical.getCell(targetRow, 1).value = classCode;
      technical.getCell(targetRow, 2).value = subjectCode;
      technical.getCell(targetRow, 3).value = weeklyHours;
      technical.getCell(targetRow, 4).value =
        subjectCode === "TV" && ["9.A", "9.C"].includes(classCode)
          ? "Pouze dvojhodiny"
          : "Samostatné hodiny";
      technical.getCell(targetRow, 5).value = null;
      technical.getCell(targetRow, 6).value = "Celá třída";
      technical.getCell(targetRow, 7).value = null;
      technical.getCell(targetRow, 8).value = null;
      targetRow += 1;
    });
  }
}

async function normalizeWorkbook(
  input: ArrayBuffer | Uint8Array,
  removeSchoolExample: boolean,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  await workbook.xlsx.load(bytes as never);
  syncMatrixIntoTechnicalSheet(workbook);
  if (removeSchoolExample) {
    const sheet = workbook.getWorksheet(SHARED_GROUPS_SHEET);
    if (sheet) {
      for (let column = 1; column <= 11; column += 1) {
        sheet.getCell(6, column).value = null;
      }
    }
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function activeAnalysis(
  analysis: TeachingPlanWorkbookAnalysis,
): TeachingPlanWorkbookAnalysis {
  const activeClassCodes = new Set(
    analysis.plan.rows.flatMap((row) => [
      row.classCode,
      ...(row.additionalClassCodes ?? []),
    ]),
  );
  const seen = new Set<string>();
  const classes = analysis.plan.classes.filter((schoolClass) => {
    if (!activeClassCodes.has(schoolClass.code) || seen.has(schoolClass.code)) {
      return false;
    }
    seen.add(schoolClass.code);
    return true;
  });

  return {
    ...analysis,
    plan: { ...analysis.plan, classes },
    summary: { ...analysis.summary, classes: classes.length },
  };
}

export async function createTeachingPlanWorkbook(
  staffingPlan: StaffingPlan,
  existingPlan?: TeachingPlan,
): Promise<Uint8Array> {
  const source = await createSchoolWorkbook(staffingPlan, existingPlan);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(source as never);
  addAllocationMatrix(workbook);
  if (!hasKadlecek(staffingPlan)) {
    const sheet = workbook.getWorksheet(SHARED_GROUPS_SHEET);
    if (sheet) {
      for (let column = 1; column <= 11; column += 1) {
        sheet.getCell(6, column).value = null;
      }
    }
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function analyzeTeachingPlanWorkbook(
  input: ArrayBuffer | Uint8Array,
  staffingPlan: StaffingPlan,
): Promise<TeachingPlanWorkbookAnalysis> {
  const normalized = await normalizeWorkbook(input, !hasKadlecek(staffingPlan));
  return activeAnalysis(await analyzeSchoolWorkbook(normalized, staffingPlan));
}
