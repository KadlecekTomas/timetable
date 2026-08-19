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
const EIGHTH_GRADE_CLASS_IDS = ["class:8-A", "class:8-B", "class:8-C"] as const;
const SPANISH_DAILY_ORDER = [
  {
    dayOfWeek: 1,
    classIds: ["class:8-A", "class:8-B", "class:8-C"],
  },
  {
    dayOfWeek: 2,
    classIds: ["class:8-B", "class:8-C", "class:8-A"],
  },
  {
    dayOfWeek: 3,
    classIds: ["class:8-C", "class:8-A", "class:8-B"],
  },
] as const;
const GERMAN_FOLLOW_UP_PERIOD = 4; // 5. vyučovací hodina
const GERMAN_FOLLOW_UP_WEIGHT = 100;

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

function isExpectedSeparateSpanishAssignment(
  assignment: LocalAssignment,
): boolean {
  return (
    EIGHTH_GRADE_CLASS_IDS.includes(
      assignment.classId as (typeof EIGHTH_GRADE_CLASS_IDS)[number],
    ) && assignment.additionalClassIds.length === 0
  );
}

export interface SchoolSchedulingPreferencesResult {
  fixedLessons: LocalFixedLesson[];
  availability: LocalAvailability[];
  warnings: string[];
}

/**
 * Current-school scheduling wishes that are not part of the curriculum itself.
 * Špánková teaches Spanish as three separate 8th-grade class lessons on Tue/Wed/Thu
 * in periods 2-4 (nine lessons total). Her three 9.B German lessons are deliberately
 * only preferred in period 5 so the full-school model can move them if necessary.
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
  const spanishAssignments = languageAssignments.filter(
    isExpectedSeparateSpanishAssignment,
  );
  const spanishByClassId = new Map(
    spanishAssignments.map((assignment) => [assignment.classId, assignment]),
  );
  const german9b = languageAssignments.find(
    (assignment) =>
      assignment.classId === "class:9-B" &&
      assignment.additionalClassIds.length === 0,
  );

  const fixedLessons: LocalFixedLesson[] = [];
  const validSpanishAssignments = EIGHTH_GRADE_CLASS_IDS.every((classId) => {
    const assignment = spanishByClassId.get(classId);
    return (
      assignment?.weeklyPeriods === 3 && assignment.lessonShape === "SINGLE"
    );
  });

  if (!validSpanishAssignments) {
    warnings.push(
      "Špánková: nebyly nalezeny tři samostatné ŠpJ vazby 8.A/8.B/8.C po 3 h týdně; pevný blok Út–St–Čt 2.–4. hodinu nebyl automaticky vložen.",
    );
  } else {
    const existingKeys = new Set(
      existingFixedLessons.map(
        (lesson) => `${lesson.assignmentId}:${lesson.blockIndex}`,
      ),
    );
    SPANISH_DAILY_ORDER.forEach(({ dayOfWeek, classIds }, blockIndex) => {
      classIds.forEach((classId, orderIndex) => {
        const assignment = spanishByClassId.get(classId)!;
        if (existingKeys.has(`${assignment.id}:${blockIndex}`)) return;
        fixedLessons.push({
          id: `school-default:spankova-spj:${dayOfWeek}:${classId}`,
          assignmentId: assignment.id,
          blockIndex,
          dayOfWeek,
          startPeriod: 1 + orderIndex,
          duration: 1,
          roomId: null,
          locked: true,
        });
      });
    });
  }

  if (
    !german9b ||
    german9b.weeklyPeriods !== 3 ||
    german9b.lessonShape !== "SINGLE"
  ) {
    warnings.push(
      "Špánková: nebyla nalezena očekávaná NJ 9.B v dotaci 3 h týdně; preference navazující 5. hodiny nebyla vložena.",
    );
  }

  const availability: LocalAvailability[] = german9b
    ? [1, 2, 3].map((dayOfWeek) => ({
        id: `school-preference:spankova-german-follow-up:${dayOfWeek}`,
        entityType: "TEACHER" as const,
        entityId: teacherId,
        dayOfWeek,
        period: GERMAN_FOLLOW_UP_PERIOD,
        kind: "PREFERRED" as const,
        weight: GERMAN_FOLLOW_UP_WEIGHT,
        reason:
          "Špánková: po třech ŠpJ preferovat NJ 9.B v 5. hodině v Út/St/Čt",
      }))
    : [];

  return { fixedLessons, availability, warnings };
}
