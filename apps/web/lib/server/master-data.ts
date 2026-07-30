import { Prisma, prisma } from "@timetable/database";
import { z } from "zod";

export const MASTER_RESOURCES = [
  "teachers",
  "classes",
  "subjects",
  "room-types",
  "rooms",
  "assignments",
  "availability",
] as const;

export type MasterResource = (typeof MASTER_RESOURCES)[number];

export class MasterDataError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string[]> = {},
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const optimisticSchema = z.object({
  expectedSchoolYearVersion: z.number().int().positive(),
});
const teacherSchema = optimisticSchema.extend({
  code: z.string().trim().min(1).max(24),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  targetWeeklyLoad: z.number().int().min(0).max(60),
  minWeeklyLoad: z.number().int().min(0).max(60).nullable().optional(),
  maxWeeklyLoad: z.number().int().min(0).max(60).nullable().optional(),
  isActive: z.boolean().optional(),
});
const classSchema = optimisticSchema.extend({
  code: z.string().trim().min(1).max(24),
  grade: z.number().int().min(1).max(13),
  name: z.string().trim().min(1).max(80),
  isActive: z.boolean().optional(),
});
const roomTypeSchema = optimisticSchema.extend({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(100),
});
const subjectSchema = optimisticSchema.extend({
  code: z.string().trim().min(1).max(24),
  name: z.string().trim().min(1).max(100),
  defaultRoomTypeId: z.string().cuid().nullable().optional(),
  colorToken: z.string().trim().max(32).nullable().optional(),
});
const roomSchema = optimisticSchema.extend({
  code: z.string().trim().min(1).max(24),
  name: z.string().trim().min(1).max(100),
  capacity: z.number().int().min(1).max(1000).nullable().optional(),
  roomTypeId: z.string().cuid().nullable().optional(),
  isActive: z.boolean().optional(),
});
const fixedLessonSchema = z.object({
  blockIndex: z.number().int().min(0),
  dayOfWeek: z.number().int().min(0).max(6),
  startPeriod: z.number().int().min(0).max(15),
  duration: z.number().int().min(1).max(2),
  roomId: z.string().cuid().nullable().optional(),
  locked: z.boolean().optional(),
});
const assignmentSchema = optimisticSchema
  .extend({
    assignmentCode: z.string().trim().min(1).max(80),
    teacherId: z.string().cuid(),
    classId: z.string().cuid(),
    subjectId: z.string().cuid(),
    group: z.enum(["WHOLE", "GROUP_1", "GROUP_2"]),
    weeklyPeriods: z.number().int().min(1).max(40),
    lessonShape: z.enum(["SINGLE", "DOUBLE", "MIXED"]),
    doublePeriodsCount: z.number().int().min(0).max(20),
    requiredRoomId: z.string().cuid().nullable().optional(),
    requiredRoomTypeId: z.string().cuid().nullable().optional(),
    priority: z.number().int().min(0).max(100).optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    maxPerDay: z.number().int().min(1).max(16).nullable().optional(),
    minDayGap: z.number().int().min(0).max(6).nullable().optional(),
    fixedLessons: z.array(fixedLessonSchema).optional(),
  })
  .refine((value) => value.doublePeriodsCount * 2 <= value.weeklyPeriods, {
    path: ["doublePeriodsCount"],
    message: "Počet dvojhodin překračuje týdenní dotaci.",
  })
  .refine(
    (value) => value.lessonShape !== "DOUBLE" || value.weeklyPeriods % 2 === 0,
    {
      path: ["weeklyPeriods"],
      message: "Vazba typu DOUBLE musí mít sudý počet hodin.",
    },
  );
const availabilitySchema = optimisticSchema.extend({
  entityType: z.enum(["TEACHER", "CLASS", "ROOM"]),
  entityId: z.string().cuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  period: z.number().int().min(0).max(15),
  kind: z.enum(["UNAVAILABLE", "PREFERRED", "DISCOURAGED"]),
  weight: z.number().int().min(1).max(100).nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});

const createSchemas = {
  teachers: teacherSchema,
  classes: classSchema,
  subjects: subjectSchema,
  "room-types": roomTypeSchema,
  rooms: roomSchema,
  assignments: assignmentSchema,
  availability: availabilitySchema,
} satisfies Record<MasterResource, z.ZodType>;

function validationFailure(error: z.ZodError): never {
  throw new MasterDataError(
    "MASTER_DATA_INVALID",
    "Zadaná data obsahují neplatné hodnoty.",
    422,
    error.flatten().fieldErrors as Record<string, string[]>,
  );
}

async function ensureScopedReference(
  tx: Prisma.TransactionClient,
  schoolYearId: string,
  type: "teacher" | "class" | "subject" | "room" | "roomType",
  id: string | null | undefined,
  field: string,
) {
  if (!id) return;
  const record =
    type === "teacher"
      ? await tx.teacher.findFirst({
          where: { id, schoolYearId },
          select: { id: true },
        })
      : type === "class"
        ? await tx.schoolClass.findFirst({
            where: { id, schoolYearId },
            select: { id: true },
          })
        : type === "subject"
          ? await tx.subject.findFirst({
              where: { id, schoolYearId },
              select: { id: true },
            })
          : type === "room"
            ? await tx.room.findFirst({
                where: { id, schoolYearId },
                select: { id: true },
              })
            : await tx.roomType.findFirst({
                where: { id, schoolYearId },
                select: { id: true },
              });
  if (!record) {
    throw new MasterDataError(
      "MASTER_DATA_REFERENCE_INVALID",
      "Odkazovaná entita nepatří do aktuálního školního roku.",
      422,
      { [field]: ["Vyberte existující položku aktuálního školního roku."] },
    );
  }
}

async function withSchoolYearVersion<T>(
  schoolYearId: string,
  expectedVersion: number,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<{ item: T; schoolYearVersion: number }> {
  return prisma.$transaction(async (tx) => {
    const schoolYear = await tx.schoolYear.findUnique({
      where: { id: schoolYearId },
      select: { version: true },
    });
    if (!schoolYear) {
      throw new MasterDataError(
        "SCHOOL_YEAR_NOT_FOUND",
        "Školní rok nebyl nalezen.",
        404,
      );
    }
    if (schoolYear.version !== expectedVersion) {
      throw new MasterDataError(
        "SCHOOL_YEAR_VERSION_CONFLICT",
        "Data mezitím změnil jiný uživatel. Obnovte stránku.",
        409,
        {},
        { expectedVersion, actualVersion: schoolYear.version },
      );
    }
    const item = await operation(tx);
    const updated = await tx.schoolYear.update({
      where: { id: schoolYearId },
      data: { version: { increment: 1 } },
      select: { version: true },
    });
    return { item, schoolYearVersion: updated.version };
  });
}

export function isMasterResource(value: string): value is MasterResource {
  return MASTER_RESOURCES.includes(value as MasterResource);
}

export async function listMasterData(
  schoolYearId: string,
  resource: MasterResource,
) {
  switch (resource) {
    case "teachers":
      return prisma.teacher.findMany({
        where: { schoolYearId },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });
    case "classes":
      return prisma.schoolClass.findMany({
        where: { schoolYearId },
        orderBy: [{ grade: "asc" }, { code: "asc" }],
      });
    case "subjects":
      return prisma.subject.findMany({
        where: { schoolYearId },
        include: { defaultRoomType: true },
        orderBy: { code: "asc" },
      });
    case "room-types":
      return prisma.roomType.findMany({
        where: { schoolYearId },
        orderBy: { code: "asc" },
      });
    case "rooms":
      return prisma.room.findMany({
        where: { schoolYearId },
        include: { roomType: true },
        orderBy: { code: "asc" },
      });
    case "assignments":
      return prisma.teachingAssignment.findMany({
        where: { schoolYearId },
        include: {
          teacher: true,
          schoolClass: true,
          subject: true,
          requiredRoom: true,
          requiredRoomType: true,
          fixedLessons: true,
          distributionRules: true,
        },
        orderBy: { assignmentCode: "asc" },
      });
    case "availability":
      return prisma.availabilityRule.findMany({
        where: { schoolYearId },
        orderBy: [
          { entityType: "asc" },
          { entityId: "asc" },
          { dayOfWeek: "asc" },
          { period: "asc" },
        ],
      });
  }
}

export async function createMasterData(
  schoolYearId: string,
  resource: MasterResource,
  body: unknown,
) {
  const parsed = createSchemas[resource].safeParse(body);
  if (!parsed.success) validationFailure(parsed.error);
  const input = parsed.data as Record<string, unknown> & {
    expectedSchoolYearVersion: number;
  };

  return withSchoolYearVersion(
    schoolYearId,
    input.expectedSchoolYearVersion,
    async (tx) => {
      switch (resource) {
        case "teachers": {
          const data = teacherSchema.parse(body);
          return tx.teacher.create({
            data: {
              schoolYearId,
              code: data.code,
              firstName: data.firstName,
              lastName: data.lastName,
              targetWeeklyLoad: data.targetWeeklyLoad,
              minWeeklyLoad: data.minWeeklyLoad,
              maxWeeklyLoad: data.maxWeeklyLoad,
              isActive: data.isActive ?? true,
            },
          });
        }
        case "classes": {
          const data = classSchema.parse(body);
          return tx.schoolClass.create({
            data: {
              schoolYearId,
              code: data.code,
              grade: data.grade,
              name: data.name,
              isActive: data.isActive ?? true,
            },
          });
        }
        case "room-types": {
          const data = roomTypeSchema.parse(body);
          return tx.roomType.create({
            data: { schoolYearId, code: data.code, name: data.name },
          });
        }
        case "subjects": {
          const data = subjectSchema.parse(body);
          await ensureScopedReference(
            tx,
            schoolYearId,
            "roomType",
            data.defaultRoomTypeId,
            "defaultRoomTypeId",
          );
          return tx.subject.create({
            data: {
              schoolYearId,
              code: data.code,
              name: data.name,
              defaultRoomTypeId: data.defaultRoomTypeId,
              colorToken: data.colorToken,
            },
          });
        }
        case "rooms": {
          const data = roomSchema.parse(body);
          await ensureScopedReference(
            tx,
            schoolYearId,
            "roomType",
            data.roomTypeId,
            "roomTypeId",
          );
          return tx.room.create({
            data: {
              schoolYearId,
              code: data.code,
              name: data.name,
              capacity: data.capacity,
              roomTypeId: data.roomTypeId,
              isActive: data.isActive ?? true,
            },
          });
        }
        case "availability": {
          const data = availabilitySchema.parse(body);
          await ensureScopedReference(
            tx,
            schoolYearId,
            data.entityType === "TEACHER"
              ? "teacher"
              : data.entityType === "CLASS"
                ? "class"
                : "room",
            data.entityId,
            "entityId",
          );
          return tx.availabilityRule.create({
            data: {
              schoolYearId,
              entityType: data.entityType,
              entityId: data.entityId,
              dayOfWeek: data.dayOfWeek,
              period: data.period,
              kind: data.kind,
              weight: data.weight,
              reason: data.reason,
            },
          });
        }
        case "assignments": {
          const data = assignmentSchema.parse(body);
          await Promise.all([
            ensureScopedReference(
              tx,
              schoolYearId,
              "teacher",
              data.teacherId,
              "teacherId",
            ),
            ensureScopedReference(
              tx,
              schoolYearId,
              "class",
              data.classId,
              "classId",
            ),
            ensureScopedReference(
              tx,
              schoolYearId,
              "subject",
              data.subjectId,
              "subjectId",
            ),
            ensureScopedReference(
              tx,
              schoolYearId,
              "room",
              data.requiredRoomId,
              "requiredRoomId",
            ),
            ensureScopedReference(
              tx,
              schoolYearId,
              "roomType",
              data.requiredRoomTypeId,
              "requiredRoomTypeId",
            ),
          ]);
          return tx.teachingAssignment.create({
            data: {
              schoolYearId,
              assignmentCode: data.assignmentCode,
              teacherId: data.teacherId,
              classId: data.classId,
              subjectId: data.subjectId,
              group: data.group,
              weeklyPeriods: data.weeklyPeriods,
              lessonShape: data.lessonShape,
              doublePeriodsCount: data.doublePeriodsCount,
              requiredRoomId: data.requiredRoomId,
              requiredRoomTypeId: data.requiredRoomTypeId,
              priority: data.priority,
              notes: data.notes,
              fixedLessons: data.fixedLessons?.length
                ? {
                    create: data.fixedLessons.map((item) => ({
                      ...item,
                      locked: item.locked ?? true,
                    })),
                  }
                : undefined,
              distributionRules: {
                create: [
                  ...(data.maxPerDay != null
                    ? [
                        {
                          type: "MAX_PER_DAY" as const,
                          value: data.maxPerDay,
                          hard: true,
                        },
                      ]
                    : []),
                  ...(data.minDayGap != null
                    ? [
                        {
                          type: "MIN_DAY_GAP" as const,
                          value: data.minDayGap,
                          hard: false,
                        },
                      ]
                    : []),
                ],
              },
            },
            include: { fixedLessons: true, distributionRules: true },
          });
        }
      }
    },
  );
}

const updateSchemas = {
  teachers: teacherSchema
    .omit({ code: true })
    .partial()
    .required({ expectedSchoolYearVersion: true }),
  classes: classSchema
    .omit({ code: true })
    .partial()
    .required({ expectedSchoolYearVersion: true }),
  subjects: subjectSchema
    .omit({ code: true })
    .partial()
    .required({ expectedSchoolYearVersion: true }),
  "room-types": roomTypeSchema
    .omit({ code: true })
    .partial()
    .required({ expectedSchoolYearVersion: true }),
  rooms: roomSchema
    .omit({ code: true })
    .partial()
    .required({ expectedSchoolYearVersion: true }),
  availability: availabilitySchema
    .partial()
    .required({ expectedSchoolYearVersion: true }),
  assignments: assignmentSchema
    .omit({ assignmentCode: true })
    .partial()
    .required({ expectedSchoolYearVersion: true }),
} satisfies Record<MasterResource, z.ZodType>;

export async function updateMasterData(
  schoolYearId: string,
  resource: MasterResource,
  resourceId: string,
  body: unknown,
) {
  const parsed = updateSchemas[resource].safeParse(body);
  if (!parsed.success) validationFailure(parsed.error);
  const input = parsed.data as Record<string, unknown> & {
    expectedSchoolYearVersion: number;
  };
  const { expectedSchoolYearVersion, ...data } = input;

  return withSchoolYearVersion(
    schoolYearId,
    expectedSchoolYearVersion,
    async (tx) => {
      const scoped = { id: resourceId, schoolYearId };
      switch (resource) {
        case "teachers": {
          const found = await tx.teacher.findFirst({ where: scoped });
          if (!found)
            throw new MasterDataError(
              "RESOURCE_NOT_FOUND",
              "Učitel nebyl nalezen.",
              404,
            );
          return tx.teacher.update({ where: { id: resourceId }, data });
        }
        case "classes": {
          const found = await tx.schoolClass.findFirst({ where: scoped });
          if (!found)
            throw new MasterDataError(
              "RESOURCE_NOT_FOUND",
              "Třída nebyla nalezena.",
              404,
            );
          return tx.schoolClass.update({ where: { id: resourceId }, data });
        }
        case "subjects": {
          const found = await tx.subject.findFirst({ where: scoped });
          if (!found)
            throw new MasterDataError(
              "RESOURCE_NOT_FOUND",
              "Předmět nebyl nalezen.",
              404,
            );
          await ensureScopedReference(
            tx,
            schoolYearId,
            "roomType",
            data.defaultRoomTypeId as string | null | undefined,
            "defaultRoomTypeId",
          );
          return tx.subject.update({ where: { id: resourceId }, data });
        }
        case "room-types": {
          const found = await tx.roomType.findFirst({ where: scoped });
          if (!found)
            throw new MasterDataError(
              "RESOURCE_NOT_FOUND",
              "Typ učebny nebyl nalezen.",
              404,
            );
          return tx.roomType.update({ where: { id: resourceId }, data });
        }
        case "rooms": {
          const found = await tx.room.findFirst({ where: scoped });
          if (!found)
            throw new MasterDataError(
              "RESOURCE_NOT_FOUND",
              "Učebna nebyla nalezena.",
              404,
            );
          await ensureScopedReference(
            tx,
            schoolYearId,
            "roomType",
            data.roomTypeId as string | null | undefined,
            "roomTypeId",
          );
          return tx.room.update({ where: { id: resourceId }, data });
        }
        case "availability": {
          const found = await tx.availabilityRule.findFirst({ where: scoped });
          if (!found)
            throw new MasterDataError(
              "RESOURCE_NOT_FOUND",
              "Pravidlo dostupnosti nebylo nalezeno.",
              404,
            );
          if (data.entityId || data.entityType) {
            const entityType = (data.entityType ?? found.entityType) as
              | "TEACHER"
              | "CLASS"
              | "ROOM";
            const entityId = (data.entityId ?? found.entityId) as string;
            await ensureScopedReference(
              tx,
              schoolYearId,
              entityType === "TEACHER"
                ? "teacher"
                : entityType === "CLASS"
                  ? "class"
                  : "room",
              entityId,
              "entityId",
            );
          }
          return tx.availabilityRule.update({
            where: { id: resourceId },
            data,
          });
        }
        case "assignments": {
          const found = await tx.teachingAssignment.findFirst({
            where: scoped,
          });
          if (!found)
            throw new MasterDataError(
              "RESOURCE_NOT_FOUND",
              "Výuková vazba nebyla nalezena.",
              404,
            );
          const { fixedLessons, maxPerDay, minDayGap, ...assignmentData } =
            data;
          await Promise.all([
            ensureScopedReference(
              tx,
              schoolYearId,
              "teacher",
              assignmentData.teacherId as string | undefined,
              "teacherId",
            ),
            ensureScopedReference(
              tx,
              schoolYearId,
              "class",
              assignmentData.classId as string | undefined,
              "classId",
            ),
            ensureScopedReference(
              tx,
              schoolYearId,
              "subject",
              assignmentData.subjectId as string | undefined,
              "subjectId",
            ),
            ensureScopedReference(
              tx,
              schoolYearId,
              "room",
              assignmentData.requiredRoomId as string | null | undefined,
              "requiredRoomId",
            ),
            ensureScopedReference(
              tx,
              schoolYearId,
              "roomType",
              assignmentData.requiredRoomTypeId as string | null | undefined,
              "requiredRoomTypeId",
            ),
          ]);
          if (fixedLessons !== undefined) {
            await tx.fixedLessonRule.deleteMany({
              where: { teachingAssignmentId: resourceId },
            });
            const items = fixedLessons as z.infer<typeof fixedLessonSchema>[];
            if (items.length) {
              await tx.fixedLessonRule.createMany({
                data: items.map((item) => ({
                  teachingAssignmentId: resourceId,
                  ...item,
                  locked: item.locked ?? true,
                })),
              });
            }
          }
          if (maxPerDay !== undefined || minDayGap !== undefined) {
            await tx.distributionRule.deleteMany({
              where: { teachingAssignmentId: resourceId },
            });
            const rules = [
              ...(maxPerDay != null
                ? [
                    {
                      teachingAssignmentId: resourceId,
                      type: "MAX_PER_DAY" as const,
                      value: maxPerDay as number,
                      hard: true,
                    },
                  ]
                : []),
              ...(minDayGap != null
                ? [
                    {
                      teachingAssignmentId: resourceId,
                      type: "MIN_DAY_GAP" as const,
                      value: minDayGap as number,
                      hard: false,
                    },
                  ]
                : []),
            ];
            if (rules.length)
              await tx.distributionRule.createMany({ data: rules });
          }
          return tx.teachingAssignment.update({
            where: { id: resourceId },
            data: assignmentData,
          });
        }
      }
    },
  );
}

export async function deleteMasterData(
  schoolYearId: string,
  resource: MasterResource,
  resourceId: string,
  expectedSchoolYearVersion: number,
) {
  return withSchoolYearVersion(
    schoolYearId,
    expectedSchoolYearVersion,
    async (tx) => {
      switch (resource) {
        case "teachers":
          return tx.teacher.delete({ where: { id: resourceId, schoolYearId } });
        case "classes":
          return tx.schoolClass.delete({
            where: { id: resourceId, schoolYearId },
          });
        case "subjects":
          return tx.subject.delete({ where: { id: resourceId, schoolYearId } });
        case "room-types":
          return tx.roomType.delete({
            where: { id: resourceId, schoolYearId },
          });
        case "rooms":
          return tx.room.delete({ where: { id: resourceId, schoolYearId } });
        case "assignments":
          return tx.teachingAssignment.delete({
            where: { id: resourceId, schoolYearId },
          });
        case "availability":
          return tx.availabilityRule.delete({
            where: { id: resourceId, schoolYearId },
          });
      }
    },
  );
}

export function normalizeMasterDataError(error: unknown): MasterDataError {
  if (error instanceof MasterDataError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return new MasterDataError(
        "DUPLICATE_CODE",
        "Položka se stejným kódem již existuje.",
        409,
      );
    }
    if (error.code === "P2003") {
      return new MasterDataError(
        "RESOURCE_IN_USE",
        "Položku nelze odstranit, protože ji používají další data.",
        409,
      );
    }
    if (error.code === "P2025") {
      return new MasterDataError(
        "RESOURCE_NOT_FOUND",
        "Položka nebyla nalezena.",
        404,
      );
    }
  }
  throw error;
}
