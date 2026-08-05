import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCoverageOverview,
  coverageCellKey,
} from "../lib/domain/coverage-overview";
import { createEmptyStaffingPlan } from "../lib/local/staffing-plan-school-v2";
import {
  applySchoolOperationalRules,
  createEmptyTeachingPlan,
  createTeachingPlanRow,
} from "../lib/local/teaching-plan-school-v3";

const mandatorySubjects = ["CJ", "M", "INF", "TV", "JAZ1", "JAZ2"];

test("current school plan always requires two groups for mandatory split subjects", () => {
  const staffingPlan = createEmptyStaffingPlan();
  const plan = createEmptyTeachingPlan();
  plan.rows = [
    ...mandatorySubjects.map((subjectCode) => ({
      ...createTeachingPlanRow("6.A", subjectCode),
      weeklyPeriods: subjectCode === "INF" ? 1 : 2,
      organization: "WHOLE" as const,
    })),
    {
      ...createTeachingPlanRow("6.A", "DEJ"),
      weeklyPeriods: 2,
      organization: "WHOLE" as const,
    },
  ];

  const enforced = applySchoolOperationalRules(plan, staffingPlan, null);

  for (const subjectCode of mandatorySubjects) {
    const row = enforced.rows.find(
      (item) => item.classCode === "6.A" && item.subjectCode === subjectCode,
    );
    assert.equal(row?.organization, "SPLIT", subjectCode);
  }
  assert.equal(
    enforced.rows.find((item) => item.subjectCode === "DEJ")?.organization,
    "WHOLE",
  );

  const overview = buildCoverageOverview(enforced, staffingPlan);
  for (const subjectCode of mandatorySubjects) {
    const cell = overview.cellByKey.get(coverageCellKey("6.A", subjectCode));
    assert.equal(cell?.requiredSlots, 2, subjectCode);
    assert.equal(cell?.assignedSlots, 0, subjectCode);
  }
  assert.equal(
    overview.cellByKey.get(coverageCellKey("6.A", "DEJ"))?.requiredSlots,
    1,
  );
});

test("rotations remain rotations even when they contain split subject codes", () => {
  const staffingPlan = createEmptyStaffingPlan();
  const plan = createEmptyTeachingPlan();
  plan.rows = [
    {
      ...createTeachingPlanRow("6.A", "M"),
      secondarySubjectCode: "CJ",
      weeklyPeriods: 2,
      organization: "ROTATION",
    },
  ];

  const enforced = applySchoolOperationalRules(plan, staffingPlan, null);
  assert.equal(enforced.rows[0]?.organization, "ROTATION");
});

test("second foreign language is shared by grade and grade-seven electives disappear", () => {
  const staffingPlan = createEmptyStaffingPlan();
  staffingPlan.teachers = [
    {
      id: "teacher-language-one",
      firstName: "Jana",
      lastName: "Němcová",
      targetWeeklyLoad: 3,
      subjectLoads: [
        {
          id: "language-one",
          subjectCode: "JAZ2",
          weeklyPeriods: 3,
        },
      ],
      unavailableDays: [],
    },
    {
      id: "teacher-language-two",
      firstName: "Petr",
      lastName: "Francouz",
      targetWeeklyLoad: 3,
      subjectLoads: [
        {
          id: "language-two",
          subjectCode: "JAZ2",
          weeklyPeriods: 3,
        },
      ],
      unavailableDays: [],
    },
  ];
  const plan = createEmptyTeachingPlan();
  plan.rows = [
    ...["7.A", "7.B", "7.C"].map((classCode) => ({
      ...createTeachingPlanRow(classCode, "VOL"),
      weeklyPeriods: 2,
      primaryTeacherId: "teacher-language-one",
    })),
    ...["8.A", "8.B", "8.C"].map((classCode, index) => ({
      ...createTeachingPlanRow(classCode, "JAZ2"),
      weeklyPeriods: 3,
      organization: "SPLIT" as const,
      primaryTeacherId: "teacher-language-one",
      secondaryTeacherId: index === 1 ? "teacher-language-two" : "",
    })),
  ];

  const enforced = applySchoolOperationalRules(plan, staffingPlan, null);
  assert.equal(
    enforced.rows.some(
      (row) =>
        row.subjectCode === "VOL" &&
        [row.classCode, ...(row.additionalClassCodes ?? [])].some((classCode) =>
          classCode.startsWith("7."),
        ),
    ),
    false,
  );

  const languages = enforced.rows.filter((row) => row.subjectCode === "JAZ2");
  assert.equal(languages.length, 1);
  assert.equal(languages[0]?.classCode, "8.A");
  assert.deepEqual(languages[0]?.additionalClassCodes, ["8.B", "8.C"]);
  assert.equal(languages[0]?.primaryTeacherId, "teacher-language-one");
  assert.equal(languages[0]?.secondaryTeacherId, "teacher-language-two");
  assert.match(languages[0]?.sharedGroupLabel ?? "", /8\. ročník/);

  const overview = buildCoverageOverview(enforced, staffingPlan);
  for (const classCode of ["8.A", "8.B", "8.C"]) {
    const cell = overview.cellByKey.get(coverageCellKey(classCode, "JAZ2"));
    assert.equal(cell?.status, "FULL");
    assert.deepEqual(cell?.sharedClassCodes, ["8.A", "8.B", "8.C"]);
  }
  assert.equal(
    overview.teachers.find(
      (teacher) => teacher.teacherId === "teacher-language-one",
    )?.scheduledTeachingHours,
    3,
  );
  assert.equal(
    overview.teachers.find(
      (teacher) => teacher.teacherId === "teacher-language-two",
    )?.scheduledTeachingHours,
    3,
  );
});
