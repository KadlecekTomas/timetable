import ExcelJS from "exceljs";

import {
  clearStaffingAllocationDraft,
  saveStaffingAllocationDraft,
} from "@/lib/local/staffing-allocation-draft";
import {
  NON_TEACHING_SUBJECT_CODES,
  type StaffingSubjectLoad,
} from "@/lib/local/staffing-plan";
import {
  analyzeStaffingWorkbook as analyzeSchoolStaffingWorkbook,
  createStaffingWorkbookTemplate,
  type StaffingWorkbookAnalysis,
  type StaffingWorkbookIssue,
} from "./staffing-workbook-school";
import {
  cleanName,
  correctedTeacherKey,
} from "./legacy-school-workbook-parser";
import {
  analyzeLegacyStaffingPlan,
  type LegacyStaffingPlanAnalysis,
} from "./legacy-staffing-plan";

export {
  createStaffingWorkbookTemplate,
  type StaffingWorkbookAnalysis,
  type StaffingWorkbookIssue,
};

function supplementalHoursByTeacher(
  workbook: ExcelJS.Workbook,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const worksheet of workbook.worksheets) {
    if (!worksheet.name.toLocaleLowerCase("cs-CZ").startsWith("úvazky")) {
      continue;
    }
    for (let row = 1; row <= worksheet.rowCount; row += 1) {
      const rawName = worksheet.getCell(row, 3).text.trim();
      const match = rawName.match(/\+\s*(\d+)\b/);
      if (!match) continue;
      const name = cleanName(rawName).split(" ")[0] ?? "";
      const key = correctedTeacherKey(name);
      const hours = Number(match[1]);
      if (!key || !Number.isInteger(hours) || hours <= 0) continue;
      result.set(key, Math.max(result.get(key) ?? 0, hours));
    }
  }
  return result;
}

function nonTeachingCode(teacherKey: string): "ICT_VEDENI" | "NEVYUKA" {
  return teacherKey === "kadlecek" ? "ICT_VEDENI" : "NEVYUKA";
}

function moveSupplementalHoursOutOfReserve(
  analysis: LegacyStaffingPlanAnalysis,
  workbook: ExcelJS.Workbook,
): LegacyStaffingPlanAnalysis {
  const supplemental = supplementalHoursByTeacher(workbook);
  if (supplemental.size === 0) return analysis;

  analysis.plan.teachers = analysis.plan.teachers.map((teacher) => {
    const key = correctedTeacherKey(teacher.lastName);
    const requested = supplemental.get(key) ?? 0;
    if (requested <= 0) return teacher;

    const existingNonTeaching = teacher.subjectLoads
      .filter((item) => NON_TEACHING_SUBJECT_CODES.has(item.subjectCode))
      .reduce((total, item) => total + item.weeklyPeriods, 0);
    const reserve = teacher.subjectLoads.find(
      (item) => item.subjectCode === "REZERVA",
    );
    const available = reserve?.weeklyPeriods ?? 0;
    const moved = Math.min(requested, available);
    if (moved <= 0 || existingNonTeaching > 0) return teacher;

    const subjectLoads: StaffingSubjectLoad[] = teacher.subjectLoads
      .flatMap((item) => {
        if (item.subjectCode !== "REZERVA") return [item];
        const remaining = item.weeklyPeriods - moved;
        return remaining > 0 ? [{ ...item, weeklyPeriods: remaining }] : [];
      })
      .concat({
        id: `${teacher.id}-non-teaching`,
        subjectCode: nonTeachingCode(key),
        weeklyPeriods: moved,
      });

    analysis.issues = analysis.issues.filter(
      (item) =>
        !(item.field === "Rezerva" && item.message.includes(teacher.lastName)),
    );
    analysis.issues.push({
      severity: "WARNING",
      row: null,
      field: "Nevýuková činnost",
      message:
        key === "kadlecek"
          ? `${teacher.firstName} ${teacher.lastName}: ${moved} h je evidováno jako vedení ICT. Nejde o volnou kapacitu pro další výuku.`
          : `${teacher.firstName} ${teacher.lastName}: ${moved} h je evidováno jako nevýuková činnost. Nejde o volnou kapacitu pro další výuku.`,
    });

    if (requested > moved) {
      analysis.issues.push({
        severity: "WARNING",
        row: null,
        field: "Nevýuková činnost",
        message: `${teacher.firstName} ${teacher.lastName}: ze značky +${requested} bylo možné bezpečně převést jen ${moved} h, protože zbytek není krytý uvedeným úvazkem.`,
      });
    }

    return { ...teacher, subjectLoads };
  });

  analysis.summary.reserveWeeklyLoad = analysis.plan.teachers.reduce(
    (total, teacher) =>
      total +
      teacher.subjectLoads
        .filter((item) => item.subjectCode === "REZERVA")
        .reduce((sum, item) => sum + item.weeklyPeriods, 0),
    0,
  );
  analysis.summary.assignedWeeklyLoad = analysis.plan.teachers.reduce(
    (total, teacher) =>
      total +
      teacher.subjectLoads.reduce((sum, item) => sum + item.weeklyPeriods, 0),
    0,
  );

  return analysis;
}

export async function analyzeStaffingWorkbook(
  input: ArrayBuffer | Uint8Array,
): Promise<StaffingWorkbookAnalysis | LegacyStaffingPlanAnalysis> {
  const workbook = new ExcelJS.Workbook();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  try {
    await workbook.xlsx.load(bytes as never);
  } catch {
    return analyzeSchoolStaffingWorkbook(input);
  }

  const legacy = analyzeLegacyStaffingPlan(workbook);
  if (legacy) {
    moveSupplementalHoursOutOfReserve(legacy, workbook);
    if (legacy.valid && legacy.allocationDraft) {
      saveStaffingAllocationDraft(legacy.allocationDraft);
    }
    return legacy;
  }

  const analysis = await analyzeSchoolStaffingWorkbook(input);
  if (analysis.valid) clearStaffingAllocationDraft();
  return analysis;
}
