import type ExcelJS from "exceljs";
import type { Cell, Worksheet } from "exceljs";

import type { ImportIssueDraft } from "./contracts";

const LEGACY_INDIVIDUALS_SHEET = "jednotlivci";
const CLASS_COLUMNS = [3, 7, 11, 15, 19] as const;

export interface SubjectDescriptor {
  code: string;
  name: string;
  forcedGroup?: "GROUP_1" | "GROUP_2";
}

export interface TeacherSeed {
  key: string;
  firstName: string;
  lastName: string;
}

export interface Requirement {
  classCode: string;
  subject: SubjectDescriptor;
  rawTeacher: string;
  weeklyPeriods: number;
  row: number;
  teacherColumn: number;
}

interface ClassSlot {
  code: string;
  column: number;
  homeroomTeacher: string;
}

interface ClassBlock {
  row: number;
  slots: ClassSlot[];
}

export interface ParsedLegacySchoolWorkbook {
  sheetName: string;
  classCodes: string[];
  requirements: Requirement[];
  aliases: Map<string, TeacherSeed>;
  issues: ImportIssueDraft[];
}

const SUBJECTS: Record<string, SubjectDescriptor> = {
  cj: { code: "CJ", name: "Český jazyk" },
  cjl: { code: "CJ", name: "Český jazyk" },
  m: { code: "M", name: "Matematika" },
  aj: { code: "JAZ1", name: "Anglický jazyk" },
  d: { code: "DEJ", name: "Dějepis" },
  pr: { code: "PRI", name: "Přírodopis" },
  ov: { code: "OV", name: "Občanská výchova" },
  z: { code: "ZEM", name: "Zeměpis" },
  hv: { code: "HV", name: "Hudební výchova" },
  inf: { code: "INF", name: "Informatika" },
  f: { code: "FY", name: "Fyzika" },
  tv: { code: "TV", name: "Tělesná výchova" },
  vv: { code: "VV", name: "Výtvarná výchova" },
  pc: { code: "PC", name: "Pracovní činnosti" },
  prpk: { code: "PRPK", name: "Přírodovědné praktikum" },
  vkz: { code: "VZ", name: "Výchova ke zdraví" },
  chemie: { code: "CH", name: "Chemie" },
  ch: { code: "CH", name: "Chemie" },
  nemeckyjazyk: {
    code: "JAZ2",
    name: "Druhý cizí jazyk",
    forcedGroup: "GROUP_1",
  },
  nj: {
    code: "JAZ2",
    name: "Druhý cizí jazyk",
    forcedGroup: "GROUP_1",
  },
  spanelskyjazyk: {
    code: "JAZ2",
    name: "Druhý cizí jazyk",
    forcedGroup: "GROUP_2",
  },
  spj: {
    code: "JAZ2",
    name: "Druhý cizí jazyk",
    forcedGroup: "GROUP_2",
  },
  svs: { code: "SVS", name: "Svs" },
};

function cellText(cell: Cell): string {
  const value = cell.value;
  if (value && typeof value === "object" && "formula" in value) {
    const result = value.result;
    return result == null ? "" : String(result).trim();
  }
  return cell.text.trim();
}

export function asciiKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs-CZ")
    .replace(/[^a-z0-9]+/g, "");
}

export function cleanName(value: string): string {
  return value
    .replace(/\b(?:mgr|bc|ing|phdr|rndr)\.?\s*/gi, "")
    .replace(/,?\s*TU\s*\d+\.?[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]?\s*$/i, "")
    .replace(/\+\s*\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function correctedTeacherKey(value: string): string {
  const key = asciiKey(cleanName(value));
  return key === "sindlarova" ? "sindelarova" : key;
}

export function columnLetter(column: number): string {
  let value = column;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

export function teacherTokens(value: string): string[] {
  return value
    .split(/[\/;]+/)
    .map(cleanName)
    .filter(Boolean);
}

function issue(
  severity: ImportIssueDraft["severity"],
  sheet: string,
  row: number | null,
  column: string | null,
  code: string,
  message: string,
  rawValue: string | null,
  suggestion: string | null,
): ImportIssueDraft {
  return { severity, sheet, row, column, code, message, rawValue, suggestion };
}

function normalizeClassCode(value: string): string | null {
  const normalized = value
    .trim()
    .toLocaleUpperCase("cs-CZ")
    .replace(/\s+/g, "");
  const match = normalized.match(/^(\d{1,2})\.?([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])$/);
  return match ? `${Number(match[1])}.${match[2]}` : null;
}

function integerValue(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isInteger(parsed) ? parsed : null;
}

function subjectDescriptor(rawSubject: string): SubjectDescriptor {
  const known = SUBJECTS[asciiKey(rawSubject)];
  if (known) return known;
  const compact = asciiKey(rawSubject).toLocaleUpperCase("cs-CZ");
  return {
    code: (compact.slice(0, 12) || "PREDMET").replace(/^[0-9]/, "P$&"),
    name: rawSubject.trim() || "Neznámý předmět",
  };
}

function parseRosterName(rawName: string): TeacherSeed | null {
  const parts = cleanName(rawName).split(" ").filter(Boolean);
  if (parts.length === 0) return null;
  const lastName = parts[0]!;
  return {
    key: correctedTeacherKey(lastName),
    firstName: parts.slice(1).join(" "),
    lastName,
  };
}

function parseHeaderName(rawName: string): TeacherSeed | null {
  const parts = cleanName(rawName).split(" ").filter(Boolean);
  if (parts.length === 0) return null;
  const lastName = parts.at(-1)!;
  return {
    key: correctedTeacherKey(lastName),
    firstName: parts.slice(0, -1).join(" "),
    lastName,
  };
}

function addTeacherAliases(
  aliases: Map<string, TeacherSeed>,
  teacher: TeacherSeed,
): void {
  for (const value of [
    teacher.lastName,
    `${teacher.firstName} ${teacher.lastName}`,
    `${teacher.lastName} ${teacher.firstName}`,
  ]) {
    const key = correctedTeacherKey(value);
    if (key) aliases.set(key, teacher);
  }
}

function mergeTeacherSeed(
  aliases: Map<string, TeacherSeed>,
  candidate: TeacherSeed,
): void {
  const existing = aliases.get(correctedTeacherKey(candidate.lastName));
  const merged = existing
    ? {
        ...existing,
        firstName: existing.firstName || candidate.firstName,
        lastName: existing.lastName || candidate.lastName,
      }
    : candidate;
  addTeacherAliases(aliases, merged);
}

function findClassBlocks(worksheet: Worksheet): ClassBlock[] {
  const blocks: ClassBlock[] = [];
  for (let row = 1; row <= worksheet.rowCount; row += 1) {
    const slots = CLASS_COLUMNS.flatMap((column) => {
      const code = normalizeClassCode(cellText(worksheet.getCell(row, column)));
      return code
        ? [
            {
              code,
              column,
              homeroomTeacher: cellText(worksheet.getCell(row, column + 1)),
            },
          ]
        : [];
    });
    if (slots.length > 0) blocks.push({ row, slots });
  }
  return blocks;
}

function findSubjectHeaderRow(
  worksheet: Worksheet,
  blockRow: number,
  endRow: number,
  subjectColumn: number,
): number | null {
  for (
    let row = blockRow + 1;
    row <= Math.min(endRow, blockRow + 6);
    row += 1
  ) {
    if (
      asciiKey(cellText(worksheet.getCell(row, subjectColumn))) === "predmety"
    ) {
      return row;
    }
  }
  return null;
}

function parseRequirements(
  worksheet: Worksheet,
  blocks: ClassBlock[],
  issues: ImportIssueDraft[],
): Requirement[] {
  const requirements: Requirement[] = [];
  blocks.forEach((block, blockIndex) => {
    const endRow = blocks[blockIndex + 1]?.row
      ? blocks[blockIndex + 1]!.row - 1
      : worksheet.rowCount;
    for (const slot of block.slots) {
      const headerRow = findSubjectHeaderRow(
        worksheet,
        block.row,
        endRow,
        slot.column,
      );
      if (!headerRow) {
        issues.push(
          issue(
            "ERROR",
            worksheet.name,
            block.row,
            columnLetter(slot.column),
            "LEGACY_CLASS_HEADER_INVALID",
            `U třídy ${slot.code} nebyla nalezena hlavička Předměty / Učitel / Časová dotace.`,
            null,
            "Zachovejte původní třísloupcovou strukturu bloku třídy.",
          ),
        );
        continue;
      }
      for (let row = headerRow + 1; row <= endRow; row += 1) {
        const rawSubject = cellText(worksheet.getCell(row, slot.column));
        const rawTeacher = cellText(worksheet.getCell(row, slot.column + 1));
        const rawHours = cellText(worksheet.getCell(row, slot.column + 2));
        if (!rawSubject && !rawTeacher && !rawHours) continue;
        if (!rawSubject && asciiKey(rawTeacher) === "tu") continue;
        if (!rawSubject && !rawHours) continue;
        const weeklyPeriods = integerValue(rawHours);
        if (!rawSubject || weeklyPeriods == null || weeklyPeriods <= 0) {
          issues.push(
            issue(
              "ERROR",
              worksheet.name,
              row,
              `${columnLetter(slot.column)}:${columnLetter(slot.column + 2)}`,
              "LEGACY_TEACHING_ROW_INVALID",
              `${slot.code}: řádek předmětu nemá platný název a kladnou celou časovou dotaci.`,
              [rawSubject, rawTeacher, rawHours].join(" | "),
              "Doplňte předmět a počet hodin týdně.",
            ),
          );
          continue;
        }
        requirements.push({
          classCode: slot.code,
          subject: subjectDescriptor(rawSubject),
          rawTeacher,
          weeklyPeriods,
          row,
          teacherColumn: slot.column + 1,
        });
      }
    }
  });
  return requirements;
}

export function parseLegacySchoolWorkbook(
  workbook: ExcelJS.Workbook,
): ParsedLegacySchoolWorkbook | null {
  const staffingSheet = workbook.worksheets.find((worksheet) =>
    worksheet.name.toLocaleLowerCase("cs-CZ").startsWith("úvazky"),
  );
  const individualsSheet = workbook.worksheets.find(
    (worksheet) => asciiKey(worksheet.name) === LEGACY_INDIVIDUALS_SHEET,
  );
  if (!staffingSheet || !individualsSheet) return null;

  const issues: ImportIssueDraft[] = [];
  const blocks = findClassBlocks(staffingSheet);
  if (blocks.length === 0) return null;

  const aliases = new Map<string, TeacherSeed>();
  for (let row = 1; row < blocks[0]!.row; row += 1) {
    const rawName = cellText(staffingSheet.getCell(row, 3));
    if (asciiKey(rawName).startsWith("ucitel")) continue;
    const seed = parseRosterName(rawName);
    if (seed) mergeTeacherSeed(aliases, seed);
  }
  for (const block of blocks) {
    for (const slot of block.slots) {
      const seed = parseHeaderName(slot.homeroomTeacher);
      if (seed) mergeTeacherSeed(aliases, seed);
    }
  }

  const classCodes = [
    ...new Set(blocks.flatMap((block) => block.slots.map((slot) => slot.code))),
  ].sort((left, right) => left.localeCompare(right, "cs", { numeric: true }));

  return {
    sheetName: staffingSheet.name,
    classCodes,
    requirements: parseRequirements(staffingSheet, blocks, issues),
    aliases,
    issues,
  };
}
