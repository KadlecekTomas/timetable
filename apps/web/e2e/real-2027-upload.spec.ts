import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

async function materializeSanitizedWorkbook(): Promise<string> {
  const fixtureDirectory = path.join(process.cwd(), "tests", "fixtures");
  const parts = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      readFile(
        path.join(
          fixtureDirectory,
          `2027-real-sanitized.part${String(index + 1).padStart(2, "0")}.b64`,
        ),
        "utf8",
      ),
    ),
  );
  const output = path.join(
    process.cwd(),
    "test-results",
    "2027-real-sanitized.xlsx",
  );
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(parts.join(""), "base64"));
  return output;
}

test("coverage page imports the sanitized real 2027 workbook", async ({ page }) => {
  const workbookPath = await materializeSanitizedWorkbook();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/coverage?schoolYearId=local-school-year");
  await page
    .getByLabel("Nahrát Excel s učiteli a úvazky")
    .setInputFiles(workbookPath);

  await expect(
    page.getByText("Excel byl načten.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Cannot read properties of undefined", { exact: false }),
  ).toHaveCount(0);
  await expect(page.getByTestId("coverage-6.A-CJ")).toContainText("1/2");

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
