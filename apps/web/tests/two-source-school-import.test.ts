import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS, { type Worksheet } from "exceljs";

import { analyzeLegacyStaffingPlan } from "../lib/import/legacy-staffing-plan";
import { analyzeSchoolCurriculumWorkbook } from "../lib/import/school-curriculum-workbook";

const REGULAR = [
  ["Český jazyk", 5, 4, 4, 4],
  ["Anglický jazyk", 4, 3, 3, 4],
  ["Další cizí jazyk", 0, 0, 3, 3],
  ["Matematika", 4, 5, 4, 4],
  ["Informatika", 1, 1, 1, 1],
  ["Dějepis", 2, 2, 2, 2],
  ["Občanská výchova", 1, 1, 1, 1],
  ["Fyzika", 2, 2, 1, 2],
  ["Chemie", 0, 0, 2, 2],
  ["Přírodopis", 2, 2, 2, 1],
  ["Zeměpis", 2, 2, 1, 2],
  ["Hudební výchova", 1, 1, 1, 0],
  ["Výtvarná výchova", 2, 2, 1, 1],
  ["Tělesná výchova", 2, 2, 2, 2],
  ["Výchova ke zdraví", 0, 1, 1, 0],
  ["Pracovní činnosti", 1, 1, 1, 0],
  ["Povinně volitelné předměty", 1, 2, 1, 1],
] as const;

const SPORTS = [
  ["Český jazyk", 4, 4, 5, 4],
  ["Anglický jazyk", 3, 3, 3, 3],
  ["Další cizí jazyk", 0, 0, 3, 3],
  ["Matematika", 4, 4, 4, 5],
  ["Informatika", 1, 1, 1, 1],
  ["Dějepis", 2, 2, 2, 2],
  ["Občanská výchova", 1, 1, 1, 1],
  ["Fyzika", 2, 2, 1, 1],
  ["Chemie", 0, 0, 2, 2],
  ["Přírodopis", 2, 2, 1, 1],
  ["Zeměpis", 2, 2, 1, 1],
  ["Hudební výchova", 1, 1, 1, 0],
  ["Výtvarná výchova", 2, 2, 1, 1],
  ["Tělesná výchova", 5, 5, 5, 4],
  ["Výchova ke zdraví", 0, 0, 0, 0],
  ["Pracovní činnosti", 1, 1, 1, 0],
  ["Povinně volitelné předměty", 0, 0, 0, 1],
] as const;

function writeCurriculumProfile(
  worksheet: Worksheet,
  title: string,
  rows: readonly (readonly [string, number, number, number, number])[],
): void {
  worksheet.getCell("A1").value = title;
  worksheet.getRow(2).values = [
    "Předmět",
    "6. ročník",
    "7. ročník",
    "8. ročník",
    "9. ročník",
    "Celkem",
  ];
  rows.forEach((item, index) => {
    const row = index + 3;
    worksheet.getCell(row, 1).value = item[0];
    for (let gradeIndex = 0; gradeIndex < 4; gradeIndex += 1) {
      worksheet.getCell(row, gradeIndex + 2).value = item[gradeIndex + 1];
    }
    worksheet.getCell(row, 6).value =
      Number(item[1]) + Number(item[2]) + Number(item[3]) + Number(item[4]);
  });
  worksheet.getCell("A21").value = "Celková povinná časová dotace";
  for (let gradeIndex = 0; gradeIndex < 4; gradeIndex += 1) {
    worksheet.getCell(21, gradeIndex + 2).value = rows.reduce(
      (total, row) => total + Number(row[gradeIndex + 1]),
      0,
    );
  }
  worksheet.getCell("F21").value = 122;
}

async function createCurriculumWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  writeCurriculumProfile(
    workbook.addWorksheet("UČEBNÍ PLÁN – BĚŽNÉ TŘÍDY"),
    "UČEBNÍ PLÁN – BĚŽNÉ TŘÍDY",
    REGULAR,
  );
  writeCurriculumProfile(
    workbook.addWorksheet("UČEBNÍ PLÁN – TŘÍDY S ROZŠÍŘENO"),
    "UČEBNÍ PLÁN – TŘÍDY S ROZŠÍŘENOU VÝUKOU TV",
    SPORTS,
  );
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function writeClassHeader(
  worksheet: Worksheet,
  row: number,
  classes: Array<{ column: number; code: string; teacher: string }>,
): void {
  for (const schoolClass of classes) {
    worksheet.getCell(row, schoolClass.column).value = schoolClass.code;
    worksheet.getCell(row, schoolClass.column + 1).value = schoolClass.teacher;
    worksheet.getCell(row + 2, schoolClass.column).value = "Předměty";
    worksheet.getCell(row + 2, schoolClass.column + 1).value =
      "Učitel/učitelka";
    worksheet.getCell(row + 2, schoolClass.column + 2).value = "Časová dotace";
  }
}

function writeSubject(
  worksheet: Worksheet,
  row: number,
  column: number,
  subject: string,
  teacher: string,
  weeklyPeriods: number,
): void {
  worksheet.getCell(row, column).value = subject;
  worksheet.getCell(row, column + 1).value = teacher;
  worksheet.getCell(row, column + 2).value = weeklyPeriods;
}

async function createLegacyStaffingWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Úvazky 20252026");
  workbook.addWorksheet("Jednotlivci");

  worksheet.getCell("A11").value = 22;
  worksheet.getCell("C11").value = "Kadleček Tomáš+5";
  worksheet.getCell("D11").value = 22;
  worksheet.getCell("A20").value = 22;
  worksheet.getCell("C20").value = "Přikrylová Radana+3";
  worksheet.getCell("D20").value = 22;
  worksheet.getCell("C26").value = "Šárová Eliška";
  worksheet.getCell("D26").value = 8;
  worksheet.getCell("C29").value = "Špánková Michaela";
  worksheet.getCell("D29").value = 12;

  const blocks = [
    {
      row: 41,
      classes: [
        [3, "6.A"],
        [7, "6.B"],
        [11, "6.C"],
        [15, "6.D"],
        [19, "7.A"],
      ] as const,
    },
    {
      row: 61,
      classes: [
        [3, "7.B"],
        [7, "7.C"],
        [11, "8.A"],
        [15, "8.B"],
        [19, "8.C"],
      ] as const,
    },
    {
      row: 81,
      classes: [
        [3, "9.A"],
        [7, "9.B"],
        [11, "9.C"],
      ] as const,
    },
  ];

  for (const block of blocks) {
    writeClassHeader(
      worksheet,
      block.row,
      block.classes.map(([column, code]) => ({
        column,
        code,
        teacher: "Třídní Učitel",
      })),
    );
    for (const [column] of block.classes) {
      writeSubject(worksheet, block.row + 3, column, "Inf", "Kadleček", 1);
    }
  }

  writeSubject(worksheet, 65, 11, "Německý jazyk", "Přikrylová", 3);
  writeSubject(worksheet, 65, 15, "Německý jazyk", "", 3);
  writeSubject(worksheet, 65, 19, "Německý jazyk", "", 3);
  writeSubject(worksheet, 66, 11, "Španělský jazyk", "Špánková", 3);
  writeSubject(worksheet, 66, 15, "Španělský jazyk", "Špánková", 3);
  writeSubject(worksheet, 66, 19, "Španělský jazyk", "Śpánková", 3);
  writeSubject(worksheet, 85, 3, "Tv", "Kadleček/Šárová", 2);
  writeSubject(worksheet, 85, 11, "Tv", "Kadleček/Šárová", 2);

  return workbook;
}

test("unfinished staffing workbook imports as editable capacity plan", async () => {
  const workbook = await createLegacyStaffingWorkbook();
  const analysis = analyzeLegacyStaffingPlan(workbook);
  assert.ok(analysis);
  if (!analysis) throw new Error("Legacy staffing workbook was not recognized.");
  assert.equal(analysis.valid, true);
  assert.equal(analysis.summary.unassignedClassPeriods, 6);

  const kadlecek = analysis.plan.teachers.find(
    (teacher) => teacher.lastName === "Kadleček",
  );
  assert.ok(kadlecek);
  if (!kadlecek) throw new Error("Kadleček was not imported.");
  assert.equal(kadlecek.targetWeeklyLoad, 22);
  assert.equal(
    kadlecek.subjectLoads.find((item) => item.subjectCode === "INF")
      ?.weeklyPeriods,
    13,
  );
  assert.equal(
    kadlecek.subjectLoads.find((item) => item.subjectCode === "TV")
      ?.weeklyPeriods,
    4,
  );
  assert.equal(
    kadlecek.subjectLoads.find((item) => item.subjectCode === "REZERVA")
      ?.weeklyPeriods,
    5,
  );

  const missingGerman = analysis.allocationDraft?.rows.find(
    (row) =>
      row.classCode === "8.B" &&
      row.subjectCode === "JAZ2" &&
      row.group === "GROUP_1",
  );
  assert.deepEqual(missingGerman?.teacherIds, []);
});

test("curriculum workbook is authoritative and combines staffing draft safely", async () => {
  const staffingWorkbook = await createLegacyStaffingWorkbook();
  const staffing = analyzeLegacyStaffingPlan(staffingWorkbook);
  assert.ok(staffing?.allocationDraft);
  if (!staffing?.allocationDraft) {
    throw new Error("Staffing allocation draft was not created.");
  }

  const curriculum = await analyzeSchoolCurriculumWorkbook(
    await createCurriculumWorkbook(),
    staffing.plan,
    staffing.allocationDraft,
  );
  assert.ok(curriculum);
  if (!curriculum) throw new Error("Curriculum workbook was not recognized.");
  assert.equal(curriculum.valid, true);
  assert.equal(curriculum.summary.classes, 13);
  assert.equal(curriculum.summary.weeklyClassPeriods, 396);
  assert.equal(
    curriculum.issues.filter((item) => item.severity === "ERROR").length,
    0,
  );

  const regularCzech = curriculum.plan.rows.find(
    (row) => row.classCode === "6.A" && row.subjectCode === "CJ",
  );
  const sportsCzech = curriculum.plan.rows.find(
    (row) => row.classCode === "6.B" && row.subjectCode === "CJ",
  );
  const sportsTv = curriculum.plan.rows.find(
    (row) => row.classCode === "6.B" && row.subjectCode === "TV",
  );
  assert.equal(regularCzech?.weeklyPeriods, 5);
  assert.equal(sportsCzech?.weeklyPeriods, 4);
  assert.equal(sportsTv?.weeklyPeriods, 5);

  const language8B = curriculum.plan.rows.find(
    (row) => row.classCode === "8.B" && row.subjectCode === "JAZ2",
  );
  assert.equal(language8B?.organization, "SPLIT");
  assert.equal(language8B?.primaryTeacherId, "");
  assert.match(language8B?.secondaryTeacherId ?? "", /spankova/);

  const tv9A = curriculum.plan.rows.find(
    (row) => row.classCode === "9.A" && row.subjectCode === "TV",
  );
  const tv9C = curriculum.plan.rows.find(
    (row) => row.classCode === "9.C" && row.subjectCode === "TV",
  );
  assert.ok(tv9A && tv9C);
  if (!tv9A || !tv9C) {
    throw new Error("Both 9.A and 9.C TV rows are required.");
  }
  assert.notEqual(tv9A.id, tv9C.id);
  assert.deepEqual(tv9A.additionalClassCodes ?? [], []);
  assert.deepEqual(tv9C.additionalClassCodes ?? [], []);
  assert.equal(tv9A.organization, "SPLIT");
  assert.equal(tv9A.lessonShape, "DOUBLE");
  assert.match(tv9A.primaryTeacherId, /kadlecek/);
  assert.match(tv9A.secondaryTeacherId, /sarova/);
});
