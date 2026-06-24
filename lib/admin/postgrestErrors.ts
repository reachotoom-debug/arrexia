type PostgrestLikeError = {
  message?: string;
  code?: string;
} | null;

/** True when PostgREST/Postgres reports a missing relation or schema-cache miss. */
export function isPostgrestMissingTableError(error: PostgrestLikeError): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("does not exist")
  );
}
