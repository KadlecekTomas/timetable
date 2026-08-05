import ExcelJS, { type Worksheet } from "exceljs";

import {
  createEmptyStaffingPlan,
  createEmptyStaffingTeacher,
  createEmptySubjectLoad,
  type StaffingPlan,
  type StaffingTeacher,
} from "@/lib/local/staffing-plan";
import {
  createEmptyTeachingPlan,
  createTeachingPlanClass,
  createTeachingPlanRow,
  normalizeClassCode,
  type TeachingPlan,
} from "@/lib/local/teaching-plan";

const LOADS_SHEET = "Úvazky 20252026";
const INDIVIDUALS_SHEET = "Jednotlivci";
const CLASS_COLUMNS = [3, 7, 11, 15] as const;

const SUBJECT_ALIASES: Record<string, string> = {
  CJ: "CJ",
  ČJ: "CJ",
  ČJL: "CJ",
  M: "M",
  MATEMATIKA: "M",
  AJ: "JAZ1",
  ANGLICKÝJAZYK: "JAZ1",
  NJ: "JAZ2",
  NĚMECKÝJAZYK: "JAZ2",
  ŠPJ: "JAZ2",
  ŠPANĚLSKÝJAZYK: "JAZ2",
  INF: "INF",
  INFORMATIKA: "INF",
  TV: "TV",
  TVCHLAPCI: "TV",
  TVDÍVKY: "TV",
  F: "FY",
  FYZIKA: "FY",
  D: "DEJ",
  DĚJEPIS: "DEJ",
  Z: "ZEM",
  ZEMĚPIS: "ZEM",
  PŘ: "PRI",
  PR: "PRI",
  PŘÍRODOPIS: "PRI",
  CH: "CH",
  CHEMIE: "CH",
  OV: "OV",
  OBČANSKÁVÝCHOVA: "OV",
  VKZ: "VZ",
  VZ: "VZ",
  VÝCHOVAKEZDRAVÍ: "VZ",
  HV: "HV",
  HUDEBNÍVÝCHOVA: "HV",
  VV: "VV",
  VÝTVARNÁVÝCHOVA: "VV",
  PČ: "PC",
  PC: "PC",
  PRACOVNÍČINNOSTI: "PC",
  SVS: "SVS",
  PŘPK: "PRPK",
  PRPK: "PRPK",
  PKČJ: "PKCJ",
};

export interface ChodovickaImportIssue {
  severity: "ERROR" | "WARNING";
  sheet: string;
  row: number | null;
  field: string | null;
  message: string;
}

export interface ChodovickaWorkbookAnalysis {
  matched: boolean;
  valid: boolean;
  staffingPlan: StaffingPlan;
  teachingPlan: TeachingPlan;
  issues: ChodovickaImportIssue[];
  summary: {
    teachers: number;
    classes: number;
    teachingRows: number;
    splitRows: number;
    weeklyClassPeriods: number;
    unresolvedTeachers: number;
  };
}

function valueText(value: unknown): string {
  if (value && typeof value === "object" && "result" in value) {
    return String((value as { result?: unknown }).result ?? "").trim();
  }
  return String(value ?? "").trim();
}

function integer(value: unknown): number | null {
  const parsed = Number(valueText(value).replace(",", "."));
  return Number.isInteger(parsed) ? parsed : null;
}

function token(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLocaleUpperCase("cs-CZ");
}

function normalizeSubject(value: string): string | null {
  return SUBJECT_ALIASES[token(value)] ?? null;
}

function cleanPersonName(value: string): string {
  return value
    .replace(/\b(Mgr\.|Bc\.|Ing\.|PhDr\.|RNDr\.)\s*/gi, "")
    .replace(/,\s*TU\s*\d+\.[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ].*$/i, "")
    .replace(/\+\d+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameParts(raw: string): { firstName: string; lastName: string } {
  const cleaned = cleanPersonName(raw);
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: "Doplnit", lastName: parts[0]! };
  return { lastName: parts[0]!, firstName: parts.slice(1).join(" ") };
}

function surnameKey(value: string): string {
  return token(cleanPersonName(value).split(" ")[0] ?? "");
}

function splitTeacherNames(value: string): string[] {
  return value
    .split(/\s*\/\s*|\s*\+\s*/)
    .map((item) => cleanPersonName(item))
    .filter(Boolean);
}

function sheetByLooseName(workbook: ExcelJS.Workbook, expected: string): Worksheet | undefined {
  const expectedToken = token(expected);
  return workbook.worksheets.find((sheet) => token(sheet.name) === expectedToken);
}

function addTeacher(
  teachers: Map<string, StaffingTeacher>,
  rawName: string,
  targetWeeklyLoad: number | null,
): StaffingTeacher {
  const parts = nameParts(rawName);
  const key = surnameKey(parts.lastName);
  const existing = teachers.get(key);
  if (existing) {
    if (targetWeeklyLoad != null && targetWeeklyLoad > 0) {
      existing.targetWeeklyLoad = targetWeeklyLoad;
    }
    if (existing.firstName === "Doplnit" && parts.firstName !== "Doplnit") {
      existing.firstName = parts.firstName;
    }
    return existing;
  }
  const teacher = createEmptyStaffingTeacher();
  teacher.firstName = parts.firstName || "Doplnit";
  teacher.lastName = parts.lastName || rawName;
  teacher.targetWeeklyLoad = targetWeeklyLoad ?? 0;
  teacher.subjectLoads = [];
  teacher.unavailableDays = [];
  teachers.set(key || token(rawName), teacher);
  return teacher;
}

function parseTeacherDirectory(
  sheet: Worksheet,
  issues: ChodovickaImportIssue[],
): Map<string, StaffingTeacher> {
  const teachers = new Map<string, StaffingTeacher>();
  for (let row = 5; row <= Math.min(37, sheet.rowCount); row += 1) {
    const rawName = valueText(sheet.getCell(row, 3).value);
    if (!rawName) continue;
    const target = integer(sheet.getCell(row, 4).value) ?? integer(sheet.getCell(row, 1).value);
    addTeacher(teachers, rawName, target);
    const request = valueText(sheet.getCell(row, 1).value);
    if (request && integer(request) == null) {
      issues.push({
        severity: "WARNING",
        sheet: sheet.name,
        row,
        field: "Požadavek",
        message: `${cleanPersonName(rawName)}: požadavek „${request}“ je potřeba potvrdit ručně v dostupnostech.`,
      });
    }
  }
  return teachers;
}

function findTeacher(
  teachers: Map<string, StaffingTeacher>,
  rawName: string,
  issues: ChodovickaImportIssue[],
  sheet: string,
  row: number,
): StaffingTeacher {
  const key = surnameKey(rawName);
  const existing = teachers.get(key);
  if (existing) return existing;
  const placeholder = addTeacher(teachers, rawName, null);
  issues.push({
    severity: "WARNING",
    sheet,
    row,
    field: "Učitel",
    message: `Učitel „${rawName}“ nebyl v horní tabulce úvazků. Byl založen jako ${placeholder.firstName} ${placeholder.lastName} a je potřeba ho potvrdit.`,
  });
  return placeholder;
}

function parseClassBlocks(
  sheet: Worksheet,
  teachers: Map<string, StaffingTeacher>,
  issues: ChodovickaImportIssue[],
): TeachingPlan {
  const plan = createEmptyTeachingPlan();
  const classCodes = new Set<string>();

  for (let headerRow = 40; headerRow <= sheet.rowCount; headerRow += 1) {
    for (const column of CLASS_COLUMNS) {
      const classCode = normalizeClassCode(valueText(sheet.getCell(headerRow, column).value));
      if (!/^([6-9])\.[A-D]$/.test(classCode)) continue;

      classCodes.add(classCode);
      let tableHeader = -1;
      for (let candidate = headerRow + 1; candidate <= Math.min(headerRow + 5, sheet.rowCount); candidate += 1) {
        if (token(valueText(sheet.getCell(candidate, column).value)) === "PREDMETY") {
          tableHeader = candidate;
          break;
        }
      }
      if (tableHeader < 0) {
        issues.push({
          severity: "ERROR",
          sheet: sheet.name,
          row: headerRow,
          field: classCode,
          message: `U třídy ${classCode} nebyla nalezena tabulka předmětů.`,
        });
        continue;
      }

      for (let row = tableHeader + 1; row <= Math.min(tableHeader + 25, sheet.rowCount); row += 1) {
        const rawSubject = valueText(sheet.getCell(row, column).value);
        const rawTeachers = valueText(sheet.getCell(row, column + 1).value);
        const periods = integer(sheet.getCell(row, column + 2).value);
        if (!rawSubject && !rawTeachers && periods == null) break;
        if (!rawSubject) continue;

        const subjectCode = normalizeSubject(rawSubject);
        if (!subjectCode) {
          issues.push({
            severity: "WARNING",
            sheet: sheet.name,
            row,
            field: "Předmět",
            message: `${classCode}: neznámá zkratka nebo název předmětu „${rawSubject}“. Řádek nebyl automaticky převzat.`,
          });
          continue;
        }
        if (periods == null || periods <= 0) {
          issues.push({
            severity: "ERROR",
            sheet: sheet.name,
            row,
            field: "Časová dotace",
            message: `${classCode} ${rawSubject}: časová dotace není platné kladné celé číslo.`,
          });
          continue;
        }

        const teacherNames = splitTeacherNames(rawTeachers);
        const rowItem = createTeachingPlanRow(classCode, subjectCode);
        rowItem.weeklyPeriods = periods;
        rowItem.lessonShape = subjectCode === "TV" && periods % 2 === 0 ? "DOUBLE" : "SEPARATE";
        rowItem.doublePeriodsCount = rowItem.lessonShape === "DOUBLE" ? periods / 2 : 0;

        if (teacherNames.length === 1) {
          rowItem.primaryTeacherId = findTeacher(teachers, teacherNames[0]!, issues, sheet.name, row).id;
        } else if (teacherNames.length >= 2) {
          rowItem.organization = "SPLIT";
          rowItem.primaryTeacherId = findTeacher(teachers, teacherNames[0]!, issues, sheet.name, row).id;
          rowItem.secondaryTeacherId = findTeacher(teachers, teacherNames[1]!, issues, sheet.name, row).id;
          issues.push({
            severity: "WARNING",
            sheet: sheet.name,
            row,
            field: "Dělení",
            message: `${classCode} ${rawSubject}: „${rawTeachers}“ bylo rozpoznáno jako dvě paralelní skupiny. Potvrďte, že nejde o střídání nebo společnou výuku více tříd.`,
          });
        } else {
          issues.push({
            severity: "WARNING",
            sheet: sheet.name,
            row,
            field: "Učitel",
            message: `${classCode} ${rawSubject}: chybí učitel.`,
          });
        }
        plan.rows.push(rowItem);
      }
    }
  }

  plan.classes = [...classCodes]
    .sort((a, b) => a.localeCompare(b, "cs-CZ", { numeric: true }))
    .map((code) => createTeachingPlanClass(code));
  return plan;
}

function accumulateLoads(plan: TeachingPlan, teachers: Map<string, StaffingTeacher>): void {
  const byTeacher = new Map<string, Map<string, number>>();
  for (const row of plan.rows) {
    for (const teacherId of [row.primaryTeacherId, row.secondaryTeacherId]) {
      if (!teacherId) continue;
      const subjectLoads = byTeacher.get(teacherId) ?? new Map<string, number>();
      subjectLoads.set(row.subjectCode, (subjectLoads.get(row.subjectCode) ?? 0) + row.weeklyPeriods);
      byTeacher.set(teacherId, subjectLoads);
    }
  }
  for (const teacher of teachers.values()) {
    const loads = byTeacher.get(teacher.id) ?? new Map<string, number>();
    teacher.subjectLoads = [...loads.entries()].map(([subjectCode, weeklyPeriods]) => {
      const load = createEmptySubjectLoad();
      load.subjectCode = subjectCode;
      load.weeklyPeriods = weeklyPeriods;
      return load;
    });
    if (teacher.targetWeeklyLoad <= 0) {
      teacher.targetWeeklyLoad = [...loads.values()].reduce((sum, value) => sum + value, 0);
    }
  }
}

function individualTotals(sheet: Worksheet): Map<string, number> {
  const totals = new Map<string, number>();
  for (const column of [2, 6, 10]) {
    for (let row = 1; row <= sheet.rowCount; row += 1) {
      const heading = valueText(sheet.getCell(row, column).value);
      if (!heading || token(heading) === "PREDMET") continue;
      if (!/(Mgr\.|Bc\.|TU|[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])/u.test(heading)) continue;
      for (let candidate = row + 1; candidate <= Math.min(row + 15, sheet.rowCount); candidate += 1) {
        if (token(valueText(sheet.getCell(candidate, column + 1).value)) === "CELKEM") {
          const total = integer(sheet.getCell(candidate, column + 2).value);
          if (total != null) totals.set(surnameKey(heading), total);
          break;
        }
      }
    }
  }
  return totals;
}

function crossValidateTotals(
  teachers: Map<string, StaffingTeacher>,
  totals: Map<string, number>,
  issues: ChodovickaImportIssue[],
): void {
  for (const [key, total] of totals) {
    const teacher = teachers.get(key);
    if (!teacher) continue;
    const calculated = teacher.subjectLoads.reduce((sum, item) => sum + item.weeklyPeriods, 0);
    if (calculated !== total) {
      issues.push({
        severity: "WARNING",
        sheet: INDIVIDUALS_SHEET,
        row: null,
        field: teacher.lastName,
        message: `${teacher.firstName} ${teacher.lastName}: list Jednotlivci uvádí ${total} h, z třídních bloků bylo vypočteno ${calculated} h. Rozdíl je potřeba zkontrolovat.`,
      });
    }
  }
}

export async function analyzeChodovickaWorkbook(
  input: ArrayBuffer | Uint8Array,
): Promise<ChodovickaWorkbookAnalysis> {
  const workbook = new ExcelJS.Workbook();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  await workbook.xlsx.load(bytes as never);

  const loadsSheet = sheetByLooseName(workbook, LOADS_SHEET);
  const individualsSheet = sheetByLooseName(workbook, INDIVIDUALS_SHEET);
  const matched = Boolean(loadsSheet && individualsSheet);
  const issues: ChodovickaImportIssue[] = [];
  if (!loadsSheet || !individualsSheet) {
    return {
      matched: false,
      valid: false,
      staffingPlan: createEmptyStaffingPlan(),
      teachingPlan: createEmptyTeachingPlan(),
      issues: [],
      summary: {
        teachers: 0,
        classes: 0,
        teachingRows: 0,
        splitRows: 0,
        weeklyClassPeriods: 0,
        unresolvedTeachers: 0,
      },
    };
  }

  const teachers = parseTeacherDirectory(loadsSheet, issues);
  const teachingPlan = parseClassBlocks(loadsSheet, teachers, issues);
  accumulateLoads(teachingPlan, teachers);
  crossValidateTotals(teachers, individualTotals(individualsSheet), issues);

  for (const teacher of teachers.values()) {
    const calculated = teacher.subjectLoads.reduce((sum, item) => sum + item.weeklyPeriods, 0);
    if (teacher.targetWeeklyLoad !== calculated) {
      issues.push({
        severity: "WARNING",
        sheet: LOADS_SHEET,
        row: null,
        field: teacher.lastName,
        message: `${teacher.firstName} ${teacher.lastName}: cílový úvazek ${teacher.targetWeeklyLoad} h, rozpoznané předměty ${calculated} h.`,
      });
    }
  }

  const staffingPlan: StaffingPlan = {
    version: 1,
    updatedAt: new Date().toISOString(),
    teachers: [...teachers.values()].filter(
      (teacher) => teacher.targetWeeklyLoad > 0 || teacher.subjectLoads.length > 0,
    ),
  };
  const unresolvedTeachers = staffingPlan.teachers.filter(
    (teacher) => teacher.firstName === "Doplnit",
  ).length;

  return {
    matched,
    valid:
      teachingPlan.classes.length > 0 &&
      teachingPlan.rows.length > 0 &&
      !issues.some((issue) => issue.severity === "ERROR"),
    staffingPlan,
    teachingPlan,
    issues,
    summary: {
      teachers: staffingPlan.teachers.length,
      classes: teachingPlan.classes.length,
      teachingRows: teachingPlan.rows.length,
      splitRows: teachingPlan.rows.filter((row) => row.organization === "SPLIT").length,
      weeklyClassPeriods: teachingPlan.rows.reduce((sum, row) => sum + row.weeklyPeriods, 0),
      unresolvedTeachers,
    },
  };
}
