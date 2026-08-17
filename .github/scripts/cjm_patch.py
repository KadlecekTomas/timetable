from __future__ import annotations

from pathlib import Path
import re


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Missing expected block in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new))


def sub(path: str, pattern: str, replacement: str, *, flags: int = re.S) -> None:
    p = Path(path)
    text = p.read_text()
    if replacement in text:
        return
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"Regex did not match exactly once in {path}: {pattern[:160]!r}")
    p.write_text(updated)


# 1) Compact staffing matrix + X+1 notation.
path = "apps/web/lib/import/legacy-school-workbook-parser.ts"
replace(
    path,
    'const LEGACY_INDIVIDUALS_SHEET = "jednotlivci";\nconst CLASS_COLUMNS = [3, 7, 11, 15, 19] as const;\n',
    'const LEGACY_INDIVIDUALS_SHEET = "jednotlivci";\n',
)
replace(
    path,
    "  weeklyPeriods: number;\n  row: number;\n",
    "  weeklyPeriods: number;\n  teacherExtraPeriods: number;\n  row: number;\n",
)
sub(
    path,
    r"function integerValue\(value: string\): number \| null \{.*?\n\}\n\nfunction subjectDescriptor",
    '''function teachingHoursValue(
  value: string,
): { weeklyPeriods: number; teacherExtraPeriods: number } | null {
  const normalized = value.trim().replace(/\\s+/g, "");
  const match = normalized.match(/^(\\d+)(?:\\+(\\d+))?$/);
  if (!match) return null;
  const weeklyPeriods = Number(match[1]);
  const teacherExtraPeriods = Number(match[2] ?? 0);
  if (
    !Number.isInteger(weeklyPeriods) ||
    weeklyPeriods <= 0 ||
    !Number.isInteger(teacherExtraPeriods) ||
    teacherExtraPeriods < 0
  ) {
    return null;
  }
  return { weeklyPeriods, teacherExtraPeriods };
}

function subjectDescriptor''',
)
sub(
    path,
    r"function findClassBlocks\(worksheet: Worksheet\): ClassBlock\[] \{.*?\n\}\n\nfunction findSubjectHeaderRow",
    '''function findClassBlocks(worksheet: Worksheet): ClassBlock[] {
  const blocks: ClassBlock[] = [];
  for (let row = 1; row <= worksheet.rowCount; row += 1) {
    const slots: ClassSlot[] = [];
    for (
      let column = 1;
      column <= Math.max(1, worksheet.columnCount - 2);
      column += 1
    ) {
      const code = normalizeClassCode(cellText(worksheet.getCell(row, column)));
      if (!code) continue;
      const headerRow = findSubjectHeaderRow(
        worksheet,
        row,
        Math.min(worksheet.rowCount, row + 6),
        column,
      );
      if (!headerRow) continue;
      slots.push({
        code,
        column,
        homeroomTeacher: cellText(worksheet.getCell(row, column + 1)),
      });
    }
    if (slots.length > 0) blocks.push({ row, slots });
  }
  return blocks;
}

function findSubjectHeaderRow''',
)
replace(
    path,
    '''        const weeklyPeriods = integerValue(rawHours);
        if (!rawSubject || weeklyPeriods == null || weeklyPeriods <= 0) {''',
    '''        const parsedHours = teachingHoursValue(rawHours);
        if (!rawSubject || !parsedHours) {''',
)
replace(
    path,
    '''        requirements.push({
          classCode: slot.code,
          subject: subjectDescriptor(rawSubject),
          rawTeacher,
          weeklyPeriods,
          row,
          teacherColumn: slot.column + 1,
        });''',
    '''        requirements.push({
          classCode: slot.code,
          subject: subjectDescriptor(rawSubject),
          rawTeacher,
          weeklyPeriods: parsedHours.weeklyPeriods,
          teacherExtraPeriods: parsedHours.teacherExtraPeriods,
          row,
          teacherColumn: slot.column + 1,
        });''',
)
sub(
    path,
    r'''  const staffingSheet = workbook\.worksheets\.find\(\(worksheet\) =>\n    worksheet\.name\.toLocaleLowerCase\("cs-CZ"\)\.startsWith\("úvazky"\),\n  \);\n  const individualsSheet = workbook\.worksheets\.find\(.*?\n  if \(!staffingSheet \|\| !individualsSheet\) return null;\n\n  const issues: ImportIssueDraft\[] = \[];\n  const blocks = findClassBlocks\(staffingSheet\);\n  if \(blocks\.length === 0\) return null;''',
    '''  const preferredSheet = workbook.worksheets.find((worksheet) =>
    worksheet.name.toLocaleLowerCase("cs-CZ").startsWith("úvazky"),
  );
  const candidates = [
    ...(preferredSheet ? [preferredSheet] : []),
    ...workbook.worksheets.filter((worksheet) => worksheet !== preferredSheet),
  ];
  const matched = candidates
    .map((worksheet) => ({ worksheet, blocks: findClassBlocks(worksheet) }))
    .find((item) => item.blocks.length > 0);
  if (!matched) return null;
  const staffingSheet = matched.worksheet;
  const blocks = matched.blocks;
  void LEGACY_INDIVIDUALS_SHEET;

  const issues: ImportIssueDraft[] = [];''',
)

# 2) Teacher workload uses X+extra while allocation draft keeps class periods X.
path = "apps/web/lib/import/legacy-staffing-plan.ts"
replace(
    path,
    '''    for (const teacher of resolved) {
      addSubjectHours(
        teacher,
        requirement.subject.code,
        requirement.weeklyPeriods,
      );
    }''',
    '''    const teacherWeeklyPeriods =
      requirement.weeklyPeriods + requirement.teacherExtraPeriods;
    for (const teacher of resolved) {
      addSubjectHours(
        teacher,
        requirement.subject.code,
        teacherWeeklyPeriods,
      );
    }''',
)

# 3) CJ/M partial split is one teacher per subject, including both split halves.
path = "apps/web/lib/local/teaching-plan-school-v3.ts"
marker = "function readStoredSplitPeriods(): Record<string, number> {"
helper = '''export function isSameTeacherPartialSplit(row: TeachingPlanRow): boolean {
  if (
    row.organization !== "SPLIT" ||
    !SCHOOL_SINGLE_SPLIT_PERIOD_SUBJECT_CODES.has(row.subjectCode) ||
    !Number.isInteger(row.splitWeeklyPeriods)
  ) {
    return false;
  }
  const splitPeriods = Math.max(
    0,
    Math.min(row.weeklyPeriods, Number(row.splitWeeklyPeriods)),
  );
  return splitPeriods > 0 && splitPeriods < row.weeklyPeriods;
}

function splitPeriodsForRow(row: TeachingPlanRow): number {
  return Number.isInteger(row.splitWeeklyPeriods)
    ? Math.max(0, Math.min(row.weeklyPeriods, Number(row.splitWeeklyPeriods)))
    : row.weeklyPeriods;
}

function readStoredSplitPeriods(): Record<string, number> {'''
replace(path, marker, helper)
replace(
    path,
    '''      return {
        ...row,
        organization: "SPLIT" as const,
        splitWeeklyPeriods: SCHOOL_SINGLE_SPLIT_PERIOD_SUBJECT_CODES.has(
          row.subjectCode,
        )
          ? 1
          : row.weeklyPeriods,
        additionalClassCodes:
          row.subjectCode === "TV" ? [] : row.additionalClassCodes,
        sharedGroupLabel: row.subjectCode === "TV" ? "" : row.sharedGroupLabel,
      };''',
    '''      const singleSplit = SCHOOL_SINGLE_SPLIT_PERIOD_SUBJECT_CODES.has(
        row.subjectCode,
      );
      return {
        ...row,
        organization: "SPLIT" as const,
        splitWeeklyPeriods: singleSplit ? 1 : row.weeklyPeriods,
        secondaryTeacherId: singleSplit
          ? row.primaryTeacherId
          : row.secondaryTeacherId,
        additionalClassCodes:
          row.subjectCode === "TV" ? [] : row.additionalClassCodes,
        sharedGroupLabel: row.subjectCode === "TV" ? "" : row.sharedGroupLabel,
      };''',
)
replace(
    path,
    '''export function rowTeacherPeriods(
  row: TeachingPlanRow,
  teacherId: string,
): number {
  const periods = base.rowTeacherPeriods(row, teacherId);
  if (
    row.organization === "SPLIT" &&
    Number.isInteger(row.splitWeeklyPeriods) &&
    row.secondaryTeacherId === teacherId &&
    row.primaryTeacherId !== teacherId
  ) {
    const splitPeriods = Math.max(
      1,
      Math.min(row.weeklyPeriods, Number(row.splitWeeklyPeriods)),
    );
    return periods - row.weeklyPeriods + splitPeriods;
  }
  return periods;
}''',
    '''export function rowTeacherPeriods(
  row: TeachingPlanRow,
  teacherId: string,
): number {
  const periods = base.rowTeacherPeriods(row, teacherId);
  if (
    isSameTeacherPartialSplit(row) &&
    row.primaryTeacherId === teacherId &&
    row.secondaryTeacherId === teacherId
  ) {
    return periods + splitPeriodsForRow(row);
  }
  if (
    row.organization === "SPLIT" &&
    Number.isInteger(row.splitWeeklyPeriods) &&
    row.secondaryTeacherId === teacherId &&
    row.primaryTeacherId !== teacherId
  ) {
    const splitPeriods = Math.max(
      1,
      Math.min(row.weeklyPeriods, Number(row.splitWeeklyPeriods)),
    );
    return periods - row.weeklyPeriods + splitPeriods;
  }
  return periods;
}''',
)
replace(
    path,
    '''export function validateTeachingPlan(
  plan: TeachingPlan,
  staffingPlan: StaffingPlan,
): string[] {
  return base.validateTeachingPlan(
    enforceCurrentSchoolTeachingStructure(plan),
    staffingPlan,
  );
}''',
    '''export function validateTeachingPlan(
  plan: TeachingPlan,
  staffingPlan: StaffingPlan,
): string[] {
  const enforced = enforceCurrentSchoolTeachingStructure(plan);
  const sameTeacherPrefixes = enforced.rows
    .filter(isSameTeacherPartialSplit)
    .map((row) => `${row.classCode} ${row.subjectCode}:`);
  return base.validateTeachingPlan(enforced, staffingPlan).filter((message) => {
    const sameTeacherRow = sameTeacherPrefixes.some((prefix) =>
      message.startsWith(prefix),
    );
    if (!sameTeacherRow) return true;
    return !(
      message.includes("Vyberte učitele druhé skupiny.") ||
      message.includes("Každá skupina musí mít jiného učitele.")
    );
  });
}''',
)

# 4) Coverage has one teacher role for partial CJ/M and reports X+1 teacher hours.
path = "apps/web/lib/domain/coverage-overview.ts"
replace(
    path,
    'import type { TeachingPlan, TeachingPlanRow } from "@/lib/local/teaching-plan";\n',
    'import {\n  isSameTeacherPartialSplit,\n  type TeachingPlan,\n  type TeachingPlanRow,\n} from "@/lib/local/teaching-plan";\n',
)
replace(
    path,
    '''    const splitPeriods = Math.max(0, Math.min(periods, configured));
    const wholePeriods = Math.max(0, periods - splitPeriods);
    return [''',
    '''    const splitPeriods = Math.max(0, Math.min(periods, configured));
    const wholePeriods = Math.max(0, periods - splitPeriods);
    if (isSameTeacherPartialSplit(row)) {
      return [
        {
          subjectCode: row.subjectCode,
          roleLabel: "učitel celé třídy + obou dělených skupin",
          teacherId: row.primaryTeacherId,
          teacherHours: periods + splitPeriods,
          classPeriods: periods,
        },
      ];
    }
    return [''',
)

# 5) Auto-cover treats partial CJ/M as one teacher slot with X+1 hours.
path = "apps/web/lib/domain/auto-cover-teaching-plan.ts"
replace(
    path,
    'import type { TeachingPlan, TeachingPlanRow } from "@/lib/local/teaching-plan";\n',
    'import {\n  isSameTeacherPartialSplit,\n  type TeachingPlan,\n  type TeachingPlanRow,\n} from "@/lib/local/teaching-plan";\n',
)
replace(
    path,
    '''function slotHours(row: TeachingPlanRow): number {
  const periods = positiveHours(row.weeklyPeriods);
  return row.organization === "ROTATION" ? periods * 2 : periods;
}''',
    '''function splitPeriods(row: TeachingPlanRow): number {
  return Number.isInteger(row.splitWeeklyPeriods)
    ? Math.max(0, Math.min(row.weeklyPeriods, Number(row.splitWeeklyPeriods)))
    : row.weeklyPeriods;
}

function slotHours(row: TeachingPlanRow, field: TeacherField): number {
  const periods = positiveHours(row.weeklyPeriods);
  if (isSameTeacherPartialSplit(row)) {
    return field === "primaryTeacherId" ? periods + splitPeriods(row) : 0;
  }
  return row.organization === "ROTATION" ? periods * 2 : periods;
}''',
)
replace(
    path,
    '''  rows.forEach((row, rowIndex) => {
    const hours = slotHours(row);
    const primaryValid =''',
    '''  rows.forEach((row, rowIndex) => {
    const primaryHours = slotHours(row, "primaryTeacherId");
    const sameTeacherPartial = isSameTeacherPartialSplit(row);
    const primaryValid =''',
)
replace(
    path,
    '''    if (row.organization === "WHOLE") {
      row.secondaryTeacherId = "";
    } else {
      const secondaryValid =
        Boolean(row.secondaryTeacherId) &&
        validTeacherIds.has(row.secondaryTeacherId) &&
        row.secondaryTeacherId !== row.primaryTeacherId;
      row.secondaryTeacherId = secondaryValid ? row.secondaryTeacherId : "";
    }

    if (row.primaryTeacherId) {
      addScheduled(row.primaryTeacherId, row.subjectCode, hours);
    } else if (row.subjectCode && hours > 0) {''',
    '''    if (row.organization === "WHOLE") {
      row.secondaryTeacherId = "";
    } else if (sameTeacherPartial) {
      row.secondaryTeacherId = row.primaryTeacherId;
    } else {
      const secondaryValid =
        Boolean(row.secondaryTeacherId) &&
        validTeacherIds.has(row.secondaryTeacherId) &&
        row.secondaryTeacherId !== row.primaryTeacherId;
      row.secondaryTeacherId = secondaryValid ? row.secondaryTeacherId : "";
    }

    if (row.primaryTeacherId) {
      addScheduled(row.primaryTeacherId, row.subjectCode, primaryHours);
    } else if (row.subjectCode && primaryHours > 0) {''',
)
replace(path, "        teacherHours: hours,\n      });\n    }\n\n    if (row.organization !== \"WHOLE\") {", "        teacherHours: primaryHours,\n      });\n    }\n\n    if (row.organization !== \"WHOLE\" && !sameTeacherPartial) {")
replace(
    path,
    '''      const secondarySubject = slotSubject(row, "secondaryTeacherId");
      if (row.secondaryTeacherId) {
        addScheduled(row.secondaryTeacherId, secondarySubject, hours);
      } else if (secondarySubject && hours > 0) {''',
    '''      const secondarySubject = slotSubject(row, "secondaryTeacherId");
      const secondaryHours = slotHours(row, "secondaryTeacherId");
      if (row.secondaryTeacherId) {
        addScheduled(row.secondaryTeacherId, secondarySubject, secondaryHours);
      } else if (secondarySubject && secondaryHours > 0) {''',
)
replace(path, "          teacherHours: hours,\n        });", "          teacherHours: secondaryHours,\n        });")
replace(
    path,
    '''    row[slot.field] = selected.teacher.id;
    addScheduled(selected.teacher.id, slot.subjectCode, slot.teacherHours);''',
    '''    row[slot.field] = selected.teacher.id;
    if (slot.field === "primaryTeacherId" && isSameTeacherPartialSplit(row)) {
      row.secondaryTeacherId = selected.teacher.id;
    }
    addScheduled(selected.teacher.id, slot.subjectCode, slot.teacherHours);''',
)

# 6) Generator turns the one partial CJ/M hour into a two-leg CJ <-> M swap.
path = "apps/web/lib/local/school-project-generation.ts"
replace(
    path,
    '''} from "./teaching-plan";
import { schoolInputFingerprint } from "./school-input-state";''',
    '''} from "./teaching-plan";
import { isSameTeacherPartialSplit } from "./teaching-plan-school-v3";
import { schoolInputFingerprint } from "./school-input-state";''',
)
replace(
    path,
    '''function generatedTeacherPeriods(
  row: TeachingPlanRow,
  teacherId: string,
): number {
  if (row.organization !== "SPLIT" || row.splitWeeklyPeriods === undefined) {
    return rowTeacherPeriods(row, teacherId);
  }
  if (row.primaryTeacherId === teacherId) return row.weeklyPeriods;''',
    '''function generatedTeacherPeriods(
  row: TeachingPlanRow,
  teacherId: string,
): number {
  if (isSameTeacherPartialSplit(row)) {
    return row.primaryTeacherId === teacherId
      ? row.weeklyPeriods + splitWeeklyPeriodsForRow(row)
      : 0;
  }
  if (row.organization !== "SPLIT" || row.splitWeeklyPeriods === undefined) {
    return rowTeacherPeriods(row, teacherId);
  }
  if (row.primaryTeacherId === teacherId) return row.weeklyPeriods;''',
)
replace(
    path,
    '''  for (const row of teachingPlan.rows) {
    if (UNSCHEDULED_SUBJECT_CODES.has(row.subjectCode)) continue;
    const rowKey = `${token(row.classCode)}-${token(row.id)}`;
    if (row.organization === "WHOLE") {''',
    '''  const partialCzechMathByClass = new Map<
    string,
    { czech?: TeachingPlanRow; math?: TeachingPlanRow }
  >();
  for (const row of teachingPlan.rows) {
    if (!isSameTeacherPartialSplit(row) || !["CJ", "M"].includes(row.subjectCode)) {
      continue;
    }
    const pair = partialCzechMathByClass.get(row.classCode) ?? {};
    if (row.subjectCode === "CJ") pair.czech = row;
    if (row.subjectCode === "M") pair.math = row;
    partialCzechMathByClass.set(row.classCode, pair);
  }
  const handledPartialRows = new Set<string>();

  for (const row of teachingPlan.rows) {
    if (UNSCHEDULED_SUBJECT_CODES.has(row.subjectCode)) continue;
    if (isSameTeacherPartialSplit(row) && ["CJ", "M"].includes(row.subjectCode)) {
      if (handledPartialRows.has(row.id)) continue;
      const pair = partialCzechMathByClass.get(row.classCode);
      const czech = pair?.czech;
      const math = pair?.math;
      if (!czech || !math) {
        blockers.push(
          `${row.classCode}: dělená ČJ/M vyžaduje současně řádek češtiny i matematiky.`,
        );
        handledPartialRows.add(row.id);
        continue;
      }
      handledPartialRows.add(czech.id);
      handledPartialRows.add(math.id);
      const czechSplit = splitWeeklyPeriodsForRow(czech);
      const mathSplit = splitWeeklyPeriodsForRow(math);
      if (czechSplit !== mathSplit) {
        blockers.push(`${row.classCode}: ČJ a M musí mít stejný počet dělených hodin.`);
        continue;
      }
      for (const source of [czech, math]) {
        const wholePeriods = source.weeklyPeriods - splitWeeklyPeriodsForRow(source);
        if (wholePeriods > 0) {
          push(
            source,
            "WHOLE",
            source.subjectCode,
            source.primaryTeacherId,
            "WHOLE",
            null,
            null,
            null,
            wholePeriods,
          );
        }
      }
      const rotationKey = `${token(row.classCode)}-CJ-M-PARTIAL`;
      const leg1 = `${rotationKey}-L1`;
      const leg2 = `${rotationKey}-L2`;
      push(czech, "CJ-M-L1-G1", "CJ", czech.primaryTeacherId, "GROUP_1", leg1, rotationKey, 1, czechSplit);
      push(math, "CJ-M-L1-G2", "M", math.primaryTeacherId, "GROUP_2", leg1, rotationKey, 1, mathSplit);
      push(math, "CJ-M-L2-G1", "M", math.primaryTeacherId, "GROUP_1", leg2, rotationKey, 2, mathSplit);
      push(czech, "CJ-M-L2-G2", "CJ", czech.primaryTeacherId, "GROUP_2", leg2, rotationKey, 2, czechSplit);
      continue;
    }
    const rowKey = `${token(row.classCode)}-${token(row.id)}`;
    if (row.organization === "WHOLE") {''',
)

# 7) Regression for same-teacher CJ/M.
Path("apps/web/tests/partial-split-generation.test.ts").write_text('''import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCoverageOverview,
  coverageCellKey,
} from "../lib/domain/coverage-overview";
import type { LocalProject } from "../lib/local/api";
import { buildSchoolProjectForGeneration } from "../lib/local/school-project-generation";
import type { StaffingPlan, StaffingTeacher } from "../lib/local/staffing-plan";
import {
  applySchoolOperationalRules,
  createEmptyTeachingPlan,
  createTeachingPlanRow,
  rowTeacherPeriods,
} from "../lib/local/teaching-plan-school-v3";

function project(): LocalProject {
  return {
    schemaVersion: 1,
    id: "local-school-year",
    schoolName: "Testovací škola",
    label: "2026/2027",
    status: "ACTIVE",
    periodsPerDay: [8, 8, 8, 8, 7],
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    teachers: [],
    classes: [],
    subjects: [],
    roomTypes: [],
    rooms: [],
    assignments: [],
    availability: [],
    fixedLessons: [],
    importBatches: [],
    generationRuns: [],
    timetableVersions: [],
  };
}

function teacher(id: string, subjectCode: string, weeklyPeriods: number): StaffingTeacher {
  return {
    id,
    firstName: `Učitel ${id}`,
    lastName: "Testovací",
    targetWeeklyLoad: weeklyPeriods,
    subjectLoads: [{ id: `${id}-${subjectCode}`, subjectCode, weeklyPeriods }],
    unavailableDays: [],
  };
}

test("CJ/M partial split keeps one teacher per subject and generates a two-leg swap", () => {
  const staffingPlan: StaffingPlan = {
    version: 1,
    updatedAt: "test",
    teachers: [teacher("cj-main", "CJ", 6), teacher("m-main", "M", 5)],
  };
  const teachingPlan = createEmptyTeachingPlan();
  teachingPlan.rows = [
    {
      ...createTeachingPlanRow("6.A", "CJ"),
      id: "6a-cj",
      weeklyPeriods: 5,
      organization: "WHOLE",
      primaryTeacherId: "cj-main",
    },
    {
      ...createTeachingPlanRow("6.A", "M"),
      id: "6a-m",
      weeklyPeriods: 4,
      organization: "WHOLE",
      primaryTeacherId: "m-main",
    },
  ];

  const enforced = applySchoolOperationalRules(teachingPlan, staffingPlan, null);
  const czech = enforced.rows.find((row) => row.subjectCode === "CJ");
  const math = enforced.rows.find((row) => row.subjectCode === "M");
  assert.ok(czech);
  assert.ok(math);
  assert.equal(czech.organization, "SPLIT");
  assert.equal(czech.splitWeeklyPeriods, 1);
  assert.equal(czech.secondaryTeacherId, "cj-main");
  assert.equal(math.secondaryTeacherId, "m-main");
  assert.equal(rowTeacherPeriods(czech, "cj-main"), 6);
  assert.equal(rowTeacherPeriods(math, "m-main"), 5);

  const overview = buildCoverageOverview(enforced, staffingPlan);
  const czechCell = overview.cellByKey.get(coverageCellKey("6.A", "CJ"));
  const mathCell = overview.cellByKey.get(coverageCellKey("6.A", "M"));
  assert.equal(czechCell?.requiredClassPeriods, 5);
  assert.equal(czechCell?.requiredTeacherHours, 6);
  assert.equal(czechCell?.requiredSlots, 1);
  assert.equal(czechCell?.assignedTeacherHours, 6);
  assert.equal(czechCell?.rows[0]?.teacherId, "cj-main");
  assert.equal(mathCell?.requiredClassPeriods, 4);
  assert.equal(mathCell?.requiredTeacherHours, 5);
  assert.equal(mathCell?.requiredSlots, 1);

  const result = buildSchoolProjectForGeneration({
    existingProject: project(),
    staffingPlan,
    teachingPlan: enforced,
    forceReplaceGeneratedData: false,
  });
  assert.deepEqual(result.blockers, []);
  assert.equal(result.project.assignments.length, 6);
  const whole = result.project.assignments.filter((assignment) => assignment.group === "WHOLE");
  assert.deepEqual(
    whole.map((assignment) => [assignment.subjectId, assignment.weeklyPeriods]).sort(),
    [["subject:CJ", 4], ["subject:M", 3]],
  );
  const rotation = result.project.assignments.filter((assignment) => assignment.rotationKey);
  assert.equal(rotation.length, 4);
  assert.equal(new Set(rotation.map((assignment) => assignment.rotationKey)).size, 1);
  assert.deepEqual(
    rotation
      .map((assignment) => [assignment.rotationLeg, assignment.group, assignment.subjectId, assignment.teacherId])
      .sort(),
    [
      [1, "GROUP_1", "subject:CJ", "teacher:cj-main"],
      [1, "GROUP_2", "subject:M", "teacher:m-main"],
      [2, "GROUP_1", "subject:M", "teacher:m-main"],
      [2, "GROUP_2", "subject:CJ", "teacher:cj-main"],
    ],
  );
});

test("missing CJ teacher is one missing 6-hour role, not a fake second teacher", () => {
  const staffingPlan: StaffingPlan = {
    version: 1,
    updatedAt: "test",
    teachers: [teacher("m-main", "M", 5)],
  };
  const teachingPlan = createEmptyTeachingPlan();
  teachingPlan.rows = [
    { ...createTeachingPlanRow("6.A", "CJ"), weeklyPeriods: 5, primaryTeacherId: "" },
    { ...createTeachingPlanRow("6.A", "M"), weeklyPeriods: 4, primaryTeacherId: "m-main" },
  ];
  const enforced = applySchoolOperationalRules(teachingPlan, staffingPlan, null);
  const overview = buildCoverageOverview(enforced, staffingPlan);
  const cell = overview.cellByKey.get(coverageCellKey("6.A", "CJ"));
  assert.equal(cell?.requiredClassPeriods, 5);
  assert.equal(cell?.requiredTeacherHours, 6);
  assert.equal(cell?.requiredSlots, 1);
  assert.equal(cell?.assignedTeacherHours, 0);
  assert.equal(cell?.missingTeacherHours, 6);
  assert.deepEqual(cell?.missingRoles, ["učitel celé třídy + obou dělených skupin"]);
});
''')

# 8) Fixture mirrors compact B/F blocks, slash teachers, X+1, and name typo normalization.
Path("apps/web/tests/compact-staffing-matrix.test.ts").write_text('''import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import { analyzeStaffingWorkbook } from "../lib/import/staffing-workbook-school-v2";

async function compactWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("List 1");
  sheet.getCell("B4").value = "6.A";
  sheet.getCell("F4").value = "6.B";
  for (const column of ["B", "F"]) {
    sheet.getCell(`${column}5`).value = "Předměty";
    sheet.getCell(`${String.fromCharCode(column.charCodeAt(0) + 1)}5`).value = "Učitel/učitelka";
    sheet.getCell(`${String.fromCharCode(column.charCodeAt(0) + 2)}5`).value = "Časová dotace";
  }
  sheet.getCell("B6").value = "Čj";
  sheet.getCell("C6").value = "Novotná";
  sheet.getCell("D6").value = "5+1";
  sheet.getCell("B7").value = "M";
  sheet.getCell("C7").value = "Pilat";
  sheet.getCell("D7").value = "4+1";
  sheet.getCell("B8").value = "Aj";
  sheet.getCell("C8").value = "Syrůčková/Rus";
  sheet.getCell("D8").value = 4;
  sheet.getCell("B9").value = "Tv";
  sheet.getCell("C9").value = "Mašek/Šárová";
  sheet.getCell("D9").value = 2;

  sheet.getCell("F6").value = "Čj";
  sheet.getCell("G6").value = "Kvapilová";
  sheet.getCell("H6").value = "4+1";
  sheet.getCell("F7").value = "M";
  sheet.getCell("G7").value = "Dostálová";
  sheet.getCell("H7").value = "4+1";
  sheet.getCell("F8").value = "Španělský jazyk";
  sheet.getCell("G8").value = "Śpánková";
  sheet.getCell("H8").value = 3;

  sheet.getCell("B12").value = "7.A";
  sheet.getCell("B13").value = "Předměty";
  sheet.getCell("C13").value = "Učitel/učitelka";
  sheet.getCell("D13").value = "Časová dotace";
  sheet.getCell("B14").value = "Španělský jazyk";
  sheet.getCell("C14").value = "Špánková";
  sheet.getCell("D14").value = 3;
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function hours(
  analysis: Awaited<ReturnType<typeof analyzeStaffingWorkbook>>,
  lastName: string,
  subjectCode: string,
): number {
  const teacher = analysis.plan.teachers.find((item) => item.lastName === lastName);
  assert.ok(teacher, lastName);
  return teacher.subjectLoads
    .filter((item) => item.subjectCode === subjectCode)
    .reduce((total, item) => total + item.weeklyPeriods, 0);
}

test("compact school matrix imports X+1 as teacher hours and normalizes names", async () => {
  const analysis = await analyzeStaffingWorkbook(await compactWorkbook());
  assert.equal(analysis.valid, true);
  assert.equal(hours(analysis, "Novotná", "CJ"), 6);
  assert.equal(hours(analysis, "Pilat", "M"), 5);
  assert.equal(hours(analysis, "Kvapilová", "CJ"), 5);
  assert.equal(hours(analysis, "Dostálová", "M"), 5);
  assert.equal(hours(analysis, "Syrůčková", "JAZ1"), 4);
  assert.equal(hours(analysis, "Rus", "JAZ1"), 4);
  assert.equal(hours(analysis, "Mašek", "TV"), 2);
  assert.equal(hours(analysis, "Šárová", "TV"), 2);
  const spankova = analysis.plan.teachers.filter((teacher) =>
    teacher.lastName
      .normalize("NFKD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .toLowerCase()
      .includes("spankova"),
  );
  assert.equal(spankova.length, 1);
  assert.equal(
    spankova[0]?.subjectLoads.find((item) => item.subjectCode === "JAZ2")?.weeklyPeriods,
    6,
  );
  assert.ok("allocationDraft" in analysis);
  if (!("allocationDraft" in analysis)) return;
  const czech = analysis.allocationDraft?.rows.find(
    (row) => row.classCode === "6.A" && row.subjectCode === "CJ",
  );
  assert.equal(czech?.weeklyPeriods, 5);
  assert.equal(czech?.teacherIds.length, 1);
});
''')
