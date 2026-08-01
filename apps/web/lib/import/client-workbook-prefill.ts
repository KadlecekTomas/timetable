import type ExcelJS from "exceljs";

const FIRST_DATA_ROW = 6;

export const SCHOOL_CLASS_ROWS = [
  ["6A", 6, "6.A"],
  ["6B", 6, "6.B"],
  ["6C", 6, "6.C"],
  ["6D", 6, "6.D"],
  ["7A", 7, "7.A"],
  ["7B", 7, "7.B"],
  ["7C", 7, "7.C"],
  ["8A", 8, "8.A"],
  ["8B", 8, "8.B"],
  ["8C", 8, "8.C"],
  ["9A", 9, "9.A"],
  ["9B", 9, "9.B"],
  ["9C", 9, "9.C"],
] as const;

export const SCHOOL_SUBJECT_ROWS = [
  ["CJ", "Český jazyk", ""],
  ["M", "Matematika", ""],
  ["INF", "Informatika", "POČÍTAČOVÁ UČEBNA"],
  ["JAZ1", "Cizí jazyk 1", "JAZYKOVÁ UČEBNA"],
  ["JAZ2", "Cizí jazyk 2", "JAZYKOVÁ UČEBNA"],
  ["TV", "Tělesná výchova", "TĚLOCVIČNA"],
] as const;

const SPLIT_SUBJECT_CODES = ["CJ", "M", "JAZ1", "JAZ2"] as const;
const PE_CLASS_CODES = ["7B", "8B", "9A", "9B", "9C"] as const;

function assignmentRows(): Array<Array<string | number | null>> {
  const rows: Array<Array<string | number | null>> = [];

  for (const [classCode] of SCHOOL_CLASS_ROWS) {
    for (const subjectCode of SPLIT_SUBJECT_CODES) {
      for (const groupNumber of [1, 2] as const) {
        rows.push([
          `${classCode}-${subjectCode}-S${groupNumber}`,
          classCode,
          null,
          subjectCode,
          null,
          `Skupina ${groupNumber}`,
          null,
          "Jednotlivé hodiny",
          0,
          null,
          null,
          1,
          1,
        ]);
      }
    }

    rows.push([
      `${classCode}-INF`,
      classCode,
      null,
      "INF",
      null,
      "Celá třída",
      1,
      "Jednotlivé hodiny",
      0,
      null,
      "POČÍTAČOVÁ UČEBNA",
      1,
      0,
    ]);
  }

  for (const classCode of PE_CLASS_CODES) {
    for (const groupNumber of [1, 2] as const) {
      rows.push([
        `${classCode}-TV-S${groupNumber}`,
        classCode,
        null,
        "TV",
        null,
        `Skupina ${groupNumber}`,
        null,
        "Jednotlivé hodiny",
        0,
        null,
        "TĚLOCVIČNA",
        2,
        0,
      ]);
    }
  }

  return rows;
}

function writeRows(
  worksheet: ExcelJS.Worksheet,
  rows: ReadonlyArray<ReadonlyArray<string | number | null>>,
) {
  rows.forEach((values, rowIndex) => {
    values.forEach((value, columnIndex) => {
      worksheet.getCell(FIRST_DATA_ROW + rowIndex, columnIndex + 1).value =
        value;
    });
  });
}

function createOrganizationSheet(workbook: ExcelJS.Workbook) {
  const existing = workbook.getWorksheet("8. Organizační pravidla");
  if (existing) workbook.removeWorksheet(existing.id);

  const sheet = workbook.addWorksheet("8. Organizační pravidla", {
    properties: { tabColor: { argb: "FF3157C8" } },
  });
  sheet.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];
  sheet.columns = [
    { width: 21 },
    { width: 37 },
    { width: 37 },
    { width: 37 },
    { width: 48 },
  ];

  sheet.mergeCells("A1:E1");
  const title = sheet.getCell("A1");
  title.value = "Dělení tříd a spojování tělesné výchovy";
  title.font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF17355C" },
  };
  title.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 34;

  sheet.mergeCells("A2:E2");
  const intro = sheet.getCell("A2");
  intro.value =
    "Půlení jedné třídy i společná výuka více tříd jsou v Rozvrháři podporované. Další společné třídy zadejte přímo na listu 5. Kdo co učí.";
  intro.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEAF1FF" },
  };
  intro.alignment = { vertical: "middle", wrapText: true };
  sheet.getRow(2).height = 54;

  const headers = [
    "Oblast",
    "Třídy / předměty",
    "Výchozí nastavení",
    "Povolená alternativa",
    "Poznámka",
  ];
  headers.forEach((value, index) => {
    const cell = sheet.getCell(4, index + 1);
    cell.value = value;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF3157C8" },
    };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
  });
  sheet.getRow(4).height = 34;

  const rules = [
    [
      "Půlení výuky",
      "Všechny třídy 6.A–9.C včetně 6.D",
      "Skupina 1 + Skupina 2",
      "Nepotřebný předpřipravený řádek lze smazat",
      "Připraveno pro český jazyk, matematiku a dva cizí jazyky. Informatika zůstává pro celou třídu.",
    ],
    [
      "Tělesná výchova",
      "9.A + 9.C",
      "Společná výuka",
      "Bez alternativy",
      "Požadavek školy. Učitele a hodinovou dotaci doplňte na listu 5. Kdo co učí.",
    ],
    [
      "Tělesná výchova",
      "9.B",
      "Samostatně",
      "8.B + 9.B",
      "Použijte, pokud spojení vyjde podle dostupnosti učitelů.",
    ],
    [
      "Tělesná výchova",
      "9.B",
      "Samostatně",
      "7.B + 8.B",
      "Druhá povolená varianta podle personálního pokrytí.",
    ],
  ];

  rules.forEach((values, rowIndex) => {
    values.forEach((value, columnIndex) => {
      const cell = sheet.getCell(5 + rowIndex, 1 + columnIndex);
      cell.value = value;
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFD0D5DD" } },
        left: { style: "thin", color: { argb: "FFD0D5DD" } },
        right: { style: "thin", color: { argb: "FFD0D5DD" } },
      };
      if (columnIndex === 0) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFF4CC" },
        };
      } else if (columnIndex === 2) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE8F5E9" },
        };
      } else if (columnIndex === 3) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF3F5F7" },
        };
      }
    });
    sheet.getRow(5 + rowIndex).height = 48;
  });

  sheet.mergeCells("A10:E10");
  const warning = sheet.getCell("A10");
  warning.value =
    "Pro společnou výuku 9.A + 9.C použijte jeden řádek: hlavní třída 9A a další společná třída 9C. Solver pak blok automaticky umístí do rozvrhu obou tříd současně.";
  warning.font = { bold: true, color: { argb: "FF8A1C1C" } };
  warning.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFDECEC" },
  };
  warning.alignment = { vertical: "middle", wrapText: true };
  sheet.getRow(10).height = 58;
}

export function applySchoolTemplatePrefill(workbook: ExcelJS.Workbook) {
  const guide = workbook.getWorksheet("Začněte zde");
  const classes = workbook.getWorksheet("2. Třídy");
  const subjects = workbook.getWorksheet("3. Předměty");
  const assignments = workbook.getWorksheet("5. Kdo co učí");

  if (!guide || !classes || !subjects || !assignments) {
    throw new Error("Klientská šablona nemá očekávané listy pro předvyplnění.");
  }

  writeRows(classes, SCHOOL_CLASS_ROWS);
  writeRows(subjects, SCHOOL_SUBJECT_ROWS);
  writeRows(assignments, assignmentRows());

  assignments.getCell("A2").value =
    "Předpřipravené řádky rozdělí češtinu, matematiku, informatiku a cizí jazyky na dvě poloviny. Doplňte učitele a hodinovou dotaci; nepotřebné řádky smažte.";
  assignments.getRow(2).height = 48;

  guide.mergeCells("B31:G31");
  const classNote = guide.getCell("B31");
  classNote.value =
    "Předvyplněno pro 6.–9. ročník: 6.A–6.D, 7.A–7.C, 8.A–8.C a 9.A–9.C.";
  classNote.font = { bold: true, color: { argb: "FF17355C" } };
  classNote.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEAF1FF" },
  };
  classNote.alignment = { vertical: "middle", wrapText: true };
  guide.getRow(31).height = 36;

  guide.mergeCells("B33:G34");
  const splitNote = guide.getCell("B33");
  splitNote.value =
    "Na listu 5. Kdo co učí jsou připravené dvě poloviny pro český jazyk, matematiku, informatiku a dva cizí jazyky. Doplňte učitele a počet hodin týdně; nepotřebné řádky smažte.";
  splitNote.font = { bold: true, color: { argb: "FF172B4D" } };
  splitNote.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF4CC" },
  };
  splitNote.alignment = { vertical: "middle", wrapText: true };
  guide.getRow(33).height = 34;
  guide.getRow(34).height = 34;

  createOrganizationSheet(workbook);
}
