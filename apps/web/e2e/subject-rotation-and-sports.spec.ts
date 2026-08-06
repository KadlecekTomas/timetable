import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const artifactDirectory = path.join(
  process.cwd(),
  "test-results",
  "subject-rotation-screenshots",
);

async function capture(page: Page, name: string): Promise<void> {
  await mkdir(artifactDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(artifactDirectory, name),
    fullPage: true,
    animations: "disabled",
  });
}

const staffing = {
  version: 1,
  updatedAt: "2026-08-02T00:00:00.000Z",
  teachers: [
    {
      id: "teacher-cj",
      firstName: "Český",
      lastName: "Učitel",
      targetWeeklyLoad: 3,
      unavailableDays: [],
      subjectLoads: [{ id: "load-cj", subjectCode: "CJ", weeklyPeriods: 3 }],
    },
    {
      id: "teacher-m",
      firstName: "Matematický",
      lastName: "Učitel",
      targetWeeklyLoad: 3,
      unavailableDays: [],
      subjectLoads: [{ id: "load-m", subjectCode: "M", weeklyPeriods: 3 }],
    },
    {
      id: "teacher-tv",
      firstName: "Sportovní",
      lastName: "Učitel",
      targetWeeklyLoad: 4,
      unavailableDays: [],
      subjectLoads: [{ id: "load-tv", subjectCode: "TV", weeklyPeriods: 4 }],
    },
  ],
};

const plan = {
  version: 1,
  updatedAt: "2026-08-02T00:00:00.000Z",
  classes: [
    { id: "class-6a", code: "6.A", grade: 6, profile: "REGULAR" },
    { id: "class-6b", code: "6.B", grade: 6, profile: "SPORTS" },
  ],
  rows: [
    {
      id: "6a-cj",
      classCode: "6.A",
      subjectCode: "CJ",
      secondarySubjectCode: "",
      weeklyPeriods: 1,
      lessonShape: "SEPARATE",
      doublePeriodsCount: 0,
      organization: "WHOLE",
      rotationPlacement: "SAME_DAY",
      primaryTeacherId: "teacher-cj",
      secondaryTeacherId: "",
    },
    {
      id: "6a-m",
      classCode: "6.A",
      subjectCode: "M",
      secondarySubjectCode: "",
      weeklyPeriods: 1,
      lessonShape: "SEPARATE",
      doublePeriodsCount: 0,
      organization: "WHOLE",
      rotationPlacement: "SAME_DAY",
      primaryTeacherId: "teacher-m",
      secondaryTeacherId: "",
    },
    {
      id: "6a-tv",
      classCode: "6.A",
      subjectCode: "TV",
      secondarySubjectCode: "",
      weeklyPeriods: 2,
      lessonShape: "SEPARATE",
      doublePeriodsCount: 0,
      organization: "WHOLE",
      rotationPlacement: "SAME_DAY",
      primaryTeacherId: "teacher-tv",
      secondaryTeacherId: "",
    },
    {
      id: "rotation-6b-cj-m",
      classCode: "6.B",
      subjectCode: "CJ",
      secondarySubjectCode: "M",
      weeklyPeriods: 1,
      lessonShape: "SEPARATE",
      doublePeriodsCount: 0,
      organization: "ROTATION",
      rotationPlacement: "SAME_DAY",
      primaryTeacherId: "teacher-cj",
      secondaryTeacherId: "teacher-m",
    },
    {
      id: "6b-tv",
      classCode: "6.B",
      subjectCode: "TV",
      secondarySubjectCode: "",
      weeklyPeriods: 2,
      lessonShape: "SEPARATE",
      doublePeriodsCount: 0,
      organization: "WHOLE",
      rotationPlacement: "SAME_DAY",
      primaryTeacherId: "teacher-tv",
      secondaryTeacherId: "",
    },
  ],
};

async function readProject(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        classes: Array<{ id: string; code: string; profile: string }>;
        subjects: Array<{ id: string; code: string }>;
        assignments: Array<{
          id: string;
          classId: string;
          subjectId: string;
          weeklyPeriods: number;
          parallelKey: string | null;
          rotationKey: string | null;
          rotationLeg: number | null;
          rotationPlacement: string | null;
          group: string;
        }>;
        timetableVersions: Array<{
          snapshot: {
            assignments: Array<{
              id: string;
              rotation_key?: string | null;
              rotation_leg?: number | null;
              rotation_placement?: string | null;
              subject_id: string;
              teacher_id: string;
              group: string;
            }>;
          };
          lessons: Array<{
            assignment_id: string;
            day: number;
            period: number;
          }>;
        }>;
      }>((resolve, reject) => {
        const openRequest = indexedDB.open("rozvrhar-local", 1);
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const transaction = database.transaction("state", "readonly");
          const request = transaction
            .objectStore("state")
            .get("active-project");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
          transaction.oncomplete = () => database.close();
        };
      }),
  );
}

test("sports B class keeps A allocation and Czech-Math groups swap atomically", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto("/staffing?schoolYearId=local-school-year");
  await page.evaluate((value) => {
    localStorage.setItem("rozvrhar:staffing-plan:v1", JSON.stringify(value));
  }, staffing);
  await page.reload();
  await expect(page.getByText("Všichni učitelé jsou připraveni")).toBeVisible();
  await page
    .getByRole("button", { name: "Uložit učitele do projektu" })
    .click();
  await expect(page.getByText(/Hotovo\. Uloženo 3 učitelů/)).toBeVisible();

  await page.goto("/teaching-plan?schoolYearId=local-school-year");
  await page.evaluate((value) => {
    localStorage.setItem("rozvrhar:teaching-plan:v1", JSON.stringify(value));
  }, plan);
  await page.reload();

  await page.getByRole("button", { name: /^6\.B/ }).first().click();
  await expect(page.getByLabel("Profil třídy 6.B")).toHaveValue("SPORTS");
  await expect(page.getByText("3 / 3 h")).toHaveCount(2);
  await expect(page.getByText("4 / 4 h")).toHaveCount(1);
  await expect(page.getByText("Výuka tříd je připravená")).toBeVisible();
  await capture(page, "12-stejna-dotace-a-atomicka-rotace.png");

  await page.getByRole("button", { name: "Uložit výuku do projektu" }).click();
  await expect(
    page.getByText(
      "Hotovo. Uloženo 5 nastavení jako 8 výukových vazeb včetně dvojhodin, dělení a výměn předmětů.",
    ),
  ).toBeVisible();

  const stored = await readProject(page);
  expect(
    stored.classes.map((schoolClass) => [
      schoolClass.code,
      schoolClass.profile,
    ]),
  ).toEqual([
    ["6.A", "REGULAR"],
    ["6.B", "SPORTS"],
  ]);

  const classCodeById = new Map(
    stored.classes.map((schoolClass) => [schoolClass.id, schoolClass.code]),
  );
  const subjectCodeById = new Map(
    stored.subjects.map((subject) => [subject.id, subject.code]),
  );
  const allocation = new Map<string, number>();
  for (const assignment of stored.assignments) {
    if (assignment.rotationKey && assignment.group === "GROUP_2") continue;
    const classCode = classCodeById.get(assignment.classId);
    const subjectCode = subjectCodeById.get(assignment.subjectId);
    if (!classCode || !subjectCode) continue;
    const key = `${classCode}:${subjectCode}`;
    allocation.set(key, (allocation.get(key) ?? 0) + assignment.weeklyPeriods);
  }
  expect(allocation).toEqual(
    new Map([
      ["6.A:CJ", 1],
      ["6.A:M", 1],
      ["6.A:TV", 2],
      ["6.B:CJ", 1],
      ["6.B:M", 1],
      ["6.B:TV", 2],
    ]),
  );

  await page.goto("/generate?schoolYearId=local-school-year");
  await expect(
    page.getByRole("heading", { name: "Zadání je připravené" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vytvořit nový návrh" }).click();
  await expect(
    page.getByText(/^(Proveditelný návrh|Optimální návrh)$/),
  ).toBeVisible({ timeout: 120_000 });

  const generated = await readProject(page);
  const latest = generated.timetableVersions[0]!;
  const rotationAssignments = latest.snapshot.assignments.filter(
    (assignment) => assignment.rotation_key,
  );
  expect(rotationAssignments).toHaveLength(4);
  expect(
    rotationAssignments.every(
      (assignment) => assignment.rotation_placement === "SAME_DAY",
    ),
  ).toBe(true);

  const lessonByAssignment = new Map(
    latest.lessons.map((lesson) => [lesson.assignment_id, lesson]),
  );
  const legSlots = new Map<number, Set<string>>();
  for (const assignment of rotationAssignments) {
    const lesson = lessonByAssignment.get(assignment.id)!;
    const leg = assignment.rotation_leg!;
    const slots = legSlots.get(leg) ?? new Set<string>();
    slots.add(`${lesson.day}:${lesson.period}`);
    legSlots.set(leg, slots);
  }
  expect(legSlots.get(1)?.size).toBe(1);
  expect(legSlots.get(2)?.size).toBe(1);
  const [leg1Slot] = [...legSlots.get(1)!];
  const [leg2Slot] = [...legSlots.get(2)!];
  const [leg1Day, leg1Period] = leg1Slot.split(":").map(Number);
  const [leg2Day, leg2Period] = leg2Slot.split(":").map(Number);
  expect(leg1Day).toBe(leg2Day);
  expect(leg1Period).not.toBe(leg2Period);
  await capture(page, "13-vygenerovana-atomicka-rotace.png");
});
