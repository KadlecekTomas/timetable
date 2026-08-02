import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { createTeachingPlanWorkbook } from "../lib/import/teaching-plan-workbook";
import type { StaffingPlan } from "../lib/local/staffing-plan";
import type { TeachingPlan } from "../lib/local/teaching-plan";

const screenshotDirectory = path.join(
  process.cwd(),
  "test-results",
  "teaching-plan-review-screenshots",
);

async function capture(page: Page, name: string): Promise<void> {
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDirectory, name),
    fullPage: true,
    animations: "disabled",
  });
}

function staffingPlan(): StaffingPlan {
  return {
    version: 1,
    updatedAt: "2026-08-02T00:00:00.000Z",
    teachers: [
      {
        id: "teacher-kad",
        firstName: "Tomáš",
        lastName: "Kadleček",
        targetWeeklyLoad: 4,
        unavailableDays: [],
        subjectLoads: [
          { id: "kad-vv", subjectCode: "VV", weeklyPeriods: 2 },
          { id: "kad-inf", subjectCode: "INF", weeklyPeriods: 2 },
        ],
      },
      {
        id: "teacher-vas",
        firstName: "N.",
        lastName: "Vašáková",
        targetWeeklyLoad: 2,
        unavailableDays: [],
        subjectLoads: [{ id: "vas-inf", subjectCode: "INF", weeklyPeriods: 2 }],
      },
    ],
  };
}

function importedPlan(): TeachingPlan {
  return {
    version: 1,
    updatedAt: "2026-08-02T00:00:00.000Z",
    classes: [
      { id: "class-6a", code: "6.A", grade: 6 },
      { id: "class-6b", code: "6.B", grade: 6 },
    ],
    rows: [
      {
        id: "row-6a-vv",
        classCode: "6.A",
        subjectCode: "VV",
        weeklyPeriods: 2,
        lessonShape: "DOUBLE",
        doublePeriodsCount: 1,
        organization: "WHOLE",
        primaryTeacherId: "teacher-kad",
        secondaryTeacherId: "",
      },
      {
        id: "row-6a-inf",
        classCode: "6.A",
        subjectCode: "INF",
        weeklyPeriods: 1,
        lessonShape: "SEPARATE",
        doublePeriodsCount: 0,
        organization: "SPLIT",
        primaryTeacherId: "teacher-kad",
        secondaryTeacherId: "teacher-vas",
      },
      {
        id: "row-6b-inf",
        classCode: "6.B",
        subjectCode: "INF",
        weeklyPeriods: 1,
        lessonShape: "SEPARATE",
        doublePeriodsCount: 0,
        organization: "SPLIT",
        primaryTeacherId: "teacher-kad",
        secondaryTeacherId: "teacher-vas",
      },
    ],
  };
}

function oldPlan(): TeachingPlan {
  return {
    version: 1,
    updatedAt: "2026-08-01T00:00:00.000Z",
    classes: [{ id: "old-class", code: "9.A", grade: 9 }],
    rows: [
      {
        id: "old-row",
        classCode: "9.A",
        subjectCode: "VV",
        weeklyPeriods: 1,
        lessonShape: "SEPARATE",
        doublePeriodsCount: 0,
        organization: "WHOLE",
        primaryTeacherId: "teacher-kad",
        secondaryTeacherId: "",
      },
    ],
  };
}

test("Excel is reviewed teacher-by-teacher and class-by-class before it replaces the editor", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });

  const staffing = staffingPlan();
  const imported = importedPlan();
  const previous = oldPlan();
  await mkdir(screenshotDirectory, { recursive: true });
  const workbookPath = path.join(
    screenshotDirectory,
    "kontrolni-import-trid.xlsx",
  );
  await writeFile(
    workbookPath,
    await createTeachingPlanWorkbook(staffing, imported),
  );

  await page.goto("/teaching-plan?schoolYearId=local-school-year");
  await page.evaluate(
    ({ staffingValue, oldValue }) => {
      localStorage.setItem(
        "rozvrhar:staffing-plan:v1",
        JSON.stringify(staffingValue),
      );
      localStorage.setItem(
        "rozvrhar:teaching-plan:v1",
        JSON.stringify(oldValue),
      );
    },
    { staffingValue: staffing, oldValue: previous },
  );
  await page.reload();

  await page.getByLabel("Nahrát vyplněný Excel").setInputFiles(workbookPath);
  await expect(page).toHaveURL(/\/teaching-plan\/review\?/);
  await expect(
    page.getByRole("heading", { name: "Sedí údaje z Excelu?" }),
  ).toBeVisible();
  await expect(page.getByTestId("review-teachers-step")).toBeVisible();
  await expect(page.getByText("4 / 4 h")).toBeVisible();
  await expect(page.getByText("2 / 2 h")).toBeVisible();

  const untouchedBeforeReview = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("rozvrhar:teaching-plan:v1") ?? "null"),
  );
  expect(untouchedBeforeReview.classes[0].code).toBe("9.A");
  await capture(page, "06-kontrola-ucitelu-po-nahrani-excelu.png");

  await page.getByRole("button", { name: "Učitelé souhlasí" }).click();
  await expect(page.getByTestId("review-classes-step")).toBeVisible();
  await expect(page.getByRole("heading", { name: "6.A" })).toBeVisible();
  await expect(page.getByText("3 hodin")).toBeVisible();
  await expect(page.getByText("Výtvarná výchova")).toBeVisible();
  await expect(page.getByText("Informatika")).toBeVisible();
  await capture(page, "07-kontrola-tridy-6a-a-hodinove-dotace.png");

  await page.getByRole("button", { name: "6.A souhlasí" }).click();
  await expect(page.getByRole("heading", { name: "6.B" })).toBeVisible();
  await expect(page.getByText("1 hodin")).toBeVisible();
  await capture(page, "08-kontrola-dalsi-tridy-6b.png");

  await page.getByRole("button", { name: "6.B souhlasí" }).click();
  await expect(page.getByTestId("review-special-rules-step")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Souhlasí dělení tříd a dvojhodiny?",
    }),
  ).toBeVisible();
  await expect(page.getByText("1× dvojhodina")).toBeVisible();
  await expect(page.getByText("Dvě skupiny", { exact: true })).toHaveCount(2);
  await capture(page, "09-kontrola-deleni-a-dvojhodin.png");

  await page
    .getByRole("button", { name: "Dělení a dvojhodiny souhlasí" })
    .click();
  await expect(page.getByTestId("review-final-step")).toBeVisible();
  await expect(
    page.getByText("Aktuální rozpracovaný plán bude nahrazen"),
  ).toBeVisible();
  await capture(page, "10-finalni-souhrn-pred-prevzetim.png");

  const untouchedBeforeFinalConfirmation = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("rozvrhar:teaching-plan:v1") ?? "null"),
  );
  expect(untouchedBeforeFinalConfirmation.classes[0].code).toBe("9.A");

  await page.getByLabel("Potvrzuji správnost importovaných údajů").check();
  await page.getByRole("button", { name: "Potvrdit a převzít Excel" }).click();
  await expect(page).toHaveURL(/\/teaching-plan\?.*imported=1/);
  await expect(
    page.getByText("Excel byl potvrzen a převzat do editoru."),
  ).toBeVisible();

  const accepted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("rozvrhar:teaching-plan:v1") ?? "null"),
  );
  expect(accepted.classes.map((item: { code: string }) => item.code)).toEqual([
    "6.A",
    "6.B",
  ]);
  expect(accepted.rows).toHaveLength(3);
  expect(
    sessionStorage.getItem("rozvrhar:teaching-plan-import-review:v1"),
  ).toBe(null);
  await capture(page, "11-excel-prevzaty-do-editoru.png");
});
