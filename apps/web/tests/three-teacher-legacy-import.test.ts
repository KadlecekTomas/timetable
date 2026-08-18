import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import { analyzeLegacyStaffingPlan } from "../lib/import/legacy-staffing-plan";
import type { LocalProject } from "../lib/local/api";
import { buildSchoolProjectForGeneration } from "../lib/local/school-project-generation";
import { createTeachingPlanFromAllocationDraft } from "../lib/local/teaching-plan-from-allocation-draft";
import {
  SCHOOL_CLASS_CODES,
  createTeachingPlanClass,
} from "../lib/local/teaching-plan-school";
import { enforceMandatorySchoolSplits } from "../lib/local/teaching-plan-school-v3";

function emptyProject(): LocalProject {
  return {
    schemaVersion: 1,
    id: "local-school-year",
    schoolName: "Test",
    label: "2026/2027",
    status: "ACTIVE",
    periodsPerDay: [8, 8, 8, 8, 7],
    version: 1,
    updatedAt: "test",
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

function writeClass(
  worksheet: ExcelJS.Worksheet,
  row: number,
  classCode: string,
  teachers: string,
): void {
  worksheet.getCell(row, 1).value = classCode;
  worksheet.getCell(row, 2).value = "Třídní Učitel";
  worksheet.getCell(row + 1, 1).value = "Předměty";
  worksheet.getCell(row + 1, 2).value = "Učitel/učitelka";
  worksheet.getCell(row + 1, 3).value = "Časová dotace";
  worksheet.getCell(row + 2, 1).value = "Tv";
  worksheet.getCell(row + 2, 2).value = teachers;
  worksheet.getCell(row + 2, 3).value = 5;
}

function teacherTvHours(
  analysis: NonNullable<ReturnType<typeof analyzeLegacyStaffingPlan>>,
  lastName: string,
): number {
  const teacher = analysis.plan.teachers.find(
    (item) => item.lastName === lastName,
  );
  assert.ok(teacher, `Missing teacher ${lastName}`);
  return (
    teacher.subjectLoads.find((item) => item.subjectCode === "TV")
      ?.weeklyPeriods ?? 0
  );
}

test("legacy TV keeps a third parallel teacher through import, plan and solver", () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Úvazky 20262027");
  writeClass(worksheet, 2, "6.B", "Alpha/Beta/Gamma");
  writeClass(worksheet, 8, "8.B", "Beta/Delta/Epsilon");

  const analysis = analyzeLegacyStaffingPlan(workbook);
  assert.ok(analysis?.allocationDraft);
  if (!analysis?.allocationDraft)
    throw new Error("Legacy draft was not created.");

  assert.equal(teacherTvHours(analysis, "Gamma"), 5);
  assert.equal(teacherTvHours(analysis, "Epsilon"), 5);
  assert.equal(teacherTvHours(analysis, "Beta"), 10);

  const tv6B = analysis.allocationDraft.rows.find(
    (row) => row.classCode === "6.B" && row.subjectCode === "TV",
  );
  const tv8B = analysis.allocationDraft.rows.find(
    (row) => row.classCode === "8.B" && row.subjectCode === "TV",
  );
  assert.equal(tv6B?.teacherIds.length, 3);
  assert.equal(tv8B?.teacherIds.length, 3);

  const draftPlan = createTeachingPlanFromAllocationDraft(
    analysis.allocationDraft,
  );
  draftPlan.classes = SCHOOL_CLASS_CODES.map((code) =>
    createTeachingPlanClass(code),
  );
  const plan = enforceMandatorySchoolSplits(draftPlan);
  const planned6B = plan.rows.find(
    (row) => row.classCode === "6.B" && row.subjectCode === "TV",
  );
  assert.equal(planned6B?.organization, "SPLIT");
  assert.equal(planned6B?.splitGroupCount, 3);
  assert.ok(planned6B?.tertiaryTeacherId);

  const generated = buildSchoolProjectForGeneration({
    existingProject: emptyProject(),
    staffingPlan: analysis.plan,
    teachingPlan: plan,
    forceReplaceGeneratedData: false,
  });
  assert.deepEqual(generated.blockers, []);

  const class6B = generated.project.classes.find((item) => item.code === "6.B");
  assert.ok(class6B);
  const assignments6B = generated.project.assignments.filter(
    (item) => item.classId === class6B.id,
  );
  assert.equal(assignments6B.length, 3);
  assert.deepEqual(assignments6B.map((item) => item.group).sort(), [
    "GROUP_1",
    "GROUP_2",
    "GROUP_3",
  ]);
  assert.equal(new Set(assignments6B.map((item) => item.parallelKey)).size, 1);
});
