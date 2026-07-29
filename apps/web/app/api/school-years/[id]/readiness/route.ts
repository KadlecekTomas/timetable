import { NextResponse } from "next/server";

import { evaluateReadiness } from "@/lib/domain/readiness";
import { apiError } from "@/lib/server/api-response";
import { loadCanonicalSnapshot } from "@/lib/server/snapshot-builder";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const snapshot = await loadCanonicalSnapshot(id);
    return NextResponse.json(evaluateReadiness(snapshot));
  } catch (error) {
    if (error instanceof Error && error.message === "SCHOOL_YEAR_NOT_FOUND") {
      return apiError({ status: 404, code: "SCHOOL_YEAR_NOT_FOUND", message: "Školní rok nebyl nalezen." });
    }
    throw error;
  }
}
