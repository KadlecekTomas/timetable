import { NextResponse } from "next/server";

import { apiError } from "@/lib/server/api-response";
import { loadTimetableState, TimetableStateError } from "@/lib/server/timetable-state";

interface RouteContext {
  params: Promise<{ versionId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { versionId } = await context.params;
  const url = new URL(request.url);
  const view = url.searchParams.get("view") === "teacher" ? "teacher" : "class";
  const entityId = url.searchParams.get("entityId");

  try {
    const { version, snapshot, lessons } = await loadTimetableState(versionId);
    const teachers = new Map(
      snapshot.teachers.map((item) => [
        item.id,
        { code: item.code, name: `${item.first_name} ${item.last_name}`.trim() },
      ]),
    );
    const classes = new Map(
      snapshot.classes.map((item) => [item.id, { code: item.code, name: item.name }]),
    );
    const subjects = new Map(
      snapshot.subjects.map((item) => [
        item.id,
        { code: item.code, name: item.name, colorToken: item.color_token },
      ]),
    );
    const rooms = new Map(
      snapshot.rooms.map((item) => [
        item.id,
        { code: item.code ?? item.id, name: item.name ?? item.code ?? item.id },
      ]),
    );
    const filtered = entityId
      ? lessons.filter((lesson) =>
          view === "teacher" ? lesson.teacher_id === entityId : lesson.class_id === entityId,
        )
      : lessons;

    return NextResponse.json({
      version: {
        id: version.id,
        name: version.name,
        versionNumber: version.versionNumber,
        revision: version.revision,
        isCurrent: version.isCurrent,
        qualityScore: version.qualityScore,
        scoringVersion: version.scoringVersion,
        scoreBreakdown: version.scoreBreakdown,
        incidentReport: version.incidentReport,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
      },
      view,
      periodsPerDay: snapshot.periods_per_day,
      entities:
        view === "teacher"
          ? snapshot.teachers.map((item) => ({
              id: item.id,
              code: item.code,
              name: `${item.first_name} ${item.last_name}`.trim(),
            }))
          : snapshot.classes.map((item) => ({ id: item.id, code: item.code, name: item.name })),
      lessons: filtered.map((lesson) => ({
        ...lesson,
        teacher: teachers.get(lesson.teacher_id),
        schoolClass: classes.get(lesson.class_id),
        subject: subjects.get(lesson.subject_id),
        room: lesson.room_id ? rooms.get(lesson.room_id) : null,
      })),
    });
  } catch (error) {
    if (error instanceof TimetableStateError) {
      return apiError({ status: error.status, code: error.code, message: error.message, details: error.details });
    }
    throw error;
  }
}
