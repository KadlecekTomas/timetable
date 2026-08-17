from pathlib import Path
import re


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Missing expected block in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1))


def sub(path: str, pattern: str, replacement: str) -> None:
    p = Path(path)
    text = p.read_text()
    if replacement in text:
        return
    updated, count = re.subn(pattern, lambda _m: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"Pattern did not match exactly once in {path}: {pattern[:180]!r}")
    p.write_text(updated)


# Keep teacher-extra periods in the allocation draft so the source semantics remain explicit.
path = "apps/web/lib/local/staffing-allocation-draft.ts"
replace(
    path,
    "  weeklyPeriods: number;\n  group: StaffingAllocationGroup;\n",
    "  weeklyPeriods: number;\n  teacherExtraPeriods?: number;\n  group: StaffingAllocationGroup;\n",
)
replace(
    path,
    '''      !Number.isInteger(item.weeklyPeriods) ||
      Number(item.weeklyPeriods) <= 0 ||
      !["WHOLE", "GROUP_1", "GROUP_2"].includes(String(item.group)) ||''',
    '''      !Number.isInteger(item.weeklyPeriods) ||
      Number(item.weeklyPeriods) <= 0 ||
      (item.teacherExtraPeriods !== undefined &&
        (!Number.isInteger(item.teacherExtraPeriods) ||
          Number(item.teacherExtraPeriods) < 0)) ||
      !["WHOLE", "GROUP_1", "GROUP_2"].includes(String(item.group)) ||''',
)
replace(
    path,
    '''        weeklyPeriods: Number(item.weeklyPeriods),
        group: item.group as StaffingAllocationGroup,''',
    '''        weeklyPeriods: Number(item.weeklyPeriods),
        teacherExtraPeriods: Number.isInteger(item.teacherExtraPeriods)
          ? Number(item.teacherExtraPeriods)
          : 0,
        group: item.group as StaffingAllocationGroup,''',
)

# Legacy staffing: second foreign language is shared by grade, so count each teacher once per grade.
path = "apps/web/lib/import/legacy-staffing-plan.ts"
replace(
    path,
    '''  const draftRows: StaffingAllocationDraftRow[] = [];
  let unassignedClassPeriods = 0;
''',
    '''  const draftRows: StaffingAllocationDraftRow[] = [];
  const sharedSecondLanguageHours = new Map<
    string,
    { teacher: TeacherAggregate; weeklyPeriods: number }
  >();
  let unassignedClassPeriods = 0;
''',
)
replace(
    path,
    '''    const teacherWeeklyPeriods =
      requirement.weeklyPeriods + requirement.teacherExtraPeriods;
    for (const teacher of resolved) {
      addSubjectHours(
        teacher,
        requirement.subject.code,
        teacherWeeklyPeriods,
      );
    }
''',
    '''    const teacherWeeklyPeriods =
      requirement.weeklyPeriods + requirement.teacherExtraPeriods;
    for (const teacher of resolved) {
      if (requirement.subject.code === "JAZ2") {
        const grade = Number(requirement.classCode.split(".")[0] ?? 0);
        const key = `${grade}|${teacher.key}`;
        const current = sharedSecondLanguageHours.get(key);
        if (!current || teacherWeeklyPeriods > current.weeklyPeriods) {
          sharedSecondLanguageHours.set(key, {
            teacher,
            weeklyPeriods: teacherWeeklyPeriods,
          });
        }
      } else {
        addSubjectHours(
          teacher,
          requirement.subject.code,
          teacherWeeklyPeriods,
        );
      }
    }
''',
)
replace(
    path,
    '''      weeklyPeriods: requirement.weeklyPeriods,
      group: requirement.subject.forcedGroup ?? "WHOLE",''',
    '''      weeklyPeriods: requirement.weeklyPeriods,
      teacherExtraPeriods: requirement.teacherExtraPeriods,
      group: requirement.subject.forcedGroup ?? "WHOLE",''',
)
replace(
    path,
    '''  const teacherRows: StaffingTeacher[] = [...teachers.values()]''',
    '''  for (const { teacher, weeklyPeriods } of sharedSecondLanguageHours.values()) {
    addSubjectHours(teacher, "JAZ2", weeklyPeriods);
  }

  const teacherRows: StaffingTeacher[] = [...teachers.values()]''',
)

# New deterministic bridge: the confirmed legacy matrix becomes the teaching plan authority.
Path("apps/web/lib/local/teaching-plan-from-allocation-draft.ts").write_text('''import type {
  StaffingAllocationDraft,
  StaffingAllocationDraftRow,
} from "./staffing-allocation-draft";
import * as school from "./teaching-plan-school";
import type { TeachingPlan } from "./teaching-plan";

function sortedClassCodes(draft: StaffingAllocationDraft): string[] {
  return [...new Set(draft.rows.map((row) => row.classCode).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right, "cs-CZ", { numeric: true }),
  );
}

function rowFingerprint(row: StaffingAllocationDraftRow): string {
  return [
    row.classCode,
    row.subjectCode,
    row.weeklyPeriods,
    row.teacherExtraPeriods ?? 0,
    row.group,
    [...row.teacherIds].sort().join(","),
  ].join("|");
}

export function allocationDraftFingerprint(
  draft: StaffingAllocationDraft | null,
): string {
  if (!draft?.rows.length) return "";
  return [...draft.rows]
    .map(rowFingerprint)
    .sort((left, right) => left.localeCompare(right, "cs-CZ", { numeric: true }))
    .join("\n");
}

function uniqueTeacherIds(rows: StaffingAllocationDraftRow[]): string[] {
  return [...new Set(rows.flatMap((row) => row.teacherIds).filter(Boolean))];
}

function weeklyPeriods(rows: StaffingAllocationDraftRow[]): number {
  const values = [...new Set(rows.map((row) => row.weeklyPeriods))];
  return Math.max(...values, 0);
}

export function createTeachingPlanFromAllocationDraft(
  draft: StaffingAllocationDraft,
): TeachingPlan {
  const plan = school.createEmptyTeachingPlan();
  plan.classes = sortedClassCodes(draft).map((code) =>
    school.createTeachingPlanClass(code),
  );
  plan.rows = [];

  const grouped = new Map<string, StaffingAllocationDraftRow[]>();
  for (const item of draft.rows) {
    const key = `${item.classCode}|${item.subjectCode}`;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  for (const [key, rows] of [...grouped.entries()].sort(([left], [right]) =>
    left.localeCompare(right, "cs-CZ", { numeric: true }),
  )) {
    const [classCode = "", subjectCode = ""] = key.split("|");
    const group1 = rows.find((row) => row.group === "GROUP_1");
    const group2 = rows.find((row) => row.group === "GROUP_2");
    const whole = rows.find((row) => row.group === "WHOLE");
    const allTeacherIds = uniqueTeacherIds(rows);
    const explicitGroups = rows.filter((row) => row.group !== "WHOLE").length;
    const split = explicitGroups >= 2 || allTeacherIds.length >= 2;
    const primaryTeacherId = group1
      ? (group1.teacherIds[0] ?? allTeacherIds[0] ?? "")
      : (whole?.teacherIds[0] ?? allTeacherIds[0] ?? "");
    const secondaryTeacherId = group2
      ? (group2.teacherIds[0] ?? "")
      : (allTeacherIds.find((teacherId) => teacherId !== primaryTeacherId) ?? "");

    const row = school.createTeachingPlanRow(classCode, subjectCode);
    row.weeklyPeriods = weeklyPeriods(rows);
    row.organization = split ? "SPLIT" : "WHOLE";
    row.primaryTeacherId = primaryTeacherId;
    row.secondaryTeacherId = split ? secondaryTeacherId : "";
    plan.rows.push(row);
  }

  return plan;
}
''')

# Teaching plan: apply a new legacy matrix once, build exact class periods from it, and treat it as authority.
path = "apps/web/lib/local/teaching-plan-school-v2.ts"
replace(
    path,
    '''import { loadStaffingAllocationDraft } from "./staffing-allocation-draft";
''',
    '''import { loadStaffingAllocationDraft } from "./staffing-allocation-draft";
import {
  allocationDraftFingerprint,
  createTeachingPlanFromAllocationDraft,
} from "./teaching-plan-from-allocation-draft";
''',
)
replace(
    path,
    '''const WORKLOAD_CREDITS_STORAGE_KEY =
  "rozvrhar:teaching-plan-workload-credits:v1";
''',
    '''const WORKLOAD_CREDITS_STORAGE_KEY =
  "rozvrhar:teaching-plan-workload-credits:v1";
const ALLOCATION_DRAFT_APPLIED_STORAGE_KEY =
  "rozvrhar:teaching-plan-allocation-draft-applied:v1";
''',
)
replace(
    path,
    '''  const enforcedCurriculum = enforceCurrentSchoolCurriculumRules(curriculum);
  const plan = school.createEmptyTeachingPlan();
''',
    '''  const enforcedCurriculum = enforceCurrentSchoolCurriculumRules(curriculum);
  if (allocationDraft?.rows.length) {
    return applySchoolOperationalRules(
      createTeachingPlanFromAllocationDraft(allocationDraft),
      staffingPlan,
      allocationDraft,
    );
  }
  const plan = school.createEmptyTeachingPlan();
''',
)
# Replace loadTeachingPlan as one block to guarantee a newly confirmed legacy draft replaces stale derived rows exactly once.
sub(
    path,
    r'''export function loadTeachingPlan\(\): TeachingPlan \{.*?\n\}\n\nexport function saveTeachingPlan''',
    '''export function loadTeachingPlan(): TeachingPlan {
  const staffingPlan = loadStaffingPlan();
  const allocationDraft = loadStaffingAllocationDraft();
  const storedPlanExists = hasStoredTeachingPlan();
  const curriculum = saveSchoolCurriculum(
    enforceCurrentSchoolCurriculumRules(
      loadSchoolCurriculum() ?? createDefaultSchoolCurriculum(),
    ),
  );
  const loaded = applyStoredWorkloadCredits(school.loadTeachingPlan());
  const draftFingerprint = allocationDraftFingerprint(allocationDraft);
  const appliedDraftFingerprint =
    typeof window !== "undefined"
      ? (window.localStorage.getItem(ALLOCATION_DRAFT_APPLIED_STORAGE_KEY) ?? "")
      : "";
  const applyNewDraft =
    Boolean(draftFingerprint) && draftFingerprint !== appliedDraftFingerprint;
  const plan = applyNewDraft
    ? createDefaultSchoolTeachingPlan(curriculum, staffingPlan, allocationDraft)
    : loaded.rows.length > 0 || storedPlanExists
      ? applySchoolOperationalRules(loaded, staffingPlan, allocationDraft)
      : createDefaultSchoolTeachingPlan(
          curriculum,
          staffingPlan,
          allocationDraft,
        );

  if (typeof window !== "undefined" && (applyNewDraft || !storedPlanExists)) {
    const saved = saveTeachingPlan(plan);
    if (draftFingerprint) {
      window.localStorage.setItem(
        ALLOCATION_DRAFT_APPLIED_STORAGE_KEY,
        draftFingerprint,
      );
    }
    return saved;
  }
  return plan;
}

export function saveTeachingPlan''',
)
# When a legacy allocation draft is present, its exact class rows are the authority instead of generic profile curriculum.
sub(
    path,
    r'''export function validateTeachingPlan\(\n  plan: TeachingPlan,\n  staffingPlan: StaffingPlan,\n\): string\[] \{.*?\n\}''',
    '''export function validateTeachingPlan(
  plan: TeachingPlan,
  staffingPlan: StaffingPlan,
  allocationDraft: StaffingAllocationDraft | null = loadStaffingAllocationDraft(),
): string[] {
  const curriculum =
    isCurrentSchoolPlan(plan) && !allocationDraft?.rows.length
      ? enforceCurrentSchoolCurriculumRules(
          loadSchoolCurriculum() ?? createDefaultSchoolCurriculum(),
        )
      : null;
  return [
    ...school
      .validateTeachingPlan(plan, staffingPlan)
      .filter((message) => !isObsoleteEqualProfileMessage(message)),
    ...(curriculum
      ? validatePlanAgainstSchoolCurriculum(plan, curriculum)
      : []),
  ];
}''',
)

# Regression: one compact workbook must reach generation with matching teacher loads.
Path("apps/web/tests/real-legacy-excel-generation.test.ts").write_text('''import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import { analyzeStaffingWorkbook } from "../lib/import/staffing-workbook-school-v2";
import type { LocalProject } from "../lib/local/api";
import { createDefaultSchoolCurriculum } from "../lib/local/school-default-data";
import { buildSchoolProjectForGeneration } from "../lib/local/school-project-generation";
import {
  createDefaultSchoolTeachingPlan,
  rowTeacherPeriods,
  validateTeachingPlan,
} from "../lib/local/teaching-plan-school-v3";

const CLASSES = [
  "6.A",
  "6.B",
  "6.C",
  "6.D",
  "7.A",
  "7.B",
  "7.C",
  "8.A",
  "8.B",
  "8.C",
  "9.A",
  "9.B",
  "9.C",
] as const;

function sourceRows(classCode: string): Array<[string, string, string | number]> {
  const rows: Array<[string, string, string | number]> = [
    ["Čj", `Cj${classCode}`, "4+1"],
    ["M", `M${classCode}`, "4+1"],
  ];
  if (["7.A", "7.C"].includes(classCode)) {
    rows.push(["PkČj", "ExtraCj", 1], ["Přpk", "Science", 1]);
  }
  if (["8.A", "8.B", "8.C"].includes(classCode)) {
    rows.push(
      ["Německý jazyk", "LangA", 3],
      ["Španělský jazyk", "LangB", 3],
    );
  }
  if (classCode === "9.A" || classCode === "9.C") {
    rows.push(["Německý jazyk", "LangA", 3]);
  }
  if (classCode === "9.B") {
    rows.push(["Německý jazyk", "LangB/LangA", 3]);
  }
  if (classCode === "8.A") rows.push(["Vv", "Art", 2]);
  return rows;
}

async function workbookBytes(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("List 1");
  let row = 2;
  for (const classCode of CLASSES) {
    sheet.getCell(row, 2).value = classCode;
    sheet.getCell(row + 1, 2).value = "Předměty";
    sheet.getCell(row + 1, 3).value = "Učitel/učitelka";
    sheet.getCell(row + 1, 4).value = "Časová dotace";
    sourceRows(classCode).forEach(([subject, teacher, periods], index) => {
      sheet.getCell(row + 2 + index, 2).value = subject;
      sheet.getCell(row + 2 + index, 3).value = teacher;
      sheet.getCell(row + 2 + index, 4).value = periods;
    });
    row += 12;
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

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

test("compact legacy Excel becomes a generation-ready project with matching teacher hours", async () => {
  const analysis = await analyzeStaffingWorkbook(await workbookBytes());
  assert.equal(analysis.valid, true);
  assert.ok("allocationDraft" in analysis);
  if (!("allocationDraft" in analysis) || !analysis.allocationDraft) return;

  const langA = analysis.plan.teachers.find((teacher) => teacher.lastName === "LangA");
  const langB = analysis.plan.teachers.find((teacher) => teacher.lastName === "LangB");
  assert.ok(langA);
  assert.ok(langB);
  assert.equal(
    langA.subjectLoads.find((item) => item.subjectCode === "JAZ2")?.weeklyPeriods,
    6,
  );
  assert.equal(
    langB.subjectLoads.find((item) => item.subjectCode === "JAZ2")?.weeklyPeriods,
    6,
  );

  const teachingPlan = createDefaultSchoolTeachingPlan(
    createDefaultSchoolCurriculum(),
    analysis.plan,
    analysis.allocationDraft,
  );
  assert.deepEqual(
    validateTeachingPlan(teachingPlan, analysis.plan, analysis.allocationDraft),
    [],
  );
  assert.equal(
    teachingPlan.rows.find(
      (row) => row.classCode === "8.A" && row.subjectCode === "VV",
    )?.weeklyPeriods,
    2,
  );
  assert.ok(teachingPlan.rows.some((row) => row.subjectCode === "PKCJ"));
  assert.ok(teachingPlan.rows.some((row) => row.subjectCode === "PRPK"));

  for (const teacher of analysis.plan.teachers) {
    const assigned = teachingPlan.rows.reduce(
      (total, row) => total + rowTeacherPeriods(row, teacher.id),
      0,
    );
    assert.equal(
      assigned,
      teacher.targetWeeklyLoad,
      `${teacher.lastName}: ${assigned} != ${teacher.targetWeeklyLoad}`,
    );
  }

  const generated = buildSchoolProjectForGeneration({
    existingProject: project(),
    staffingPlan: analysis.plan,
    teachingPlan,
    forceReplaceGeneratedData: false,
  });
  assert.deepEqual(generated.blockers, []);
  assert.ok(generated.project.assignments.length > 0);
});
''')
