/**
 * list-pending-tasks.test.ts — Unit tests for BDP-03 application service.
 *
 * RED → GREEN → REFACTOR per CLAUDE.md TDD-first rule.
 *
 * Uses a mocked TaskRepo port. Hex boundary: the service must compose through
 * the port, not import any drizzle. This file pins that contract.
 *
 * Covers the 4 cases listed in 03-03-PLAN.md <task 1> <behavior>:
 *   1. taskRepo.listPending returns [] → service returns Result.ok([]).
 *   2. taskRepo.listPending returns 3 tasks → service returns Result.ok preserving order.
 *   3. taskRepo.listPending throws → service returns Result.err(error).
 *   4. Service passes input.budgetId + input.tenantId through verbatim.
 */
import { describe, it, expect, mock } from "bun:test";
import { listPendingTasks } from "../../src/application/list-pending-tasks";
import type { TaskRepo, TaskSummary } from "../../src/ports/task-repo";

function makeRepo(impl: Partial<TaskRepo> = {}): TaskRepo {
  // Phase 7 extended TaskRepo with emit + resolve write methods. These tests
  // only exercise listPending; stub the rest as no-ops to keep the type-check
  // green without coupling unrelated tests to the write surface.
  return {
    listPending: async () => [],
    resolve: async () => {},
    emitReserveTopup: async () => {},
    emitConfirmDraft: async () => {},
    emitCushionBelowTarget: async () => {},
    resolveByKindAndBudget: async () => {},
    resolveConfirmDraftByDraftId: async () => {},
    ...impl,
  };
}

const sampleTask = (over: Partial<TaskSummary> = {}): TaskSummary => ({
  id: "00000000-0000-0000-0000-000000000001",
  budget_id: "00000000-0000-0000-0000-0000000000aa",
  kind: "RESERVE_TOPUP",
  status: "PENDING",
  payload: {},
  created_at: "2026-05-12T10:00:00.000Z",
  ...over,
});

describe("listPendingTasks", () => {
  it("returns Result.ok([]) when the repo returns no rows", async () => {
    const repo = makeRepo({ listPending: async () => [] });
    const svc = listPendingTasks({ taskRepo: repo });
    const r = await svc({
      tenantId: "00000000-0000-0000-0000-0000000000aa",
      budgetId: "00000000-0000-0000-0000-0000000000aa",
    });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value).toEqual([]);
  });

  it("returns Result.ok([t1, t2, t3]) preserving the repo's order", async () => {
    const t1 = sampleTask({ id: "11111111-1111-1111-1111-111111111111" });
    const t2 = sampleTask({
      id: "22222222-2222-2222-2222-222222222222",
      kind: "CONFIRM_DRAFT",
    });
    const t3 = sampleTask({
      id: "33333333-3333-3333-3333-333333333333",
      kind: "CUSHION_BELOW_TARGET",
    });
    const repo = makeRepo({ listPending: async () => [t1, t2, t3] });
    const svc = listPendingTasks({ taskRepo: repo });
    const r = await svc({
      tenantId: "00000000-0000-0000-0000-0000000000aa",
      budgetId: "00000000-0000-0000-0000-0000000000aa",
    });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value).toHaveLength(3);
      expect(r.value.map((t) => t.id)).toEqual([t1.id, t2.id, t3.id]);
      expect(r.value[0]?.kind).toBe("RESERVE_TOPUP");
      expect(r.value[1]?.kind).toBe("CONFIRM_DRAFT");
      expect(r.value[2]?.kind).toBe("CUSHION_BELOW_TARGET");
    }
  });

  it("returns Result.err(error) when the repo throws", async () => {
    const repo = makeRepo({
      listPending: async () => {
        throw new Error("db_unavailable");
      },
    });
    const svc = listPendingTasks({ taskRepo: repo });
    const r = await svc({
      tenantId: "00000000-0000-0000-0000-0000000000aa",
      budgetId: "00000000-0000-0000-0000-0000000000aa",
    });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error).toBeInstanceOf(Error);
      expect(r.error.message).toBe("db_unavailable");
    }
  });

  it("passes input.budgetId and input.tenantId through to the repo verbatim", async () => {
    // v1.1 invariant: budgetId === tenantId — but the service is dumb;
    // it just forwards whatever the route passes. This test pins the
    // forwarding contract so a future refactor can't silently swap args.
    const listPending = mock(
      async (_b: string, _t: string) => [] as TaskSummary[],
    );
    const repo = makeRepo({ listPending });
    const svc = listPendingTasks({ taskRepo: repo });
    const budgetId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const tenantId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    await svc({ tenantId, budgetId });
    expect(listPending).toHaveBeenCalledTimes(1);
    expect(listPending.mock.calls[0]?.[0]).toBe(budgetId);
    expect(listPending.mock.calls[0]?.[1]).toBe(tenantId);
  });
});
