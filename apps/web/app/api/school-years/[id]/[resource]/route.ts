import { NextResponse } from "next/server";

import { apiError } from "@/lib/server/api-response";
import {
  createMasterData,
  isMasterResource,
  listMasterData,
  normalizeMasterDataError,
} from "@/lib/server/master-data";

interface RouteContext {
  params: Promise<{ id: string; resource: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id: schoolYearId, resource } = await context.params;
  if (!isMasterResource(resource)) {
    return apiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "Požadovaný zdroj neexistuje." });
  }
  const items = await listMasterData(schoolYearId, resource);
  return NextResponse.json({ items });
}

export async function POST(request: Request, context: RouteContext) {
  const { id: schoolYearId, resource } = await context.params;
  if (!isMasterResource(resource)) {
    return apiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "Požadovaný zdroj neexistuje." });
  }
  try {
    const result = await createMasterData(
      schoolYearId,
      resource,
      await request.json().catch(() => null),
    );
    return NextResponse.json(result, { status: 201 });
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
