import ExcelJS, { type Cell, type Worksheet } from "exceljs";

import {
  STAFFING_SUBJECTS,
  teacherCodesForPlan,
  type StaffingPlan,
} from "@/lib/local/staffing-plan";
import {
  TEACHING_CLASS_PROFILES,
  TEACHING_SHAPES,
  classGradeFromCode,
  createEmptyTeachingPlan,
  humanBlockSummary,
  inferredClassProfile,
  normalizeClassCode,
  rotationSummary,
  rowClassPeriods,
  validateTeachingPlan,
  type TeachingClassProfile,
  type TeachingLessonShape,
  type TeachingPlan,
  type TeachingPlanClass,
  type TeachingPlanRow,
} from "@/lib/local/teaching-plan";

export const TEACHING_CLASSES_SHEET = "Třídy";
export const TEACHING_PLAN_SHEET = "Výuka tříd";
export const TEACHING_ROTATIONS_SHEET = "Výměny skupin";
const DICTIONARY_SHEET = "Číselníky";
const CLASS_HEADER_ROW = 4;
const CLASS_FIRST_ROW = 5;
const PLAN_HEADER_ROW = 5;
const PLAN_FIRST_ROW = 6;
const ROTATION_HEADER_ROW = 5;
const ROTATION_FIRST_ROW = 6;
const LAST_ROW = 305;

const SHAPE_LABELS: Record<TeachingLessonShape, string> = {
  SEPARATE: "Samostatné hodiny",
  DOUBLE: "Pouze dvojhodiny",
  MIXED: "Kombinace",
};

const ORGANIZATION_LABELS = {
  WHOLE: "Celá třída",
  SPLIT: "Dvě skupiny",
} as const;

const PROFILE_LABELS: Record<TeachingClassProfile, string> = {
  REGULAR: "Běžná třída",
  SPORTS: "Sportovní třída",
  CUSTOM: "Vlastní profil",
};

const COLORS = {
  navy: "FF17355C",
  blue: "FF3157C8",
  paleBlue: "FFEAF1FF",
  paleGreen: "FFE8F5E9",
  paleYellow: "FFFFF4CC",
  paleOrange: "FFFFE8CC",
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
  firstRow: number,
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

function addWholeNumberValidation(
  worksheet: Worksheet,
  column: number,
  firstRow: number,
  minimum: number,
  maximum: number,
): void {
  for (let row = firstRow; row <= LAST_ROW; row += 1) {
    worksheet.getCell(row, column).dataValidation = {
      type: "whole",
      operator: "between",
      allowBlank: true,
      formulae: [minimum, maximum],
      showErrorMessage: true,
      errorTitle: "Neplatné číslo",
      error: `Zadejte celé číslo od ${minimum} do ${maximum}.`,
    };
  }
}

function teacherName(teacherId: string, labels: Map<string, string>): string {
  return labels.get(teacherId) ?? "";
}

function writeDictionaries(
  workbook: ExcelJS.Workbook,
  staffingPlan: StaffingPlan,
  teacherLabels: Map<string, string>,
): Worksheet {
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
  Object.values(ORGANIZATION_LABELS).forEach((label, index) => {
    dictionary.getCell(index + 2, 6).value = label;
  });
  dictionary.getCell("H1").value = "Učitelé";
  [...teacherLabels.values()].forEach((label, index) => {
    dictionary.getCell(index + 2, 8).value = label;
  });
  dictionary.getCell("J1").value = "Profily tříd";
  TEACHING_CLASS_PROFILES.forEach((profile, index) => {
    dictionary.getCell(index + 2, 10).value = profile.label;
  });
  dictionary.getCell("L1").value = "Počet učitelů";
  dictionary.getCell("L2").value = staffingPlan.teachers.length;
  return dictionary;
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
  writeDictionaries(workbook, staffingPlan, teacherLabels);

  const classes = workbook.addWorksheet(TEACHING_CLASSES_SHEET, {
    views: [{ state: "frozen", ySplit: CLASS_HEADER_ROW }],
  });
  styleTitle(classes, "A1:C1", "KROK 2A · TŘÍDY A JEJICH PROFIL");
  classes.mergeCells("A2:C2");
  classes.getCell("A2").value =
    "Každá třída je samostatný řádek. Třídy B a D se nabídnou jako sportovní, profil ale můžete změnit.";
  classes.getCell("A2").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.paleBlue },
  };
  classes.mergeCells("A3:C3");
  classes.getCell("A3").value =
    "Profil je pouze označení. Skutečné hodinové dotace vždy vyplňujete zvlášť pro každou konkrétní třídu.";
  classes.getCell("A3").font = { italic: true, color: { argb: COLORS.muted } };
  classes.getRow(CLASS_HEADER_ROW).values = [
    "Třída *",
    "Ročník",
    "Profil třídy *",
  ];
  styleHeader(classes, CLASS_HEADER_ROW);
  classes.columns = [{ width: 18 }, { width: 13 }, { width: 24 }];
  existingPlan.classes.forEach((schoolClass, index) => {
    const row = CLASS_FIRST_ROW + index;
    classes.getCell(row, 1).value = schoolClass.code;
    classes.getCell(row, 2).value = schoolClass.grade;
    classes.getCell(row, 3).value =
      PROFILE_LABELS[
        schoolClass.profile ?? inferredClassProfile(schoolClass.code)
      ];
  });
  addWholeNumberValidation(classes, 2, CLASS_FIRST_ROW, 1, 13);
  addListValidation(
    classes,
    3,
    `'${DICTIONARY_SHEET}'!$J$2:$J$${TEACHING_CLASS_PROFILES.length + 1}`,
    CLASS_FIRST_ROW,
  );

  const plan = workbook.addWorksheet(TEACHING_PLAN_SHEET, {
    views: [{ state: "frozen", ySplit: PLAN_HEADER_ROW }],
  });
  styleTitle(plan, "A1:J1", "KROK 2B · BĚŽNÁ A DĚLENÁ VÝUKA");
  plan.mergeCells("A2:J2");
  plan.getCell("A2").value =
    "Jeden řádek = jeden předmět v jedné třídě. Zde vyplňujte celou třídu nebo dvě skupiny se stejným předmětem.";
  plan.getCell("A2").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.paleBlue },
  };
  plan.mergeCells("A3:J3");
  plan.getCell("A3").value =
    "Výměnu ČJ/M nebo jiných dvou předmětů nepište sem — použijte samostatný list Výměny skupin.";
  plan.getCell("A3").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.paleOrange },
  };
  plan.mergeCells("A4:J4");
  plan.getCell("A4").value =
    "Příklad VV 2 h: Pouze dvojhodiny. Příklad dělené INF: Dvě skupiny + dva různí učitelé.";
  plan.getCell("A4").font = { italic: true, color: { argb: COLORS.muted } };
  plan.getRow(PLAN_HEADER_ROW).values = [
    "Třída *",
    "Předmět *",
    "Hodin týdně *",
    "Jak mají hodiny probíhat? *",
    "Počet dvojhodin jen u kombinace",
    "Organizace *",
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

  addListValidation(
    plan,
    1,
    `'${TEACHING_CLASSES_SHEET}'!$A$${CLASS_FIRST_ROW}:$A$${LAST_ROW}`,
    PLAN_FIRST_ROW,
  );
  addListValidation(
    plan,
    2,
    `'${DICTIONARY_SHEET}'!$A$2:$A$${STAFFING_SUBJECTS.length + 1}`,
    PLAN_FIRST_ROW,
  );
  addListValidation(
    plan,
    4,
    `'${DICTIONARY_SHEET}'!$D$2:$D$${TEACHING_SHAPES.length + 1}`,
    PLAN_FIRST_ROW,
  );
  addListValidation(
    plan,
    6,
    `'${DICTIONARY_SHEET}'!$F$2:$F$${Object.keys(ORGANIZATION_LABELS).length + 1}`,
    PLAN_FIRST_ROW,
  );
  const teacherLastRow = Math.max(2, staffingPlan.teachers.length + 1);
  addListValidation(
    plan,
    7,
    `'${DICTIONARY_SHEET}'!$H$2:$H$${teacherLastRow}`,
    PLAN_FIRST_ROW,
  );
  addListValidation(
    plan,
    8,
    `'${DICTIONARY_SHEET}'!$H$2:$H$${teacherLastRow}`,
    PLAN_FIRST_ROW,
  );
  addWholeNumberValidation(plan, 3, PLAN_FIRST_ROW, 1, 20);
  addWholeNumberValidation(plan, 5, PLAN_FIRST_ROW, 1, 10);

  for (let row = PLAN_FIRST_ROW; row <= LAST_ROW; row += 1) {
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

  const regularRows = existingPlan.rows.filter(
    (item) => item.organization !== "ROTATION",
  );
  regularRows.forEach((item, index) => {
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

  const rotations = workbook.addWorksheet(TEACHING_ROTATIONS_SHEET, {
    views: [{ state: "frozen", ySplit: ROTATION_HEADER_ROW }],
  });
  styleTitle(rotations, "A1:J1", "KROK 2C · VÝMĚNY PŘEDMĚTŮ MEZI SKUPINAMI");
  rotations.mergeCells("A2:J2");
  rotations.getCell("A2").value =
    "Jeden řádek = celá povinná výměna. Solver vždy vytvoří obě ramena a přesně prohodí předměty i učitele mezi skupinami.";
  rotations.getCell("A2").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.paleBlue },
  };
  rotations.mergeCells("A3:J3");
  rotations.getCell("A3").value =
    "Příklad: 1. rameno G1 ČJ / G2 M → 2. rameno G1 M / G2 ČJ. Druhé rameno může být i odpoledne, pokud to vyžaduje dostupnost.";
  rotations.getCell("A3").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.paleYellow },
  };
  rotations.mergeCells("A4:J4");
  rotations.getCell("A4").value =
    "Počet hodin znamená dotaci každého z obou předmětů pro každou skupinu. Třída tedy absolvuje dvojnásobný počet hodin.";
  rotations.getCell("A4").font = {
    italic: true,
    color: { argb: COLORS.muted },
  };
  rotations.getRow(ROTATION_HEADER_ROW).values = [
    "Třída *",
    "Předmět 1 *",
    "Učitel předmětu 1 *",
    "Předmět 2 *",
    "Učitel předmětu 2 *",
    "Hodin každého předmětu pro každou skupinu *",
    "Jak mají hodiny probíhat? *",
    "Počet dvojhodin jen u kombinace",
    "Náhled výměny",
    "Kontrola",
  ];
  styleHeader(rotations, ROTATION_HEADER_ROW);
  rotations.columns = [
    { width: 14 },
    { width: 17 },
    { width: 30 },
    { width: 17 },
    { width: 30 },
    { width: 24 },
    { width: 27 },
    { width: 20 },
    { width: 58 },
    { width: 24 },
  ];
  addListValidation(
    rotations,
    1,
    `'${TEACHING_CLASSES_SHEET}'!$A$${CLASS_FIRST_ROW}:$A$${LAST_ROW}`,
    ROTATION_FIRST_ROW,
  );
  addListValidation(
    rotations,
    2,
    `'${DICTIONARY_SHEET}'!$A$2:$A$${STAFFING_SUBJECTS.length + 1}`,
    ROTATION_FIRST_ROW,
  );
  addListValidation(
    rotations,
    3,
    `'${DICTIONARY_SHEET}'!$H$2:$H$${teacherLastRow}`,
    ROTATION_FIRST_ROW,
  );
  addListValidation(
    rotations,
    4,
    `'${DICTIONARY_SHEET}'!$A$2:$A$${STAFFING_SUBJECTS.length + 1}`,
    ROTATION_FIRST_ROW,
  );
  addListValidation(
    rotations,
    5,
    `'${DICTIONARY_SHEET}'!$H$2:$H$${teacherLastRow}`,
    ROTATION_FIRST_ROW,
  );
  addWholeNumberValidation(rotations, 6, ROTATION_FIRST_ROW, 1, 20);
  addListValidation(
    rotations,
    7,
    `'${DICTIONARY_SHEET}'!$D$2:$D$${TEACHING_SHAPES.length + 1}`,
    ROTATION_FIRST_ROW,
  );
  addWholeNumberValidation(rotations, 8, ROTATION_FIRST_ROW, 1, 10);

  for (let row = ROTATION_FIRST_ROW; row <= LAST_ROW; row += 1) {
    rotations.getCell(row, 9).value = {
      formula: `IF(COUNTA(A${row}:H${row})=0,"","1. rameno: G1 "&B${row}&" / G2 "&D${row}&" → 2. rameno: G1 "&D${row}&" / G2 "&B${row})`,
      result: "",
    };
    rotations.getCell(row, 10).value = {
      formula: `IF(COUNTA(A${row}:H${row})=0,"",IF(OR(A${row}="",B${row}="",C${row}="",D${row}="",E${row}="",F${row}="",G${row}=""),"DOPLNIT",IF(B${row}=D${row},"STEJNÉ PŘEDMĚTY",IF(C${row}=E${row},"STEJNÝ UČITEL",IF(AND(G${row}="Pouze dvojhodiny",MOD(F${row},2)=1),"LICHÝ POČET",IF(AND(G${row}="Kombinace",OR(H${row}="",2*H${row}>=F${row})),"OPRAVIT KOMBINACI","SEDÍ")))))`,
      result: "",
    };
    rotations.getCell(row, 9).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.paleBlue },
    };
    rotations.getCell(row, 10).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.paleGreen },
    };
    rotations.getCell(row, 10).font = { bold: true };
  }

  existingPlan.rows
    .filter((item) => item.organization === "ROTATION")
    .forEach((item, index) => {
      const row = ROTATION_FIRST_ROW + index;
      rotations.getCell(row, 1).value = item.classCode;
      rotations.getCell(row, 2).value = item.subjectCode;
      rotations.getCell(row, 3).value = teacherName(
        item.primaryTeacherId,
        teacherLabels,
      );
      rotations.getCell(row, 4).value = item.secondarySubjectCode ?? "";
      rotations.getCell(row, 5).value = teacherName(
        item.secondaryTeacherId,
        teacherLabels,
      );
      rotations.getCell(row, 6).value = item.weeklyPeriods;
      rotations.getCell(row, 7).value = SHAPE_LABELS[item.lessonShape];
      rotations.getCell(row, 8).value =
        item.lessonShape === "MIXED" ? item.doublePeriodsCount : null;
    });

  for (const worksheet of [classes, plan, rotations]) {
    worksheet.autoFilter = {
      from: {
        row:
          worksheet.name === TEACHING_CLASSES_SHEET
            ? CLASS_HEADER_ROW
            : PLAN_HEADER_ROW,
        column: 1,
      },
      to: {
        row:
          worksheet.name === TEACHING_CLASSES_SHEET
            ? CLASS_HEADER_ROW
            : PLAN_HEADER_ROW,
        column: worksheet.columnCount,
      },
    };
    worksheet.eachRow((row, rowNumber) => {
      if (
        rowNumber <=
        (worksheet.name === TEACHING_CLASSES_SHEET
          ? CLASS_HEADER_ROW
          : PLAN_HEADER_ROW)
      ) {
        return;
      }
      row.alignment = { vertical: "middle", wrapText: true };
      row.height = 30;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
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

function organizationFromLabel(value: string): "WHOLE" | "SPLIT" | null {
  const normalized = value.trim().toLocaleLowerCase("cs-CZ");
  const match = Object.entries(ORGANIZATION_LABELS).find(
    ([code, label]) =>
      normalized === label.toLocaleLowerCase("cs-CZ") ||
      normalized === code.toLocaleLowerCase("cs-CZ"),
  );
  return (match?.[0] as "WHOLE" | "SPLIT" | undefined) ?? null;
}

function classProfileFromLabel(
  value: string,
  code: string,
): TeachingClassProfile {
  const normalized = value.trim().toLocaleLowerCase("cs-CZ");
  const match = Object.entries(PROFILE_LABELS).find(
    ([profile, label]) =>
      normalized === label.toLocaleLowerCase("cs-CZ") ||
      normalized === profile.toLocaleLowerCase("cs-CZ"),
  );
  return (
    (match?.[0] as TeachingClassProfile | undefined) ??
    inferredClassProfile(code)
  );
}

function issue(
  issues: TeachingPlanWorkbookIssue[],
  sheet: string,
  row: number | null,
  field: string | null,
  message: string,
): void {
  issues.push({ severity: "ERROR", sheet, row, field, message });
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
  const rotationsSheet = workbook.getWorksheet(TEACHING_ROTATIONS_SHEET);
  const issues: TeachingPlanWorkbookIssue[] = [];
  const plan = createEmptyTeachingPlan();

  if (!classesSheet || !planSheet) {
    issue(
      issues,
      !classesSheet ? TEACHING_CLASSES_SHEET : TEACHING_PLAN_SHEET,
      null,
      null,
      "Soubor nemá správné listy. Stáhněte novou šablonu z aplikace.",
    );
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
    const rawProfile = cellText(classesSheet.getCell(row, 3));
    if (!rawCode && !rawGrade && !rawProfile) continue;
    const code = normalizeClassCode(rawCode);
    const grade = integerValue(rawGrade) ?? classGradeFromCode(code);
    if (!code) {
      issue(
        issues,
        TEACHING_CLASSES_SHEET,
        row,
        "Třída",
        "Doplňte označení třídy.",
      );
      continue;
    }
    if (!Number.isInteger(grade) || grade < 1 || grade > 13) {
      issue(
        issues,
        TEACHING_CLASSES_SHEET,
        row,
        "Ročník",
        `U třídy ${code} doplňte platný ročník od 1 do 13.`,
      );
      continue;
    }
    if (seenClasses.has(code)) {
      issue(
        issues,
        TEACHING_CLASSES_SHEET,
        row,
        "Třída",
        `Třída ${code} je uvedena vícekrát.`,
      );
      continue;
    }
    seenClasses.add(code);
    plan.classes.push({
      id: `teaching-class-row-${row}`,
      code,
      grade,
      profile: classProfileFromLabel(rawProfile, code),
    });
  }

  const teacherLabels = teacherLabelMap(staffingPlan);
  const teacherByLabel = new Map(
    [...teacherLabels.entries()].map(([id, label]) => [
      label.toLocaleLowerCase("cs-CZ"),
      id,
    ]),
  );
  const resolveTeacher = (value: string): string =>
    teacherByLabel.get(value.toLocaleLowerCase("cs-CZ")) ?? "";
  const subjectExists = (code: string): boolean =>
    STAFFING_SUBJECTS.some((subject) => subject.code === code);

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
    const primaryTeacherId = resolveTeacher(rawPrimaryTeacher!);
    const secondaryTeacherId = resolveTeacher(rawSecondaryTeacher!);

    if (!seenClasses.has(classCode)) {
      issue(
        issues,
        TEACHING_PLAN_SHEET,
        row,
        "Třída",
        `Třída ${rawClass || "–"} není uvedena na listu Třídy.`,
      );
    }
    if (!subjectExists(subjectCode)) {
      issue(
        issues,
        TEACHING_PLAN_SHEET,
        row,
        "Předmět",
        `Předmět ${rawSubject || "–"} není v seznamu.`,
      );
    }
    if (!lessonShape) {
      issue(
        issues,
        TEACHING_PLAN_SHEET,
        row,
        "Jak mají hodiny probíhat?",
        "Vyberte rozložení hodin ze seznamu.",
      );
    }
    if (!organization) {
      issue(
        issues,
        TEACHING_PLAN_SHEET,
        row,
        "Organizace",
        "Vyberte celou třídu nebo dvě skupiny.",
      );
    }
    if (!primaryTeacherId) {
      issue(
        issues,
        TEACHING_PLAN_SHEET,
        row,
        "Učitel / skupina 1",
        "Vyberte učitele ze seznamu vytvořeného v Kroku 1.",
      );
    }
    if (organization === "SPLIT" && !secondaryTeacherId) {
      issue(
        issues,
        TEACHING_PLAN_SHEET,
        row,
        "Učitel skupiny 2",
        "U dělené výuky vyberte druhého učitele.",
      );
    }

    plan.rows.push({
      id: `teaching-row-${row}`,
      classCode,
      subjectCode,
      secondarySubjectCode: "",
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
    });
  }

  if (rotationsSheet) {
    const rotationRows = Math.min(rotationsSheet.actualRowCount, LAST_ROW);
    for (let row = ROTATION_FIRST_ROW; row <= rotationRows; row += 1) {
      const values = Array.from({ length: 8 }, (_, index) =>
        cellText(rotationsSheet.getCell(row, index + 1)),
      );
      if (values.every((value) => value === "")) continue;
      const [
        rawClass,
        rawSubject1,
        rawTeacher1,
        rawSubject2,
        rawTeacher2,
        rawPeriods,
        rawShape,
        rawDoubleCount,
      ] = values;
      const classCode = normalizeClassCode(rawClass!);
      const subjectCode = rawSubject1!.trim().toLocaleUpperCase("cs-CZ");
      const secondarySubjectCode = rawSubject2!
        .trim()
        .toLocaleUpperCase("cs-CZ");
      const primaryTeacherId = resolveTeacher(rawTeacher1!);
      const secondaryTeacherId = resolveTeacher(rawTeacher2!);
      const weeklyPeriods = integerValue(rawPeriods!) ?? 0;
      const lessonShape = lessonShapeFromLabel(rawShape!);

      if (!seenClasses.has(classCode)) {
        issue(
          issues,
          TEACHING_ROTATIONS_SHEET,
          row,
          "Třída",
          `Třída ${rawClass || "–"} není uvedena na listu Třídy.`,
        );
      }
      if (!subjectExists(subjectCode)) {
        issue(
          issues,
          TEACHING_ROTATIONS_SHEET,
          row,
          "Předmět 1",
          `Předmět ${rawSubject1 || "–"} není v seznamu.`,
        );
      }
      if (!subjectExists(secondarySubjectCode)) {
        issue(
          issues,
          TEACHING_ROTATIONS_SHEET,
          row,
          "Předmět 2",
          `Předmět ${rawSubject2 || "–"} není v seznamu.`,
        );
      }
      if (subjectCode && subjectCode === secondarySubjectCode) {
        issue(
          issues,
          TEACHING_ROTATIONS_SHEET,
          row,
          "Předměty",
          "Vyberte dva různé předměty.",
        );
      }
      if (!primaryTeacherId || !secondaryTeacherId) {
        issue(
          issues,
          TEACHING_ROTATIONS_SHEET,
          row,
          "Učitelé",
          "Vyberte oba učitele ze seznamu vytvořeného v Kroku 1.",
        );
      }
      if (primaryTeacherId && primaryTeacherId === secondaryTeacherId) {
        issue(
          issues,
          TEACHING_ROTATIONS_SHEET,
          row,
          "Učitelé",
          "Dva různé předměty musí mít dva různé učitele.",
        );
      }
      if (!lessonShape) {
        issue(
          issues,
          TEACHING_ROTATIONS_SHEET,
          row,
          "Rozložení",
          "Vyberte rozložení hodin ze seznamu.",
        );
      }

      plan.rows.push({
        id: `teaching-rotation-row-${row}`,
        classCode,
        subjectCode,
        secondarySubjectCode,
        weeklyPeriods,
        lessonShape: lessonShape ?? "SEPARATE",
        doublePeriodsCount:
          lessonShape === "DOUBLE"
            ? Math.floor(weeklyPeriods / 2)
            : lessonShape === "MIXED"
              ? (integerValue(rawDoubleCount!) ?? 0)
              : 0,
        organization: "ROTATION",
        primaryTeacherId,
        secondaryTeacherId,
      });
    }
  }

  for (const message of validateTeachingPlan(plan, staffingPlan)) {
    if (!issues.some((existingIssue) => existingIssue.message === message)) {
      issue(issues, TEACHING_PLAN_SHEET, null, null, message);
    }
  }

  return {
    valid: !issues.some((workbookIssue) => workbookIssue.severity === "ERROR"),
    plan,
    issues,
    summary: {
      classes: plan.classes.length,
      subjects: plan.rows.length,
      splitSubjects: plan.rows.filter((item) => item.organization === "SPLIT")
        .length,
      doubleBlocks: plan.rows.reduce((total, item) => {
        const blocks =
          item.lessonShape === "DOUBLE"
            ? item.weeklyPeriods / 2
            : item.lessonShape === "MIXED"
              ? item.doublePeriodsCount
              : 0;
        return total + blocks * (item.organization === "ROTATION" ? 2 : 1);
      }, 0),
      weeklyClassPeriods: plan.rows.reduce(
        (total, item) => total + rowClassPeriods(item),
        0,
      ),
    },
  };
}

export function workbookRowPreview(row: TeachingPlanRow): string {
  return row.organization === "ROTATION"
    ? `${row.classCode} · ${rotationSummary(row)}`
    : `${row.classCode} · ${row.subjectCode} · ${humanBlockSummary(row)}`;
}
