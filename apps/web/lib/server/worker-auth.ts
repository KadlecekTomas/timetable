import { timingSafeEqual } from "node:crypto";

export type WorkerAuthResult =
  | { authorized: true }
  | { authorized: false; status: 401 | 503; code: string; message: string };

export function authorizeWorker(request: Request): WorkerAuthResult {
  const configured = process.env.WORKER_TOKEN;
  if (!configured) {
    return {
      authorized: false,
      status: 503,
      code: "WORKER_TOKEN_NOT_CONFIGURED",
      message: "Interní worker token není nakonfigurovaný.",
    };
  }
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const configuredBuffer = Buffer.from(configured);
  const suppliedBuffer = Buffer.from(supplied);
  if (
    configuredBuffer.length !== suppliedBuffer.length ||
    !timingSafeEqual(configuredBuffer, suppliedBuffer)
  ) {
    return {
      authorized: false,
      status: 401,
      code: "WORKER_UNAUTHORIZED",
      message: "Worker nemá platné oprávnění.",
    };
  }
  return { authorized: true };
}
