import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";
import ExcelJS, { type Worksheet } from "exceljs";

const artifactDirectory = path.join(
  process.cwd(),
  "test-results",
  "coverage-screenshots",
);

const REGULAR = {
  CJ: [5, 4, 4, 4],
  JAZ1: [4, 3, 3, 4],
  JAZ2: [0, 0, 3, 3],
  M: [4, 5, 4, 4],
  INF: [1, 1, 1, 1],
  DEJ: [2, 2, 2, 2],
  OV: [1, 1, 1, 1],
  FY: [2, 2, 1, 2],
  CH: [0, 0, 2, 2],
  PRI: [2, 2, 2, 1],
  ZEM: [2, 2, 1, 2],
  HV: [1, 1, 1, 0],
  VV: [2, 2, 1, 1],
  TV: [2, 2, 2, 2],
  VZ: [0, 1, 1, 0],
  PC: [1, 1, 1, 0],
  VOL: [1, 2, 1, 1],
} as const;

const SPORTS = {
  CJ: [4, 4, 5, 4],
  JAZ1: [3, 3, 3, 3],
  JAZ2: [0, 0, 3, 3],
  M: [4, 4, 4, 5],
  INF: [1, 1, 1, 1],
  DEJ: [2, 2, 2, 2],
  OV: [1, 1, 1, 1],
  FY: [2, 2, 1, 1],
  CH: [0, 0, 2, 2],
  PRI: [2, 2, 1, 1],
  ZEM: [2, 2, 1, 1],
  HV: [1, 1, 1, 0],
  VV: [2, 2, 1, 1],
  TV: [5, 5, 5, 4],
  VZ: [0, 0, 0, 0],
  PC: [1, 1, 1, 0],
  VOL: [0, 0, 0, 1],
} as const;

type CurriculumCode = keyof typeof REGULAR;

const RAW_SUBJECT: Record<Exclude<CurriculumCode, "VOL" | "JAZ2">, string> = {
  CJ: "Čj",
  JAZ1: "Aj",
  M: "M",
  INF: "Inf",
  DEJ: "D",
  OV: "Ov",
  FY: "F",
  CH: "Chemie",
  PRI: "Př",
  ZEM: "Z",
  HV: "Hv",
  VV: "Vv",
  TV: "Tv",
  VZ: "Vkz",
  PC: "Pč",
};

const CLASS_BLOCKS = [
  {
    row: 41,
    classes: [
      [3, "6.A"],
      [7, "6.B"],
      [11, "6.C"],
      [15, "6.D"],
    ] as const,
  },
  {
    row: 70,
    classes: [
      [3, "7.A"],
      [7, "7.B"],
      [11, "7.C"],
    ] as const,
  },
  {
    row: 99,
    classes: [
      [3, "8.A"],
      [7, "8.B"],
      [11, "8.C"],
    ] as const,
  },
  {
    row: 128,
    classes: [
      [3, "9.A"],
      [7, "9.B"],
      [11, "9.C"],
    ] as const,
  },
] as const;

const TEACHERS = [
  "Alfa Adam",
  "Beta Boris",
  "Cerna Cyril",
  "Delta David",
  "Echo Emil",
  "Foxtrot Filip",
  "Gama Gustav",
  "Hotel Hugo",
  "India Ivan",
  "Juliet Jan",
  "Kadleček Tomáš+5",
  "Lima Lukas",
  "Mike Milan",
  "November Norbert",
  "Oscar Otakar",
  "Papa Pavel",
  "Quebec Radek",
  "Romeo Robert",
  "Sierra Samuel",
  "Tango Tomas",
] as const;

const SURNAMES = TEACHERS.map((name) =>
  name.split(" ")[0]!.replace(/\+\d+$/, ""),
);

function teacher(index: number): string {
  return SURNAMES[index % SURNAMES.length]!;
}

function profileForClass(classCode: string) {
  return /\.(B|D)$/.test(classCode) ? SPORTS : REGULAR;
}

function weeklyPeriods(classCode: string, subjectCode: CurriculumCode): number {
  const gradeIndex = Number(classCode.split(".")[0]) - 6;
  return profileForClass(classCode)[subjectCode][gradeIndex] ?? 0;
}

function writeClassHeader(
  worksheet: Worksheet,
  row: number,
  classes: readonly (readonly [number, string])[],
): void {
  for (const [column, classCode] of classes) {
    worksheet.getCell(row, column).value = classCode;
    worksheet.getCell(row, column + 1).value =
      `${teacher(column)} ${teacher(column + 1)}`;
    worksheet.getCell(row + 2, column).value = "Předměty";
    worksheet.getCell(row + 2, column + 1).value = "Učitel/učitelka";
    worksheet.getCell(row + 2, column + 2).value = "Časová dotace";
  }
}

function writeSubject(
  worksheet: Worksheet,
  row: number,
  column: number,
  subject: string,
  assignedTeacher: string,
  hours: number,
): void {
  worksheet.getCell(row, column).value = subject;
  worksheet.getCell(row, column + 1).value = assignedTeacher;
  worksheet.getCell(row, column + 2).value = hours;
}

function splitTeacher(classCode: string, subjectCode: string): string {
  const seed =
    classCode.charCodeAt(0) + classCode.charCodeAt(2) + subjectCode.length;
  const first = teacher(seed);
  let second = teacher(seed + 3);
  if (second === first) second = teacher(seed + 4);
  return `${first}/${second}`;
}

function wholeTeacher(classCode: string, subjectCode: string): string {
  return teacher(
    classCode.charCodeAt(0) + classCode.charCodeAt(2) + subjectCode.length,
  );
}

function writeClassSubjects(
  worksheet: Worksheet,
  startRow: number,
  column: number,
  classCode: string,
): void {
  let row = startRow;
  const subjects = Object.keys(REGULAR) as CurriculumCode[];

  for (const subjectCode of subjects) {
    const hours = weeklyPeriods(classCode, subjectCode);
    if (hours <= 0) continue;

    if (subjectCode === "VOL") {
      if (["6.A", "6.C"].includes(classCode)) continue;
      if (["7.A", "7.C"].includes(classCode)) {
        writeSubject(
          worksheet,
          row,
          column,
          "Přpk",
          wholeTeacher(classCode, "PRPK"),
          1,
        );
        row += 1;
        continue;
      }
      writeSubject(
        worksheet,
        row,
        column,
        "Svs",
        wholeTeacher(classCode, "SVS"),
        1,
      );
      row += 1;
      continue;
    }

    if (subjectCode === "JAZ2") {
      if (["8.A", "8.B", "8.C"].includes(classCode)) {
        writeSubject(
          worksheet,
          row,
          column,
          "Německý jazyk",
          classCode === "8.A" ? wholeTeacher(classCode, "NJ") : "",
          hours,
        );
        row += 1;
        writeSubject(
          worksheet,
          row,
          column,
          "Španělský jazyk",
          wholeTeacher(classCode, "SPJ"),
          hours,
        );
        row += 1;
        continue;
      }

      writeSubject(
        worksheet,
        row,
        column,
        "Německý jazyk",
        classCode === "9.B"
          ? splitTeacher(classCode, "JAZ2")
          : wholeTeacher(classCode, "JAZ2"),
        hours,
      );
      row += 1;
      continue;
    }

    const assignedTeacher = ["JAZ1", "INF", "TV"].includes(subjectCode)
      ? splitTeacher(classCode, subjectCode)
      : wholeTeacher(classCode, subjectCode);
    writeSubject(
      worksheet,
      row,
      column,
      RAW_SUBJECT[
        subjectCode as Exclude<CurriculumCode, "VOL" | "JAZ2">
      ],
      assignedTeacher,
      hours,
    );
    row += 1;
  }
}

async function createActualLikeWorkbook(filePath: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Úvazky 20252026");
  workbook.addWorksheet("Jednotlivci");

  worksheet.getRow(4).values = [
    "Požadavek",
    "TU",
    "Učitel/učitelka",
    "Současný úvazek",
  ];
  TEACHERS.forEach((name, index) => {
    const row = index + 5;
    worksheet.getCell(row, 1).value = 22;
    worksheet.getCell(row, 3).value = name;
    worksheet.getCell(row, 4).value = 22;
  });

  for (const block of CLASS_BLOCKS) {
    writeClassHeader(worksheet, block.row, block.classes);
    for (const [column, classCode] of block.classes) {
      writeClassSubjects(worksheet, block.row + 3, column, classCode);
    }
  }

  await writeFile(filePath, new Uint8Array(await workbook.xlsx.writeBuffer()));
}

test("actual 2027 staffing layout produces a small concrete breakdown instead of invented missing groups", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1800, height: 1200 });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const workbookPath = path.join(
    process.cwd(),
    "test-results",
    "actual-2027-staffing.xlsx",
  );
  await mkdir(path.dirname(workbookPath), { recursive: true });
  await createActualLikeWorkbook(workbookPath);

  await page.goto("/coverage?schoolYearId=local-school-year");
  await page
    .getByLabel("Nahrát Excel s učiteli a úvazky")
    .setInputFiles(workbookPath);

  await expect(
    page.getByText("Excel byl načten.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Chybí pokrýt 8 učitelských hodin"),
  ).toBeVisible();

  const czech = page.getByTestId("coverage-6.A-CJ");
  const english = page.getByTestId("coverage-6.A-JAZ1");
  const german8B = page.getByTestId("coverage-8.B-JAZ2");
  const german9A = page.getByTestId("coverage-9.A-JAZ2");
  const german9B = page.getByTestId("coverage-9.B-JAZ2");
  const elective6A = page.getByTestId("coverage-6.A-VOL");
  const elective8A = page.getByTestId("coverage-8.A-VOL");

  await expect(czech).toHaveAttribute("data-status", "FULL");
  await expect(czech).toContainText("1/1");
  await expect(english).toHaveAttribute("data-status", "FULL");
  await expect(english).toContainText("2/2");
  await expect(german8B).toHaveAttribute("data-status", "PARTIAL");
  await expect(german8B).toContainText("1/2");
  await expect(german9A).toHaveAttribute("data-status", "FULL");
  await expect(german9A).toContainText("1/1");
  await expect(german9B).toHaveAttribute("data-status", "FULL");
  await expect(german9B).toContainText("2/2");
  await expect(elective6A).toHaveAttribute("data-status", "MISSING");
  await expect(elective6A).toContainText("0/1");
  await expect(elective8A).toHaveAttribute("data-status", "FULL");
  await expect(elective8A).toContainText("1/1");

  await mkdir(artifactDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(artifactDirectory, "02-format-2027-po-importu.png"),
    fullPage: true,
    animations: "disabled",
  });

  expect(pageErrors).toEqual([]);
});
