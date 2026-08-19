import { expect, test } from "@playwright/test";

import { exactUploadedWorkbookBytes } from "../test-support/exact-uploaded-excel-fixture";

test("exact anonymized uploaded Excel imports through UI and produces a solver timetable", async ({
  page,
}) => {
  test.setTimeout(780_000);
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  const bytes = await exactUploadedWorkbookBytes();
  await page.goto("/coverage?schoolYearId=local-school-year");
  await page.getByLabel("Nahrát Excel s učiteli a úvazky").setInputFiles({
    name: "uploaded-staffing-anonymized.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(bytes),
  });

  await expect(
    page.getByText("Excel byl načten.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Všechny hodiny mají potřebné učitele"),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);

  await page.goto("/pe-capacity?schoolYearId=local-school-year");
  await page.getByRole("button", { name: "Použít doporučený profil" }).click();
  await expect(
    page.getByText(/Aktivní profil:\s*doporučený 2026\/2027/),
  ).toBeVisible();

  await page.goto("/generate?schoolYearId=local-school-year");
  await page
    .getByRole("button", { name: "Připravit a zkontrolovat data" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Zadání je připravené" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Připraveno: 33 učitelů, 13 tříd,/),
  ).toBeVisible();

  await page.getByLabel("Časový limit výpočtu").selectOption("600");
  await page.getByRole("button", { name: "Vytvořit nový návrh" }).click();

  const success = page.getByText(/^(Proveditelný návrh|Optimální návrh)$/);
  const failure = page.getByText(/^(Řešení nebylo nalezeno|Výpočet selhal)$/);
  await expect(success.or(failure)).toBeVisible({ timeout: 660_000 });
  await expect(success).toBeVisible();

  await page.getByRole("link", { name: "Otevřít návrh" }).click();
  await expect(
    page.getByRole("heading", { name: "Kvalita návrhu" }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});
