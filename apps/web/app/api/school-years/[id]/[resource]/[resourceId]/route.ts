import { z } from "zod";

import { apiError } from "@/lib/server/api-response";
import {
  deleteMasterData,
  isMasterResource,
  normalizeMasterDataError,
  updateMasterData,
} from "@/lib/server/master-data";

interface RouteContext {
  params: Promise<{ id: string; resource: string; resourceId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id: schoolYearId, resource, resourceId } = await context.params;
  if (!isMasterResource(resource)) {
    return apiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "Požadovaný zdroj neexistuje." });
  }
  try {
    const result = await updateMasterData(
      schoolYearId,
      resource,
      resourceId,
      await request.json().catch(() => null),
    );
    return Response.json(result);
  } catch (error) {
    const normalized = normalizeMasterDataError(error);
    return apiError({
      status: normalized.status,
      code: normalized.code,
      message: normalized.message,
      fieldErrors: normalized.fieldErrors,
      details: normalized.details,
    });
  }
}

const deleteSchema = z.object({ expectedSchoolYearVersion: z.number().int().positive() });

export async function DELETE(request: Request, context: RouteContext) {
  const { id: schoolYearId, resource, resourceId } = await context.params;
  if (!isMasterResource(resource)) {
    return apiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "Požadovaný zdroj neexistuje." });
  }
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError({
      status: 422,
      code: "EXPECTED_VERSION_REQUIRED",
      message: "Pro odstranění je nutná aktuální verze školního roku.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    });
  }
  try {
    const result = await deleteMasterData(
      schoolYearId,
      resource,
      resourceId,
      parsed.data.expectedSchoolYearVersion,
    );
    return Response.json(result);
  } catch (error) {
    const normalized = normalizeMasterDataError(error);
    return apiError({
      status: normalized.status,
      code: normalized.code,
      message: normalized.message,
      fieldErrors: normalized.fieldErrors,
      details: normalized.details,
    });
  }
}
