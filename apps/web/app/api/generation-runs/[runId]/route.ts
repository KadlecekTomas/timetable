import { prisma } from "@timetable/database";
import { NextResponse } from "next/server";

import { apiError } from "@/lib/server/api-response";

interface RouteContext {
  params: Promise<{ runId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { runId } = await context.params;
  const run = await prisma.generationRun.findUnique({
    where: { id: runId },
    include: { candidateVersion: true },
  });
  if (!run) {
    return apiError({ status: 404, code: "GENERATION_RUN_NOT_FOUND", message: "Běh generování nebyl nalezen." });
  }
  return NextResponse.json({
    id: run.id,
    schoolYearId: run.schoolYearId,
    status: run.status,
    inputSnapshotHash: run.inputSnapshotHash,
    objectiveValue: run.objectiveValue,
    qualityScore: run.qualityScore,
    solverStats: run.solverStats,
    explanation: run.explanation,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    createdAt: run.createdAt,
    candidateVersion: run.candidateVersion,
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { runId } = await context.params;
  const updated = await prisma.generationRun.updateMany({
    where: { id: runId, status: { in: ["QUEUED", "RUNNING"] } },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });
  if (updated.count === 0) {
    const exists = await prisma.generationRun.findUnique({ where: { id: runId } });
    if (!exists) {
      return apiError({ status: 404, code: "GENERATION_RUN_NOT_FOUND", message: "Běh generování nebyl nalezen." });
    }
    return apiError({
      status: 409,
      code: "GENERATION_RUN_NOT_CANCELLABLE",
      message: `Běh ve stavu ${exists.status} již nelze zrušit.`,
    });
  }
  return NextResponse.json({ generationRunId: runId, status: "CANCELLED" });
}
