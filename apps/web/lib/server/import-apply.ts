import { prisma } from "@timetable/database";

import { DAY_CODES } from "@/lib/domain/contracts";
import type { ImportPayload } from "@/lib/import/contracts";

export class ImportApplyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function asImportPayload(value: unknown): ImportPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ImportApplyError(
      "IMPORT_PAYLOAD_MISSING",
      "Analyzovaný import neobsahuje použitelná data.",
      422,
    );
  }
  return value as ImportPayload;
}

export async function applyImportBatch(
  schoolYearId: string,
  batchId: string,
  actorId = "system",
) {
  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, schoolYearId },
    include: { issues: true },
  });
  if (!batch) {
    throw new ImportApplyError(
      "IMPORT_BATCH_NOT_FOUND",
      "Import nebyl nalezen.",
      404,
    );
  }
  if (batch.status === "APPLIED") {
    return {
      importBatchId: batch.id,
      status: batch.status,
      appliedAt: batch.appliedAt,
    };
  }
  if (
    batch.status !== "READY" ||
    batch.issues.some((item) => item.severity === "ERROR")
  ) {
    throw new ImportApplyError(
      "IMPORT_BATCH_NOT_READY",
      "Import obsahuje blokující chyby a nelze jej potvrdit.",
      422,
    );
  }

  const payload = asImportPayload(batch.payload);

  return prisma.$transaction(async (tx) => {
    const schoolYear = await tx.schoolYear.findUnique({
      where: { id: schoolYearId },
    });
    if (!schoolYear) {
      throw new ImportApplyError(
        "SCHOOL_YEAR_NOT_FOUND",
        "Školní rok nebyl nalezen.",
        404,
      );
    }
    if (schoolYear.version !== batch.expectedSchoolYearVersion) {
      throw new ImportApplyError(
        "SCHOOL_YEAR_VERSION_CONFLICT",
        "Data školního roku se od analýzy změnila. Import analyzujte znovu.",
        409,
        {
          expectedVersion: batch.expectedSchoolYearVersion,
          actualVersion: schoolYear.version,
        },
      );
    }
    if (payload.settings.school_year !== schoolYear.label) {
      throw new ImportApplyError(
        "SCHOOL_YEAR_LABEL_MISMATCH",
        `Soubor je určen pro školní rok ${payload.settings.school_year}, nikoli ${schoolYear.label}.`,
        422,
      );
    }

    const roomTypeCodes = new Set(
      [
        ...payload.rooms.flatMap((room) =>
          room.room_type ? [room.room_type] : [],
        ),
        ...payload.subjects.flatMap((subject) =>
          subject.default_room_type ? [subject.default_room_type] : [],
        ),
        ...payload.assignments.flatMap((assignment) =>
          assignment.required_room_type ? [assignment.required_room_type] : [],
        ),
      ].filter(Boolean),
    );
    for (const code of [...roomTypeCodes].sort()) {
      await tx.roomType.upsert({
        where: { schoolYearId_code: { schoolYearId, code } },
        create: { schoolYearId, code, name: code },
        update: { name: code },
      });
    }
    const roomTypes = new Map(
      (
        await tx.roomType.findMany({
          where: { schoolYearId, code: { in: [...roomTypeCodes] } },
        })
      ).map((item) => [item.code, item.id]),
    );

    const importedTeacherCodes = payload.teachers.map(
      (item) => item.teacher_code,
    );
    const importedClassCodes = payload.classes.map((item) => item.class_code);
    const importedRoomCodes = payload.rooms.map((item) => item.room_code);
    await tx.teacher.updateMany({
      where: { schoolYearId, code: { notIn: importedTeacherCodes } },
      data: { isActive: false },
    });
    await tx.schoolClass.updateMany({
      where: { schoolYearId, code: { notIn: importedClassCodes } },
      data: { isActive: false },
    });
    await tx.room.updateMany({
      where: { schoolYearId, code: { notIn: importedRoomCodes } },
      data: { isActive: false },
    });

    for (const teacher of payload.teachers) {
      await tx.teacher.upsert({
        where: {
          schoolYearId_code: { schoolYearId, code: teacher.teacher_code },
        },
        create: {
          schoolYearId,
          code: teacher.teacher_code,
          firstName: teacher.first_name,
          lastName: teacher.last_name,
          targetWeeklyLoad: teacher.target_weekly_load,
          minWeeklyLoad: teacher.min_weekly_load,
          maxWeeklyLoad: teacher.max_weekly_load,
          isActive: true,
        },
        update: {
          firstName: teacher.first_name,
          lastName: teacher.last_name,
          targetWeeklyLoad: teacher.target_weekly_load,
          minWeeklyLoad: teacher.min_weekly_load,
          maxWeeklyLoad: teacher.max_weekly_load,
          isActive: true,
        },
      });
    }
    for (const schoolClass of payload.classes) {
      await tx.schoolClass.upsert({
        where: {
          schoolYearId_code: { schoolYearId, code: schoolClass.class_code },
        },
        create: {
          schoolYearId,
          code: schoolClass.class_code,
          grade: schoolClass.grade,
          name: schoolClass.class_name,
          isActive: true,
        },
        update: {
          grade: schoolClass.grade,
          name: schoolClass.class_name,
          isActive: true,
        },
      });
    }
    for (const subject of payload.subjects) {
      await tx.subject.upsert({
        where: {
          schoolYearId_code: { schoolYearId, code: subject.subject_code },
        },
        create: {
          schoolYearId,
          code: subject.subject_code,
          name: subject.subject_name,
          defaultRoomTypeId: subject.default_room_type
            ? roomTypes.get(subject.default_room_type)
            : null,
        },
        update: {
          name: subject.subject_name,
          defaultRoomTypeId: subject.default_room_type
            ? roomTypes.get(subject.default_room_type)
            : null,
        },
      });
    }
    for (const room of payload.rooms) {
      await tx.room.upsert({
        where: { schoolYearId_code: { schoolYearId, code: room.room_code } },
        create: {
          schoolYearId,
          code: room.room_code,
          name: room.room_name,
          capacity: room.capacity,
          roomTypeId: room.room_type ? roomTypes.get(room.room_type) : null,
          isActive: true,
        },
        update: {
          name: room.room_name,
          capacity: room.capacity,
          roomTypeId: room.room_type ? roomTypes.get(room.room_type) : null,
          isActive: true,
        },
      });
    }

    const teachers = new Map(
      (await tx.teacher.findMany({ where: { schoolYearId } })).map((item) => [
        item.code,
        item.id,
      ]),
    );
    const classes = new Map(
      (await tx.schoolClass.findMany({ where: { schoolYearId } })).map(
        (item) => [item.code, item.id],
      ),
    );
    const subjects = new Map(
      (await tx.subject.findMany({ where: { schoolYearId } })).map((item) => [
        item.code,
        item.id,
      ]),
    );
    const rooms = new Map(
      (await tx.room.findMany({ where: { schoolYearId } })).map((item) => [
        item.code,
        item.id,
      ]),
    );

    for (const assignment of payload.assignments) {
      const teacherId = teachers.get(assignment.teacher_code);
      const classId = classes.get(assignment.class_code);
      const subjectId = subjects.get(assignment.subject_code);
      if (!teacherId || !classId || !subjectId) {
        throw new ImportApplyError(
          "IMPORT_REFERENCE_RESOLUTION_FAILED",
          `Výukovou vazbu ${assignment.assignment_code} nelze navázat na uložená data.`,
          422,
        );
      }
      await tx.teachingAssignment.upsert({
        where: {
          schoolYearId_assignmentCode: {
            schoolYearId,
            assignmentCode: assignment.assignment_code,
          },
        },
        create: {
          schoolYearId,
          assignmentCode: assignment.assignment_code,
          teacherId,
          classId,
          subjectId,
          group: assignment.group,
          weeklyPeriods: assignment.weekly_periods,
          lessonShape: assignment.lesson_shape,
          doublePeriodsCount: assignment.double_periods_count,
          requiredRoomId: assignment.required_room
            ? rooms.get(assignment.required_room)
            : null,
          requiredRoomTypeId: assignment.required_room_type
            ? roomTypes.get(assignment.required_room_type)
            : null,
        },
        update: {
          teacherId,
          classId,
          subjectId,
          group: assignment.group,
          weeklyPeriods: assignment.weekly_periods,
          lessonShape: assignment.lesson_shape,
          doublePeriodsCount: assignment.double_periods_count,
          requiredRoomId: assignment.required_room
            ? rooms.get(assignment.required_room)
            : null,
          requiredRoomTypeId: assignment.required_room_type
            ? roomTypes.get(assignment.required_room_type)
            : null,
        },
      });
    }

    const assignments = new Map(
      (await tx.teachingAssignment.findMany({ where: { schoolYearId } })).map(
        (item) => [item.assignmentCode, item.id],
      ),
    );
    const importedAssignmentIds = payload.assignments
      .map((item) => assignments.get(item.assignment_code))
      .filter((item): item is string => Boolean(item));

    await tx.availabilityRule.deleteMany({ where: { schoolYearId } });
    if (payload.availability.length > 0) {
      await tx.availabilityRule.createMany({
        data: payload.availability.map((rule) => {
          const entityId =
            rule.entity_type === "TEACHER"
              ? teachers.get(rule.entity_code)
              : rule.entity_type === "CLASS"
                ? classes.get(rule.entity_code)
                : rooms.get(rule.entity_code);
          if (!entityId) {
            throw new ImportApplyError(
              "IMPORT_REFERENCE_RESOLUTION_FAILED",
              `Pravidlo dostupnosti odkazuje na neznámou entitu ${rule.entity_code}.`,
              422,
            );
          }
          return {
            schoolYearId,
            entityType: rule.entity_type,
            entityId,
            dayOfWeek: DAY_CODES.indexOf(rule.day),
            period: rule.period - 1,
            kind: rule.kind,
            weight: rule.weight,
            reason: rule.reason,
          };
        }),
      });
    }

    await tx.fixedLessonRule.deleteMany({
      where: { teachingAssignmentId: { in: importedAssignmentIds } },
    });
    await tx.distributionRule.deleteMany({
      where: { teachingAssignmentId: { in: importedAssignmentIds } },
    });

    const distributionData = payload.assignments.flatMap((assignment) => {
      const teachingAssignmentId = assignments.get(assignment.assignment_code);
      if (!teachingAssignmentId) return [];
      return [
        ...(assignment.max_per_day != null
          ? [
              {
                teachingAssignmentId,
                type: "MAX_PER_DAY" as const,
                value: assignment.max_per_day,
                hard: true,
              },
            ]
          : []),
        ...(assignment.min_day_gap != null
          ? [
              {
                teachingAssignmentId,
                type: "MIN_DAY_GAP" as const,
                value: assignment.min_day_gap,
                hard: false,
              },
            ]
          : []),
      ];
    });
    if (distributionData.length > 0) {
      await tx.distributionRule.createMany({ data: distributionData });
    }

    if (payload.fixedLessons.length > 0) {
      await tx.fixedLessonRule.createMany({
        data: payload.fixedLessons.map((fixedLesson) => {
          const teachingAssignmentId = assignments.get(
            fixedLesson.assignment_code,
          );
          if (!teachingAssignmentId) {
            throw new ImportApplyError(
              "IMPORT_REFERENCE_RESOLUTION_FAILED",
              `Pevná hodina odkazuje na neznámou vazbu ${fixedLesson.assignment_code}.`,
              422,
            );
          }
          return {
            teachingAssignmentId,
            blockIndex: fixedLesson.block_index,
            dayOfWeek: DAY_CODES.indexOf(fixedLesson.day),
            startPeriod: fixedLesson.start_period - 1,
            duration: fixedLesson.duration,
            roomId: fixedLesson.room_code
              ? rooms.get(fixedLesson.room_code)
              : null,
            locked: fixedLesson.locked,
          };
        }),
      });
    }

    const updatedSchoolYear = await tx.schoolYear.update({
      where: { id: schoolYearId },
      data: {
        periodsPerDay: [
          payload.settings.monday_periods,
          payload.settings.tuesday_periods,
          payload.settings.wednesday_periods,
          payload.settings.thursday_periods,
          payload.settings.friday_periods,
        ],
        version: { increment: 1 },
      },
    });
    const appliedAt = new Date();
    await tx.importBatch.update({
      where: { id: batchId },
      data: { status: "APPLIED", appliedAt },
    });
    await tx.auditEvent.create({
      data: {
        schoolYearId,
        actorId,
        action: "IMPORT_APPLIED",
        entityType: "ImportBatch",
        entityId: batchId,
        after: {
          summary: batch.summary,
          previousVersion: schoolYear.version,
          newVersion: updatedSchoolYear.version,
        },
      },
    });

    return {
      importBatchId: batchId,
      status: "APPLIED" as const,
      appliedAt,
      schoolYearVersion: updatedSchoolYear.version,
      summary: batch.summary,
    };
  });
}
