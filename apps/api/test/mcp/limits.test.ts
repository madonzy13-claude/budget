/**
 * limits.test.ts — 15-06: per-connection rate limits (D-24) and the daily
 * written-entry cap (D-25, DB-backed via the write log).
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { setupMcpTestEnv } from "./helpers";

await setupMcpTestEnv();

const { withUserContext, insertWriteLog } = await import("@budget/platform");
const { UserId } = await import("@budget/shared-kernel");
const { clearRateLimits } = await import("../../src/middleware/rate-limit");
const { checkRate, checkDailyEntries, MCP_LIMITS } = await import(
  "../../src/mcp/limits"
);

beforeEach(() => clearRateLimits());

describe("MCP limits", () => {
  it("exposes the agreed limits", () => {
    expect(MCP_LIMITS).toEqual({
      readsPerMinute: 60,
      writesPerMinute: 20,
      entriesPerDay: 5000,
      maxRowsPerCall: 500,
      searchPageSize: 200,
    });
  });

  it("allows 60 reads and 20 writes a minute per connection", () => {
    const conn = { clientId: "c1", userId: crypto.randomUUID() };
    for (let i = 0; i < 60; i++) expect(checkRate(conn, "read")).toBe(true);
    expect(checkRate(conn, "read")).toBe(false);
    for (let i = 0; i < 20; i++) expect(checkRate(conn, "write")).toBe(true);
    expect(checkRate(conn, "write")).toBe(false);
    expect(checkRate({ ...conn, clientId: "c2" }, "read")).toBe(true);
    expect(checkRate({ ...conn, clientId: "c2" }, "write")).toBe(true);
  });

  it("caps written entries at 5000 per day", async () => {
    const userId = crypto.randomUUID();
    const conn = { clientId: "c-daily", userId };
    const seeded = await withUserContext(UserId(userId), (tx) =>
      insertWriteLog(tx, [
        {
          tenantId: crypto.randomUUID(),
          userId,
          clientId: "c-daily",
          callId: crypto.randomUUID(),
          batchId: null,
          tool: "add_transactions",
          entityType: "transaction",
          entityId: "x",
          op: "create",
          before: null,
          after: null,
          entryCount: 4990,
        },
      ]),
    );
    expect(seeded.isOk()).toBe(true);

    expect((await checkDailyEntries(conn, 10)).isOk()).toBe(true);
    const over = await checkDailyEntries(conn, 11);
    expect(over.isErr()).toBe(true);
    expect(over._unsafeUnwrapErr()).toMatchObject({ limit: 5000, used: 4990 });
    expect(over._unsafeUnwrapErr().retry_after_seconds).toBeGreaterThan(0);
  });
});
