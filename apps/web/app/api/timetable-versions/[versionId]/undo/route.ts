import { Prisma, prisma } from "@timetable/database";
import { NextResponse } from "next/server";
import { z } from "zod";

import { scoreSchedule } from "@/lib/domain/scoring";
import { validateMove } from "@/lib/domain/validation";
import { apiError, validationError } from "@/lib/server/api-response";
import {
  assertRevision,
  loadTimetableState,
  TimetableStateError,
} from "@/lib/server/timetable-state";

interface RouteContext {
  params: Promise<{ versionId: string }>;
}

const undoSchema = z.object({ expectedRevision: z.number().int().positive() });

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function POST(request: Request, context: RouteContext) {
  const { versionId } = await context.params;
  const parsed = undoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationError(
      "TIMETABLE_UNDO_INVALID",
      "Pro undo je nutná aktuální revision rozvrhu.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  try {
    const { version, snapshot, lessons } = await loadTimetableState(versionId);
    assertRevision(version.revision, parsed.data.expectedRevision);
    const recentEvents = await prisma.auditEvent.findMany({
      where: {
        schoolYearId: version.schoolYearId,
        action: { in: ["TIMETABLE_LESSON_MOVED", "TIMETABLE_MOVE_UNDONE", "TIMETABLE_LESSONS_LOCKED", "TIMETABLE_LESSONS_UNLOCKED"] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    const latest = recentEvents.find((event) => {
      const before = jsonRecord(event.before);
      const after = jsonRecord(event.after);
      return before?.versionId === versionId || after?.versionId === versionId || event.entityId === versionId;
    });
    if (!latest || latest.action !== "TIMETABLE_LESSON_MOVED") {
      return apiError({
        status: 409,
        code: "TIMETABLE_NOTHING_TO_UNDO",
        message: "Poslední změna této verze není ruční přesun, který lze vrátit.",
      });
    }

    const before = jsonRecord(latest.before);
    const after = jsonRecord(latest.after);
    if (!before || !after || after.revision !== version.revision) {
      return apiError({
        status: 409,
        code: "TIMETABLE_UNDO_CHAIN_BROKEN",
        message: "Od přesunu již vznikla další změna. Tento krok nelze bezpečně vrátit.",
      });
    }
    const day = Number(before.dayOfWeek);
    const period = Number(before.startPeriod);
    const roomId = typeof before.roomId === "string" ? before.roomId : null;
    if (!Number.isInteger(day) || !Number.isInteger(period)) {
      return apiError({
        status: 500,
        code: "TIMETABLE_UNDO_AUDIT_INVALID",
        message: "Audit posledního přesunu neobsahuje úplný původní stav.",
      });
    }

    const validation = validateMove(snapshot, lessons, {
      lesson_id: latest.entityId,
      target_day: day,
      target_period: period,
      target_room_id: roomId,
      expected_version: version.revision,
    });
    if (!validation.valid) {
      return apiError({
        status: 422,
        code: "TIMETABLE_UNDO_CONFLICT",
        message: "Původní umístění již není validní.",
        details: { issues: validation.issues },
      });
    }
    const score = scoreSchedule(snapshot, validation.preview);

    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.timetableVersion.updateMany({
        where: { id: versionId, revision: version.revision },
        data: {
          revision: { increment: 1 },
          qualityScore: score.total,
          scoringVersion: "1.0.0",
          scoreBreakdown: score.categories as unknown as Prisma.InputJsonValue,
          incidentReport: score.incidents as unknown as Prisma.InputJsonValue,
        },
      });
      if (claimed.count === 0) {
        throw new TimetableStateError(
          "TIMETABLE_VERSION_CONFLICT",
          "Rozvrh mezitím změnil jiný uživatel.",
          409,
        );
      }
      const lesson = await tx.timetableLesson.findFirst({
        where: { id: latest.entityId, versionId, isLocked: false },
      });
      if (!lesson) {
        throw new TimetableStateError(
          "LESSON_NOT_MOVABLE",
          "Hodina byla mezitím odstraněna nebo zamčena.",
          409,
        );
      }
      await tx.timetableLesson.update({
        where: { id: lesson.id },
        data: {
          dayOfWeek: day,
          startPeriod: period,
          roomId,
          origin: "MANUAL",
          manuallyChanged: true,
        },
      });
      const revision = version.revision + 1;
      await tx.auditEvent.create({
        data: {
          schoolYearId: version.schoolYearId,
          actorId: "system",
          action: "TIMETABLE_MOVE_UNDONE",
          entityType: "TimetableLesson",
          entityId: lesson.id,
          before: { ...after, revision: version.revision },
          after: { ...before, revision, undoneEventId: latest.id },
        },
      });
      return { revision };
    });

    return NextResponse.json({
      versionId,
      lessonId: latest.entityId,
      revision: result.revision,
      qualityScore: score.total,
      scoreLabel: score.label,
    });
  } catch (error) {
    if (error instanceof TimetableStateError) {
      return apiError({ status: error.status, code: error.code, message: error.message, details: error.details });
    }
    throw error;
  }
}
