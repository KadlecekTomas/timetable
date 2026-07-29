import { prisma } from "@timetable/database";

import type { CanonicalSnapshot, ScheduledLesson } from "@/lib/domain/contracts";
import { loadCanonicalSnapshot } from "@/lib/server/snapshot-builder";

export class TimetableStateError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function loadTimetableState(versionId: string): Promise<{
  version: Awaited<ReturnType<typeof prisma.timetableVersion.findUniqueOrThrow>>;
  snapshot: CanonicalSnapshot;
  lessons: ScheduledLesson[];
}> {
  const version = await prisma.timetableVersion.findUnique({
    where: { id: versionId },
    include: {
      generationRun: true,
      lessons: {
        include: {
          teachingAssignment: {
            include: {
              teacher: true,
              schoolClass: true,
              subject: true,
            },
          },
          room: true,
        },
        orderBy: [{ dayOfWeek: "asc" }, { startPeriod: "asc" }, { blockId: "asc" }],
      },
    },
  });
  if (!version) {
    throw new TimetableStateError(
      "TIMETABLE_VERSION_NOT_FOUND",
      "Verze rozvrhu nebyla nalezena.",
      404,
    );
  }

  const snapshot = version.generationRun
    ? (version.generationRun.snapshot as unknown as CanonicalSnapshot)
    : await loadCanonicalSnapshot(version.schoolYearId);
  const lessons: ScheduledLesson[] = version.lessons.map((lesson) => ({
    id: lesson.id,
    block_id: lesson.blockId,
    assignment_id: lesson.teachingAssignmentId,
    teacher_id: lesson.teachingAssignment.teacherId,
    class_id: lesson.teachingAssignment.classId,
    subject_id: lesson.teachingAssignment.subjectId,
    group: lesson.teachingAssignment.group,
    room_id: lesson.roomId,
    day: lesson.dayOfWeek,
    period: lesson.startPeriod,
    duration: lesson.duration,
    locked: lesson.isLocked,
    origin: lesson.origin,
    manually_changed: lesson.manuallyChanged,
  }));
  return { version, snapshot, lessons };
}

export function assertRevision(actual: number, expected: number) {
  if (actual !== expected) {
    throw new TimetableStateError(
      "TIMETABLE_VERSION_CONFLICT",
      "Rozvrh mezitím změnil jiný uživatel. Obnovte data.",
      409,
      { expectedRevision: expected, actualRevision: actual },
    );
  }
}
