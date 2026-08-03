import ExcelJS, { type Worksheet } from "exceljs";

import { STAFFING_DAYS, STAFFING_SUBJECTS } from "@/lib/local/staffing-plan";
import {
  STAFFING_WORKBOOK_SHEET,
  analyzeStaffingWorkbook as analyzeLegacyStaffingWorkbook,
  createStaffingWorkbookTemplate as createLegacyStaffingWorkbookTemplate,
  type StaffingWorkbookAnalysis,
  type StaffingWorkbookIssue,
} from "./staffing-workbook";

export type { StaffingWorkbookAnalysis, StaffingWorkbookIssue };

const HEADER_ROW = 5;
const FIRST_DATA_ROW = 6;
const SUBJECT_ROWS_PER_TEACHER = 5;
const MAX_TEACHERS = 40;
const LAST_DATA_ROW =
  FIRST_DATA_ROW + SUBJECT_ROWS_PER_TEACHER * MAX_TEACHERS - 1;
const SUBJECT_DICTIONARY_SHEET = "Číselník předmětů";

const COLORS = {
  navy: "FF17355C",
  blue: "FF3157C8",
  paleBlue: "FFEAF1FF",
  paleYellow: "FFFFF4CC",
  paleGreen: "FFE8F5E9",
  paleRed: "FFFFE9E7",
  white: "FFFFFFFF",
  border: "FFD0D5DD",
  text: "FF172B4D",
  muted: "FF667085",
} as const;

function teacherStartRow(index: number): number {
  return FIRST_DATA_ROW + index * SUBJECT_ROWS_PER_TEACHER;
}

function subjectLabel(code: string): string {
  return (
    STAFFING_SUBJECTS.find((subject) => subject.code === code)?.label ?? ""
  );
}

function addListValidation(
  worksheet: Worksheet,
  range: string,
  formula: string,
): void {
  worksheet.getCell(range).dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [formula],
    showErrorMessage: true,
    errorTitle: "Vyberte hodnotu ze seznamu",
    error: "Klikněte na šipku v buňce a vyberte jednu z nabízených možností.",
  };
}

function createCompactTeacherSheet(workbook: ExcelJS.Workbook): Worksheet {
  const original = workbook.getWorksheet(STAFFING_WORKBOOK_SHEET);
  if (original) workbook.removeWorksheet(original.id);

  const worksheet = workbook.addWorksheet(STAFFING_WORKBOOK_SHEET, {
    views: [{ state: "frozen", ySplit: HEADER_ROW }],
  });
  worksheet.properties.tabColor = { argb: COLORS.blue };

  worksheet.mergeCells("A1:M1");
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
  worksheet.getRow(1).height = 32;

  worksheet.mergeCells("A2:M2");
  worksheet.getCell("A2").value =
    "Jeden učitel = kompaktní blok pěti řádků. Předměty zapisujte pod sebe; zkratka automaticky doplní celý název.";
  worksheet.getCell("A2").font = { bold: true, color: { argb: COLORS.text } };
  worksheet.getCell("A2").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.paleBlue },
  };

  worksheet.mergeCells("A3:M3");
  worksheet.getCell("A3").value =
    "U celých dnů, kdy učitel nemůže přijít, vyberte Ano. Úvazek musí přesně odpovídat součtu hodin předmětů.";
  worksheet.getCell("A3").font = { color: { argb: COLORS.muted } };
  worksheet.getCell("A3").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.paleYellow },
  };

  worksheet.mergeCells("A4:M4");
  worksheet.getCell("A4").value =
    "Vzor: Kadleček 17 h = INF 13 + TV 4. Vašáková 12 h INF a může učit pouze v úterý a ve středu.";
  worksheet.getCell("A4").font = { italic: true, color: { argb: COLORS.text } };

  worksheet.getRow(HEADER_ROW).values = [
    "Jméno *",
    "Příjmení *",
    "Úvazek *",
    "Zkratka předmětu",
    "Název předmětu",
    "Hodin",
    ...STAFFING_DAYS.map((day) => `Nemůže ${day.shortLabel}?`),
    "Součet",
    "Stav",
  ];
  const header = worksheet.getRow(HEADER_ROW);
  header.height = 34;
  header.font = { bold: true, color: { argb: COLORS.white } };
  header.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.navy },
  };
  header.eachCell((cell) => {
    cell.border = {
      top: { style: "thin", color: { argb: COLORS.border } },
      bottom: { style: "thin", color: { argb: COLORS.border } },
      left: { style: "thin", color: { argb: COLORS.border } },
      right: { style: "thin", color: { argb: COLORS.border } },
    };
  });

  worksheet.columns = [
    { width: 15 },
    { width: 19 },
    { width: 10 },
    { width: 15 },
    { width: 27 },
    { width: 9 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 16 },
  ];

  const dictionary = workbook.getWorksheet(SUBJECT_DICTIONARY_SHEET);
  if (dictionary) {
    dictionary.getCell("C1").value = "Zobrazení";
    STAFFING_SUBJECTS.forEach((subject, index) => {
      dictionary.getCell(index + 2, 3).value =
        `${subject.code} · ${subject.label}`;
    });
  }
  const subjectListFormula = `'${SUBJECT_DICTIONARY_SHEET}'!$C$2:$C$$${
    STAFFING_SUBJECTS.length + 1
  }`.replace("$$", "$");

  for (let teacherIndex = 0; teacherIndex < MAX_TEACHERS; teacherIndex += 1) {
    const start = teacherStartRow(teacherIndex);
    const end = start + SUBJECT_ROWS_PER_TEACHER - 1;

    for (const column of ["A", "B", "C", "G", "H", "I", "J", "K", "L", "M"]) {
      worksheet.mergeCells(`${column}${start}:${column}${end}`);
    }

    worksheet.getCell(start, 3).dataValidation = {
      type: "whole",
      operator: "between",
      allowBlank: true,
      formulae: [0, 60],
      showErrorMessage: true,
      errorTitle: "Neplatný úvazek",
      error: "Zadejte celé číslo od 0 do 60.",
    };

    for (let row = start; row <= end; row += 1) {
      addListValidation(worksheet, `D${row}`, subjectListFormula);
      worksheet.getCell(row, 5).value = {
        formula: `IF(D${row}="","",IFERROR(MID(D${row},FIND(" · ",D${row})+3,999),""))`,
        result: "",
      };
      worksheet.getCell(row, 6).dataValidation = {
        type: "whole",
        operator: "between",
        allowBlank: true,
        formulae: [1, 40],
        showErrorMessage: true,
        errorTitle: "Neplatný počet hodin",
        error: "Zadejte celé číslo od 1 do 40.",
      };
      worksheet.getRow(row).height = 19;
      worksheet.getRow(row).alignment = { vertical: "middle" };
    }

    for (let dayIndex = 0; dayIndex < STAFFING_DAYS.length; dayIndex += 1) {
      addListValidation(
        worksheet,
        `${String.fromCharCode(71 + dayIndex)}${start}`,
        '"Ne,Ano"',
      );
    }

    worksheet.getCell(start, 12).value = {
      formula: `SUM(F${start}:F${end})`,
      result: 0,
    };
    worksheet.getCell(start, 13).value = {
      formula: `IF(COUNTA(A${start}:F${end})=0,"",IF(C${start}=L${start},"SEDÍ",IF(C${start}>L${start},"CHYBÍ "&(C${start}-L${start})&" h","NAVÍC "&(L${start}-C${start})&" h")))`,
      result: "",
    };

    worksheet.getCell(start, 12).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.paleBlue },
    };
    worksheet.getCell(start, 13).font = { bold: true };
    worksheet.getCell(start, 13).alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    const blockFill = teacherIndex % 2 === 0 ? "FFF8FAFD" : "FFFFFFFF";
    for (let row = start; row <= end; row += 1) {
      for (let column = 1; column <= 13; column += 1) {
        const cell = worksheet.getCell(row, column);
        if (column !== 12) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: blockFill },
          };
        }
        cell.border = {
          bottom: {
            style: row === end ? "medium" : "hair",
            color: { argb: COLORS.border },
          },
          left: { style: "thin", color: { argb: COLORS.border } },
          right: { style: "thin", color: { argb: COLORS.border } },
        };
      }
    }
  }

  worksheet.addConditionalFormatting({
    ref: `M${FIRST_DATA_ROW}:M${LAST_DATA_ROW}`,
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
          font: { color: { argb: "FF2E7D32" }, bold: true },
        },
      },
      {
        type: "containsText",
        operator: "containsText",
        text: "CHYBÍ",
        priority: 2,
        style: {
          fill: {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: COLORS.paleRed },
          },
          font: { color: { argb: "FFC62828" }, bold: true },
        },
      },
      {
        type: "containsText",
        operator: "containsText",
        text: "NAVÍC",
        priority: 3,
        style: {
          fill: {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: COLORS.paleRed },
          },
          font: { color: { argb: "FFC62828" }, bold: true },
        },
      },
    ],
  });

  worksheet.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW, column: 13 },
  };

  return worksheet;
}

function fillTeacherExamples(worksheet: Worksheet): void {
  const tomas = teacherStartRow(0);
  worksheet.getCell(tomas, 1).value = "Tomáš";
  worksheet.getCell(tomas, 2).value = "Kadleček";
  worksheet.getCell(tomas, 3).value = 17;
  worksheet.getCell(tomas, 4).value = `INF · ${subjectLabel("INF")}`;
  worksheet.getCell(tomas, 6).value = 13;
  worksheet.getCell(tomas + 1, 4).value = `TV · ${subjectLabel("TV")}`;
  worksheet.getCell(tomas + 1, 6).value = 4;
  for (let day = 0; day < 5; day += 1)
    worksheet.getCell(tomas, 7 + day).value = "Ne";

  const vasakova = teacherStartRow(1);
  worksheet.getCell(vasakova, 1).value = null;
  worksheet.getCell(vasakova, 2).value = "Vašáková";
  worksheet.getCell(vasakova, 3).value = 12;
  worksheet.getCell(vasakova, 4).value = `INF · ${subjectLabel("INF")}`;
  worksheet.getCell(vasakova, 6).value = 12;
  worksheet.getCell(vasakova, 7).value = "Ano";
  worksheet.getCell(vasakova, 8).value = "Ne";
  worksheet.getCell(vasakova, 9).value = "Ne";
  worksheet.getCell(vasakova, 10).value = "Ano";
  worksheet.getCell(vasakova, 11).value = "Ano";
}

function compactFormatDetected(worksheet: Worksheet | undefined): boolean {
  return worksheet?.getCell("D5").text.trim() === "Zkratka předmětu";
}

function codeFromDisplay(value: string): string {
  return value.split("·")[0]?.trim() ?? "";
}

async function convertCompactToLegacy(
  input: ArrayBuffer | Uint8Array,
): Promise<Uint8Array> {
  const compactWorkbook = new ExcelJS.Workbook();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  await compactWorkbook.xlsx.load(bytes as never);
  const compact = compactWorkbook.getWorksheet(STAFFING_WORKBOOK_SHEET);

  const legacyBytes = await createLegacyStaffingWorkbookTemplate();
  const legacyWorkbook = new ExcelJS.Workbook();
  await legacyWorkbook.xlsx.load(legacyBytes as never);
  const legacy = legacyWorkbook.getWorksheet(STAFFING_WORKBOOK_SHEET);
  if (!compact || !legacy) return bytes;

  for (let row = 6; row <= 205; row += 1) {
    for (let column = 1; column <= 20; column += 1) {
      legacy.getCell(row, column).value = null;
    }
  }

  let legacyRow = 6;
  for (let teacherIndex = 0; teacherIndex < MAX_TEACHERS; teacherIndex += 1) {
    const start = teacherStartRow(teacherIndex);
    const firstName = compact.getCell(start, 1).text.trim();
    const lastName = compact.getCell(start, 2).text.trim();
    const targetLoad = compact.getCell(start, 3).text.trim();
    const hasSubjects = Array.from(
      { length: SUBJECT_ROWS_PER_TEACHER },
      (_, index) => compact.getCell(start + index, 4).text.trim(),
    ).some(Boolean);
    if (!firstName && !lastName && !targetLoad && !hasSubjects) continue;

    legacy.getCell(legacyRow, 1).value = firstName || null;
    legacy.getCell(legacyRow, 2).value = lastName || null;
    legacy.getCell(legacyRow, 3).value = targetLoad ? Number(targetLoad) : null;

    for (
      let subjectIndex = 0;
      subjectIndex < SUBJECT_ROWS_PER_TEACHER;
      subjectIndex += 1
    ) {
      const compactRow = start + subjectIndex;
      const display = compact.getCell(compactRow, 4).text.trim();
      const hours = compact.getCell(compactRow, 6).text.trim();
      legacy.getCell(legacyRow, 4 + subjectIndex * 2).value =
        codeFromDisplay(display) || null;
      legacy.getCell(legacyRow, 5 + subjectIndex * 2).value = hours
        ? Number(hours)
        : null;
    }

    for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
      legacy.getCell(legacyRow, 14 + dayIndex).value =
        compact.getCell(start, 7 + dayIndex).text.trim() || null;
    }
    legacyRow += 1;
  }

  return new Uint8Array(await legacyWorkbook.xlsx.writeBuffer());
}

export async function createStaffingWorkbookTemplate(): Promise<Uint8Array> {
  const source = await createLegacyStaffingWorkbookTemplate();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(source as never);
  const worksheet = createCompactTeacherSheet(workbook);
  fillTeacherExamples(worksheet);

  const example = workbook.getWorksheet("Příklad");
  if (example) {
    example.spliceRows(1, example.rowCount);
    example.addRows([
      ["Učitel / skupina", "Úvazek", "Předměty pod sebou", "Organizace"],
      [
        "Tomáš Kadleček",
        17,
        "INF · Informatika 13 h\nTV · Tělesná výchova 4 h",
        "bez omezení dnů",
      ],
      [
        "Vašáková (doplnit jméno)",
        12,
        "INF · Informatika 12 h",
        "učí pouze Út + St",
      ],
      [
        "Kluci 9.A + 9.C",
        4,
        "TV · Tělesná výchova · 2× dvojhodina",
        "jedna společná skupina; souběh s paralelní skupinou dle nastavení vedení",
      ],
    ]);
    example.columns = [
      { width: 32 },
      { width: 12 },
      { width: 34 },
      { width: 54 },
    ];
    example.getRow(1).font = { bold: true };
    example.getColumn(3).alignment = { wrapText: true, vertical: "top" };
  }

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function analyzeStaffingWorkbook(
  input: ArrayBuffer | Uint8Array,
): Promise<StaffingWorkbookAnalysis> {
  const workbook = new ExcelJS.Workbook();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  await workbook.xlsx.load(bytes as never);
  const worksheet = workbook.getWorksheet(STAFFING_WORKBOOK_SHEET);
  if (!compactFormatDetected(worksheet)) {
    return analyzeLegacyStaffingWorkbook(input);
  }
  const legacyInput = await convertCompactToLegacy(input);
  return analyzeLegacyStaffingWorkbook(legacyInput);
}
