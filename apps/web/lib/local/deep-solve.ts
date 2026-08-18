export const PRODUCTION_MAX_GENERATION_SECONDS = 300;
export const PRODUCTION_DEFAULT_GENERATION_SECONDS = 240;
export const LOCAL_DEEP_SOLVE_SECONDS = 1_800;
export const LOCAL_AUTOMATION_DEFAULT_GENERATION_SECONDS = 600;

export function isLocalDeepSolveHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return ["localhost", "127.0.0.1", "::1"].includes(normalized);
}

export function maxGenerationTimeLimitForHost(hostname: string): number {
  return isLocalDeepSolveHost(hostname)
    ? LOCAL_DEEP_SOLVE_SECONDS
    : PRODUCTION_MAX_GENERATION_SECONDS;
}

export function defaultGenerationTimeLimitForHost(hostname: string): number {
  const normalized = hostname.trim().toLowerCase();
  if (normalized === "127.0.0.1") {
    return LOCAL_AUTOMATION_DEFAULT_GENERATION_SECONDS;
  }
  return isLocalDeepSolveHost(normalized)
    ? LOCAL_DEEP_SOLVE_SECONDS
    : PRODUCTION_DEFAULT_GENERATION_SECONDS;
}
