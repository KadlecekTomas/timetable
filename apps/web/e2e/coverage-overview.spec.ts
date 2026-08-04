import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

const artifactDirectory = path.join(
  process.cwd(),
  "test-results",
  "coverage-screenshots",
);

test("coverage page shows full, partial and missing teaching at a glance", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.addInitScript(() => {
    localStorage.setItem(
      "rozvrhar:staffing-plan:v1",
      JSON.stringify({
        version: 1,
        updatedAt: new Date(0).toISOString(),
        teachers: [
          {
            id: "teacher-one",
            firstName: "Tomáš",
            lastName: "Kadleček",
            targetWeeklyLoad: 11,
            subjectLoads: [
              { id: "one-cj", subjectCode: "CJ", weeklyPeriods: 5 },
              { id: "one-inf", subjectCode: "INF", weeklyPeriods: 1 },
              {
                id: "one-ict",
                subjectCode: "ICT_VEDENI",
                weeklyPeriods: 5,
              },
            ],
            unavailableDays: [],
          },
          {
            id: "teacher-two",
            firstName: "Eliška",
            lastName: "Šárová",
            targetWeeklyLoad: 5,
            subjectLoads: [
              { id: "two-cj", subjectCode: "CJ", weeklyPeriods: 5 },
            ],
            unavailableDays: [],
          },
        ],
      }),
    );
    localStorage.setItem(
      "rozvrhar:teaching-plan:v1",
      JSON.stringify({
        version: 1,
        updatedAt: new Date(0).toISOString(),
        classes: [
          { id: "class-6a", code: "6.A", grade: 6, profile: "REGULAR" },
        ],
        rows: [
          {
            id: "row-cj",
            classCode: "6.A",
            subjectCode: "CJ",
            secondarySubjectCode: "",
            weeklyPeriods: 5,
            lessonShape: "SEPARATE",
            doublePeriodsCount: 0,
            organization: "SPLIT",
            rotationPlacement: "SAME_DAY",
            primaryTeacherId: "teacher-one",
            secondaryTeacherId: "teacher-two",
          },
          {
            id: "row-inf",
            classCode: "6.A",
            subjectCode: "INF",
            secondarySubjectCode: "",
            weeklyPeriods: 1,
            lessonShape: "SEPARATE",
            doublePeriodsCount: 0,
            organization: "SPLIT",
            rotationPlacement: "SAME_DAY",
            primaryTeacherId: "teacher-one",
            secondaryTeacherId: "",
          },
          {
            id: "row-dej",
            classCode: "6.A",
            subjectCode: "DEJ",
            secondarySubjectCode: "",
            weeklyPeriods: 2,
            lessonShape: "SEPARATE",
            doublePeriodsCount: 0,
            organization: "WHOLE",
            rotationPlacement: "SAME_DAY",
            primaryTeacherId: "",
            secondaryTeacherId: "",
          },
        ],
      }),
    );
  });

  await page.goto("/coverage?schoolYearId=local-school-year");

  await expect(
    page.getByRole("heading", { name: "Pokrytí hodinové dotace" }),
  ).toBeVisible();
  await expect(page.getByText("Chybí pokrýt 3 učitelských hodin")).toBeVisible();

  const czech = page.getByTestId("coverage-6.A-CJ");
  const informatics = page.getByTestId("coverage-6.A-INF");
  const history = page.getByTestId("coverage-6.A-DEJ");

  await expect(czech).toHaveAttribute("data-status", "FULL");
  await expect(czech).toContainText("2/2");
  await expect(informatics).toHaveAttribute("data-status", "PARTIAL");
  await expect(informatics).toContainText("1/2");
  await expect(history).toHaveAttribute("data-status", "MISSING");
  await expect(history).toContainText("0/1");

  await informatics.click();
  await expect(
    page.getByRole("heading", { name: "6.A · Informatika" }),
  ).toBeVisible();
  await expect(page.getByText("učitel 2. skupiny")).toBeVisible();
  await expect(page.getByText("Chybí učitel")).toBeVisible();

  await mkdir(artifactDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(artifactDirectory, "01-prehled-pokryti-hodin.png"),
    fullPage: true,
    animations: "disabled",
  });

  expect(pageErrors).toEqual([]);
});
