/**
 * mcp-repo.test.ts — 15-06: MCP write log (D-08) + import previews (D-15),
 * as app_role under withUserContext so USER-SCOPED RLS is the real filter.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { UserId } from "@budget/shared-kernel";
import { withUserContext } from "../src/db/tx";
import {
  insertWriteLog,
  listRecentWrites,
  findWritesByCallOrBatch,
  markReverted,
  dailyEntryCount,
  savePreview,
  getPreview,
  deletePreview,
  type WriteLogInsert,
} from "../src/mcp/repo";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

async function as<T>(userId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  const r = await withUserContext(UserId(userId), fn);
  if (r.isErr()) throw r.error;
  return r.value;
}

function row(
  userId: string,
  over: Partial<WriteLogInsert> = {},
): WriteLogInsert {
  return {
    tenantId: crypto.randomUUID(),
    userId,
    clientId: "client-a",
    callId: crypto.randomUUID(),
    batchId: null,
    tool: "add_transactions",
    entityType: "transaction",
    entityId: crypto.randomUUID(),
    op: "create",
    before: null,
    after: { amount: "1.00" },
    entryCount: 1,
    ...over,
  };
}

describe("MCP write log", () => {
  it("lists a user's recent writes newest first, invisible to other users", async () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    const old = row(a, { createdAt: new Date(Date.now() - 2 * 864e5) });
    const mid = row(a, { createdAt: new Date(Date.now() - 864e5) });
    const tooOld = row(a, { createdAt: new Date(Date.now() - 8 * 864e5) });
    const newest = row(a);
    await as(a, (tx) => insertWriteLog(tx, [old, mid, tooOld, newest]));

    const list = await as(a, (tx) =>
      listRecentWrites(tx, { userId: a, clientId: "client-a", limit: 10 }),
    );
    expect(list.map((w) => w.callId)).toEqual([
      newest.callId,
      mid.callId,
      old.callId,
    ]);
    expect(list[0]).toMatchObject({
      tool: "add_transactions",
      entityId: newest.entityId,
      revertedAt: null,
    });

    const seenByB = await as(b, (tx) =>
      listRecentWrites(tx, { userId: a, clientId: "client-a", limit: 10 }),
    );
    expect(seenByB).toEqual([]);
  });

  it("finds writes by call id or batch id, only for that user and client", async () => {
    const a = crypto.randomUUID();
    const batchId = crypto.randomUUID();
    const r1 = row(a, { batchId });
    const r2 = row(a, { batchId });
    const other = row(a, { clientId: "client-b", batchId });
    await as(a, (tx) => insertWriteLog(tx, [r1, r2, other]));

    const byBatch = await as(a, (tx) =>
      findWritesByCallOrBatch(tx, { userId: a, clientId: "client-a", id: batchId }),
    );
    expect(byBatch.map((w) => w.callId).sort()).toEqual(
      [r1.callId, r2.callId].sort(),
    );
    const byCall = await as(a, (tx) =>
      findWritesByCallOrBatch(tx, {
        userId: a,
        clientId: "client-a",
        id: r1.callId,
      }),
    );
    expect(byCall.length).toBe(1);
    expect(byCall[0]!.before).toBeNull();
    expect(byCall[0]!.after).toEqual({ amount: "1.00" });
  });

  it("marks writes reverted exactly once", async () => {
    const a = crypto.randomUUID();
    const r1 = row(a);
    await as(a, (tx) => insertWriteLog(tx, [r1]));
    const [w] = await as(a, (tx) =>
      findWritesByCallOrBatch(tx, { userId: a, clientId: "client-a", id: r1.callId }),
    );
    const undoCall = crypto.randomUUID();
    expect(await as(a, (tx) => markReverted(tx, [w!.id], undoCall))).toBe(1);
    expect(await as(a, (tx) => markReverted(tx, [w!.id], undoCall))).toBe(0);
    const [after] = await as(a, (tx) =>
      findWritesByCallOrBatch(tx, { userId: a, clientId: "client-a", id: r1.callId }),
    );
    expect(after!.revertedAt).not.toBeNull();
  });

  it("counts entries written in the last 24h per client", async () => {
    const a = crypto.randomUUID();
    await as(a, (tx) =>
      insertWriteLog(tx, [
        row(a, { entryCount: 300 }),
        row(a, { entryCount: 200 }),
        row(a, { entryCount: 999, createdAt: new Date(Date.now() - 25 * 3600e3) }),
        row(a, { entryCount: 77, clientId: "client-b" }),
      ]),
    );
    expect(
      await as(a, (tx) => dailyEntryCount(tx, { userId: a, clientId: "client-a" })),
    ).toBe(500);
  });
});

describe("MCP import previews", () => {
  it("saves, reads, expires, scopes to client, deletes and cleans up", async () => {
    const a = crypto.randomUUID();
    const base = {
      tenantId: crypto.randomUUID(),
      userId: a,
      clientId: "client-a",
      kind: "transactions",
      payloadHash: "h",
      rows: [{ n: 1 }],
      issues: { duplicates: [] },
    };
    const expiredId = crypto.randomUUID();
    await as(a, (tx) =>
      savePreview(tx, {
        ...base,
        id: expiredId,
        expiresAt: new Date(Date.now() - 1000),
      }),
    );
    expect(
      await as(a, (tx) => getPreview(tx, { id: expiredId, userId: a, clientId: "client-a" })),
    ).toBeNull();

    const id = crypto.randomUUID();
    await as(a, (tx) => savePreview(tx, { ...base, id }));
    const got = await as(a, (tx) =>
      getPreview(tx, { id, userId: a, clientId: "client-a" }),
    );
    expect(got).toMatchObject({ kind: "transactions", rows: [{ n: 1 }] });
    expect(
      await as(a, (tx) => getPreview(tx, { id, userId: a, clientId: "client-b" })),
    ).toBeNull();

    // savePreview opportunistically removed the expired one.
    const leftovers = await as(a, (tx) =>
      tx.execute(
        sql`SELECT count(*)::int AS n FROM shared_kernel.mcp_import_previews WHERE id = ${expiredId}::uuid`,
      ),
    );
    expect((leftovers.rows[0] as { n: number }).n).toBe(0);

    await as(a, (tx) => deletePreview(tx, { id, userId: a }));
    expect(
      await as(a, (tx) => getPreview(tx, { id, userId: a, clientId: "client-a" })),
    ).toBeNull();
  });
});
