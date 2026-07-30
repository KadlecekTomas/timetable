export interface SolverHttpResult {
  ok: boolean;
  status: number;
  body: unknown;
}

export type CompletionPayload =
  | { outcome: "SOLVED"; result: unknown }
  | { outcome: "INFEASIBLE"; error: Record<string, unknown> }
  | { outcome: "FAILED"; error: Record<string, unknown> };

function errorRecord(body: unknown, status: number): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return { httpStatus: status, ...(body as Record<string, unknown>) };
  }
  return { httpStatus: status, message: "Solver vrátil nečitelnou odpověď." };
}

export function completionFromSolver(
  response: SolverHttpResult,
): CompletionPayload {
  if (response.ok) return { outcome: "SOLVED", result: response.body };
  if (response.status === 422) {
    return {
      outcome: "INFEASIBLE",
      error: errorRecord(response.body, response.status),
    };
  }
  return {
    outcome: "FAILED",
    error: errorRecord(response.body, response.status),
  };
}
