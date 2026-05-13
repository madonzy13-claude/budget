/**
 * confirm-draft.test.ts — Unit tests for confirmDraft application service (CASE B).
 * TDD RED phase — written before implementation.
 */
import { describe, it, expect } from "bun:test";
import { confirmDraft } from "../../src/application/confirm-draft";
import type { ExpenseLedgerDraftPortRepo } from "../../src/ports/expense-ledger-draft-port-repo";

function makeRepo(
  confirmResult:
    | "ok"
    | "not_found"
    | "already_confirmed"
    | "already_dismissed" = "ok",
): ExpenseLedgerDraftPortRepo {
  return {
    dismiss: async () => "ok",
    confirm: async () => confirmResult,
  };
}

describe("confirmDraft", () => {
  it("returns ok(undefined) when repo.confirm returns 'ok'", async () => {
    const svc = confirmDraft({ repo: makeRepo("ok") });
    const result = await svc({ tenantId: "t", draftId: "d", actorUserId: "u" });
    expect(result.isOk()).toBe(true);
  });

  it("returns err with kind=DraftNotFound when repo returns 'not_found'", async () => {
    const svc = confirmDraft({ repo: makeRepo("not_found") });
    const result = await svc({ tenantId: "t", draftId: "d", actorUserId: "u" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect((result.error as any).kind).toBe("DraftNotFound");
    }
  });

  it("returns err with kind=AlreadyConfirmed when repo returns 'already_confirmed'", async () => {
    const svc = confirmDraft({ repo: makeRepo("already_confirmed") });
    const result = await svc({ tenantId: "t", draftId: "d", actorUserId: "u" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect((result.error as any).kind).toBe("AlreadyConfirmed");
    }
  });

  it("returns err with kind=AlreadyDismissed when repo returns 'already_dismissed'", async () => {
    const svc = confirmDraft({ repo: makeRepo("already_dismissed") });
    const result = await svc({ tenantId: "t", draftId: "d", actorUserId: "u" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect((result.error as any).kind).toBe("AlreadyDismissed");
    }
  });

  it("returns err with kind=Unknown when repo throws", async () => {
    const repo: ExpenseLedgerDraftPortRepo = {
      dismiss: async () => "ok",
      confirm: async () => {
        throw new Error("db_failure");
      },
    };
    const svc = confirmDraft({ repo });
    const result = await svc({ tenantId: "t", draftId: "d", actorUserId: "u" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect((result.error as any).kind).toBe("Unknown");
    }
  });
});
