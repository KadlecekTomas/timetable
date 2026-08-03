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
  } catch {
    return analyzeBaseClientImportWorkbook(buffer);
  }

  try {
    const legacyAnalysis = analyzeLegacySchoolWorkbook(workbook);
    if (legacyAnalysis) return legacyAnalysis;
  } catch (error) {
    console.error("LEGACY_WORKBOOK_ANALYSIS_FAILED", error);
    throw error;
  }

  return analyzeBaseClientImportWorkbook(buffer);
}
