import { expect, test } from "@playwright/test";

import { createSchoolYear } from "./release-gate.helpers";

test("odkaz Nastavení vede na existující a načitatelnou stránku", async ({
  page,
  request,
}) => {
  const schoolYear = await createSchoolYear(request, "Nastavení route");
  const serverErrors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto(`/?schoolYearId=${encodeURIComponent(schoolYear.id)}`);
  await page.getByRole("link", { name: "Nastavení" }).click();

  await expect(
    page.getByRole("heading", { name: "Nastavení školního roku" }),
  ).toBeVisible();
  await expect(page.getByText("Nastavení route", { exact: false })).toBeVisible();
  await expect(page.getByText("Školní rok 2026/2027")).toBeVisible();
  expect(serverErrors).toEqual([]);
});
