import { prisma } from "@timetable/database";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, validationError } from "@/lib/server/api-response";

interface RouteContext {
  params: Promise<{ versionId: string }>;
}

const acceptSchema = z.object({
  expectedRevision: z.number().int().positive(),
});

export async function POST(request: Request, context: RouteContext) {
  const { versionId } = await context.params;
  const parsed = acceptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationError(
      "TIMETABLE_ACCEPT_INVALID",
      "Pro přijetí je nutná aktuální revision rozvrhu.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  const version = await prisma.timetableVersion.findUnique({
    where: { id: versionId },
  });
  if (!version) {
    return apiError({
      status: 404,
      code: "TIMETABLE_VERSION_NOT_FOUND",
      message: "Verze rozvrhu nebyla nalezena.",
    });
  }
  if (version.revision !== parsed.data.expectedRevision) {
    return apiError({
      status: 409,
      code: "TIMETABLE_VERSION_CONFLICT",
      message: "Rozvrh mezitím změnil jiný uživatel. Obnovte data.",
      details: {
        expectedRevision: parsed.data.expectedRevision,
        actualRevision: version.revision,
      },
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.timetableVersion.updateMany({
      where: { schoolYearId: version.schoolYearId, isCurrent: true },
      data: { isCurrent: false },
    });
    const accepted = await tx.timetableVersion.updateMany({
      where: { id: versionId, revision: parsed.data.expectedRevision },
      data: { isCurrent: true },
    });
    if (accepted.count === 0)
      throw new Error("TIMETABLE_VERSION_STATE_CHANGED");
    await tx.auditEvent.create({
      data: {
        schoolYearId: version.schoolYearId,
        actorId: "system",
        action: "TIMETABLE_VERSION_ACCEPTED",
        entityType: "TimetableVersion",
        entityId: versionId,
        after: {
          versionNumber: version.versionNumber,
          revision: version.revision,
        },
      },
    });
  });

  return NextResponse.json({ versionId, isCurrent: true });
}
