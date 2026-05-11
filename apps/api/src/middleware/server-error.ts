import type { Context } from "hono";

/**
 * server-error.ts — sanitized 500 envelope.
 *
 * Routes must NEVER pass `r.error.message` (a Drizzle/PG error) to the client:
 * those messages contain raw SQL, table names, and column lists. Use this helper
 * instead — it logs the full error server-side and returns an opaque code.
 */
export function serverError(c: Context, code: string, err: unknown) {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "(non-error)";
  console.error("[api] internal_error", { code, message, err });
  return c.json({ error: "internal_error", code }, 500);
}
