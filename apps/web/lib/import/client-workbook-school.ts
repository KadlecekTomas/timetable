import ExcelJS from "exceljs";

import type { ImportAnalysis } from "./contracts";
import { analyzeClientImportWorkbook as analyzeBaseClientImportWorkbook } from "./client-workbook";
import { analyzeLegacySchoolWorkbook } from "./legacy-school-workbook";

export async function analyzeClientImportWorkbook(
  buffer: ArrayBuffer | Uint8Array,
): Promise<ImportAnalysis> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as never);
    const legacyAnalysis = analyzeLegacySchoolWorkbook(workbook);
    if (legacyAnalysis) return legacyAnalysis;
  } catch {
    // The base analyzer returns the canonical invalid-workbook result.
  }
  return analyzeBaseClientImportWorkbook(buffer);
}
