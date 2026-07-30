import { NextResponse } from "next/server";

export interface ApiErrorOptions {
  status: number;
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  details?: Record<string, unknown>;
}

export function apiError({
  status,
  code,
  message,
  fieldErrors = {},
  details = {},
}: ApiErrorOptions) {
  return NextResponse.json(
    {
      error: { code, message, fieldErrors, details },
      requestId: crypto.randomUUID(),
    },
    { status },
  );
}

export function validationError(
  code: string,
  message: string,
  fieldErrors: Record<string, string[]>,
) {
  return apiError({ status: 422, code, message, fieldErrors });
}
