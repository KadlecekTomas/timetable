import assert from "node:assert/strict";

import type {
  CanonicalSnapshot,
  ScheduledLesson,
} from "../lib/domain/contracts";
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

function normalizedCode(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function assertSchoolSchedulingInvariants(
  project: LocalProject,
  lessons: ScheduledLesson[],
  expectedEightBGroupCount: number,
) {
  const subjectCodeById = new Map(
    project.subjects.map((subject) => [subject.id, subject.code]),
  );
  const classCodeById = new Map(
    project.classes.map((schoolClass) => [
      schoolClass.id,
      normalizedCode(schoolClass.code),
    ]),
  );
  const assignmentsById = new Map(
    project.assignments.map((assignment) => [assignment.id, assignment]),
  );
  const occupancyByTeacherDay = new Map<string, Set<number>>();
  const historyByClassDay = new Map<string, Set<number>>();
  const lessonsByAssignment = new Map<string, ScheduledLesson[]>();

  for (const lesson of lessons) {
    const teacherDayKey = `${lesson.teacher_id}:${lesson.day}`;
    const teacherPeriods =
      occupancyByTeacherDay.get(teacherDayKey) ?? new Set<number>();
    for (let offset = 0; offset < lesson.duration; offset += 1) {
      const period = lesson.period + offset;
      teacherPeriods.add(period);
      assert.ok(
        lesson.day !== 4 || period < 6,
        `Friday afternoon lesson: ${lesson.block_id} at period ${period}`,
      );
    }
    occupancyByTeacherDay.set(teacherDayKey, teacherPeriods);

    if (subjectCodeById.get(lesson.subject_id) === "DEJ") {
      for (const classId of [
        lesson.class_id,
        ...(lesson.additional_class_ids ?? []),
      ]) {
        const classDayKey = `${classId}:${lesson.day}`;
        const historyPeriods =
          historyByClassDay.get(classDayKey) ?? new Set<number>();
        for (let offset = 0; offset < lesson.duration; offset += 1) {
          historyPeriods.add(lesson.period + offset);
        }
        historyByClassDay.set(classDayKey, historyPeriods);
      }
    }

    lessonsByAssignment.set(lesson.assignment_id, [
      ...(lessonsByAssignment.get(lesson.assignment_id) ?? []),
      lesson,
    ]);
  }

  for (const [teacherDay, periods] of occupancyByTeacherDay) {
    assert.equal(
      [3, 4, 5].every((period) => periods.has(period)),
      false,
      `${teacherDay} teaches periods 4, 5, and 6 without a break`,
    );
  }
  for (const [classDay, periods] of historyByClassDay) {
    for (const period of periods) {
      assert.equal(
        periods.has(period + 1),
        false,
        `${classDay} has consecutive DEJ periods ${period} and ${period + 1}`,
      );
    }
  }

  const tvAssignments = project.assignments.filter(
    (assignment) => subjectCodeById.get(assignment.subjectId) === "TV",
  );
  for (const assignment of tvAssignments) {
    const dailyPeriods = new Map<number, number>();
    for (const lesson of lessonsByAssignment.get(assignment.id) ?? []) {
      dailyPeriods.set(
        lesson.day,
        (dailyPeriods.get(lesson.day) ?? 0) + lesson.duration,
      );
    }
    const distribution = [...dailyPeriods.values()].sort(
      (left, right) => right - left,
    );
    assert.ok(
      distribution.every((periodCount) => periodCount <= 2),
      `${assignment.assignmentCode} TV distribution: ${distribution.join("+")}`,
    );
    if (assignment.weeklyPeriods === 4) {
      assert.deepEqual(distribution, [2, 2], assignment.assignmentCode);
    }
    if (assignment.weeklyPeriods === 5) {
      assert.deepEqual(distribution, [2, 2, 1], assignment.assignmentCode);
    }
  }

  const tvAssignmentsForClass = (classCode: string) =>
    tvAssignments.filter((assignment) =>
      [assignment.classId, ...assignment.additionalClassIds].some(
        (classId) => classCodeById.get(classId) === classCode,
      ),
    );
  const prikrylova = project.teachers.find(
    (teacher) => normalizedCode(teacher.lastName) === "PRIKRYLOVA",
  );
  for (const classCode of ["9A", "9C"]) {
    const classAssignments = tvAssignmentsForClass(classCode);
    assert.ok(classAssignments.length > 0, `${classCode} has no TV assignment`);
    assert.ok(
      classAssignments.every((assignment) => assignment.group === "WHOLE"),
      `${classCode} TV must be whole-class`,
    );
    assert.equal(
      new Set(classAssignments.map((assignment) => assignment.teacherId)).size,
      1,
      `${classCode} TV must have one teacher`,
    );
    if (prikrylova) {
      assert.ok(
        classAssignments.every(
          (assignment) => assignment.teacherId === prikrylova.id,
        ),
        `${classCode} TV must be taught by Přikrylová`,
      );
    }
  }
  for (const classCode of ["8A", "8B", "8C", "9B"]) {
    const classAssignments = tvAssignmentsForClass(classCode);
    assert.ok(classAssignments.length > 0, `${classCode} has no TV assignment`);
    assert.ok(
      classAssignments.every((assignment) => assignment.group !== "WHOLE"),
      `${classCode} TV must stay split`,
    );
  }
  assert.equal(
    new Set(tvAssignmentsForClass("8B").map((assignment) => assignment.group))
      .size,
    expectedEightBGroupCount,
    "8.B TV group count changed during project generation or solving",
  );

  for (const lesson of lessons) {
    assert.ok(
      assignmentsById.has(lesson.assignment_id),
      `Unknown assignment ${lesson.assignment_id}`,
    );
  }
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
  const expectedEightBGroupCount =
    teachingPlan.rows.find(
      (row) =>
        normalizedCode(row.classCode) === "8B" && row.subjectCode === "TV",
    )?.splitGroupCount ?? 2;
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
  assertSchoolSchedulingInvariants(
    generated.project,
    result.lessons,
    expectedEightBGroupCount,
  );
  assert.ok(
    result.lessons.length > 400,
    `Only ${result.lessons.length} lessons`,
  );

  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `Exact full-school solver regression passed: ${result.status}, ${result.lessons.length} lessons, ${elapsedSeconds}s.`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
