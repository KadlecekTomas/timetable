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

const moveSchema = z.object({
  lessonId: z.string().min(1),
  targetDay: z.number().int().min(0).max(6),
  targetPeriod: z.number().int().min(0).max(15),
  targetRoomId: z.string().cuid().nullable(),
  expectedRevision: z.number().int().positive(),
});

export async function POST(request: Request, context: RouteContext) {
  const { versionId } = await context.params;
  const parsed = moveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationError(
      "TIMETABLE_MOVE_INVALID",
      "Přesun obsahuje neplatné hodnoty.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  try {
    const { version, snapshot, lessons } = await loadTimetableState(versionId);
    assertRevision(version.revision, parsed.data.expectedRevision);
    if (
      parsed.data.targetRoomId &&
      !snapshot.rooms.some((room) => room.id === parsed.data.targetRoomId)
    ) {
      return apiError({
        status: 422,
        code: "TARGET_ROOM_NOT_FOUND",
        message: "Cílová učebna nepatří do tohoto školního roku.",
      });
    }

    const target = lessons.find(
      (lesson) => (lesson.id ?? lesson.block_id) === parsed.data.lessonId,
    );
    const validation = validateMove(snapshot, lessons, {
      lesson_id: parsed.data.lessonId,
      target_day: parsed.data.targetDay,
      target_period: parsed.data.targetPeriod,
      target_room_id: parsed.data.targetRoomId,
      expected_version: parsed.data.expectedRevision,
    });
    if (!validation.valid || !target) {
      return apiError({
        status: 422,
        code: "TIMETABLE_MOVE_CONFLICT",
        message: "Přesun by vytvořil tvrdý konflikt.",
        details: { issues: validation.issues },
      });
    }

    const score = scoreSchedule(snapshot, validation.preview);
    const result = await prisma.$transaction(async (tx) => {
      const claimedVersion = await tx.timetableVersion.updateMany({
        where: { id: versionId, revision: parsed.data.expectedRevision },
        data: {
          revision: { increment: 1 },
          qualityScore: score.total,
          scoringVersion: "1.0.0",
          scoreBreakdown: score.categories as unknown as Prisma.InputJsonValue,
          incidentReport: score.incidents as unknown as Prisma.InputJsonValue,
        },
      });
      if (claimedVersion.count === 0) {
        throw new TimetableStateError(
          "TIMETABLE_VERSION_CONFLICT",
          "Rozvrh mezitím změnil jiný uživatel. Obnovte data.",
          409,
        );
      }

      const updatedLesson = await tx.timetableLesson.updateMany({
        where: { id: parsed.data.lessonId, versionId, isLocked: false },
        data: {
          dayOfWeek: parsed.data.targetDay,
          startPeriod: parsed.data.targetPeriod,
          roomId: parsed.data.targetRoomId,
          origin: "MANUAL",
          manuallyChanged: true,
        },
      });
      if (updatedLesson.count === 0) {
        throw new TimetableStateError(
          "LESSON_NOT_MOVABLE",
          "Hodina nebyla nalezena nebo je zamčená.",
          409,
        );
      }

      const revision = parsed.data.expectedRevision + 1;
      await tx.auditEvent.create({
        data: {
          schoolYearId: version.schoolYearId,
          actorId: "system",
          action: "TIMETABLE_LESSON_MOVED",
          entityType: "TimetableLesson",
          entityId: parsed.data.lessonId,
          before: {
            versionId,
            revision: parsed.data.expectedRevision,
            dayOfWeek: target.day,
            startPeriod: target.period,
            roomId: target.room_id,
          },
          after: {
            versionId,
            revision,
            dayOfWeek: parsed.data.targetDay,
            startPeriod: parsed.data.targetPeriod,
            roomId: parsed.data.targetRoomId,
          },
        },
      });
      return { revision };
    });

    return NextResponse.json({
      valid: true,
      versionId,
      revision: result.revision,
      qualityScore: score.total,
      scoreLabel: score.label,
      incidents: score.incidents,
    });
  } catch (error) {
    if (error instanceof TimetableStateError) {
      return apiError({ status: error.status, code: error.code, message: error.message, details: error.details });
    }
    throw error;
  }
}
