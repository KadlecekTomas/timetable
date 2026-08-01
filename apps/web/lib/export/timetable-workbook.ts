import ExcelJS, { type Cell, type Worksheet } from "exceljs";

import { MIN_LUNCH_BREAK_MINUTES, MORNING_PERIOD_LIMIT } from "../domain/school-day";

const DAY_NAMES = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek"] as const;
const GROUP_LABELS = {
  WHOLE: "Celá třída",
  GROUP_1: "Skupina 1",
  GROUP_2: "Skupina 2",
} as const;
const COLORS = {
  navy: "FF17355C",
  blue: "FF3157C8",
  blueLight: "FFEAF1FF",
  green: "FF2E7D32",
  greenLight: "FFE8F5E9",
  yellow: "FFFFD966",
  yellowLight: "FFFFF4CC",
  gray: "FF667085",
  grayLight: "FFF3F5F7",
  border: "FFD0D5DD",
  white: "FFFFFFFF",
  text: "FF172B4D",
} as const;
const SUBJECT_FILLS = [
  "FFEAF1FF",
  "FFE8F5E9",
  "FFFFF4CC",
  "FFF3E8FF",
  "FFFFE8E8",
  "FFE8F7F5",
  "FFF4EFE8",
] as const;

export interface TimetableExportEntity {
  id: string;
  code: string;
  name: string;
}

export interface TimetableExportRoom {
  id: string;
  code: string;
  name: string;
}

export interface TimetableExportLesson {
  id: string;
  block_id: string;
  assignment_id: string;
  day: number;
  period: number;
  duration: number;
  room_id: string | null;
  group: "WHOLE" | "GROUP_1" | "GROUP_2";
  locked: boolean;
  manually_changed?: boolean;
  origin: string;
  teacher?: TimetableExportEntity;
  schoolClass?: TimetableExportEntity;
  schoolClasses?: TimetableExportEntity[];
  subject?: TimetableExportEntity & { colorToken?: string | null };
  room?: TimetableExportRoom | null;
}

export interface TimetableExportPayload {
  version: {
    id: string;
    name: string;
    revision: number;
    isCurrent: boolean;
    qualityScore: number | null;
    scoreBreakdown: Record<string, number> | null;
    incidentReport: Array<{
      code: string;
      category: string;
      points: number;
      message: string;
      suggestion?: string;
    }> | null;
  };
  periodsPerDay: number[];
  entities: TimetableExportEntity[];
  rooms: TimetableExportRoom[];
  lessons: TimetableExportLesson[];
}

export interface TimetableWorkbookInput {
  schoolName: string;
  schoolYear: string;
  classTimetable: TimetableExportPayload;
  teacherTimetable: TimetableExportPayload;
  exportedAt?: Date;
}

type ExportView = "class" | "teacher";

function safeFilePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function timetableExportFileName(input: {
  schoolName: string;
  schoolYear: string;
  versionName: string;
  revision: number;
}): string {
  const school = safeFilePart(input.schoolName) || "skola";
  const year = safeFilePart(input.schoolYear) || "skolni-rok";
  const version = safeFilePart(input.versionName) || "rozvrh";
  return `rozvrh-${school}-${year}-${version}-r${input.revision}.xlsx`;
}

function compareEntities(left: TimetableExportEntity, right: TimetableExportEntity) {
  return left.code.localeCompare(right.code, "cs-CZ", {
    numeric: true,
    sensitivity: "base",
  });
}

function classIds(lesson: TimetableExportLesson): string[] {
  const entities = lesson.schoolClasses?.length
    ? lesson.schoolClasses
    : lesson.schoolClass
      ? [lesson.schoolClass]
      : [];
  return entities.map((item) => item.id);
}

function belongsTo(
  lesson: TimetableExportLesson,
  view: ExportView,
  entityId: string,
): boolean {
  return view === "class"
    ? classIds(lesson).includes(entityId)
    : lesson.teacher?.id === entityId;
}

function scheduledPeriods(
  lessons: TimetableExportLesson[],
  view: ExportView,
  entityId: string,
): number {
  return lessons
    .filter((lesson) => belongsTo(lesson, view, entityId))
    .reduce((total, lesson) => total + lesson.duration, 0);
}

function sanitizeSheetName(value: string): string {
  return value.replace(/[\\/:*?\[\]]/g, " ").replace(/\s+/g, " ").trim();
}

function uniqueSheetName(
  desired: string,
  used: Set<string>,
): string {
  const base = sanitizeSheetName(desired).slice(0, 31) || "Rozvrh";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLocaleLowerCase("cs-CZ"))) {
    const marker = ` ${suffix}`;
    candidate = `${base.slice(0, 31 - marker.length)}${marker}`;
    suffix += 1;
  }
  used.add(candidate.toLocaleLowerCase("cs-CZ"));
  return candidate;
}

function subjectFill(subjectCode: string): string {
  let hash = 0;
  for (const character of subjectCode) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return SUBJECT_FILLS[hash % SUBJECT_FILLS.length]!;
}

function applyThinBorder(cell: Cell) {
  cell.border = {
    top: { style: "thin", color: { argb: COLORS.border } },
    left: { style: "thin", color: { argb: COLORS.border } },
    bottom: { style: "thin", color: { argb: COLORS.border } },
    right: { style: "thin", color: { argb: COLORS.border } },
  };
}

function formatExportedAt(date: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Prague",
  }).format(date);
}

function lessonText(lesson: TimetableExportLesson, view: ExportView): string {
  const subject = lesson.subject?.code ?? "?";
  const counterpart =
    view === "class"
      ? (lesson.teacher?.code ?? "bez učitele")
      : (lesson.schoolClasses
          ?.map((item) => item.code)
          .join(" + ") ??
        lesson.schoolClass?.code ??
        "bez třídy");
  const details = [
    lesson.group === "WHOLE" ? null : GROUP_LABELS[lesson.group],
    lesson.room?.code ?? "bez učebny",
    lesson.duration > 1 ? `${lesson.duration} hodiny` : null,
    lesson.locked ? "zamčeno" : null,
    lesson.manually_changed ? "ručně změněno" : null,
  ].filter(Boolean);
  return `${subject} · ${counterpart}${details.length ? `\n${details.join(" · ")}` : ""}`;
}

function continuationText(lessons: TimetableExportLesson[]): string {
  const subjects = [...new Set(lessons.map((lesson) => lesson.subject?.code ?? "?"))];
  return `↳ pokračování ${subjects.join(" + ")}`;
}

function styleTimetableHeader(worksheet: Worksheet) {
  const header = worksheet.getRange("A4:F4");
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.blue },
  };
  header.font = { bold: true, color: { argb: COLORS.white } };
  header.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  worksheet.getRow(4).height = 28;
  for (let column = 1; column <= 6; column += 1) {
    applyThinBorder(worksheet.getCell(4, column));
  }
}

function timetableRows(maximumPeriods: number) {
  const rows: Array<
    | { kind: "period"; period: number }
    | { kind: "lunch" }
  > = [];
  for (let period = 0; period < maximumPeriods; period += 1) {
    if (period === MORNING_PERIOD_LIMIT) rows.push({ kind: "lunch" });
    rows.push({ kind: "period", period });
  }
  return rows;
}

function createTimetableSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  entity: TimetableExportEntity,
  view: ExportView,
  payload: TimetableExportPayload,
  input: TimetableWorkbookInput,
) {
  const worksheet = workbook.addWorksheet(sheetName, {
    properties: { tabColor: { argb: view === "class" ? COLORS.green : COLORS.blue } },
  });
  worksheet.views = [
    { state: "frozen", xSplit: 1, ySplit: 4, showGridLines: false },
  ];
  worksheet.columns = [
    { width: 11 },
    { width: 31 },
    { width: 31 },
    { width: 31 },
    { width: 31 },
    { width: 31 },
  ];
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.45,
      bottom: 0.45,
      header: 0.2,
      footer: 0.2,
    },
  };
  worksheet.headerFooter.oddFooter =
    `&L${input.schoolName} · ${input.schoolYear}` +
    `&C${view === "class" ? "Třída" : "Učitel"} ${entity.code}` +
    "&RStrana &P z &N";

  worksheet.mergeCells("A1:F1");
  const title = worksheet.getCell("A1");
  title.value = `${view === "class" ? "Rozvrh třídy" : "Rozvrh učitele"} ${entity.code} · ${entity.name}`;
  title.font = { bold: true, size: 18, color: { argb: COLORS.white } };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.navy },
  };
  title.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getRow(1).height = 34;

  worksheet.mergeCells("A2:F2");
  const subtitle = worksheet.getCell("A2");
  subtitle.value = `${input.schoolName} · ${input.schoolYear} · ${payload.version.name} · revize ${payload.version.revision}${payload.version.isCurrent ? " · přijatá verze" : " · návrh"}`;
  subtitle.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.blueLight },
  };
  subtitle.font = { color: { argb: COLORS.text } };
  subtitle.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  worksheet.getRow(2).height = 26;

  worksheet.mergeCells("A3:F3");
  const legend = worksheet.getCell("A3");
  legend.value =
    `Skupiny uvedené v jedné buňce probíhají současně. Mezi 6. a 7. hodinou je obědová přestávka nejméně ${MIN_LUNCH_BREAK_MINUTES} minut.`;
  legend.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.yellowLight },
  };
  legend.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  worksheet.getRow(3).height = 30;

  worksheet.getRow(4).values = ["Hodina", ...DAY_NAMES];
  styleTimetableHeader(worksheet);

  const maximumPeriods = Math.max(...payload.periodsPerDay, 0);
  const entityLessons = payload.lessons.filter((lesson) =>
    belongsTo(lesson, view, entity.id),
  );
  let rowNumber = 5;
  for (const row of timetableRows(maximumPeriods)) {
    if (row.kind === "lunch") {
      worksheet.mergeCells(rowNumber, 1, rowNumber, 6);
      const lunch = worksheet.getCell(rowNumber, 1);
      lunch.value = `Obědová přestávka · nejméně ${MIN_LUNCH_BREAK_MINUTES} minut`;
      lunch.font = { bold: true, color: { argb: "FF8A5A00" } };
      lunch.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.yellowLight },
      };
      lunch.alignment = { horizontal: "center", vertical: "middle" };
      worksheet.getRow(rowNumber).height = 22;
      rowNumber += 1;
      continue;
    }

    const period = row.period;
    const hourCell = worksheet.getCell(rowNumber, 1);
    hourCell.value = `${period + 1}. hodina`;
    hourCell.font = { bold: true, color: { argb: COLORS.text } };
    hourCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.grayLight },
    };
    hourCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    applyThinBorder(hourCell);

    for (let day = 0; day < DAY_NAMES.length; day += 1) {
      const cell = worksheet.getCell(rowNumber, day + 2);
      applyThinBorder(cell);
      cell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
      if (period >= (payload.periodsPerDay[day] ?? 0)) {
        cell.value = "—";
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: COLORS.grayLight },
        };
        cell.font = { color: { argb: COLORS.gray } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        continue;
      }

      const starting = entityLessons
        .filter((lesson) => lesson.day === day && lesson.period === period)
        .sort((left, right) => left.group.localeCompare(right.group));
      const continuing = entityLessons.filter(
        (lesson) =>
          lesson.day === day &&
          lesson.period < period &&
          lesson.period + lesson.duration > period,
      );
      if (starting.length) {
        cell.value = starting.map((lesson) => lessonText(lesson, view)).join("\n\n");
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: subjectFill(starting[0]?.subject?.code ?? "?") },
        };
        cell.font = { size: 10, color: { argb: COLORS.text } };
      } else if (continuing.length) {
        cell.value = continuationText(continuing);
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: subjectFill(continuing[0]?.subject?.code ?? "?") },
        };
        cell.font = { italic: true, size: 9, color: { argb: COLORS.gray } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      }
    }
    worksheet.getRow(rowNumber).height = 58;
    rowNumber += 1;
  }

  worksheet.pageSetup.printArea = `A1:F${rowNumber - 1}`;
  worksheet.pageSetup.printTitlesRow = "1:4";
}

function styleOverviewHeader(worksheet: Worksheet, row: number) {
  const range = worksheet.getRange(`A${row}:E${row}`);
  range.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.blue },
  };
  range.font = { bold: true, color: { argb: COLORS.white } };
  range.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  worksheet.getRow(row).height = 28;
  for (let column = 1; column <= 5; column += 1) {
    applyThinBorder(worksheet.getCell(row, column));
  }
}

function addEntityIndex(
  worksheet: Worksheet,
  startRow: number,
  heading: string,
  entities: TimetableExportEntity[],
  view: ExportView,
  payload: TimetableExportPayload,
  sheetNames: Map<string, string>,
): number {
  worksheet.mergeCells(startRow, 1, startRow, 5);
  const title = worksheet.getCell(startRow, 1);
  title.value = heading;
  title.font = { bold: true, size: 14, color: { argb: COLORS.white } };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: view === "class" ? COLORS.green : COLORS.navy },
  };
  title.alignment = { vertical: "middle" };
  worksheet.getRow(startRow).height = 28;

  const headerRow = startRow + 1;
  worksheet.getRow(headerRow).values = [
    "Kód",
    "Název",
    "Výukových hodin",
    "Počet bloků",
    "Otevřít list",
  ];
  styleOverviewHeader(worksheet, headerRow);

  let row = headerRow + 1;
  for (const entity of entities) {
    const entityLessons = payload.lessons.filter((lesson) =>
      belongsTo(lesson, view, entity.id),
    );
    worksheet.getCell(row, 1).value = entity.code;
    worksheet.getCell(row, 2).value = entity.name;
    worksheet.getCell(row, 3).value = scheduledPeriods(payload.lessons, view, entity.id);
    worksheet.getCell(row, 4).value = entityLessons.length;
    const targetSheet = sheetNames.get(entity.id)!;
    worksheet.getCell(row, 5).value = {
      text: "Otevřít rozvrh",
      hyperlink: `#'${targetSheet.replaceAll("'", "''")}'!A1`,
    };
    worksheet.getCell(row, 5).font = {
      color: { argb: COLORS.blue },
      underline: true,
    };
    for (let column = 1; column <= 5; column += 1) {
      const cell = worksheet.getCell(row, column);
      applyThinBorder(cell);
      cell.alignment = { vertical: "middle", wrapText: true };
      if (row % 2 === 0) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: COLORS.grayLight },
        };
      }
    }
    row += 1;
  }
  return row;
}

export async function createTimetableExportWorkbook(
  input: TimetableWorkbookInput,
): Promise<Uint8Array> {
  const exportedAt = input.exportedAt ?? new Date();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rozvrhář";
  workbook.title = `Rozvrh ${input.schoolName} ${input.schoolYear}`;
  workbook.subject = "Třídní a učitelské rozvrhy pro vedení školy";
  workbook.created = exportedAt;
  workbook.modified = exportedAt;
  workbook.calcProperties.fullCalcOnLoad = false;

  const classes = [...input.classTimetable.entities].sort(compareEntities);
  const teachers = [...input.teacherTimetable.entities].sort(compareEntities);
  const usedNames = new Set<string>(["přehled"]);
  const classSheetNames = new Map(
    classes.map((entity) => [
      entity.id,
      uniqueSheetName(`Třída ${entity.code}`, usedNames),
    ]),
  );
  const teacherSheetNames = new Map(
    teachers.map((entity) => [
      entity.id,
      uniqueSheetName(`Učitel ${entity.code}`, usedNames),
    ]),
  );

  const overview = workbook.addWorksheet("Přehled", {
    properties: { tabColor: { argb: COLORS.green } },
  });
  overview.views = [{ state: "frozen", ySplit: 12, showGridLines: false }];
  overview.columns = [
    { width: 18 },
    { width: 36 },
    { width: 20 },
    { width: 17 },
    { width: 22 },
  ];
  overview.pageSetup = {
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.35,
      right: 0.35,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    },
  };
  overview.headerFooter.oddFooter =
    `&L${input.schoolName} · ${input.schoolYear}&CPřehled exportu&RStrana &P z &N`;

  overview.mergeCells("A1:E2");
  const title = overview.getCell("A1");
  title.value = "Rozvrh školy – export pro vedení";
  title.font = { bold: true, size: 22, color: { argb: COLORS.white } };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.navy },
  };
  title.alignment = { horizontal: "center", vertical: "middle" };
  overview.getRow(1).height = 30;
  overview.getRow(2).height = 30;

  const metadata: Array<[string, string | number]> = [
    ["Škola", input.schoolName],
    ["Školní rok", input.schoolYear],
    ["Verze", input.classTimetable.version.name],
    ["Revize", input.classTimetable.version.revision],
    ["Stav", input.classTimetable.version.isCurrent ? "Přijatá verze" : "Návrh"],
    ["Kvalita", input.classTimetable.version.qualityScore ?? "Nehodnoceno"],
    ["Exportováno", formatExportedAt(exportedAt)],
  ];
  metadata.forEach(([label, value], index) => {
    const row = index + 4;
    overview.getCell(row, 1).value = label;
    overview.getCell(row, 1).font = { bold: true };
    overview.getCell(row, 1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.blueLight },
    };
    overview.getCell(row, 2).value = value;
    overview.mergeCells(row, 2, row, 3);
    for (let column = 1; column <= 3; column += 1) {
      applyThinBorder(overview.getCell(row, column));
    }
  });

  const counts: Array<[string, number]> = [
    ["Třídy", classes.length],
    ["Učitelé", teachers.length],
    ["Výukové bloky", input.classTimetable.lessons.length],
    [
      "Výukové hodiny",
      input.classTimetable.lessons.reduce(
        (total, lesson) => total + lesson.duration,
        0,
      ),
    ],
  ];
  counts.forEach(([label, value], index) => {
    const row = index + 4;
    overview.getCell(row, 4).value = label;
    overview.getCell(row, 4).font = { bold: true };
    overview.getCell(row, 4).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.greenLight },
    };
    overview.getCell(row, 5).value = value;
    overview.getCell(row, 5).font = { bold: true, size: 14 };
    overview.getCell(row, 5).alignment = { horizontal: "center" };
    applyThinBorder(overview.getCell(row, 4));
    applyThinBorder(overview.getCell(row, 5));
  });

  overview.mergeCells("A12:E12");
  const note = overview.getCell("A12");
  note.value =
    "Každá třída a každý učitel mají vlastní tiskový list. Skupiny ve stejné buňce probíhají souběžně; dvojhodiny mají vyznačené pokračování.";
  note.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.yellowLight },
  };
  note.alignment = { vertical: "middle", wrapText: true };
  overview.getRow(12).height = 36;

  let nextRow = addEntityIndex(
    overview,
    14,
    "Rozvrhy tříd",
    classes,
    "class",
    input.classTimetable,
    classSheetNames,
  );
  nextRow += 1;
  nextRow = addEntityIndex(
    overview,
    nextRow,
    "Rozvrhy učitelů",
    teachers,
    "teacher",
    input.teacherTimetable,
    teacherSheetNames,
  );
  overview.pageSetup.printArea = `A1:E${nextRow - 1}`;
  overview.pageSetup.printTitlesRow = "1:12";

  for (const entity of classes) {
    createTimetableSheet(
      workbook,
      classSheetNames.get(entity.id)!,
      entity,
      "class",
      input.classTimetable,
      input,
    );
  }
  for (const entity of teachers) {
    createTimetableSheet(
      workbook,
      teacherSheetNames.get(entity.id)!,
      entity,
      "teacher",
      input.teacherTimetable,
      input,
    );
  }

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
