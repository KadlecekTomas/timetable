import ExcelJS from "exceljs";

import { createClientImportTemplate } from "./client-workbook";
import { applySchoolTemplatePrefill } from "./client-workbook-prefill";
import { applySchoolStaffingOverrides } from "./school-staffing-overrides";

export async function createSchoolClientImportTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await createClientImportTemplate()) as never);
  applySchoolTemplatePrefill(workbook);
  applySchoolStaffingOverrides(workbook);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
