import { Prisma, prisma } from "@timetable/database";
import { NextResponse } from "next/server";
import { z } from "zod";

import type { CanonicalSnapshot } from "@/lib/domain/contracts";
import { scoreSchedule } from "@/lib/domain/scoring";
import { createSnapshotHash } from "@/lib/domain/snapshot";
import { validateSchedule } from "@/lib/domain/validation";
import { apiError, validationError } from "@/lib/server/api-response";
import { authorizeWorker } from "@/lib/server/worker-auth";

interface RouteContext {
  params: Promise<{ runId: string }>;
}

const scheduledLessonSchema = z.object({
  block_id: z.string().min(1),
  assignment_id: z.string().min(1),
  teacher_id: z.string().min(1),
  class_id: z.string().min(1),
  subject_id: z.string().min(1),
  group: z.enum(["WHOLE", "GROUP_1", "GROUP_2"]),
  room_id: z.string().nullable(),
  day: z.number().int().min(0).max(6),
  period: z.number().int().min(0).max(15),
  duration: z.number().int().min(1).max(2),
  locked: z.boolean(),
  origin: z.enum(["SOLVER", "MANUAL", "FIXED_RULE"]),
});

const completionSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("SOLVED"),
    result: z.object({
      status: z.enum(["FEASIBLE", "OPTIMAL"]),
      objective_value: z.number(),
      lessons: z.array(scheduledLessonSchema),
      diagnostics: z.array(z.record(z.string(), z.unknown())).default([]),
      solver_stats: z.record(z.string(), z.unknown()).default({}),
    }),
  }),
  z.object({
    outcome: z.literal("INFEASIBLE"),
    error: z.record(z.string(), z.unknown()),
  }),
  z.object({
    outcome: z.literal("FAILED"),
    error: z.record(z.string(), z.unknown()),
  }),
]);

export async function POST(request: Request, context: RouteContext) {
  const auth = authorizeWorker(request);
  if (!auth.authorized) {
    return apiError({
      status: auth.status,
      code: auth.code,
      message: auth.message,
    });
  }
  const { runId } = await context.params;
  const parsed = completionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return validationError(
      "WORKER_COMPLETION_INVALID",
      "Worker vrátil neplatný completion payload.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  const run = await prisma.generationRun.findUnique({ where: { id: runId } });
  if (!run) {
    return apiError({
      status: 404,
      code: "GENERATION_RUN_NOT_FOUND",
      message: "Běh generování nebyl nalezen.",
    });
  }
  if (run.status !== "RUNNING") {
    return apiError({
      status: 409,
      code: "GENERATION_RUN_NOT_RUNNING",
      message: `Výsledek nelze přijmout pro běh ve stavu ${run.status}.`,
    });
  }

  if (parsed.data.outcome !== "SOLVED") {
    const status =
      parsed.data.outcome === "INFEASIBLE" ? "INFEASIBLE" : "FAILED";
    await prisma.generationRun.updateMany({
      where: { id: runId, status: "RUNNING" },
      data: {
        status,
        explanation: parsed.data.error as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
    return NextResponse.json({ generationRunId: runId, status });
  }

  const solvedResult = parsed.data.result;

  const snapshot = run.snapshot as unknown as CanonicalSnapshot;
  if (createSnapshotHash(snapshot) !== run.inputSnapshotHash) {
    await prisma.generationRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        explanation: { code: "SNAPSHOT_HASH_MISMATCH" },
        finishedAt: new Date(),
      },
    });
    return apiError({
      status: 500,
      code: "SNAPSHOT_HASH_MISMATCH",
      message: "Uložený snapshot neodpovídá svému kontrolnímu součtu.",
    });
  }

  const lessons = solvedResult.lessons.map((lesson) => ({
    ...lesson,
    manually_changed: false,
  }));
  const hardIssues = validateSchedule(snapshot, lessons);
  if (hardIssues.length > 0) {
    await prisma.generationRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        explanation: {
          code: "POST_SOLVE_VALIDATION_FAILED",
          issues: hardIssues,
        } as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
    return apiError({
      status: 422,
      code: "POST_SOLVE_VALIDATION_FAILED",
      message: "Výsledek solveru porušuje tvrdé omezení a nebyl uložen.",
      details: { issues: hardIssues },
    });
  }

  const score = scoreSchedule(snapshot, lessons);
  const completed = await prisma.$transaction(async (tx) => {
    const current = await tx.generationRun.findUnique({ where: { id: runId } });
    if (!current || current.status !== "RUNNING") {
      throw new Error("GENERATION_RUN_STATE_CHANGED");
    }
    const latest = await tx.timetableVersion.aggregate({
      where: { schoolYearId: run.schoolYearId },
      _max: { versionNumber: true },
    });
    const versionNumber = (latest._max.versionNumber ?? 0) + 1;
    const candidate = await tx.timetableVersion.create({
      data: {
        schoolYearId: run.schoolYearId,
        generationRunId: run.id,
        name: `Návrh ${versionNumber}`,
        versionNumber,
        source: "GENERATED",
        isCurrent: false,
        qualityScore: score.total,
        scoringVersion: "1.0.0",
        scoreBreakdown: score.categories as unknown as Prisma.InputJsonValue,
        incidentReport: score.incidents as unknown as Prisma.InputJsonValue,
        lessons: {
          create: lessons.map((lesson) => ({
            blockId: lesson.block_id,
            teachingAssignmentId: lesson.assignment_id,
            roomId: lesson.room_id,
            dayOfWeek: lesson.day,
            startPeriod: lesson.period,
            duration: lesson.duration,
            isLocked: lesson.locked,
            origin: lesson.origin,
            manuallyChanged: false,
          })),
        },
      },
    });
    const finishedAt = new Date();
    await tx.generationRun.update({
      where: { id: runId },
      data: {
        status: solvedResult.status,
        objectiveValue: solvedResult.objective_value,
        qualityScore: score.total,
        solverStats: solvedResult.solver_stats as Prisma.InputJsonValue,
        explanation: {
          diagnostics: solvedResult.diagnostics,
          scoreLabel: score.label,
          incidents: score.incidents,
        } as unknown as Prisma.InputJsonValue,
        finishedAt,
      },
    });
    return { candidate, finishedAt };
  });

  return NextResponse.json({
    generationRunId: runId,
    status: solvedResult.status,
    timetableVersionId: completed.candidate.id,
    qualityScore: score.total,
    scoreLabel: score.label,
    finishedAt: completed.finishedAt,
  });
}
