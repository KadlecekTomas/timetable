import ExcelJS, { type CellValue, type Worksheet } from "exceljs";

import type { ImportAnalysis, ImportIssueDraft } from "./contracts";
import { analyzeImportWorkbook, createImportTemplate } from "./workbook";

export const CLIENT_IMPORT_TEMPLATE_VERSION = "2.0.0" as const;
export const CLIENT_TEMPLATE_HEADER_ROW = 5;
export const CLIENT_TEMPLATE_FIRST_DATA_ROW = 6;
export const CLIENT_TEMPLATE_LAST_DATA_ROW = 505;

export const CLIENT_TEMPLATE_SHEET_NAMES = {
  guide: "Začněte zde",
  examples: "Příklady",
  settings: "Nastavení",
  teachers: "1. Učitelé",
  classes: "2. Třídy",
  subjects: "3. Předměty",
  rooms: "4. Učebny",
  assignments: "5. Kdo co učí",
  availability: "6. Dostupnost",
  fixedLessons: "7. Pevné hodiny",
} as const;

const COLORS = {
  navy: "FF17355C",
  blue: "FF3157C8",
  paleBlue: "FFEAF1FF",
  paleYellow: "FFFFF4CC",
  yellow: "FFFFD966",
  paleGreen: "FFE8F5E9",
  green: "FF2E7D32",
  gray: "FF667085",
  paleGray: "FFF3F5F7",
  border: "FFD0D5DD",
  white: "FFFFFFFF",
  text: "FF172B4D",
} as const;

type Validation =
  | { type: "list"; values: string[] }
  | { type: "whole"; min: number; max: number };

type Column = {
  key: string;
  label: string;
  required: boolean;
  width: number;
  help: string;
  validation?: Validation;
  valueMap?: Record<string, string>;
};

type SheetDefinition = {
  name: string;
  legacyName: string;
  title: string;
  instruction: string;
  tabColor: string;
  columns: Column[];
};

const list = (values: string[]): Validation => ({ type: "list", values });
const whole = (min: number, max: number): Validation => ({
  type: "whole",
  min,
  max,
});
const col = (
  key: string,
  label: string,
  required: boolean,
  width: number,
  help: string,
  validation?: Validation,
  valueMap?: Record<string, string>,
): Column => ({ key, label, required, width, help, validation, valueMap });

const MAPS = {
  group: {
    "Celá třída": "WHOLE",
    "Skupina 1": "GROUP_1",
    "Skupina 2": "GROUP_2",
  },
  shape: {
    "Jednotlivé hodiny": "SINGLE",
    Dvojhodiny: "DOUBLE",
    "Kombinace hodin a dvojhodin": "MIXED",
  },
  entity: { Učitel: "TEACHER", Třída: "CLASS", Učebna: "ROOM" },
  day: {
    Pondělí: "MON",
    Úterý: "TUE",
    Středa: "WED",
    Čtvrtek: "THU",
    Pátek: "FRI",
  },
  availability: {
    Nemůže: "UNAVAILABLE",
    Preferuje: "PREFERRED",
    "Raději ne": "DISCOURAGED",
  },
  boolean: { Ano: "TRUE", Ne: "FALSE" },
} as const;

const DEFINITIONS: SheetDefinition[] = [
  {
    name: CLIENT_TEMPLATE_SHEET_NAMES.settings,
    legacyName: "Nastavení",
    title: "Základní nastavení týdne",
    instruction:
      "Vyplňte jeden řádek. Počet hodin znamená, kolik vyučovacích hodin může být v daný den.",
    tabColor: COLORS.navy,
    columns: [
      col("school_year", "Školní rok *", true, 18, "Například 2026/2027."),
      col(
        "monday_periods",
        "Pondělí – počet hodin *",
        true,
        22,
        "Celé číslo 1–16.",
        whole(1, 16),
      ),
      col(
        "tuesday_periods",
        "Úterý – počet hodin *",
        true,
        22,
        "Celé číslo 1–16.",
        whole(1, 16),
      ),
      col(
        "wednesday_periods",
        "Středa – počet hodin *",
        true,
        22,
        "Celé číslo 1–16.",
        whole(1, 16),
      ),
      col(
        "thursday_periods",
        "Čtvrtek – počet hodin *",
        true,
        22,
        "Celé číslo 1–16.",
        whole(1, 16),
      ),
      col(
        "friday_periods",
        "Pátek – počet hodin *",
        true,
        22,
        "Celé číslo 1–16.",
        whole(1, 16),
      ),
    ],
  },
  {
    name: CLIENT_TEMPLATE_SHEET_NAMES.teachers,
    legacyName: "Učitelé",
    title: "Učitelé",
    instruction:
      "Každý učitel má jedinečnou zkratku. Více předmětů nebo tříd oddělujte čárkou.",
    tabColor: "FF5B8DEF",
    columns: [
      col("teacher_code", "Zkratka učitele *", true, 18, "Například NOV."),
      col("first_name", "Jméno *", true, 18, "Křestní jméno."),
      col("last_name", "Příjmení *", true, 22, "Příjmení učitele."),
      col(
        "target_weekly_load",
        "Cílový počet hodin týdně *",
        true,
        25,
        "Součet výukových vazeb.",
        whole(0, 60),
      ),
      col(
        "min_weekly_load",
        "Minimální počet hodin",
        false,
        23,
        "Volitelné spodní omezení.",
        whole(0, 60),
      ),
      col(
        "max_weekly_load",
        "Maximální počet hodin",
        false,
        23,
        "Volitelné horní omezení.",
        whole(0, 60),
      ),
      col("subjects", "Zkratky předmětů", false, 25, "Například M,CJ,AJ."),
      col("classes", "Zkratky tříd", false, 25, "Například 6A,7A,8A."),
    ],
  },
  {
    name: CLIENT_TEMPLATE_SHEET_NAMES.classes,
    legacyName: "Třídy",
    title: "Třídy",
    instruction: "Zadejte všechny třídy, pro které se má rozvrh vytvořit.",
    tabColor: "FF63A7A2",
    columns: [
      col("class_code", "Zkratka třídy *", true, 18, "Například 6A."),
      col("grade", "Ročník *", true, 14, "Číslo ročníku.", whole(1, 9)),
      col("class_name", "Název třídy *", true, 24, "Například 6.A."),
    ],
  },
  {
    name: CLIENT_TEMPLATE_SHEET_NAMES.subjects,
    legacyName: "Předměty",
    title: "Předměty",
    instruction: "Zkratky následně použijete na listu „5. Kdo co učí“.",
    tabColor: "FF9B78DB",
    columns: [
      col(
        "subject_code",
        "Zkratka předmětu *",
        true,
        20,
        "Například M, CJ nebo AJ.",
      ),
      col("subject_name", "Název předmětu *", true, 28, "Celý název předmětu."),
      col(
        "default_room_type",
        "Výchozí typ učebny",
        false,
        25,
        "Například TĚLOCVIČNA nebo LABORATOŘ.",
      ),
    ],
  },
  {
    name: CLIENT_TEMPLATE_SHEET_NAMES.rooms,
    legacyName: "Učebny",
    title: "Učebny",
    instruction:
      "Zadejte běžné i odborné učebny. Typy používejte konzistentně.",
    tabColor: "FFF2A65A",
    columns: [
      col("room_code", "Zkratka učebny *", true, 18, "Například 101 nebo TV1."),
      col("room_name", "Název učebny *", true, 30, "Zobrazovaný název."),
      col(
        "room_type",
        "Typ učebny",
        false,
        24,
        "Například BĚŽNÁ nebo LABORATOŘ.",
      ),
      col(
        "capacity",
        "Kapacita",
        false,
        14,
        "Volitelný počet míst.",
        whole(1, 500),
      ),
    ],
  },
  {
    name: CLIENT_TEMPLATE_SHEET_NAMES.assignments,
    legacyName: "Výukové_vazby",
    title: "Kdo co učí",
    instruction:
      "Jeden řádek říká, kdo učí konkrétní předmět v konkrétní třídě a kolik hodin týdně.",
    tabColor: COLORS.green,
    columns: [
      col("assignment_code", "Kód vazby *", true, 22, "Například 6A-M-NOV."),
      col("class_code", "Třída *", true, 14, "Zkratka z listu 2. Třídy."),
      col(
        "subject_code",
        "Předmět *",
        true,
        16,
        "Zkratka z listu 3. Předměty.",
      ),
      col("teacher_code", "Učitel *", true, 16, "Zkratka z listu 1. Učitelé."),
      col(
        "group",
        "Skupina *",
        true,
        18,
        "Pro běžnou výuku zvolte Celá třída.",
        list(Object.keys(MAPS.group)),
        MAPS.group,
      ),
      col(
        "weekly_periods",
        "Hodin týdně *",
        true,
        17,
        "Celková týdenní dotace.",
        whole(1, 30),
      ),
      col(
        "lesson_shape",
        "Rozložení hodin *",
        true,
        34,
        "Jednotlivě, ve dvojhodinách nebo kombinovaně.",
        list(Object.keys(MAPS.shape)),
        MAPS.shape,
      ),
      col(
        "double_periods_count",
        "Počet dvojhodin",
        false,
        19,
        "Používá se u kombinovaného rozložení.",
        whole(0, 15),
      ),
      col(
        "required_room",
        "Konkrétní učebna",
        false,
        22,
        "Zkratka z listu 4. Učebny.",
      ),
      col(
        "required_room_type",
        "Požadovaný typ učebny",
        false,
        25,
        "Pokud není nutná jedna konkrétní učebna.",
      ),
      col(
        "max_per_day",
        "Max. hodin za den",
        false,
        20,
        "Nejvyšší počet této výuky za den.",
        whole(1, 8),
      ),
      col(
        "min_day_gap",
        "Min. rozestup mezi dny",
        false,
        23,
        "Celé dny mezi opakováními.",
        whole(0, 4),
      ),
    ],
  },
  {
    name: CLIENT_TEMPLATE_SHEET_NAMES.availability,
    legacyName: "Dostupnost",
    title: "Dostupnost a preference",
    instruction: "Zadejte pouze výjimky. Vyučovací hodiny se číslují od 1.",
    tabColor: "FFE76F51",
    columns: [
      col(
        "entity_type",
        "Koho / čeho se týká *",
        true,
        23,
        "Učitel, třída nebo učebna.",
        list(Object.keys(MAPS.entity)),
        MAPS.entity,
      ),
      col("entity_code", "Zkratka *", true, 18, "Zkratka konkrétní položky."),
      col(
        "day",
        "Den *",
        true,
        16,
        "Den v týdnu.",
        list(Object.keys(MAPS.day)),
        MAPS.day,
      ),
      col(
        "period",
        "Vyučovací hodina *",
        true,
        21,
        "Čísluje se od 1.",
        whole(1, 16),
      ),
      col(
        "kind",
        "Pravidlo *",
        true,
        18,
        "Nemůže je tvrdý zákaz; ostatní jsou preference.",
        list(Object.keys(MAPS.availability)),
        MAPS.availability,
      ),
      col(
        "weight",
        "Síla preference",
        false,
        18,
        "Číslo 1–100; u zákazu prázdné.",
        whole(1, 100),
      ),
      col("reason", "Poznámka", false, 34, "Krátké vysvětlení."),
    ],
  },
  {
    name: CLIENT_TEMPLATE_SHEET_NAMES.fixedLessons,
    legacyName: "Pevné_hodiny",
    title: "Pevně umístěné hodiny",
    instruction:
      "Použijte jen pro hodiny, které musí zůstat na konkrétním místě. Pořadí bloku začíná nulou.",
    tabColor: "FF6C757D",
    columns: [
      col(
        "assignment_code",
        "Kód výukové vazby *",
        true,
        25,
        "Kód z listu 5. Kdo co učí.",
      ),
      col(
        "block_index",
        "Pořadí bloku *",
        true,
        18,
        "První blok je 0, druhý 1.",
        whole(0, 100),
      ),
      col(
        "day",
        "Den *",
        true,
        16,
        "Den v týdnu.",
        list(Object.keys(MAPS.day)),
        MAPS.day,
      ),
      col(
        "start_period",
        "Začátek – hodina *",
        true,
        21,
        "Čísluje se od 1.",
        whole(1, 16),
      ),
      col(
        "duration",
        "Délka *",
        true,
        14,
        "1 = hodina, 2 = dvojhodina.",
        whole(1, 4),
      ),
      col("room_code", "Učebna", false, 18, "Volitelná zkratka učebny."),
      col(
        "locked",
        "Zamknout",
        false,
        16,
        "Ano = hodina se nesmí přesunout.",
        list(Object.keys(MAPS.boolean)),
        MAPS.boolean,
      ),
    ],
  },
];

function styleSheet(worksheet: Worksheet, definition: SheetDefinition) {
  const lastColumn = definition.columns.length;
  worksheet.properties.tabColor = { argb: definition.tabColor };
  worksheet.views = [
    {
      state: "frozen",
      ySplit: CLIENT_TEMPLATE_HEADER_ROW,
      showGridLines: false,
    },
  ];
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  worksheet.mergeCells(1, 1, 1, lastColumn);
  const title = worksheet.getCell(1, 1);
  title.value = definition.title;
  title.font = { bold: true, size: 18, color: { argb: COLORS.white } };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.navy },
  };
  title.alignment = { vertical: "middle" };
  worksheet.getRow(1).height = 34;

  worksheet.mergeCells(2, 1, 2, lastColumn);
  const instruction = worksheet.getCell(2, 1);
  instruction.value = definition.instruction;
  instruction.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.paleBlue },
  };
  instruction.alignment = { vertical: "middle", wrapText: true };
  worksheet.getRow(2).height = 36;

  worksheet.mergeCells(3, 1, 3, lastColumn);
  const legend = worksheet.getCell(3, 1);
  legend.value =
    "Žluté sloupce jsou povinné. Bílé jsou volitelné. Názvy listů ani záhlaví neměňte.";
  legend.font = { bold: true };
  legend.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.paleYellow },
  };
  legend.alignment = { vertical: "middle", wrapText: true };
  worksheet.getRow(3).height = 28;
  worksheet.getRow(4).height = 8;

  definition.columns.forEach((column, index) => {
    const columnNumber = index + 1;
    worksheet.getColumn(columnNumber).width = column.width;
    const header = worksheet.getCell(CLIENT_TEMPLATE_HEADER_ROW, columnNumber);
    header.value = column.label;
    header.font = { bold: true, color: { argb: COLORS.white } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: column.required ? COLORS.blue : COLORS.gray },
    };
    header.alignment = { vertical: "middle", wrapText: true };
    header.note = column.help;

    for (
      let row = CLIENT_TEMPLATE_FIRST_DATA_ROW;
      row <= CLIENT_TEMPLATE_LAST_DATA_ROW;
      row += 1
    ) {
      const cell = worksheet.getCell(row, columnNumber);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: column.required ? COLORS.paleYellow : COLORS.white },
      };
      cell.border = {
        bottom: { style: "hair", color: { argb: COLORS.border } },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (column.validation?.type === "list") {
        cell.dataValidation = {
          type: "list",
          allowBlank: !column.required,
          formulae: [`"${column.validation.values.join(",")}"`],
          showErrorMessage: true,
          errorTitle: "Vyberte povolenou hodnotu",
          error: "Použijte hodnotu z rozevíracího seznamu.",
        };
      } else if (column.validation?.type === "whole") {
        cell.dataValidation = {
          type: "whole",
          operator: "between",
          allowBlank: !column.required,
          formulae: [column.validation.min, column.validation.max],
          showErrorMessage: true,
          errorTitle: "Neplatné číslo",
          error: `Zadejte celé číslo od ${column.validation.min} do ${column.validation.max}.`,
        };
      }
    }
  });
  worksheet.getRow(CLIENT_TEMPLATE_HEADER_ROW).height = 42;
  worksheet.autoFilter = {
    from: { row: CLIENT_TEMPLATE_HEADER_ROW, column: 1 },
    to: { row: CLIENT_TEMPLATE_HEADER_ROW, column: lastColumn },
  };
}

function createGuide(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet(CLIENT_TEMPLATE_SHEET_NAMES.guide, {
    properties: { tabColor: { argb: COLORS.green } },
  });
  sheet.views = [{ showGridLines: false }];
  sheet.columns = [
    { width: 4 },
    { width: 20 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 4 },
  ];
  sheet.mergeCells("B2:G3");
  const title = sheet.getCell("B2");
  title.value = "Rozvrhář – příprava školních dat";
  title.font = { bold: true, size: 24, color: { argb: COLORS.white } };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.navy },
  };
  title.alignment = { horizontal: "center", vertical: "middle" };
  sheet.mergeCells("B5:G5");
  sheet.getCell("B5").value =
    "Vyplňte listy zleva doprava. Žlutá pole jsou povinná a většina voleb je připravena česky.";
  sheet.getCell("B5").alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  sheet.getRow(5).height = 38;

  const steps = [
    [
      "1",
      "Nastavení",
      "Zkontrolujte školní rok a počet hodin v jednotlivých dnech.",
    ],
    ["2", "Seznamy", "Vyplňte učitele, třídy, předměty a učebny."],
    [
      "3",
      "Kdo co učí",
      "Propojte učitele, třídy a předměty a určete týdenní dotaci.",
    ],
    ["4", "Výjimky", "Doplňte pouze nedostupnost, preference a pevné hodiny."],
    ["5", "Nahrání", "Soubor uložte jako .xlsx a nahrajte do Rozvrháře."],
  ];
  let row = 8;
  for (const [number, heading, text] of steps) {
    sheet.mergeCells(row, 2, row + 1, 2);
    const numberCell = sheet.getCell(row, 2);
    numberCell.value = number;
    numberCell.font = { bold: true, size: 18, color: { argb: COLORS.white } };
    numberCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.blue },
    };
    numberCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.mergeCells(row, 3, row, 7);
    sheet.getCell(row, 3).value = heading;
    sheet.getCell(row, 3).font = { bold: true, size: 13 };
    sheet.getCell(row, 3).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.paleBlue },
    };
    sheet.mergeCells(row + 1, 3, row + 1, 7);
    sheet.getCell(row + 1, 3).value = text;
    sheet.getCell(row + 1, 3).alignment = { wrapText: true };
    row += 3;
  }

  sheet.mergeCells("B24:G24");
  sheet.getCell("B24").value = "Důležitá pravidla";
  sheet.getCell("B24").font = { bold: true, size: 13 };
  sheet.getCell("B24").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.paleYellow },
  };
  [
    "• Neměňte názvy listů ani názvy sloupců.",
    "• Nevkládejte vzorce, makra ani externí odkazy.",
    "• Zkratky musí být jedinečné a stejné na všech listech.",
    "• Nevyplněné volitelné sloupce nechte prázdné.",
  ].forEach((text, index) => {
    sheet.mergeCells(26 + index, 2, 26 + index, 7);
    sheet.getCell(26 + index, 2).value = text;
  });
}

function createExamples(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet(CLIENT_TEMPLATE_SHEET_NAMES.examples, {
    properties: { tabColor: { argb: COLORS.yellow } },
  });
  sheet.views = [{ showGridLines: false }];
  sheet.columns = Array.from({ length: 8 }, () => ({ width: 22 }));
  sheet.mergeCells("A1:H2");
  const title = sheet.getCell("A1");
  title.value = "Příklady vyplnění";
  title.font = { bold: true, size: 20, color: { argb: COLORS.white } };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.navy },
  };
  title.alignment = { horizontal: "center", vertical: "middle" };
  const sections = [
    [
      5,
      "Učitel",
      ["Zkratka", "Jméno", "Příjmení", "Hodin týdně", "Předměty", "Třídy"],
      ["NOV", "Jan", "Novák", 18, "M,F", "6A,7A"],
    ],
    [
      10,
      "Kdo co učí",
      [
        "Kód vazby",
        "Třída",
        "Předmět",
        "Učitel",
        "Skupina",
        "Hodin týdně",
        "Rozložení",
        "Učebna",
      ],
      [
        "6A-M-NOV",
        "6A",
        "M",
        "NOV",
        "Celá třída",
        4,
        "Jednotlivé hodiny",
        "101",
      ],
    ],
    [
      15,
      "Nedostupnost",
      [
        "Koho se týká",
        "Zkratka",
        "Den",
        "Hodina",
        "Pravidlo",
        "Síla",
        "Poznámka",
      ],
      ["Učitel", "NOV", "Pátek", 7, "Nemůže", "", "Porada"],
    ],
  ] as const;
  for (const [startRow, heading, headers, values] of sections) {
    sheet.mergeCells(startRow, 1, startRow, headers.length);
    sheet.getCell(startRow, 1).value = heading;
    sheet.getCell(startRow, 1).font = {
      bold: true,
      color: { argb: COLORS.white },
    };
    sheet.getCell(startRow, 1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.blue },
    };
    headers.forEach((header, index) => {
      const cell = sheet.getCell(startRow + 1, index + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.paleYellow },
      };
      cell.alignment = { wrapText: true };
    });
    values.forEach((value, index) => {
      const cell = sheet.getCell(startRow + 2, index + 1);
      cell.value = value;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.paleGreen },
      };
      cell.alignment = { wrapText: true };
    });
  }
}

export async function createClientImportTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rozvrhář";
  workbook.title = "Rozvrhář – školní data";
  workbook.subject = "Klientská šablona pro přípravu školního rozvrhu";
  workbook.created = new Date("2026-07-31T00:00:00.000Z");
  workbook.modified = new Date("2026-07-31T00:00:00.000Z");
  workbook.calcProperties.fullCalcOnLoad = false;
  createGuide(workbook);
  createExamples(workbook);
  for (const definition of DEFINITIONS) {
    const worksheet = workbook.addWorksheet(definition.name);
    styleSheet(worksheet, definition);
  }
  const metadata = workbook.addWorksheet("Metadata", { state: "veryHidden" });
  metadata.addRows([
    ["templateVersion", CLIENT_IMPORT_TEMPLATE_VERSION],
    ["generator", "Rozvrhář"],
    ["headerRow", CLIENT_TEMPLATE_HEADER_ROW],
    ["firstDataRow", CLIENT_TEMPLATE_FIRST_DATA_ROW],
  ]);
  workbook
    .getWorksheet(CLIENT_TEMPLATE_SHEET_NAMES.settings)!
    .getRow(CLIENT_TEMPLATE_FIRST_DATA_ROW).values = [
    undefined,
    "2026/2027",
    8,
    8,
    8,
    8,
    7,
  ];
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function normalizeLabel(value: string): string {
  return value
    .replace(/\s*\*\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("cs-CZ");
}

function findHeader(worksheet: Worksheet, definition: SheetDefinition) {
  const labels = new Map(
    definition.columns.map((column) => [
      normalizeLabel(column.label),
      column.key,
    ]),
  );
  for (let row = 1; row <= Math.min(12, worksheet.actualRowCount); row += 1) {
    const found = new Map<string, number>();
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      const key = labels.get(
        normalizeLabel(worksheet.getCell(row, column).text),
      );
      if (key) found.set(key, column);
    }
    if (definition.columns.every((column) => found.has(column.key)))
      return { row, columns: found };
  }
  return null;
}

function mapCell(
  value: CellValue,
  valueMap?: Record<string, string>,
): CellValue {
  if (!valueMap || typeof value !== "string") return value;
  return valueMap[value.trim()] ?? value;
}

function friendlyText(value: string | null): string | null {
  if (!value) return value;
  const replacements: Array<[string, string]> = [];
  for (const definition of DEFINITIONS) {
    for (const column of definition.columns) {
      replacements.push([column.key, column.label.replace(/\s*\*$/, "")]);
    }
  }
  for (const mapping of Object.values(MAPS)) {
    for (const [friendly, technical] of Object.entries(mapping))
      replacements.push([technical, friendly]);
  }
  return replacements
    .sort(([a], [b]) => b.length - a.length)
    .reduce(
      (text, [technical, friendly]) => text.replaceAll(technical, friendly),
      value,
    );
}

function remapIssues(issues: ImportIssueDraft[]): ImportIssueDraft[] {
  const definitions = new Map(
    DEFINITIONS.map((definition) => [definition.legacyName, definition]),
  );
  return issues.map((issue) => {
    const definition = definitions.get(issue.sheet);
    if (!definition) return issue;
    const column = definition.columns.find((item) => item.key === issue.column);
    return {
      ...issue,
      sheet: definition.name,
      row:
        issue.row == null || issue.row === 1
          ? issue.row
          : issue.row + CLIENT_TEMPLATE_FIRST_DATA_ROW - 2,
      column: column ? column.label.replace(/\s*\*$/, "") : issue.column,
      message: friendlyText(issue.message) ?? issue.message,
      suggestion: friendlyText(issue.suggestion),
      rawValue: friendlyText(issue.rawValue),
    };
  });
}

async function normalizeClientWorkbook(
  workbook: ExcelJS.Workbook,
): Promise<Uint8Array | null> {
  const version =
    workbook.getWorksheet("Metadata")?.getCell("B1").text.trim() ?? "";
  if (version !== CLIENT_IMPORT_TEMPLATE_VERSION) return null;
  const legacy = new ExcelJS.Workbook();
  await legacy.xlsx.load((await createImportTemplate()) as never);
  for (const definition of DEFINITIONS) {
    const source = workbook.getWorksheet(definition.name);
    const target = legacy.getWorksheet(definition.legacyName);
    if (!target) continue;
    if (!source) {
      target.getRow(1).values = [
        undefined,
        ...definition.columns.map((column) => `missing_${column.key}`),
      ];
      continue;
    }
    const header = findHeader(source, definition);
    if (!header) {
      target.getRow(1).values = [
        undefined,
        ...definition.columns.map((column) => `missing_${column.key}`),
      ];
      continue;
    }
    for (let row = header.row + 1; row <= source.actualRowCount; row += 1) {
      const values = definition.columns.map((column) =>
        mapCell(
          source.getCell(row, header.columns.get(column.key)!).value,
          column.valueMap,
        ),
      );
      if (values.some((value) => value != null && String(value).trim() !== ""))
        target.addRow(values);
    }
  }
  return new Uint8Array(await legacy.xlsx.writeBuffer());
}

export async function analyzeClientImportWorkbook(
  buffer: ArrayBuffer | Uint8Array,
): Promise<ImportAnalysis> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as never);
  } catch {
    return analyzeImportWorkbook(buffer);
  }
  const normalized = await normalizeClientWorkbook(workbook);
  if (!normalized) return analyzeImportWorkbook(buffer);
  const analysis = await analyzeImportWorkbook(normalized);
  return {
    ...analysis,
    templateVersion: CLIENT_IMPORT_TEMPLATE_VERSION,
    issues: remapIssues(analysis.issues),
  };
}
