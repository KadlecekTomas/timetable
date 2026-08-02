export const IMPORT_TEMPLATE_VERSION = "1.0.0" as const;

export type ImportSeverity = "ERROR" | "WARNING";

export interface ImportIssueDraft {
  severity: ImportSeverity;
  sheet: string;
  row: number | null;
  column: string | null;
  code: string;
  message: string;
  rawValue: string | null;
  suggestion: string | null;
}

export interface ImportSettingsRow {
  school_year: string;
  monday_periods: number;
  tuesday_periods: number;
  wednesday_periods: number;
  thursday_periods: number;
  friday_periods: number;
}

export interface ImportTeacherRow {
  teacher_code: string;
  first_name: string;
  last_name: string;
  target_weekly_load: number;
  min_weekly_load: number | null;
  max_weekly_load: number | null;
  subjects: string[];
  classes: string[];
}

export interface ImportClassRow {
  class_code: string;
  grade: number;
  class_name: string;
}

export interface ImportSubjectRow {
  subject_code: string;
  subject_name: string;
  default_room_type: string | null;
}

export interface ImportRoomRow {
  room_code: string;
  room_name: string;
  room_type: string | null;
  capacity: number | null;
}

export interface ImportAssignmentRow {
  assignment_code: string;
  class_code: string;
  additional_class_codes: string[];
  subject_code: string;
  teacher_code: string;
  group: "WHOLE" | "GROUP_1" | "GROUP_2";
  weekly_periods: number;
  lesson_shape: "SINGLE" | "DOUBLE" | "MIXED";
  double_periods_count: number;
  required_room: string | null;
  required_room_type: string | null;
  max_per_day: number | null;
  min_day_gap: number | null;
}

export interface ImportAvailabilityRow {
  entity_type: "TEACHER" | "CLASS" | "ROOM";
  entity_code: string;
  day: "MON" | "TUE" | "WED" | "THU" | "FRI";
  period: number;
  kind: "UNAVAILABLE" | "PREFERRED" | "DISCOURAGED";
  weight: number | null;
  reason: string | null;
}

export interface ImportFixedLessonRow {
  assignment_code: string;
  block_index: number;
  day: "MON" | "TUE" | "WED" | "THU" | "FRI";
  start_period: number;
  duration: number;
  room_code: string | null;
  locked: boolean;
}

export interface ImportPayload {
  templateVersion: typeof IMPORT_TEMPLATE_VERSION;
  settings: ImportSettingsRow;
  teachers: ImportTeacherRow[];
  classes: ImportClassRow[];
  subjects: ImportSubjectRow[];
  rooms: ImportRoomRow[];
  assignments: ImportAssignmentRow[];
  availability: ImportAvailabilityRow[];
  fixedLessons: ImportFixedLessonRow[];
}

export interface ImportSummary {
  teachers: number;
  classes: number;
  subjects: number;
  rooms: number;
  assignments: number;
  availabilityRules: number;
  fixedLessons: number;
  errors: number;
  warnings: number;
}

export interface ImportAnalysis {
  templateVersion: string;
  status: "READY" | "VALIDATION_FAILED";
  payload: ImportPayload | null;
  issues: ImportIssueDraft[];
  summary: ImportSummary;
}
