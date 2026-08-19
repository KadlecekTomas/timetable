import assert from "node:assert/strict";

import type { ScheduledLesson } from "../lib/domain/contracts";
import { validateSchedule } from "../lib/domain/validation-policy";
import { analyzeStaffingWorkbook } from "../lib/import/staffing-workbook-school-v2";
import type { LocalProject } from "../lib/local/api";
import {
  physicalEducationExternalAvailability,
  schoolRecommendedPhysicalEducationExternalOccupancySlots,
} from "../lib/local/physical-education-external-occupancy";
import { createDefaultSchoolCurriculum } from "../lib/local/school-default-data";
import { buildSchoolProjectForGeneration } from "../lib/local/school-project-generation";
import { CURRENT_SCHOOL_SOLVER_POLICY } from "../lib/local/school-solver-policy";
import { staffingExactUnavailableAvailability } from "../lib/local/staffing-exact-availability";
import { buildSolverSnapshot } from "../lib/local/solver-snapshot";
import { createDefaultSchoolTeachingPlan } from "../lib/local/teaching-plan-school-v3";
import { currentSchoolV8WorkbookBytes } from "../test-support/current-school-v8-workbook-fixture";

function emptyProject(): LocalProject {
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

function classDailyLoads(
  project: LocalProject,
  lessons: ScheduledLesson[],
  classCode: string,
): number[] {
  const classId = project.classes.find((item) => item.code === classCode)?.id;
  assert.ok(classId, `Missing class ${classCode}`);
  return project.periodsPerDay.map((_periods, day) => {
    const occupied = new Set<number>();
    for (const lesson of lessons) {
      if (lesson.day !== day) continue;
      if (
        lesson.class_id !== classId &&
        !(lesson.additional_class_ids ?? []).includes(classId)
      ) {
        continue;
      }
      for (
        let period = lesson.period;
        period < lesson.period + lesson.duration;
        period += 1
      ) {
        occupied.add(period);
      }
    }
    return occupied.size;
  });
}

function fixedCountForTeacher(project: LocalProject, surname: string): number {
  const teacherId = project.teachers.find(
    (teacher) => teacher.lastName === surname,
  )?.id;
  assert.ok(teacherId, `Missing teacher ${surname}`);
  const assignmentIds = new Set(
    project.assignments
      .filter((assignment) => assignment.teacherId === teacherId)
      .map((assignment) => assignment.id),
  );
  return project.fixedLessons.filter((lesson) =>
    assignmentIds.has(lesson.assignmentId),
  ).length;
}

async function main() {
  const analysis = await analyzeStaffingWorkbook(
    await currentSchoolV8WorkbookBytes(),
  );
  assert.equal(analysis.valid, true);
  assert.ok("allocationDraft" in analysis && analysis.allocationDraft);

  const teachingPlan = createDefaultSchoolTeachingPlan(
    createDefaultSchoolCurriculum(),
    analysis.plan,
    analysis.allocationDraft,
  );
  assert.equal(
    teachingPlan.rows.find(
      (row) => row.classCode === "8.A" && row.subjectCode === "VV",
    )?.weeklyPeriods,
    1,
    "8.A VV must come from the new one-period allocation",
  );
  assert.equal(
    teachingPlan.rows.find(
      (row) => row.classCode === "8.C" && row.subjectCode === "VV",
    )?.weeklyPeriods,
    1,
    "8.C VV must come from the new one-period allocation",
  );

  const generated = buildSchoolProjectForGeneration({
    existingProject: emptyProject(),
    staffingPlan: analysis.plan,
    teachingPlan,
    forceReplaceGeneratedData: false,
  });
  assert.deepEqual(generated.blockers, []);

  generated.project.availability.push(
    ...staffingExactUnavailableAvailability(generated.project, analysis.plan),
  );
  generated.project.availability.push(
    ...physicalEducationExternalAvailability(
      generated.project,
      schoolRecommendedPhysicalEducationExternalOccupancySlots(),
    ),
  );

  assert.equal(
    fixedCountForTeacher(generated.project, "Kadleček"),
    13,
    "Kadleček must keep all 13 accepted fixed INF slots",
  );
  assert.equal(
    fixedCountForTeacher(generated.project, "Špánková"),
    12,
    "Špánková must keep all 12 accepted fixed JAZ2 slots",
  );

  const request = buildSolverSnapshot({
    project: generated.project,
    policy: CURRENT_SCHOOL_SOLVER_POLICY,
    timeLimitSeconds: 600,
    randomSeed: 1,
  });
  assert.equal(request.policy?.version, "1");

  const solverUrl = process.env.SOLVER_URL ?? "http://127.0.0.1:8000";
  const startedAt = Date.now();
  const response = await fetch(`${solverUrl}/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(660_000),
  });
  const responseText = await response.text();
  assert.equal(
    response.ok,
    true,
    `Policy-aware solver returned HTTP ${response.status}: ${responseText}`,
  );

  const result = JSON.parse(responseText) as {
    status: string;
    lessons: ScheduledLesson[];
  };
  assert.ok(["FEASIBLE", "OPTIMAL"].includes(result.status), result.status);
  assert.deepEqual(validateSchedule(request, result.lessons), []);
  assert.ok(
    result.lessons.length > 400,
    `Only ${result.lessons.length} lessons`,
  );

  assert.deepEqual(
    classDailyLoads(generated.project, result.lessons, "8.A"),
    [6, 7, 7, 7, 6],
    "8.A must reproduce the accepted V8 day balance",
  );
  assert.deepEqual(
    classDailyLoads(generated.project, result.lessons, "8.C"),
    [6, 7, 7, 7, 6],
    "8.C must reproduce the accepted V8 day balance",
  );

  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `Exact current-school V8 policy regression passed: ${result.status}, ${result.lessons.length} lessons, ${elapsedSeconds}s.`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
