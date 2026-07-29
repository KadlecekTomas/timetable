import { prisma } from "@timetable/database";

import type { CanonicalSnapshot, SolverWeights } from "@/lib/domain/contracts";

const DEFAULT_WEIGHTS: SolverWeights = {
  teacher_gap: 20,
  class_gap: 25,
  discouraged_slot: 8,
  preferred_slot_bonus: 3,
  same_day_concentration: 6,
  late_period: 1,
};

function parsePeriodsPerDay(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return ["MON", "TUE", "WED", "THU", "FRI"]
      .map((day) => Number(record[day] ?? 0))
      .filter((periods) => periods > 0);
  }
  return [];
}

function parseWeights(value: unknown): SolverWeights {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_WEIGHTS;
  const record = value as Record<string, unknown>;
  return {
    teacher_gap: Number(record.teacher_gap ?? DEFAULT_WEIGHTS.teacher_gap),
    class_gap: Number(record.class_gap ?? DEFAULT_WEIGHTS.class_gap),
    discouraged_slot: Number(record.discouraged_slot ?? DEFAULT_WEIGHTS.discouraged_slot),
    preferred_slot_bonus: Number(
      record.preferred_slot_bonus ?? DEFAULT_WEIGHTS.preferred_slot_bonus,
    ),
    same_day_concentration: Number(
      record.same_day_concentration ?? DEFAULT_WEIGHTS.same_day_concentration,
    ),
    late_period: Number(record.late_period ?? DEFAULT_WEIGHTS.late_period),
  };
}

export async function loadCanonicalSnapshot(
  schoolYearId: string,
  options: {
    solverProfileId?: string | null;
    baseTimetableVersionId?: string | null;
    timeLimitSeconds?: number;
  } = {},
): Promise<CanonicalSnapshot> {
  const schoolYear = await prisma.schoolYear.findUnique({
    where: { id: schoolYearId },
    include: {
      teachers: { where: { isActive: true } },
      classes: { where: { isActive: true } },
      subjects: true,
      rooms: { where: { isActive: true } },
      assignments: {
        include: {
          fixedLessons: true,
          distributionRules: true,
        },
      },
      availability: true,
      solverProfiles: true,
    },
  });
  if (!schoolYear) {
    throw new Error("SCHOOL_YEAR_NOT_FOUND");
  }

  const profile = options.solverProfileId
    ? schoolYear.solverProfiles.find((item) => item.id === options.solverProfileId)
    : schoolYear.solverProfiles.find((item) => item.isDefault) ?? schoolYear.solverProfiles[0];

  const lockedLessons = options.baseTimetableVersionId
    ? await prisma.timetableLesson.findMany({
        where: {
          versionId: options.baseTimetableVersionId,
          isLocked: true,
          version: { schoolYearId },
        },
      })
    : [];

  return {
    contract_version: "1.0",
    school_year: {
      id: schoolYear.id,
      label: schoolYear.label,
      version: schoolYear.version,
    },
    periods_per_day: parsePeriodsPerDay(schoolYear.periodsPerDay),
    teachers: schoolYear.teachers.map((teacher) => ({
      id: teacher.id,
      code: teacher.code,
      first_name: teacher.firstName,
      last_name: teacher.lastName,
      target_weekly_load: teacher.targetWeeklyLoad,
      min_weekly_load: teacher.minWeeklyLoad,
      max_weekly_load: teacher.maxWeeklyLoad,
    })),
    classes: schoolYear.classes.map((schoolClass) => ({
      id: schoolClass.id,
      code: schoolClass.code,
      name: schoolClass.name,
      grade: schoolClass.grade,
    })),
    subjects: schoolYear.subjects.map((subject) => ({
      id: subject.id,
      code: subject.code,
      name: subject.name,
      color_token: subject.colorToken,
      default_room_type_id: subject.defaultRoomTypeId,
    })),
    rooms: schoolYear.rooms.map((room) => ({
      id: room.id,
      code: room.code,
      name: room.name,
      room_type_id: room.roomTypeId,
    })),
    assignments: schoolYear.assignments.map((assignment) => {
      const maxPerDay = assignment.distributionRules.find(
        (rule) => rule.type === "MAX_PER_DAY",
      );
      const minDayGap = assignment.distributionRules.find(
        (rule) => rule.type === "MIN_DAY_GAP",
      );
      return {
        id: assignment.id,
        code: assignment.assignmentCode,
        teacher_id: assignment.teacherId,
        class_id: assignment.classId,
        subject_id: assignment.subjectId,
        group: assignment.group,
        weekly_periods: assignment.weeklyPeriods,
        lesson_shape: assignment.lessonShape,
        double_periods_count: assignment.doublePeriodsCount,
        required_room_id: assignment.requiredRoomId,
        required_room_type_id: assignment.requiredRoomTypeId,
        max_per_day: maxPerDay?.value ?? null,
        min_day_gap: minDayGap?.value ?? null,
      };
    }),
    availability: schoolYear.availability.map((rule) => ({
      entity_type: rule.entityType,
      entity_id: rule.entityId,
      day: rule.dayOfWeek,
      period: rule.period,
      kind: rule.kind,
      weight: rule.weight,
      reason: rule.reason,
    })),
    fixed_lessons: schoolYear.assignments.flatMap((assignment) =>
      assignment.fixedLessons.map((fixedLesson) => ({
        assignment_id: assignment.id,
        block_index: fixedLesson.blockIndex,
        day: fixedLesson.dayOfWeek,
        period: fixedLesson.startPeriod,
        room_id: fixedLesson.roomId,
        locked: fixedLesson.locked,
      })),
    ),
    locked_lessons: lockedLessons.map((lesson) => ({
      assignment_id: lesson.teachingAssignmentId,
      block_index: Number(lesson.blockId.split(":").at(-1) ?? 0),
      day: lesson.dayOfWeek,
      period: lesson.startPeriod,
      room_id: lesson.roomId,
      locked: true,
    })),
    weights: parseWeights(profile?.weightsJson),
    random_seed: profile?.randomSeed ?? 1,
    time_limit_seconds: options.timeLimitSeconds ?? profile?.timeLimitSeconds ?? 180,
  };
}
