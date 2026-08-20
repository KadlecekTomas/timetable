import type {
  LocalAssignment,
  LocalAvailability,
  LocalProject,
  LocalSubject,
} from "./api";
import type { StaffingPlan } from "./staffing-plan";

type LocalFixedLesson = LocalProject["fixedLessons"][number];

const SPANKOVA_SURNAME = "spankova";
const KADLECEK_SURNAME = "kadlecek";
const INDRAKOVA_SURNAME = "indrakova";
const SECOND_FOREIGN_LANGUAGE_CODE = "JAZ2";
const INFORMATICS_CODE = "INF";
const HEALTH_EDUCATION_CODE = "VZ";
const PHYSICAL_EDUCATION_CODE = "TV";

interface FixedAssignmentSlot {
  classCode: string;
  dayOfWeek: number;
  startPeriod: number;
}

const SPANKOVA_CLASS_SLOTS: readonly FixedAssignmentSlot[] = [
  { classCode: "8.B", dayOfWeek: 1, startPeriod: 1 },
  { classCode: "8.C", dayOfWeek: 1, startPeriod: 2 },
  { classCode: "8.A", dayOfWeek: 1, startPeriod: 3 },
  { classCode: "9.B", dayOfWeek: 1, startPeriod: 4 },
  { classCode: "8.B", dayOfWeek: 2, startPeriod: 1 },
  { classCode: "8.A", dayOfWeek: 2, startPeriod: 2 },
  { classCode: "8.C", dayOfWeek: 2, startPeriod: 3 },
  { classCode: "9.B", dayOfWeek: 2, startPeriod: 4 },
  { classCode: "8.B", dayOfWeek: 3, startPeriod: 1 },
  { classCode: "8.C", dayOfWeek: 3, startPeriod: 2 },
  { classCode: "8.A", dayOfWeek: 3, startPeriod: 3 },
  { classCode: "9.B", dayOfWeek: 3, startPeriod: 4 },
] as const;

const KADLECEK_INF_SLOTS: readonly FixedAssignmentSlot[] = [
  { classCode: "8.C", dayOfWeek: 1, startPeriod: 0 },
  { classCode: "7.C", dayOfWeek: 1, startPeriod: 1 },
  { classCode: "9.A", dayOfWeek: 1, startPeriod: 2 },
  { classCode: "6.B", dayOfWeek: 1, startPeriod: 3 },
  { classCode: "7.B", dayOfWeek: 1, startPeriod: 4 },
  { classCode: "9.C", dayOfWeek: 1, startPeriod: 5 },
  { classCode: "9.B", dayOfWeek: 2, startPeriod: 0 },
  { classCode: "7.A", dayOfWeek: 2, startPeriod: 1 },
  { classCode: "6.C", dayOfWeek: 2, startPeriod: 2 },
  { classCode: "6.A", dayOfWeek: 2, startPeriod: 3 },
  { classCode: "8.A", dayOfWeek: 2, startPeriod: 4 },
  { classCode: "6.D", dayOfWeek: 2, startPeriod: 5 },
  { classCode: "8.B", dayOfWeek: 3, startPeriod: 0 },
] as const;

const INDRAKOVA_HEALTH_SLOTS: readonly FixedAssignmentSlot[] = [
  { classCode: "7.A", dayOfWeek: 0, startPeriod: 4 },
] as const;

function normalizedPersonToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLocaleLowerCase("cs-CZ");
}

function subjectCodeById(subjects: LocalSubject[]): Map<string, string> {
  return new Map(subjects.map((subject) => [subject.id, subject.code]));
}

function classCodeFromId(classId: string): string {
  return classId.replace(/^class:/, "").replace(/-/g, ".");
}

function assignmentClassCodes(assignment: LocalAssignment): string[] {
  return [assignment.classId, ...assignment.additionalClassIds].map(
    classCodeFromId,
  );
}

function assignmentForTeacherClassSubject({
  assignments,
  subjectCodes,
  teacherId,
  classCode,
  subjectCode,
}: {
  assignments: LocalAssignment[];
  subjectCodes: Map<string, string>;
  teacherId: string;
  classCode: string;
  subjectCode: string;
}): LocalAssignment | undefined {
  return assignments.find(
    (assignment) =>
      assignment.teacherId === teacherId &&
      subjectCodes.get(assignment.subjectId) === subjectCode &&
      assignmentClassCodes(assignment).includes(classCode),
  );
}

function appendFixedLesson(
  target: LocalFixedLesson[],
  existingKeys: Set<string>,
  assignment: LocalAssignment,
  blockIndex: number,
  dayOfWeek: number,
  startPeriod: number,
  idPrefix: string,
): void {
  const key = `${assignment.id}:${blockIndex}`;
  if (existingKeys.has(key)) return;
  target.push({
    id: `${idPrefix}:${assignment.id}:${blockIndex}`,
    assignmentId: assignment.id,
    blockIndex,
    dayOfWeek,
    startPeriod,
    duration: 1,
    roomId: null,
    locked: true,
  });
  existingKeys.add(key);
}

function addFixedSchedule({
  assignments,
  subjectCodes,
  teacherId,
  subjectCode,
  slots,
  fixedLessons,
  existingKeys,
  warnings,
  label,
}: {
  assignments: LocalAssignment[];
  subjectCodes: Map<string, string>;
  teacherId: string;
  subjectCode: string;
  slots: readonly FixedAssignmentSlot[];
  fixedLessons: LocalFixedLesson[];
  existingKeys: Set<string>;
  warnings: string[];
  label: string;
}): void {
  const nextBlockByAssignment = new Map<string, number>();
  for (const slot of slots) {
    const assignment = assignmentForTeacherClassSubject({
      assignments,
      subjectCodes,
      teacherId,
      classCode: slot.classCode,
      subjectCode,
    });
    if (!assignment) {
      warnings.push(
        `${label}: chybí vazba ${slot.classCode} ${subjectCode}; pevný slot nebyl vložen.`,
      );
      continue;
    }
    if (assignment.lessonShape !== "SINGLE") {
      warnings.push(
        `${label}: ${slot.classCode} ${subjectCode} musí být po jednotlivých hodinách.`,
      );
      continue;
    }
    const blockIndex = nextBlockByAssignment.get(assignment.id) ?? 0;
    if (blockIndex >= assignment.weeklyPeriods) {
      warnings.push(
        `${label}: ${slot.classCode} ${subjectCode} nemá dost výukových bloků pro pevný rozpis.`,
      );
      continue;
    }
    appendFixedLesson(
      fixedLessons,
      existingKeys,
      assignment,
      blockIndex,
      slot.dayOfWeek,
      slot.startPeriod,
      `school-default:${normalizedPersonToken(label)}`,
    );
    nextBlockByAssignment.set(assignment.id, blockIndex + 1);
  }
}

export interface SchoolSchedulingPreferencesResult {
  fixedLessons: LocalFixedLesson[];
  availability: LocalAvailability[];
  warnings: string[];
}

export function schoolSchedulingPreferences({
  assignments,
  subjects,
  staffingPlan,
  existingFixedLessons,
}: {
  assignments: LocalAssignment[];
  subjects: LocalSubject[];
  staffingPlan: StaffingPlan;
  existingFixedLessons: LocalFixedLesson[];
}): SchoolSchedulingPreferencesResult {
  const warnings: string[] = [];
  const subjectCodes = subjectCodeById(subjects);
  const spankova = staffingPlan.teachers.find(
    (teacher) => normalizedPersonToken(teacher.lastName) === SPANKOVA_SURNAME,
  );
  const kadlecek = staffingPlan.teachers.find(
    (teacher) => normalizedPersonToken(teacher.lastName) === KADLECEK_SURNAME,
  );
  const indrakova = staffingPlan.teachers.find(
    (teacher) => normalizedPersonToken(teacher.lastName) === INDRAKOVA_SURNAME,
  );
  const currentSchoolPresetActive = Boolean(spankova && kadlecek);

  for (const assignment of assignments) {
    if (subjectCodes.get(assignment.subjectId) !== PHYSICAL_EDUCATION_CODE) {
      continue;
    }
    assignment.maxPerDay = 2;

    if (currentSchoolPresetActive && !assignment.roomShareKey) {
      assignment.requiredRoomId = null;
      assignment.requiredRoomTypeId = null;
    }
  }

  const fixedLessons: LocalFixedLesson[] = [];
  const existingKeys = new Set(
    existingFixedLessons.map(
      (lesson) => `${lesson.assignmentId}:${lesson.blockIndex}`,
    ),
  );

  if (currentSchoolPresetActive && spankova && kadlecek) {
    addFixedSchedule({
      assignments,
      subjectCodes,
      teacherId: `teacher:${spankova.id}`,
      subjectCode: SECOND_FOREIGN_LANGUAGE_CODE,
      slots: SPANKOVA_CLASS_SLOTS,
      fixedLessons,
      existingKeys,
      warnings,
      label: "Špánková",
    });
    addFixedSchedule({
      assignments,
      subjectCodes,
      teacherId: `teacher:${kadlecek.id}`,
      subjectCode: INFORMATICS_CODE,
      slots: KADLECEK_INF_SLOTS,
      fixedLessons,
      existingKeys,
      warnings,
      label: "Kadleček",
    });
    if (indrakova) {
      addFixedSchedule({
        assignments,
        subjectCodes,
        teacherId: `teacher:${indrakova.id}`,
        subjectCode: HEALTH_EDUCATION_CODE,
        slots: INDRAKOVA_HEALTH_SLOTS,
        fixedLessons,
        existingKeys,
        warnings,
        label: "Indráková",
      });
    }
  }

  return { fixedLessons, availability: [], warnings };
}
