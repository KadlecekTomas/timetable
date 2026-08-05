import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { analyzeChodovickaWorkbook } from "./chodovicka-workbook";

async function workbookBytes(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const loads = workbook.addWorksheet("Úvazky 20252026");
  workbook.addWorksheet("Jednotlivci");

  loads.getRow(4).values = [
    "Požadavek",
    "",
    "Učitel/učitelka",
    "",
    "Čj",
    "M",
    "Aj",
    "Nj",
    "Špj",
    "D",
    "Z",
    "Př",
    "Ch",
    "F",
    "Ch",
    "Vkz",
    "VV",
    "Pč",
    "Tv",
    "Svs",
    "Ov",
    "Inf",
    "Hv",
  ];
  loads.getCell("C5").value = "Kadleček Tomáš";
  loads.getCell("D5").value = 5;
  loads.getCell("C6").value = "Vašáková Nikola";
  loads.getCell("D6").value = 1;
  loads.getCell("C7").value = "Novotná Jana";
  loads.getCell("D7").value = 4;

  loads.getCell("C41").value = "6.A";
  loads.getCell("D41").value = "Natalie Pilat";
  loads.getCell("C43").value = "Předměty";
  loads.getCell("D43").value = "Učitel/učitelka";
  loads.getCell("E43").value = "Časová dotace";
  loads.getCell("C44").value = "Čj";
  loads.getCell("D44").value = "Novotná";
  loads.getCell("E44").value = 4;
  loads.getCell("C45").value = "Inf";
  loads.getCell("D45").value = "Vašáková/Kadleček";
  loads.getCell("E45").value = 1;

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe("analyzeChodovickaWorkbook", () => {
  it("imports classes, teachers and split teaching from the existing school layout", async () => {
    const analysis = await analyzeChodovickaWorkbook(await workbookBytes());

    expect(analysis.matched).toBe(true);
    expect(analysis.valid).toBe(true);
    expect(analysis.summary.classes).toBe(1);
    expect(analysis.summary.teachingRows).toBe(2);
    expect(analysis.summary.splitRows).toBe(1);

    const czech = analysis.teachingPlan.rows.find(
      (row) => row.classCode === "6.A" && row.subjectCode === "CJ",
    );
    expect(czech?.weeklyPeriods).toBe(4);
    expect(czech?.organization).toBe("WHOLE");

    const informatics = analysis.teachingPlan.rows.find(
      (row) => row.classCode === "6.A" && row.subjectCode === "INF",
    );
    expect(informatics?.organization).toBe("SPLIT");
    expect(informatics?.primaryTeacherId).toBeTruthy();
    expect(informatics?.secondaryTeacherId).toBeTruthy();

    const kadlecek = analysis.staffingPlan.teachers.find(
      (teacher) => teacher.lastName === "Kadleček",
    );
    expect(
      kadlecek?.subjectLoads.find((load) => load.subjectCode === "INF")
        ?.weeklyPeriods,
    ).toBe(1);
  });

  it("does not claim unrelated workbooks", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Sheet1");
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    const analysis = await analyzeChodovickaWorkbook(bytes);
    expect(analysis.matched).toBe(false);
  });
});
