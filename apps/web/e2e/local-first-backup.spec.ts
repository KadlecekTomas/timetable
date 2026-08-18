import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

test("local settings survive reload and a corrupted backup is rejected", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/settings?schoolYearId=local-school-year");
  await expect(
    page.getByRole("heading", { name: "Lokální projekt školy" }),
  ).toBeVisible();

  await page.getByLabel("Název školy").fill("ZŠ Trvalé uložení");
  await page.getByRole("button", { name: "Uložit nastavení" }).click();
  await expect(
    page.getByText("Nastavení projektu bylo uloženo do tohoto prohlížeče."),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Název školy")).toHaveValue("ZŠ Trvalé uložení");
  await expect(
    page.getByText("ZŠ Trvalé uložení", { exact: true }),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Stáhnout zálohu projektu" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();

  const backup = JSON.parse(
    (await readFile(downloadPath!)).toString("utf8"),
  ) as Record<string, unknown>;
  backup.checksum = "0".repeat(64);
  const corruptedBackup = Buffer.from(JSON.stringify(backup), "utf8");

  await page.locator('input[type="file"]').setInputFiles({
    name: "poskozena-zaloha.rozvrhar.json",
    mimeType: "application/json",
    buffer: corruptedBackup,
  });
  await expect(
    page.getByRole("alertdialog", { name: "Obnovit projekt ze zálohy?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Obnovit projekt" }).click();
  await expect(
    page.getByText(
      "Kontrolní součet nesouhlasí. Odkaz nebo soubor je poškozený či neúplný.",
    ),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Název školy")).toHaveValue("ZŠ Trvalé uložení");
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
