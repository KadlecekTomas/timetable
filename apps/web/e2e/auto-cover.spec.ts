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
  await expect(
    page.getByText("Chybí pokrýt 5 učitelských hodin"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Doplnit vše automaticky" }).click();

  await expect(
    page.getByText("Všechny hodiny mají potřebné učitele"),
  ).toBeVisible();
  await expect(page.getByTestId("coverage-1.A-M")).toHaveAttribute(
    "data-status",
    "FULL",
  );
  await expect(
    page.getByText(/Automaticky doplněno 1 chybějící místo/),
  ).toBeVisible();

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

test("current school keeps second language class-scoped and removes grade-seven electives", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const classCodes = [
      "6.A",
      "6.B",
      "6.C",
      "6.D",
      "7.A",
      "7.B",
      "7.C",
      "8.A",
      "8.B",
      "8.C",
      "9.A",
      "9.B",
      "9.C",
    ];
    localStorage.setItem(
      "rozvrhar:staffing-plan:v1",
      JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        teachers: [
          {
            id: "teacher-language-one",
            firstName: "Jana",
            lastName: "Němcová",
            targetWeeklyLoad: 9,
            baseWeeklyLoad: 9,
            subjectLoads: [
              {
                id: "load-language-one",
                subjectCode: "JAZ2",
                weeklyPeriods: 9,
              },
            ],
            unavailableDays: [],
          },
          {
            id: "teacher-language-two",
            firstName: "Petr",
            lastName: "Francouz",
            targetWeeklyLoad: 9,
            baseWeeklyLoad: 9,
            subjectLoads: [
              {
                id: "load-language-two",
                subjectCode: "JAZ2",
                weeklyPeriods: 9,
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
        classes: classCodes.map((code, index) => ({
          id: `class-${index}`,
          code,
          grade: Number(code.split(".")[0]),
          profile: /\.(B|D)$/.test(code) ? "SPORTS" : "REGULAR",
        })),
        rows: [
          ...["7.A", "7.B", "7.C"].map((classCode, index) => ({
            id: `row-vol-${index}`,
            classCode,
            subjectCode: "VOL",
            secondarySubjectCode: "",
            weeklyPeriods: 2,
            lessonShape: "SEPARATE",
            doublePeriodsCount: 0,
            organization: "WHOLE",
            rotationPlacement: "SAME_DAY",
            primaryTeacherId: "teacher-language-one",
            secondaryTeacherId: "",
          })),
          ...["8.A", "8.B", "8.C"].map((classCode, index) => ({
            id: `row-language-${index}`,
            classCode,
            subjectCode: "JAZ2",
            secondarySubjectCode: "",
            weeklyPeriods: 3,
            lessonShape: "SEPARATE",
            doublePeriodsCount: 0,
            organization: "SPLIT",
            rotationPlacement: "SAME_DAY",
            primaryTeacherId: "teacher-language-one",
            secondaryTeacherId: "",
            splitGroupCount: 2,
          })),
        ],
      }),
    );
  });

  await page.goto("/coverage?schoolYearId=local-school-year");

  await expect(page.getByTestId("coverage-7.A-VOL")).toHaveCount(0);
  for (const classCode of ["8.A", "8.B", "8.C"]) {
    await expect(
      page.getByTestId(`coverage-${classCode}-JAZ2`),
    ).toHaveAttribute("data-status", "PARTIAL");
    await expect(
      page.getByTestId(`coverage-${classCode}-JAZ2`),
    ).toHaveAttribute("data-shared", "false");
  }

  await page.getByRole("button", { name: "Doplnit vše automaticky" }).click();

  for (const classCode of ["8.A", "8.B", "8.C"]) {
    await expect(
      page.getByTestId(`coverage-${classCode}-JAZ2`),
    ).toHaveAttribute("data-status", "FULL");
    await expect(
      page.getByTestId(`coverage-${classCode}-JAZ2`),
    ).toHaveAttribute("data-shared", "false");
  }

  const stored = await page.evaluate(() => ({
    teaching: JSON.parse(
      localStorage.getItem("rozvrhar:teaching-plan:v1") ?? "{}",
    ),
    shared: JSON.parse(
      localStorage.getItem("rozvrhar:teaching-plan-shared:v1") ?? "{}",
    ),
  }));

  expect(
    stored.teaching.rows.filter(
      (row: { subjectCode: string }) => row.subjectCode === "VOL",
    ),
  ).toHaveLength(0);
  const languageRows = stored.teaching.rows
    .filter((row: { subjectCode: string }) => row.subjectCode === "JAZ2")
    .sort((left: { classCode: string }, right: { classCode: string }) =>
      left.classCode.localeCompare(right.classCode),
    );
  expect(languageRows).toHaveLength(3);
  expect(
    languageRows.map((row: { classCode: string }) => row.classCode),
  ).toEqual(["8.A", "8.B", "8.C"]);
  for (const row of languageRows) {
    expect(row.primaryTeacherId).toBeTruthy();
    expect(row.secondaryTeacherId).toBeTruthy();
    expect(stored.shared[row.id]?.additionalClassCodes ?? []).toEqual([]);
  }
});
