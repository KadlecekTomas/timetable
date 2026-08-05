import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

const staffing = {
  version: 1,
  updatedAt: "2026-08-04T00:00:00.000Z",
  teachers: [
    {
      id: "teacher-cj",
      firstName: "Český",
      lastName: "Učitel",
      targetWeeklyLoad: 8,
      unavailableDays: ["MON"],
      subjectLoads: [{ id: "cj", subjectCode: "CJ", weeklyPeriods: 8 }],
    },
    {
      id: "teacher-m",
      firstName: "Matematický",
      lastName: "Učitel",
      targetWeeklyLoad: 8,
      unavailableDays: [],
      subjectLoads: [{ id: "m", subjectCode: "M", weeklyPeriods: 8 }],
    },
  ],
};

const teaching = {
  version: 1,
  updatedAt: "2026-08-04T00:00:00.000Z",
  classes: [{ id: "class-7a", code: "7.A", grade: 7, profile: "REGULAR" }],
  rows: [
    {
      id: "rotation-7a",
      classCode: "7.A",
      subjectCode: "CJ",
      secondarySubjectCode: "M",
      weeklyPeriods: 4,
      lessonShape: "SEPARATE",
      doublePeriodsCount: 0,
      organization: "ROTATION",
      rotationPlacement: "ADJACENT",
      primaryTeacherId: "teacher-cj",
      secondaryTeacherId: "teacher-m",
    },
  ],
};

interface ProjectSnapshot {
  teachers: Array<{ targetWeeklyLoad: number; maxWeeklyLoad: number }>;
  assignments: unknown[];
  availability: unknown[];
}

test("generation inputs are prepared atomically and survive reload", async ({
  page,
}) => {
  await page.goto("/generate?schoolYearId=local-school-year");
  await page.evaluate(
    ({ staffing, teaching }) => {
      localStorage.setItem(
        "rozvrhar:staffing-plan:v1",
        JSON.stringify(staffing),
      );
      localStorage.setItem(
        "rozvrhar:teaching-plan:v1",
        JSON.stringify(teaching),
      );
    },
    { staffing, teaching },
  );
  await page.reload();

  await expect(page.getByText(/Personální plán: 2 učitelé/)).toBeVisible();
  await expect(page.getByText(/učební plán: 1 třída a 1 řádek/)).toBeVisible();
  await page
    .getByRole("button", { name: "Připravit a zkontrolovat data" })
    .click();
  await expect(
    page.getByText(
      "Připraveno: 2 učitelé, 1 třída, 2 předměty a 4 výukové vazby.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Připravený projekt: 2 učitelé · 1 třída · 2 předměty · 4 výukové vazby · aktuální/,
    ),
  ).toBeVisible();

  const project = await page.evaluate(
    () =>
      new Promise<ProjectSnapshot>((resolve, reject) => {
        const open = indexedDB.open("rozvrhar-local", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db
            .transaction("state", "readonly")
            .objectStore("state")
            .get("active-project");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        };
      }),
  );
  expect(
    project.teachers.map((teacher) => [
      teacher.targetWeeklyLoad,
      teacher.maxWeeklyLoad,
    ]),
  ).toEqual([
    [8, 8],
    [8, 8],
  ]);
  expect(project.assignments).toHaveLength(4);
  expect(project.availability).toHaveLength(8);

  await page.reload();
  await expect(
    page.getByText(
      /Připravený projekt: 2 učitelé · 1 třída · 2 předměty · 4 výukové vazby · aktuální/,
    ),
  ).toBeVisible();
  await page.goto("/coverage?schoolYearId=local-school-year");
  await expect(page.getByTestId("coverage-7.A-CJ")).toContainText("2/2");
  await expect(page.getByTestId("coverage-7.A-M")).toContainText("2/2");

  const directory = path.join(
    process.cwd(),
    "test-results",
    "prepare-generation-screenshots",
  );
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    path: path.join(directory, "prepared-rotation-coverage.png"),
    fullPage: true,
    animations: "disabled",
  });
});
