import { NextResponse } from "next/server";

import { apiError } from "@/lib/server/api-response";
import {
  loadTimetableState,
  TimetableStateError,
} from "@/lib/server/timetable-state";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const leftId = url.searchParams.get("left");
  const rightId = url.searchParams.get("right");
  if (!leftId || !rightId) {
    return apiError({
      status: 400,
      code: "TIMETABLE_COMPARE_IDS_REQUIRED",
      message: "Zadejte identifikátory obou porovnávaných verzí.",
    });
  }

  try {
    const [left, right] = await Promise.all([
      loadTimetableState(leftId),
      loadTimetableState(rightId),
    ]);
    if (left.version.schoolYearId !== right.version.schoolYearId) {
      return apiError({
        status: 422,
        code: "TIMETABLE_COMPARE_SCHOOL_YEAR_MISMATCH",
        message: "Porovnávat lze pouze verze stejného školního roku.",
      });
    }

    const leftByBlock = new Map(
      left.lessons.map((lesson) => [lesson.block_id, lesson]),
    );
    const rightByBlock = new Map(
      right.lessons.map((lesson) => [lesson.block_id, lesson]),
    );
    const blockIds = [
      ...new Set([...leftByBlock.keys(), ...rightByBlock.keys()]),
    ].sort();
    const changes = blockIds.map((blockId) => {
      const before = leftByBlock.get(blockId);
      const after = rightByBlock.get(blockId);
      if (!before)
        return { blockId, change: "ADDED" as const, before: null, after };
      if (!after)
        return { blockId, change: "REMOVED" as const, before, after: null };
      const moved =
        before.day !== after.day ||
        before.period !== after.period ||
        before.room_id !== after.room_id ||
        before.duration !== after.duration;
      return {
        blockId,
        change: moved ? ("MOVED" as const) : ("UNCHANGED" as const),
        before,
        after,
      };
    });

    return NextResponse.json({
      left: {
        id: left.version.id,
        name: left.version.name,
        revision: left.version.revision,
      },
      right: {
        id: right.version.id,
        name: right.version.name,
        revision: right.version.revision,
      },
      summary: {
        added: changes.filter((item) => item.change === "ADDED").length,
        removed: changes.filter((item) => item.change === "REMOVED").length,
        moved: changes.filter((item) => item.change === "MOVED").length,
        unchanged: changes.filter((item) => item.change === "UNCHANGED").length,
      },
      changes,
    });
  } catch (error) {
    if (error instanceof TimetableStateError) {
      return apiError({
        status: error.status,
        code: error.code,
        message: error.message,
      });
    }
    throw error;
  }
}
