/**
 * confirm-draft.ts — Per-occurrence confirm of a recurring draft (CASE B).
 * RECR-03, RECR-04: sets confirmed_at = now() with same SCD-2/audit/outbox pattern.
 * Rejects if already dismissed (dismissed_at NOT NULL) or already confirmed.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { ExpenseLedgerDraftPortRepo } from "../ports/expense-ledger-draft-port-repo";

export interface ConfirmDraftDeps {
  repo: ExpenseLedgerDraftPortRepo;
}

export interface ConfirmDraftInput {
  tenantId: string;
  draftId: string;
  actorUserId: string;
}

export type ConfirmDraftError =
  | (Error & { kind: "DraftNotFound" })
  | (Error & { kind: "AlreadyConfirmed" })
  | (Error & { kind: "AlreadyDismissed" })
  | (Error & { kind: "Unknown" });

export function confirmDraft(deps: ConfirmDraftDeps) {
  return async (
    input: ConfirmDraftInput,
  ): Promise<Result<void, ConfirmDraftError>> => {
    try {
      const outcome = await deps.repo.confirm(
        input.tenantId,
        input.draftId,
        input.actorUserId,
      );
      if (outcome === "not_found") {
        const e = Object.assign(new Error("draft_not_found"), {
          kind: "DraftNotFound" as const,
        });
        return err(e as ConfirmDraftError);
      }
      if (outcome === "already_confirmed") {
        const e = Object.assign(new Error("draft_already_confirmed"), {
          kind: "AlreadyConfirmed" as const,
        });
        return err(e as ConfirmDraftError);
      }
      if (outcome === "already_dismissed") {
        const e = Object.assign(new Error("draft_already_dismissed"), {
          kind: "AlreadyDismissed" as const,
        });
        return err(e as ConfirmDraftError);
      }
      return ok(undefined);
    } catch (e) {
      const wrapped = Object.assign(e as Error, { kind: "Unknown" as const });
      return err(wrapped as ConfirmDraftError);
    }
  };
}
