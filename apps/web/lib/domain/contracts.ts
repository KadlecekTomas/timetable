export const DAY_CODES = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
] as const;

export type TeachingGroup = "WHOLE" | "GROUP_1" | "GROUP_2" | "GROUP_3";
export type LessonShape = "SINGLE" | "DOUBLE" | "MIXED";
export type ClassProfile = "REGULAR" | "SPORTS" | "CUSTOM";
export type RotationPlacement = "ADJACENT" | "SAME_DAY" | "FLEXIBLE";
export type AvailabilityEntityType = "TEACHER" | "CLASS" | "ROOM";
export type AvailabilityKind = "UNAVAILABLE" | "PREFERRED" | "DISCOURAGED";

export interface SnapshotTeacher {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
  target_weekly_load: number;
  min_weekly_load?: number | null;
  max_weekly_load?: number | null;
}

export interface SnapshotClass {
  id: string;
  code: string;
  name: string;
  grade: number;
  profile: ClassProfile;
}

export interface SnapshotSubject {
  id: string;
  code: string;
  name: string;
  color_token?: string | null;
  default_room_type_id?: string | null;
}

export interface SnapshotRoom {
  id: string;
  code?: string;
  name?: string;
  room_type_id?: string | null;
}

export interface SnapshotAssignment {
  id: string;
  code?: string;
  teacher_id: string;
  class_id: string;
  additional_class_ids?: string[];
  subject_id: string;
  group: TeachingGroup;
  weekly_periods: number;
  lesson_shape: LessonShape;
  double_periods_count: number;
  required_room_id?: string | null;
  required_room_type_id?: string | null;
  max_per_day?: number | null;
  min_day_gap?: number | null;
  parallel_key?: string | null;
  room_share_key?: string | null;
  rotation_key?: string | null;
  rotation_leg?: number | null;
  rotation_placement?: RotationPlacement | null;
}

export interface SnapshotAvailabilityRule {
  entity_type: AvailabilityEntityType;
  entity_id: string;
  day: number;
  period: number;
  kind: AvailabilityKind;
  weight?: number | null;
  reason?: string | null;
}

export interface SnapshotFixedLesson {
  assignment_id: string;
  block_index: number;
  day: number;
  period: number;
  room_id?: string | null;
  locked?: boolean;
}

export interface SolverSubjectWindowRule {
  subject_codes: string[];
  periods: number[];
  days?: number[] | null;
}

export interface SolverSubjectDailyLimit {
  subject_codes: string[];
  max_periods_per_day: number;
}

export interface SolverClassDayPolicy {
  require_first_period: boolean;
  allowed_afternoon_patterns: number[][];
  latest_period_by_day: Array<number | null>;
  /** Null disables the hard balance bound; 1 means daily loads differ by at most one lesson. */
  max_daily_load_spread?: number | null;
}

export interface SolverTeacherAfternoonBreakPolicy {
  enabled: boolean;
  afternoon_start_period: number;
  break_periods: number[];
  minimum_free_periods: number;
}

export interface SolverQualityPolicy {
  class_daily_balance_weight: number;
  class_afternoon_weight: number;
  afternoon_day_weights: number[];
  subject_late_weights: Record<string, number>;
  subject_afternoon_bonuses: Record<string, number>;
}

export interface SolverPolicy {
  version: "1";
  forbidden_subject_windows: SolverSubjectWindowRule[];
  subject_daily_limits: SolverSubjectDailyLimit[];
  class_day: SolverClassDayPolicy;
  teacher_afternoon_break: SolverTeacherAfternoonBreakPolicy;
  quality: SolverQualityPolicy;
}

export interface SolverWeights {
  teacher_gap: number;
  class_gap: number;
  discouraged_slot: number;
  preferred_slot_bonus: number;
  same_day_concentration: number;
  late_period: number;
  rotation_spread: number;
}

export interface CanonicalSnapshot {
  contract_version: "1.0";
  school_year: {
    id: string;
    label: string;
    version: number;
  };
  periods_per_day: number[];
  teachers: SnapshotTeacher[];
  classes: SnapshotClass[];
  subjects: SnapshotSubject[];
  rooms: SnapshotRoom[];
  assignments: SnapshotAssignment[];
  availability: SnapshotAvailabilityRule[];
  fixed_lessons: SnapshotFixedLesson[];
  locked_lessons: SnapshotFixedLesson[];
  policy?: SolverPolicy | null;
  weights: SolverWeights;
  random_seed: number;
  time_limit_seconds: number;
}

export interface ScheduledLesson {
  id?: string;
  block_id: string;
  assignment_id: string;
  teacher_id: string;
  class_id: string;
  additional_class_ids?: string[];
  subject_id: string;
  group: TeachingGroup;
  room_id: string | null;
  day: number;
  period: number;
  duration: number;
  locked: boolean;
  origin: "SOLVER" | "MANUAL" | "FIXED_RULE";
  manually_changed?: boolean;
}

export interface ValidationIssue {
  code: string;
  message: string;
  entity_ids: string[];
  day?: number;
  period?: number;
  details?: Record<string, unknown>;
}

export interface ScoreIncident {
  code: string;
  category: ScoreCategory;
  points: number;
  message: string;
  entity_ids: string[];
  day?: number;
  period?: number;
  suggestion?: string;
}

export type ScoreCategory =
  | "class_compactness"
  | "teacher_compactness"
  | "distribution"
  | "teacher_preferences"
  | "day_edges"
  | "stability_and_rooms";

export interface ScoreReport {
  valid: boolean;
  total: number | null;
  label: string | null;
  categories: Record<ScoreCategory, number> | Record<string, never>;
  incidents: ScoreIncident[];
  hard_issues: ValidationIssue[];
}

export interface ReadinessIssue {
  code: string;
  severity: "ERROR" | "WARNING";
  message: string;
  entity_ids: string[];
  suggestion?: string;
}

export interface ReadinessReport {
  ready: boolean;
  blockers: ReadinessIssue[];
  warnings: ReadinessIssue[];
  summary: {
    teachers: number;
    classes: number;
    subjects: number;
    rooms: number;
    assignments: number;
    weekly_periods: number;
  };
}

export interface TimetableMove {
  lesson_id: string;
  target_day: number;
  target_period: number;
  target_room_id: string | null;
  expected_version: number;
}

export interface MoveValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  preview: ScheduledLesson[];
}

export function assignmentBlockDurations(
  assignment: SnapshotAssignment,
): number[] {
  if (assignment.lesson_shape === "SINGLE") {
    return Array.from({ length: assignment.weekly_periods }, () => 1);
  }
  if (assignment.lesson_shape === "DOUBLE") {
    return Array.from(
      { length: Math.floor(assignment.weekly_periods / 2) },
      () => 2,
    );
  }
  const singleCount =
    assignment.weekly_periods - assignment.double_periods_count * 2;
  return [
    ...Array.from({ length: assignment.double_periods_count }, () => 2),
    ...Array.from({ length: singleCount }, () => 1),
  ];
}
