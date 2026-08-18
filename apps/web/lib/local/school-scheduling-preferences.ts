import type {
  LocalAssignment,
  LocalAvailability,
  LocalProject,
  LocalSubject,
} from "./api";
import type { StaffingPlan } from "./staffing-plan";

type LocalFixedLesson = LocalProject["fixedLessons"][number];

const SPANKOVA_SURNAME = "spankova";
const SECOND_FOREIGN_LANGUAGE_CODE = "JAZ2";
const EIGHTH_GRADE_CLASS_IDS = new Set(["class:8-A", "class:8-B", "class:8-C"]);
const SPANISH_FIXED_SLOTS = [
  { dayOfWeek: 1, startPeriod: 1 }, // Út 2. hodina
  { dayOfWeek: 2, startPeriod: 1 }, // St 2. hodina
  { dayOfWeek: 3, startPeriod: 1 }, // Čt 2. hodina
] as const;
const GERMAN_FOLLOW_UP_PREFERENCES = [
  { period: 2, weight: 100 }, // ideálně hned 3. hodinu
  { period: 3, weight: 60 },
  { period: 4, weight: 30 },
] as const;

function normalizedPersonToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLocaleLowerCase("cs-CZ");
}

function classIdsForAssignment(assignment: LocalAssignment): Set<string> {
  return new Set([assignment.classId, ...assignment.additionalClassIds]);
}

function isEighthGradeSharedLanguage(assignment: LocalAssignment): boolean {
  const ids = classIdsForAssignment(assignment);
  return (
    ids.size === EIGHTH_GRADE_CLASS_IDS.size &&
    [...EIGHTH_GRADE_CLASS_IDS].every((classId) => ids.has(classId))
  );
}

function subjectCodeById(subjects: LocalSubject[]): Map<string, string> {
  return new Map(subjects.map((subject) => [subject.id, subject.code]));
}

export interface SchoolSchedulingPreferencesResult {
  fixedLessons: LocalFixedLesson[];
  availability: LocalAvailability[];
  warnings: string[];
}

/**
 * Current-school scheduling wishes that are not part of the curriculum itself.
 * Spanish for Špánková is a fixed operational requirement; German after it is
 * deliberately only preferred so it can move when another hard constraint wins.
 */
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
  const spankova = staffingPlan.teachers.find(
    (teacher) => normalizedPersonToken(teacher.lastName) === SPANKOVA_SURNAME,
  );
  if (!spankova) {
    return { fixedLessons: [], availability: [], warnings };
  }

  const teacherId = `teacher:${spankova.id}`;
  const subjectCodes = subjectCodeById(subjects);
  const languageAssignments = assignments.filter(
    (assignment) =>
      assignment.teacherId === teacherId &&
      subjectCodes.get(assignment.subjectId) === SECOND_FOREIGN_LANGUAGE_CODE,
  );
  const spanish = languageAssignments.find(isEighthGradeSharedLanguage);

  const fixedLessons: LocalFixedLesson[] = [];
  if (!spanish || spanish.weeklyPeriods !== 3 || spanish.lessonShape !== "SINGLE") {
    warnings.push(
      "Špánková: nebyla nalezena očekávaná společná ŠpJ výuka 8. ročníku 3 h týdně; pevné Út–St–Čt 2. hodiny nebyly automaticky vloženy.",
    );
  } else {
    const existingKeys = new Set(
      existingFixedLessons.map(
        (lesson) => `${lesson.assignmentId}:${lesson.blockIndex}`,
      ),
    );
    SPANISH_FIXED_SLOTS.forEach((slot, blockIndex) => {
      if (existingKeys.has(`${spanish.id}:${blockIndex}`)) return;
      fixedLessons.push({
        id: `school-default:spankova-spj:${blockIndex}`,
        assignmentId: spanish.id,
        blockIndex,
        dayOfWeek: slot.dayOfWeek,
        startPeriod: slot.startPeriod,
        duration: 1,
        roomId: null,
        locked: true,
      });
    });
  }

  const availability: LocalAvailability[] = [1, 2, 3].flatMap((dayOfWeek) =>
    GERMAN_FOLLOW_UP_PREFERENCES.map(({ period, weight }) => ({
      id: `school-preference:spankova-follow-up:${dayOfWeek}:${period}`,
      entityType: "TEACHER" as const,
      entityId: teacherId,
      dayOfWeek,
      period,
      kind: "PREFERRED" as const,
      weight,
      reason:
        "Špánková: po ŠpJ preferovat navazující němčinu v Út/St/Čt bez zbytečné mezery",
    })),
  );

  return { fixedLessons, availability, warnings };
}
