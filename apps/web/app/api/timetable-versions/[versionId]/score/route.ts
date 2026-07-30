import { Prisma, prisma } from "@timetable/database";
import { NextResponse } from "next/server";

import { scoreSchedule } from "@/lib/domain/scoring";
import { apiError } from "@/lib/server/api-response";
import {
  loadTimetableState,
  TimetableStateError,
} from "@/lib/server/timetable-state";

interface RouteContext {
  params: Promise<{ versionId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { versionId } = await context.params;
  try {
    const { version } = await loadTimetableState(versionId);
    return NextResponse.json({
      versionId,
      valid: version.qualityScore != null,
      total: version.qualityScore,
      scoringVersion: version.scoringVersion,
      categories: version.scoreBreakdown,
      incidents: version.incidentReport,
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

export async function POST(_request: Request, context: RouteContext) {
  const { versionId } = await context.params;
  try {
    const { snapshot, lessons } = await loadTimetableState(versionId);
    const score = scoreSchedule(snapshot, lessons);
    await prisma.timetableVersion.update({
      where: { id: versionId },
      data: {
        qualityScore: score.total,
        scoringVersion: "1.0.0",
        scoreBreakdown: score.categories as unknown as Prisma.InputJsonValue,
        incidentReport: score.valid
          ? (score.incidents as unknown as Prisma.InputJsonValue)
          : (score.hard_issues as unknown as Prisma.InputJsonValue),
      },
    });
    return NextResponse.json(score);
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
