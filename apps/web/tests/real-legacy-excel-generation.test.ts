import assert from "node:assert/strict";
import test from "node:test";

import { analyzeStaffingWorkbook } from "../lib/import/staffing-workbook-school-v2";
import type { LocalProject } from "../lib/local/api";
import { createDefaultSchoolCurriculum } from "../lib/local/school-default-data";
import { buildSchoolProjectForGeneration } from "../lib/local/school-project-generation";
import {
  createDefaultSchoolTeachingPlan,
  rowTeacherPeriods,
  validateTeachingPlan,
} from "../lib/local/teaching-plan-school-v3";

import { exactUploadedWorkbookBytes } from "../test-support/exact-uploaded-excel-fixture";

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

test("anonymized exact uploaded matrix becomes generation-ready with zero blockers", async () => {
  const analysis = await analyzeStaffingWorkbook(
    await exactUploadedWorkbookBytes(),
  );
  assert.equal(analysis.valid, true);
  assert.equal(analysis.plan.teachers.length, 33);
  assert.ok("allocationDraft" in analysis);
  if (!("allocationDraft" in analysis) || !analysis.allocationDraft) return;

  const teachingPlan = createDefaultSchoolTeachingPlan(
    createDefaultSchoolCurriculum(),
    analysis.plan,
    analysis.allocationDraft,
  );

  assert.deepEqual(
    validateTeachingPlan(teachingPlan, analysis.plan, analysis.allocationDraft),
    [],
  );

  for (const teacher of analysis.plan.teachers) {
    const occupiedTeachingPeriods = teachingPlan.rows.reduce(
      (total, row) => total + rowTeacherPeriods(row, teacher.id),
      0,
    );
    assert.ok(
      occupiedTeachingPeriods <= teacher.targetWeeklyLoad,
      `${teacher.lastName}: ${occupiedTeachingPeriods} > ${teacher.targetWeeklyLoad}`,
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
  assert.equal(generated.project.classes.length, 13);
});
