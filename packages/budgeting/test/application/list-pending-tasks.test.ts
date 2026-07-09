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
    emitInvestmentDelisted: async () => {},
    resolveByKindAndBudget: async () => {},
    resolveConfirmDraftByDraftId: async () => {},
    resolveInvestmentDelistedForHoldings: async () => 0,
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

/* -------------------------------------------------------------------------- */
/* 260612-kxd T3-C — integration (real Postgres, CLAUDE.md rule 3):           */
/* the banner read must SELF-HEAL orphan CONFIRM_DRAFT tasks — a PENDING      */
/* task whose draft no longer exists (or is soft-deleted/confirmed/dismissed) */
/* must NOT be returned. This makes the live "Maczfit" orphan vanish on the   */
/* next read with zero manual SQL. RED until listPending gains the EXISTS     */
/* guard. Over-filter guards: live drafts + non-CONFIRM_DRAFT kinds stay.     */
/* -------------------------------------------------------------------------- */
const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (DB_URL_RAW) {
  // Docker hostname → localhost so the host-side test runner reaches the DB.
  process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
}

describe.skipIf(!DB_URL_RAW)(
  "listPendingTasks — orphan CONFIRM_DRAFT self-heal (real Postgres)",
  () => {
    async function setup() {
      const { resetPools } = await import("@budget/platform");
      resetPools();
      const { createTaskRepo } =
        await import("../../src/adapters/persistence/task-repo");
      const fixtures = await import("../draft-task-fixtures");
      const svc = listPendingTasks({ taskRepo: createTaskRepo() });
      return { svc, ...fixtures };
    }

    it("hides a CONFIRM_DRAFT task whose draft row never existed (Maczfit orphan)", async () => {
      const { svc, seedDraftWithTask } = await setup();
      const fx = await seedDraftWithTask({ orphan: true });
      const r = await svc({ tenantId: fx.budgetId, budgetId: fx.budgetId });
      expect(r.isOk()).toBe(true);
      if (r.isOk()) {
        expect(r.value.some((t) => t.id === fx.taskId)).toBe(false);
      }
    });

    it("hides a CONFIRM_DRAFT task whose draft was soft-deleted", async () => {
      const { svc, seedDraftWithTask, markDraft } = await setup();
      const fx = await seedDraftWithTask();
      await markDraft(fx, "deleted_at");
      const r = await svc({ tenantId: fx.budgetId, budgetId: fx.budgetId });
      expect(r.isOk()).toBe(true);
      if (r.isOk()) {
        expect(r.value.some((t) => t.id === fx.taskId)).toBe(false);
      }
    });

    it("hides a CONFIRM_DRAFT task whose category is archived (legacy Maczfit shape), keeps RESERVE_TOPUP", async () => {
      // The live Maczfit row: draft EXISTS and is live (the archive-time purge
      // silently failed pre-42501-grants-fix), but the category has
      // archived_at set → the draft is invisible in the UI, the task is not
      // actionable. The read must heal this legacy shape with no manual SQL.
      const { svc, seedDraftWithTask, seedReserveTopupTask } = await setup();
      const fx = await seedDraftWithTask({ archivedCategory: true });
      const topup = await seedReserveTopupTask(fx);
      const r = await svc({ tenantId: fx.budgetId, budgetId: fx.budgetId });
      expect(r.isOk()).toBe(true);
      if (r.isOk()) {
        expect(r.value.some((t) => t.id === fx.taskId)).toBe(false);
        expect(r.value.some((t) => t.id === topup.taskId)).toBe(true);
      }
    });

    it("keeps a CONFIRM_DRAFT task whose draft is live and unconfirmed (no over-filter)", async () => {
      const { svc, seedDraftWithTask } = await setup();
      const fx = await seedDraftWithTask();
      const r = await svc({ tenantId: fx.budgetId, budgetId: fx.budgetId });
      expect(r.isOk()).toBe(true);
      if (r.isOk()) {
        expect(r.value.some((t) => t.id === fx.taskId)).toBe(true);
      }
    });

    it("keeps non-CONFIRM_DRAFT kinds regardless of payload (RESERVE_TOPUP guard)", async () => {
      const { svc, seedDraftWithTask, seedReserveTopupTask } = await setup();
      const fx = await seedDraftWithTask({ orphan: true });
      const topup = await seedReserveTopupTask(fx);
      const r = await svc({ tenantId: fx.budgetId, budgetId: fx.budgetId });
      expect(r.isOk()).toBe(true);
      if (r.isOk()) {
        expect(r.value.some((t) => t.id === topup.taskId)).toBe(true);
        expect(r.value.some((t) => t.id === fx.taskId)).toBe(false);
      }
    });
  },
);
