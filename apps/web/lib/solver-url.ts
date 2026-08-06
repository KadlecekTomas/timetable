const LOCAL_SOLVER_URL = "http://solver:8000";
const VERCEL_SOLVER_URL = "https://timetable-web-ny6g.vercel.app/solver";

type SolverEnvironment = {
  SOLVER_URL?: string;
  VERCEL?: string;
};

export function resolveSolverBaseUrl(
  environment: SolverEnvironment = process.env,
): string {
  const configured = environment.SOLVER_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  if (environment.VERCEL === "1") return VERCEL_SOLVER_URL;
  return LOCAL_SOLVER_URL;
}
