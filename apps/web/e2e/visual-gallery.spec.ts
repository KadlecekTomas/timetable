import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import ExcelJS, { type Worksheet } from "exceljs";

const screenshotDirectory = path.resolve("screenshots");

function writeRows(worksheet: Worksheet, rows: Array<Array<string | number>>) {
  rows.forEach((values, rowIndex) => {
    values.forEach((value, columnIndex) => {
      worksheet.getCell(rowIndex + 2, columnIndex + 1).value = value;
    });
  });
}

async function capture(page: Page, name: string) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({
    path: path.join(screenshotDirectory, name),
    fullPage: true,
  });
}

test.use({
  viewport: { width: 1440, height: 1000 },
  colorScheme: "light",
  reducedMotion: "reduce",
});

test("creates a visual gallery of the integrated application", async ({
  page,
  request,
}) => {
  await mkdir(screenshotDirectory, { recursive: true });

  const schoolYearResponse = await request.post("/api/school-years", {
    data: {
      schoolName: "ZŠ Komenského",
      label: "2026/2027",
      startsOn: "2026-09-01T00:00:00.000Z",
      endsOn: "2027-06-30T00:00:00.000Z",
      periodsPerDay: [8, 8, 8, 8, 7],
    },
  });
  expect(schoolYearResponse.status()).toBe(201);
  const schoolYear = (await schoolYearResponse.json()) as { id: string };

  const templateResponse = await request.get(
    `/api/school-years/${schoolYear.id}/import-template`,
  );
  expect(templateResponse.ok()).toBeTruthy();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await templateResponse.body()) as never);

  writeRows(workbook.getWorksheet("Nastavení")!, [
    ["2026/2027", 8, 8, 8, 8, 7],
  ]);
  writeRows(workbook.getWorksheet("Učitelé")!, [
    ["NOV", "Jan", "Novák", 12, 12, 12, "M", "6A,7A,8A"],
    ["SVO", "Petra", "Svobodová", 12, 12, 12, "CJ", "6A,7A,8A"],
    ["KRA", "Lucie", "Králová", 9, 9, 9, "AJ", "6A,7A,8A"],
  ]);
  writeRows(workbook.getWorksheet("Třídy")!, [
    ["6A", 6, "6.A"],
    ["7A", 7, "7.A"],
    ["8A", 8, "8.A"],
  ]);
  writeRows(workbook.getWorksheet("Předměty")!, [
    ["M", "Matematika", ""],
    ["CJ", "Český jazyk", ""],
    ["AJ", "Anglický jazyk", ""],
  ]);
  writeRows(workbook.getWorksheet("Učebny")!, [
    ["101", "Kmenová učebna 6.A", "GENERAL", 30],
    ["102", "Kmenová učebna 7.A", "GENERAL", 30],
    ["103", "Kmenová učebna 8.A", "GENERAL", 30],
  ]);

  const assignments: Array<Array<string | number>> = [];
  const classRooms = [
    ["6A", "101"],
    ["7A", "102"],
    ["8A", "103"],
  ] as const;
  for (const [classCode, roomCode] of classRooms) {
    assignments.push(
      [
        `${classCode}-M-NOV`,
        classCode,
        "M",
        "NOV",
        "WHOLE",
        4,
        "SINGLE",
        0,
        roomCode,
        "",
        1,
        1,
      ],
      [
        `${classCode}-CJ-SVO`,
        classCode,
        "CJ",
        "SVO",
        "WHOLE",
        4,
        "SINGLE",
        0,
        roomCode,
        "",
        1,
        1,
      ],
      [
        `${classCode}-AJ-KRA`,
        classCode,
        "AJ",
        "KRA",
        "WHOLE",
        3,
        "SINGLE",
        0,
        roomCode,
        "",
        1,
        1,
      ],
    );
  }
  writeRows(workbook.getWorksheet("Výukové_vazby")!, assignments);

  const workbookBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

  await page.goto(`/import?schoolYearId=${schoolYear.id}`);
  await page.locator("#import-file").setInputFiles({
    name: "zs-komenskeho-2026-2027.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: workbookBuffer,
  });
  await page.getByRole("button", { name: "Analyzovat soubor" }).click();
  await expect(
    page.getByRole("heading", { name: "Náhled je připraven k potvrzení" }),
  ).toBeVisible();
  await capture(page, "01-import-preview.png");

  await page.getByRole("button", { name: "Potvrdit změny atomicky" }).click();
  await expect(
    page.getByRole("heading", { name: "Import byl atomicky potvrzen" }),
  ).toBeVisible();

  await page.goto(`/?schoolYearId=${schoolYear.id}`);
  await expect(page.getByText("Generování lze spustit")).toBeVisible();
  await capture(page, "02-dashboard-ready.png");

  await page.goto(`/data?schoolYearId=${schoolYear.id}`);
  await expect(
    page.getByRole("heading", { name: "Školní data" }),
  ).toBeVisible();
  await expect(page.getByText("3 záznamů", { exact: true })).toBeVisible();
  await capture(page, "03-school-data.png");

  await page.goto(`/generate?schoolYearId=${schoolYear.id}`);
  await expect(
    page.getByRole("heading", { name: "Předletová kontrola prošla" }),
  ).toBeVisible();
  await capture(page, "04-generator-ready.png");

  await page.getByRole("button", { name: "Vytvořit nový návrh" }).click();
  await expect(page.getByText(/^(FEASIBLE|OPTIMAL)$/)).toBeVisible({
    timeout: 90_000,
  });
  await capture(page, "05-generator-complete.png");

  await page.getByRole("link", { name: "Otevřít návrh" }).click();
  await expect(
    page.getByRole("heading", { name: "Kvalita návrhu" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /NOV|SVO|KRA/ }).first(),
  ).toBeVisible();
  await capture(page, "06-timetable-class-view.png");

  await page.getByRole("button", { name: "Učitelé" }).click();
  await expect(page.getByLabel("Učitel")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /6A|7A|8A/ }).first(),
  ).toBeVisible();
  await capture(page, "07-timetable-teacher-view.png");

  await page
    .getByRole("button", { name: /6A|7A|8A/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture(page, "08-lesson-detail.png");
  await page.getByRole("button", { name: "Zavřít" }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?schoolYearId=${schoolYear.id}`);
  await expect(page.getByText("Generování lze spustit")).toBeVisible();
  await capture(page, "09-mobile-dashboard.png");

  const screenshots = (await readdir(screenshotDirectory)).filter((file) =>
    file.endsWith(".png"),
  );
  expect(screenshots).toHaveLength(9);
});
