import type { ScheduledLesson, SolverPolicy } from "@/lib/domain/contracts";
import { evaluateReadiness } from "@/lib/domain/readiness";
import { scoreSchedule } from "@/lib/domain/scoring";
import { validateSchedule } from "@/lib/domain/validation";
import { maxGenerationTimeLimitForHost } from "./deep-solve";
import {
  generationRandomSeed,
  getLocalProject,
  replaceLocalProjectAtomically,
  type LocalProject,
} from "./api";
import { buildSolverSnapshot } from "./solver-snapshot";

interface SolverPayload {
  status: string;
  objective_value: number;
  lessons: ScheduledLesson[];
  diagnostics?: unknown[];
  solver_stats?: Record<string, unknown>;
  detail?: unknown;
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
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

function now(): string {
  return new Date().toISOString();
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function solverEndpoint(): string {
  const configured = process.env.NEXT_PUBLIC_SOLVER_URL?.replace(/\/$/, "");
  return `${configured || "/solver"}/solve`;
}

async function readSolverPayload(response: Response): Promise<SolverPayload> {
  const responseText = await response.text();
  if (!responseText) {
    return { status: "FAILED", objective_value: 0, lessons: [] };
  }
  try {
    return JSON.parse(responseText) as SolverPayload;
  } catch {
    return {
      status: "FAILED",
      objective_value: 0,
      lessons: [],
      detail: responseText,
    };
  }
}

async function saveProject(project: LocalProject): Promise<LocalProject> {
  return replaceLocalProjectAtomically(project);
}

export async function createPolicyGenerationRun({
  init,
  policy,
}: {
  init?: RequestInit;
  policy: SolverPolicy;
}): Promise<Response> {
  const body = requestBody(init);
  const timeLimitSeconds = Number(body.timeLimitSeconds ?? 60);
  const hostname =
    typeof window === "undefined" ? "" : window.location.hostname;
  const maximum = maxGenerationTimeLimitForHost(hostname);
  if (
    !Number.isInteger(timeLimitSeconds) ||
    timeLimitSeconds < 1 ||
    timeLimitSeconds > maximum
  ) {
    return errorResponse(
      422,
      "GENERATION_REQUEST_INVALID",
      `Časový limit musí být mezi 1 a ${maximum} sekundami.`,
    );
  }

  let project = structuredClone(await getLocalProject());
  const randomSeed = generationRandomSeed(project.generationRuns.length);
  const snapshot = buildSolverSnapshot({
    project,
    policy,
    timeLimitSeconds,
    randomSeed,
  });
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
  project.generationRuns.unshift({
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
  project = await saveProject(project);

  try {
    const solverResponse = await fetch(solverEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
      signal: AbortSignal.timeout((timeLimitSeconds + 30) * 1_000),
    });
    const solverPayload = await readSolverPayload(solverResponse);

    if (!solverResponse.ok) {
      project = structuredClone(await getLocalProject());
      const run = project.generationRuns.find((item) => item.id === runId);
      if (run) {
        run.status = solverResponse.status === 422 ? "INFEASIBLE" : "FAILED";
        run.explanation =
          solverPayload.error?.details ?? solverPayload.detail ?? solverPayload;
        run.finishedAt = now();
        await saveProject(project);
      }
      return errorResponse(
        solverResponse.status,
        solverPayload.error?.code ??
          (solverResponse.status === 422
            ? "TIMETABLE_INFEASIBLE"
            : "SOLVER_REQUEST_FAILED"),
        solverPayload.error?.message ??
          (solverResponse.status === 422
            ? "Plánovací modul nenašel proveditelný rozvrh."
            : "Výpočet se nepodařilo spustit."),
        { generationRunId: runId, explanation: solverPayload.error?.details },
      );
    }

    const hardIssues = validateSchedule(snapshot, solverPayload.lessons);
    const score = scoreSchedule(snapshot, solverPayload.lessons);
    if (hardIssues.length || !score.valid || score.total == null) {
      project = structuredClone(await getLocalProject());
      const run = project.generationRuns.find((item) => item.id === runId);
      if (run) {
        run.status = "FAILED";
        run.explanation = { hardIssues, score };
        run.finishedAt = now();
        await saveProject(project);
      }
      return errorResponse(
        422,
        "SOLVER_OUTPUT_INVALID",
        "Solver vrátil kandidáta, který neprošel policy validací.",
        { generationRunId: runId, hardIssues, score },
      );
    }

    project = structuredClone(await getLocalProject());
    const run = project.generationRuns.find((item) => item.id === runId);
    if (!run) {
      return errorResponse(
        409,
        "GENERATION_RUN_LOST",
        "Během výpočtu se změnila lokální data generování.",
      );
    }

    const versionId = crypto.randomUUID();
    const versionNumber =
      Math.max(
        0,
        ...project.timetableVersions.map((item) => item.versionNumber),
      ) + 1;
    const timestamp = now();
    const lessons = solverPayload.lessons.map((lesson) => ({
      ...lesson,
      id: `lesson:${versionId}:${lesson.block_id}`,
      locked: Boolean(lesson.locked),
      manually_changed: false,
    }));
    project.timetableVersions.unshift({
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
      ? (solverPayload.status as "OPTIMAL" | "FEASIBLE")
      : "FEASIBLE";
    run.qualityScore = score.total;
    run.objectiveValue = solverPayload.objective_value;
    run.explanation = {
      diagnostics: solverPayload.diagnostics ?? [],
      solverStats: solverPayload.solver_stats ?? {},
      solverPolicyVersion: policy.version,
    };
    run.candidateVersionId = versionId;
    run.finishedAt = timestamp;
    await saveProject(project);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    const message = timedOut
      ? "Výpočet překročil časový limit. Zvolte delší limit a spusťte jej znovu."
      : error instanceof Error
        ? error.message
        : "Neznámá chyba výpočtu.";
    project = structuredClone(await getLocalProject());
    const run = project.generationRuns.find((item) => item.id === runId);
    if (run) {
      run.status = "FAILED";
      run.explanation = { message };
      run.finishedAt = now();
      await saveProject(project);
    }
    return errorResponse(
      timedOut ? 504 : 502,
      timedOut ? "SOLVER_TIMEOUT" : "GENERATION_FAILED",
      message,
      { generationRunId: runId },
    );
  }

  return jsonResponse(
    { generationRunId: runId, status: "QUEUED", inputSnapshotHash },
    202,
  );
}
