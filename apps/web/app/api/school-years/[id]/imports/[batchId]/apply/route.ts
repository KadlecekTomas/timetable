import { NextResponse } from "next/server";

import { apiError } from "@/lib/server/api-response";
import { applyImportBatch, ImportApplyError } from "@/lib/server/import-apply";

interface RouteContext {
  params: Promise<{ id: string; batchId: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id: schoolYearId, batchId } = await context.params;
  try {
    const result = await applyImportBatch(schoolYearId, batchId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ImportApplyError) {
      return apiError({
        status: error.status,
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }
    throw error;
  }
}
