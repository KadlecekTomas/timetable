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
      targetWeeklyLoad: 6,
      unavailableDays: [],
      subjectLoads: [{ id: "load-cj", subjectCode: "CJ", weeklyPeriods: 6 }],
    },
    {
      id: "teacher-m",
      firstName: "Matematický",
      lastName: "Učitel",
      targetWeeklyLoad: 6,
      unavailableDays: [],
      subjectLoads: [{ id: "load-m", subjectCode: "M", weeklyPeriods: 6 }],
    },
    {
      id: "teacher-tv",
      firstName: "Sportovní",
      lastName: "Učitel",
      targetWeeklyLoad: 6,
      unavailableDays: [],
      subjectLoads: [{ id: "load-tv", subjectCode: "TV", weeklyPeriods: 6 }],
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
      weeklyPeriods: 4,
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
      weeklyPeriods: 4,
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
      rotationPlacement: "ADJACENT",
      primaryTeacherId: "teacher-cj",
      secondaryTeacherId: "teacher-m",
    },
    {
      id: "6b-tv",
      classCode: "6.B",
      subjectCode: "TV",
      secondarySubjectCode: "",
      weeklyPeriods: 4,
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
          assignmentCode: string;
          classId: string;
          subjectId: string;
          teacherId: string;
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
              parallel_key?: string | null;
              subject_id: string;
              teacher_id: string;
              group: string;
            }>;
          };
          lessons: Array<{
            assignment_id: string;
            day: number;
            period: number;
            duration: number;
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

test("sports class keeps its own allocation and Czech-Math groups swap atomically", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

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

  await expect(page.getByRole("heading", { name: "Třída 6.A" })).toBeVisible();
  await expect(page.getByLabel("Profil třídy 6.A")).toHaveValue("REGULAR");
  await page.getByRole("button", { name: /^6\.B/ }).first().click();
  await expect(page.getByRole("heading", { name: "Třída 6.B" })).toBeVisible();
  await expect(page.getByLabel("Profil třídy 6.B")).toHaveValue("SPORTS");
  await expect(
    page.getByRole("button", { name: "Dvě skupiny – výměna předmětů" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Hned po sobě" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("rotation-preview-0")).toContainText(
    "1. rameno",
  );
  await expect(page.getByTestId("rotation-preview-0")).toContainText(
    "2. rameno – prohozeno",
  );
  await expect(page.getByText("6 / 6 h")).toHaveCount(3);
  await expect(page.getByText("Výuka tříd je připravená")).toBeVisible();
  await capture(page, "12-bezna-6a-sportovni-6b-a-vymena-cj-m.png");

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
  const classIdByCode = new Map(
    stored.classes.map((schoolClass) => [schoolClass.code, schoolClass.id]),
  );
  const subjectCodeById = new Map(
    stored.subjects.map((subject) => [subject.id, subject.code]),
  );
  const allocation = new Map<string, number>();
  for (const assignment of stored.assignments) {
    if (assignment.rotationKey && assignment.group === "GROUP_2") continue;
    const classCode = [...classIdByCode].find(
      ([, classId]) => classId === assignment.classId,
    )?.[0];
    const subjectCode = subjectCodeById.get(assignment.subjectId);
    if (!classCode || !subjectCode) continue;
    const key = `${classCode}:${subjectCode}`;
    allocation.set(key, (allocation.get(key) ?? 0) + assignment.weeklyPeriods);
  }
  expect(allocation.get("6.A:CJ")).toBe(4);
  expect(allocation.get("6.A:M")).toBe(4);
  expect(allocation.get("6.A:TV")).toBe(2);
  expect(allocation.get("6.B:TV")).toBe(4);

  const rotationAssignments = stored.assignments.filter(
    (assignment) => assignment.rotationKey,
  );
  expect(rotationAssignments).toHaveLength(4);
  expect(
    new Set(rotationAssignments.map((item) => item.rotationKey)).size,
  ).toBe(1);
  expect(rotationAssignments.map((item) => item.rotationLeg).sort()).toEqual([
    1, 1, 2, 2,
  ]);
  expect(
    new Set(rotationAssignments.map((item) => item.parallelKey)).size,
  ).toBe(2);
  expect(
    rotationAssignments.every((item) => item.rotationPlacement === "ADJACENT"),
  ).toBe(true);
  await capture(page, "13-plan-ulozeny-s-profily-a-rotaci.png");

  await page.goto("/generate?schoolYearId=local-school-year");
  await expect(
    page.getByRole("heading", { name: "Kontrola připravenosti prošla" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vytvořit nový návrh" }).click();
  await expect(
    page.getByText(/^(Proveditelný návrh|Optimální návrh)$/),
  ).toBeVisible({ timeout: 120_000 });
  await page.getByRole("link", { name: "Otevřít návrh" }).click();
  await expect(
    page.getByRole("heading", { name: "Kvalita návrhu" }),
  ).toBeVisible();
  await capture(page, "14-vygenerovana-vymena-cj-m-ve-sportovni-6b.png");

  const generated = await readProject(page);
  expect(generated.timetableVersions.length).toBeGreaterThan(0);
  const latest = generated.timetableVersions[0]!;
  const snapshotRotation = latest.snapshot.assignments.filter(
    (assignment) => assignment.rotation_key,
  );
  expect(snapshotRotation).toHaveLength(4);
  expect(
    snapshotRotation.every(
      (assignment) => assignment.rotation_placement === "ADJACENT",
    ),
  ).toBe(true);

  const lessonByAssignment = new Map(
    latest.lessons.map((lesson) => [lesson.assignment_id, lesson]),
  );
  const assignmentsByLeg = new Map<number, typeof snapshotRotation>();
  for (const assignment of snapshotRotation) {
    const leg = assignment.rotation_leg!;
    assignmentsByLeg.set(leg, [
      ...(assignmentsByLeg.get(leg) ?? []),
      assignment,
    ]);
  }
  const leg1Assignments = assignmentsByLeg.get(1)!;
  const leg2Assignments = assignmentsByLeg.get(2)!;
  const leg1Lessons = leg1Assignments.map(
    (assignment) => lessonByAssignment.get(assignment.id)!,
  );
  const leg2Lessons = leg2Assignments.map(
    (assignment) => lessonByAssignment.get(assignment.id)!,
  );
  expect(
    new Set(leg1Lessons.map((lesson) => `${lesson.day}:${lesson.period}`)).size,
  ).toBe(1);
  expect(
    new Set(leg2Lessons.map((lesson) => `${lesson.day}:${lesson.period}`)).size,
  ).toBe(1);
  expect(leg1Lessons[0]!.day).toBe(leg2Lessons[0]!.day);
  expect(Math.abs(leg1Lessons[0]!.period - leg2Lessons[0]!.period)).toBe(1);

  const leg1ByGroup = new Map(
    leg1Assignments.map((assignment) => [assignment.group, assignment]),
  );
  const leg2ByGroup = new Map(
    leg2Assignments.map((assignment) => [assignment.group, assignment]),
  );
  expect(leg1ByGroup.get("GROUP_1")!.subject_id).toBe(
    leg2ByGroup.get("GROUP_2")!.subject_id,
  );
  expect(leg1ByGroup.get("GROUP_1")!.teacher_id).toBe(
    leg2ByGroup.get("GROUP_2")!.teacher_id,
  );
  expect(leg1ByGroup.get("GROUP_2")!.subject_id).toBe(
    leg2ByGroup.get("GROUP_1")!.subject_id,
  );
  expect(leg1ByGroup.get("GROUP_2")!.teacher_id).toBe(
    leg2ByGroup.get("GROUP_1")!.teacher_id,
  );

  await page.goto("/teaching-plan?schoolYearId=local-school-year");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Stáhnout Excel pro třídy" }).click();
  const download = await downloadPromise;
  const workbookPath = path.join(
    artifactDirectory,
    "sportovni-tridy-a-atomicka-vymena-cj-m.xlsx",
  );
  await download.saveAs(workbookPath);
  await page.getByLabel("Nahrát vyplněný Excel").setInputFiles(workbookPath);
  await expect(page).toHaveURL(/\/teaching-plan\/review\?/);
  await expect(page.getByText("6 / 6 h")).toHaveCount(3);
  await capture(page, "15-kontrola-ucitelu-po-importu-rotace.png");

  await page.getByRole("button", { name: "Učitelé souhlasí" }).click();
  await expect(page.getByRole("heading", { name: "6.A" })).toBeVisible();
  await expect(page.getByText("10 hodin")).toBeVisible();
  await page.getByRole("button", { name: "6.A souhlasí" }).click();
  await expect(page.getByRole("heading", { name: "6.B" })).toBeVisible();
  await expect(page.getByText("Sportovní třída")).toBeVisible();
  await expect(page.getByText("6 hodin")).toBeVisible();
  await expect(page.getByText(/Hned po sobě/)).toBeVisible();
  await capture(page, "16-kontrola-rozdilnych-dotaci-6a-a-6b.png");

  expect(pageErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});
