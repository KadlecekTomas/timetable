import { prisma } from "@timetable/database";
import { NextResponse } from "next/server";

import { apiError } from "@/lib/server/api-response";

interface RouteContext {
  params: Promise<{ id: string; batchId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id: schoolYearId, batchId } = await context.params;
  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, schoolYearId },
    include: { issues: { orderBy: [{ severity: "asc" }, { sheet: "asc" }, { row: "asc" }] } },
  });
  if (!batch) {
    return apiError({ status: 404, code: "IMPORT_BATCH_NOT_FOUND", message: "Import nebyl nalezen." });
  }
  return NextResponse.json({
    importBatchId: batch.id,
    fileName: batch.fileName,
    status: batch.status,
    templateVersion: batch.templateVersion,
    expectedSchoolYearVersion: batch.expectedSchoolYearVersion,
    summary: batch.summary,
    issues: batch.issues,
    createdAt: batch.createdAt,
    appliedAt: batch.appliedAt,
  });
}
