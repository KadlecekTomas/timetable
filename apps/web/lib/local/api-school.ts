import * as base from "./api";
import {
  loadStaffingPlan,
  teacherCodesForPlan,
  teachingTargetWeeklyLoad,
} from "./staffing-plan-school-v2";
import { loadTeachingPlan, type TeachingPlanRow } from "./teaching-plan-school";

export * from "./api";

interface ResourceItem {
  id?: string;
  code?: string;
  reason?: string | null;
  entityId?: string;
  dayOfWeek?: number;
  period?: number;
  kind?: string;
}

interface ResourceResponse {
  items: ResourceItem[];
}

interface VersionResponse {
  schoolYearVersion?: number;
  error?: { message?: string };
}

let cleanedSharedPreferences = false;

function requestBody(init?: RequestInit): Record<string, unknown> {
  if (typeof init?.body !== "string" || !init.body) return {};
  try {
    const parsed = JSON.parse(init.body) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function responseWithJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function pathFor(input: RequestInfo | URL): string {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  return new URL(raw, window.location.origin).pathname;
}

function sharedRowFor(
  classCode: string,
  subjectCode: string,
): TeachingPlanRow | undefined {
  return loadTeachingPlan().rows.find(
    (row) =>
      row.classCode === classCode &&
      row.subjectCode === subjectCode &&
      (row.additionalClassCodes?.length ?? 0) > 0,
  );
}

async function resources(path: string): Promise<ResourceItem[]> {
  const response = await base.localApiFetch(path);
  if (!response.ok) return [];
  return (await json<ResourceResponse>(response)).items;
}

async function cleanupOldSharedPreferences(
  schoolYearId: string,
  expectedVersion: number,
): Promise<number> {
  if (cleanedSharedPreferences) return expectedVersion;
  cleanedSharedPreferences = true;

  let version = expectedVersion;
  const rules = await resources(
    `/api/school-years/${schoolYearId}/availability`,
  );
  for (const rule of rules) {
    if (!rule.id || !String(rule.reason ?? "").startsWith("SHARED_GROUP:")) {
      continue;
    }
    const response = await base.localApiFetch(
      `/api/school-years/${schoolYearId}/availability/${encodeURIComponent(rule.id)}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedSchoolYearVersion: version }),
      },
    );
    if (!response.ok) return version;
    const payload = await json<VersionResponse>(response);
    version = payload.schoolYearVersion ?? version + 1;
  }
  return version;
}

async function addPreferredTeacherSlots(
  schoolYearId: string,
  teacherId: string,
  row: TeachingPlanRow,
  expectedVersion: number,
): Promise<number> {
  const starts = row.preferredStartPeriods ?? [];
  if (starts.length === 0) return expectedVersion;

  const duration = row.lessonShape === "DOUBLE" ? 2 : 1;
  const occupiedPeriods = [
    ...new Set(
      starts.flatMap((start) =>
        Array.from({ length: duration }, (_unused, offset) => start + offset),
      ),
    ),
  ];
  let version = expectedVersion;
  for (let day = 0; day < 5; day += 1) {
    for (const period of occupiedPeriods) {
      const response = await base.localApiFetch(
        `/api/school-years/${schoolYearId}/availability`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedSchoolYearVersion: version,
            entityType: "TEACHER",
            entityId: teacherId,
            dayOfWeek: day,
            period,
            kind: "PREFERRED",
            weight: Math.min(100, Math.max(1, row.preferenceWeight ?? 100)),
            reason: `SHARED_GROUP:${row.id}:${row.sharedGroupLabel ?? row.subjectCode}`,
          }),
        },
      );
      if (!response.ok) return version;
      const payload = await json<VersionResponse>(response);
      version = payload.schoolYearVersion ?? version + 1;
    }
  }
  return version;
}

function adjustedTeacherRequest(
  init: RequestInit | undefined,
): RequestInit | undefined {
  const body = requestBody(init);
  const code = String(body.code ?? "");
  if (!code) return init;

  const plan = loadStaffingPlan();
  const codes = teacherCodesForPlan(plan);
  const teacher = plan.teachers.find((item) => codes.get(item.id) === code);
  if (!teacher) return init;

  return {
    ...init,
    body: JSON.stringify({
      ...body,
      targetWeeklyLoad: teachingTargetWeeklyLoad(teacher),
    }),
  };
}

export async function localApiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const path = pathFor(input);
  const method = (init?.method ?? "GET").toUpperCase();
  const teacherMatch = path.match(/^\/api\/school-years\/[^/]+\/teachers$/);
  if (teacherMatch && method === "POST") {
    return base.localApiFetch(input, adjustedTeacherRequest(init));
  }

  const assignmentMatch = path.match(
    /^\/api\/school-years\/([^/]+)\/assignments$/,
  );

  if (!assignmentMatch || method !== "POST") {
    return base.localApiFetch(input, init);
  }

  const schoolYearId = decodeURIComponent(assignmentMatch[1]!);
  const body = requestBody(init);
  const classId = String(body.classId ?? "");
  const subjectId = String(body.subjectId ?? "");
  const teacherId = String(body.teacherId ?? "");
  let version = Number(body.expectedSchoolYearVersion);

  const [classes, subjects] = await Promise.all([
    resources(`/api/school-years/${schoolYearId}/classes`),
    resources(`/api/school-years/${schoolYearId}/subjects`),
  ]);
  const classCode = classes.find((item) => item.id === classId)?.code ?? "";
  const subjectCode =
    subjects.find((item) => item.id === subjectId)?.code ?? "";
  const sharedRow = sharedRowFor(classCode, subjectCode);

  if (!sharedRow) return base.localApiFetch(input, init);

  version = await cleanupOldSharedPreferences(schoolYearId, version);
  const classIdByCode = new Map(
    classes.map((item) => [String(item.code ?? ""), String(item.id ?? "")]),
  );
  const additionalClassIds = (sharedRow.additionalClassCodes ?? [])
    .map((code) => classIdByCode.get(code) ?? "")
    .filter(Boolean);

  const assignmentResponse = await base.localApiFetch(input, {
    ...init,
    body: JSON.stringify({
      ...body,
      expectedSchoolYearVersion: version,
      additionalClassIds,
    }),
  });
  const assignmentPayload = await json<VersionResponse>(assignmentResponse);
  if (!assignmentResponse.ok) {
    return responseWithJson(assignmentPayload, assignmentResponse.status);
  }
  version = assignmentPayload.schoolYearVersion ?? version + 1;
  version = await addPreferredTeacherSlots(
    schoolYearId,
    teacherId,
    sharedRow,
    version,
  );

  return responseWithJson({ schoolYearVersion: version }, 201);
}
