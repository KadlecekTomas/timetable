import { prisma } from "@timetable/database";
import { NextResponse } from "next/server";

import type { CanonicalSnapshot } from "@/lib/domain/contracts";
import { toSolverRequest } from "@/lib/domain/snapshot";
import { apiError } from "@/lib/server/api-response";
import { authorizeWorker } from "@/lib/server/worker-auth";

const STALE_AFTER_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const auth = authorizeWorker(request);
  if (!auth.authorized) {
    return apiError({ status: auth.status, code: auth.code, message: auth.message });
  }

  await prisma.generationRun.updateMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: new Date(Date.now() - STALE_AFTER_MS) },
    },
    data: {
      status: "QUEUED",
      startedAt: null,
      explanation: {
        recovery: "Worker lease expired; job returned to queue.",
      },
    },
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await prisma.generationRun.findFirst({
      where: { status: "QUEUED" },
      orderBy: { createdAt: "asc" },
    });
    if (!candidate) return new Response(null, { status: 204 });

    const startedAt = new Date();
    const claimed = await prisma.generationRun.updateMany({
      where: { id: candidate.id, status: "QUEUED" },
      data: { status: "RUNNING", startedAt, finishedAt: null },
    });
    if (claimed.count === 0) continue;

    const snapshot = candidate.snapshot as unknown as CanonicalSnapshot;
    return NextResponse.json({
      generationRunId: candidate.id,
      inputSnapshotHash: candidate.inputSnapshotHash,
      startedAt,
      solverRequest: toSolverRequest(snapshot),
    });
  }

  return new Response(null, { status: 204 });
}
