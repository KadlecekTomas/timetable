import ExcelJS, { type Cell, type Worksheet } from "exceljs";

import type { StaffingAllocationDraft } from "@/lib/local/staffing-allocation-draft";
import type {
  SchoolCurriculum,
  SchoolCurriculumProfile,
} from "@/lib/local/school-curriculum";
import type { StaffingPlan } from "@/lib/local/staffing-plan";
import {
  createEmptyTeachingPlan,
  createTeachingPlanClass,
  createTeachingPlanRow,
  type TeachingPlan,
  type TeachingPlanRow,
} from "@/lib/local/teaching-plan";
import type {
  TeachingPlanWorkbookAnalysis,
  TeachingPlanWorkbookIssue,
} from "./teaching-plan-workbook";

const REGULAR_SHEET_TOKEN = "ucebniplanbeznetridy";
const SPORTS_SHEET_TOKEN = "ucebniplantridysrozsireno";
const FIRST_SUBJECT_ROW = 3;
const LAST_SUBJECT_ROW = 19;
const TOTAL_ROW = 21;
const SCHOOL_CLASSES = [
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

const SUBJECTS: Record<string, { code: string; name: string }> = {
  ceskyjazyk: { code: "CJ", name: "Český jazyk" },
  anglickyjazyk: { code: "JAZ1", name: "Anglický jazyk" },
  dalsicizijazyk: { code: "JAZ2", name: "Další cizí jazyk" },
  matematika: { code: "M", name: "Matematika" },
  informatika: { code: "INF", name: "Informatika" },
  dejepis: { code: "DEJ", name: "Dějepis" },
  obcanskavychova: { code: "OV", name: "Občanská výchova" },
  fyzika: { code: "FY", name: "Fyzika" },
  chemie: { code: "CH", name: "Chemie" },
  prirodopis: { code: "PRI", name: "Přírodopis" },
  zemepis: { code: "ZEM", name: "Zeměpis" },
  hudebnivychova: { code: "HV", name: "Hudební výchova" },
  vytvarnavychova: { code: "VV", name: "Výtvarná výchova" },
  telesnavychova: { code: "TV", name: "Tělesná výchova" },
  vychovakezdravi: { code: "VZ", name: "Výchova ke zdraví" },
  pracovnicinnosti: { code: "PC", name: "Pracovní činnosti" },
  povinnevolitelnepredmety: {
    code: "VOL",
    name: "Povinně volitelné předměty",
  },
};

export interface SchoolCurriculumWorkbookAnalysis
  extends TeachingPlanWorkbookAnalysis {
  recognized: boolean;
  curriculum: SchoolCurriculum | null;
}

function asciiKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs-CZ")
    .replace(/[^a-z0-9]+/g, "");
}

function cellText(cell: Cell): string {
  const value = cell.value;
  if (value && typeof value === "object" && "formula" in value) {
    return value.result == null ? "" : String(value.result).trim();
  }
  return cell.text.trim();
}

function integerValue(cell: Cell): number | null {
  const text = cellText(cell).replace(",", ".");
  if (!text) return null;
  const value = Number(text);
  return Number.isInteger(value) ? value : null;
}

function issue(
  severity: TeachingPlanWorkbookIssue["severity"],
  sheet: string,
  row: number | null,
  field: string | null,
  message: string,
): TeachingPlanWorkbookIssue {
  return { severity, sheet, row, field, message };
}

function profileForClass(code: string): "REGULAR" | "SPORTS" {
  return /\.(B|D)$/.test(code) ? "SPORTS" : "REGULAR";
}

function gradeForClass(code: string): number {
  return Number(code.split(".")[0]);
}

function findCurriculumSheets(workbook: ExcelJS.Workbook): {
  regular: Worksheet;
  sports: Worksheet;
} | null {
  const regular = workbook.worksheets.find((sheet) =>
    asciiKey(sheet.name).startsWith(REGULAR_SHEET_TOKEN),
  );
  const sports = workbook.worksheets.find((sheet) =>
    asciiKey(sheet.name).startsWith(SPORTS_SHEET_TOKEN),
  );
  return regular && sports ? { regular, sports } : null;
}

function parseProfile(
  sheet: Worksheet,
  profile: "REGULAR" | "SPORTS",
  issues: TeachingPlanWorkbookIssue[],
): SchoolCurriculumProfile {
  const subjects: SchoolCurriculumProfile["subjects"] = [];
  const seen = new Set<string>();

  for (let row = FIRST_SUBJECT_ROW; row <= LAST_SUBJECT_ROW; row += 1) {
    const rawSubject = cellText(sheet.getCell(row, 1));
    if (!rawSubject) continue;
    const descriptor = SUBJECTS[asciiKey(rawSubject)];
    if (!descriptor) {
      issues.push(
        issue(
          "ERROR",
          sheet.name,
          row,
          "Předmět",
          `Předmět „${rawSubject}“ není podporovaný. Doplňte jeho mapování nebo opravte název.`,
        ),
      );
      continue;
    }
    if (seen.has(descriptor.code)) {
      issues.push(
        issue(
          "ERROR",
          sheet.name,
          row,
          "Předmět",
          `${descriptor.name} je v profilu uveden vícekrát.`,
        ),
      );
      continue;
    }
    seen.add(descriptor.code);

    const weeklyPeriodsByGrade: Record<string, number> = {};
    let rowTotal = 0;
    for (let gradeIndex = 0; gradeIndex < 4; gradeIndex += 1) {
      const grade = gradeIndex + 6;
      const value = integerValue(sheet.getCell(row, gradeIndex + 2));
      if (value == null || value < 0 || value > 15) {
        issues.push(
          issue(
            "ERROR",
            sheet.name,
            row,
            `${grade}. ročník`,
            `${descriptor.name}: zadejte celé číslo od 0 do 15.`,
          ),
        );
        weeklyPeriodsByGrade[String(grade)] = 0;
      } else {
        weeklyPeriodsByGrade[String(grade)] = value;
        rowTotal += value;
      }
    }
    const declaredRowTotal = integerValue(sheet.getCell(row, 6));
    if (declaredRowTotal != null && declaredRowTotal !== rowTotal) {
      issues.push(
        issue(
          "ERROR",
          sheet.name,
          row,
          "Celkem",
          `${descriptor.name}: součet ročníků je ${rowTotal}, ale ve sloupci Celkem je ${declaredRowTotal}.`,
        ),
      );
    }
    subjects.push({
      subjectCode: descriptor.code,
      subjectName: descriptor.name,
      weeklyPeriodsByGrade,
    });
  }

  const gradeTotals = [6, 7, 8, 9].map((grade) =>
    subjects.reduce(
      (total, subject) =>
        total + (subject.weeklyPeriodsByGrade[String(grade)] ?? 0),
      0,
    ),
  );
  gradeTotals.forEach((total, index) => {
    const grade = index + 6;
    const declared = integerValue(sheet.getCell(TOTAL_ROW, index + 2));
    if (declared == null || declared !== total) {
      issues.push(
        issue(
          "ERROR",
          sheet.name,
          TOTAL_ROW,
          `${grade}. ročník`,
          `Kontrolní součet ${grade}. ročníku má být ${total}, v souboru je ${declared ?? "prázdno"}.`,
        ),
      );
    }
  });
  const grandTotal = gradeTotals.reduce((total, value) => total + value, 0);
  const declaredGrandTotal = integerValue(sheet.getCell(TOTAL_ROW, 6));
  if (grandTotal !== 122 || declaredGrandTotal !== 122) {
    issues.push(
      issue(
        "ERROR",
        sheet.name,
        TOTAL_ROW,
        "Celkem",
        `Celková povinná časová dotace musí být 122 hodin; vypočteno ${grandTotal}, uvedeno ${declaredGrandTotal ?? "prázdno"}.`,
      ),
    );
  }

  return { profile, sourceSheet: sheet.name, subjects };
}

function allocationRows(
  draft: StaffingAllocationDraft | null,
  classCode: string,
  subjectCode: string,
) {
  return (
    draft?.rows.filter(
      (row) => row.classCode === classCode && row.subjectCode === subjectCode,
    ) ?? []
  );
}

function assignmentForRow(
  row: TeachingPlanRow,
  draft: StaffingAllocationDraft | null,
  sheetName: string,
  issues: TeachingPlanWorkbookIssue[],
): TeachingPlanRow {
  const candidates = allocationRows(draft, row.classCode, row.subjectCode);
  if (candidates.length === 0) {
    issues.push(
      issue(
        "WARNING",
        sheetName,
        null,
        `${row.classCode} ${row.subjectCode}`,
        `${row.classCode} · ${row.subjectCode}: hodinová dotace je načtená, učitele je potřeba přiřadit v aplikaci.`,
      ),
    );
    return row;
  }

  const group1 = candidates.find((item) => item.group === "GROUP_1");
  const group2 = candidates.find((item) => item.group === "GROUP_2");
  if (group1 || group2) {
    const primaryTeacherId = group1?.teacherIds[0] ?? "";
    const secondaryTeacherId = group2?.teacherIds[0] ?? "";
    if (!primaryTeacherId || !secondaryTeacherId) {
      issues.push(
        issue(
          "WARNING",
          group1?.sourceSheet ?? group2?.sourceSheet ?? sheetName,
          group1?.sourceRow ?? group2?.sourceRow ?? null,
          `${row.classCode} ${row.subjectCode}`,
          `${row.classCode} · ${row.subjectCode}: jedna z paralelních skupin zatím nemá učitele.`,
        ),
      );
    }
    for (const candidate of [group1, group2]) {
      if (candidate && candidate.weeklyPeriods !== row.weeklyPeriods) {
        issues.push(
          issue(
            "WARNING",
            candidate.sourceSheet,
            candidate.sourceRow,
            `${row.classCode} ${row.subjectCode}`,
            `Staré přiřazení obsahuje ${candidate.weeklyPeriods} h, nový učební plán vyžaduje ${row.weeklyPeriods} h. Použita byla nová časová dotace.`,
          ),
        );
      }
    }
    return {
      ...row,
      organization: "SPLIT",
      primaryTeacherId,
      secondaryTeacherId,
    };
  }

  const candidate = candidates[0]!;
  if (candidate.weeklyPeriods !== row.weeklyPeriods) {
    issues.push(
      issue(
        "WARNING",
        candidate.sourceSheet,
        candidate.sourceRow,
        `${row.classCode} ${row.subjectCode}`,
        `Staré přiřazení obsahuje ${candidate.weeklyPeriods} h, nový učební plán vyžaduje ${row.weeklyPeriods} h. Použita byla nová časová dotace.`,
      ),
    );
  }
  if (candidate.teacherIds.length >= 2) {
    return {
      ...row,
      organization: "SPLIT",
      primaryTeacherId: candidate.teacherIds[0] ?? "",
      secondaryTeacherId: candidate.teacherIds[1] ?? "",
    };
  }
  return {
    ...row,
    organization: "WHOLE",
    primaryTeacherId: candidate.teacherIds[0] ?? "",
    secondaryTeacherId: "",
  };
}

function buildPlan(
  curriculum: SchoolCurriculum,
  draft: StaffingAllocationDraft | null,
  issues: TeachingPlanWorkbookIssue[],
): TeachingPlan {
  const plan = createEmptyTeachingPlan();
  plan.classes = SCHOOL_CLASSES.map((code) => createTeachingPlanClass(code));
  plan.rows = [];

  for (const classCode of SCHOOL_CLASSES) {
    const profile = profileForClass(classCode);
    const grade = gradeForClass(classCode);
    const source = curriculum.profiles[profile];
    for (const subject of source.subjects) {
      const weeklyPeriods = subject.weeklyPeriodsByGrade[String(grade)] ?? 0;
      if (weeklyPeriods <= 0) continue;
      const row = createTeachingPlanRow(classCode, subject.subjectCode);
      row.weeklyPeriods = weeklyPeriods;
      row.lessonShape =
        subject.subjectCode === "TV" &&
        ["9.A", "9.C"].includes(classCode) &&
        weeklyPeriods % 2 === 0
          ? "DOUBLE"
          : "SEPARATE";
      row.doublePeriodsCount =
        row.lessonShape === "DOUBLE" ? weeklyPeriods / 2 : 0;
      plan.rows.push(assignmentForRow(row, draft, source.sourceSheet, issues));
    }
  }

  if (draft) {
    const activeKeys = new Set(
      plan.rows.map((row) => `${row.classCode}|${row.subjectCode}`),
    );
    for (const item of draft.rows) {
      if (!activeKeys.has(`${item.classCode}|${item.subjectCode}`)) {
        issues.push(
          issue(
            "WARNING",
            item.sourceSheet,
            item.sourceRow,
            `${item.classCode} ${item.subjectCode}`,
            `${item.classCode} · ${item.subjectCode}: staré přiřazení není v novém učebním plánu a nebylo převzato.`,
          ),
        );
      }
    }
  }

  return plan;
}

export async function analyzeSchoolCurriculumWorkbook(
  input: ArrayBuffer | Uint8Array,
  _staffingPlan: StaffingPlan,
  allocationDraft: StaffingAllocationDraft | null,
): Promise<SchoolCurriculumWorkbookAnalysis | null> {
  const workbook = new ExcelJS.Workbook();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  try {
    await workbook.xlsx.load(bytes as never);
  } catch {
    return null;
  }
  const sheets = findCurriculumSheets(workbook);
  if (!sheets) return null;

  const issues: TeachingPlanWorkbookIssue[] = [];
  const curriculum: SchoolCurriculum = {
    version: 1,
    profiles: {
      REGULAR: parseProfile(sheets.regular, "REGULAR", issues),
      SPORTS: parseProfile(sheets.sports, "SPORTS", issues),
    },
  };
  const structuralErrors = issues.some((item) => item.severity === "ERROR");
  const plan = structuralErrors
    ? createEmptyTeachingPlan()
    : buildPlan(curriculum, allocationDraft, issues);
  const uniqueSubjects = new Set(plan.rows.map((row) => row.subjectCode));
  const weeklyClassPeriods = plan.rows.reduce(
    (total, row) => total + row.weeklyPeriods,
    0,
  );
  const splitSubjects = plan.rows.filter(
    (row) => row.organization !== "WHOLE",
  ).length;
  const doubleBlocks = plan.rows.reduce(
    (total, row) =>
      total + (row.lessonShape === "DOUBLE" ? row.weeklyPeriods / 2 : 0),
    0,
  );

  return {
    recognized: true,
    curriculum,
    valid: !structuralErrors,
    plan,
    issues,
    summary: {
      classes: plan.classes.length,
      subjects: uniqueSubjects.size,
      splitSubjects,
      doubleBlocks,
      weeklyClassPeriods,
    },
  };
}
