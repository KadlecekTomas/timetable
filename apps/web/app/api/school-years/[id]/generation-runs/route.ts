import { Prisma, prisma } from "@timetable/database";
import { NextResponse } from "next/server";
import { z } from "zod";

import { evaluateReadiness } from "@/lib/domain/readiness";
import { createSnapshotHash } from "@/lib/domain/snapshot";
import { apiError, validationError } from "@/lib/server/api-response";
import { loadCanonicalSnapshot } from "@/lib/server/snapshot-builder";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const createSchema = z.object({
  solverProfileId: z.string().cuid().nullable().optional(),
  baseTimetableVersionId: z.string().cuid().nullable().optional(),
  timeLimitSeconds: z.number().int().min(1).max(300).optional(),
});

export async function GET(_request: Request, context: RouteContext) {
  const { id: schoolYearId } = await context.params;
  const items = await prisma.generationRun.findMany({
    where: { schoolYearId },
    include: {
      candidateVersion: {
        select: { id: true, name: true, qualityScore: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ items });
}

export async function POST(request: Request, context: RouteContext) {
  const { id: schoolYearId } = await context.params;
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return validationError(
      "GENERATION_REQUEST_INVALID",
      "Nastavení generování obsahuje neplatné hodnoty.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  try {
    const snapshot = await loadCanonicalSnapshot(schoolYearId, parsed.data);
    const readiness = evaluateReadiness(snapshot);
    if (!readiness.ready) {
      return apiError({
        status: 422,
        code: "SCHOOL_YEAR_NOT_READY",
        message: "Generování nelze spustit, dokud existují blokující chyby.",
        details: { readiness },
      });
    }
    const inputSnapshotHash = createSnapshotHash(snapshot);
    const generationRun = await prisma.generationRun.create({
      data: {
        schoolYearId,
        solverProfileId: parsed.data.solverProfileId,
        inputSnapshotHash,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        status: "QUEUED",
      },
    });
    return NextResponse.json(
      {
        generationRunId: generationRun.id,
        status: generationRun.status,
        inputSnapshotHash,
        createdAt: generationRun.createdAt,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "SCHOOL_YEAR_NOT_FOUND") {
      return apiError({
        status: 404,
        code: "SCHOOL_YEAR_NOT_FOUND",
        message: "Školní rok nebyl nalezen.",
      });
    }
    throw error;
  }
}
