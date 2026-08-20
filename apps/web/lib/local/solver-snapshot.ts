import type {
  CanonicalSnapshot,
  SolverPolicy,
  SolverWeights,
} from "@/lib/domain/contracts";
import type { LocalProject } from "./api";

const DEFAULT_SOLVER_WEIGHTS: SolverWeights = {
  teacher_gap: 1_000,
  class_gap: 2_000,
  discouraged_slot: 25,
  preferred_slot_bonus: 3,
  same_day_concentration: 50,
  late_period: 10,
  rotation_spread: 75,
};

export function buildSolverSnapshot({
  project,
  policy,
  timeLimitSeconds,
  randomSeed,
  weights = DEFAULT_SOLVER_WEIGHTS,
}: {
  project: LocalProject;
  policy: SolverPolicy | null;
  timeLimitSeconds: number;
  randomSeed: number;
  weights?: SolverWeights;
}): CanonicalSnapshot {
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
      code: room.code ?? undefined,
      name: room.name ?? undefined,
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
    policy,
    weights,
    random_seed: randomSeed,
    time_limit_seconds: timeLimitSeconds,
  };
}
