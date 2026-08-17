import type ExcelJS from "exceljs";
import type { Cell, Worksheet } from "exceljs";

import {
  createEmptyStaffingPlan,
  MAX_WEEKLY_TEACHER_LOAD,
  type StaffingPlan,
  type StaffingSubjectLoad,
  type StaffingTeacher,
} from "@/lib/local/staffing-plan";
import type {
  StaffingAllocationDraft,
  StaffingAllocationDraftRow,
} from "@/lib/local/staffing-allocation-draft";
import type {
  StaffingWorkbookAnalysis,
  StaffingWorkbookIssue,
} from "./staffing-workbook";
import {
  cleanName,
  correctedTeacherKey,
  parseLegacySchoolWorkbook,
  teacherTokens,
  type TeacherSeed,
} from "./legacy-school-workbook-parser";

interface TeacherAggregate extends TeacherSeed {
  id: string;
  declaredTarget: number | null;
  subjectHours: Map<string, number>;
}

export interface LegacyStaffingPlanAnalysis extends StaffingWorkbookAnalysis {
  recognized: boolean;
  allocationDraft: StaffingAllocationDraft | null;
  summary: StaffingWorkbookAnalysis["summary"] & {
    teachingWeeklyLoad: number;
    reserveWeeklyLoad: number;
    unassignedClassPeriods: number;
    overloadedTeachers: number;
    overloadWeeklyLoad: number;
    teachersWithCapacity: number;
  };
}

function cellText(cell: Cell): string {
  const value = cell.value;
  if (value && typeof value === "object" && "formula" in value) {
    return value.result == null ? "" : String(value.result).trim();
  }
  return cell.text.trim();
}

function exactInteger(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.0+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function teacherId(key: string): string {
  return `legacy-teacher-${key || "unknown"}`;
}

function rosterSeed(rawName: string): TeacherSeed | null {
  const parts = cleanName(rawName).split(" ").filter(Boolean);
  if (parts.length === 0) return null;
  const lastName = parts[0]!;
  return {
    key: correctedTeacherKey(lastName),
    firstName: parts.slice(1).join(" "),
    lastName,
  };
}

function issue(
  severity: StaffingWorkbookIssue["severity"],
  row: number | null,
  field: string | null,
  message: string,
): StaffingWorkbookIssue {
  return { severity, row, field, message };
}

function addSubjectHours(
  teacher: TeacherAggregate,
  subjectCode: string,
  weeklyPeriods: number,
): void {
  teacher.subjectHours.set(
    subjectCode,
    (teacher.subjectHours.get(subjectCode) ?? 0) + weeklyPeriods,
  );
}

function findRosterEndRow(
  worksheet: Worksheet,
  firstRequirementRow: number | undefined,
): number {
  return Math.max(1, (firstRequirementRow ?? worksheet.rowCount + 1) - 4);
}

function createTeacher(
  seed: TeacherSeed,
  declaredTarget: number | null,
): TeacherAggregate {
  return {
    ...seed,
    id: teacherId(seed.key),
    declaredTarget,
    subjectHours: new Map<string, number>(),
  };
}

export function analyzeLegacyStaffingPlan(
  workbook: ExcelJS.Workbook,
): LegacyStaffingPlanAnalysis | null {
  const parsed = parseLegacySchoolWorkbook(workbook);
  if (!parsed) return null;

  const worksheet = workbook.getWorksheet(parsed.sheetName);
  if (!worksheet) return null;

  const issues: StaffingWorkbookIssue[] = parsed.issues.map((item) =>
    issue(item.severity, item.row, item.column, item.message),
  );
  const teachers = new Map<string, TeacherAggregate>();
  const rosterEndRow = findRosterEndRow(
    worksheet,
    parsed.requirements.map((item) => item.row).sort((a, b) => a - b)[0],
  );

  for (let row = 1; row <= rosterEndRow; row += 1) {
    const rawName = cellText(worksheet.getCell(row, 3));
    if (!rawName || correctedTeacherKey(rawName).startsWith("ucitel")) continue;
    const seed = rosterSeed(rawName);
    if (!seed?.key) continue;
    const requested = exactInteger(cellText(worksheet.getCell(row, 1)));
    const current = exactInteger(cellText(worksheet.getCell(row, 4)));
    const declaredTarget = requested ?? current;
    const existing = teachers.get(seed.key);
    if (existing) {
      existing.firstName ||= seed.firstName;
      existing.lastName ||= seed.lastName;
      existing.declaredTarget ??= declaredTarget;
      continue;
    }
    teachers.set(seed.key, createTeacher(seed, declaredTarget));
  }

  const resolveTeacher = (
    rawToken: string,
    row: number,
  ): TeacherAggregate | null => {
    const token = cleanName(rawToken);
    const key = correctedTeacherKey(token);
    if (!key) return null;
    const alias = parsed.aliases.get(key);
    const resolvedKey = alias?.key ?? key;
    const existing = teachers.get(resolvedKey);
    if (existing) return existing;

    const seed = alias ?? {
      key: resolvedKey,
      firstName: "Doplnit",
      lastName: token,
    };
    const created = createTeacher(
      {
        ...seed,
        firstName: seed.firstName || "Doplnit",
      },
      null,
    );
    teachers.set(created.key, created);
    issues.push(
      issue(
        "WARNING",
        row,
        "Učitel/učitelka",
        `${token}: učitel nebyl v horním personálním seznamu, ale byl zachován z matice výuky. Doplňte nebo ověřte jeho celé jméno.`,
      ),
    );
    return created;
  };

  const draftRows: StaffingAllocationDraftRow[] = [];
  let unassignedClassPeriods = 0;

  for (const requirement of parsed.requirements) {
    const tokens = teacherTokens(requirement.rawTeacher).slice(0, 2);
    const resolved = tokens.flatMap((token) => {
      const teacher = resolveTeacher(token, requirement.row);
      return teacher ? [teacher] : [];
    });

    const teacherWeeklyPeriods =
      requirement.weeklyPeriods + requirement.teacherExtraPeriods;
    for (const teacher of resolved) {
      addSubjectHours(teacher, requirement.subject.code, teacherWeeklyPeriods);
    }

    if (tokens.length === 0) {
      unassignedClassPeriods += requirement.weeklyPeriods;
      issues.push(
        issue(
          "WARNING",
          requirement.row,
          "Učitel/učitelka",
          `${requirement.classCode} · ${requirement.subject.name}: ${requirement.weeklyPeriods} h zatím nemá učitele. Výuka se načte jako volné místo k doplnění.`,
        ),
      );
    }
    if (teacherTokens(requirement.rawTeacher).length > 2) {
      issues.push(
        issue(
          "WARNING",
          requirement.row,
          "Učitel/učitelka",
          `${requirement.classCode} · ${requirement.subject.name}: zachováni byli první dva souběžní učitelé; další je potřeba zkontrolovat ručně.`,
        ),
      );
    }

    draftRows.push({
      classCode: requirement.classCode,
      subjectCode: requirement.subject.code,
      weeklyPeriods: requirement.weeklyPeriods,
      group: requirement.subject.forcedGroup ?? "WHOLE",
      teacherIds: resolved.map((teacher) => teacher.id),
      sourceSheet: parsed.sheetName,
      sourceRow: requirement.row,
    });
  }

  const teacherRows: StaffingTeacher[] = [...teachers.values()]
    .sort((left, right) =>
      `${left.lastName} ${left.firstName}`.localeCompare(
        `${right.lastName} ${right.firstName}`,
        "cs-CZ",
      ),
    )
    .map((teacher) => {
      if (!teacher.firstName.trim()) {
        teacher.firstName = "Doplnit";
        issues.push(
          issue(
            "WARNING",
            null,
            "Jméno",
            `${teacher.lastName}: ve zdroji chybí křestní jméno. Byla vložena viditelná hodnota „Doplnit“.`,
          ),
        );
      }
      const teachingWeeklyLoad = [...teacher.subjectHours.values()].reduce(
        (total, value) => total + value,
        0,
      );
      const declared = teacher.declaredTarget ?? teachingWeeklyLoad;
      const targetWeeklyLoad = Math.max(declared, teachingWeeklyLoad);
      const reserve = Math.max(0, targetWeeklyLoad - teachingWeeklyLoad);
      if (teachingWeeklyLoad > declared) {
        issues.push(
          issue(
            "WARNING",
            null,
            "Úvazek",
            `${teacher.firstName} ${teacher.lastName}: v matici je ${teachingWeeklyLoad} h, ale uvedený úvazek je ${declared} h. Pro bezpečné načtení byl pracovní cíl dočasně zvýšen na ${teachingWeeklyLoad} h.`,
          ),
        );
      }
      if (targetWeeklyLoad > MAX_WEEKLY_TEACHER_LOAD) {
        const overtime = targetWeeklyLoad - MAX_WEEKLY_TEACHER_LOAD;
        issues.push(
          issue(
            "WARNING",
            null,
            "Nadúvazek",
            `${teacher.firstName} ${teacher.lastName}: ${MAX_WEEKLY_TEACHER_LOAD} h základní úvazek + ${overtime} h nadúvazek = ${targetWeeklyLoad} h celkem.`,
          ),
        );
      }
      if (reserve > 0) {
        issues.push(
          issue(
            "WARNING",
            null,
            "Rezerva",
            `${teacher.firstName} ${teacher.lastName}: ${teachingWeeklyLoad} h je přiřazeno a ${reserve} h zůstává jako rezerva k rozdělení.`,
          ),
        );
      }

      const subjectLoads: StaffingSubjectLoad[] = [
        ...[...teacher.subjectHours.entries()].map(
          ([subjectCode, weeklyPeriods], index) => ({
            id: `${teacher.id}-subject-${index + 1}`,
            subjectCode,
            weeklyPeriods,
          }),
        ),
        ...(reserve > 0
          ? [
              {
                id: `${teacher.id}-reserve`,
                subjectCode: "REZERVA",
                weeklyPeriods: reserve,
              },
            ]
          : []),
      ];
      return {
        id: teacher.id,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        targetWeeklyLoad,
        baseWeeklyLoad: Math.min(targetWeeklyLoad, MAX_WEEKLY_TEACHER_LOAD),
        subjectLoads,
        unavailableDays: [],
      };
    });

  const plan: StaffingPlan = {
    ...createEmptyStaffingPlan(),
    teachers: teacherRows,
  };
  const teachingWeeklyLoad = teacherRows.reduce(
    (total, teacher) =>
      total +
      teacher.subjectLoads
        .filter((item) => item.subjectCode !== "REZERVA")
        .reduce((sum, item) => sum + item.weeklyPeriods, 0),
    0,
  );
  const reserveWeeklyLoad = teacherRows.reduce(
    (total, teacher) =>
      total +
      teacher.subjectLoads
        .filter((item) => item.subjectCode === "REZERVA")
        .reduce((sum, item) => sum + item.weeklyPeriods, 0),
    0,
  );
  const allocationDraft: StaffingAllocationDraft = {
    version: 1,
    source: "LEGACY_SCHOOL_MATRIX",
    rows: draftRows,
  };
  const hasBlockingError = issues.some((item) => item.severity === "ERROR");
  const overloadedTeachers = teacherRows.filter(
    (teacher) => teacher.targetWeeklyLoad > MAX_WEEKLY_TEACHER_LOAD,
  );

  return {
    recognized: true,
    valid: !hasBlockingError,
    plan,
    issues,
    allocationDraft,
    summary: {
      teachers: teacherRows.length,
      targetWeeklyLoad: teacherRows.reduce(
        (total, teacher) => total + teacher.targetWeeklyLoad,
        0,
      ),
      assignedWeeklyLoad: teachingWeeklyLoad,
      unavailableWholeDays: 0,
      teachingWeeklyLoad,
      reserveWeeklyLoad,
      unassignedClassPeriods,
      overloadedTeachers: overloadedTeachers.length,
      overloadWeeklyLoad: overloadedTeachers.reduce(
        (total, teacher) =>
          total + teacher.targetWeeklyLoad - MAX_WEEKLY_TEACHER_LOAD,
        0,
      ),
      teachersWithCapacity: teacherRows.filter(
        (teacher) => teacher.targetWeeklyLoad < MAX_WEEKLY_TEACHER_LOAD,
      ).length,
    },
  };
}
