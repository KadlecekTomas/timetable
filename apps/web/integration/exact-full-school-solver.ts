import assert from "node:assert/strict";

import type { CanonicalSnapshot, ScheduledLesson } from "../lib/domain/contracts";
import { validateSchedule } from "../lib/domain/validation";
import { analyzeStaffingWorkbook } from "../lib/import/staffing-workbook-school-v2";
import type { LocalProject } from "../lib/local/api";
import {
  physicalEducationExternalAvailability,
  schoolRecommendedPhysicalEducationExternalOccupancySlots,
} from "../lib/local/physical-education-external-occupancy";
import { createDefaultSchoolCurriculum } from "../lib/local/school-default-data";
import { buildSchoolProjectForGeneration } from "../lib/local/school-project-generation";
import { staffingExactUnavailableAvailability } from "../lib/local/staffing-exact-availability";
import { createDefaultSchoolTeachingPlan } from "../lib/local/teaching-plan-school-v3";
import { exactUploadedWorkbookBytes } from "../test-support/exact-uploaded-excel-fixture";

const weights = {
  teacher_gap: 20,
  class_gap: 25,
  discouraged_slot: 8,
  preferred_slot_bonus: 3,
  same_day_concentration: 6,
  late_period: 1,
  rotation_spread: 75,
};

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

function snapshot(project: LocalProject): CanonicalSnapshot {
  return {
    contract_version: "1.0",
    school_year: {
      id: project.id,
      label: project.label,
      version: project.version,
    },
    periods_per_day: project.periodsPerDay,
    teachers: project.teachers.map((teacher) => ({
      id: teacher.id,
      code: teacher.code,
      first_name: teacher.firstName,
      last_name: teacher.lastName,
      target_weekly_load: teacher.targetWeeklyLoad,
      min_weekly_load: teacher.minWeeklyLoad,
      max_weekly_load: teacher.maxWeeklyLoad,
    })),
    classes: project.classes.map((schoolClass) => ({
      id: schoolClass.id,
      code: schoolClass.code,
      name: schoolClass.name,
      grade: schoolClass.grade,
      profile: schoolClass.profile,
    })),
    subjects: project.subjects.map((subject) => ({
      id: subject.id,
      code: subject.code,
      name: subject.name,
      color_token: subject.colorToken,
      default_room_type_id: subject.defaultRoomTypeId,
    })),
    rooms: project.rooms.map((room) => ({
      id: room.id,
      code: room.code,
      name: room.name,
      room_type_id: room.roomTypeId,
    })),
    assignments: project.assignments.map((assignment) => ({
      id: assignment.id,
      code: assignment.assignmentCode,
      teacher_id: assignment.teacherId,
      class_id: assignment.classId,
      additional_class_ids: assignment.additionalClassIds,
      subject_id: assignment.subjectId,
      group: assignment.group,
      weekly_periods: assignment.weeklyPeriods,
      lesson_shape: assignment.lessonShape,
      double_periods_count: assignment.doublePeriodsCount,
      required_room_id: assignment.requiredRoomId,
      required_room_type_id: assignment.requiredRoomTypeId,
      max_per_day: assignment.maxPerDay,
      min_day_gap: assignment.minDayGap,
      parallel_key: assignment.parallelKey,
      room_share_key: assignment.roomShareKey ?? null,
      rotation_key: assignment.rotationKey,
      rotation_leg: assignment.rotationLeg,
      rotation_placement: assignment.rotationPlacement,
    })),
    availability: project.availability.map((rule) => ({
      entity_type: rule.entityType,
      entity_id: rule.entityId,
      day: rule.dayOfWeek,
      period: rule.period,
      kind: rule.kind,
      weight: rule.weight,
      reason: rule.reason,
    })),
    fixed_lessons: project.fixedLessons.map((fixedLesson) => ({
      assignment_id: fixedLesson.assignmentId,
      block_index: fixedLesson.blockIndex,
      day: fixedLesson.dayOfWeek,
      period: fixedLesson.startPeriod,
      room_id: fixedLesson.roomId,
      locked: fixedLesson.locked,
    })),
    locked_lessons: [],
    weights,
    random_seed: 1,
    time_limit_seconds: 600,
  };
}

async function main() {
  const analysis = await analyzeStaffingWorkbook(
    await exactUploadedWorkbookBytes(),
  );
  assert.equal(analysis.valid, true);
  assert.ok("allocationDraft" in analysis && analysis.allocationDraft);

  const teachingPlan = createDefaultSchoolTeachingPlan(
    createDefaultSchoolCurriculum(),
    analysis.plan,
    analysis.allocationDraft,
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

  const request = snapshot(generated.project);
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
    `Solver returned HTTP ${response.status}: ${responseText}`,
  );

  const result = JSON.parse(responseText) as {
    status: string;
    lessons: ScheduledLesson[];
  };
  assert.ok(["FEASIBLE", "OPTIMAL"].includes(result.status), result.status);
  assert.deepEqual(validateSchedule(request, result.lessons), []);
  assert.ok(result.lessons.length > 400, `Only ${result.lessons.length} lessons`);

  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `Exact full-school solver regression passed: ${result.status}, ${result.lessons.length} lessons, ${elapsedSeconds}s.`,
  );
}

await main();
