import { dailyEntryCount, withUserContext } from "@budget/platform";
import { UserId, ok, err, type Result } from "@budget/shared-kernel";
import { checkAndRecord } from "../middleware/rate-limit";

/**
 * limits.ts — per-connection abuse limits (D-13, D-22, D-24, D-25).
 *
 * The per-minute counters live in the in-memory rate-limit store: they reset
 * on API restart, which is fine for a single API instance. The daily cap reads
 * the write log, so it survives restarts.
 */
export const MCP_LIMITS = {
  readsPerMinute: 60,
  writesPerMinute: 20,
  entriesPerDay: 5000,
  maxRowsPerCall: 500,
  searchPageSize: 200,
} as const;

export interface McpConnection {
  clientId: string;
  userId: string;
}

export function checkRate(conn: McpConnection, kind: "read" | "write"): boolean {
  const max =
    kind === "read" ? MCP_LIMITS.readsPerMinute : MCP_LIMITS.writesPerMinute;
  return checkAndRecord(
    `mcp:${conn.clientId}:${conn.userId}:${kind === "read" ? "r" : "w"}`,
    60,
    max,
  );
}

export interface DailyCapExceeded {
  limit: number;
  used: number;
  retry_after_seconds: number;
}

export async function checkDailyEntries(
  conn: McpConnection,
  n: number,
): Promise<Result<void, DailyCapExceeded>> {
  const r = await withUserContext(UserId(conn.userId), (tx) =>
    dailyEntryCount(tx, conn),
  );
  if (r.isErr()) throw r.error;
  const used = r.value;
  if (used + n <= MCP_LIMITS.entriesPerDay) return ok(undefined);
  // ponytail: a rough hint; the exact rolling-window reset isn't worth a query.
  return err({ limit: MCP_LIMITS.entriesPerDay, used, retry_after_seconds: 3600 });
}
