import ExcelJS, { type Cell, type Worksheet } from "exceljs";

import {
  STAFFING_DAYS,
  STAFFING_SUBJECTS,
  type StaffingDayCode,
  type StaffingPlan,
  type StaffingSubjectLoad,
  type StaffingTeacher,
  createEmptyStaffingPlan,
  validateStaffingTeacher,
} from "@/lib/local/staffing-plan";

export const STAFFING_WORKBOOK_SHEET = "Učitelé a úvazky";
const SUBJECT_DICTIONARY_SHEET = "Číselník předmětů";
const HEADER_ROW = 5;
const FIRST_DATA_ROW = 6;
const LAST_DATA_ROW = 205;
const MAX_SUBJECTS_PER_TEACHER = 5;

const COLORS = {
  navy: "FF17355C",
  blue: "FF3157C8",
  paleBlue: "FFEAF1FF",
  green: "FF2E7D32",
  paleGreen: "FFE8F5E9",
  red: "FFC62828",
  paleRed: "FFFFE9E7",
  yellow: "FFFFD966",
  paleYellow: "FFFFF4CC",
  border: "FFD0D5DD",
  white: "FFFFFFFF",
  text: "FF172B4D",
  muted: "FF667085",
} as const;

export interface StaffingWorkbookIssue {
  severity: "ERROR" | "WARNING";
  row: number | null;
  field: string | null;
  message: string;
}

export interface StaffingWorkbookAnalysis {
  valid: boolean;
  plan: StaffingPlan;
  issues: StaffingWorkbookIssue[];
  summary: {
    teachers: number;
    targetWeeklyLoad: number;
    assignedWeeklyLoad: number;
    unavailableWholeDays: number;
  };
}

function subjectColumns() {
  return Array.from({ length: MAX_SUBJECTS_PER_TEACHER }, (_, index) => ({
    subject: 4 + index * 2,
    hours: 5 + index * 2,
    number: index + 1,
  }));
}

function addListValidation(
  worksheet: Worksheet,
  column: number,
  formula: string,
): void {
  for (let row = FIRST_DATA_ROW; row <= LAST_DATA_ROW; row += 1) {
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

function styleHeader(worksheet: Worksheet): void {
  const row = worksheet.getRow(HEADER_ROW);
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

function formulaColumnLetter(column: number): string {
  let value = column;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

export async function createStaffingWorkbookTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rozvrhář";
  workbook.created = new Date("2026-01-01T00:00:00.000Z");
  workbook.modified = new Date("2026-01-01T00:00:00.000Z");

  const worksheet = workbook.addWorksheet(STAFFING_WORKBOOK_SHEET, {
    views: [{ state: "frozen", ySplit: HEADER_ROW }],
  });
  worksheet.properties.tabColor = { argb: COLORS.blue };

  worksheet.mergeCells("A1:T1");
  worksheet.getCell("A1").value = "KROK 1 · UČITELÉ, ÚVAZKY A NEDOSTUPNÉ DNY";
  worksheet.getCell("A1").font = {
    bold: true,
    size: 18,
    color: { argb: COLORS.white },
  };
  worksheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.blue },
  };
  worksheet.getCell("A1").alignment = {
    vertical: "middle",
    horizontal: "left",
  };
  worksheet.getRow(1).height = 34;

  worksheet.mergeCells("A2:T2");
  worksheet.getCell("A2").value =
    "Každý učitel je jeden řádek. Celkový úvazek musí přesně odpovídat součtu hodin jednotlivých předmětů.";
  worksheet.getCell("A2").font = { bold: true, color: { argb: COLORS.text } };
  worksheet.getCell("A2").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.paleBlue },
  };

  worksheet.mergeCells("A3:T3");
  worksheet.getCell("A3").value =
    "U celých dnů, kdy učitel nemůže přijít, vyberte Ano. Jednotlivé volné hodiny se budou řešit až v dalším kroku.";
  worksheet.getCell("A3").font = { color: { argb: COLORS.muted } };
  worksheet.getCell("A3").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.paleYellow },
  };

  worksheet.mergeCells("A4:T4");
  worksheet.getCell("A4").value =
    "Příklad: úvazek 22 = TV 10 + M 2 + CJ 4 + JAZ2 6. Sloupec Stav musí ukázat SEDÍ.";
  worksheet.getCell("A4").font = { italic: true, color: { argb: COLORS.text } };

  const headers = [
    "Jméno *",
    "Příjmení *",
    "Úvazek celkem *",
    ...subjectColumns().flatMap(({ number }) => [
      `Předmět ${number}`,
      `Hodin ${number}`,
    ]),
    ...STAFFING_DAYS.map((day) => `Nemůže ${day.shortLabel}?`),
    "Součet předmětů",
    "Stav",
  ];
  worksheet.getRow(HEADER_ROW).values = headers;
  styleHeader(worksheet);

  const widths = [18, 22, 16];
  for (let index = 0; index < MAX_SUBJECTS_PER_TEACHER; index += 1) {
    widths.push(20, 11);
  }
  widths.push(13, 13, 13, 13, 13, 18, 20);
  worksheet.columns = widths.map((width) => ({ width }));

  const dictionary = workbook.addWorksheet(SUBJECT_DICTIONARY_SHEET, {
    state: "veryHidden",
  });
  dictionary.addRow(["Kód", "Název"]);
  STAFFING_SUBJECTS.forEach((subject) =>
    dictionary.addRow([subject.code, subject.label]),
  );

  const subjectFormula = `'${SUBJECT_DICTIONARY_SHEET}'!$A$2:$A$$${
    STAFFING_SUBJECTS.length + 1
  }`.replace("$$", "$");
  subjectColumns().forEach(({ subject, hours }) => {
    addListValidation(worksheet, subject, subjectFormula);
    for (let row = FIRST_DATA_ROW; row <= LAST_DATA_ROW; row += 1) {
      worksheet.getCell(row, hours).dataValidation = {
        type: "whole",
        operator: "between",
        allowBlank: true,
        formulae: [1, 40],
        showErrorMessage: true,
        errorTitle: "Neplatný počet hodin",
        error: "Zadejte celé číslo od 1 do 40.",
      };
    }
  });

  const firstDayColumn = 4 + MAX_SUBJECTS_PER_TEACHER * 2;
  STAFFING_DAYS.forEach((_day, index) =>
    addListValidation(worksheet, firstDayColumn + index, '"Ne,Ano"'),
  );

  for (let row = FIRST_DATA_ROW; row <= LAST_DATA_ROW; row += 1) {
    worksheet.getCell(row, 3).dataValidation = {
      type: "whole",
      operator: "between",
      allowBlank: false,
      formulae: [0, 60],
      showErrorMessage: true,
      errorTitle: "Neplatný úvazek",
      error: "Zadejte celé číslo od 0 do 60.",
    };

    const sumColumn = firstDayColumn + STAFFING_DAYS.length;
    const statusColumn = sumColumn + 1;
    const hourReferences = subjectColumns()
      .map(({ hours }) => `${formulaColumnLetter(hours)}${row}`)
      .join(",");
    worksheet.getCell(row, sumColumn).value = {
      formula: `SUM(${hourReferences})`,
      result: 0,
    };
    worksheet.getCell(row, statusColumn).value = {
      formula: `IF(COUNTA(A${row}:M${row})=0,"",IF(C${row}=${formulaColumnLetter(
        sumColumn,
      )}${row},"SEDÍ",IF(C${row}>${formulaColumnLetter(sumColumn)}${row},"CHYBÍ "&(C${row}-${formulaColumnLetter(
        sumColumn,
      )}${row})&" h","NAVÍC "&(${formulaColumnLetter(sumColumn)}${row}-C${row})&" h")))`,
      result: "",
    };
    worksheet.getCell(row, sumColumn).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.paleBlue },
    };
    worksheet.getCell(row, statusColumn).font = { bold: true };
    worksheet.getCell(row, statusColumn).alignment = {
      horizontal: "center",
      vertical: "middle",
    };
  }

  worksheet.addConditionalFormatting({
    ref: `T${FIRST_DATA_ROW}:T${LAST_DATA_ROW}`,
    rules: [
      {
        type: "containsText",
        operator: "containsText",
        text: "SEDÍ",
        priority: 1,
        style: {
          fill: {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: COLORS.paleGreen },
          },
          font: { color: { argb: COLORS.green }, bold: true },
        },
      },
      {
        type: "notContainsText",
        operator: "notContainsText",
        text: "SEDÍ",
        priority: 2,
        style: {
          fill: {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: COLORS.paleRed },
          },
          font: { color: { argb: COLORS.red }, bold: true },
        },
      },
    ],
  });

  worksheet.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW, column: headers.length },
  };
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= HEADER_ROW) return;
    row.height = 26;
    row.alignment = { vertical: "middle" };
  });

  const example = workbook.addWorksheet("Příklad");
  example.columns = [{ width: 22 }, { width: 18 }];
  example.addRows([
    ["Položka", "Hodnota"],
    ["Jméno", "Jana"],
    ["Příjmení", "Nováková"],
    ["Úvazek", 22],
    ["TV", 10],
    ["M", 2],
    ["CJ", 4],
    ["JAZ2", 6],
    ["Nemůže v pondělí", "Ano"],
    ["Výsledek", "22 z 22 hodin · SEDÍ"],
  ]);
  example.getRow(1).font = { bold: true, color: { argb: COLORS.white } };
  example.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.navy },
  };

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function text(cell: Cell): string {
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

function normalizedSubject(value: string): string | null {
  const normalized = value
    .trim()
    .toLocaleUpperCase("cs-CZ")
    .replace(/\s+/g, "");
  const aliases: Record<string, string> = {
    ČJ: "CJ",
    ČJL: "CJ",
    AJ: "JAZ1",
    NJ: "JAZ2",
    "2.NJ": "JAZ2",
    INF: "INF",
    TV: "TV",
    PČ: "PC",
    PŘ: "PRI",
    VKZ: "VZ",
  };
  const code = aliases[normalized] ?? normalized;
  return STAFFING_SUBJECTS.some((subject) => subject.code === code)
    ? code
    : null;
}

function yesValue(value: string): boolean | null {
  if (!value) return false;
  const normalized = value.trim().toLocaleLowerCase("cs-CZ");
  if (["ano", "a", "x", "1", "true"].includes(normalized)) return true;
  if (["ne", "n", "0", "false"].includes(normalized)) return false;
  return null;
}

function rowHasTeacherData(worksheet: Worksheet, row: number): boolean {
  return [
    1,
    2,
    3,
    ...subjectColumns().flatMap(({ subject, hours }) => [subject, hours]),
  ].some((column) => text(worksheet.getCell(row, column)) !== "");
}

export async function analyzeStaffingWorkbook(
  input: ArrayBuffer | Uint8Array,
): Promise<StaffingWorkbookAnalysis> {
  const workbook = new ExcelJS.Workbook();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  await workbook.xlsx.load(bytes as never);
  const worksheet = workbook.getWorksheet(STAFFING_WORKBOOK_SHEET);
  const issues: StaffingWorkbookIssue[] = [];
  const plan = createEmptyStaffingPlan();

  if (!worksheet) {
    issues.push({
      severity: "ERROR",
      row: null,
      field: null,
      message: `V souboru chybí list „${STAFFING_WORKBOOK_SHEET}“. Stáhněte novou šablonu.`,
    });
    return {
      valid: false,
      plan,
      issues,
      summary: {
        teachers: 0,
        targetWeeklyLoad: 0,
        assignedWeeklyLoad: 0,
        unavailableWholeDays: 0,
      },
    };
  }

  const lastRow = Math.min(
    Math.max(worksheet.actualRowCount, FIRST_DATA_ROW),
    LAST_DATA_ROW,
  );
  for (let row = FIRST_DATA_ROW; row <= lastRow; row += 1) {
    if (!rowHasTeacherData(worksheet, row)) continue;

    const firstName = text(worksheet.getCell(row, 1));
    const lastName = text(worksheet.getCell(row, 2));
    const target = integerValue(text(worksheet.getCell(row, 3)));
    const subjectLoads: StaffingSubjectLoad[] = [];

    if (!firstName) {
      issues.push({
        severity: "ERROR",
        row,
        field: "Jméno",
        message: "Doplňte jméno.",
      });
    }
    if (!lastName) {
      issues.push({
        severity: "ERROR",
        row,
        field: "Příjmení",
        message: "Doplňte příjmení.",
      });
    }
    if (target == null || target < 0 || target > 60) {
      issues.push({
        severity: "ERROR",
        row,
        field: "Úvazek",
        message: "Úvazek musí být celé číslo od 0 do 60 hodin.",
      });
    }

    for (const { subject, hours, number } of subjectColumns()) {
      const rawSubject = text(worksheet.getCell(row, subject));
      const rawHours = text(worksheet.getCell(row, hours));
      if (!rawSubject && !rawHours) continue;
      const subjectCode = normalizedSubject(rawSubject);
      const weeklyPeriods = integerValue(rawHours);
      if (!subjectCode) {
        issues.push({
          severity: "ERROR",
          row,
          field: `Předmět ${number}`,
          message: `Předmět „${rawSubject || "–"}“ není v číselníku. Vyberte jej ze seznamu.`,
        });
        continue;
      }
      if (weeklyPeriods == null || weeklyPeriods <= 0 || weeklyPeriods > 40) {
        issues.push({
          severity: "ERROR",
          row,
          field: `Hodin ${number}`,
          message: `U předmětu ${subjectCode} zadejte celé číslo od 1 do 40.`,
        });
        continue;
      }
      subjectLoads.push({
        id: `staffing-row-${row}-subject-${number}`,
        subjectCode,
        weeklyPeriods,
      });
    }

    const unavailableDays: StaffingDayCode[] = [];
    const firstDayColumn = 4 + MAX_SUBJECTS_PER_TEACHER * 2;
    STAFFING_DAYS.forEach((day, index) => {
      const raw = text(worksheet.getCell(row, firstDayColumn + index));
      const parsed = yesValue(raw);
      if (parsed == null) {
        issues.push({
          severity: "ERROR",
          row,
          field: `Nemůže ${day.shortLabel}?`,
          message: "Vyberte Ano nebo Ne.",
        });
      } else if (parsed) {
        unavailableDays.push(day.code);
      }
    });

    const teacher: StaffingTeacher = {
      id: `staffing-row-${row}`,
      firstName,
      lastName,
      targetWeeklyLoad: target ?? 0,
      subjectLoads,
      unavailableDays,
    };
    const validation = validateStaffingTeacher(teacher);
    for (const message of validation.messages) {
      if (issues.some((item) => item.row === row && item.message === message)) {
        continue;
      }
      issues.push({ severity: "ERROR", row, field: null, message });
    }
    plan.teachers.push(teacher);
  }

  const seenNames = new Set<string>();
  for (const teacher of plan.teachers) {
    const key = `${teacher.lastName}|${teacher.firstName}`.toLocaleLowerCase(
      "cs-CZ",
    );
    if (seenNames.has(key)) {
      issues.push({
        severity: "ERROR",
        row: Number(teacher.id.replace("staffing-row-", "")) || null,
        field: null,
        message: `${teacher.lastName} ${teacher.firstName} je v souboru uveden(a) vícekrát.`,
      });
    }
    seenNames.add(key);
  }

  if (plan.teachers.length === 0) {
    issues.push({
      severity: "ERROR",
      row: null,
      field: null,
      message: "Soubor neobsahuje žádného učitele.",
    });
  }

  const assigned = plan.teachers.reduce(
    (total, teacher) =>
      total +
      teacher.subjectLoads.reduce((sum, item) => sum + item.weeklyPeriods, 0),
    0,
  );
  return {
    valid: !issues.some((item) => item.severity === "ERROR"),
    plan,
    issues,
    summary: {
      teachers: plan.teachers.length,
      targetWeeklyLoad: plan.teachers.reduce(
        (total, teacher) => total + teacher.targetWeeklyLoad,
        0,
      ),
      assignedWeeklyLoad: assigned,
      unavailableWholeDays: plan.teachers.reduce(
        (total, teacher) => total + teacher.unavailableDays.length,
        0,
      ),
    },
  };
}
