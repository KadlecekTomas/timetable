import ExcelJS, { type Cell, type Worksheet } from "exceljs";

import {
  STAFFING_SUBJECTS,
  teacherCodesForPlan,
  type StaffingPlan,
} from "@/lib/local/staffing-plan";
import {
  TEACHING_ORGANIZATIONS,
  TEACHING_SHAPES,
  classGradeFromCode,
  createEmptyTeachingPlan,
  humanBlockSummary,
  normalizeClassCode,
  validateTeachingPlan,
  type TeachingLessonShape,
  type TeachingOrganization,
  type TeachingPlan,
  type TeachingPlanClass,
  type TeachingPlanRow,
} from "@/lib/local/teaching-plan";

export const TEACHING_CLASSES_SHEET = "Třídy";
export const TEACHING_PLAN_SHEET = "Výuka tříd";
const DICTIONARY_SHEET = "Číselníky";
const CLASS_HEADER_ROW = 4;
const CLASS_FIRST_ROW = 5;
const PLAN_HEADER_ROW = 5;
const PLAN_FIRST_ROW = 6;
const LAST_ROW = 305;

const SHAPE_LABELS: Record<TeachingLessonShape, string> = {
  SEPARATE: "Samostatné hodiny",
  DOUBLE: "Pouze dvojhodiny",
  MIXED: "Kombinace",
};

const ORGANIZATION_LABELS: Record<TeachingOrganization, string> = {
  WHOLE: "Celá třída",
  SPLIT: "Dvě skupiny",
};

const COLORS = {
  navy: "FF17355C",
  blue: "FF3157C8",
  paleBlue: "FFEAF1FF",
  paleGreen: "FFE8F5E9",
  paleYellow: "FFFFF4CC",
  white: "FFFFFFFF",
  text: "FF172B4D",
  muted: "FF667085",
  border: "FFD0D5DD",
} as const;

export interface TeachingPlanWorkbookIssue {
  severity: "ERROR" | "WARNING";
  sheet: string;
  row: number | null;
  field: string | null;
  message: string;
}

export interface TeachingPlanWorkbookAnalysis {
  valid: boolean;
  plan: TeachingPlan;
  issues: TeachingPlanWorkbookIssue[];
  summary: {
    classes: number;
    subjects: number;
    splitSubjects: number;
    doubleBlocks: number;
    weeklyClassPeriods: number;
  };
}

function teacherLabelMap(staffingPlan: StaffingPlan): Map<string, string> {
  const codes = teacherCodesForPlan(staffingPlan);
  return new Map(
    staffingPlan.teachers.map((teacher) => [
      teacher.id,
      `${codes.get(teacher.id)} · ${teacher.firstName} ${teacher.lastName}`.trim(),
    ]),
  );
}

function styleTitle(worksheet: Worksheet, range: string, title: string): void {
  worksheet.mergeCells(range);
  const cell = worksheet.getCell(range.split(":")[0]!);
  cell.value = title;
  cell.font = { bold: true, size: 17, color: { argb: COLORS.white } };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.blue },
  };
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

function styleHeader(worksheet: Worksheet, rowNumber: number): void {
  const row = worksheet.getRow(rowNumber);
  row.height = 42;
  row.font = { bold: true, color: { argb: COLORS.white } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.navy },
  };
  row.eachCell((cell) => {
    cell.border = {
      top: { style: "thin", color: { argb: COLORS.border } },
      bottom: { style: "thin", color: { argb: COLORS.border } },
      left: { style: "thin", color: { argb: COLORS.border } },
      right: { style: "thin", color: { argb: COLORS.border } },
    };
  });
}

function addListValidation(
  worksheet: Worksheet,
  column: number,
  formula: string,
  firstRow = PLAN_FIRST_ROW,
  lastRow = LAST_ROW,
): void {
  for (let row = firstRow; row <= lastRow; row += 1) {
    worksheet.getCell(row, column).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      errorTitle: "Vyberte hodnotu ze seznamu",
      error: "Klikněte na šipku v buňce a vyberte jednu z nabízených možností.",
    };
  }
}

function teacherName(teacherId: string, labels: Map<string, string>): string {
  return labels.get(teacherId) ?? "";
}

export async function createTeachingPlanWorkbook(
  staffingPlan: StaffingPlan,
  existingPlan: TeachingPlan = createEmptyTeachingPlan(),
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rozvrhář";
  workbook.created = new Date("2026-01-01T00:00:00.000Z");
  workbook.modified = new Date("2026-01-01T00:00:00.000Z");
  const teacherLabels = teacherLabelMap(staffingPlan);

  const classes = workbook.addWorksheet(TEACHING_CLASSES_SHEET, {
    views: [{ state: "frozen", ySplit: CLASS_HEADER_ROW }],
  });
  styleTitle(classes, "A1:B1", "KROK 2A · SEZNAM TŘÍD");
  classes.mergeCells("A2:B2");
  classes.getCell("A2").value =
    "Každá třída je jeden řádek. Zápis 8A se automaticky načte jako 8.A.";
  classes.getCell("A2").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.paleBlue },
  };
  classes.mergeCells("A3:B3");
  classes.getCell("A3").value =
    "Nejdřív doplňte třídy zde. Potom je na listu Výuka tříd vybíráte ze seznamu.";
  classes.getCell("A3").font = { italic: true, color: { argb: COLORS.muted } };
  classes.getRow(CLASS_HEADER_ROW).values = ["Třída *", "Ročník"];
  styleHeader(classes, CLASS_HEADER_ROW);
  classes.columns = [{ width: 22 }, { width: 14 }];
  existingPlan.classes.forEach((schoolClass, index) => {
    const row = CLASS_FIRST_ROW + index;
    classes.getCell(row, 1).value = schoolClass.code;
    classes.getCell(row, 2).value = schoolClass.grade;
  });
  for (let row = CLASS_FIRST_ROW; row <= LAST_ROW; row += 1) {
    classes.getCell(row, 2).dataValidation = {
      type: "whole",
      operator: "between",
      allowBlank: true,
      formulae: [1, 13],
      showErrorMessage: true,
      errorTitle: "Neplatný ročník",
      error: "Zadejte celé číslo od 1 do 13.",
    };
  }

  const plan = workbook.addWorksheet(TEACHING_PLAN_SHEET, {
    views: [{ state: "frozen", ySplit: PLAN_HEADER_ROW }],
  });
  styleTitle(plan, "A1:J1", "KROK 2B · PŘEDMĚTY, DVOJHODINY A DĚLENÍ");
  plan.mergeCells("A2:J2");
  plan.getCell("A2").value =
    "Jeden řádek = jeden předmět v jedné třídě. Vyberte počet hodin, jejich rozložení a učitele.";
  plan.getCell("A2").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.paleBlue },
  };
  plan.mergeCells("A3:J3");
  plan.getCell("A3").value =
    "Příklad VV 2 h: Pouze dvojhodiny. Příklad INF dělená: Dvě skupiny + dva různí učitelé.";
  plan.getCell("A3").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.paleYellow },
  };
  plan.mergeCells("A4:J4");
  plan.getCell("A4").value =
    "U kombinace zadejte počet dvojhodin. U samostatných hodin a čistých dvojhodin nechte tento sloupec prázdný.";
  plan.getCell("A4").font = { italic: true, color: { argb: COLORS.muted } };
  plan.getRow(PLAN_HEADER_ROW).values = [
    "Třída *",
    "Předmět *",
    "Hodin týdně *",
    "Jak mají hodiny probíhat? *",
    "Počet dvojhodin jen u kombinace",
    "Třída se dělí? *",
    "Učitel / skupina 1 *",
    "Učitel skupiny 2",
    "Náhled týdne",
    "Kontrola",
  ];
  styleHeader(plan, PLAN_HEADER_ROW);
  plan.columns = [
    { width: 14 },
    { width: 18 },
    { width: 16 },
    { width: 27 },
    { width: 20 },
    { width: 20 },
    { width: 30 },
    { width: 30 },
    { width: 34 },
    { width: 22 },
  ];

  const dictionary = workbook.addWorksheet(DICTIONARY_SHEET, {
    state: "veryHidden",
  });
  dictionary.getCell("A1").value = "Předměty";
  STAFFING_SUBJECTS.forEach((subject, index) => {
    dictionary.getCell(index + 2, 1).value = subject.code;
    dictionary.getCell(index + 2, 2).value = subject.label;
  });
  dictionary.getCell("D1").value = "Rozložení";
  TEACHING_SHAPES.forEach((shape, index) => {
    dictionary.getCell(index + 2, 4).value = shape.label;
  });
  dictionary.getCell("F1").value = "Organizace";
  TEACHING_ORGANIZATIONS.forEach((organization, index) => {
    dictionary.getCell(index + 2, 6).value = organization.label;
  });
  dictionary.getCell("H1").value = "Učitelé";
  [...teacherLabels.values()].forEach((label, index) => {
    dictionary.getCell(index + 2, 8).value = label;
  });

  addListValidation(
    plan,
    1,
    `'${TEACHING_CLASSES_SHEET}'!$A$${CLASS_FIRST_ROW}:$A$${LAST_ROW}`,
  );
  addListValidation(
    plan,
    2,
    `'${DICTIONARY_SHEET}'!$A$2:$A$${STAFFING_SUBJECTS.length + 1}`,
  );
  addListValidation(
    plan,
    4,
    `'${DICTIONARY_SHEET}'!$D$2:$D$${TEACHING_SHAPES.length + 1}`,
  );
  addListValidation(
    plan,
    6,
    `'${DICTIONARY_SHEET}'!$F$2:$F$${TEACHING_ORGANIZATIONS.length + 1}`,
  );
  const teacherLastRow = Math.max(2, staffingPlan.teachers.length + 1);
  addListValidation(plan, 7, `'${DICTIONARY_SHEET}'!$H$2:$H$${teacherLastRow}`);
  addListValidation(plan, 8, `'${DICTIONARY_SHEET}'!$H$2:$H$${teacherLastRow}`);

  for (let row = PLAN_FIRST_ROW; row <= LAST_ROW; row += 1) {
    plan.getCell(row, 3).dataValidation = {
      type: "whole",
      operator: "between",
      allowBlank: true,
      formulae: [1, 20],
      showErrorMessage: true,
      errorTitle: "Neplatný počet hodin",
      error: "Zadejte celé číslo od 1 do 20.",
    };
    plan.getCell(row, 5).dataValidation = {
      type: "whole",
      operator: "between",
      allowBlank: true,
      formulae: [1, 10],
      showErrorMessage: true,
      errorTitle: "Neplatný počet dvojhodin",
      error: "Zadejte celé číslo od 1 do 10.",
    };
    plan.getCell(row, 9).value = {
      formula: `IF(COUNTA(A${row}:H${row})=0,"",IF(D${row}="Samostatné hodiny",C${row}&"× samostatná",IF(D${row}="Pouze dvojhodiny",C${row}/2&"× dvojhodina",E${row}&"× dvojhodina + "&(C${row}-2*E${row})&"× samostatná")))`,
      result: "",
    };
    plan.getCell(row, 10).value = {
      formula: `IF(COUNTA(A${row}:H${row})=0,"",IF(OR(A${row}="",B${row}="",C${row}="",D${row}="",F${row}="",G${row}=""),"DOPLNIT",IF(AND(D${row}="Pouze dvojhodiny",MOD(C${row},2)=1),"LICHÝ POČET",IF(AND(F${row}="Dvě skupiny",OR(H${row}="",G${row}=H${row})),"DOPLNIT 2. UČITELE",IF(AND(D${row}="Kombinace",OR(E${row}="",2*E${row}>=C${row})),"OPRAVIT KOMBINACI","SEDÍ")))))`,
      result: "",
    };
    plan.getCell(row, 9).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.paleBlue },
    };
    plan.getCell(row, 10).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.paleGreen },
    };
    plan.getCell(row, 10).font = { bold: true };
  }

  existingPlan.rows.forEach((item, index) => {
    const row = PLAN_FIRST_ROW + index;
    plan.getCell(row, 1).value = item.classCode;
    plan.getCell(row, 2).value = item.subjectCode;
    plan.getCell(row, 3).value = item.weeklyPeriods;
    plan.getCell(row, 4).value = SHAPE_LABELS[item.lessonShape];
    plan.getCell(row, 5).value =
      item.lessonShape === "MIXED" ? item.doublePeriodsCount : null;
    plan.getCell(row, 6).value = ORGANIZATION_LABELS[item.organization];
    plan.getCell(row, 7).value = teacherName(
      item.primaryTeacherId,
      teacherLabels,
    );
    plan.getCell(row, 8).value =
      item.organization === "SPLIT"
        ? teacherName(item.secondaryTeacherId, teacherLabels)
        : null;
  });

  const example = workbook.addWorksheet("Příklad");
  example.columns = [
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 32 },
  ];
  example.addRows([
    ["Třída", "Předmět", "Hodiny", "Význam"],
    ["8.A", "VV", 2, "1× dvojhodina · celá třída"],
    ["7.A", "INF", 1, "1× samostatná · dvě skupiny současně"],
    ["6.A", "PC", 3, "1× dvojhodina + 1× samostatná"],
  ]);
  styleHeader(example, 1);

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function cellText(cell: Cell): string {
  if (cell.value && typeof cell.value === "object" && "formula" in cell.value) {
    const result = cell.value.result;
    return result == null ? "" : String(result).trim();
  }
  return cell.text.trim();
}

function integerValue(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isInteger(parsed) ? parsed : null;
}

function lessonShapeFromLabel(value: string): TeachingLessonShape | null {
  const normalized = value.trim().toLocaleLowerCase("cs-CZ");
  const match = Object.entries(SHAPE_LABELS).find(
    ([code, label]) =>
      normalized === label.toLocaleLowerCase("cs-CZ") ||
      normalized === code.toLocaleLowerCase("cs-CZ"),
  );
  return (match?.[0] as TeachingLessonShape | undefined) ?? null;
}

function organizationFromLabel(value: string): TeachingOrganization | null {
  const normalized = value.trim().toLocaleLowerCase("cs-CZ");
  const match = Object.entries(ORGANIZATION_LABELS).find(
    ([code, label]) =>
      normalized === label.toLocaleLowerCase("cs-CZ") ||
      normalized === code.toLocaleLowerCase("cs-CZ"),
  );
  return (match?.[0] as TeachingOrganization | undefined) ?? null;
}

export async function analyzeTeachingPlanWorkbook(
  input: ArrayBuffer | Uint8Array,
  staffingPlan: StaffingPlan,
): Promise<TeachingPlanWorkbookAnalysis> {
  const workbook = new ExcelJS.Workbook();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  await workbook.xlsx.load(bytes as never);
  const classesSheet = workbook.getWorksheet(TEACHING_CLASSES_SHEET);
  const planSheet = workbook.getWorksheet(TEACHING_PLAN_SHEET);
  const issues: TeachingPlanWorkbookIssue[] = [];
  const plan = createEmptyTeachingPlan();

  if (!classesSheet || !planSheet) {
    issues.push({
      severity: "ERROR",
      sheet: !classesSheet ? TEACHING_CLASSES_SHEET : TEACHING_PLAN_SHEET,
      row: null,
      field: null,
      message: "Soubor nemá správné listy. Stáhněte novou šablonu z aplikace.",
    });
    return {
      valid: false,
      plan,
      issues,
      summary: {
        classes: 0,
        subjects: 0,
        splitSubjects: 0,
        doubleBlocks: 0,
        weeklyClassPeriods: 0,
      },
    };
  }

  const classRows = Math.min(classesSheet.actualRowCount, LAST_ROW);
  const seenClasses = new Set<string>();
  for (let row = CLASS_FIRST_ROW; row <= classRows; row += 1) {
    const rawCode = cellText(classesSheet.getCell(row, 1));
    const rawGrade = cellText(classesSheet.getCell(row, 2));
    if (!rawCode && !rawGrade) continue;
    const code = normalizeClassCode(rawCode);
    const grade = integerValue(rawGrade) ?? classGradeFromCode(code);
    if (!code) {
      issues.push({
        severity: "ERROR",
        sheet: TEACHING_CLASSES_SHEET,
        row,
        field: "Třída",
        message: "Doplňte označení třídy.",
      });
      continue;
    }
    if (!Number.isInteger(grade) || grade < 1 || grade > 13) {
      issues.push({
        severity: "ERROR",
        sheet: TEACHING_CLASSES_SHEET,
        row,
        field: "Ročník",
        message: `U třídy ${code} doplňte platný ročník od 1 do 13.`,
      });
      continue;
    }
    if (seenClasses.has(code)) {
      issues.push({
        severity: "ERROR",
        sheet: TEACHING_CLASSES_SHEET,
        row,
        field: "Třída",
        message: `Třída ${code} je uvedena vícekrát.`,
      });
      continue;
    }
    seenClasses.add(code);
    plan.classes.push({
      id: `teaching-class-row-${row}`,
      code,
      grade,
    } satisfies TeachingPlanClass);
  }

  const teacherLabels = teacherLabelMap(staffingPlan);
  const teacherByLabel = new Map(
    [...teacherLabels.entries()].map(([id, label]) => [
      label.toLocaleLowerCase("cs-CZ"),
      id,
    ]),
  );
  const planRows = Math.min(planSheet.actualRowCount, LAST_ROW);
  for (let row = PLAN_FIRST_ROW; row <= planRows; row += 1) {
    const values = Array.from({ length: 8 }, (_, index) =>
      cellText(planSheet.getCell(row, index + 1)),
    );
    if (values.every((value) => value === "")) continue;
    const [
      rawClass,
      rawSubject,
      rawPeriods,
      rawShape,
      rawDoubleCount,
      rawOrganization,
      rawPrimaryTeacher,
      rawSecondaryTeacher,
    ] = values;
    const classCode = normalizeClassCode(rawClass!);
    const subjectCode = rawSubject!.trim().toLocaleUpperCase("cs-CZ");
    const weeklyPeriods = integerValue(rawPeriods!) ?? 0;
    const lessonShape = lessonShapeFromLabel(rawShape!);
    const organization = organizationFromLabel(rawOrganization!);
    const primaryTeacherId =
      teacherByLabel.get(rawPrimaryTeacher!.toLocaleLowerCase("cs-CZ")) ?? "";
    const secondaryTeacherId =
      teacherByLabel.get(rawSecondaryTeacher!.toLocaleLowerCase("cs-CZ")) ?? "";

    if (!seenClasses.has(classCode)) {
      issues.push({
        severity: "ERROR",
        sheet: TEACHING_PLAN_SHEET,
        row,
        field: "Třída",
        message: `Třída ${rawClass || "–"} není uvedena na listu Třídy.`,
      });
    }
    if (!STAFFING_SUBJECTS.some((subject) => subject.code === subjectCode)) {
      issues.push({
        severity: "ERROR",
        sheet: TEACHING_PLAN_SHEET,
        row,
        field: "Předmět",
        message: `Předmět ${rawSubject || "–"} není v seznamu.`,
      });
    }
    if (!lessonShape) {
      issues.push({
        severity: "ERROR",
        sheet: TEACHING_PLAN_SHEET,
        row,
        field: "Jak mají hodiny probíhat?",
        message: "Vyberte rozložení hodin ze seznamu.",
      });
    }
    if (!organization) {
      issues.push({
        severity: "ERROR",
        sheet: TEACHING_PLAN_SHEET,
        row,
        field: "Třída se dělí?",
        message: "Vyberte celou třídu nebo dvě skupiny.",
      });
    }
    if (!primaryTeacherId) {
      issues.push({
        severity: "ERROR",
        sheet: TEACHING_PLAN_SHEET,
        row,
        field: "Učitel / skupina 1",
        message: "Vyberte učitele ze seznamu vytvořeného v Kroku 1.",
      });
    }
    if (organization === "SPLIT" && !secondaryTeacherId) {
      issues.push({
        severity: "ERROR",
        sheet: TEACHING_PLAN_SHEET,
        row,
        field: "Učitel skupiny 2",
        message: "U dělené výuky vyberte druhého učitele.",
      });
    }

    plan.rows.push({
      id: `teaching-row-${row}`,
      classCode,
      subjectCode,
      weeklyPeriods,
      lessonShape: lessonShape ?? "SEPARATE",
      doublePeriodsCount:
        lessonShape === "DOUBLE"
          ? Math.floor(weeklyPeriods / 2)
          : lessonShape === "MIXED"
            ? (integerValue(rawDoubleCount!) ?? 0)
            : 0,
      organization: organization ?? "WHOLE",
      primaryTeacherId,
      secondaryTeacherId: organization === "SPLIT" ? secondaryTeacherId : "",
    } satisfies TeachingPlanRow);
  }

  for (const message of validateTeachingPlan(plan, staffingPlan)) {
    if (!issues.some((issue) => issue.message === message)) {
      issues.push({
        severity: "ERROR",
        sheet: TEACHING_PLAN_SHEET,
        row: null,
        field: null,
        message,
      });
    }
  }

  return {
    valid: !issues.some((issue) => issue.severity === "ERROR"),
    plan,
    issues,
    summary: {
      classes: plan.classes.length,
      subjects: plan.rows.length,
      splitSubjects: plan.rows.filter((item) => item.organization === "SPLIT")
        .length,
      doubleBlocks: plan.rows.reduce(
        (total, item) =>
          total +
          (item.lessonShape === "DOUBLE"
            ? item.weeklyPeriods / 2
            : item.lessonShape === "MIXED"
              ? item.doublePeriodsCount
              : 0),
        0,
      ),
      weeklyClassPeriods: plan.rows.reduce(
        (total, item) => total + item.weeklyPeriods,
        0,
      ),
    },
  };
}

export function workbookRowPreview(row: TeachingPlanRow): string {
  return `${row.classCode} · ${row.subjectCode} · ${humanBlockSummary(row)}`;
}
