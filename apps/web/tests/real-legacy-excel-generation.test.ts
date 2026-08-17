import assert from "node:assert/strict";
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

function sourceRows(
  classCode: string,
): Array<[string, string, string | number]> {
  const rows: Array<[string, string, string | number]> = [
    ["Čj", `Cj${classCode}`, "4+1"],
    ["M", `M${classCode}`, "4+1"],
  ];
  if (["7.A", "7.C"].includes(classCode)) {
    rows.push(["PkČj", "ExtraCj", 1], ["Přpk", "Science", 1]);
  }
  if (["8.A", "8.B", "8.C"].includes(classCode)) {
    rows.push(["Německý jazyk", "LangA", 3], ["Španělský jazyk", "LangB", 3]);
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

  const langA = analysis.plan.teachers.find(
    (teacher) => teacher.lastName === "LangA",
  );
  const langB = analysis.plan.teachers.find(
    (teacher) => teacher.lastName === "LangB",
  );
  assert.ok(langA);
  assert.ok(langB);
  assert.equal(
    langA.subjectLoads.find((item) => item.subjectCode === "JAZ2")
      ?.weeklyPeriods,
    6,
  );
  assert.equal(
    langB.subjectLoads.find((item) => item.subjectCode === "JAZ2")
      ?.weeklyPeriods,
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
