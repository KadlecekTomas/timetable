import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import { analyzeStaffingWorkbook } from "../lib/import/staffing-workbook-school-v2";
import type { StaffingAllocationDraft } from "../lib/local/staffing-allocation-draft";
import { createDefaultSchoolCurriculum } from "../lib/local/school-default-data";
import {
  teachingTargetWeeklyLoad,
  type StaffingPlan,
} from "../lib/local/staffing-plan-school-v2";
import {
  createDefaultSchoolTeachingPlan,
  loadTeachingPlan,
  rowTeacherPeriods,
} from "../lib/local/teaching-plan-school-v2";

const CLASS_CODES = [
  "6.A",
  "6.B",
  "6.C",
  "6.D",
  "7.A",
  "7.B",
  "7.C",
  "8.A",
  "8.B",
  "8.C",
  "9.A",
  "9.B",
  "9.C",
] as const;

function staffingPlan(): StaffingPlan {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    teachers: [
      {
        id: "teacher-kadlecek",
        firstName: "Tomáš",
        lastName: "Kadleček",
        targetWeeklyLoad: 22,
        subjectLoads: [
          { id: "k-inf", subjectCode: "INF", weeklyPeriods: 13 },
          { id: "k-tv", subjectCode: "TV", weeklyPeriods: 4 },
          {
            id: "k-ict",
            subjectCode: "ICT_VEDENI",
            weeklyPeriods: 5,
          },
        ],
        unavailableDays: [],
      },
      {
        id: "teacher-sarova",
        firstName: "Eliška",
        lastName: "Šárová",
        targetWeeklyLoad: 4,
        subjectLoads: [{ id: "s-tv", subjectCode: "TV", weeklyPeriods: 4 }],
        unavailableDays: [],
      },
    ],
  };
}

function allocationDraft(): StaffingAllocationDraft {
  return {
    version: 1,
    source: "LEGACY_SCHOOL_MATRIX",
    rows: [
      ...CLASS_CODES.map((classCode, index) => ({
        classCode,
        subjectCode: "INF",
        weeklyPeriods: 1,
        group: "WHOLE" as const,
        teacherIds: ["teacher-kadlecek"],
        sourceSheet: "Úvazky 20252026",
        sourceRow: 44 + index,
      })),
      ...["9.A", "9.C"].map((classCode, index) => ({
        classCode,
        subjectCode: "TV",
        weeklyPeriods: 2,
        group: "WHOLE" as const,
        teacherIds: ["teacher-kadlecek", "teacher-sarova"],
        sourceSheet: "Úvazky 20252026",
        sourceRow: 85 + index,
      })),
    ],
  };
}

test("supplied curriculum is seeded and staffing evidence decides split teaching", () => {
  const curriculum = createDefaultSchoolCurriculum();
  const regularTotal = curriculum.profiles.REGULAR.subjects.reduce(
    (total, subject) =>
      total +
      Object.values(subject.weeklyPeriodsByGrade).reduce(
        (sum, value) => sum + value,
        0,
      ),
    0,
  );
  const sportsTotal = curriculum.profiles.SPORTS.subjects.reduce(
    (total, subject) =>
      total +
      Object.values(subject.weeklyPeriodsByGrade).reduce(
        (sum, value) => sum + value,
        0,
      ),
    0,
  );
  assert.equal(regularTotal, 120);
  assert.equal(sportsTotal, 124);

  for (const profile of [
    curriculum.profiles.REGULAR,
    curriculum.profiles.SPORTS,
  ]) {
    assert.deepEqual(
      profile.subjects.find((subject) => subject.subjectCode === "FY")
        ?.weeklyPeriodsByGrade,
      { "6": 2, "7": 2, "8": 2, "9": 2 },
    );
    const electives = profile.subjects.find(
      (subject) => subject.subjectCode === "VOL",
    );
    assert.equal(electives?.weeklyPeriodsByGrade["6"], 0);
    assert.equal(electives?.weeklyPeriodsByGrade["7"], 0);
  }

  const plan = createDefaultSchoolTeachingPlan(
    curriculum,
    staffingPlan(),
    allocationDraft(),
  );
  assert.equal(plan.classes.length, 13);
  assert.equal(
    plan.rows.reduce((total, row) => total + row.weeklyPeriods, 0),
    394,
  );

  const informatics = plan.rows.filter((row) => row.subjectCode === "INF");
  assert.equal(informatics.length, 13);
  assert.ok(
    informatics.every(
      (row) =>
        row.organization === "WHOLE" &&
        row.primaryTeacherId === "teacher-kadlecek",
    ),
    "One teacher in the staffing matrix must mean one whole-class assignment.",
  );

  const czech6A = plan.rows.find(
    (row) => row.classCode === "6.A" && row.subjectCode === "CJ",
  );
  assert.equal(czech6A?.organization, "WHOLE");

  const tv9A = plan.rows.find(
    (row) => row.classCode === "9.A" && row.subjectCode === "TV",
  );
  const tv9C = plan.rows.find(
    (row) => row.classCode === "9.C" && row.subjectCode === "TV",
  );
  assert.ok(tv9A && tv9C);
  if (!tv9A || !tv9C) throw new Error("Both ninth-grade TV rows are required.");
  assert.notEqual(tv9A.id, tv9C.id);
  assert.equal(tv9A.weeklyPeriods, 2);
  assert.equal(tv9C.weeklyPeriods, 2);
  assert.equal(tv9A.lessonShape, "DOUBLE");
  assert.equal(tv9C.lessonShape, "DOUBLE");
  assert.equal(tv9A.organization, "SPLIT");
  assert.equal(tv9C.organization, "SPLIT");
  assert.deepEqual(tv9A.additionalClassCodes ?? [], []);
  assert.deepEqual(tv9C.additionalClassCodes ?? [], []);
  assert.equal(tv9A.primaryTeacherId, "teacher-kadlecek");
  assert.equal(tv9A.secondaryTeacherId, "teacher-sarova");

  const teacher = staffingPlan().teachers[0]!;
  const scheduledAndDuties = plan.rows.reduce(
    (total, row) => total + rowTeacherPeriods(row, teacher.id),
    0,
  );
  assert.equal(teachingTargetWeeklyLoad(teacher), 17);
  assert.equal(scheduledAndDuties, 22);
});

test("empty local data still loads the supplied curriculum", () => {
  const plan = loadTeachingPlan();
  assert.equal(plan.classes.length, 13);
  assert.equal(
    plan.rows.reduce((total, row) => total + row.weeklyPeriods, 0),
    394,
  );
});

test("+5 in the staffing workbook becomes ICT leadership, not reserve", async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Úvazky 20252026");
  workbook.addWorksheet("Jednotlivci");

  worksheet.getCell("A11").value = 22;
  worksheet.getCell("C11").value = "Kadleček Tomáš+5";
  worksheet.getCell("D11").value = 22;
  worksheet.getCell("C41").value = "6.A";
  worksheet.getCell("D41").value = "Třídní Učitel";
  worksheet.getCell("C43").value = "Předměty";
  worksheet.getCell("D43").value = "Učitel/učitelka";
  worksheet.getCell("E43").value = "Časová dotace";
  worksheet.getCell("C44").value = "Inf";
  worksheet.getCell("D44").value = "Kadleček";
  worksheet.getCell("E44").value = 13;
  worksheet.getCell("C45").value = "Tv";
  worksheet.getCell("D45").value = "Kadleček";
  worksheet.getCell("E45").value = 4;

  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  const analysis = await analyzeStaffingWorkbook(bytes);
  const teacher = analysis.plan.teachers.find(
    (item) => item.lastName === "Kadleček",
  );
  assert.ok(teacher);
  if (!teacher) throw new Error("Kadleček must be imported.");
  assert.equal(teacher.targetWeeklyLoad, 22);
  assert.equal(teachingTargetWeeklyLoad(teacher), 17);
  assert.equal(
    teacher.subjectLoads.find((item) => item.subjectCode === "ICT_VEDENI")
      ?.weeklyPeriods,
    5,
  );
  assert.equal(
    teacher.subjectLoads.find((item) => item.subjectCode === "REZERVA"),
    undefined,
  );
  assert.ok(
    analysis.issues.some((item) =>
      item.message.includes("Nejde o volnou kapacitu pro další výuku"),
    ),
  );
});
