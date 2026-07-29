import { setTimeout as sleep } from "node:timers/promises";

import { completionFromSolver } from "./protocol.js";

interface ClaimedJob {
  generationRunId: string;
  inputSnapshotHash: string;
  solverRequest: unknown;
}

const webUrl = process.env.WEB_INTERNAL_URL ?? "http://web:3000";
const solverUrl = process.env.SOLVER_URL ?? "http://solver:8000";
const workerToken = process.env.WORKER_TOKEN;
const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1500);

if (!workerToken) {
  throw new Error("WORKER_TOKEN is required");
}
if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 250) {
  throw new Error("WORKER_POLL_INTERVAL_MS must be at least 250");
}

let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});

function workerHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${workerToken}`,
    "Content-Type": "application/json",
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

async function claimJob(): Promise<ClaimedJob | null> {
  const response = await fetch(`${webUrl}/api/internal/generation-runs/claim`, {
    method: "POST",
    headers: workerHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 204) return null;
  if (!response.ok) {
    throw new Error(`Claim failed with HTTP ${response.status}`);
  }
  return (await response.json()) as ClaimedJob;
}

async function executeJob(job: ClaimedJob) {
  const solverResponse = await fetch(`${solverUrl}/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job.solverRequest),
    signal: AbortSignal.timeout(360_000),
  });
  const solverBody = await readJson(solverResponse);
  const completion = completionFromSolver({
    ok: solverResponse.ok,
    status: solverResponse.status,
    body: solverBody,
  });

  const completionResponse = await fetch(
    `${webUrl}/api/internal/generation-runs/${job.generationRunId}/complete`,
    {
      method: "POST",
      headers: workerHeaders(),
      body: JSON.stringify(completion),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!completionResponse.ok) {
    throw new Error(`Completion failed with HTTP ${completionResponse.status}`);
  }
}

async function run() {
  console.info("Generation worker started");
  while (!stopping) {
    try {
      const job = await claimJob();
      if (!job) {
        await sleep(pollIntervalMs);
        continue;
      }
      console.info(`Processing generation run ${job.generationRunId}`);
      await executeJob(job);
      console.info(`Finished generation run ${job.generationRunId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown worker error";
      console.error(`Worker iteration failed: ${message}`);
      await sleep(Math.max(pollIntervalMs, 2000));
    }
  }
  console.info("Generation worker stopped");
}

await run();
