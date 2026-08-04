import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";
import JSZip from "jszip";

const EMPTY_DRAWING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>`;

const EMPTY_PERSON_LIST = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<x18tc:personList xmlns:x18tc="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments"/>`;

function appendBeforeClosingTag(
  xml: string,
  closingTag: string,
  value: string,
): string {
  assert.ok(xml.includes(closingTag), `Missing ${closingTag}`);
  return xml.replace(closingTag, `${value}${closingTag}`);
}

async function workbookWithOfficeEmptyParts(): Promise<Uint8Array> {
  const source = new ExcelJS.Workbook();
  const staffing = source.addWorksheet("Úvazky 20252026");
  staffing.getCell("A1").value = "Požadavek";
  source.addWorksheet("Jednotlivci");

  const zip = await JSZip.loadAsync(await source.xlsx.writeBuffer());
  zip.file("xl/drawings/drawing1.xml", EMPTY_DRAWING);
  zip.file("xl/persons/person.xml", EMPTY_PERSON_LIST);

  const sheetPath = "xl/worksheets/sheet1.xml";
  const sheetXml = await zip.file(sheetPath)!.async("text");
  zip.file(
    sheetPath,
    appendBeforeClosingTag(sheetXml, "</worksheet>", '<drawing r:id="rId1"/>'),
  );
  zip.file(
    "xl/worksheets/_rels/sheet1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`,
  );

  const workbookRelsPath = "xl/_rels/workbook.xml.rels";
  const workbookRels = await zip.file(workbookRelsPath)!.async("text");
  zip.file(
    workbookRelsPath,
    appendBeforeClosingTag(
      workbookRels,
      "</Relationships>",
      '<Relationship Id="rIdPerson" Type="http://schemas.microsoft.com/office/2017/10/relationships/person" Target="persons/person.xml"/>',
    ),
  );

  const contentTypesPath = "[Content_Types].xml";
  const contentTypes = await zip.file(contentTypesPath)!.async("text");
  zip.file(
    contentTypesPath,
    appendBeforeClosingTag(
      contentTypes,
      "</Types>",
      '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/persons/person.xml" ContentType="application/vnd.ms-excel.person+xml"/>',
    ),
  );

  return zip.generateAsync({ type: "uint8array" });
}

test("ExcelJS can load the empty drawing/person parts emitted by the real workbook", async () => {
  const bytes = await workbookWithOfficeEmptyParts();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never);
  assert.ok(workbook.getWorksheet("Úvazky 20252026"));
});
