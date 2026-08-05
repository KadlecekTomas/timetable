import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ExcelJS from "exceljs";

import { analyzeStaffingWorkbook } from "../lib/import/staffing-workbook-school-v2";
import { validateStaffingPlan } from "../lib/local/staffing-plan-school-v2";

const fixtureDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

function crc32(buffer: Buffer): number {
  const table = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntry(name: string, content: Buffer): Buffer {
  const nameBuffer = Buffer.from(name);
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt16LE(0, 12);
  localHeader.writeUInt32LE(crc32(content), 14);
  localHeader.writeUInt32LE(content.length, 18);
  localHeader.writeUInt32LE(content.length, 22);
  localHeader.writeUInt16LE(nameBuffer.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(0, 10);
  centralHeader.writeUInt16LE(0, 12);
  centralHeader.writeUInt16LE(0, 14);
  centralHeader.writeUInt32LE(crc32(content), 16);
  centralHeader.writeUInt32LE(content.length, 20);
  centralHeader.writeUInt32LE(content.length, 24);
  centralHeader.writeUInt16LE(nameBuffer.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(0, 42);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralHeader.length + nameBuffer.length, 12);
  end.writeUInt32LE(localHeader.length + nameBuffer.length + content.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([
    localHeader,
    nameBuffer,
    content,
    centralHeader,
    nameBuffer,
    end,
  ]);
}

async function workbookWithOfficeEmptyParts(): Promise<Uint8Array> {
  const bytes = Buffer.from(
    await readFile(path.join(fixtureDirectory, "exceljs-empty-parts-base.b64"), "utf8"),
    "base64",
  );
  return new Uint8Array(bytes);
}

async function sanitizedRealWorkbook(): Promise<Uint8Array> {
  const parts = await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      readFile(
        path.join(
          fixtureDirectory,
          `2027-real-sanitized.part${String(index + 1).padStart(2, "0")}.b64`,
        ),
        "utf8",
      ),
    ),
  );
  return new Uint8Array(Buffer.from(parts.join(""), "base64"));
}

test("ExcelJS can load the empty drawing/person parts emitted by the real workbook", async () => {
  const bytes = await workbookWithOfficeEmptyParts();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never);
  assert.ok(workbook.getWorksheet("Úvazky 20252026"));
});

test("the sanitized real 2027 workbook imports a recoverable draft and keeps readiness errors", async () => {
  const bytes = await sanitizedRealWorkbook();
  const analysis = await analyzeStaffingWorkbook(bytes);

  assert.equal(analysis.valid, true);
  assert.ok(analysis.plan.teachers.length > 0);
  assert.ok(
    analysis.issues.some(
      (issue) =>
        issue.severity === "WARNING" && issue.message.includes("nadúvazek"),
    ),
    "Hours above the base load must be preserved as a visible overtime warning.",
  );
  assert.ok(
    analysis.plan.teachers.some(
      (teacher) =>
        teacher.targetWeeklyLoad > 22 && teacher.baseWeeklyLoad === 22,
    ),
    "The importer must preserve the total load and derive a 22-hour base.",
  );
  assert.ok(
    validateStaffingPlan(analysis.plan).some((message) =>
      message.includes("Ještě chybí rozdělit"),
    ),
    "The imported draft must remain blocked until all total hours are assigned.",
  );
  assert.ok(
    "allocationDraft" in analysis &&
      analysis.allocationDraft &&
      analysis.allocationDraft.rows.length > 0,
    "Valid teaching rows must remain available in the partial allocation draft.",
  );
});
