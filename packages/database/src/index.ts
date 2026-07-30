import { PrismaClient } from "@prisma/client";

export { Prisma } from "@prisma/client";
export type {
  AvailabilityRule,
  FixedLessonRule,
  Room,
  RoomType,
  SchoolClass,
  SchoolYear,
  Subject,
  Teacher,
  TeachingAssignment,
  TimetableLesson,
  TimetableVersion,
} from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
