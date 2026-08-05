import {
  MAX_WEEKLY_TEACHER_LOAD,
  MAX_WEEKLY_TEACHER_TOTAL_LOAD,
  NON_TEACHING_SUBJECT_CODES,
  STAFFING_SUBJECTS,
  baseWeeklyLoad,
  type StaffingPlan,
  type StaffingSubjectLoad,
  type StaffingTeacher,
} from "@/lib/local/staffing-plan";
import type { TeachingPlan, TeachingPlanRow } from "@/lib/local/teaching-plan";

type TeacherField = "primaryTeacherId" | "secondaryTeacherId";

interface MissingTeacherSlot {
  rowIndex: number;
  rowId: string;
  classCode: string;
  subjectCode: string;
  field: TeacherField;
  roleLabel: string;
  teacherHours: number;
}

export interface AutoCoverageAssignment {
  rowId: string;
  classCode: string;
  subjectCode: string;
  roleLabel: string;
  teacherId: string;
  teacherName: string;
  teacherHours: number;
  forcedOutsideDeclaredSubjects: boolean;
}

export interface AutoCoverageTeacherIncrease {
  teacherId: string;
  teacherName: string;
  previousTargetWeeklyLoad: number;
  targetWeeklyLoad: number;
  increasedBy: number;
}

export interface AutoCoverageUnresolvedSlot {
  rowId: string;
  classCode: string;
  subjectCode: string;
  roleLabel: string;
  reason: string;
}

export interface AutoCoverageResult {
  teachingPlan: TeachingPlan;
  staffingPlan: StaffingPlan;
  assignments: AutoCoverageAssignment[];
  increasedTeachers: AutoCoverageTeacherIncrease[];
  unresolved: AutoCoverageUnresolvedSlot[];
  forcedAssignmentCount: number;
  totalIncreasedHours: number;
}

const ELECTIVE_SUBJECT_CODES = new Set(["VOL", "PRPK", "SVS"]);

function newId(prefix: string): string {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${randomPart}`;
}

function teacherName(teacher: StaffingTeacher): string {
  return `${teacher.firstName} ${teacher.lastName}`.trim();
}

function positiveHours(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function subjectMatches(candidateCode: string, requiredCode: string): boolean {
  if (candidateCode === requiredCode) return true;
  return requiredCode === "VOL" && ELECTIVE_SUBJECT_CODES.has(candidateCode);
}

function slotSubject(row: TeachingPlanRow, field: TeacherField): string {
  if (field === "secondaryTeacherId" && row.organization === "ROTATION") {
    return row.secondarySubjectCode ?? "";
  }
  return row.subjectCode;
}

function slotHours(row: TeachingPlanRow): number {
  const periods = positiveHours(row.weeklyPeriods);
  return row.organization === "ROTATION" ? periods * 2 : periods;
}

function roleLabel(row: TeachingPlanRow, field: TeacherField): string {
  if (row.organization === "WHOLE") return "učitel celé třídy";
  if (row.organization === "ROTATION") {
    return field === "primaryTeacherId"
      ? "učitel prvního rotačního předmětu"
      : "učitel druhého rotačního předmětu";
  }
  return field === "primaryTeacherId"
    ? "učitel první skupiny"
    : "učitel druhé skupiny";
}

function subjectOrder(code: string): number {
  const index = STAFFING_SUBJECTS.findIndex((subject) => subject.code === code);
  return index >= 0 ? index : 10_000;
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

export function autoCoverTeachingPlan(
  teachingPlan: TeachingPlan,
  staffingPlan: StaffingPlan,
): AutoCoverageResult {
  const teachers = staffingPlan.teachers.map((teacher) => ({
    ...teacher,
    subjectLoads: teacher.subjectLoads.map((item) => ({ ...item })),
    unavailableDays: [...teacher.unavailableDays],
  }));
  const rows = teachingPlan.rows.map((row) => ({
    ...row,
    additionalClassCodes: [...(row.additionalClassCodes ?? [])],
    workloadCredits: row.workloadCredits
      ? { ...row.workloadCredits }
      : undefined,
  }));
  const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
  const validTeacherIds = new Set(teacherById.keys());

  const declaredSubjectHours = new Map<string, Map<string, number>>();
  const declaredSubjects = new Map<string, Set<string>>();
  const nonTeachingHours = new Map<string, number>();
  const scheduledByTeacher = new Map<string, number>();
  const scheduledByTeacherSubject = new Map<string, Map<string, number>>();
  const taughtSubjects = new Map<string, Set<string>>();

  for (const teacher of teachers) {
    const subjectHours = new Map<string, number>();
    const subjectCodes = new Set<string>();
    let nonTeaching = 0;
    for (const item of teacher.subjectLoads) {
      const hours = positiveHours(item.weeklyPeriods);
      if (NON_TEACHING_SUBJECT_CODES.has(item.subjectCode)) {
        nonTeaching += hours;
        continue;
      }
      if (item.subjectCode === "REZERVA" || hours <= 0) continue;
      subjectHours.set(
        item.subjectCode,
        (subjectHours.get(item.subjectCode) ?? 0) + hours,
      );
      subjectCodes.add(item.subjectCode);
    }
    declaredSubjectHours.set(teacher.id, subjectHours);
    declaredSubjects.set(teacher.id, subjectCodes);
    nonTeachingHours.set(teacher.id, nonTeaching);
    scheduledByTeacher.set(teacher.id, nonTeaching);
    scheduledByTeacherSubject.set(teacher.id, new Map());
    taughtSubjects.set(teacher.id, new Set());
  }

  const addScheduled = (
    teacherId: string,
    subjectCode: string,
    hours: number,
  ) => {
    if (!teacherId || !subjectCode || hours <= 0) return;
    scheduledByTeacher.set(
      teacherId,
      rounded((scheduledByTeacher.get(teacherId) ?? 0) + hours),
    );
    const bySubject = scheduledByTeacherSubject.get(teacherId) ?? new Map();
    bySubject.set(
      subjectCode,
      rounded((bySubject.get(subjectCode) ?? 0) + hours),
    );
    scheduledByTeacherSubject.set(teacherId, bySubject);
    const evidence = taughtSubjects.get(teacherId) ?? new Set<string>();
    evidence.add(subjectCode);
    taughtSubjects.set(teacherId, evidence);
  };

  const slots: MissingTeacherSlot[] = [];

  rows.forEach((row, rowIndex) => {
    const hours = slotHours(row);
    const primaryValid =
      Boolean(row.primaryTeacherId) &&
      validTeacherIds.has(row.primaryTeacherId);
    row.primaryTeacherId = primaryValid ? row.primaryTeacherId : "";

    if (row.organization === "WHOLE") {
      row.secondaryTeacherId = "";
    } else {
      const secondaryValid =
        Boolean(row.secondaryTeacherId) &&
        validTeacherIds.has(row.secondaryTeacherId) &&
        row.secondaryTeacherId !== row.primaryTeacherId;
      row.secondaryTeacherId = secondaryValid ? row.secondaryTeacherId : "";
    }

    if (row.primaryTeacherId) {
      addScheduled(row.primaryTeacherId, row.subjectCode, hours);
    } else if (row.subjectCode && hours > 0) {
      slots.push({
        rowIndex,
        rowId: row.id,
        classCode: row.classCode,
        subjectCode: row.subjectCode,
        field: "primaryTeacherId",
        roleLabel: roleLabel(row, "primaryTeacherId"),
        teacherHours: hours,
      });
    }

    if (row.organization !== "WHOLE") {
      const secondarySubject = slotSubject(row, "secondaryTeacherId");
      if (row.secondaryTeacherId) {
        addScheduled(row.secondaryTeacherId, secondarySubject, hours);
      } else if (secondarySubject && hours > 0) {
        slots.push({
          rowIndex,
          rowId: row.id,
          classCode: row.classCode,
          subjectCode: secondarySubject,
          field: "secondaryTeacherId",
          roleLabel: roleLabel(row, "secondaryTeacherId"),
          teacherHours: hours,
        });
      }
    }
  });

  const qualificationRank = (
    teacherId: string,
    subjectCode: string,
  ): number => {
    const declared = declaredSubjects.get(teacherId) ?? new Set<string>();
    if ([...declared].some((code) => subjectMatches(code, subjectCode))) {
      return 0;
    }
    const taught = taughtSubjects.get(teacherId) ?? new Set<string>();
    if ([...taught].some((code) => subjectMatches(code, subjectCode))) {
      return 1;
    }
    return 2;
  };

  const qualifiedCount = (subjectCode: string): number =>
    teachers.filter((teacher) => qualificationRank(teacher.id, subjectCode) < 2)
      .length;

  slots.sort(
    (left, right) =>
      qualifiedCount(left.subjectCode) - qualifiedCount(right.subjectCode) ||
      right.teacherHours - left.teacherHours ||
      `${left.classCode}|${left.subjectCode}|${left.roleLabel}`.localeCompare(
        `${right.classCode}|${right.subjectCode}|${right.roleLabel}`,
        "cs-CZ",
        { numeric: true },
      ),
  );

  const assignments: AutoCoverageAssignment[] = [];
  const unresolved: AutoCoverageUnresolvedSlot[] = [];

  for (const slot of slots) {
    const row = rows[slot.rowIndex];
    if (!row) continue;
    const otherTeacherId =
      slot.field === "primaryTeacherId"
        ? row.secondaryTeacherId
        : row.primaryTeacherId;

    const candidates = teachers
      .filter((teacher) => teacher.id !== otherTeacherId)
      .map((teacher) => {
        const used = scheduledByTeacher.get(teacher.id) ?? 0;
        const projected = rounded(used + slot.teacherHours);
        const rank = qualificationRank(teacher.id, slot.subjectCode);
        const plannedBySubject =
          declaredSubjectHours.get(teacher.id) ?? new Map();
        const scheduledBySubject =
          scheduledByTeacherSubject.get(teacher.id) ?? new Map();
        const plannedHours = [...plannedBySubject.entries()]
          .filter(([code]) => subjectMatches(code, slot.subjectCode))
          .reduce((total, [, hours]) => total + hours, 0);
        const alreadyScheduled = [...scheduledBySubject.entries()]
          .filter(([code]) => subjectMatches(code, slot.subjectCode))
          .reduce((total, [, hours]) => total + hours, 0);
        const plannedGap = Math.max(
          0,
          slot.teacherHours - Math.max(0, plannedHours - alreadyScheduled),
        );
        const targetIncrease = Math.max(
          0,
          projected - teacher.targetWeeklyLoad,
        );
        const loadRatio =
          teacher.targetWeeklyLoad > 0
            ? used / teacher.targetWeeklyLoad
            : used > 0
              ? Number.POSITIVE_INFINITY
              : 0;
        return {
          teacher,
          used,
          projected,
          rank,
          plannedGap,
          targetIncrease,
          loadRatio,
        };
      })
      .filter(
        (candidate) => candidate.projected <= MAX_WEEKLY_TEACHER_TOTAL_LOAD,
      )
      .sort(
        (left, right) =>
          left.rank - right.rank ||
          left.plannedGap - right.plannedGap ||
          left.targetIncrease - right.targetIncrease ||
          left.loadRatio - right.loadRatio ||
          left.used - right.used ||
          teacherName(left.teacher).localeCompare(
            teacherName(right.teacher),
            "cs-CZ",
          ),
      );

    const selected = candidates[0];
    if (!selected) {
      unresolved.push({
        rowId: slot.rowId,
        classCode: slot.classCode,
        subjectCode: slot.subjectCode,
        roleLabel: slot.roleLabel,
        reason: `Žádný učitel se nevejde do limitu ${MAX_WEEKLY_TEACHER_TOTAL_LOAD} hodin týdně.`,
      });
      continue;
    }

    row[slot.field] = selected.teacher.id;
    addScheduled(selected.teacher.id, slot.subjectCode, slot.teacherHours);
    assignments.push({
      rowId: slot.rowId,
      classCode: slot.classCode,
      subjectCode: slot.subjectCode,
      roleLabel: slot.roleLabel,
      teacherId: selected.teacher.id,
      teacherName: teacherName(selected.teacher),
      teacherHours: slot.teacherHours,
      forcedOutsideDeclaredSubjects: selected.rank === 2,
    });
  }

  const increasedTeachers: AutoCoverageTeacherIncrease[] = [];
  const reconciledTeachers = teachers.map((teacher): StaffingTeacher => {
    const originalByCode = new Map<string, StaffingSubjectLoad>();
    for (const item of teacher.subjectLoads) {
      if (!originalByCode.has(item.subjectCode)) {
        originalByCode.set(item.subjectCode, item);
      }
    }

    const scheduledSubjects =
      scheduledByTeacherSubject.get(teacher.id) ?? new Map();
    const teachingLoads = [...scheduledSubjects.entries()]
      .filter(([, hours]) => hours > 0)
      .sort(
        ([left], [right]) =>
          subjectOrder(left) - subjectOrder(right) ||
          left.localeCompare(right, "cs-CZ"),
      )
      .map(
        ([subjectCode, weeklyPeriods]): StaffingSubjectLoad => ({
          id: originalByCode.get(subjectCode)?.id ?? newId("subject-load"),
          subjectCode,
          weeklyPeriods: rounded(weeklyPeriods),
        }),
      );

    const nonTeachingByCode = new Map<string, number>();
    for (const item of teacher.subjectLoads) {
      if (!NON_TEACHING_SUBJECT_CODES.has(item.subjectCode)) continue;
      nonTeachingByCode.set(
        item.subjectCode,
        rounded(
          (nonTeachingByCode.get(item.subjectCode) ?? 0) +
            positiveHours(item.weeklyPeriods),
        ),
      );
    }
    const nonTeachingLoads = [...nonTeachingByCode.entries()].map(
      ([subjectCode, weeklyPeriods]): StaffingSubjectLoad => ({
        id: originalByCode.get(subjectCode)?.id ?? newId("subject-load"),
        subjectCode,
        weeklyPeriods,
      }),
    );

    const usedHours = rounded(
      [...scheduledSubjects.values()].reduce(
        (total, hours) => total + hours,
        0,
      ) +
        [...nonTeachingByCode.values()].reduce(
          (total, hours) => total + hours,
          0,
        ),
    );
    const targetWeeklyLoad = rounded(
      Math.max(teacher.targetWeeklyLoad, usedHours),
    );
    if (targetWeeklyLoad > MAX_WEEKLY_TEACHER_TOTAL_LOAD) {
      unresolved.push({
        rowId: "",
        classCode: "",
        subjectCode: "",
        roleLabel: teacherName(teacher),
        reason: `Skutečné zatížení ${targetWeeklyLoad} h překračuje limit ${MAX_WEEKLY_TEACHER_TOTAL_LOAD} h.`,
      });
    }
    const safeTarget = Math.min(
      MAX_WEEKLY_TEACHER_TOTAL_LOAD,
      targetWeeklyLoad,
    );
    const reserveHours = rounded(Math.max(0, safeTarget - usedHours));
    const subjectLoads = [
      ...teachingLoads,
      ...nonTeachingLoads,
      ...(reserveHours > 0
        ? [
            {
              id: originalByCode.get("REZERVA")?.id ?? newId("subject-load"),
              subjectCode: "REZERVA",
              weeklyPeriods: reserveHours,
            } satisfies StaffingSubjectLoad,
          ]
        : []),
    ];
    const previousTarget = teacher.targetWeeklyLoad;
    if (safeTarget > previousTarget) {
      increasedTeachers.push({
        teacherId: teacher.id,
        teacherName: teacherName(teacher),
        previousTargetWeeklyLoad: previousTarget,
        targetWeeklyLoad: safeTarget,
        increasedBy: rounded(safeTarget - previousTarget),
      });
    }

    return {
      ...teacher,
      baseWeeklyLoad: Math.min(
        MAX_WEEKLY_TEACHER_LOAD,
        safeTarget,
        Math.max(0, baseWeeklyLoad(teacher)),
      ),
      targetWeeklyLoad: safeTarget,
      subjectLoads,
    };
  });

  const totalIncreasedHours = rounded(
    increasedTeachers.reduce((total, item) => total + item.increasedBy, 0),
  );

  return {
    teachingPlan: {
      ...teachingPlan,
      rows,
      updatedAt: new Date().toISOString(),
    },
    staffingPlan: {
      ...staffingPlan,
      teachers: reconciledTeachers,
      updatedAt: new Date().toISOString(),
    },
    assignments,
    increasedTeachers,
    unresolved,
    forcedAssignmentCount: assignments.filter(
      (assignment) => assignment.forcedOutsideDeclaredSubjects,
    ).length,
    totalIncreasedHours,
  };
}
