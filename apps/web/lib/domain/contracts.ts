export const DAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

export type TeachingGroup = "WHOLE" | "GROUP_1" | "GROUP_2";
export type LessonShape = "SINGLE" | "DOUBLE" | "MIXED";
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
  subject_id: string;
  group: TeachingGroup;
  weekly_periods: number;
  lesson_shape: LessonShape;
  double_periods_count: number;
  required_room_id?: string | null;
  required_room_type_id?: string | null;
  max_per_day?: number | null;
  min_day_gap?: number | null;
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

export interface SolverWeights {
  teacher_gap: number;
  class_gap: number;
  discouraged_slot: number;
  preferred_slot_bonus: number;
  same_day_concentration: number;
  late_period: number;
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

export function assignmentBlockDurations(assignment: SnapshotAssignment): number[] {
  if (assignment.lesson_shape === "SINGLE") {
    return Array.from({ length: assignment.weekly_periods }, () => 1);
  }
  if (assignment.lesson_shape === "DOUBLE") {
    return Array.from({ length: Math.floor(assignment.weekly_periods / 2) }, () => 2);
  }
  const singleCount = assignment.weekly_periods - assignment.double_periods_count * 2;
  return [
    ...Array.from({ length: assignment.double_periods_count }, () => 2),
    ...Array.from({ length: singleCount }, () => 1),
  ];
}
