import type {
  LocalAssignment,
  LocalAvailability,
  LocalClass,
  LocalProject,
  LocalSubject,
  LocalTeacher,
} from "./api";
import {
  STAFFING_DAYS,
  overtimeWeeklyLoad,
  teacherCodesForPlan,
  type StaffingPlan,
} from "./staffing-plan";
import {
  NON_TEACHING_SUBJECT_CODES,
  STAFFING_SUBJECTS,
  nonTeachingWeeklyLoad,
  teachingTargetWeeklyLoad,
} from "./staffing-plan-school-v2";
import {
  inferredClassProfile,
  rowTeacherPeriods,
  type TeachingPlan,
  type TeachingPlanRow,
} from "./teaching-plan";
import { isSameTeacherPartialSplit } from "./teaching-plan-school-v3";
import { schoolInputFingerprint } from "./school-input-state";

const UNSCHEDULED_SUBJECT_CODES = new Set([
  ...NON_TEACHING_SUBJECT_CODES,
  "REZERVA",
]);

const PHYSICAL_EDUCATION_SUBJECT_CODE = "TV";
const PHYSICAL_EDUCATION_ROOM_TYPE_ID = "room-type:TV";
const PHYSICAL_EDUCATION_ROOM_TYPE = {
  id: PHYSICAL_EDUCATION_ROOM_TYPE_ID,
  code: "TV",
  name: "Sportovní prostor",
};
const PHYSICAL_EDUCATION_ROOMS = [
  {
    id: "room:TV1",
    code: "Tělocvična 1",
    name: "Tělocvična 1",
    capacity: null,
    roomTypeId: PHYSICAL_EDUCATION_ROOM_TYPE_ID,
  },
  {
    id: "room:TV2",
    code: "Tělocvična 2",
    name: "Tělocvična 2",
    capacity: null,
    roomTypeId: PHYSICAL_EDUCATION_ROOM_TYPE_ID,
  },
  {
    id: "room:SAL",
    code: "Sál",
    name: "Sál",
    capacity: null,
    roomTypeId: PHYSICAL_EDUCATION_ROOM_TYPE_ID,
  },
  {
    id: "room:HALA1",
    code: "Hala 1",
    name: "Hala 1",
    capacity: null,
    roomTypeId: PHYSICAL_EDUCATION_ROOM_TYPE_ID,
  },
  {
    id: "room:HALA2",
    code: "Hala 2",
    name: "Hala 2",
    capacity: null,
    roomTypeId: PHYSICAL_EDUCATION_ROOM_TYPE_ID,
  },
] as const;
const THURSDAY_ONLY_PHYSICAL_EDUCATION_ROOM_IDS = new Set([
  "room:HALA1",
  "room:HALA2",
]);
const MONDAY_DAY_INDEX = 0;
const THURSDAY_DAY_INDEX = 3;

export interface SchoolProjectGenerationSummary {
  teachers: number;
  classes: number;
  subjects: number;
  assignments: number;
  availability: number;
  projectVersion: number;
}

export interface SchoolProjectGenerationResult {
  project: LocalProject;
  summary: SchoolProjectGenerationSummary;
  warnings: string[];
  blockers: string[];
}

function token(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function splitWeeklyPeriodsForRow(row: TeachingPlanRow): number {
  if (row.organization !== "SPLIT") return 0;
  const configured = row.splitWeeklyPeriods;
  return Number.isInteger(configured)
    ? Math.max(1, Math.min(row.weeklyPeriods, Number(configured)))
    : row.weeklyPeriods;
}

function generatedTeacherPeriods(
  row: TeachingPlanRow,
  teacherId: string,
): number {
  if (isSameTeacherPartialSplit(row)) {
    return row.primaryTeacherId === teacherId
      ? row.weeklyPeriods + splitWeeklyPeriodsForRow(row)
      : 0;
  }
  if (row.organization !== "SPLIT" || row.splitWeeklyPeriods === undefined) {
    return rowTeacherPeriods(row, teacherId);
  }
  if (row.primaryTeacherId === teacherId) return row.weeklyPeriods;
  if (row.secondaryTeacherId === teacherId) {
    return splitWeeklyPeriodsForRow(row);
  }
  if (row.splitGroupCount === 3 && row.tertiaryTeacherId === teacherId) {
    return splitWeeklyPeriodsForRow(row);
  }
  return 0;
}

function assignmentShape(
  row: TeachingPlanRow,
  additionalClassIds: string[],
  subjectCode: string,
  weeklyPeriods = row.weeklyPeriods,
) {
  const isFragment = weeklyPeriods !== row.weeklyPeriods;
  return {
    weeklyPeriods,
    lessonShape: isFragment
      ? ("SINGLE" as const)
      : row.lessonShape === "SEPARATE"
        ? ("SINGLE" as const)
        : row.lessonShape === "DOUBLE"
          ? ("DOUBLE" as const)
          : ("MIXED" as const),
    doublePeriodsCount: isFragment
      ? 0
      : row.lessonShape === "DOUBLE"
        ? row.weeklyPeriods / 2
        : row.lessonShape === "MIXED"
          ? row.doublePeriodsCount
          : 0,
    requiredRoomId: null,
    requiredRoomTypeId:
      subjectCode === PHYSICAL_EDUCATION_SUBJECT_CODE
        ? PHYSICAL_EDUCATION_ROOM_TYPE_ID
        : null,
    maxPerDay: null,
    minDayGap: null,
    additionalClassIds,
  };
}

export function buildSchoolProjectForGeneration({
  existingProject,
  staffingPlan,
  teachingPlan,
  forceReplaceGeneratedData,
}: {
  existingProject: LocalProject;
  staffingPlan: StaffingPlan;
  teachingPlan: TeachingPlan;
  forceReplaceGeneratedData: boolean;
}): SchoolProjectGenerationResult {
  const warnings: string[] = [];
  const blockers: string[] = [];
  const hasGeneratedData =
    existingProject.generationRuns.length > 0 ||
    existingProject.timetableVersions.length > 0;
  if (hasGeneratedData && !forceReplaceGeneratedData) {
    blockers.push(
      "Projekt už obsahuje návrhy rozvrhu. Potvrďte jejich odstranění před přípravou nových vstupních dat.",
    );
  }

  const teacherCodes = teacherCodesForPlan(staffingPlan);
  const teachers: LocalTeacher[] = staffingPlan.teachers.map((teacher) => {
    const teachingLoad = teachingTargetWeeklyLoad(teacher);
    const nonTeaching = nonTeachingWeeklyLoad(teacher);
    const overtime = overtimeWeeklyLoad(teacher);
    if (overtime > 0) {
      warnings.push(
        `${teacher.firstName} ${teacher.lastName}: plán počítá s ${overtime} h nadúvazku.`,
      );
    }
    if (teachingLoad + nonTeaching > teacher.targetWeeklyLoad) {
      blockers.push(
        `${teacher.firstName} ${teacher.lastName}: výuka a nevýuka překračují smluvený úvazek ${teacher.targetWeeklyLoad} hodin.`,
      );
    }
    return {
      id: `teacher:${teacher.id}`,
      code: teacherCodes.get(teacher.id)!,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      targetWeeklyLoad: teachingLoad,
      minWeeklyLoad: null,
      maxWeeklyLoad: teachingLoad,
    };
  });
  const teacherIdByPlanId = new Map(
    staffingPlan.teachers.map((teacher, index) => [
      teacher.id,
      teachers[index]!.id,
    ]),
  );
  const classes: LocalClass[] = teachingPlan.classes.map((schoolClass) => ({
    id: `class:${token(schoolClass.code)}`,
    code: schoolClass.code,
    grade: schoolClass.grade,
    name: schoolClass.code,
    profile: schoolClass.profile ?? inferredClassProfile(schoolClass.code),
  }));
  const classIdByCode = new Map(classes.map((item) => [item.code, item.id]));
  const usedSubjectCodes = new Set(
    teachingPlan.rows.flatMap((row) => [
      row.subjectCode,
      ...(row.organization === "ROTATION" && row.secondarySubjectCode
        ? [row.secondarySubjectCode]
        : []),
    ]),
  );
  for (const code of [...UNSCHEDULED_SUBJECT_CODES])
    usedSubjectCodes.delete(code);
  const usesPhysicalEducation = usedSubjectCodes.has(
    PHYSICAL_EDUCATION_SUBJECT_CODE,
  );
  const subjects: LocalSubject[] = [...usedSubjectCodes]
    .filter(Boolean)
    .map((code) => ({
      id: `subject:${token(code)}`,
      code,
      name: STAFFING_SUBJECTS.find((item) => item.code === code)?.label ?? code,
      colorToken: null,
      defaultRoomTypeId:
        code === PHYSICAL_EDUCATION_SUBJECT_CODE
          ? PHYSICAL_EDUCATION_ROOM_TYPE_ID
          : null,
    }));
  const subjectIdByCode = new Map(subjects.map((item) => [item.code, item.id]));

  const roomTypes = usesPhysicalEducation
    ? [
        ...existingProject.roomTypes
          .filter((roomType) => roomType.id !== PHYSICAL_EDUCATION_ROOM_TYPE_ID)
          .map((roomType) => ({ ...roomType })),
        { ...PHYSICAL_EDUCATION_ROOM_TYPE },
      ]
    : existingProject.roomTypes.map((roomType) => ({ ...roomType }));
  const physicalEducationRoomIds = new Set(
    PHYSICAL_EDUCATION_ROOMS.map((room) => room.id),
  );
  const rooms = usesPhysicalEducation
    ? [
        ...existingProject.rooms
          .filter(
            (room) =>
              room.roomTypeId !== PHYSICAL_EDUCATION_ROOM_TYPE_ID &&
              !physicalEducationRoomIds.has(room.id),
          )
          .map((room) => ({ ...room })),
        ...PHYSICAL_EDUCATION_ROOMS.map((room) => ({ ...room })),
      ]
    : existingProject.rooms.map((room) => ({ ...room }));

  const assignments: LocalAssignment[] = [];
  const push = (
    row: TeachingPlanRow,
    suffix: string,
    subjectCode: string,
    teacherPlanId: string,
    group: LocalAssignment["group"],
    parallelKey: string | null,
    rotationKey: string | null = null,
    rotationLeg: number | null = null,
    weeklyPeriods = row.weeklyPeriods,
  ) => {
    const classId = classIdByCode.get(row.classCode);
    const additionalClassIds = [
      ...new Set(
        (row.additionalClassCodes ?? [])
          .map((classCode) => {
            const additionalClassId = classIdByCode.get(classCode);
            if (!additionalClassId) {
              blockers.push(
                `${row.classCode} ${subjectCode}: společná třída ${classCode} neexistuje.`,
              );
            }
            return additionalClassId ?? "";
          })
          .filter(
            (additionalClassId) =>
              additionalClassId && additionalClassId !== classId,
          ),
      ),
    ];
    const subjectId = subjectIdByCode.get(subjectCode);
    const teacherId = teacherIdByPlanId.get(teacherPlanId);
    if (!classId)
      blockers.push(`${row.classCode}: třída pro výukovou vazbu neexistuje.`);
    if (!subjectId)
      blockers.push(`${row.classCode}: předmět ${subjectCode} neexistuje.`);
    if (!teacherId)
      blockers.push(
        `${row.classCode} ${subjectCode}: výuková vazba nemá učitele.`,
      );
    if (!classId || !subjectId || !teacherId) return;
    assignments.push({
      id: `assignment:${token(row.id)}-${suffix}`,
      assignmentCode: `${token(row.classCode)}-${token(subjectCode)}-${token(row.id)}-${suffix}`,
      classId,
      subjectId,
      teacherId,
      group,
      ...assignmentShape(row, additionalClassIds, subjectCode, weeklyPeriods),
      parallelKey,
      rotationKey,
      rotationLeg,
      rotationPlacement: rotationKey
        ? (row.rotationPlacement ?? "ADJACENT")
        : null,
    });
  };

  const partialCzechMathByClass = new Map<
    string,
    { czech?: TeachingPlanRow; math?: TeachingPlanRow }
  >();
  for (const row of teachingPlan.rows) {
    if (
      !isSameTeacherPartialSplit(row) ||
      !["CJ", "M"].includes(row.subjectCode)
    ) {
      continue;
    }
    const pair = partialCzechMathByClass.get(row.classCode) ?? {};
    if (row.subjectCode === "CJ") pair.czech = row;
    if (row.subjectCode === "M") pair.math = row;
    partialCzechMathByClass.set(row.classCode, pair);
  }
  const handledPartialRows = new Set<string>();

  for (const row of teachingPlan.rows) {
    if (UNSCHEDULED_SUBJECT_CODES.has(row.subjectCode)) continue;
    if (
      isSameTeacherPartialSplit(row) &&
      ["CJ", "M"].includes(row.subjectCode)
    ) {
      if (handledPartialRows.has(row.id)) continue;
      const pair = partialCzechMathByClass.get(row.classCode);
      const czech = pair?.czech;
      const math = pair?.math;
      if (!czech || !math) {
        blockers.push(
          `${row.classCode}: dělená ČJ/M vyžaduje současně řádek češtiny i matematiky.`,
        );
        handledPartialRows.add(row.id);
        continue;
      }
      handledPartialRows.add(czech.id);
      handledPartialRows.add(math.id);
      const czechSplit = splitWeeklyPeriodsForRow(czech);
      const mathSplit = splitWeeklyPeriodsForRow(math);
      if (czechSplit !== mathSplit) {
        blockers.push(
          `${row.classCode}: ČJ a M musí mít stejný počet dělených hodin.`,
        );
        continue;
      }
      for (const source of [czech, math]) {
        const wholePeriods =
          source.weeklyPeriods - splitWeeklyPeriodsForRow(source);
        if (wholePeriods > 0) {
          push(
            source,
            "WHOLE",
            source.subjectCode,
            source.primaryTeacherId,
            "WHOLE",
            null,
            null,
            null,
            wholePeriods,
          );
        }
      }
      const rotationKey = `${token(row.classCode)}-CJ-M-PARTIAL`;
      const leg1 = `${rotationKey}-L1`;
      const leg2 = `${rotationKey}-L2`;
      push(
        czech,
        "CJ-M-L1-G1",
        "CJ",
        czech.primaryTeacherId,
        "GROUP_1",
        leg1,
        rotationKey,
        1,
        czechSplit,
      );
      push(
        math,
        "CJ-M-L1-G2",
        "M",
        math.primaryTeacherId,
        "GROUP_2",
        leg1,
        rotationKey,
        1,
        mathSplit,
      );
      push(
        math,
        "CJ-M-L2-G1",
        "M",
        math.primaryTeacherId,
        "GROUP_1",
        leg2,
        rotationKey,
        2,
        mathSplit,
      );
      push(
        czech,
        "CJ-M-L2-G2",
        "CJ",
        czech.primaryTeacherId,
        "GROUP_2",
        leg2,
        rotationKey,
        2,
        czechSplit,
      );
      continue;
    }
    const rowKey = `${token(row.classCode)}-${token(row.id)}`;
    if (row.organization === "WHOLE") {
      push(row, "WHOLE", row.subjectCode, row.primaryTeacherId, "WHOLE", null);
    } else if (row.organization === "SPLIT") {
      const splitWeeklyPeriods = splitWeeklyPeriodsForRow(row);
      const wholeWeeklyPeriods = row.weeklyPeriods - splitWeeklyPeriods;
      if (wholeWeeklyPeriods > 0) {
        push(
          row,
          "WHOLE",
          row.subjectCode,
          row.primaryTeacherId,
          "WHOLE",
          null,
          null,
          null,
          wholeWeeklyPeriods,
        );
      }
      push(
        row,
        "G1",
        row.subjectCode,
        row.primaryTeacherId,
        "GROUP_1",
        rowKey,
        null,
        null,
        splitWeeklyPeriods,
      );
      push(
        row,
        "G2",
        row.subjectCode,
        row.secondaryTeacherId,
        "GROUP_2",
        rowKey,
        null,
        null,
        splitWeeklyPeriods,
      );
      if (row.splitGroupCount === 3) {
        push(
          row,
          "G3",
          row.subjectCode,
          row.tertiaryTeacherId ?? "",
          "GROUP_3",
          rowKey,
          null,
          null,
          splitWeeklyPeriods,
        );
      }
    } else {
      if (!row.secondarySubjectCode)
        blockers.push(`${row.classCode}: rotace nemá druhý předmět.`);
      if (
        !row.secondaryTeacherId ||
        row.secondaryTeacherId === row.primaryTeacherId
      ) {
        blockers.push(`${row.classCode}: rotace musí mít dva různé učitele.`);
      }
      const rotationKey = `${rowKey}-ROT`;
      push(
        row,
        "L1-G1",
        row.subjectCode,
        row.primaryTeacherId,
        "GROUP_1",
        `${rotationKey}-L1`,
        rotationKey,
        1,
      );
      push(
        row,
        "L1-G2",
        row.secondarySubjectCode ?? "",
        row.secondaryTeacherId,
        "GROUP_2",
        `${rotationKey}-L1`,
        rotationKey,
        1,
      );
      push(
        row,
        "L2-G1",
        row.secondarySubjectCode ?? "",
        row.secondaryTeacherId,
        "GROUP_1",
        `${rotationKey}-L2`,
        rotationKey,
        2,
      );
      push(
        row,
        "L2-G2",
        row.subjectCode,
        row.primaryTeacherId,
        "GROUP_2",
        `${rotationKey}-L2`,
        rotationKey,
        2,
      );
    }
  }

  for (const teacher of staffingPlan.teachers) {
    const assigned = teachingPlan.rows.reduce(
      (total, row) => total + generatedTeacherPeriods(row, teacher.id),
      0,
    );
    const capacity = teachingTargetWeeklyLoad(teacher);
    if (assigned > capacity) {
      blockers.push(
        `${teacher.firstName} ${teacher.lastName} má smluvenou výukovou kapacitu ${capacity} hodin, ale výsledný plán jí přiděluje ${assigned} hodin. Přesuňte alespoň ${assigned - capacity} hodin.`,
      );
    } else if (assigned < capacity) {
      warnings.push(
        `${teacher.firstName} ${teacher.lastName}: zbývá pokrýt ${capacity - assigned} hodin.`,
      );
    }
  }

  const teacherAvailability: LocalAvailability[] = staffingPlan.teachers.flatMap(
    (teacher) =>
      teacher.unavailableDays.flatMap((dayCode) => {
        const day = STAFFING_DAYS.find((item) => item.code === dayCode);
        if (!day) return [];
        return Array.from(
          { length: existingProject.periodsPerDay[day.dayIndex] ?? 0 },
          (_unused, period) => ({
            id: `availability:${teacher.id}:${day.code}:${period}`,
            entityType: "TEACHER" as const,
            entityId: teacherIdByPlanId.get(teacher.id)!,
            dayOfWeek: day.dayIndex,
            period,
            kind: "UNAVAILABLE" as const,
            weight: null,
            reason: "Celodenní nedostupnost z personálního plánu",
          }),
        );
      }),
  );

  const physicalEducationAvailability: LocalAvailability[] = usesPhysicalEducation
    ? PHYSICAL_EDUCATION_ROOMS.flatMap((room) => {
        const unavailableDays = THURSDAY_ONLY_PHYSICAL_EDUCATION_ROOM_IDS.has(
          room.id,
        )
          ? [0, 1, 2, 4]
          : [MONDAY_DAY_INDEX];
        return unavailableDays.flatMap((dayIndex) =>
          Array.from(
            { length: existingProject.periodsPerDay[dayIndex] ?? 0 },
            (_unused, period) => ({
              id: `availability:${room.id}:${dayIndex}:${period}`,
              entityType: "ROOM" as const,
              entityId: room.id,
              dayOfWeek: dayIndex,
              period,
              kind: "UNAVAILABLE" as const,
              weight: null,
              reason:
                dayIndex === MONDAY_DAY_INDEX
                  ? "TV se v pondělí nevyučuje"
                  : `Hala je k dispozici pouze ve čtvrtek (den ${THURSDAY_DAY_INDEX + 1}).`,
            }),
          ),
        );
      })
    : [];
  const availability = [
    ...teacherAvailability,
    ...physicalEducationAvailability,
  ];

  const project: LocalProject = blockers.length
    ? structuredClone(existingProject)
    : {
        ...structuredClone(existingProject),
        version: existingProject.version + 1,
        inputFingerprint: schoolInputFingerprint(staffingPlan, teachingPlan),
        teachers,
        classes,
        subjects,
        roomTypes,
        rooms,
        assignments,
        availability,
        fixedLessons: existingProject.fixedLessons.filter((lesson) =>
          assignments.some(
            (assignment) => assignment.id === lesson.assignmentId,
          ),
        ),
        generationRuns: forceReplaceGeneratedData
          ? []
          : existingProject.generationRuns,
        timetableVersions: forceReplaceGeneratedData
          ? []
          : existingProject.timetableVersions,
      };
  return {
    project,
    warnings,
    blockers: [...new Set(blockers)],
    summary: {
      teachers: teachers.length,
      classes: classes.length,
      subjects: subjects.length,
      assignments: assignments.length,
      availability: availability.length,
      projectVersion: project.version,
    },
  };
}
