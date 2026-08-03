import type ExcelJS from "exceljs";

import {
  IMPORT_TEMPLATE_VERSION,
  type ImportAnalysis,
  type ImportAssignmentRow,
  type ImportClassRow,
  type ImportIssueDraft,
  type ImportPayload,
  type ImportSubjectRow,
  type ImportTeacherRow,
} from "./contracts";
import {
  cleanName,
  columnLetter,
  correctedTeacherKey,
  parseLegacySchoolWorkbook,
  teacherTokens,
  type Requirement,
  type TeacherSeed,
} from "./legacy-school-workbook-parser";

export const LEGACY_SCHOOL_TEMPLATE_VERSION = "legacy-school-matrix-1";

interface TeacherAggregate extends TeacherSeed {
  weeklyPeriods: number;
  subjects: Set<string>;
  classes: Set<string>;
}

interface AssignmentDraft {
  teacherKey: string;
  classCode: string;
  subjectCode: string;
  group: ImportAssignmentRow["group"];
  weeklyPeriods: number;
  lessonShape: ImportAssignmentRow["lesson_shape"];
  doublePeriodsCount: number;
}

function issue(
  severity: ImportIssueDraft["severity"],
  sheet: string,
  code: string,
  message: string,
  suggestion: string,
): ImportIssueDraft {
  return {
    severity,
    sheet,
    row: null,
    column: null,
    code,
    message,
    rawValue: null,
    suggestion,
  };
}

function teacherCodeBase(teacher: TeacherAggregate): string {
  const normalize = (value: string) =>
    correctedTeacherKey(value).toLocaleUpperCase("cs-CZ");
  const surname = normalize(teacher.lastName);
  const firstName = normalize(teacher.firstName);
  return (surname.slice(0, 3) || firstName.slice(0, 3) || "UCI").padEnd(3, "X");
}

function teacherCodes(teachers: TeacherAggregate[]): Map<string, string> {
  const used = new Set<string>();
  const result = new Map<string, string>();
  for (const teacher of teachers) {
    const base = teacherCodeBase(teacher);
    const initial = correctedTeacherKey(teacher.firstName)
      .slice(0, 1)
      .toUpperCase();
    let code = used.has(base) ? `${base}${initial || "X"}` : base;
    let suffix = 2;
    while (used.has(code)) code = `${base}${suffix++}`;
    used.add(code);
    result.set(teacher.key, code);
  }
  return result;
}

function lessonShape(requirement: Requirement): {
  shape: ImportAssignmentRow["lesson_shape"];
  doublePeriodsCount: number;
} {
  const double =
    requirement.subject.code === "TV" &&
    ["9.A", "9.C"].includes(requirement.classCode) &&
    requirement.weeklyPeriods % 2 === 0;
  return {
    shape: double ? "DOUBLE" : "SINGLE",
    doublePeriodsCount: double ? requirement.weeklyPeriods / 2 : 0,
  };
}

export function analyzeLegacySchoolWorkbook(
  workbook: ExcelJS.Workbook,
): ImportAnalysis | null {
  const parsed = parseLegacySchoolWorkbook(workbook);
  if (!parsed) return null;

  const { sheetName, classCodes, requirements, aliases } = parsed;
  const issues = [...parsed.issues];
  const requiredWeeklyPeriods = requirements.reduce(
    (total, item) => total + item.weeklyPeriods,
    0,
  );
  const coveredWeeklyPeriods = requirements.reduce(
    (total, item) =>
      total +
      (teacherTokens(item.rawTeacher).length > 0 ? item.weeklyPeriods : 0),
    0,
  );

  for (const requirement of requirements) {
    if (teacherTokens(requirement.rawTeacher).length > 0) continue;
    issues.push({
      severity: "ERROR",
      sheet: sheetName,
      row: requirement.row,
      column: columnLetter(requirement.teacherColumn),
      code: "TEACHING_COVERAGE_MISSING",
      message: `${requirement.classCode} · ${requirement.subject.name}: chybí učitel pro ${requirement.weeklyPeriods} h týdně.`,
      rawValue: null,
      suggestion:
        "Doplňte učitele do sloupce Učitel/učitelka. Bez něj nelze výuku bezpečně uložit.",
    });
  }

  issues.push(
    issue(
      "WARNING",
      sheetName,
      "LEGACY_WORKBOOK_RECOGNIZED",
      "Rozpoznán původní dvoulistový školní Excel. Data byla převedena do aktuálního importního modelu.",
      "Po importu zkontrolujte dělení skupin, společné třídy a dvojhodiny.",
    ),
    issue(
      "WARNING",
      sheetName,
      "LESSON_SHAPE_REVIEW_REQUIRED",
      "Tento soubor neobsahuje spolehlivou informaci o všech dvojhodinách. Import proto většinu výuky nastaví jako jednotlivé hodiny.",
      "Po uložení ověřte zejména TV, VV, PČ a laboratorní předměty.",
    ),
    issue(
      "WARNING",
      sheetName,
      "GROUP_ORGANIZATION_REVIEW_REQUIRED",
      "Lomítkem oddělení učitelé byli převedeni na dvě skupiny. Shodné řádky různých tříd nebyly automaticky sloučeny, protože zdroj neříká, zda probíhají společně.",
      "V editoru ověřte zejména TV 9.A/9.C a další dělené předměty.",
    ),
    issue(
      "WARNING",
      sheetName,
      "TARGET_LOAD_INFERRED",
      "Cílové úvazky byly odvozeny ze skutečných výukových vazeb v matici tříd. Souhrnné části původního souboru obsahují i jiné ročníky a historické duplicity.",
      "Po importu porovnejte výsledné úvazky s personálním plánem školy.",
    ),
  );

  const teachers = new Map<string, TeacherAggregate>();
  const assignments: AssignmentDraft[] = [];
  const resolveTeacher = (rawToken: string): TeacherAggregate => {
    const token = cleanName(rawToken);
    const key = correctedTeacherKey(token);
    const seed = aliases.get(key) ?? { key, firstName: "", lastName: token };
    const existing = teachers.get(seed.key);
    if (existing) return existing;
    const created: TeacherAggregate = {
      ...seed,
      weeklyPeriods: 0,
      subjects: new Set<string>(),
      classes: new Set<string>(),
    };
    teachers.set(seed.key, created);
    return created;
  };

  for (const requirement of requirements) {
    const tokens = teacherTokens(requirement.rawTeacher);
    if (tokens.length === 0) continue;
    if (tokens.length > 2) {
      issues.push({
        severity: "ERROR",
        sheet: sheetName,
        row: requirement.row,
        column: columnLetter(requirement.teacherColumn),
        code: "TOO_MANY_PARALLEL_TEACHERS",
        message: `${requirement.classCode} · ${requirement.subject.name}: importer umí v jednom řádku nejvýše dva souběžné učitele.`,
        rawValue: requirement.rawTeacher,
        suggestion:
          "Rozdělte výuku do samostatných řádků nebo ji nastavte ručně po importu.",
      });
    }
    tokens.slice(0, 2).forEach((token, index) => {
      const teacher = resolveTeacher(token);
      const group: ImportAssignmentRow["group"] =
        tokens.length > 1
          ? index === 0
            ? "GROUP_1"
            : "GROUP_2"
          : (requirement.subject.forcedGroup ?? "WHOLE");
      const shape = lessonShape(requirement);
      teacher.weeklyPeriods += requirement.weeklyPeriods;
      teacher.subjects.add(requirement.subject.code);
      teacher.classes.add(requirement.classCode);
      assignments.push({
        teacherKey: teacher.key,
        classCode: requirement.classCode,
        subjectCode: requirement.subject.code,
        group,
        weeklyPeriods: requirement.weeklyPeriods,
        lessonShape: shape.shape,
        doublePeriodsCount: shape.doublePeriodsCount,
      });
    });
  }

  const subjectMap = new Map<string, ImportSubjectRow>();
  for (const requirement of requirements) {
    subjectMap.set(requirement.subject.code, {
      subject_code: requirement.subject.code,
      subject_name: requirement.subject.name,
      default_room_type: null,
    });
  }

  const teacherList = [...teachers.values()].sort((left, right) =>
    `${left.lastName} ${left.firstName}`.localeCompare(
      `${right.lastName} ${right.firstName}`,
      "cs",
    ),
  );
  const codeByTeacher = teacherCodes(teacherList);
  const teacherRows: ImportTeacherRow[] = teacherList.map((teacher) => ({
    teacher_code: codeByTeacher.get(teacher.key)!,
    first_name: teacher.firstName,
    last_name: teacher.lastName,
    target_weekly_load: teacher.weeklyPeriods,
    min_weekly_load: null,
    max_weekly_load: null,
    subjects: [...teacher.subjects].sort(),
    classes: [...teacher.classes].sort((left, right) =>
      left.localeCompare(right, "cs", { numeric: true }),
    ),
  }));

  const assignmentRows: ImportAssignmentRow[] = assignments.map(
    (draft, index) => {
      const teacherCode = codeByTeacher.get(draft.teacherKey)!;
      const groupCode =
        draft.group === "WHOLE" ? "C" : draft.group === "GROUP_1" ? "S1" : "S2";
      return {
        assignment_code: `${draft.classCode.replace(".", "")}-${draft.subjectCode}-${groupCode}-${teacherCode}-${index + 1}`,
        class_code: draft.classCode,
        additional_class_codes: [],
        subject_code: draft.subjectCode,
        teacher_code: teacherCode,
        group: draft.group,
        weekly_periods: draft.weeklyPeriods,
        lesson_shape: draft.lessonShape,
        double_periods_count: draft.doublePeriodsCount,
        required_room: null,
        required_room_type: null,
        max_per_day: null,
        min_day_gap: null,
      };
    },
  );

  const classes: ImportClassRow[] = classCodes.map((classCode) => ({
    class_code: classCode,
    grade: Number(classCode.split(".")[0]),
    class_name: classCode,
  }));
  const subjects = [...subjectMap.values()].sort((left, right) =>
    left.subject_code.localeCompare(right.subject_code, "cs"),
  );
  const payload: ImportPayload = {
    templateVersion: IMPORT_TEMPLATE_VERSION,
    settings: {
      school_year: "2026/2027",
      monday_periods: 8,
      tuesday_periods: 8,
      wednesday_periods: 8,
      thursday_periods: 8,
      friday_periods: 7,
    },
    teachers: teacherRows,
    classes,
    subjects,
    rooms: [],
    assignments: assignmentRows,
    availability: [],
    fixedLessons: [],
  };

  const errors = issues.filter((item) => item.severity === "ERROR").length;
  const warnings = issues.filter((item) => item.severity === "WARNING").length;
  const uncoveredWeeklyPeriods = Math.max(
    0,
    requiredWeeklyPeriods - coveredWeeklyPeriods,
  );
  return {
    templateVersion: LEGACY_SCHOOL_TEMPLATE_VERSION,
    status: errors > 0 ? "VALIDATION_FAILED" : "READY",
    payload: errors > 0 ? null : payload,
    issues,
    summary: {
      teachers: teacherRows.length,
      classes: classes.length,
      subjects: subjects.length,
      rooms: 0,
      assignments: assignmentRows.length,
      availabilityRules: 0,
      fixedLessons: 0,
      requiredWeeklyPeriods,
      coveredWeeklyPeriods,
      uncoveredWeeklyPeriods,
      coveragePercent:
        requiredWeeklyPeriods > 0
          ? Math.round((coveredWeeklyPeriods / requiredWeeklyPeriods) * 1000) /
            10
          : 0,
      errors,
      warnings,
    },
  };
}
