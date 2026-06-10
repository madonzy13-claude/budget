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
