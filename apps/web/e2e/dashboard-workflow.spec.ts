import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

const screenshotDirectory = path.join(
  process.cwd(),
  "test-results",
  "dashboard-workflow-screenshots",
);

const staffing = {
  version: 1,
  updatedAt: "2026-08-05T00:00:00.000Z",
  teachers: [
    {
      id: "teacher-cj",
      firstName: "Český",
      lastName: "Učitel",
      targetWeeklyLoad: 8,
      unavailableDays: [],
      subjectLoads: [{ id: "load-cj", subjectCode: "CJ", weeklyPeriods: 8 }],
    },
    {
      id: "teacher-m",
      firstName: "Matematický",
      lastName: "Učitel",
      targetWeeklyLoad: 8,
      unavailableDays: [],
      subjectLoads: [{ id: "load-m", subjectCode: "M", weeklyPeriods: 8 }],
    },
  ],
};

const teaching = {
  version: 1,
  updatedAt: "2026-08-05T00:00:00.000Z",
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

test("dashboard follows working data and detects stale prepared inputs", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Začít nahráním učitelů" }),
  ).toHaveAttribute("href", /staffing/);
  await expect(
    page.getByRole("link", { name: "Pokročilý import" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Pokročilá školní data" }),
  ).toHaveCount(0);

  await page.goto("/data?schoolYearId=local-school-year");
  await expect(
    page.getByText("Nejdřív připravte školní data pro tvorbu rozvrhu."),
  ).toBeVisible();
  await expect(page.getByText("Učitelé", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Výukové vazby", { exact: true })).toHaveCount(0);

  await page.goto("/");
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
  await expect(
    page.getByText(/Pracovní data: 2 učitelé a 1 třída/),
  ).toBeVisible();
  await expect(page.getByText("Čeká na přípravu")).toBeVisible();
  await expect(page.getByText("100 %")).toBeVisible();
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDirectory, "dashboard-after-working-data.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.goto("/generate?schoolYearId=local-school-year");
  await page
    .getByRole("button", { name: "Připravit a zkontrolovat data" })
    .click();
  await expect(
    page.getByText(
      /Připravený projekt: 2 učitelé · 1 třída · 2 předměty · 4 výukové vazby · aktuální/,
    ),
  ).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Připraveno", { exact: true })).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDirectory, "dashboard-current.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.evaluate(
    (value) => {
      localStorage.setItem("rozvrhar:staffing-plan:v1", JSON.stringify(value));
    },
    {
      ...staffing,
      teachers: staffing.teachers.map((teacher, index) =>
        index === 0
          ? {
              ...teacher,
              targetWeeklyLoad: 9,
              subjectLoads: [{ ...teacher.subjectLoads[0], weeklyPeriods: 9 }],
            }
          : teacher,
      ),
    },
  );
  await page.reload();
  await expect(page.getByText("Je potřeba obnovit", { exact: true })).toBeVisible();

  await page.goto("/data?schoolYearId=local-school-year");
  await expect(
    page.getByText(/Nová příprava zachová učebny a typy učeben/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Typy učeben" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Učebny" })).toBeVisible();

  await page.goto("/import?schoolYearId=local-school-year");
  await expect(page).toHaveURL(/\/staffing\?schoolYearId=local-school-year$/);
});
