import { expect, test } from "@playwright/test";

test("beginner staffing flow records exact subject load and a whole unavailable day", async ({
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
  await page.getByLabel("Úvazek týdně").fill("22");

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

  await page
    .getByRole("button", { name: "Uložit učitele do projektu" })
    .click();
  await expect(
    page.getByText("Hotovo. Uloženo 1 učitelů včetně celých nedostupných dnů."),
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
            kind: string;
          }>;
        };
        staffingPlan: {
          teachers: Array<{
            targetWeeklyLoad: number;
            unavailableDays: string[];
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
  expect(stored.project.availability).toHaveLength(8);
  expect(
    stored.project.availability.every(
      (rule) =>
        rule.entityType === "TEACHER" &&
        rule.dayOfWeek === 0 &&
        rule.kind === "UNAVAILABLE",
    ),
  ).toBe(true);

  expect(stored.staffingPlan.teachers).toHaveLength(1);
  expect(stored.staffingPlan.teachers[0]!.targetWeeklyLoad).toBe(22);
  expect(stored.staffingPlan.teachers[0]!.unavailableDays).toEqual(["MON"]);
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
