type PostgresErrorLike = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

export function logPostgresUniqueViolation(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const err = error as PostgresErrorLike | null;
  if (err?.code !== "23505") {
    return;
  }

  console.error(`[${context}] unique violation (23505)`, {
    message: err.message,
    details: err.details ?? null,
    hint: err.hint ?? null,
    ...extra,
  });
}
