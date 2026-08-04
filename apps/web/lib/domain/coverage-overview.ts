import {
  NON_TEACHING_SUBJECT_CODES,
  STAFFING_SUBJECTS,
  type StaffingPlan,
  type StaffingTeacher,
} from "@/lib/local/staffing-plan";
import type { TeachingPlan, TeachingPlanRow } from "@/lib/local/teaching-plan";

export type CoverageStatus = "FULL" | "PARTIAL" | "MISSING";

export interface CoverageCellRow {
  rowId: string;
  roleLabel: string;
  teacherId: string;
  teacherName: string;
  assigned: boolean;
  teacherHours: number;
}

export interface CoverageCell {
  key: string;
  classCode: string;
  subjectCode: string;
  subjectLabel: string;
  requiredClassPeriods: number;
  requiredTeacherHours: number;
  assignedTeacherHours: number;
  requiredSlots: number;
  assignedSlots: number;
  missingTeacherHours: number;
  status: CoverageStatus;
  teacherNames: string[];
  missingRoles: string[];
  rows: CoverageCellRow[];
}

export interface CoverageBreakdownItem {
  code: string;
  label: string;
  requiredClassPeriods: number;
  missingClassPeriods: number;
  problemCells: number;
}

export interface CoverageProblem {
  key: string;
  classCode: string;
  subjectCode: string;
  subjectLabel: string;
  status: CoverageStatus;
  assignedSlots: number;
  requiredSlots: number;
  missingTeacherHours: number;
  missingRoles: string[];
}

export interface TeacherCoverage {
  teacherId: string;
  teacherName: string;
  scheduledTeachingHours: number;
  nonTeachingHours: number;
  reserveHours: number;
  targetWeeklyLoad: number;
  totalUsedHours: number;
  difference: number;
  status: "FULL" | "UNDER" | "OVER";
}

export interface CoverageOverview {
  cells: CoverageCell[];
  cellByKey: Map<string, CoverageCell>;
  classes: string[];
  subjects: Array<{ code: string; label: string }>;
  problems: CoverageProblem[];
  classBreakdown: CoverageBreakdownItem[];
  subjectBreakdown: CoverageBreakdownItem[];
  teachers: TeacherCoverage[];
  summary: {
    requiredClassPeriods: number;
    coveredClassPeriods: number;
    missingClassPeriods: number;
    requiredTeacherHours: number;
    assignedTeacherHours: number;
    missingTeacherHours: number;
    coveragePercent: number;
    fullCells: number;
    partialCells: number;
    missingCells: number;
    problemCells: number;
  };
}

interface CoverageRole {
  subjectCode: string;
  roleLabel: string;
  teacherId: string;
  teacherHours: number;
  classPeriods: number;
}

function teacherName(teacher: StaffingTeacher): string {
  return `${teacher.firstName} ${teacher.lastName}`.trim();
}

function subjectLabel(subjectCode: string): string {
  return (
    STAFFING_SUBJECTS.find((subject) => subject.code === subjectCode)?.label ??
    subjectCode
  );
}

function rowTargetClasses(row: TeachingPlanRow): string[] {
  return [
    ...new Set(
      [row.classCode, ...(row.additionalClassCodes ?? [])].filter(Boolean),
    ),
  ];
}

function rolesForRow(row: TeachingPlanRow): CoverageRole[] {
  const periods = Math.max(0, row.weeklyPeriods);

  if (row.organization === "ROTATION") {
    return [
      {
        subjectCode: row.subjectCode,
        roleLabel: `učitel předmětu ${subjectLabel(row.subjectCode)}`,
        teacherId: row.primaryTeacherId,
        teacherHours: periods * 2,
        classPeriods: periods,
      },
      {
        subjectCode: row.secondarySubjectCode ?? "",
        roleLabel: `učitel předmětu ${subjectLabel(row.secondarySubjectCode ?? "")}`,
        teacherId: row.secondaryTeacherId,
        teacherHours: periods * 2,
        classPeriods: periods,
      },
    ].filter((role) => role.subjectCode);
  }

  if (row.organization === "SPLIT") {
    return [
      {
        subjectCode: row.subjectCode,
        roleLabel: "učitel 1. skupiny",
        teacherId: row.primaryTeacherId,
        teacherHours: periods,
        classPeriods: periods / 2,
      },
      {
        subjectCode: row.subjectCode,
        roleLabel: "učitel 2. skupiny",
        teacherId: row.secondaryTeacherId,
        teacherHours: periods,
        classPeriods: periods / 2,
      },
    ];
  }

  return [
    {
      subjectCode: row.subjectCode,
      roleLabel: "učitel celé třídy",
      teacherId: row.primaryTeacherId,
      teacherHours: periods,
      classPeriods: periods,
    },
  ];
}

function statusFor(
  assignedSlots: number,
  requiredSlots: number,
): CoverageStatus {
  if (requiredSlots > 0 && assignedSlots >= requiredSlots) return "FULL";
  if (assignedSlots > 0) return "PARTIAL";
  return "MISSING";
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

export function coverageCellKey(
  classCode: string,
  subjectCode: string,
): string {
  return `${classCode}|${subjectCode}`;
}

export function buildCoverageOverview(
  plan: TeachingPlan,
  staffingPlan: StaffingPlan,
): CoverageOverview {
  const teacherById = new Map(
    staffingPlan.teachers.map((teacher) => [teacher.id, teacher]),
  );
  const validTeacherIds = new Set(teacherById.keys());
  const cells = new Map<string, CoverageCell>();
  const scheduledByTeacher = new Map<string, number>();
  let requiredTeacherHours = 0;
  let assignedTeacherHours = 0;

  for (const row of plan.rows) {
    const roles = rolesForRow(row);
    const seenTeacherBySubject = new Map<string, Set<string>>();
    const evaluatedRoles = roles.map((role) => {
      const seen =
        seenTeacherBySubject.get(role.subjectCode) ?? new Set<string>();
      seenTeacherBySubject.set(role.subjectCode, seen);
      const assigned =
        Boolean(role.teacherId) &&
        validTeacherIds.has(role.teacherId) &&
        !seen.has(role.teacherId);
      if (assigned) seen.add(role.teacherId);
      return { role, assigned };
    });

    for (const { role, assigned } of evaluatedRoles) {
      requiredTeacherHours += role.teacherHours;
      if (assigned) {
        assignedTeacherHours += role.teacherHours;
        scheduledByTeacher.set(
          role.teacherId,
          (scheduledByTeacher.get(role.teacherId) ?? 0) + role.teacherHours,
        );
      }
    }

    for (const classCode of rowTargetClasses(row)) {
      for (const { role, assigned } of evaluatedRoles) {
        const key = coverageCellKey(classCode, role.subjectCode);
        const teacher = teacherById.get(role.teacherId);
        const cell =
          cells.get(key) ??
          ({
            key,
            classCode,
            subjectCode: role.subjectCode,
            subjectLabel: subjectLabel(role.subjectCode),
            requiredClassPeriods: 0,
            requiredTeacherHours: 0,
            assignedTeacherHours: 0,
            requiredSlots: 0,
            assignedSlots: 0,
            missingTeacherHours: 0,
            status: "MISSING",
            teacherNames: [],
            missingRoles: [],
            rows: [],
          } satisfies CoverageCell);

        cell.requiredClassPeriods += role.classPeriods;
        cell.requiredTeacherHours += role.teacherHours;
        cell.requiredSlots += 1;
        if (assigned) {
          cell.assignedSlots += 1;
          cell.assignedTeacherHours += role.teacherHours;
          const name = teacher ? teacherName(teacher) : "";
          if (name && !cell.teacherNames.includes(name)) {
            cell.teacherNames.push(name);
          }
        } else {
          cell.missingRoles.push(role.roleLabel);
        }
        cell.rows.push({
          rowId: row.id,
          roleLabel: role.roleLabel,
          teacherId: role.teacherId,
          teacherName: teacher ? teacherName(teacher) : "",
          assigned,
          teacherHours: role.teacherHours,
        });
        cells.set(key, cell);
      }
    }
  }

  const finalizedCells = [...cells.values()]
    .map((cell) => ({
      ...cell,
      requiredClassPeriods: rounded(cell.requiredClassPeriods),
      requiredTeacherHours: rounded(cell.requiredTeacherHours),
      assignedTeacherHours: rounded(cell.assignedTeacherHours),
      missingTeacherHours: rounded(
        Math.max(0, cell.requiredTeacherHours - cell.assignedTeacherHours),
      ),
      status: statusFor(cell.assignedSlots, cell.requiredSlots),
      teacherNames: [...cell.teacherNames].sort((left, right) =>
        left.localeCompare(right, "cs-CZ"),
      ),
      missingRoles: [...new Set(cell.missingRoles)],
    }))
    .sort((left, right) =>
      `${left.classCode}|${left.subjectCode}`.localeCompare(
        `${right.classCode}|${right.subjectCode}`,
        "cs-CZ",
        { numeric: true },
      ),
    );

  const cellByKey = new Map(finalizedCells.map((cell) => [cell.key, cell]));
  const classes = [...new Set(plan.classes.map((item) => item.code))].sort(
    (left, right) => left.localeCompare(right, "cs-CZ", { numeric: true }),
  );
  const usedSubjectCodes = new Set(
    finalizedCells.map((cell) => cell.subjectCode),
  );
  const knownSubjectOrder = new Map<string, number>(
    STAFFING_SUBJECTS.map((subject, index) => [subject.code, index]),
  );
  const subjects = [...usedSubjectCodes]
    .sort((left, right) => {
      const leftIndex = knownSubjectOrder.get(left) ?? 10_000;
      const rightIndex = knownSubjectOrder.get(right) ?? 10_000;
      return leftIndex - rightIndex || left.localeCompare(right, "cs-CZ");
    })
    .map((code) => ({ code, label: subjectLabel(code) }));

  const requiredClassPeriods = rounded(
    finalizedCells.reduce(
      (total, cell) => total + cell.requiredClassPeriods,
      0,
    ),
  );
  const coveredClassPeriods = rounded(
    finalizedCells.reduce((total, cell) => {
      const ratio =
        cell.requiredSlots > 0 ? cell.assignedSlots / cell.requiredSlots : 0;
      return total + cell.requiredClassPeriods * Math.min(1, ratio);
    }, 0),
  );
  const missingClassPeriods = rounded(
    Math.max(0, requiredClassPeriods - coveredClassPeriods),
  );

  const problems: CoverageProblem[] = finalizedCells
    .filter((cell) => cell.status !== "FULL")
    .map((cell) => ({
      key: cell.key,
      classCode: cell.classCode,
      subjectCode: cell.subjectCode,
      subjectLabel: cell.subjectLabel,
      status: cell.status,
      assignedSlots: cell.assignedSlots,
      requiredSlots: cell.requiredSlots,
      missingTeacherHours: cell.missingTeacherHours,
      missingRoles: cell.missingRoles,
    }))
    .sort(
      (left, right) =>
        right.missingTeacherHours - left.missingTeacherHours ||
        `${left.classCode}|${left.subjectCode}`.localeCompare(
          `${right.classCode}|${right.subjectCode}`,
          "cs-CZ",
          { numeric: true },
        ),
    );

  const breakdown = (
    codes: string[],
    keyFor: (cell: CoverageCell) => string,
    labelFor: (code: string) => string,
  ): CoverageBreakdownItem[] =>
    codes
      .map((code) => {
        const matching = finalizedCells.filter((cell) => keyFor(cell) === code);
        const required = matching.reduce(
          (total, cell) => total + cell.requiredClassPeriods,
          0,
        );
        const missing = matching.reduce((total, cell) => {
          const ratio =
            cell.requiredSlots > 0
              ? cell.assignedSlots / cell.requiredSlots
              : 0;
          return total + cell.requiredClassPeriods * (1 - Math.min(1, ratio));
        }, 0);
        return {
          code,
          label: labelFor(code),
          requiredClassPeriods: rounded(required),
          missingClassPeriods: rounded(missing),
          problemCells: matching.filter((cell) => cell.status !== "FULL")
            .length,
        };
      })
      .filter((item) => item.requiredClassPeriods > 0)
      .sort(
        (left, right) =>
          right.missingClassPeriods - left.missingClassPeriods ||
          left.label.localeCompare(right.label, "cs-CZ", { numeric: true }),
      );

  const teachers: TeacherCoverage[] = staffingPlan.teachers
    .map((teacher): TeacherCoverage => {
      const scheduledTeachingHours = rounded(
        scheduledByTeacher.get(teacher.id) ?? 0,
      );
      const nonTeachingHours = rounded(
        teacher.subjectLoads
          .filter((item) => NON_TEACHING_SUBJECT_CODES.has(item.subjectCode))
          .reduce((total, item) => total + item.weeklyPeriods, 0),
      );
      const reserveHours = rounded(
        teacher.subjectLoads
          .filter((item) => item.subjectCode === "REZERVA")
          .reduce((total, item) => total + item.weeklyPeriods, 0),
      );
      const totalUsedHours = rounded(scheduledTeachingHours + nonTeachingHours);
      const difference = rounded(teacher.targetWeeklyLoad - totalUsedHours);
      return {
        teacherId: teacher.id,
        teacherName: teacherName(teacher),
        scheduledTeachingHours,
        nonTeachingHours,
        reserveHours,
        targetWeeklyLoad: teacher.targetWeeklyLoad,
        totalUsedHours,
        difference,
        status: difference === 0 ? "FULL" : difference > 0 ? "UNDER" : "OVER",
      };
    })
    .sort((left, right) => {
      const rank = { OVER: 0, UNDER: 1, FULL: 2 } as const;
      return (
        rank[left.status] - rank[right.status] ||
        Math.abs(right.difference) - Math.abs(left.difference) ||
        left.teacherName.localeCompare(right.teacherName, "cs-CZ")
      );
    });

  const fullCells = finalizedCells.filter(
    (cell) => cell.status === "FULL",
  ).length;
  const partialCells = finalizedCells.filter(
    (cell) => cell.status === "PARTIAL",
  ).length;
  const missingCells = finalizedCells.filter(
    (cell) => cell.status === "MISSING",
  ).length;
  const missingTeacherHours = rounded(
    Math.max(0, requiredTeacherHours - assignedTeacherHours),
  );

  return {
    cells: finalizedCells,
    cellByKey,
    classes,
    subjects,
    problems,
    classBreakdown: breakdown(
      classes,
      (cell) => cell.classCode,
      (code) => code,
    ),
    subjectBreakdown: breakdown(
      subjects.map((subject) => subject.code),
      (cell) => cell.subjectCode,
      subjectLabel,
    ),
    teachers,
    summary: {
      requiredClassPeriods,
      coveredClassPeriods,
      missingClassPeriods,
      requiredTeacherHours: rounded(requiredTeacherHours),
      assignedTeacherHours: rounded(assignedTeacherHours),
      missingTeacherHours,
      coveragePercent:
        requiredTeacherHours > 0
          ? Math.round((assignedTeacherHours / requiredTeacherHours) * 100)
          : 0,
      fullCells,
      partialCells,
      missingCells,
      problemCells: partialCells + missingCells,
    },
  };
}
