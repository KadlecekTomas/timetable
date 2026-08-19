import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import ExcelJS, { type Worksheet } from "exceljs";

import {
  createClientImportTemplate,
  CLIENT_TEMPLATE_FIRST_DATA_ROW,
} from "../lib/import/client-workbook";

function writeRows(worksheet: Worksheet, rows: Array<Array<string | number>>) {
  rows.forEach((values, rowIndex) => {
    values.forEach((value, columnIndex) => {
      worksheet.getCell(
        rowIndex + CLIENT_TEMPLATE_FIRST_DATA_ROW,
        columnIndex + 1,
      ).value = value;
    });
  });
}

async function createSchoolWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await createClientImportTemplate()) as never);

  writeRows(workbook.getWorksheet("Nastavení")!, [
    ["2026/2027", 8, 8, 8, 8, 7],
  ]);
  writeRows(workbook.getWorksheet("1. Učitelé")!, [
    ["NOV", "Jan", "Novák", 2, 2, 2, "M", "6A"],
    ["SVO", "Petra", "Svobodová", 2, 2, 2, "CJ", "6A"],
  ]);
  writeRows(workbook.getWorksheet("2. Třídy")!, [["6A", 6, "6.A"]]);
  writeRows(workbook.getWorksheet("3. Předměty")!, [
    ["M", "Matematika", ""],
    ["CJ", "Český jazyk", ""],
  ]);
  writeRows(workbook.getWorksheet("4. Učebny")!, [
    ["101", "Kmenová učebna", "GENERAL", 30],
    ["102", "Jazyková učebna", "GENERAL", 30],
  ]);
  writeRows(workbook.getWorksheet("5. Kdo co učí")!, [
    [
      "6A-M-NOV",
      "6A",
      "",
      "M",
      "NOV",
      "Celá třída",
      2,
      "Jednotlivé hodiny",
      0,
      "101",
      "",
      1,
      1,
    ],
    [
      "6A-CJ-SVO",
      "6A",
      "",
      "CJ",
      "SVO",
      "Celá třída",
      2,
      "Jednotlivé hodiny",
      0,
      "102",
      "",
      1,
      1,
    ],
  ]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("entire project survives backup, deletion and restore without a server database", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Příprava školního rozvrhu" }),
  ).toBeVisible();

  await page
    .getByRole("link", { name: "Nastavení a záloha", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Lokální projekt školy" }),
  ).toBeVisible();
  await page.getByLabel("Název školy").fill("ZŠ Lokální");
  await page.getByRole("button", { name: "Uložit nastavení" }).click();
  await expect(
    page.getByText("Nastavení projektu bylo uloženo do tohoto prohlížeče."),
  ).toBeVisible();

  const workbookBuffer = await createSchoolWorkbook();
  await page.goto("/legacy-client-import?schoolYearId=local-school-year");
  await page.locator("#import-file").setInputFiles({
    name: "lokalni-skola.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: workbookBuffer,
  });
  await page.getByRole("button", { name: "Analyzovat soubor" }).click();
  await expect(
    page.getByRole("heading", { name: "Náhled je připraven k uložení" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bezpečně uložit změny" }).click();
  await expect(
    page.getByRole("heading", { name: "Data byla bezpečně uložena" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Přehled" }).click();
  await expect(
    page.getByText("Připravená data je potřeba obnovit."),
  ).toBeVisible();

  await page.getByRole("link", { name: "Tvorba rozvrhu" }).click();
  await expect(
    page.getByRole("heading", { name: "Připravit data pro tvorbu rozvrhu" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Připravit a zkontrolovat data" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Zadání je připravené" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vytvořit nový návrh" }).click();
  await expect(
    page.getByText(/^(Proveditelný návrh|Optimální návrh)$/),
  ).toBeVisible({ timeout: 90_000 });
  await page.getByRole("link", { name: "Otevřít návrh" }).click();
  await expect(
    page.getByRole("heading", { name: "Kvalita návrhu" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /M\s+NOV\s+101/ }).first(),
  ).toBeVisible();

  await page
    .getByRole("link", { name: "Nastavení a záloha", exact: true })
    .first()
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Stáhnout zálohu projektu" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "rozvrhar-zs-lokalni-2026-2027.rozvrhar.json",
  );
  const backupPath = await download.path();
  expect(backupPath).not.toBeNull();
  const backupBytes = await readFile(backupPath!);
  const backup = JSON.parse(backupBytes.toString("utf8")) as {
    format: string;
    checksum: string;
    data: {
      project: {
        teachers: unknown[];
        timetableVersions: unknown[];
      };
    };
  };
  expect(backup.format).toBe("rozvrhar-browser-project");
  expect(backup.checksum).toMatch(/^[a-f0-9]{64}$/);
  expect(backup.data.project.teachers).toHaveLength(2);
  expect(backup.data.project.timetableVersions).toHaveLength(1);

  await page.evaluate(() => {
    for (const key of [
      "rozvrhar:staffing-plan:v1",
      "rozvrhar:teaching-plan:v1",
      "rozvrhar:staffing-allocation-draft:v1",
      "rozvrhar:school-curriculum:v1",
      "rozvrhar:teaching-plan-workload-credits:v1",
      "rozvrhar:teaching-plan-allocation-draft-applied:v1",
      "rozvrhar:teaching-plan-shared:v1",
      "rozvrhar:teaching-plan-split-periods:v1",
    ]) {
      window.localStorage.setItem(key, "delete-me");
    }
    window.sessionStorage.setItem(
      "rozvrhar:teaching-plan-import-review:v1",
      "delete-me",
    );
  });
  await page.getByRole("button", { name: "Vymazat lokální projekt" }).click();
  await expect(
    page.getByRole("alertdialog", {
      name: "Definitivně vymazat celý projekt?",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Vymazat projekt", exact: true })
    .click();
  await expect(
    page.getByText("Lokální projekt byl vymazán a vytvořen znovu prázdný."),
  ).toBeVisible();
  const remainingOwnedKeys = await page.evaluate(() => ({
    local: [
      "rozvrhar:staffing-plan:v1",
      "rozvrhar:teaching-plan:v1",
      "rozvrhar:staffing-allocation-draft:v1",
      "rozvrhar:school-curriculum:v1",
      "rozvrhar:teaching-plan-workload-credits:v1",
      "rozvrhar:teaching-plan-allocation-draft-applied:v1",
      "rozvrhar:teaching-plan-shared:v1",
      "rozvrhar:teaching-plan-split-periods:v1",
    ].filter((key) => window.localStorage.getItem(key) !== null),
    session:
      window.sessionStorage.getItem(
        "rozvrhar:teaching-plan-import-review:v1",
      ) !== null,
  }));
  expect(remainingOwnedKeys).toEqual({ local: [], session: false });

  await page.getByRole("link", { name: "Přehled" }).click();
  await expect(
    page.getByRole("link", { name: "Začít nahráním učitelů" }),
  ).toBeVisible();
  await expect(
    page.getByText("Data zatím nebyla připravena pro generátor."),
  ).toBeVisible();

  await page
    .getByRole("link", { name: "Nastavení a záloha", exact: true })
    .first()
    .click();
  await page.locator('input[type="file"]').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: "application/json",
    buffer: backupBytes,
  });
  await expect(
    page.getByRole("alertdialog", { name: "Obnovit projekt ze zálohy?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Obnovit projekt", exact: true })
    .click();
  await expect(
    page.getByText(
      "Projekt byl úspěšně obnoven včetně pracovních úvazků a učebního plánu.",
    ),
  ).toBeVisible();

  await page.getByRole("link", { name: "6. Rozvrh", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Kvalita návrhu" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /M\s+NOV\s+101/ }).first(),
  ).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});
