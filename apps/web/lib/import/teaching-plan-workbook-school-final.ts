import ExcelJS from "exceljs";

import {
  teacherCodesForPlan,
  type StaffingPlan,
} from "@/lib/local/staffing-plan";
import {
  createTeachingPlanRow,
  normalizeClassCode,
  validateTeachingPlan,
  type TeachingPlan,
} from "@/lib/local/teaching-plan";
import {
  analyzeTeachingPlanWorkbook as analyzeSchoolTeachingPlanWorkbook,
  createTeachingPlanWorkbook as createSchoolTeachingPlanWorkbook,
  type TeachingPlanWorkbookAnalysis,
  type TeachingPlanWorkbookIssue,
} from "./teaching-plan-workbook-school";

export type { TeachingPlanWorkbookAnalysis, TeachingPlanWorkbookIssue };

const TEACHING_PLAN_SHEET = "Výuka tříd";
const SHARED_GROUPS_SHEET = "Společné skupiny";
const FIRST_SHARED_ROW = 6;
const LAST_SHARED_ROW = 105;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function teacherLookup(staffingPlan: StaffingPlan): Map<string, string> {
  const codes = teacherCodesForPlan(staffingPlan);
  const result = new Map<string, string>();
  for (const teacher of staffingPlan.teachers) {
    const code = codes.get(teacher.id) ?? "";
    const fullName = `${teacher.firstName} ${teacher.lastName}`.trim();
    result.set(code.toLocaleUpperCase("cs-CZ"), teacher.id);
    result.set(fullName.toLocaleUpperCase("cs-CZ"), teacher.id);
    result.set(
      `${code} · ${fullName}`.trim().toLocaleUpperCase("cs-CZ"),
      teacher.id,
    );
  }
  return result;
}

function teacherId(value: unknown, lookup: Map<string, string>): string {
  return lookup.get(text(value).toLocaleUpperCase("cs-CZ")) ?? "";
}

function preferredStartPeriods(value: unknown): number[] {
  const normalized = text(value);
  const mapping: Record<string, number[]> = {
    "1.–2. hodina": [0],
    "2.–3. hodina": [1],
    "3.–4. hodina": [2],
    "4.–5. hodina": [3],
    "5.–6. hodina": [4],
    "6.–7. hodina": [5],
    "7.–8. hodina": [6],
  };
  return mapping[normalized] ?? [];
}

function preferenceWeight(value: unknown): number {
  const normalized = text(value).toLocaleLowerCase("cs-CZ");
  if (normalized === "vysoká") return 500;
  if (normalized === "střední") return 100;
  if (normalized === "nízká") return 25;
  return 0;
}

function removeReplacedRows(
  plan: TeachingPlan,
  replacements: Array<{ classCodes: string[]; subjectCode: string }>,
): TeachingPlan {
  const replaced = new Set(
    replacements.flatMap((item) =>
      item.classCodes.map((classCode) => `${classCode}|${item.subjectCode}`),
    ),
  );
  return {
    ...plan,
    rows: plan.rows.filter(
      (row) => !replaced.has(`${normalizeClassCode(row.classCode)}|${row.subjectCode}`),
    ),
  };
}

function parseSharedGroups(
  workbook: ExcelJS.Workbook,
  staffingPlan: StaffingPlan,
): {
  rows: TeachingPlan["rows"];
  replacements: Array<{ classCodes: string[]; subjectCode: string }>;
  issues: TeachingPlanWorkbookIssue[];
} {
  const sheet = workbook.getWorksheet(SHARED_GROUPS_SHEET);
  if (!sheet) return { rows: [], replacements: [], issues: [] };

  const lookup = teacherLookup(staffingPlan);
  const rows: TeachingPlan["rows"] = [];
  const replacements: Array<{ classCodes: string[]; subjectCode: string }> = [];
  const issues: TeachingPlanWorkbookIssue[] = [];

  for (let rowNumber = FIRST_SHARED_ROW; rowNumber <= LAST_SHARED_ROW; rowNumber += 1) {
    const subjectCode = text(sheet.getCell(rowNumber, 1).value).toLocaleUpperCase("cs-CZ");
    const rawClasses = text(sheet.getCell(rowNumber, 2).value);
    const firstGroup = text(sheet.getCell(rowNumber, 3).value);
    const firstTeacherId = teacherId(sheet.getCell(rowNumber, 4).value, lookup);
    const secondGroup = text(sheet.getCell(rowNumber, 5).value);
    const secondTeacherId = teacherId(sheet.getCell(rowNumber, 6).value, lookup);
    const weeklyPeriods = numberValue(sheet.getCell(rowNumber, 7).value);
    const doublePeriodsCount = numberValue(sheet.getCell(rowNumber, 8).value);

    if (
      !subjectCode &&
      !rawClasses &&
      !firstGroup &&
      !secondGroup &&
      weeklyPeriods === 0
    ) {
      continue;
    }

    const classCodes = [
      ...new Set(
        rawClasses
          .split(/[,;+]/)
          .map(normalizeClassCode)
          .filter(Boolean),
      ),
    ];

    if (classCodes.length < 1) {
      issues.push({
        severity: "ERROR",
        sheet: SHARED_GROUPS_SHEET,
        row: rowNumber,
        field: "Třídy",
        message: "U společné skupiny zadejte alespoň jednu třídu.",
      });
      continue;
    }
    if (!subjectCode) {
      issues.push({
        severity: "ERROR",
        sheet: SHARED_GROUPS_SHEET,
        row: rowNumber,
        field: "Předmět",
        message: "Vyplňte předmět společné skupiny.",
      });
      continue;
    }

    const row = createTeachingPlanRow(classCodes[0], subjectCode);
    row.weeklyPeriods = weeklyPeriods;
    row.lessonShape =
      weeklyPeriods > 0 && doublePeriodsCount * 2 === weeklyPeriods
        ? "DOUBLE"
        : doublePeriodsCount > 0
          ? "MIXED"
          : "SEPARATE";
    row.doublePeriodsCount = doublePeriodsCount;
    row.organization = "SPLIT";
    row.primaryTeacherId = firstTeacherId;
    row.secondaryTeacherId = secondTeacherId;
    row.additionalClassCodes = classCodes.slice(1);
    row.preferredStartPeriods = preferredStartPeriods(
      sheet.getCell(rowNumber, 9).value,
    );
    row.preferenceWeight = preferenceWeight(sheet.getCell(rowNumber, 10).value);
    row.sharedGroupLabel = [firstGroup, secondGroup].filter(Boolean).join(" / ");

    rows.push(row);
    replacements.push({ classCodes, subjectCode });
  }

  return { rows, replacements, issues };
}

function removeIncorrectSeparateTvExamples(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.getWorksheet(TEACHING_PLAN_SHEET);
  if (!sheet) return;

  sheet.getCell("A4").value =
    "Společnou nebo dělenou výuku více tříd nastavte na listu Společné skupiny. Zde zůstává pouze hodinová dotace jednotlivých tříd.";

  for (let row = 6; row <= 305; row += 1) {
    const classCode = text(sheet.getCell(row, 1).value);
    const subjectCode = text(sheet.getCell(row, 2).value);
    if (!["9.A", "9.C"].includes(classCode) || subjectCode !== "TV") {
      continue;
    }

    sheet.getCell(row, 3).value = 2;
    sheet.getCell(row, 4).value = "Pouze dvojhodiny";
    sheet.getCell(row, 5).value = null;
    sheet.getCell(row, 6).value = "Celá třída";
    sheet.getCell(row, 7).value = null;
    sheet.getCell(row, 8).value = null;
  }
}

function addSharedGroupsSheet(
  workbook: ExcelJS.Workbook,
  staffingPlan: StaffingPlan,
): void {
  const oldSheet = workbook.getWorksheet(SHARED_GROUPS_SHEET);
  if (oldSheet) workbook.removeWorksheet(oldSheet.id);

  const sheet = workbook.addWorksheet(SHARED_GROUPS_SHEET, {
    views: [{ state: "frozen", ySplit: 5 }],
  });

  sheet.mergeCells("A1:K1");
  sheet.getCell("A1").value = "SPOLEČNÁ A DĚLENÁ VÝUKA VÍCE TŘÍD";
  sheet.getCell("A1").font = {
    bold: true,
    size: 16,
    color: { argb: "FFFFFFFF" },
  };
  sheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF3157C8" },
  };

  sheet.mergeCells("A2:K2");
  sheet.getCell("A2").value =
    "Jeden řádek = dvě paralelní skupiny, které musí probíhat současně. Třídy oddělte čárkou.";
  sheet.mergeCells("A3:K3");
  sheet.getCell("A3").value =
    "Vedení může změnit spojené třídy, názvy skupin, oba učitele, dotaci i počet dvojhodin.";
  sheet.mergeCells("A4:K4");
  sheet.getCell("A4").value =
    "Preferovaný začátek je měkké přání: solver ho upřednostní, ale nezablokuje kvůli němu jinak proveditelný rozvrh.";

  sheet.getRow(5).values = [
    "Předmět",
    "Třídy",
    "Skupina 1",
    "Učitel skupiny 1",
    "Skupina 2",
    "Učitel skupiny 2",
    "Hodin týdně",
    "Počet dvojhodin",
    "Preferovaný začátek",
    "Priorita preference",
    "Poznámka",
  ];
  sheet.getRow(5).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(5).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF17355C" },
  };
  sheet.getRow(5).alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };

  sheet.columns = [
    { width: 14 },
    { width: 18 },
    { width: 16 },
    { width: 30 },
    { width: 16 },
    { width: 30 },
    { width: 15 },
    { width: 18 },
    { width: 20 },
    { width: 20 },
    { width: 42 },
  ];

  const teacherCodes = teacherCodesForPlan(staffingPlan);
  const kadlecek = staffingPlan.teachers.find(
    (teacher) =>
      `${teacher.firstName} ${teacher.lastName}`
        .trim()
        .toLocaleLowerCase("cs-CZ") === "tomáš kadleček",
  );
  const kadlecekLabel = kadlecek
    ? `${teacherCodes.get(kadlecek.id)} · ${kadlecek.firstName} ${kadlecek.lastName}`
    : "KAD · Tomáš Kadleček";

  const row = 6;
  sheet.getCell(row, 1).value = "TV";
  sheet.getCell(row, 2).value = "9.A, 9.C";
  sheet.getCell(row, 3).value = "Kluci";
  sheet.getCell(row, 4).value = kadlecekLabel;
  sheet.getCell(row, 5).value = "Holky – upravit podle školy";
  sheet.getCell(row, 6).value = null;
  sheet.getCell(row, 7).value = 4;
  sheet.getCell(row, 8).value = 2;
  sheet.getCell(row, 9).value = "6.–7. hodina";
  sheet.getCell(row, 10).value = "Vysoká";
  sheet.getCell(row, 11).value =
    "Kluci z 9.A + 9.C mají společně 4 h TV = 2× dvojhodina. Vedení doplní učitele a skutečné složení paralelní skupiny holek.";

  const teacherLabels = staffingPlan.teachers.map((teacher) => {
    const code = teacherCodes.get(teacher.id) ?? "";
    return `${code} · ${teacher.firstName} ${teacher.lastName}`.trim();
  });
  const dictionary = workbook.getWorksheet("Číselníky");
  if (dictionary) {
    dictionary.getCell("P1").value = "Učitelé společných skupin";
    teacherLabels.forEach((label, index) => {
      dictionary.getCell(index + 2, 16).value = label;
    });
  }
  const teacherLastRow = Math.max(2, teacherLabels.length + 1);

  for (let dataRow = FIRST_SHARED_ROW; dataRow <= LAST_SHARED_ROW; dataRow += 1) {
    for (const column of [4, 6]) {
      sheet.getCell(dataRow, column).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'Číselníky'!$P$2:$P$${teacherLastRow}`],
      };
    }
    sheet.getCell(dataRow, 9).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [
        '"Bez preference,1.–2. hodina,2.–3. hodina,3.–4. hodina,4.–5. hodina,5.–6. hodina,6.–7. hodina,7.–8. hodina"',
      ],
    };
    sheet.getCell(dataRow, 10).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Nízká,Střední,Vysoká"'],
    };
  }

  sheet.autoFilter = { from: "A5", to: "K5" };
}

export async function createTeachingPlanWorkbook(
  staffingPlan: StaffingPlan,
  existingPlan?: TeachingPlan,
): Promise<Uint8Array> {
  const source = await createSchoolTeachingPlanWorkbook(
    staffingPlan,
    existingPlan,
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(source);
  removeIncorrectSeparateTvExamples(workbook);
  addSharedGroupsSheet(workbook, staffingPlan);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function analyzeTeachingPlanWorkbook(
  input: ArrayBuffer | Uint8Array,
  staffingPlan: StaffingPlan,
): Promise<TeachingPlanWorkbookAnalysis> {
  const legacy = await analyzeSchoolTeachingPlanWorkbook(input, staffingPlan);
  const workbook = new ExcelJS.Workbook();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  await workbook.xlsx.load(bytes as never);

  const shared = parseSharedGroups(workbook, staffingPlan);
  const withoutReplacedRows = removeReplacedRows(
    legacy.plan,
    shared.replacements,
  );
  const plan: TeachingPlan = {
    ...withoutReplacedRows,
    rows: [...withoutReplacedRows.rows, ...shared.rows],
  };
  const validationIssues = validateTeachingPlan(plan, staffingPlan).map(
    (message): TeachingPlanWorkbookIssue => ({
      severity: "ERROR",
      sheet: SHARED_GROUPS_SHEET,
      row: null,
      field: null,
      message,
    }),
  );
  const issues = [...legacy.issues, ...shared.issues, ...validationIssues];

  return {
    valid: issues.every((issue) => issue.severity !== "ERROR"),
    plan,
    issues,
    summary: {
      ...legacy.summary,
      subjects: plan.rows.length,
      splitSubjects: plan.rows.filter(
        (row) => row.organization !== "WHOLE",
      ).length,
      doubleBlocks: plan.rows.reduce(
        (total, row) =>
          total +
          (row.lessonShape === "DOUBLE"
            ? row.weeklyPeriods / 2
            : row.doublePeriodsCount),
        0,
      ),
      weeklyClassPeriods: plan.rows.reduce(
        (total, row) =>
          total +
          row.weeklyPeriods * (1 + (row.additionalClassCodes?.length ?? 0)),
        0,
      ),
    },
  };
}
