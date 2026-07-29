import { prisma } from "@timetable/database";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, validationError } from "@/lib/server/api-response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const updateSchema = z
  .object({
    label: z
      .string()
      .trim()
      .regex(/^\d{4}\/\d{4}$/)
      .optional(),
    startsOn: z.coerce.date().optional(),
    endsOn: z.coerce.date().optional(),
    periodsPerDay: z
      .array(z.number().int().min(1).max(16))
      .min(5)
      .max(7)
      .optional(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
    expectedVersion: z.number().int().positive(),
  })
  .refine(
    (value) =>
      !value.startsOn || !value.endsOn || value.startsOn < value.endsOn,
    {
      path: ["endsOn"],
      message: "Konec školního roku musí být po začátku.",
    },
  );

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const schoolYear = await prisma.schoolYear.findUnique({
    where: { id },
    include: { school: true },
  });
  if (!schoolYear) {
    return apiError({
      status: 404,
      code: "SCHOOL_YEAR_NOT_FOUND",
      message: "Školní rok nebyl nalezen.",
    });
  }
  return NextResponse.json({
    id: schoolYear.id,
    schoolId: schoolYear.schoolId,
    schoolName: schoolYear.school.name,
    label: schoolYear.label,
    startsOn: schoolYear.startsOn,
    endsOn: schoolYear.endsOn,
    periodsPerDay: schoolYear.periodsPerDay,
    status: schoolYear.status,
    version: schoolYear.version,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationError(
      "SCHOOL_YEAR_INVALID",
      "Nastavení školního roku obsahuje neplatné hodnoty.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  const current = await prisma.schoolYear.findUnique({ where: { id } });
  if (!current) {
    return apiError({
      status: 404,
      code: "SCHOOL_YEAR_NOT_FOUND",
      message: "Školní rok nebyl nalezen.",
    });
  }
  if (current.version !== parsed.data.expectedVersion) {
    return apiError({
      status: 409,
      code: "SCHOOL_YEAR_VERSION_CONFLICT",
      message: "Školní rok mezitím změnil jiný uživatel.",
      details: {
        expectedVersion: parsed.data.expectedVersion,
        actualVersion: current.version,
      },
    });
  }

  const updated = await prisma.schoolYear.update({
    where: { id },
    data: {
      label: parsed.data.label,
      startsOn: parsed.data.startsOn,
      endsOn: parsed.data.endsOn,
      periodsPerDay: parsed.data.periodsPerDay,
      status: parsed.data.status,
      version: { increment: 1 },
    },
  });
  return NextResponse.json(updated);
}
