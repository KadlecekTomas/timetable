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

function worksheetTexts(worksheet: ExcelJS.Worksheet): string[] {
  const values: string[] = [];
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (cell.text) values.push(cell.text);
    });
  });
  return values;
}

test("school leadership downloads a readable Excel with class and teacher sheets", async ({
  page,
}) => {
  test.setTimeout(180_000);
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
  await page
    .getByRole("link", { name: "Nastavení a záloha", exact: true })
    .first()
    .click();
  await page.getByLabel("Název školy").fill("ZŠ Export");
  await page.getByRole("button", { name: "Uložit nastavení" }).click();
  await expect(
    page.getByText("Nastavení projektu bylo uloženo do tohoto prohlížeče."),
  ).toBeVisible();

  const workbookBuffer = await createSchoolWorkbook();
  await page.goto("/legacy-client-import?schoolYearId=local-school-year");
  await page.locator("#import-file").setInputFiles({
    name: "export-skola.xlsx",
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

  await page.getByRole("link", { name: "Tvorba rozvrhu" }).click();
  await expect(
    page.getByRole("heading", { name: "Zadání je připravené" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vytvořit nový návrh" }).click();
  await expect(
    page.getByText(/^(Proveditelný návrh|Optimální návrh)$/),
  ).toBeVisible({ timeout: 90_000 });
  await page.getByRole("link", { name: "Otevřít návrh" }).click();
  await expect(
    page.getByRole("button", { name: "Exportovat rozvrh do Excelu" }),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportovat rozvrh do Excelu" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "rozvrh-zs-export-2026-2027-navrh-1-r1.xlsx",
  );
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();

  const exportedWorkbook = new ExcelJS.Workbook();
  await exportedWorkbook.xlsx.load((await readFile(downloadPath!)) as never);
  expect(exportedWorkbook.worksheets).toHaveLength(4);
  const overview = exportedWorkbook.getWorksheet("Přehled");
  const classSheet = exportedWorkbook.getWorksheet("Třída 6A");
  const teacherNov = exportedWorkbook.getWorksheet("Učitel NOV");
  const teacherSvo = exportedWorkbook.getWorksheet("Učitel SVO");
  expect(overview).toBeDefined();
  expect(classSheet).toBeDefined();
  expect(teacherNov).toBeDefined();
  expect(teacherSvo).toBeDefined();
  expect(overview!.getCell("B4").text).toBe("ZŠ Export");
  expect(overview!.getCell("B5").text).toBe("2026/2027");
  expect(overview!.getCell("E4").value).toBe(1);
  expect(overview!.getCell("E5").value).toBe(2);
  expect(
    worksheetTexts(classSheet!).some((value) => value.startsWith("M · NOV")),
  ).toBe(true);
  expect(
    worksheetTexts(classSheet!).some((value) => value.startsWith("CJ · SVO")),
  ).toBe(true);
  expect(
    worksheetTexts(teacherNov!).some((value) => value.startsWith("M · 6A")),
  ).toBe(true);
  expect(
    worksheetTexts(teacherSvo!).some((value) => value.startsWith("CJ · 6A")),
  ).toBe(true);
  expect(classSheet!.pageSetup.orientation).toBe("landscape");
  expect(classSheet!.pageSetup.fitToWidth).toBe(1);
  expect(classSheet!.pageSetup.fitToHeight).toBe(1);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});
