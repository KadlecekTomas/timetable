import assert from "node:assert/strict";
import test from "node:test";

import { applySchoolTeacherAvailabilityDefaults } from "../lib/local/school-teacher-availability-defaults";
import type { StaffingPlan, StaffingTeacher } from "../lib/local/staffing-plan";

function teacher(
  id: string,
  lastName: string,
  firstName = "",
): StaffingTeacher {
  return {
    id,
    firstName,
    lastName,
    targetWeeklyLoad: 1,
    baseWeeklyLoad: 1,
    subjectLoads: [
      { id: `${id}:subject`, subjectCode: "CJ", weeklyPeriods: 1 },
    ],
    unavailableDays: [],
    unavailablePeriods: [],
  };
}

function plan(): StaffingPlan {
  return {
    version: 1,
    updatedAt: "test",
    teachers: [
      teacher("cerna", "Černá", "Veronika"),
      teacher("dostalova", "Dostálová", "Kateřina"),
      teacher("jislova", "Jislová", "Anežka"),
      teacher("kadlecek", "Kadleček", "Tomáš"),
      teacher("kvapilova", "Kvapilová"),
      teacher("liskova", "Lišková", "Jiřina"),
      teacher("moravcova", "Moravcová", "Myřátská"),
      teacher("pokorna", "Pokorná", "Jaroslava"),
      teacher("sarova", "Šárová", "Eliška"),
      teacher("sobotnik", "Šobotník", "Jan"),
      teacher("spankova", "Špánková"),
      teacher("vasakova", "Vašáková", "Nikola"),
      teacher("vavrincova", "Vavřincová", "Anna"),
      teacher("vosykova", "Vosyková", "Božena"),
      teacher("zindulkova", "Zindulková", "Zina"),
      teacher("indrakova", "Indráková"),
      teacher("jakoubkova", "Jakoubková", "Zuzana"),
      teacher("wild", "Wild", "Pavel"),
      teacher("hankova", "Hanková", "Eva"),
    ],
  };
}

function unavailable(
  result: StaffingPlan,
  id: string,
): Array<[string, number]> {
  const item = result.teachers.find((teacher) => teacher.id === id)!;
  return (item.unavailablePeriods ?? []).map((period) => [
    period.day,
    period.period + 1,
  ]);
}

test("school defaults match all teachers by surname without requiring first names", () => {
  const input = plan();
  input.teachers.find((item) => item.id === "cerna")!.unavailableDays = ["WED"];

  const applied = applySchoolTeacherAvailabilityDefaults(input);

  assert.equal(applied.matchedSurnames.length, 19);
  assert.deepEqual(applied.unmatchedSurnames, []);
  assert.deepEqual(applied.ambiguousSurnames, []);

  assert.deepEqual(
    applied.plan.teachers.find((item) => item.id === "cerna")!.unavailableDays,
    ["TUE", "WED", "FRI"],
    "existing manual restrictions are preserved when school defaults are added",
  );
  assert.deepEqual(
    applied.plan.teachers.find((item) => item.id === "kvapilova")!
      .unavailableDays,
    [],
  );
  assert.deepEqual(
    applied.plan.teachers.find((item) => item.id === "spankova")!
      .unavailableDays,
    ["MON", "FRI"],
  );
  assert.deepEqual(unavailable(applied.plan, "kvapilova"), [
    ["THU", 3],
    ["THU", 4],
    ["THU", 5],
    ["THU", 6],
    ["THU", 7],
    ["THU", 8],
  ]);
});

test("diacritics are ignored and exact school restrictions are preserved", () => {
  const applied = applySchoolTeacherAvailabilityDefaults(plan()).plan;

  assert.deepEqual(unavailable(applied, "dostalova"), [
    ["THU", 5],
    ["THU", 6],
    ["THU", 7],
    ["THU", 8],
  ]);
  assert.deepEqual(unavailable(applied, "indrakova"), [
    ["MON", 5],
    ["TUE", 3],
    ["TUE", 4],
    ["TUE", 5],
    ["WED", 4],
    ["WED", 5],
    ["THU", 3],
    ["THU", 4],
  ]);
  assert.deepEqual(unavailable(applied, "jakoubkova"), [
    ["MON", 6],
    ["THU", 5],
    ["FRI", 3],
    ["FRI", 4],
  ]);
  assert.deepEqual(unavailable(applied, "wild"), [
    ["MON", 5],
    ["FRI", 4],
  ]);
  assert.deepEqual(unavailable(applied, "hankova"), [
    ["MON", 2],
    ["MON", 3],
    ["MON", 4],
    ["MON", 5],
    ["TUE", 1],
    ["TUE", 3],
    ["TUE", 4],
    ["TUE", 5],
    ["WED", 2],
    ["WED", 4],
    ["WED", 5],
    ["THU", 1],
    ["THU", 3],
    ["THU", 4],
    ["THU", 5],
    ["FRI", 5],
  ]);
});
