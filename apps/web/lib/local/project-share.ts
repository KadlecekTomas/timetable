import {
  getLocalProject,
  replaceLocalProjectAtomically,
  resetLocalProject,
  type LocalProject,
} from "@/lib/local/api";
import { PHYSICAL_EDUCATION_EXTERNAL_OCCUPANCY_STORAGE_KEY } from "@/lib/local/physical-education-external-occupancy";

export const BROWSER_PROJECT_SHARE_FORMAT = "rozvrhar-browser-project";
export const BROWSER_PROJECT_SHARE_VERSION = 1;
export const BROWSER_PROJECT_SHARE_HASH_PREFIX = "#project=";
export const BROWSER_PROJECT_SHARE_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const BROWSER_PROJECT_SHARE_MAX_LINK_LENGTH = 450_000;

export const BROWSER_PROJECT_LOCAL_STORAGE_KEYS = [
  "rozvrhar:staffing-plan:v1",
  "rozvrhar:teaching-plan:v1",
  "rozvrhar:staffing-allocation-draft:v1",
  "rozvrhar:school-curriculum:v1",
  "rozvrhar:teaching-plan-workload-credits:v1",
  "rozvrhar:teaching-plan-allocation-draft-applied:v1",
  "rozvrhar:teaching-plan-shared:v1",
  "rozvrhar:teaching-plan-split-periods:v1",
  PHYSICAL_EDUCATION_EXTERNAL_OCCUPANCY_STORAGE_KEY,
] as const;

export const BROWSER_PROJECT_SESSION_STORAGE_KEYS = [
  "rozvrhar:teaching-plan-import-review:v1",
] as const;

export interface BrowserProjectShareData {
  localStorage: Record<string, string | null>;
  project: LocalProject;
}

export interface BrowserProjectShareEnvelope {
  format: typeof BROWSER_PROJECT_SHARE_FORMAT;
  version: typeof BROWSER_PROJECT_SHARE_VERSION;
  exportedAt: string;
  checksum: string;
  data: BrowserProjectShareData;
}

export interface BrowserProjectShareSummary {
  teachers: number;
  classes: number;
  teachingRows: number;
  solverTeachers: number;
  solverClasses: number;
  subjects: number;
  assignments: number;
  timetableVersions: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(`${normalized}${padding}`);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    ownedArrayBuffer(utf8(value)),
  );
  return [...new Uint8Array(digest)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([ownedArrayBuffer(bytes)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "Tento prohlížeč neumí rozbalit sdílený projekt. Použijte aktuální Chrome, Edge, Firefox nebo Safari.",
    );
  }
  const stream = new Blob([ownedArrayBuffer(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function normalizeShareData(value: unknown): BrowserProjectShareData {
  if (!isRecord(value)) {
    throw new Error("Sdílený projekt nemá platnou strukturu pracovních dat.");
  }
  const localStorageValue = value.localStorage;
  if (!isRecord(localStorageValue)) {
    throw new Error("Sdílený projekt nemá platnou strukturu pracovních dat.");
  }
  if (!isRecord(value.project)) {
    throw new Error("Sdílený projekt neobsahuje lokální projekt rozvrhu.");
  }

  const project = value.project as unknown as LocalProject;
  if (
    project.schemaVersion !== 1 ||
    project.id !== "local-school-year" ||
    !Array.isArray(project.teachers) ||
    !Array.isArray(project.classes) ||
    !Array.isArray(project.subjects) ||
    !Array.isArray(project.assignments) ||
    !Array.isArray(project.timetableVersions)
  ) {
    throw new Error("Sdílený projekt používá nepodporovanou verzi dat.");
  }

  const localStorage = Object.fromEntries(
    BROWSER_PROJECT_LOCAL_STORAGE_KEYS.map((key) => {
      const item = localStorageValue[key];
      if (item !== null && item !== undefined && typeof item !== "string") {
        throw new Error(`Sdílený projekt má neplatnou hodnotu ${key}.`);
      }
      return [key, typeof item === "string" ? item : null];
    }),
  );

  return { localStorage, project };
}

function parseJsonCount(raw: string | null, property: string): number {
  if (!raw) return 0;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const items = value[property];
    return Array.isArray(items) ? items.length : 0;
  } catch {
    return 0;
  }
}

export function summarizeBrowserProjectShare(
  envelope: BrowserProjectShareEnvelope,
): BrowserProjectShareSummary {
  const staffing = envelope.data.localStorage["rozvrhar:staffing-plan:v1"];
  const teaching = envelope.data.localStorage["rozvrhar:teaching-plan:v1"];
  const project = envelope.data.project;
  return {
    teachers: parseJsonCount(staffing, "teachers"),
    classes: parseJsonCount(teaching, "classes"),
    teachingRows: parseJsonCount(teaching, "rows"),
    solverTeachers: project.teachers.length,
    solverClasses: project.classes.length,
    subjects: project.subjects.length,
    assignments: project.assignments.length,
    timetableVersions: project.timetableVersions.length,
  };
}

export async function createBrowserProjectShareEnvelope(
  data: BrowserProjectShareData,
  exportedAt = new Date().toISOString(),
): Promise<BrowserProjectShareEnvelope> {
  const normalized = normalizeShareData(data);
  const checksum = await sha256Hex(JSON.stringify(normalized));
  return {
    format: BROWSER_PROJECT_SHARE_FORMAT,
    version: BROWSER_PROJECT_SHARE_VERSION,
    exportedAt,
    checksum,
    data: normalized,
  };
}

export async function captureBrowserProjectShare(): Promise<BrowserProjectShareEnvelope> {
  if (typeof window === "undefined") {
    throw new Error("Projekt lze sdílet pouze v prohlížeči.");
  }
  const project = await getLocalProject();
  const localStorage = Object.fromEntries(
    BROWSER_PROJECT_LOCAL_STORAGE_KEYS.map((key) => [
      key,
      window.localStorage.getItem(key),
    ]),
  );
  return createBrowserProjectShareEnvelope({ localStorage, project });
}

export async function validateBrowserProjectShareEnvelope(
  value: unknown,
): Promise<BrowserProjectShareEnvelope> {
  if (!isRecord(value)) {
    throw new Error("Soubor nebo odkaz neobsahuje platný projekt Rozvrháře.");
  }
  if (
    value.format !== BROWSER_PROJECT_SHARE_FORMAT ||
    value.version !== BROWSER_PROJECT_SHARE_VERSION ||
    typeof value.exportedAt !== "string" ||
    typeof value.checksum !== "string"
  ) {
    throw new Error("Formát sdíleného projektu není podporovaný.");
  }
  const data = normalizeShareData(value.data);
  const checksum = await sha256Hex(JSON.stringify(data));
  if (checksum !== value.checksum) {
    throw new Error(
      "Kontrolní součet nesouhlasí. Odkaz nebo soubor je poškozený či neúplný.",
    );
  }
  return {
    format: BROWSER_PROJECT_SHARE_FORMAT,
    version: BROWSER_PROJECT_SHARE_VERSION,
    exportedAt: value.exportedAt,
    checksum,
    data,
  };
}

export async function encodeBrowserProjectShare(
  envelope: BrowserProjectShareEnvelope,
  options: { compress?: boolean } = {},
): Promise<string> {
  const verified = await validateBrowserProjectShareEnvelope(envelope);
  const bytes = utf8(JSON.stringify(verified));
  if (options.compress !== false) {
    const compressed = await gzip(bytes);
    if (compressed && compressed.byteLength < bytes.byteLength) {
      return `g.${bytesToBase64Url(compressed)}`;
    }
  }
  return `j.${bytesToBase64Url(bytes)}`;
}

export async function decodeBrowserProjectShare(
  payload: string,
): Promise<BrowserProjectShareEnvelope> {
  const separator = payload.indexOf(".");
  if (separator < 1) {
    throw new Error("Sdílený odkaz je neúplný.");
  }
  const mode = payload.slice(0, separator);
  const encoded = payload.slice(separator + 1);
  let bytes = base64UrlToBytes(encoded);
  if (mode === "g") bytes = await gunzip(bytes);
  else if (mode !== "j")
    throw new Error("Sdílený odkaz používá neznámý formát.");
  const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  return validateBrowserProjectShareEnvelope(value);
}

export function browserProjectShareBlob(
  envelope: BrowserProjectShareEnvelope,
): Blob {
  return new Blob([JSON.stringify(envelope, null, 2)], {
    type: "application/json;charset=utf-8",
  });
}

export async function readBrowserProjectShareFile(
  file: File,
): Promise<BrowserProjectShareEnvelope> {
  if (file.size > BROWSER_PROJECT_SHARE_MAX_FILE_BYTES) {
    throw new Error("Soubor je příliš velký. Maximum je 10 MB.");
  }
  const value = JSON.parse(await file.text()) as unknown;
  return validateBrowserProjectShareEnvelope(value);
}

function dispatchBrowserProjectWorkingDataChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("rozvrhar:staffing-plan-changed"));
  window.dispatchEvent(new Event("rozvrhar:teaching-plan-changed"));
}

export async function resetBrowserProject(): Promise<LocalProject> {
  if (typeof window === "undefined") {
    throw new Error("Projekt lze vymazat pouze v prohlížeči.");
  }

  const previousProject = await getLocalProject();
  const previousLocalStorage = Object.fromEntries(
    BROWSER_PROJECT_LOCAL_STORAGE_KEYS.map((key) => [
      key,
      window.localStorage.getItem(key),
    ]),
  );
  const previousSessionStorage = Object.fromEntries(
    BROWSER_PROJECT_SESSION_STORAGE_KEYS.map((key) => [
      key,
      window.sessionStorage.getItem(key),
    ]),
  );

  try {
    for (const key of BROWSER_PROJECT_LOCAL_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
    for (const key of BROWSER_PROJECT_SESSION_STORAGE_KEYS) {
      window.sessionStorage.removeItem(key);
    }
    const project = await resetLocalProject();
    dispatchBrowserProjectWorkingDataChanged();
    return project;
  } catch (cause) {
    for (const key of BROWSER_PROJECT_LOCAL_STORAGE_KEYS) {
      const value = previousLocalStorage[key];
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    }
    for (const key of BROWSER_PROJECT_SESSION_STORAGE_KEYS) {
      const value = previousSessionStorage[key];
      if (value === null) window.sessionStorage.removeItem(key);
      else window.sessionStorage.setItem(key, value);
    }
    await replaceLocalProjectAtomically(previousProject);
    dispatchBrowserProjectWorkingDataChanged();
    throw cause;
  }
}

export async function applyBrowserProjectShare(
  envelope: BrowserProjectShareEnvelope,
): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Projekt lze načíst pouze v prohlížeči.");
  }
  const verified = await validateBrowserProjectShareEnvelope(envelope);
  const previousProject = await getLocalProject();
  const previousStorage = Object.fromEntries(
    BROWSER_PROJECT_LOCAL_STORAGE_KEYS.map((key) => [
      key,
      window.localStorage.getItem(key),
    ]),
  );

  try {
    for (const key of BROWSER_PROJECT_LOCAL_STORAGE_KEYS) {
      const value = verified.data.localStorage[key];
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    }
    await replaceLocalProjectAtomically(verified.data.project);
  } catch (cause) {
    for (const key of BROWSER_PROJECT_LOCAL_STORAGE_KEYS) {
      const value = previousStorage[key];
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    }
    await replaceLocalProjectAtomically(previousProject);
    throw cause;
  }

  dispatchBrowserProjectWorkingDataChanged();
}
