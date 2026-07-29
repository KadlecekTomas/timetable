import { prisma } from "@timetable/database";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, validationError } from "@/lib/server/api-response";
import {
  assertRevision,
  loadTimetableState,
  TimetableStateError,
} from "@/lib/server/timetable-state";

interface RouteContext {
  params: Promise<{ versionId: string }>;
}

const locksSchema = z.object({
  lessonIds: z.array(z.string().min(1)).min(1).max(1000),
  expectedRevision: z.number().int().positive(),
});

async function setLocked(
  request: Request,
  context: RouteContext,
  locked: boolean,
) {
  const { versionId } = await context.params;
  const parsed = locksSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationError(
      "TIMETABLE_LOCK_REQUEST_INVALID",
      "Požadavek na zamknutí obsahuje neplatné hodnoty.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  try {
    const { version, lessons } = await loadTimetableState(versionId);
    assertRevision(version.revision, parsed.data.expectedRevision);
    const selected = lessons.filter((lesson) =>
      parsed.data.lessonIds.includes(lesson.id ?? lesson.block_id),
    );
    if (selected.length !== new Set(parsed.data.lessonIds).size) {
      return apiError({
        status: 404,
        code: "TIMETABLE_LESSON_NOT_FOUND",
        message: "Některé vybrané hodiny nebyly v této verzi nalezeny.",
      });
    }
    if (!locked && selected.some((lesson) => lesson.origin === "FIXED_RULE")) {
      return apiError({
        status: 422,
        code: "FIXED_LESSON_CANNOT_BE_UNLOCKED",
        message: "Hodinu danou pevným pravidlem nelze odemknout v editoru.",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.timetableVersion.updateMany({
        where: { id: versionId, revision: parsed.data.expectedRevision },
        data: { revision: { increment: 1 } },
      });
      if (claimed.count === 0) {
        throw new TimetableStateError(
          "TIMETABLE_VERSION_CONFLICT",
          "Rozvrh mezitím změnil jiný uživatel. Obnovte data.",
          409,
        );
      }
      const updated = await tx.timetableLesson.updateMany({
        where: { versionId, id: { in: parsed.data.lessonIds } },
        data: { isLocked: locked },
      });
      await tx.auditEvent.create({
        data: {
          schoolYearId: version.schoolYearId,
          actorId: "system",
          action: locked ? "TIMETABLE_LESSONS_LOCKED" : "TIMETABLE_LESSONS_UNLOCKED",
          entityType: "TimetableVersion",
          entityId: versionId,
          before: { revision: parsed.data.expectedRevision },
          after: {
            revision: parsed.data.expectedRevision + 1,
            lessonIds: parsed.data.lessonIds,
            locked,
          },
        },
      });
      return { count: updated.count, revision: parsed.data.expectedRevision + 1 };
    });
    return NextResponse.json({ versionId, locked, ...result });
  } catch (error) {
    if (error instanceof TimetableStateError) {
      return apiError({ status: error.status, code: error.code, message: error.message, details: error.details });
    }
    throw error;
  }
}

export async function POST(request: Request, context: RouteContext) {
  return setLocked(request, context, true);
}

export async function DELETE(request: Request, context: RouteContext) {
  return setLocked(request, context, false);
}
