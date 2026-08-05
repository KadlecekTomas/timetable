import { expect, test } from "@playwright/test";

test("coverage page fills every missing teacher and raises load when needed", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem(
      "rozvrhar:staffing-plan:v1",
      JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        teachers: [
          {
            id: "teacher-m",
            firstName: "Milan",
            lastName: "Matematik",
            targetWeeklyLoad: 2,
            baseWeeklyLoad: 2,
            subjectLoads: [
              {
                id: "load-m",
                subjectCode: "M",
                weeklyPeriods: 2,
              },
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
        updatedAt: new Date().toISOString(),
        classes: [
          {
            id: "class-1-a",
            code: "1.A",
            grade: 1,
            profile: "REGULAR",
          },
        ],
        rows: [
          {
            id: "row-m",
            classCode: "1.A",
            subjectCode: "M",
            secondarySubjectCode: "",
            weeklyPeriods: 5,
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
  await expect(page.getByText("Chybí pokrýt 5 učitelských hodin")).toBeVisible();

  await page
    .getByRole("button", { name: "Doplnit vše automaticky" })
    .click();

  await expect(
    page.getByText("Všechny hodiny mají potřebné učitele"),
  ).toBeVisible();
  await expect(page.getByTestId("coverage-1.A-M")).toHaveAttribute(
    "data-status",
    "FULL",
  );
  await expect(page.getByText(/Automaticky doplněno 1 chybějící místo/)).toBeVisible();

  const stored = await page.evaluate(() => ({
    staffing: JSON.parse(
      localStorage.getItem("rozvrhar:staffing-plan:v1") ?? "{}",
    ),
    teaching: JSON.parse(
      localStorage.getItem("rozvrhar:teaching-plan:v1") ?? "{}",
    ),
  }));

  expect(stored.teaching.rows[0].primaryTeacherId).toBe("teacher-m");
  expect(stored.staffing.teachers[0].targetWeeklyLoad).toBe(5);
  expect(
    stored.staffing.teachers[0].subjectLoads.map(
      (item: { subjectCode: string; weeklyPeriods: number }) => [
        item.subjectCode,
        item.weeklyPeriods,
      ],
    ),
  ).toEqual([["M", 5]]);
});
