import { prisma } from "@timetable/database";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, validationError } from "@/lib/server/api-response";

const createSchoolYearSchema = z
  .object({
    schoolId: z.string().cuid().optional(),
    schoolName: z.string().trim().min(2).max(160).optional(),
    label: z
      .string()
      .trim()
      .regex(/^\d{4}\/\d{4}$/),
    startsOn: z.coerce.date(),
    endsOn: z.coerce.date(),
    periodsPerDay: z.array(z.number().int().min(1).max(16)).min(5).max(7),
  })
  .refine((value) => value.schoolId || value.schoolName, {
    path: ["schoolName"],
    message: "Zadejte schoolId nebo název školy.",
  })
  .refine((value) => value.startsOn < value.endsOn, {
    path: ["endsOn"],
    message: "Konec školního roku musí být po začátku.",
  });

export async function GET() {
  const schoolYears = await prisma.schoolYear.findMany({
    include: { school: true },
    orderBy: [{ startsOn: "desc" }, { label: "desc" }],
  });
  return NextResponse.json({
    items: schoolYears.map((item) => ({
      id: item.id,
      schoolId: item.schoolId,
      schoolName: item.school.name,
      label: item.label,
      startsOn: item.startsOn,
      endsOn: item.endsOn,
      status: item.status,
      periodsPerDay: item.periodsPerDay,
      version: item.version,
    })),
  });
}

export async function POST(request: Request) {
  const parsed = createSchoolYearSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return validationError(
      "SCHOOL_YEAR_INVALID",
      "Školní rok obsahuje neplatné hodnoty.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  const school = parsed.data.schoolId
    ? await prisma.school.findUnique({ where: { id: parsed.data.schoolId } })
    : await prisma.school.upsert({
        where: { name: parsed.data.schoolName! },
        create: { name: parsed.data.schoolName! },
        update: {},
      });
  if (!school) {
    return apiError({
      status: 404,
      code: "SCHOOL_NOT_FOUND",
      message: "Škola nebyla nalezena.",
    });
  }

  const existing = await prisma.schoolYear.findUnique({
    where: {
      schoolId_label: { schoolId: school.id, label: parsed.data.label },
    },
  });
  if (existing) {
    return apiError({
      status: 409,
      code: "SCHOOL_YEAR_DUPLICATE",
      message: `Školní rok ${parsed.data.label} již existuje.`,
      details: { schoolYearId: existing.id },
    });
  }

  const schoolYear = await prisma.schoolYear.create({
    data: {
      schoolId: school.id,
      label: parsed.data.label,
      startsOn: parsed.data.startsOn,
      endsOn: parsed.data.endsOn,
      periodsPerDay: parsed.data.periodsPerDay,
    },
  });
  return NextResponse.json(schoolYear, { status: 201 });
}
