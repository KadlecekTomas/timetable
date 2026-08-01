import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 360;

const MAX_SOLVER_REQUEST_MS = 330_000;

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function solverBaseUrl(): string {
  return (process.env.SOLVER_URL ?? "http://solver:8000").replace(/\/$/, "");
}

function upstreamUrl(request: NextRequest, path: string[]): string {
  const source = new URL(request.url);
  const encodedPath = path
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${solverBaseUrl()}/${encodedPath}${source.search}`;
}

function requestHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const name of [
    "connection",
    "content-length",
    "host",
    "keep-alive",
    "transfer-encoding",
  ]) {
    headers.delete(name);
  }
  return headers;
}

function responseHeaders(upstream: Response): Headers {
  const headers = new Headers(upstream.headers);
  for (const name of [
    "connection",
    "content-encoding",
    "content-length",
    "keep-alive",
    "transfer-encoding",
  ]) {
    headers.delete(name);
  }
  return headers;
}

async function proxySolver(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { path } = await context.params;
  if (!path.length) {
    return Response.json(
      {
        error: {
          code: "SOLVER_PATH_MISSING",
          message: "Chybí cesta solveru.",
        },
      },
      { status: 400 },
    );
  }

  const method = request.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers: requestHeaders(request),
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(MAX_SOLVER_REQUEST_MS),
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  try {
    const upstream = await fetch(upstreamUrl(request, path), init);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders(upstream),
    });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Neznámá chyba proxy.";
    return Response.json(
      {
        error: {
          code: "SOLVER_PROXY_FAILED",
          message: "Komunikace s plánovacím modulem selhala.",
          details: { message },
        },
      },
      { status: 502 },
    );
  }
}

export const GET = proxySolver;
export const POST = proxySolver;
export const PUT = proxySolver;
export const PATCH = proxySolver;
export const DELETE = proxySolver;
