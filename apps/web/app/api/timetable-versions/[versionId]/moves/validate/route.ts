import { NextResponse } from "next/server";
import { z } from "zod";

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
        details: { targetRoomId: parsed.data.targetRoomId },
      });
    }
    const result = validateMove(snapshot, lessons, {
      lesson_id: parsed.data.lessonId,
      target_day: parsed.data.targetDay,
      target_period: parsed.data.targetPeriod,
      target_room_id: parsed.data.targetRoomId,
      expected_version: parsed.data.expectedRevision,
    });
    return NextResponse.json({ valid: result.valid, issues: result.issues });
  } catch (error) {
    if (error instanceof TimetableStateError) {
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
