/**
 * dismiss-draft.test.ts — Unit tests for dismissDraft application service.
 * TDD RED phase — written before implementation.
 */
import { describe, it, expect } from "bun:test";
import { dismissDraft } from "../../src/application/dismiss-draft";
import type { ExpenseLedgerDraftPortRepo } from "../../src/ports/expense-ledger-draft-port-repo";

function makeRepo(
  dismissResult: "ok" | "not_found" | "already_confirmed" = "ok",
): ExpenseLedgerDraftPortRepo {
  return {
    dismiss: async () => dismissResult,
    confirm: async () => "ok",
  };
}

describe("dismissDraft", () => {
  it("returns ok(undefined) when repo.dismiss returns 'ok'", async () => {
    const svc = dismissDraft({ repo: makeRepo("ok") });
    const result = await svc({ tenantId: "t", draftId: "d", actorUserId: "u" });
    expect(result.isOk()).toBe(true);
  });

  it("returns err with kind=DraftNotFound when repo returns 'not_found'", async () => {
    const svc = dismissDraft({ repo: makeRepo("not_found") });
    const result = await svc({ tenantId: "t", draftId: "d", actorUserId: "u" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect((result.error as any).kind).toBe("DraftNotFound");
    }
  });

  it("returns err with kind=AlreadyConfirmed when repo returns 'already_confirmed'", async () => {
    const svc = dismissDraft({ repo: makeRepo("already_confirmed") });
    const result = await svc({ tenantId: "t", draftId: "d", actorUserId: "u" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect((result.error as any).kind).toBe("AlreadyConfirmed");
    }
  });

  it("returns err with kind=Unknown when repo throws", async () => {
    const repo: ExpenseLedgerDraftPortRepo = {
      dismiss: async () => {
        throw new Error("db_failure");
      },
      confirm: async () => "ok",
    };
    const svc = dismissDraft({ repo });
    const result = await svc({ tenantId: "t", draftId: "d", actorUserId: "u" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect((result.error as any).kind).toBe("Unknown");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 260612-kxd T3-B — integration (real Postgres, CLAUDE.md rule 3):           */
/* dismissing a draft must resolve its PENDING CONFIRM_DRAFT task inside the  */
/* dismiss transaction itself — NOT in a separate withTenantTx (the Phase 7   */
/* "A2 fallback" with a one-poll orphan window). The adapter owns the tx, so  */
/* the resolve must live there. RED until the adapter folds it in.            */
/* -------------------------------------------------------------------------- */
const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (DB_URL_RAW) {
  // Docker hostname → localhost so the host-side test runner reaches the DB.
  process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
}

describe.skipIf(!DB_URL_RAW)(
  "dismissDraft — CONFIRM_DRAFT same-tx resolve (real Postgres)",
  () => {
    it("dismiss resolves the PENDING CONFIRM_DRAFT task atomically — no taskRepo dep, no second tx", async () => {
      const { resetPools } = await import("@budget/platform");
      resetPools();
      const { DrizzleExpenseLedgerDraftPortRepo } = await import(
        "../../src/adapters/persistence/expense-ledger-draft-port-repo"
      );
      const { seedDraftWithTask, readTaskStatus } =
        await import("../draft-task-fixtures");

      const fx = await seedDraftWithTask();

      // Intentionally NO taskRepo — the resolve must be inside the dismiss tx.
      const svc = dismissDraft({
        repo: new DrizzleExpenseLedgerDraftPortRepo(),
      });
      const r = await svc({
        tenantId: fx.budgetId,
        draftId: fx.draftId,
        actorUserId: fx.userId,
      });
      expect(r.isOk()).toBe(true);

      const task = await readTaskStatus(fx.budgetId, fx.taskId);
      expect(task).not.toBeNull();
      expect(task?.status).toBe("RESOLVED");
      expect(task?.resolved_at).not.toBeNull();
    });

    it("failed dismiss (draft does not exist) never resolves the task independently", async () => {
      const { resetPools } = await import("@budget/platform");
      resetPools();
      const { DrizzleExpenseLedgerDraftPortRepo } = await import(
        "../../src/adapters/persistence/expense-ledger-draft-port-repo"
      );
      const { seedDraftWithTask, readTaskStatus } =
        await import("../draft-task-fixtures");

      // orphan: task points at a draft row that was never inserted.
      const fx = await seedDraftWithTask({ orphan: true });

      const svc = dismissDraft({
        repo: new DrizzleExpenseLedgerDraftPortRepo(),
      });
      const r = await svc({
        tenantId: fx.budgetId,
        draftId: fx.draftId,
        actorUserId: fx.userId,
      });
      expect(r.isErr()).toBe(true);
      if (r.isErr()) expect((r.error as any).kind).toBe("DraftNotFound");

      // The resolve must commit WITH a successful dismiss, never on its own —
      // a failed dismiss leaves the task untouched (read-side self-heal owns
      // the orphan, not this write path).
      const task = await readTaskStatus(fx.budgetId, fx.taskId);
      expect(task?.status).toBe("PENDING");
    });
  },
);
