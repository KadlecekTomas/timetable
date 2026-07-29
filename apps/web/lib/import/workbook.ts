import ExcelJS, { type Cell, type CellValue, type Worksheet } from "exceljs";

import {
  IMPORT_TEMPLATE_VERSION,
  type ImportAnalysis,
  type ImportAssignmentRow,
  type ImportAvailabilityRow,
  type ImportClassRow,
  type ImportFixedLessonRow,
  type ImportIssueDraft,
  type ImportPayload,
  type ImportRoomRow,
  type ImportSettingsRow,
  type ImportSubjectRow,
  type ImportSummary,
  type ImportTeacherRow,
} from "./contracts";

const SHEETS = {
  settings: "Nastavení",
  teachers: "Učitelé",
  classes: "Třídy",
  subjects: "Předměty",
  rooms: "Učebny",
  assignments: "Výukové_vazby",
  availability: "Dostupnost",
  fixedLessons: "Pevné_hodiny",
} as const;

const REQUIRED_HEADERS: Record<string, string[]> = {
  [SHEETS.settings]: [
    "school_year",
    "monday_periods",
    "tuesday_periods",
    "wednesday_periods",
    "thursday_periods",
    "friday_periods",
  ],
  [SHEETS.teachers]: [
    "teacher_code",
    "first_name",
    "last_name",
    "target_weekly_load",
    "min_weekly_load",
    "max_weekly_load",
    "subjects",
    "classes",
  ],
  [SHEETS.classes]: ["class_code", "grade", "class_name"],
  [SHEETS.subjects]: ["subject_code", "subject_name", "default_room_type"],
  [SHEETS.rooms]: ["room_code", "room_name", "room_type", "capacity"],
  [SHEETS.assignments]: [
    "assignment_code",
    "class_code",
    "subject_code",
    "teacher_code",
    "group",
    "weekly_periods",
    "lesson_shape",
    "double_periods_count",
    "required_room",
    "required_room_type",
    "max_per_day",
    "min_day_gap",
  ],
  [SHEETS.availability]: [
    "entity_type",
    "entity_code",
    "day",
    "period",
    "kind",
    "weight",
    "reason",
  ],
  [SHEETS.fixedLessons]: [
    "assignment_code",
    "block_index",
    "day",
    "start_period",
    "duration",
    "room_code",
    "locked",
  ],
};

const DAY_VALUES = ["MON", "TUE", "WED", "THU", "FRI"] as const;
const GROUP_VALUES = ["WHOLE", "GROUP_1", "GROUP_2"] as const;
const SHAPE_VALUES = ["SINGLE", "DOUBLE", "MIXED"] as const;
const ENTITY_VALUES = ["TEACHER", "CLASS", "ROOM"] as const;
const AVAILABILITY_VALUES = ["UNAVAILABLE", "PREFERRED", "DISCOURAGED"] as const;

function styleHeader(worksheet: Worksheet) {
  const row = worksheet.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3157C8" } };
  row.alignment = { vertical: "middle", horizontal: "left" };
  row.height = 24;
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = { from: "A1", to: row.getCell(row.cellCount).address };
}

function addDataSheet(workbook: ExcelJS.Workbook, name: string, headers: string[]) {
  const worksheet = workbook.addWorksheet(name);
  worksheet.addRow(headers);
  worksheet.columns = headers.map((header) => ({
    header,
    key: header,
    width: Math.max(16, Math.min(28, header.length + 4)),
  }));
  styleHeader(worksheet);
  return worksheet;
}

function addListValidation(
  worksheet: Worksheet,
  column: number,
  values: readonly string[],
  fromRow = 2,
  toRow = 1000,
) {
  for (let row = fromRow; row <= toRow; row += 1) {
    worksheet.getCell(row, column).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`"${values.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Neplatná hodnota",
      error: "Vyberte jednu z povolených hodnot.",
    };
  }
}

export async function createImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Timetable";
  workbook.created = new Date("2026-01-01T00:00:00.000Z");
  workbook.modified = new Date("2026-01-01T00:00:00.000Z");
  workbook.calcProperties.fullCalcOnLoad = false;

  const readme = workbook.addWorksheet("README");
  readme.columns = [{ width: 110 }];
  readme.addRow(["Timetable – import školních dat"]);
  readme.getCell("A1").font = { bold: true, size: 18 };
  readme.addRow([
    "Vyplňte technické sloupce na jednotlivých listech. Neměňte názvy listů ani záhlaví. Vzorce, makra a externí odkazy nejsou podporované.",
  ]);
  readme.addRow([`Verze šablony: ${IMPORT_TEMPLATE_VERSION}`]);
  readme.addRow(["Import nejprve vytvoří náhled. Data se zapíší až po explicitním potvrzení."]);

  const metadata = workbook.addWorksheet("Metadata", { state: "veryHidden" });
  metadata.addRows([
    ["templateVersion", IMPORT_TEMPLATE_VERSION],
    ["generator", "Timetable"],
  ]);

  const dictionaries = workbook.addWorksheet("Číselníky", { state: "veryHidden" });
  dictionaries.addRow(["groups", ...GROUP_VALUES]);
  dictionaries.addRow(["lesson_shapes", ...SHAPE_VALUES]);
  dictionaries.addRow(["entity_types", ...ENTITY_VALUES]);
  dictionaries.addRow(["availability_kinds", ...AVAILABILITY_VALUES]);
  dictionaries.addRow(["days", ...DAY_VALUES]);

  addDataSheet(workbook, SHEETS.settings, REQUIRED_HEADERS[SHEETS.settings]);
  addDataSheet(workbook, SHEETS.teachers, REQUIRED_HEADERS[SHEETS.teachers]);
  addDataSheet(workbook, SHEETS.classes, REQUIRED_HEADERS[SHEETS.classes]);
  addDataSheet(workbook, SHEETS.subjects, REQUIRED_HEADERS[SHEETS.subjects]);
  addDataSheet(workbook, SHEETS.rooms, REQUIRED_HEADERS[SHEETS.rooms]);
  const assignments = addDataSheet(
    workbook,
    SHEETS.assignments,
    REQUIRED_HEADERS[SHEETS.assignments],
  );
  const availability = addDataSheet(
    workbook,
    SHEETS.availability,
    REQUIRED_HEADERS[SHEETS.availability],
  );
  const fixedLessons = addDataSheet(
    workbook,
    SHEETS.fixedLessons,
    REQUIRED_HEADERS[SHEETS.fixedLessons],
  );

  addListValidation(assignments, 5, GROUP_VALUES);
  addListValidation(assignments, 7, SHAPE_VALUES);
  addListValidation(availability, 1, ENTITY_VALUES);
  addListValidation(availability, 3, DAY_VALUES);
  addListValidation(availability, 5, AVAILABILITY_VALUES);
  addListValidation(fixedLessons, 3, DAY_VALUES);
  addListValidation(fixedLessons, 7, ["TRUE", "FALSE"]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function issue(
  severity: ImportIssueDraft["severity"],
  sheet: string,
  row: number | null,
  column: string | null,
  code: string,
  message: string,
  rawValue: string | null = null,
  suggestion: string | null = null,
): ImportIssueDraft {
  return { severity, sheet, row, column, code, message, rawValue, suggestion };
}

function isFormula(value: CellValue): boolean {
  return Boolean(value && typeof value === "object" && "formula" in value);
}

function cellText(cell: Cell, issues: ImportIssueDraft[], sheet: string): string {
  if (isFormula(cell.value)) {
    issues.push(
      issue(
        "ERROR",
        sheet,
        cell.row,
        cell.col.toString(),
        "FORMULA_NOT_ALLOWED",
        "Import nepovoluje vzorce.",
        cell.formula ?? null,
        "Nahraďte vzorec výslednou statickou hodnotou.",
      ),
    );
    return "";
  }
  return cell.text.trim();
}

function headerMap(
  worksheet: Worksheet,
  issues: ImportIssueDraft[],
): Map<string, number> {
  const result = new Map<string, number>();
  const headerRow = worksheet.getRow(1);
  for (let column = 1; column <= Math.max(headerRow.cellCount, 1); column += 1) {
    const value = cellText(headerRow.getCell(column), issues, worksheet.name);
    if (value) result.set(value, column);
  }
  for (const required of REQUIRED_HEADERS[worksheet.name] ?? []) {
    if (!result.has(required)) {
      issues.push(
        issue(
          "ERROR",
          worksheet.name,
          1,
          required,
          "REQUIRED_COLUMN_MISSING",
          `Chybí povinný sloupec ${required}.`,
          null,
          "Stáhněte novou šablonu a zachovejte technické záhlaví.",
        ),
      );
    }
  }
  return result;
}

function readRows(
  worksheet: Worksheet,
  issues: ImportIssueDraft[],
): Array<{ rowNumber: number; values: Record<string, string> }> {
  const headers = headerMap(worksheet, issues);
  const rows: Array<{ rowNumber: number; values: Record<string, string> }> = [];
  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values: Record<string, string> = {};
    for (const [header, column] of headers) {
      values[header] = cellText(row.getCell(column), issues, worksheet.name);
    }
    if (Object.values(values).some((value) => value !== "")) {
      rows.push({ rowNumber, values });
    }
  }
  return rows;
}

function requiredText(
  value: string,
  issues: ImportIssueDraft[],
  sheet: string,
  row: number,
  column: string,
): string {
  if (!value) {
    issues.push(
      issue(
        "ERROR",
        sheet,
        row,
        column,
        "REQUIRED_VALUE_MISSING",
        `Pole ${column} je povinné.`,
      ),
    );
  }
  return value;
}

function integerValue(
  value: string,
  issues: ImportIssueDraft[],
  sheet: string,
  row: number,
  column: string,
  options: { required?: boolean; min?: number; max?: number } = {},
): number | null {
  if (!value) {
    if (options.required) {
      issues.push(
        issue(
          "ERROR",
          sheet,
          row,
          column,
          "REQUIRED_VALUE_MISSING",
          `Pole ${column} je povinné.`,
        ),
      );
    }
    return null;
  }
  const parsed = Number(value.replace(",", "."));
  if (!Number.isInteger(parsed)) {
    issues.push(
      issue(
        "ERROR",
        sheet,
        row,
        column,
        "INTEGER_EXPECTED",
        `Pole ${column} musí obsahovat celé číslo.`,
        value,
      ),
    );
    return null;
  }
  if (options.min != null && parsed < options.min) {
    issues.push(
      issue(
        "ERROR",
        sheet,
        row,
        column,
        "NUMBER_BELOW_MINIMUM",
        `Pole ${column} musí být alespoň ${options.min}.`,
        value,
      ),
    );
  }
  if (options.max != null && parsed > options.max) {
    issues.push(
      issue(
        "ERROR",
        sheet,
        row,
        column,
        "NUMBER_ABOVE_MAXIMUM",
        `Pole ${column} může být nejvýše ${options.max}.`,
        value,
      ),
    );
  }
  return parsed;
}

function enumValue<T extends string>(
  value: string,
  allowed: readonly T[],
  issues: ImportIssueDraft[],
  sheet: string,
  row: number,
  column: string,
): T {
  if (!allowed.includes(value as T)) {
    issues.push(
      issue(
        "ERROR",
        sheet,
        row,
        column,
        "ENUM_VALUE_INVALID",
        `Pole ${column} musí obsahovat jednu z hodnot: ${allowed.join(", ")}.`,
        value || null,
      ),
    );
  }
  return value as T;
}

function booleanValue(
  value: string,
  issues: ImportIssueDraft[],
  sheet: string,
  row: number,
  column: string,
): boolean {
  const normalized = value.toUpperCase();
  if (["TRUE", "ANO", "1"].includes(normalized)) return true;
  if (["FALSE", "NE", "0"].includes(normalized)) return false;
  issues.push(
    issue(
      "ERROR",
      sheet,
      row,
      column,
      "BOOLEAN_VALUE_INVALID",
      `Pole ${column} musí obsahovat TRUE nebo FALSE.`,
      value || null,
    ),
  );
  return false;
}

function checkDuplicateCodes(
  rows: Array<{ code: string; row: number }>,
  sheet: string,
  column: string,
  issues: ImportIssueDraft[],
) {
  const seen = new Map<string, number>();
  for (const item of rows) {
    if (!item.code) continue;
    const previous = seen.get(item.code);
    if (previous != null) {
      issues.push(
        issue(
          "ERROR",
          sheet,
          item.row,
          column,
          "DUPLICATE_CODE",
          `Kód ${item.code} je duplicitní; poprvé je na řádku ${previous}.`,
          item.code,
          "Každý stabilní kód musí být v listu jedinečný.",
        ),
      );
    } else {
      seen.set(item.code, item.row);
    }
  }
}

function emptySummary(): ImportSummary {
  return {
    teachers: 0,
    classes: 0,
    subjects: 0,
    rooms: 0,
    assignments: 0,
    availabilityRules: 0,
    fixedLessons: 0,
    errors: 0,
    warnings: 0,
  };
}

export async function analyzeImportWorkbook(buffer: Buffer): Promise<ImportAnalysis> {
  const issues: ImportIssueDraft[] = [];
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return {
      templateVersion: "unknown",
      status: "VALIDATION_FAILED",
      payload: null,
      issues: [
        issue(
          "ERROR",
          "Soubor",
          null,
          null,
          "WORKBOOK_INVALID",
          "Soubor není platný podporovaný dokument .xlsx.",
        ),
      ],
      summary: { ...emptySummary(), errors: 1 },
    };
  }

  const metadata = workbook.getWorksheet("Metadata");
  const templateVersion = metadata?.getCell("B1").text.trim() || "unknown";
  if (templateVersion !== IMPORT_TEMPLATE_VERSION) {
    issues.push(
      issue(
        "ERROR",
        "Metadata",
        1,
        "templateVersion",
        "TEMPLATE_VERSION_UNSUPPORTED",
        `Verze šablony ${templateVersion} není podporovaná.`,
        templateVersion,
        `Použijte šablonu verze ${IMPORT_TEMPLATE_VERSION}.`,
      ),
    );
  }

  const worksheets = new Map<string, Worksheet>();
  for (const name of Object.values(SHEETS)) {
    const worksheet = workbook.getWorksheet(name);
    if (!worksheet) {
      issues.push(
        issue(
          "ERROR",
          name,
          null,
          null,
          "REQUIRED_SHEET_MISSING",
          `Chybí povinný list ${name}.`,
          null,
          "Stáhněte novou šablonu a zachovejte názvy listů.",
        ),
      );
    } else {
      worksheets.set(name, worksheet);
    }
  }

  if (worksheets.size !== Object.values(SHEETS).length) {
    const summary = emptySummary();
    summary.errors = issues.filter((item) => item.severity === "ERROR").length;
    return {
      templateVersion,
      status: "VALIDATION_FAILED",
      payload: null,
      issues,
      summary,
    };
  }

  const settingsRows = readRows(worksheets.get(SHEETS.settings)!, issues);
  if (settingsRows.length !== 1) {
    issues.push(
      issue(
        "ERROR",
        SHEETS.settings,
        null,
        null,
        "SETTINGS_ROW_COUNT_INVALID",
        "List Nastavení musí obsahovat právě jeden datový řádek.",
      ),
    );
  }
  const settingsSource = settingsRows[0] ?? { rowNumber: 2, values: {} };
  const settings: ImportSettingsRow = {
    school_year: requiredText(
      settingsSource.values.school_year ?? "",
      issues,
      SHEETS.settings,
      settingsSource.rowNumber,
      "school_year",
    ),
    monday_periods:
      integerValue(
        settingsSource.values.monday_periods ?? "",
        issues,
        SHEETS.settings,
        settingsSource.rowNumber,
        "monday_periods",
        { required: true, min: 1, max: 16 },
      ) ?? 0,
    tuesday_periods:
      integerValue(
        settingsSource.values.tuesday_periods ?? "",
        issues,
        SHEETS.settings,
        settingsSource.rowNumber,
        "tuesday_periods",
        { required: true, min: 1, max: 16 },
      ) ?? 0,
    wednesday_periods:
      integerValue(
        settingsSource.values.wednesday_periods ?? "",
        issues,
        SHEETS.settings,
        settingsSource.rowNumber,
        "wednesday_periods",
        { required: true, min: 1, max: 16 },
      ) ?? 0,
    thursday_periods:
      integerValue(
        settingsSource.values.thursday_periods ?? "",
        issues,
        SHEETS.settings,
        settingsSource.rowNumber,
        "thursday_periods",
        { required: true, min: 1, max: 16 },
      ) ?? 0,
    friday_periods:
      integerValue(
        settingsSource.values.friday_periods ?? "",
        issues,
        SHEETS.settings,
        settingsSource.rowNumber,
        "friday_periods",
        { required: true, min: 1, max: 16 },
      ) ?? 0,
  };

  const teacherSources = readRows(worksheets.get(SHEETS.teachers)!, issues);
  const teachers: ImportTeacherRow[] = teacherSources.map(({ rowNumber, values }) => ({
    teacher_code: requiredText(
      values.teacher_code ?? "",
      issues,
      SHEETS.teachers,
      rowNumber,
      "teacher_code",
    ),
    first_name: requiredText(
      values.first_name ?? "",
      issues,
      SHEETS.teachers,
      rowNumber,
      "first_name",
    ),
    last_name: requiredText(
      values.last_name ?? "",
      issues,
      SHEETS.teachers,
      rowNumber,
      "last_name",
    ),
    target_weekly_load:
      integerValue(
        values.target_weekly_load ?? "",
        issues,
        SHEETS.teachers,
        rowNumber,
        "target_weekly_load",
        { required: true, min: 0, max: 60 },
      ) ?? 0,
    min_weekly_load: integerValue(
      values.min_weekly_load ?? "",
      issues,
      SHEETS.teachers,
      rowNumber,
      "min_weekly_load",
      { min: 0, max: 60 },
    ),
    max_weekly_load: integerValue(
      values.max_weekly_load ?? "",
      issues,
      SHEETS.teachers,
      rowNumber,
      "max_weekly_load",
      { min: 0, max: 60 },
    ),
    subjects: (values.subjects ?? "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean),
    classes: (values.classes ?? "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean),
  }));

  const classSources = readRows(worksheets.get(SHEETS.classes)!, issues);
  const classes: ImportClassRow[] = classSources.map(({ rowNumber, values }) => ({
    class_code: requiredText(
      values.class_code ?? "",
      issues,
      SHEETS.classes,
      rowNumber,
      "class_code",
    ),
    grade:
      integerValue(
        values.grade ?? "",
        issues,
        SHEETS.classes,
        rowNumber,
        "grade",
        { required: true, min: 1, max: 13 },
      ) ?? 0,
    class_name: values.class_name?.trim() || values.class_code?.trim() || "",
  }));

  const subjectSources = readRows(worksheets.get(SHEETS.subjects)!, issues);
  const subjects: ImportSubjectRow[] = subjectSources.map(({ rowNumber, values }) => ({
    subject_code: requiredText(
      values.subject_code ?? "",
      issues,
      SHEETS.subjects,
      rowNumber,
      "subject_code",
    ),
    subject_name: requiredText(
      values.subject_name ?? "",
      issues,
      SHEETS.subjects,
      rowNumber,
      "subject_name",
    ),
    default_room_type: values.default_room_type?.trim() || null,
  }));

  const roomSources = readRows(worksheets.get(SHEETS.rooms)!, issues);
  const rooms: ImportRoomRow[] = roomSources.map(({ rowNumber, values }) => ({
    room_code: requiredText(
      values.room_code ?? "",
      issues,
      SHEETS.rooms,
      rowNumber,
      "room_code",
    ),
    room_name: requiredText(
      values.room_name ?? "",
      issues,
      SHEETS.rooms,
      rowNumber,
      "room_name",
    ),
    room_type: values.room_type?.trim() || null,
    capacity: integerValue(
      values.capacity ?? "",
      issues,
      SHEETS.rooms,
      rowNumber,
      "capacity",
      { min: 1, max: 1000 },
    ),
  }));

  const assignmentSources = readRows(worksheets.get(SHEETS.assignments)!, issues);
  const assignments: ImportAssignmentRow[] = assignmentSources.map(({ rowNumber, values }) => ({
    assignment_code: requiredText(
      values.assignment_code ?? "",
      issues,
      SHEETS.assignments,
      rowNumber,
      "assignment_code",
    ),
    class_code: requiredText(
      values.class_code ?? "",
      issues,
      SHEETS.assignments,
      rowNumber,
      "class_code",
    ),
    subject_code: requiredText(
      values.subject_code ?? "",
      issues,
      SHEETS.assignments,
      rowNumber,
      "subject_code",
    ),
    teacher_code: requiredText(
      values.teacher_code ?? "",
      issues,
      SHEETS.assignments,
      rowNumber,
      "teacher_code",
    ),
    group: enumValue(
      values.group ?? "",
      GROUP_VALUES,
      issues,
      SHEETS.assignments,
      rowNumber,
      "group",
    ),
    weekly_periods:
      integerValue(
        values.weekly_periods ?? "",
        issues,
        SHEETS.assignments,
        rowNumber,
        "weekly_periods",
        { required: true, min: 1, max: 40 },
      ) ?? 0,
    lesson_shape: enumValue(
      values.lesson_shape ?? "",
      SHAPE_VALUES,
      issues,
      SHEETS.assignments,
      rowNumber,
      "lesson_shape",
    ),
    double_periods_count:
      integerValue(
        values.double_periods_count ?? "",
        issues,
        SHEETS.assignments,
        rowNumber,
        "double_periods_count",
        { required: true, min: 0, max: 20 },
      ) ?? 0,
    required_room: values.required_room?.trim() || null,
    required_room_type: values.required_room_type?.trim() || null,
    max_per_day: integerValue(
      values.max_per_day ?? "",
      issues,
      SHEETS.assignments,
      rowNumber,
      "max_per_day",
      { min: 1, max: 16 },
    ),
    min_day_gap: integerValue(
      values.min_day_gap ?? "",
      issues,
      SHEETS.assignments,
      rowNumber,
      "min_day_gap",
      { min: 0, max: 4 },
    ),
  }));

  const availabilitySources = readRows(worksheets.get(SHEETS.availability)!, issues);
  const availability: ImportAvailabilityRow[] = availabilitySources.map(
    ({ rowNumber, values }) => ({
      entity_type: enumValue(
        values.entity_type ?? "",
        ENTITY_VALUES,
        issues,
        SHEETS.availability,
        rowNumber,
        "entity_type",
      ),
      entity_code: requiredText(
        values.entity_code ?? "",
        issues,
        SHEETS.availability,
        rowNumber,
        "entity_code",
      ),
      day: enumValue(
        values.day ?? "",
        DAY_VALUES,
        issues,
        SHEETS.availability,
        rowNumber,
        "day",
      ),
      period:
        integerValue(
          values.period ?? "",
          issues,
          SHEETS.availability,
          rowNumber,
          "period",
          { required: true, min: 1, max: 16 },
        ) ?? 0,
      kind: enumValue(
        values.kind ?? "",
        AVAILABILITY_VALUES,
        issues,
        SHEETS.availability,
        rowNumber,
        "kind",
      ),
      weight: integerValue(
        values.weight ?? "",
        issues,
        SHEETS.availability,
        rowNumber,
        "weight",
        { min: 1, max: 100 },
      ),
      reason: values.reason?.trim() || null,
    }),
  );

  const fixedSources = readRows(worksheets.get(SHEETS.fixedLessons)!, issues);
  const fixedLessons: ImportFixedLessonRow[] = fixedSources.map(({ rowNumber, values }) => ({
    assignment_code: requiredText(
      values.assignment_code ?? "",
      issues,
      SHEETS.fixedLessons,
      rowNumber,
      "assignment_code",
    ),
    block_index:
      integerValue(
        values.block_index ?? "",
        issues,
        SHEETS.fixedLessons,
        rowNumber,
        "block_index",
        { required: true, min: 0, max: 100 },
      ) ?? 0,
    day: enumValue(
      values.day ?? "",
      DAY_VALUES,
      issues,
      SHEETS.fixedLessons,
      rowNumber,
      "day",
    ),
    start_period:
      integerValue(
        values.start_period ?? "",
        issues,
        SHEETS.fixedLessons,
        rowNumber,
        "start_period",
        { required: true, min: 1, max: 16 },
      ) ?? 0,
    duration:
      integerValue(
        values.duration ?? "",
        issues,
        SHEETS.fixedLessons,
        rowNumber,
        "duration",
        { required: true, min: 1, max: 2 },
      ) ?? 0,
    room_code: values.room_code?.trim() || null,
    locked: booleanValue(
      values.locked ?? "",
      issues,
      SHEETS.fixedLessons,
      rowNumber,
      "locked",
    ),
  }));

  checkDuplicateCodes(
    teacherSources.map((source) => ({
      code: source.values.teacher_code ?? "",
      row: source.rowNumber,
    })),
    SHEETS.teachers,
    "teacher_code",
    issues,
  );
  checkDuplicateCodes(
    classSources.map((source) => ({
      code: source.values.class_code ?? "",
      row: source.rowNumber,
    })),
    SHEETS.classes,
    "class_code",
    issues,
  );
  checkDuplicateCodes(
    subjectSources.map((source) => ({
      code: source.values.subject_code ?? "",
      row: source.rowNumber,
    })),
    SHEETS.subjects,
    "subject_code",
    issues,
  );
  checkDuplicateCodes(
    roomSources.map((source) => ({
      code: source.values.room_code ?? "",
      row: source.rowNumber,
    })),
    SHEETS.rooms,
    "room_code",
    issues,
  );
  checkDuplicateCodes(
    assignmentSources.map((source) => ({
      code: source.values.assignment_code ?? "",
      row: source.rowNumber,
    })),
    SHEETS.assignments,
    "assignment_code",
    issues,
  );

  const teacherCodes = new Set(teachers.map((item) => item.teacher_code));
  const classCodes = new Set(classes.map((item) => item.class_code));
  const subjectCodes = new Set(subjects.map((item) => item.subject_code));
  const roomCodes = new Set(rooms.map((item) => item.room_code));
  const roomTypes = new Set(
    rooms.flatMap((item) => (item.room_type ? [item.room_type] : [])),
  );
  const assignmentCodes = new Set(assignments.map((item) => item.assignment_code));

  assignments.forEach((assignment, index) => {
    const sourceRow = assignmentSources[index]?.rowNumber ?? index + 2;
    const references: Array<[boolean, string, string, string]> = [
      [teacherCodes.has(assignment.teacher_code), "teacher_code", assignment.teacher_code, "učitele"],
      [classCodes.has(assignment.class_code), "class_code", assignment.class_code, "třídu"],
      [subjectCodes.has(assignment.subject_code), "subject_code", assignment.subject_code, "předmět"],
    ];
    for (const [exists, column, value, noun] of references) {
      if (!exists) {
        issues.push(
          issue(
            "ERROR",
            SHEETS.assignments,
            sourceRow,
            column,
            "REFERENCE_NOT_FOUND",
            `Kód ${value} neodkazuje na existující ${noun}.`,
            value,
          ),
        );
      }
    }
    if (assignment.required_room && !roomCodes.has(assignment.required_room)) {
      issues.push(
        issue(
          "ERROR",
          SHEETS.assignments,
          sourceRow,
          "required_room",
          "REFERENCE_NOT_FOUND",
          `Požadovaná učebna ${assignment.required_room} neexistuje.`,
          assignment.required_room,
        ),
      );
    }
    if (assignment.required_room_type && !roomTypes.has(assignment.required_room_type)) {
      issues.push(
        issue(
          "ERROR",
          SHEETS.assignments,
          sourceRow,
          "required_room_type",
          "ROOM_TYPE_UNAVAILABLE",
          `Pro typ ${assignment.required_room_type} není definovaná žádná učebna.`,
          assignment.required_room_type,
        ),
      );
    }
    if (assignment.double_periods_count * 2 > assignment.weekly_periods) {
      issues.push(
        issue(
          "ERROR",
          SHEETS.assignments,
          sourceRow,
          "double_periods_count",
          "DOUBLE_PERIODS_INCONSISTENT",
          "Počet dvojhodin překračuje týdenní dotaci.",
          String(assignment.double_periods_count),
          "Snižte počet dvojhodin nebo zvyšte weekly_periods.",
        ),
      );
    }
    if (assignment.lesson_shape === "DOUBLE" && assignment.weekly_periods % 2 !== 0) {
      issues.push(
        issue(
          "ERROR",
          SHEETS.assignments,
          sourceRow,
          "weekly_periods",
          "DOUBLE_SHAPE_REQUIRES_EVEN_PERIODS",
          "Vazba typu DOUBLE musí mít sudou týdenní dotaci.",
          String(assignment.weekly_periods),
        ),
      );
    }
  });

  availability.forEach((rule, index) => {
    const sourceRow = availabilitySources[index]?.rowNumber ?? index + 2;
    const codeSet =
      rule.entity_type === "TEACHER"
        ? teacherCodes
        : rule.entity_type === "CLASS"
          ? classCodes
          : roomCodes;
    if (!codeSet.has(rule.entity_code)) {
      issues.push(
        issue(
          "ERROR",
          SHEETS.availability,
          sourceRow,
          "entity_code",
          "REFERENCE_NOT_FOUND",
          `Entita ${rule.entity_code} neexistuje v příslušném číselníku.`,
          rule.entity_code,
        ),
      );
    }
    const dayIndex = DAY_VALUES.indexOf(rule.day);
    const periods = [
      settings.monday_periods,
      settings.tuesday_periods,
      settings.wednesday_periods,
      settings.thursday_periods,
      settings.friday_periods,
    ][dayIndex];
    if (rule.period > periods) {
      issues.push(
        issue(
          "ERROR",
          SHEETS.availability,
          sourceRow,
          "period",
          "PERIOD_OUT_OF_RANGE",
          `Perioda ${rule.period} je mimo rozsah dne ${rule.day}.`,
          String(rule.period),
        ),
      );
    }
  });

  fixedLessons.forEach((fixedLesson, index) => {
    const sourceRow = fixedSources[index]?.rowNumber ?? index + 2;
    if (!assignmentCodes.has(fixedLesson.assignment_code)) {
      issues.push(
        issue(
          "ERROR",
          SHEETS.fixedLessons,
          sourceRow,
          "assignment_code",
          "REFERENCE_NOT_FOUND",
          `Výuková vazba ${fixedLesson.assignment_code} neexistuje.`,
          fixedLesson.assignment_code,
        ),
      );
    }
    if (fixedLesson.room_code && !roomCodes.has(fixedLesson.room_code)) {
      issues.push(
        issue(
          "ERROR",
          SHEETS.fixedLessons,
          sourceRow,
          "room_code",
          "REFERENCE_NOT_FOUND",
          `Učebna ${fixedLesson.room_code} neexistuje.`,
          fixedLesson.room_code,
        ),
      );
    }
    const dayIndex = DAY_VALUES.indexOf(fixedLesson.day);
    const periods = [
      settings.monday_periods,
      settings.tuesday_periods,
      settings.wednesday_periods,
      settings.thursday_periods,
      settings.friday_periods,
    ][dayIndex];
    if (fixedLesson.start_period + fixedLesson.duration - 1 > periods) {
      issues.push(
        issue(
          "ERROR",
          SHEETS.fixedLessons,
          sourceRow,
          "start_period",
          "PERIOD_OUT_OF_RANGE",
          "Pevná hodina se nevejde do rozsahu dne.",
          String(fixedLesson.start_period),
        ),
      );
    }
  });

  const teacherLoads = new Map<string, number>();
  for (const assignment of assignments) {
    teacherLoads.set(
      assignment.teacher_code,
      (teacherLoads.get(assignment.teacher_code) ?? 0) + assignment.weekly_periods,
    );
  }
  teachers.forEach((teacher, index) => {
    const load = teacherLoads.get(teacher.teacher_code) ?? 0;
    if (load !== teacher.target_weekly_load) {
      issues.push(
        issue(
          "WARNING",
          SHEETS.teachers,
          teacherSources[index]?.rowNumber ?? index + 2,
          "target_weekly_load",
          "TEACHER_TARGET_LOAD_MISMATCH",
          `Součet vazeb učitele ${teacher.teacher_code} je ${load}, cílový úvazek je ${teacher.target_weekly_load}.`,
          String(teacher.target_weekly_load),
          "Ověřte úvazek nebo výukové vazby.",
        ),
      );
    }
  });

  assignments.forEach((assignment, index) => {
    if (assignment.group === "WHOLE") return;
    const counterpart = assignments.find(
      (candidate) =>
        candidate.assignment_code !== assignment.assignment_code &&
        candidate.class_code === assignment.class_code &&
        candidate.subject_code === assignment.subject_code &&
        candidate.group !== "WHOLE" &&
        candidate.group !== assignment.group,
    );
    if (!counterpart) {
      issues.push(
        issue(
          "WARNING",
          SHEETS.assignments,
          assignmentSources[index]?.rowNumber ?? index + 2,
          "group",
          "SPLIT_GROUP_COUNTERPART_MISSING",
          `Dělená vazba ${assignment.assignment_code} nemá protějšek druhé skupiny.`,
          assignment.group,
        ),
      );
    }
  });

  const payload: ImportPayload = {
    templateVersion: IMPORT_TEMPLATE_VERSION,
    settings,
    teachers,
    classes,
    subjects,
    rooms,
    assignments,
    availability,
    fixedLessons,
  };
  issues.sort((left, right) => {
    const severity = left.severity === right.severity ? 0 : left.severity === "ERROR" ? -1 : 1;
    if (severity !== 0) return severity;
    return `${left.sheet}:${left.row ?? 0}:${left.column ?? ""}:${left.code}`.localeCompare(
      `${right.sheet}:${right.row ?? 0}:${right.column ?? ""}:${right.code}`,
      "cs",
    );
  });

  const summary: ImportSummary = {
    teachers: teachers.length,
    classes: classes.length,
    subjects: subjects.length,
    rooms: rooms.length,
    assignments: assignments.length,
    availabilityRules: availability.length,
    fixedLessons: fixedLessons.length,
    errors: issues.filter((item) => item.severity === "ERROR").length,
    warnings: issues.filter((item) => item.severity === "WARNING").length,
  };

  return {
    templateVersion,
    status: summary.errors > 0 ? "VALIDATION_FAILED" : "READY",
    payload: summary.errors > 0 ? null : payload,
    issues,
    summary,
  };
}
