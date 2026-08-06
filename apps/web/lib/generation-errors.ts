function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function generationFailureMessage(explanation: unknown): string | null {
  if (typeof explanation === "string" && explanation.trim()) {
    return explanation.trim();
  }

  const root = recordValue(explanation);
  if (!root) return null;

  for (const candidate of [root.message, root.detail]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  const nestedError = recordValue(root.error);
  if (nestedError) {
    if (typeof nestedError.message === "string" && nestedError.message.trim()) {
      return nestedError.message.trim();
    }
    const details = recordValue(nestedError.details);
    if (typeof details?.message === "string" && details.message.trim()) {
      return details.message.trim();
    }
  }

  return null;
}
