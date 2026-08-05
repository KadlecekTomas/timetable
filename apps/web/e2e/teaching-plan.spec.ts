import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const artifactDirectory = path.join(
  process.cwd(),
  "test-results",
  "teaching-plan-screenshots",
);

async function screenshot(page: Page, name: string) {
  await mkdir(artifactDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(artifactDirectory, name),
    fullPage: true,
    animations: "disabled",
  });
}

test("technical amateur can create a VV double lesson and split INF groups", async ({
  page,
}) => {
  test.setTimeout(120_000);
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
  await page.getByRole("button", { name: "Přidat učitele ručně" }).click();
  await page.getByLabel("Jméno").nth(0).fill("Tomáš");
  await page.getByLabel("Příjmení").nth(0).fill("Kadleček");
  await page.getByLabel("Úvazek týdně").nth(0).fill("3");
  await page.locator('select[aria-label="Předmět"]').nth(0).selectOption("VV");
  await page
    .locator('input[aria-label="Počet hodin předmětu"]')
    .nth(0)
    .fill("2");
  await page
    .getByRole("button", { name: "Přidat další předmět" })
    .nth(0)
    .click();
  await page.locator('select[aria-label="Předmět"]').nth(1).selectOption("INF");
  await page
    .locator('input[aria-label="Počet hodin předmětu"]')
    .nth(1)
    .fill("1");

  await page.getByRole("button", { name: "Přidat učitele ručně" }).click();
  await page.getByLabel("Jméno").nth(1).fill("N.");
  await page.getByLabel("Příjmení").nth(1).fill("Vašáková");
  await page.getByLabel("Úvazek týdně").nth(1).fill("1");
  await page.locator('select[aria-label="Předmět"]').nth(2).selectOption("INF");
  await page
    .locator('input[aria-label="Počet hodin předmětu"]')
    .nth(2)
    .fill("1");

  await page.getByRole("button", { name: "Uložit Tomáš Kadleček" }).click();
  await page.getByRole("button", { name: "Uložit N. Vašáková" }).click();
  await expect(page.getByText("Všichni učitelé jsou připraveni")).toBeVisible();
  await page
    .getByRole("button", { name: "Uložit učitele do projektu" })
    .click();
  await expect(
    page.getByText("Hotovo. Uloženo 2 učitelů včetně celých nedostupných dnů."),
  ).toBeVisible();

  await page.evaluate(() => {
    localStorage.setItem(
      "rozvrhar:teaching-plan:v1",
      JSON.stringify({
        version: 1,
        updatedAt: new Date(0).toISOString(),
        classes: [],
        rows: [],
      }),
    );
  });
  await page.goto("/teaching-plan?schoolYearId=local-school-year");
  await expect(page.getByRole("heading", { name: "Výuka tříd" })).toBeVisible();
  await screenshot(page, "01-krok-2-prazdny-plan.png");

  await page.getByLabel("Nová třída").fill("8A");
  await page.getByRole("button", { name: "Přidat", exact: true }).click();
  await page.getByRole("button", { name: "Přidat předmět" }).click();

  await page.getByLabel("Předmět 1").selectOption("VV");
  await page.getByLabel("Hodin týdně 1").fill("2");
  await page.getByRole("button", { name: "Pouze dvojhodiny" }).click();
  await page
    .getByLabel("Učitel 1 předmětu 1")
    .selectOption({ label: "Tomáš Kadleček" });
  await expect(
    page.getByText("1× dvojhodina", { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText("2 hodiny v kuse")).toBeVisible();
  await screenshot(page, "02-vv-jedna-dvojhodina.png");

  await page.getByRole("button", { name: "Přidat předmět" }).click();
  await page.getByLabel("Předmět 2").selectOption("INF");
  await page.getByLabel("Hodin týdně 2").fill("1");
  await page
    .getByLabel("Předmět 2")
    .locator("xpath=ancestor::article")
    .getByRole("button", {
      name: "Dvě skupiny – stejný předmět",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Učitel 1 předmětu 2")
    .selectOption({ label: "Tomáš Kadleček" });
  await page
    .getByLabel("Učitel 2 předmětu 2")
    .selectOption({ label: "N. Vašáková" });
  await expect(
    page.getByText("Obě skupiny budou vždy ve stejnou dobu."),
  ).toBeVisible();
  await screenshot(page, "03-inf-dve-soubezne-skupiny.png");

  await expect(page.getByText("3 / 3 h")).toBeVisible();
  await expect(page.getByText("1 / 1 h")).toBeVisible();
  await expect(page.getByText("Výuka tříd je připravená")).toBeVisible();
  await screenshot(page, "04-hotovy-plan-a-kontrola-uvazku.png");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Stáhnout Excel pro třídy" }).click();
  const download = await downloadPromise;
  await mkdir(artifactDirectory, { recursive: true });
  await download.saveAs(
    path.join(artifactDirectory, "02-tridy-predmety-dvojhodiny-a-deleni.xlsx"),
  );

  await page.getByRole("button", { name: "Uložit výuku do projektu" }).click();
  await expect(
    page.getByText(
      "Hotovo. Uloženo 2 nastavení jako 3 výukových vazeb včetně dvojhodin, dělení a výměn předmětů.",
    ),
  ).toBeVisible();
  await screenshot(page, "05-plan-ulozeny-do-projektu.png");

  const stored = await page.evaluate(
    () =>
      new Promise<{
        assignments: Array<{
          assignmentCode: string;
          group: string;
          weeklyPeriods: number;
          lessonShape: string;
          doublePeriodsCount: number;
          teacherId: string;
          classId: string;
          subjectId: string;
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

  expect(stored.assignments).toHaveLength(3);
  const art = stored.assignments.find((item) =>
    item.assignmentCode.includes("VV"),
  );
  expect(art).toMatchObject({
    group: "WHOLE",
    weeklyPeriods: 2,
    lessonShape: "DOUBLE",
    doublePeriodsCount: 1,
  });
  const informatics = stored.assignments.filter((item) =>
    item.assignmentCode.includes("INF"),
  );
  expect(informatics).toHaveLength(2);
  expect(informatics.map((item) => item.group).sort()).toEqual([
    "GROUP_1",
    "GROUP_2",
  ]);
  expect(new Set(informatics.map((item) => item.teacherId)).size).toBe(2);
  expect(informatics.every((item) => item.weeklyPeriods === 1)).toBe(true);
  expect(informatics.every((item) => item.lessonShape === "SINGLE")).toBe(true);

  expect(pageErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});
