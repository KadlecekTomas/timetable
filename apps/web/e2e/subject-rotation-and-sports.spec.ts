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

test("sport class keeps its own allocation and Czech-Math groups swap atomically", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const staffing = {
    version: 1,
    updatedAt: "2026-08-02T00:00:00.000Z",
    teachers: [
      {
        id: "teacher-cj",
        firstName: "Český",
        lastName: "Učitel",
        targetWeeklyLoad: 2,
        unavailableDays: [],
        subjectLoads: [
          { id: "load-cj", subjectCode: "CJ", weeklyPeriods: 2 },
        ],
      },
      {
        id: "teacher-m",
        firstName: "Matematický",
        lastName: "Učitel",
        targetWeeklyLoad: 2,
        unavailableDays: [],
        subjectLoads: [
          { id: "load-m", subjectCode: "M", weeklyPeriods: 2 },
        ],
      },
    ],
  };
  const plan = {
    version: 1,
    updatedAt: "2026-08-02T00:00:00.000Z",
    classes: [
      { id: "class-6b", code: "6.B", grade: 6, profile: "SPORTS" },
    ],
    rows: [
      {
        id: "rotation-cj-m",
        classCode: "6.B",
        subjectCode: "CJ",
        secondarySubjectCode: "M",
        weeklyPeriods: 1,
        lessonShape: "SEPARATE",
        doublePeriodsCount: 0,
        organization: "ROTATION",
        primaryTeacherId: "teacher-cj",
        secondaryTeacherId: "teacher-m",
      },
    ],
  };

  await page.goto("/teaching-plan?schoolYearId=local-school-year");
  await page.evaluate(
    ({ staffingValue, planValue }) => {
      localStorage.setItem(
        "rozvrhar:staffing-plan:v1",
        JSON.stringify(staffingValue),
      );
      localStorage.setItem(
        "rozvrhar:teaching-plan:v1",
        JSON.stringify(planValue),
      );
    },
    { staffingValue: staffing, planValue: plan },
  );
  await page.reload();

  await expect(page.getByRole("heading", { name: "Třída 6.B" })).toBeVisible();
  await expect(page.getByLabel("Profil třídy 6.B")).toHaveValue("SPORTS");
  await expect(
    page.getByRole("button", { name: "Dvě skupiny – výměna předmětů" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("rotation-preview-0")).toContainText(
    "1. rameno",
  );
  await expect(page.getByTestId("rotation-preview-0")).toContainText(
    "Skupina 1: CJ",
  );
  await expect(page.getByTestId("rotation-preview-0")).toContainText(
    "Skupina 2: M",
  );
  await expect(page.getByTestId("rotation-preview-0")).toContainText(
    "2. rameno – prohozeno",
  );
  await expect(page.getByText("2 / 2 h")).toHaveCount(2);
  await expect(page.getByText("Výuka tříd je připravená")).toBeVisible();
  await capture(page, "12-sportovni-trida-6b-a-vymena-cj-m.png");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Stáhnout Excel pro třídy" }).click();
  const download = await downloadPromise;
  await mkdir(artifactDirectory, { recursive: true });
  const workbookPath = path.join(
    artifactDirectory,
    "sportovni-trida-a-vymena-cj-m.xlsx",
  );
  await download.saveAs(workbookPath);

  await page.getByLabel("Nahrát vyplněný Excel").setInputFiles(workbookPath);
  await expect(page).toHaveURL(/\/teaching-plan\/review\?/);
  await expect(page.getByText("2 / 2 h")).toHaveCount(2);
  await capture(page, "13-kontrola-ucitelu-vymeny-cj-m.png");

  await page.getByRole("button", { name: "Učitelé souhlasí" }).click();
  await expect(page.getByRole("heading", { name: "6.B" })).toBeVisible();
  await expect(page.getByText("Sportovní třída")).toBeVisible();
  await expect(page.getByText("2 hodin")).toBeVisible();
  await expect(page.getByText(/1\. rameno: skupina 1 CJ/)).toBeVisible();
  await capture(page, "14-kontrola-sportovni-tridy-a-dotace.png");

  await page.getByRole("button", { name: "6.B souhlasí" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Souhlasí dělení tříd, dvojhodiny a výměny?",
    }),
  ).toBeVisible();
  await capture(page, "15-kontrola-povinne-vymeny-predmetu.png");
});
