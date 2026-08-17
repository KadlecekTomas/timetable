import { expect, test } from "@playwright/test";

test("beginner staffing flow saves the teacher card before project sync", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto("/staffing?schoolYearId=local-school-year");
  await expect(
    page.getByRole("heading", { name: "Učitelé a úvazky" }),
  ).toBeVisible();
  await expect(page.getByText("Zatím tu není žádný učitel")).toBeVisible();

  await page.getByRole("button", { name: "Přidat učitele ručně" }).click();
  await page.getByLabel("Jméno").fill("Jana");
  await page.getByLabel("Příjmení").fill("Nováková");
  await page.getByLabel("Úvazek týdně", { exact: true }).fill("22");

  await page.locator('select[aria-label="Předmět"]').nth(0).selectOption("TV");
  await page
    .locator('input[aria-label="Počet hodin předmětu"]')
    .nth(0)
    .fill("10");

  for (const [subject, hours] of [
    ["M", "2"],
    ["CJ", "4"],
    ["JAZ2", "6"],
  ] as const) {
    await page.getByRole("button", { name: "Přidat další předmět" }).click();
    const subjectSelects = page.locator('select[aria-label="Předmět"]');
    const hourInputs = page.locator('input[aria-label="Počet hodin předmětu"]');
    const index = (await subjectSelects.count()) - 1;
    await subjectSelects.nth(index).selectOption(subject);
    await hourInputs.nth(index).fill(hours);
  }

  await expect(page.getByText("22 / 22 h", { exact: true })).toBeVisible();
  await expect(page.getByText("Úvazek sedí", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Hotovo — úvazek i předměty přesně sedí."),
  ).toBeVisible();

  const monday = page.getByRole("button", { name: "Po může" });
  await expect(monday).toBeVisible();
  await monday.click();
  await expect(page.getByRole("button", { name: "Po nemůže" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByLabel("Út blokovat od").selectOption("1");
  await page.getByLabel("Út blokovat do").selectOption("6");
  await page.getByRole("button", { name: "Út blokovat rozsah" }).click();
  for (let period = 1; period <= 6; period += 1) {
    await expect(
      page.getByRole("button", {
        name: `Út ${period}. hodina blokovaná`,
      }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.getByTestId("staffing-manual-save-status")).toContainText(
    "1 neuložená karta",
  );
  await expect(
    page.getByRole("button", { name: "Uložit učitele do projektu" }),
  ).toBeDisabled();

  const beforeSave = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("rozvrhar:staffing-plan:v1") ?? '{"teachers":[]}',
    ),
  );
  expect(beforeSave.teachers).toHaveLength(0);

  await page.getByRole("button", { name: "Uložit Jana Nováková" }).click();
  await expect(page.getByTestId("staffing-manual-save-status")).toContainText(
    "Všechny změny jsou uložené",
  );

  await page
    .getByRole("button", { name: "Uložit učitele do projektu" })
    .click();
  await expect(
    page.getByText(
      "Hotovo. Uloženo 1 učitelů a 14 tvrdých blokací dostupnosti.",
    ),
  ).toBeVisible();

  const stored = await page.evaluate(
    () =>
      new Promise<{
        project: {
          teachers: Array<{
            firstName: string;
            lastName: string;
            targetWeeklyLoad: number;
          }>;
          availability: Array<{
            entityType: string;
            dayOfWeek: number;
            period: number;
            kind: string;
          }>;
        };
        staffingPlan: {
          teachers: Array<{
            targetWeeklyLoad: number;
            unavailableDays: string[];
            unavailablePeriods?: Array<{ day: string; period: number }>;
            subjectLoads: Array<{
              subjectCode: string;
              weeklyPeriods: number;
            }>;
          }>;
        };
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
          request.onsuccess = () => {
            const staffingPlan = JSON.parse(
              localStorage.getItem("rozvrhar:staffing-plan:v1") ?? "{}",
            );
            resolve({ project: request.result, staffingPlan });
          };
          transaction.oncomplete = () => database.close();
        };
      }),
  );

  expect(stored.project.teachers).toEqual([
    {
      firstName: "Jana",
      lastName: "Nováková",
      targetWeeklyLoad: 22,
      id: expect.any(String),
      code: expect.any(String),
      minWeeklyLoad: null,
      maxWeeklyLoad: null,
    },
  ]);
  expect(stored.project.availability).toHaveLength(14);
  const mondayRules = stored.project.availability.filter(
    (rule) => rule.dayOfWeek === 0,
  );
  expect(mondayRules).toHaveLength(8);
  expect(
    mondayRules.every(
      (rule) => rule.entityType === "TEACHER" && rule.kind === "UNAVAILABLE",
    ),
  ).toBe(true);
  const tuesdayRules = stored.project.availability.filter(
    (rule) => rule.dayOfWeek === 1,
  );
  expect(tuesdayRules).toHaveLength(6);
  expect(tuesdayRules.map((rule) => rule.period).sort()).toEqual([
    0, 1, 2, 3, 4, 5,
  ]);
  expect(
    tuesdayRules.every(
      (rule) => rule.entityType === "TEACHER" && rule.kind === "UNAVAILABLE",
    ),
  ).toBe(true);
  expect(stored.staffingPlan.teachers).toHaveLength(1);
  expect(stored.staffingPlan.teachers[0]!.targetWeeklyLoad).toBe(22);
  expect(stored.staffingPlan.teachers[0]!.unavailableDays).toEqual(["MON"]);
  expect(stored.staffingPlan.teachers[0]!.unavailablePeriods).toEqual([
    { day: "TUE", period: 0 },
    { day: "TUE", period: 1 },
    { day: "TUE", period: 2 },
    { day: "TUE", period: 3 },
    { day: "TUE", period: 4 },
    { day: "TUE", period: 5 },
  ]);
  expect(
    stored.staffingPlan.teachers[0]!.subjectLoads.map((item) => [
      item.subjectCode,
      item.weeklyPeriods,
    ]),
  ).toEqual([
    ["TV", 10],
    ["M", 2],
    ["CJ", 4],
    ["JAZ2", 6],
  ]);

  expect(pageErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});

test("teacher with three overtime hours can be completed and saved", async ({
  page,
}) => {
  await page.goto("/staffing?schoolYearId=local-school-year");
  await page.getByRole("button", { name: "Přidat učitele ručně" }).click();
  await page.getByLabel("Jméno").fill("Testovací");
  await page.getByLabel("Příjmení").fill("Učitelka");
  await page.getByLabel("Úvazek týdně", { exact: true }).fill("22");
  await page.getByLabel("Nadúvazek týdně").fill("3");
  await page.locator('select[aria-label="Předmět"]').selectOption("M");
  await page.locator('input[aria-label="Počet hodin předmětu"]').fill("25");

  await expect(page.getByTestId("staffing-manual-save-status")).toContainText(
    "1 neuložená karta",
  );
  await expect(page.getByText("25 / 25 h", { exact: true })).toBeVisible();
  await expect(page.getByText("Úvazek sedí", { exact: true })).toBeVisible();

  const beforeSave = await page.evaluate(() =>
    localStorage.getItem("rozvrhar:staffing-plan:v1"),
  );
  expect(beforeSave).toBeNull();

  await page.getByRole("button", { name: "Uložit Testovací Učitelka" }).click();
  await expect(page.getByTestId("staffing-manual-save-status")).toContainText(
    "Všechny změny jsou uložené",
  );

  await page.reload();
  await expect(page.getByLabel("Jméno")).toHaveValue("Testovací");
  await expect(page.getByLabel("Příjmení")).toHaveValue("Učitelka");
  await expect(page.getByLabel("Úvazek týdně", { exact: true })).toHaveValue(
    "22",
  );
  await expect(page.getByLabel("Nadúvazek týdně")).toHaveValue("3");
  await expect(
    page.locator('input[aria-label="Počet hodin předmětu"]'),
  ).toHaveValue("25");
});

test("problem cards are first and unsaved navigation requires confirmation", async ({
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
            id: "teacher-valid",
            firstName: "Adam",
            lastName: "Bezchybný",
            targetWeeklyLoad: 1,
            subjectLoads: [
              {
                id: "load-valid",
                subjectCode: "M",
                weeklyPeriods: 1,
              },
            ],
            unavailableDays: [],
          },
          {
            id: "teacher-invalid",
            firstName: "Boris",
            lastName: "Problémový",
            targetWeeklyLoad: 22,
            subjectLoads: [
              {
                id: "load-invalid",
                subjectCode: "M",
                weeklyPeriods: 19,
              },
            ],
            unavailableDays: [],
          },
        ],
      }),
    );
  });
  await page.goto("/staffing?schoolYearId=local-school-year");

  const cards = page.locator('[data-testid^="teacher-card-"]');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("Boris Problémový");
  await expect(cards.nth(1)).toContainText("Adam Bezchybný");

  await page.getByRole("button", { name: "K opravě (1)" }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.nth(0)).toContainText("Boris Problémový");

  await page.getByLabel("Jméno").fill("Boris změněný");
  await expect(
    page.getByRole("button", { name: "Neuložené (1)" }),
  ).toBeVisible();

  let dialogMessage = "";
  page.once("dialog", async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "2. Pokrytí výuky" }).click();
  expect(dialogMessage).toContain("Máte neuložené změny");
  await expect(page).toHaveURL(/\/staffing/);
});
