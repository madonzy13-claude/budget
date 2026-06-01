/**
 * confirm-draft.ts — Per-occurrence confirm of a recurring draft (CASE B).
 * RECR-03, RECR-04: sets confirmed_at = now() with same SCD-2/audit/outbox pattern.
 * Rejects if already dismissed (dismissed_at NOT NULL) or already confirmed.
 *
 * Phase 7 (D-PH7-10) + UAT round 12: auto-resolves the underlying
 * CONFIRM_DRAFT task by draft_id so the BDP task badge / slider drop the
 * row on the same round-trip. Mirrors dismiss-draft.ts.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { ExpenseLedgerDraftPortRepo } from "../ports/expense-ledger-draft-port-repo";
import type { TaskRepo, TenantTx } from "../ports/task-repo";

export interface ConfirmDraftDeps {
  repo: ExpenseLedgerDraftPortRepo;
  /** Phase 7 (D-PH7-10): auto-resolve the CONFIRM_DRAFT task on confirm. */
  taskRepo?: TaskRepo;
}

export interface ConfirmDraftInput {
  tenantId: string;
  draftId: string;
  actorUserId: string;
  amountOverrideCents?: number;
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
        input.amountOverrideCents,
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

      // Phase 7 (D-PH7-10) + UAT round 12 — A2 fallback: deps.repo.confirm
      // owns its tx (audit + outbox writes live inside); we open a separate
      // withTenantTx for the resolve so the banner refreshes on next poll.
      // Trade-off: a successful confirm that races with a concurrent resolve
      // could in principle leave the task PENDING for one poll cycle, but
      // the partial unique index + idempotent UPDATE keeps the system
      // convergent. Mirrors dismiss-draft.ts.
      if (deps.taskRepo) {
        const taskRepo = deps.taskRepo;
        await withTenantTx(
          TenantId(input.tenantId),
          UserId(input.actorUserId),
          async (tx) => {
            await taskRepo.resolveConfirmDraftByDraftId(
              input.tenantId,
              input.draftId,
              tx as unknown as TenantTx,
            );
          },
        );
      }

      return ok(undefined);
    } catch (e) {
      const wrapped = Object.assign(e as Error, { kind: "Unknown" as const });
      return err(wrapped as ConfirmDraftError);
    }
  };
}
