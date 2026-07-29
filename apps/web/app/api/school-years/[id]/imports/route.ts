import { createHash } from "node:crypto";

import { Prisma, prisma } from "@timetable/database";
import { NextResponse } from "next/server";

import { analyzeImportWorkbook } from "@/lib/import/workbook";
import { apiError } from "@/lib/server/api-response";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface RouteContext {
  params: Promise<{ id: string }>;
}

function isXlsx(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

export async function POST(request: Request, context: RouteContext) {
  const { id: schoolYearId } = await context.params;
  const schoolYear = await prisma.schoolYear.findUnique({ where: { id: schoolYearId } });
  if (!schoolYear) {
    return apiError({ status: 404, code: "SCHOOL_YEAR_NOT_FOUND", message: "Školní rok nebyl nalezen." });
  }

  const formData = await request.formData();
  const uploaded = formData.get("file");
  if (!(uploaded instanceof File)) {
    return apiError({ status: 400, code: "IMPORT_FILE_MISSING", message: "Vyberte soubor .xlsx." });
  }
  if (uploaded.size === 0 || uploaded.size > MAX_UPLOAD_BYTES) {
    return apiError({
      status: 400,
      code: "IMPORT_FILE_SIZE_INVALID",
      message: "Soubor musí mít nejvýše 10 MB a nesmí být prázdný.",
      details: { size: uploaded.size, maximum: MAX_UPLOAD_BYTES },
    });
  }
  const fileName = uploaded.name.trim() || "import.xlsx";
  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    return apiError({
      status: 400,
      code: "IMPORT_FILE_EXTENSION_INVALID",
      message: "Podporovaný je pouze formát .xlsx.",
    });
  }

  const buffer = Buffer.from(await uploaded.arrayBuffer());
  if (!isXlsx(buffer)) {
    return apiError({
      status: 400,
      code: "IMPORT_FILE_CONTENT_INVALID",
      message: "Obsah souboru neodpovídá formátu .xlsx.",
    });
  }
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const existing = await prisma.importBatch.findFirst({
    where: {
      schoolYearId,
      fileHash,
      expectedSchoolYearVersion: schoolYear.version,
      status: { in: ["READY", "VALIDATION_FAILED", "APPLIED"] },
    },
    include: { issues: true },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return NextResponse.json({
      importBatchId: existing.id,
      status: existing.status,
      summary: existing.summary,
      issues: existing.issues,
      reused: true,
    });
  }

  const analysis = await analyzeImportWorkbook(buffer);
  if (analysis.payload && analysis.payload.settings.school_year !== schoolYear.label) {
    analysis.issues.unshift({
      severity: "ERROR",
      sheet: "Nastavení",
      row: 2,
      column: "school_year",
      code: "SCHOOL_YEAR_LABEL_MISMATCH",
      message: `Soubor je určen pro ${analysis.payload.settings.school_year}, aktuální školní rok je ${schoolYear.label}.`,
      rawValue: analysis.payload.settings.school_year,
      suggestion: "Použijte správnou šablonu nebo opravte school_year.",
    });
    analysis.summary.errors += 1;
    analysis.status = "VALIDATION_FAILED";
    analysis.payload = null;
  }

  const batch = await prisma.importBatch.create({
    data: {
      schoolYearId,
      fileName,
      fileHash,
      templateVersion: analysis.templateVersion,
      status: analysis.status,
      expectedSchoolYearVersion: schoolYear.version,
      summary: analysis.summary as unknown as Prisma.InputJsonValue,
      payload: analysis.payload as unknown as Prisma.InputJsonValue,
      issues: {
        create: analysis.issues.map((item) => ({
          severity: item.severity,
          sheet: item.sheet,
          row: item.row,
          column: item.column,
          code: item.code,
          message: item.message,
          rawValue: item.rawValue,
          suggestion: item.suggestion,
        })),
      },
    },
    include: { issues: true },
  });

  return NextResponse.json(
    {
      importBatchId: batch.id,
      status: batch.status,
      summary: batch.summary,
      issues: batch.issues,
      reused: false,
    },
    { status: 201 },
  );
}
