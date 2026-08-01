import {
  DAY_CODES,
  type CanonicalSnapshot,
  type ScheduledLesson,
} from "@/lib/domain/contracts";
import { evaluateReadiness } from "@/lib/domain/readiness";
import { scoreSchedule } from "@/lib/domain/scoring";
import { validateMove, validateSchedule } from "@/lib/domain/validation";
import type {
  ImportAnalysis,
  ImportIssueDraft,
  ImportPayload,
  ImportSummary,
} from "@/lib/import/contracts";
import { analyzeClientImportWorkbook } from "@/lib/import/client-workbook";

export const LOCAL_SCHOOL_YEAR_ID = "local-school-year";

const DATABASE_NAME = "rozvrhar-local";
const DATABASE_VERSION = 1;
const STORE_NAME = "state";
const PROJECT_KEY = "active-project";
const CHANGE_EVENT = "rozvrhar:project-changed";

const DEFAULT_WEIGHTS = {
  teacher_gap: 20,
  class_gap: 25,
  discouraged_slot: 8,
  preferred_slot_bonus: 3,
  same_day_concentration: 6,
  late_period: 1,
};

type GenerationStatus =
  | "QUEUED"
  | "RUNNING"
  | "FEASIBLE"
  | "OPTIMAL"
  | "INFEASIBLE"
  | "FAILED"
  | "CANCELLED";

type ResourceName =
  | "teachers"
  | "classes"
  | "subjects"
  | "room-types"
  | "rooms"
  | "assignments"
  | "availability";

interface LocalTeacher {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  targetWeeklyLoad: number;
  minWeeklyLoad: number | null;
  maxWeeklyLoad: number | null;
}

interface LocalClass {
  id: string;
  code: string;
  grade: number;
  name: string;
}

interface LocalRoomType {
  id: string;
  code: string;
  name: string;
}

interface LocalSubject {
  id: string;
  code: string;
  name: string;
  colorToken: string | null;
  defaultRoomTypeId: string | null;
}

interface LocalRoom {
  id: string;
  code: string;
  name: string;
  capacity: number | null;
  roomTypeId: string | null;
}

interface LocalAssignment {
  id: string;
  assignmentCode: string;
  classId: string;
  additionalClassIds: string[];
  subjectId: string;
  teacherId: string;
  group: "WHOLE" | "GROUP_1" | "GROUP_2";
  weeklyPeriods: number;
  lessonShape: "SINGLE" | "DOUBLE" | "MIXED";
  doublePeriodsCount: number;
  requiredRoomId: string | null;
  requiredRoomTypeId: string | null;
  maxPerDay: number | null;
  minDayGap: number | null;
}

interface LocalAvailability {
  id: string;
  entityType: "TEACHER" | "CLASS" | "ROOM";
  entityId: string;
  dayOfWeek: number;
  period: number;
  kind: "UNAVAILABLE" | "PREFERRED" | "DISCOURAGED";
  weight: number | null;
  reason: string | null;
}

interface LocalFixedLesson {
  id: string;
  assignmentId: string;
  blockIndex: number;
  dayOfWeek: number;
  startPeriod: number;
  duration: number;
  roomId: string | null;
  locked: boolean;
}

interface LocalImportBatch {
  id: string;
  fileName: string;
  fileHash: string;
  status: "READY" | "VALIDATION_FAILED" | "APPLIED";
  expectedProjectVersion: number;
  summary: ImportSummary;
  issues: ImportIssueDraft[];
  payload: ImportPayload | null;
  createdAt: string;
  appliedAt: string | null;
}

interface LocalTimetableVersion {
  id: string;
  name: string;
  versionNumber: number;
  revision: number;
  isCurrent: boolean;
  qualityScore: number | null;
  scoreBreakdown: Record<string, number> | null;
  incidentReport: Array<{
    code: string;
    category: string;
    points: number;
    message: string;
    suggestion?: string;
  }>;
  snapshot: CanonicalSnapshot;
  lessons: ScheduledLesson[];
  undoStack: ScheduledLesson[][];
  createdAt: string;
  updatedAt: string;
}

interface LocalGenerationRun {
  id: string;
  status: GenerationStatus;
  inputSnapshotHash: string;
  qualityScore: number | null;
  objectiveValue: number | null;
  explanation: unknown;
  candidateVersionId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface LocalProject {
  schemaVersion: 1;
  id: typeof LOCAL_SCHOOL_YEAR_ID;
  schoolName: string;
  label: string;
  status: "ACTIVE";
  periodsPerDay: number[];
  version: number;
  updatedAt: string;
  teachers: LocalTeacher[];
  classes: LocalClass[];
  subjects: LocalSubject[];
  roomTypes: LocalRoomType[];
  rooms: LocalRoom[];
  assignments: LocalAssignment[];
  availability: LocalAvailability[];
  fixedLessons: LocalFixedLesson[];
  importBatches: LocalImportBatch[];
  generationRuns: LocalGenerationRun[];
  timetableVersions: LocalTimetableVersion[];
}

interface BackupEnvelope {
  format: "rozvrhar-local-backup";
  version: 1;
  exportedAt: string;
  checksum: string;
  project: LocalProject;
}

interface SolverResponse {
  status: string;
  objective_value: number;
  lessons: ScheduledLesson[];
  score?: {
    valid: boolean;
    total: number | null;
    categories: Record<string, number>;
    incidents: LocalTimetableVersion["incidentReport"];
  };
  diagnostics?: unknown[];
  solver_stats?: Record<string, unknown>;
}

function now(): string {
  return new Date().toISOString();
}

function createDefaultProject(): LocalProject {
  return {
    schemaVersion: 1,
    id: LOCAL_SCHOOL_YEAR_ID,
    schoolName: "Moje škola",
    label: "2026/2027",
    status: "ACTIVE",
    periodsPerDay: [8, 8, 8, 8, 7],
    version: 1,
    updatedAt: now(),
    teachers: [],
    classes: [],
    subjects: [],
    roomTypes: [],
    rooms: [],
    assignments: [],
    availability: [],
    fixedLessons: [],
    importBatches: [],
    generationRuns: [],
    timetableVersions: [],
  };
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("Tento prohlížeč nepodporuje lokální úložiště IndexedDB."),
    );
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Lokální úložiště nelze otevřít."));
  });
}

async function readStoredProject(): Promise<LocalProject | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(PROJECT_KEY);
    request.onsuccess = () => resolve((request.result as LocalProject) ?? null);
    request.onerror = () =>
      reject(request.error ?? new Error("Lokální data nelze načíst."));
    transaction.oncomplete = () => database.close();
  });
}

async function writeStoredProject(project: LocalProject): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(project, PROJECT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Lokální data nelze uložit."));
  });
  database.close();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
    try {
      const channel = new BroadcastChannel(CHANGE_EVENT);
      channel.postMessage({ updatedAt: project.updatedAt });
      channel.close();
    } catch {
      // BroadcastChannel není nutný pro základní funkčnost.
    }
  }
}

export async function getLocalProject(): Promise<LocalProject> {
  const stored = await readStoredProject();
  if (stored?.schemaVersion === 1) return stored;
  const created = createDefaultProject();
  await writeStoredProject(created);
  return created;
}

async function mutateProject<T>(
  mutation: (project: LocalProject) => T | Promise<T>,
): Promise<T> {
  const current = await getLocalProject();
  const next = structuredClone(current);
  const result = await mutation(next);
  next.updatedAt = now();
  await writeStoredProject(next);
  return result;
}

export function subscribeLocalProject(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CHANGE_EVENT, listener);
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANGE_EVENT);
    channel.addEventListener("message", listener);
  } catch {
    channel = null;
  }
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    channel?.removeEventListener("message", listener);
    channel?.close();
  };
}

function idFor(prefix: string, value: string): string {
  const normalized = value
    .trim()
    .toLocaleLowerCase("cs-CZ")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${prefix}:${normalized || crypto.randomUUID()}`;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse({ error: { code, message, details } }, status);
}

async function sha256Hex(
  value: ArrayBuffer | Uint8Array | string,
): Promise<string> {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : value instanceof Uint8Array
        ? value
        : new Uint8Array(value);
  const digestBytes = new Uint8Array(bytes.byteLength);
  digestBytes.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestBytes.buffer);
  return [...new Uint8Array(digest)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function projectSnapshot(
  project: LocalProject,
  timeLimitSeconds = 60,
): CanonicalSnapshot {
  return {
    contract_version: "1.0",
    school_year: {
      id: project.id,
      label: project.label,
      version: project.version,
    },
    periods_per_day: project.periodsPerDay,
    teachers: project.teachers.map((teacher) => ({
      id: teacher.id,
      code: teacher.code,
      first_name: teacher.firstName,
      last_name: teacher.lastName,
      target_weekly_load: teacher.targetWeeklyLoad,
      min_weekly_load: teacher.minWeeklyLoad,
      max_weekly_load: teacher.maxWeeklyLoad,
    })),
    classes: project.classes.map((schoolClass) => ({
      id: schoolClass.id,
      code: schoolClass.code,
      name: schoolClass.name,
      grade: schoolClass.grade,
    })),
    subjects: project.subjects.map((subject) => ({
      id: subject.id,
      code: subject.code,
      name: subject.name,
      color_token: subject.colorToken,
      default_room_type_id: subject.defaultRoomTypeId,
    })),
    rooms: project.rooms.map((room) => ({
      id: room.id,
      code: room.code,
      name: room.name,
      room_type_id: room.roomTypeId,
    })),
    assignments: project.assignments.map((assignment) => ({
      id: assignment.id,
      code: assignment.assignmentCode,
      teacher_id: assignment.teacherId,
      class_id: assignment.classId,
      additional_class_ids: assignment.additionalClassIds,
      subject_id: assignment.subjectId,
      group: assignment.group,
      weekly_periods: assignment.weeklyPeriods,
      lesson_shape: assignment.lessonShape,
      double_periods_count: assignment.doublePeriodsCount,
      required_room_id: assignment.requiredRoomId,
      required_room_type_id: assignment.requiredRoomTypeId,
      max_per_day: assignment.maxPerDay,
      min_day_gap: assignment.minDayGap,
    })),
    availability: project.availability.map((rule) => ({
      entity_type: rule.entityType,
      entity_id: rule.entityId,
      day: rule.dayOfWeek,
      period: rule.period,
      kind: rule.kind,
      weight: rule.weight,
      reason: rule.reason,
    })),
    fixed_lessons: project.fixedLessons.map((fixedLesson) => ({
      assignment_id: fixedLesson.assignmentId,
      block_index: fixedLesson.blockIndex,
      day: fixedLesson.dayOfWeek,
      period: fixedLesson.startPeriod,
      room_id: fixedLesson.roomId,
      locked: fixedLesson.locked,
    })),
    locked_lessons: [],
    weights: DEFAULT_WEIGHTS,
    random_seed: 1,
    time_limit_seconds: timeLimitSeconds,
  };
}

function schoolYearView(project: LocalProject) {
  return {
    id: project.id,
    schoolName: project.schoolName,
    label: project.label,
    status: project.status,
    periodsPerDay: project.periodsPerDay,
    version: project.version,
    updatedAt: project.updatedAt,
  };
}

function assignmentView(project: LocalProject, assignment: LocalAssignment) {
  return {
    ...assignment,
    teacher: project.teachers.find((item) => item.id === assignment.teacherId),
    schoolClass: project.classes.find((item) => item.id === assignment.classId),
    schoolClasses: [assignment.classId, ...assignment.additionalClassIds]
      .map((classId) => project.classes.find((item) => item.id === classId))
      .filter(Boolean),
    subject: project.subjects.find((item) => item.id === assignment.subjectId),
    requiredRoom: project.rooms.find(
      (item) => item.id === assignment.requiredRoomId,
    ),
  };
}

function resourceItems(
  project: LocalProject,
  resource: ResourceName,
): unknown[] {
  if (resource === "teachers") return project.teachers;
  if (resource === "classes") return project.classes;
  if (resource === "subjects") return project.subjects;
  if (resource === "room-types") return project.roomTypes;
  if (resource === "rooms") return project.rooms;
  if (resource === "availability") return project.availability;
  return project.assignments.map((item) => assignmentView(project, item));
}

function readJsonBody(init?: RequestInit): Record<string, unknown> {
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

function stringField(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

function nullableNumber(
  body: Record<string, unknown>,
  key: string,
): number | null {
  const value = body[key];
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function checkExpectedVersion(
  project: LocalProject,
  body: Record<string, unknown>,
): Response | null {
  const expected = Number(body.expectedSchoolYearVersion);
  if (!Number.isInteger(expected) || expected !== project.version) {
    return errorResponse(
      409,
      "SCHOOL_YEAR_VERSION_CONFLICT",
      "Data se mezitím změnila. Obnovte stránku a zkuste operaci znovu.",
      { expectedVersion: expected, actualVersion: project.version },
    );
  }
  return null;
}

function duplicateCode(
  items: Array<{ id: string; code: string }>,
  code: string,
): boolean {
  return items.some(
    (item) =>
      item.code.toLocaleLowerCase("cs-CZ") === code.toLocaleLowerCase("cs-CZ"),
  );
}

async function createResource(
  resource: ResourceName,
  body: Record<string, unknown>,
): Promise<Response> {
  let response: Response | null = null;
  await mutateProject((project) => {
    response = checkExpectedVersion(project, body);
    if (response) return;

    if (resource === "teachers") {
      const code = stringField(body, "code");
      if (!code || duplicateCode(project.teachers, code)) {
        response = errorResponse(
          422,
          "TEACHER_INVALID",
          "Kód učitele chybí nebo již existuje.",
        );
        return;
      }
      project.teachers.push({
        id: idFor("teacher", code),
        code,
        firstName: stringField(body, "firstName"),
        lastName: stringField(body, "lastName"),
        targetWeeklyLoad: Number(body.targetWeeklyLoad),
        minWeeklyLoad: nullableNumber(body, "minWeeklyLoad"),
        maxWeeklyLoad: nullableNumber(body, "maxWeeklyLoad"),
      });
    } else if (resource === "classes") {
      const code = stringField(body, "code");
      if (!code || duplicateCode(project.classes, code)) {
        response = errorResponse(
          422,
          "CLASS_INVALID",
          "Kód třídy chybí nebo již existuje.",
        );
        return;
      }
      project.classes.push({
        id: idFor("class", code),
        code,
        grade: Number(body.grade),
        name: stringField(body, "name"),
      });
    } else if (resource === "subjects") {
      const code = stringField(body, "code");
      if (!code || duplicateCode(project.subjects, code)) {
        response = errorResponse(
          422,
          "SUBJECT_INVALID",
          "Kód předmětu chybí nebo již existuje.",
        );
        return;
      }
      project.subjects.push({
        id: idFor("subject", code),
        code,
        name: stringField(body, "name"),
        colorToken: null,
        defaultRoomTypeId: stringField(body, "defaultRoomTypeId") || null,
      });
    } else if (resource === "room-types") {
      const code = stringField(body, "code");
      if (!code || duplicateCode(project.roomTypes, code)) {
        response = errorResponse(
          422,
          "ROOM_TYPE_INVALID",
          "Kód typu učebny chybí nebo již existuje.",
        );
        return;
      }
      project.roomTypes.push({
        id: idFor("room-type", code),
        code,
        name: stringField(body, "name"),
      });
    } else if (resource === "rooms") {
      const code = stringField(body, "code");
      if (!code || duplicateCode(project.rooms, code)) {
        response = errorResponse(
          422,
          "ROOM_INVALID",
          "Kód učebny chybí nebo již existuje.",
        );
        return;
      }
      project.rooms.push({
        id: idFor("room", code),
        code,
        name: stringField(body, "name"),
        capacity: nullableNumber(body, "capacity"),
        roomTypeId: stringField(body, "roomTypeId") || null,
      });
    } else if (resource === "assignments") {
      const assignmentCode = stringField(body, "assignmentCode");
      if (
        !assignmentCode ||
        project.assignments.some(
          (item) =>
            item.assignmentCode.toLocaleLowerCase("cs-CZ") ===
            assignmentCode.toLocaleLowerCase("cs-CZ"),
        )
      ) {
        response = errorResponse(
          422,
          "ASSIGNMENT_INVALID",
          "Kód výukové vazby chybí nebo již existuje.",
        );
        return;
      }
      const teacherId = stringField(body, "teacherId");
      const classId = stringField(body, "classId");
      const subjectId = stringField(body, "subjectId");
      if (
        !project.teachers.some((item) => item.id === teacherId) ||
        !project.classes.some((item) => item.id === classId) ||
        !project.subjects.some((item) => item.id === subjectId)
      ) {
        response = errorResponse(
          422,
          "ASSIGNMENT_REFERENCE_INVALID",
          "Výuková vazba odkazuje na neexistující položku.",
        );
        return;
      }
      project.assignments.push({
        id: idFor("assignment", assignmentCode),
        assignmentCode,
        classId,
        additionalClassIds: Array.isArray(body.additionalClassIds)
          ? body.additionalClassIds.filter(
              (item): item is string =>
                typeof item === "string" &&
                item !== classId &&
                project.classes.some((schoolClass) => schoolClass.id === item),
            )
          : [],
        subjectId,
        teacherId,
        group: stringField(body, "group") as LocalAssignment["group"],
        weeklyPeriods: Number(body.weeklyPeriods),
        lessonShape: stringField(
          body,
          "lessonShape",
        ) as LocalAssignment["lessonShape"],
        doublePeriodsCount: Number(body.doublePeriodsCount ?? 0),
        requiredRoomId: stringField(body, "requiredRoomId") || null,
        requiredRoomTypeId: null,
        maxPerDay: nullableNumber(body, "maxPerDay"),
        minDayGap: nullableNumber(body, "minDayGap"),
      });
    } else {
      const entityType = stringField(
        body,
        "entityType",
      ) as LocalAvailability["entityType"];
      const entityId = stringField(body, "entityId");
      const exists =
        entityType === "TEACHER"
          ? project.teachers.some((item) => item.id === entityId)
          : entityType === "CLASS"
            ? project.classes.some((item) => item.id === entityId)
            : project.rooms.some((item) => item.id === entityId);
      if (!exists) {
        response = errorResponse(
          422,
          "AVAILABILITY_REFERENCE_INVALID",
          "Pravidlo odkazuje na neexistující položku.",
        );
        return;
      }
      project.availability.push({
        id: crypto.randomUUID(),
        entityType,
        entityId,
        dayOfWeek: Number(body.dayOfWeek),
        period: Number(body.period),
        kind: stringField(body, "kind") as LocalAvailability["kind"],
        weight: nullableNumber(body, "weight"),
        reason: stringField(body, "reason") || null,
      });
    }

    project.version += 1;
    response = jsonResponse({ schoolYearVersion: project.version }, 201);
  });
  return (
    response ??
    errorResponse(500, "LOCAL_WRITE_FAILED", "Položku se nepodařilo uložit.")
  );
}

async function deleteResource(
  resource: ResourceName,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  let response: Response | null = null;
  await mutateProject((project) => {
    response = checkExpectedVersion(project, body);
    if (response) return;

    if (
      resource === "teachers" &&
      project.assignments.some((item) => item.teacherId === id)
    ) {
      response = errorResponse(
        409,
        "RESOURCE_IN_USE",
        "Učitel je použitý ve výukové vazbě.",
      );
      return;
    }
    if (
      resource === "classes" &&
      project.assignments.some(
        (item) => item.classId === id || item.additionalClassIds.includes(id),
      )
    ) {
      response = errorResponse(
        409,
        "RESOURCE_IN_USE",
        "Třída je použitá ve výukové vazbě.",
      );
      return;
    }
    if (
      resource === "subjects" &&
      project.assignments.some((item) => item.subjectId === id)
    ) {
      response = errorResponse(
        409,
        "RESOURCE_IN_USE",
        "Předmět je použitý ve výukové vazbě.",
      );
      return;
    }
    if (
      resource === "rooms" &&
      project.assignments.some((item) => item.requiredRoomId === id)
    ) {
      response = errorResponse(
        409,
        "RESOURCE_IN_USE",
        "Učebna je použitá ve výukové vazbě.",
      );
      return;
    }
    if (
      resource === "room-types" &&
      (project.rooms.some((item) => item.roomTypeId === id) ||
        project.subjects.some((item) => item.defaultRoomTypeId === id))
    ) {
      response = errorResponse(
        409,
        "RESOURCE_IN_USE",
        "Typ učebny je stále používaný.",
      );
      return;
    }

    if (resource === "teachers") {
      project.teachers = project.teachers.filter((item) => item.id !== id);
    } else if (resource === "classes") {
      project.classes = project.classes.filter((item) => item.id !== id);
    } else if (resource === "subjects") {
      project.subjects = project.subjects.filter((item) => item.id !== id);
    } else if (resource === "room-types") {
      project.roomTypes = project.roomTypes.filter((item) => item.id !== id);
    } else if (resource === "rooms") {
      project.rooms = project.rooms.filter((item) => item.id !== id);
    } else if (resource === "assignments") {
      project.assignments = project.assignments.filter(
        (item) => item.id !== id,
      );
      project.fixedLessons = project.fixedLessons.filter(
        (item) => item.assignmentId !== id,
      );
    } else {
      project.availability = project.availability.filter(
        (item) => item.id !== id,
      );
    }
    project.version += 1;
    response = jsonResponse({ schoolYearVersion: project.version });
  });
  return (
    response ??
    errorResponse(
      500,
      "LOCAL_DELETE_FAILED",
      "Položku se nepodařilo odstranit.",
    )
  );
}

function addSchoolYearMismatch(
  analysis: ImportAnalysis,
  project: LocalProject,
): ImportAnalysis {
  if (
    !analysis.payload ||
    analysis.payload.settings.school_year === project.label
  ) {
    return analysis;
  }
  return {
    ...analysis,
    status: "VALIDATION_FAILED",
    payload: null,
    issues: [
      {
        severity: "ERROR",
        sheet: "Nastavení",
        row: 2,
        column: "school_year",
        code: "SCHOOL_YEAR_LABEL_MISMATCH",
        message: `Soubor je určen pro ${analysis.payload.settings.school_year}, aktuální školní rok je ${project.label}.`,
        rawValue: analysis.payload.settings.school_year,
        suggestion:
          "Použijte správnou šablonu nebo upravte školní rok v nastavení.",
      },
      ...analysis.issues,
    ],
    summary: { ...analysis.summary, errors: analysis.summary.errors + 1 },
  };
}

async function analyzeImport(init?: RequestInit): Promise<Response> {
  const project = await getLocalProject();
  if (!(init?.body instanceof FormData)) {
    return errorResponse(400, "IMPORT_FILE_MISSING", "Vyberte soubor .xlsx.");
  }
  const uploaded = init.body.get("file");
  if (!(uploaded instanceof File)) {
    return errorResponse(400, "IMPORT_FILE_MISSING", "Vyberte soubor .xlsx.");
  }
  if (uploaded.size === 0 || uploaded.size > 10 * 1024 * 1024) {
    return errorResponse(
      400,
      "IMPORT_FILE_SIZE_INVALID",
      "Soubor musí mít nejvýše 10 MB a nesmí být prázdný.",
    );
  }
  if (!uploaded.name.toLocaleLowerCase("cs-CZ").endsWith(".xlsx")) {
    return errorResponse(
      400,
      "IMPORT_FILE_EXTENSION_INVALID",
      "Podporovaný je pouze formát .xlsx.",
    );
  }
  const buffer = await uploaded.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return errorResponse(
      400,
      "IMPORT_FILE_CONTENT_INVALID",
      "Obsah souboru neodpovídá formátu .xlsx.",
    );
  }
  const fileHash = await sha256Hex(buffer);
  const existing = project.importBatches.find(
    (batch) =>
      batch.fileHash === fileHash &&
      batch.expectedProjectVersion === project.version &&
      ["READY", "VALIDATION_FAILED", "APPLIED"].includes(batch.status),
  );
  if (existing) {
    return jsonResponse({
      importBatchId: existing.id,
      status: existing.status,
      summary: existing.summary,
      issues: existing.issues,
      reused: true,
    });
  }

  const analysis = addSchoolYearMismatch(
    await analyzeClientImportWorkbook(buffer),
    project,
  );
  const batch: LocalImportBatch = {
    id: crypto.randomUUID(),
    fileName: uploaded.name,
    fileHash,
    status: analysis.status,
    expectedProjectVersion: project.version,
    summary: analysis.summary,
    issues: analysis.issues,
    payload: analysis.payload,
    createdAt: now(),
    appliedAt: null,
  };
  await mutateProject((next) => {
    next.importBatches.unshift(batch);
    next.importBatches = next.importBatches.slice(0, 20);
  });
  return jsonResponse(
    {
      importBatchId: batch.id,
      status: batch.status,
      summary: batch.summary,
      issues: batch.issues,
      reused: false,
    },
    201,
  );
}

function applyImportPayload(
  project: LocalProject,
  payload: ImportPayload,
): void {
  const roomTypeCodes = new Set(
    [
      ...payload.rooms.flatMap((item) =>
        item.room_type ? [item.room_type] : [],
      ),
      ...payload.subjects.flatMap((item) =>
        item.default_room_type ? [item.default_room_type] : [],
      ),
      ...payload.assignments.flatMap((item) =>
        item.required_room_type ? [item.required_room_type] : [],
      ),
    ].filter(Boolean),
  );
  const roomTypes = [...roomTypeCodes].sort().map((code) => ({
    id: idFor("room-type", code),
    code,
    name: code,
  }));
  const roomTypeByCode = new Map(roomTypes.map((item) => [item.code, item.id]));

  const teachers = payload.teachers.map((item) => ({
    id: idFor("teacher", item.teacher_code),
    code: item.teacher_code,
    firstName: item.first_name,
    lastName: item.last_name,
    targetWeeklyLoad: item.target_weekly_load,
    minWeeklyLoad: item.min_weekly_load,
    maxWeeklyLoad: item.max_weekly_load,
  }));
  const classes = payload.classes.map((item) => ({
    id: idFor("class", item.class_code),
    code: item.class_code,
    grade: item.grade,
    name: item.class_name,
  }));
  const subjects = payload.subjects.map((item) => ({
    id: idFor("subject", item.subject_code),
    code: item.subject_code,
    name: item.subject_name,
    colorToken: null,
    defaultRoomTypeId: item.default_room_type
      ? (roomTypeByCode.get(item.default_room_type) ?? null)
      : null,
  }));
  const rooms = payload.rooms.map((item) => ({
    id: idFor("room", item.room_code),
    code: item.room_code,
    name: item.room_name,
    capacity: item.capacity,
    roomTypeId: item.room_type
      ? (roomTypeByCode.get(item.room_type) ?? null)
      : null,
  }));
  const teacherByCode = new Map(teachers.map((item) => [item.code, item.id]));
  const classByCode = new Map(classes.map((item) => [item.code, item.id]));
  const subjectByCode = new Map(subjects.map((item) => [item.code, item.id]));
  const roomByCode = new Map(rooms.map((item) => [item.code, item.id]));

  const assignments = payload.assignments.map((item) => ({
    id: idFor("assignment", item.assignment_code),
    assignmentCode: item.assignment_code,
    classId: classByCode.get(item.class_code)!,
    additionalClassIds: item.additional_class_codes.map(
      (classCode) => classByCode.get(classCode)!,
    ),
    subjectId: subjectByCode.get(item.subject_code)!,
    teacherId: teacherByCode.get(item.teacher_code)!,
    group: item.group,
    weeklyPeriods: item.weekly_periods,
    lessonShape: item.lesson_shape,
    doublePeriodsCount: item.double_periods_count,
    requiredRoomId: item.required_room
      ? (roomByCode.get(item.required_room) ?? null)
      : null,
    requiredRoomTypeId: item.required_room_type
      ? (roomTypeByCode.get(item.required_room_type) ?? null)
      : null,
    maxPerDay: item.max_per_day,
    minDayGap: item.min_day_gap,
  }));
  const assignmentByCode = new Map(
    assignments.map((item) => [item.assignmentCode, item.id]),
  );

  project.periodsPerDay = [
    payload.settings.monday_periods,
    payload.settings.tuesday_periods,
    payload.settings.wednesday_periods,
    payload.settings.thursday_periods,
    payload.settings.friday_periods,
  ];
  project.teachers = teachers;
  project.classes = classes;
  project.subjects = subjects;
  project.roomTypes = roomTypes;
  project.rooms = rooms;
  project.assignments = assignments;
  project.availability = payload.availability.map((item) => {
    const entityId =
      item.entity_type === "TEACHER"
        ? teacherByCode.get(item.entity_code)
        : item.entity_type === "CLASS"
          ? classByCode.get(item.entity_code)
          : roomByCode.get(item.entity_code);
    return {
      id: crypto.randomUUID(),
      entityType: item.entity_type,
      entityId: entityId!,
      dayOfWeek: DAY_CODES.indexOf(item.day),
      period: item.period - 1,
      kind: item.kind,
      weight: item.weight,
      reason: item.reason,
    };
  });
  project.fixedLessons = payload.fixedLessons.map((item) => ({
    id: crypto.randomUUID(),
    assignmentId: assignmentByCode.get(item.assignment_code)!,
    blockIndex: item.block_index,
    dayOfWeek: DAY_CODES.indexOf(item.day),
    startPeriod: item.start_period - 1,
    duration: item.duration,
    roomId: item.room_code ? (roomByCode.get(item.room_code) ?? null) : null,
    locked: item.locked,
  }));
  project.generationRuns = [];
  project.timetableVersions = [];
}

async function applyImport(batchId: string): Promise<Response> {
  let response: Response | null = null;
  await mutateProject((project) => {
    const batch = project.importBatches.find((item) => item.id === batchId);
    if (!batch) {
      response = errorResponse(
        404,
        "IMPORT_BATCH_NOT_FOUND",
        "Import nebyl nalezen.",
      );
      return;
    }
    if (batch.status === "APPLIED") {
      response = jsonResponse({
        status: "APPLIED",
        appliedAt: batch.appliedAt,
      });
      return;
    }
    if (
      batch.status !== "READY" ||
      !batch.payload ||
      batch.issues.some((item) => item.severity === "ERROR")
    ) {
      response = errorResponse(
        422,
        "IMPORT_BATCH_NOT_READY",
        "Import obsahuje blokující chyby a nelze jej uložit.",
      );
      return;
    }
    if (batch.expectedProjectVersion !== project.version) {
      response = errorResponse(
        409,
        "SCHOOL_YEAR_VERSION_CONFLICT",
        "Data se od analýzy změnila. Soubor analyzujte znovu.",
      );
      return;
    }
    applyImportPayload(project, batch.payload);
    project.version += 1;
    batch.status = "APPLIED";
    batch.appliedAt = now();
    response = jsonResponse({
      status: "APPLIED",
      appliedAt: batch.appliedAt,
      schoolYearVersion: project.version,
    });
  });
  return (
    response ??
    errorResponse(500, "IMPORT_APPLY_FAILED", "Import se nepodařilo uložit.")
  );
}

function solverEndpoint(): string {
  const configured = process.env.NEXT_PUBLIC_SOLVER_URL?.replace(/\/$/, "");
  return `${configured || "/solver"}/solve`;
}

async function createGenerationRun(
  body: Record<string, unknown>,
): Promise<Response> {
  const timeLimitSeconds = Number(body.timeLimitSeconds ?? 60);
  if (
    !Number.isInteger(timeLimitSeconds) ||
    timeLimitSeconds < 1 ||
    timeLimitSeconds > 300
  ) {
    return errorResponse(
      422,
      "GENERATION_REQUEST_INVALID",
      "Časový limit musí být mezi 1 a 300 sekundami.",
    );
  }
  const project = await getLocalProject();
  const snapshot = projectSnapshot(project, timeLimitSeconds);
  const readiness = evaluateReadiness(snapshot);
  if (!readiness.ready) {
    return errorResponse(
      422,
      "SCHOOL_YEAR_NOT_READY",
      "Vstupní data nejsou připravená pro tvorbu rozvrhu.",
      { readiness },
    );
  }

  const runId = crypto.randomUUID();
  const createdAt = now();
  const inputSnapshotHash = await sha256Hex(JSON.stringify(snapshot));
  await mutateProject((next) => {
    next.generationRuns.unshift({
      id: runId,
      status: "RUNNING",
      inputSnapshotHash,
      qualityScore: null,
      objectiveValue: null,
      explanation: null,
      candidateVersionId: null,
      createdAt,
      startedAt: createdAt,
      finishedAt: null,
    });
  });

  try {
    const solverResponse = await fetch(solverEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
      signal: AbortSignal.timeout((timeLimitSeconds + 30) * 1000),
    });
    const solverPayload = (await solverResponse.json()) as SolverResponse & {
      detail?: unknown;
    };
    if (!solverResponse.ok) {
      await mutateProject((next) => {
        const run = next.generationRuns.find((item) => item.id === runId);
        if (!run) return;
        run.status = solverResponse.status === 422 ? "INFEASIBLE" : "FAILED";
        run.explanation = solverPayload.detail ?? solverPayload;
        run.finishedAt = now();
      });
      return jsonResponse(
        { generationRunId: runId, status: "QUEUED", inputSnapshotHash },
        202,
      );
    }

    const hardIssues = validateSchedule(snapshot, solverPayload.lessons);
    const score = scoreSchedule(snapshot, solverPayload.lessons);
    if (hardIssues.length || !score.valid || score.total == null) {
      await mutateProject((next) => {
        const run = next.generationRuns.find((item) => item.id === runId);
        if (!run) return;
        run.status = "FAILED";
        run.explanation = { hardIssues, score };
        run.finishedAt = now();
      });
      return jsonResponse(
        { generationRunId: runId, status: "QUEUED", inputSnapshotHash },
        202,
      );
    }

    await mutateProject((next) => {
      const run = next.generationRuns.find((item) => item.id === runId);
      if (!run) return;
      const versionId = crypto.randomUUID();
      const versionNumber =
        Math.max(
          0,
          ...next.timetableVersions.map((item) => item.versionNumber),
        ) + 1;
      const timestamp = now();
      const lessons = solverPayload.lessons.map((lesson) => ({
        ...lesson,
        id: `lesson:${versionId}:${lesson.block_id}`,
        locked: Boolean(lesson.locked),
        manually_changed: false,
      }));
      next.timetableVersions.unshift({
        id: versionId,
        name: `Návrh ${versionNumber}`,
        versionNumber,
        revision: 1,
        isCurrent: false,
        qualityScore: score.total,
        scoreBreakdown: score.categories,
        incidentReport: score.incidents,
        snapshot,
        lessons,
        undoStack: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      run.status = ["OPTIMAL", "FEASIBLE"].includes(solverPayload.status)
        ? (solverPayload.status as GenerationStatus)
        : "FEASIBLE";
      run.qualityScore = score.total;
      run.objectiveValue = solverPayload.objective_value;
      run.explanation = {
        diagnostics: solverPayload.diagnostics ?? [],
        solverStats: solverPayload.solver_stats ?? {},
      };
      run.candidateVersionId = versionId;
      run.finishedAt = timestamp;
    });
  } catch (error) {
    await mutateProject((next) => {
      const run = next.generationRuns.find((item) => item.id === runId);
      if (!run) return;
      run.status = "FAILED";
      run.explanation = {
        message:
          error instanceof Error ? error.message : "Neznámá chyba výpočtu.",
      };
      run.finishedAt = now();
    });
  }

  return jsonResponse(
    { generationRunId: runId, status: "QUEUED", inputSnapshotHash },
    202,
  );
}

function generationRunView(project: LocalProject, run: LocalGenerationRun) {
  const version = run.candidateVersionId
    ? project.timetableVersions.find(
        (item) => item.id === run.candidateVersionId,
      )
    : null;
  return {
    ...run,
    candidateVersion: version
      ? {
          id: version.id,
          name: version.name,
          qualityScore: version.qualityScore,
        }
      : null,
  };
}

function timetableView(
  project: LocalProject,
  version: LocalTimetableVersion,
  view: "class" | "teacher",
  entityId: string | null,
) {
  const entities =
    view === "class"
      ? project.classes.map((item) => ({
          id: item.id,
          code: item.code,
          name: item.name,
        }))
      : project.teachers.map((item) => ({
          id: item.id,
          code: item.code,
          name: `${item.firstName} ${item.lastName}`.trim(),
        }));
  const assignmentById = new Map(
    project.assignments.map((item) => [item.id, item]),
  );
  const lessons = version.lessons
    .filter((lesson) => {
      if (!entityId) return true;
      const assignment = assignmentById.get(lesson.assignment_id);
      return view === "class"
        ? assignment != null &&
            [assignment.classId, ...assignment.additionalClassIds].includes(
              entityId,
            )
        : assignment?.teacherId === entityId;
    })
    .map((lesson) => {
      const assignment = assignmentById.get(lesson.assignment_id);
      const teacher = project.teachers.find(
        (item) => item.id === assignment?.teacherId,
      );
      const schoolClass = project.classes.find(
        (item) => item.id === assignment?.classId,
      );
      const schoolClasses = assignment
        ? [assignment.classId, ...assignment.additionalClassIds]
            .map((classId) =>
              project.classes.find((item) => item.id === classId),
            )
            .filter((item): item is LocalClass => Boolean(item))
        : [];
      const subject = project.subjects.find(
        (item) => item.id === assignment?.subjectId,
      );
      const room = project.rooms.find((item) => item.id === lesson.room_id);
      return {
        ...lesson,
        teacher: teacher
          ? {
              id: teacher.id,
              code: teacher.code,
              name: `${teacher.firstName} ${teacher.lastName}`.trim(),
            }
          : undefined,
        schoolClasses: schoolClasses.map((item) => ({
          id: item.id,
          code: item.code,
          name: item.name,
        })),
        schoolClass: schoolClass
          ? {
              id: schoolClass.id,
              code: schoolClass.code,
              name: schoolClass.name,
            }
          : undefined,
        subject: subject
          ? {
              id: subject.id,
              code: subject.code,
              name: subject.name,
              colorToken: subject.colorToken,
            }
          : undefined,
        room: room ? { id: room.id, code: room.code, name: room.name } : null,
      };
    });
  return {
    version: {
      id: version.id,
      name: version.name,
      revision: version.revision,
      isCurrent: version.isCurrent,
      qualityScore: version.qualityScore,
      scoreBreakdown: version.scoreBreakdown,
      incidentReport: version.incidentReport,
    },
    periodsPerDay: project.periodsPerDay,
    entities,
    rooms: project.rooms.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
    })),
    lessons,
  };
}

function versionConflict(
  version: LocalTimetableVersion,
  expectedRevision: unknown,
): Response | null {
  const expected = Number(expectedRevision);
  if (!Number.isInteger(expected) || expected !== version.revision) {
    return errorResponse(
      409,
      "TIMETABLE_VERSION_CONFLICT",
      "Rozvrh byl mezitím změněn. Obnovte stránku.",
      {
        expectedRevision: expected,
        actualRevision: version.revision,
      },
    );
  }
  return null;
}

async function mutateVersion(
  versionId: string,
  mutation: (project: LocalProject, version: LocalTimetableVersion) => Response,
): Promise<Response> {
  let response: Response | null = null;
  await mutateProject((project) => {
    const version = project.timetableVersions.find(
      (item) => item.id === versionId,
    );
    if (!version) {
      response = errorResponse(
        404,
        "TIMETABLE_VERSION_NOT_FOUND",
        "Verze rozvrhu nebyla nalezena.",
      );
      return;
    }
    response = mutation(project, version);
  });
  return (
    response ??
    errorResponse(500, "TIMETABLE_WRITE_FAILED", "Rozvrh se nepodařilo změnit.")
  );
}

export async function exportLocalBackup(): Promise<Blob> {
  const project = await getLocalProject();
  const checksum = await sha256Hex(JSON.stringify(project));
  const envelope: BackupEnvelope = {
    format: "rozvrhar-local-backup",
    version: 1,
    exportedAt: now(),
    checksum,
    project,
  };
  return new Blob([JSON.stringify(envelope, null, 2)], {
    type: "application/json;charset=utf-8",
  });
}

export async function importLocalBackup(file: File): Promise<LocalProject> {
  if (file.size === 0 || file.size > 25 * 1024 * 1024) {
    throw new Error("Záloha je prázdná nebo větší než 25 MB.");
  }
  const parsed = JSON.parse(await file.text()) as Partial<BackupEnvelope>;
  if (
    parsed.format !== "rozvrhar-local-backup" ||
    parsed.version !== 1 ||
    !parsed.project ||
    parsed.project.schemaVersion !== 1 ||
    parsed.project.id !== LOCAL_SCHOOL_YEAR_ID
  ) {
    throw new Error("Soubor není platná záloha aplikace Rozvrhář.");
  }
  const checksum = await sha256Hex(JSON.stringify(parsed.project));
  if (checksum !== parsed.checksum) {
    throw new Error(
      "Kontrolní součet zálohy nesouhlasí. Soubor může být poškozený.",
    );
  }
  const project = structuredClone(parsed.project);
  project.updatedAt = now();
  await writeStoredProject(project);
  return project;
}

export async function resetLocalProject(): Promise<LocalProject> {
  const project = createDefaultProject();
  await writeStoredProject(project);
  return project;
}

export async function updateLocalProjectSettings(input: {
  schoolName: string;
  label: string;
  periodsPerDay: number[];
}): Promise<LocalProject> {
  await mutateProject((project) => {
    if (!input.schoolName.trim()) throw new Error("Název školy je povinný.");
    if (!/^\d{4}\/\d{4}$/.test(input.label)) {
      throw new Error("Školní rok musí mít formát 2026/2027.");
    }
    if (
      input.periodsPerDay.length !== 5 ||
      input.periodsPerDay.some(
        (periods) => !Number.isInteger(periods) || periods < 1 || periods > 16,
      )
    ) {
      throw new Error(
        "Počet hodin musí být pro každý pracovní den mezi 1 a 16.",
      );
    }
    project.schoolName = input.schoolName.trim();
    project.label = input.label;
    project.periodsPerDay = [...input.periodsPerDay];
    project.version += 1;
  });
  return getLocalProject();
}

export async function localApiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const url = new URL(rawUrl, window.location.origin);
  const method = (init?.method ?? "GET").toUpperCase();
  const path = url.pathname;
  const project = await getLocalProject();

  if (path === "/api/school-years" && method === "GET") {
    return jsonResponse({ items: [schoolYearView(project)] });
  }
  if (
    path === `/api/school-years/${LOCAL_SCHOOL_YEAR_ID}` &&
    method === "GET"
  ) {
    return jsonResponse(schoolYearView(project));
  }
  if (
    path === `/api/school-years/${LOCAL_SCHOOL_YEAR_ID}/readiness` &&
    method === "GET"
  ) {
    return jsonResponse(evaluateReadiness(projectSnapshot(project)));
  }

  const resourceMatch = path.match(
    new RegExp(
      `^/api/school-years/${LOCAL_SCHOOL_YEAR_ID}/(teachers|classes|subjects|room-types|rooms|assignments|availability)(?:/([^/]+))?$`,
    ),
  );
  if (resourceMatch) {
    const resource = resourceMatch[1] as ResourceName;
    const id = resourceMatch[2] ? decodeURIComponent(resourceMatch[2]) : null;
    if (method === "GET" && !id) {
      return jsonResponse({ items: resourceItems(project, resource) });
    }
    if (method === "POST" && !id) {
      return createResource(resource, readJsonBody(init));
    }
    if (method === "DELETE" && id) {
      return deleteResource(resource, id, readJsonBody(init));
    }
  }

  if (
    path === `/api/school-years/${LOCAL_SCHOOL_YEAR_ID}/imports` &&
    method === "POST"
  ) {
    return analyzeImport(init);
  }
  const importApplyMatch = path.match(
    new RegExp(
      `^/api/school-years/${LOCAL_SCHOOL_YEAR_ID}/imports/([^/]+)/apply$`,
    ),
  );
  if (importApplyMatch && method === "POST") {
    return applyImport(decodeURIComponent(importApplyMatch[1]!));
  }

  if (
    path === `/api/school-years/${LOCAL_SCHOOL_YEAR_ID}/generation-runs` &&
    method === "GET"
  ) {
    return jsonResponse({
      items: project.generationRuns.map((run) =>
        generationRunView(project, run),
      ),
    });
  }
  if (
    path === `/api/school-years/${LOCAL_SCHOOL_YEAR_ID}/generation-runs` &&
    method === "POST"
  ) {
    return createGenerationRun(readJsonBody(init));
  }

  const runMatch = path.match(/^\/api\/generation-runs\/([^/]+)$/);
  if (runMatch) {
    const runId = decodeURIComponent(runMatch[1]!);
    const run = project.generationRuns.find((item) => item.id === runId);
    if (!run) {
      return errorResponse(
        404,
        "GENERATION_RUN_NOT_FOUND",
        "Výpočet nebyl nalezen.",
      );
    }
    if (method === "GET") return jsonResponse(generationRunView(project, run));
    if (method === "DELETE") {
      if (!["QUEUED", "RUNNING"].includes(run.status)) {
        return errorResponse(
          409,
          "GENERATION_RUN_NOT_CANCELLABLE",
          "Dokončený výpočet již nelze zrušit.",
        );
      }
      return mutateProject((next) => {
        const target = next.generationRuns.find((item) => item.id === runId)!;
        target.status = "CANCELLED";
        target.finishedAt = now();
        return jsonResponse({ status: "CANCELLED" });
      });
    }
  }

  const timetableMatch = path.match(/^\/api\/timetable-versions\/([^/]+)$/);
  if (timetableMatch && method === "GET") {
    const versionId = decodeURIComponent(timetableMatch[1]!);
    const version = project.timetableVersions.find(
      (item) => item.id === versionId,
    );
    if (!version) {
      return errorResponse(
        404,
        "TIMETABLE_VERSION_NOT_FOUND",
        "Verze rozvrhu nebyla nalezena.",
      );
    }
    const view =
      url.searchParams.get("view") === "teacher" ? "teacher" : "class";
    return jsonResponse(
      timetableView(project, version, view, url.searchParams.get("entityId")),
    );
  }

  const lockMatch = path.match(/^\/api\/timetable-versions\/([^/]+)\/locks$/);
  if (lockMatch && ["POST", "DELETE"].includes(method)) {
    const versionId = decodeURIComponent(lockMatch[1]!);
    const body = readJsonBody(init);
    return mutateVersion(versionId, (_project, version) => {
      const conflict = versionConflict(version, body.expectedRevision);
      if (conflict) return conflict;
      const ids = Array.isArray(body.lessonIds)
        ? body.lessonIds.filter(
            (item): item is string => typeof item === "string",
          )
        : [];
      version.lessons = version.lessons.map((lesson) =>
        lesson.id && ids.includes(lesson.id)
          ? { ...lesson, locked: method === "POST" }
          : lesson,
      );
      version.revision += 1;
      version.updatedAt = now();
      return jsonResponse({ revision: version.revision });
    });
  }

  const moveValidateMatch = path.match(
    /^\/api\/timetable-versions\/([^/]+)\/moves\/validate$/,
  );
  if (moveValidateMatch && method === "POST") {
    const versionId = decodeURIComponent(moveValidateMatch[1]!);
    const version = project.timetableVersions.find(
      (item) => item.id === versionId,
    );
    if (!version) {
      return errorResponse(
        404,
        "TIMETABLE_VERSION_NOT_FOUND",
        "Verze rozvrhu nebyla nalezena.",
      );
    }
    const body = readJsonBody(init);
    const conflict = versionConflict(version, body.expectedRevision);
    if (conflict) return conflict;
    const result = validateMove(version.snapshot, version.lessons, {
      lesson_id: stringField(body, "lessonId"),
      target_day: Number(body.targetDay),
      target_period: Number(body.targetPeriod),
      target_room_id: stringField(body, "targetRoomId") || null,
      expected_version: version.revision,
    });
    return jsonResponse(result);
  }

  const moveMatch = path.match(/^\/api\/timetable-versions\/([^/]+)\/moves$/);
  if (moveMatch && method === "POST") {
    const versionId = decodeURIComponent(moveMatch[1]!);
    const body = readJsonBody(init);
    return mutateVersion(versionId, (_project, version) => {
      const conflict = versionConflict(version, body.expectedRevision);
      if (conflict) return conflict;
      const lessonId = stringField(body, "lessonId");
      const result = validateMove(version.snapshot, version.lessons, {
        lesson_id: lessonId,
        target_day: Number(body.targetDay),
        target_period: Number(body.targetPeriod),
        target_room_id: stringField(body, "targetRoomId") || null,
        expected_version: version.revision,
      });
      if (!result.valid) {
        return errorResponse(
          422,
          "TIMETABLE_MOVE_CONFLICT",
          "Přesun porušuje pevná pravidla.",
          {
            issues: result.issues,
          },
        );
      }
      version.undoStack.push(structuredClone(version.lessons));
      version.undoStack = version.undoStack.slice(-30);
      version.lessons = result.preview.map((lesson) =>
        lesson.id === lessonId
          ? { ...lesson, origin: "MANUAL", manually_changed: true }
          : lesson,
      );
      const score = scoreSchedule(version.snapshot, version.lessons);
      version.qualityScore = score.total;
      version.scoreBreakdown = score.valid ? score.categories : null;
      version.incidentReport = score.incidents;
      version.revision += 1;
      version.updatedAt = now();
      return jsonResponse({
        revision: version.revision,
        qualityScore: version.qualityScore,
      });
    });
  }

  const undoMatch = path.match(/^\/api\/timetable-versions\/([^/]+)\/undo$/);
  if (undoMatch && method === "POST") {
    const versionId = decodeURIComponent(undoMatch[1]!);
    const body = readJsonBody(init);
    return mutateVersion(versionId, (_project, version) => {
      const conflict = versionConflict(version, body.expectedRevision);
      if (conflict) return conflict;
      const previous = version.undoStack.pop();
      if (!previous) {
        return errorResponse(
          409,
          "TIMETABLE_UNDO_EMPTY",
          "Není dostupná žádná změna k vrácení.",
        );
      }
      version.lessons = previous;
      const score = scoreSchedule(version.snapshot, version.lessons);
      version.qualityScore = score.total;
      version.scoreBreakdown = score.valid ? score.categories : null;
      version.incidentReport = score.incidents;
      version.revision += 1;
      version.updatedAt = now();
      return jsonResponse({ revision: version.revision });
    });
  }

  const acceptMatch = path.match(
    /^\/api\/timetable-versions\/([^/]+)\/accept$/,
  );
  if (acceptMatch && method === "POST") {
    const versionId = decodeURIComponent(acceptMatch[1]!);
    const body = readJsonBody(init);
    return mutateVersion(versionId, (next, version) => {
      const conflict = versionConflict(version, body.expectedRevision);
      if (conflict) return conflict;
      next.timetableVersions.forEach((item) => {
        item.isCurrent = item.id === version.id;
      });
      return jsonResponse({ isCurrent: true, revision: version.revision });
    });
  }

  return errorResponse(
    404,
    "LOCAL_ROUTE_NOT_FOUND",
    `Lokální operace ${method} ${path} není podporovaná.`,
  );
}
