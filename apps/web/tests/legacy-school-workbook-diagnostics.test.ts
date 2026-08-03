import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import { parseLegacySchoolWorkbook } from "../lib/import/legacy-school-workbook-parser";

test(
  "diagnostic: serialized legacy workbook keeps its signature and class block",
  async () => {
    const source = new ExcelJS.Workbook();
    const staffing = source.addWorksheet("Úvazky 20252026");
    source.addWorksheet("Jednotlivci");
    staffing.getCell("C41").value = "8.A";
    staffing.getCell("D41").value = "Zdena Schoberová";
    staffing.getCell("C43").value = "Předměty";
    staffing.getCell("D43").value = "Učitel/učitelka";
    staffing.getCell("E43").value = "Časová dotace";
    staffing.getCell("C44").value = "Německý jazyk";
    staffing.getCell("D44").value = "Přikrylová";
    staffing.getCell("E44").value = 3;

    const bytes = new Uint8Array(await source.xlsx.writeBuffer());
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(bytes as never);

    assert.deepEqual(
      reopened.worksheets.map((worksheet) => worksheet.name),
      ["Úvazky 20252026", "Jednotlivci"],
    );
    assert.equal(
      reopened.getWorksheet("Úvazky 20252026")?.actualRowCount,
      44,
    );
    assert.equal(
      reopened.getWorksheet("Úvazky 20252026")?.getCell("C41").text,
      "8.A",
    );

    const parsed = parseLegacySchoolWorkbook(reopened);
    assert.ok(parsed, "legacy parser returned null after XLSX roundtrip");
    assert.deepEqual(parsed.classCodes, ["8.A"]);
    assert.equal(parsed.requirements.length, 1);
  },
);
