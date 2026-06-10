/**
 * dismiss-draft.ts — Per-occurrence dismiss of a recurring draft.
 * RECR-06, D-PH4-R3: sets dismissed_at = now() on this occurrence only.
 * The recurring_rule keeps running; next month's draft will materialize.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { ExpenseLedgerDraftPortRepo } from "../ports/expense-ledger-draft-port-repo";
import type { TaskRepo, TenantTx } from "../ports/task-repo";

export interface DismissDraftDeps {
  repo: ExpenseLedgerDraftPortRepo;
  /** Phase 7 (D-PH7-10): auto-resolve the CONFIRM_DRAFT task on dismiss. */
  taskRepo?: TaskRepo;
}

export interface DismissDraftInput {
  tenantId: string;
  draftId: string;
  actorUserId: string;
}

export type DismissDraftError =
  | (Error & { kind: "DraftNotFound" })
  | (Error & { kind: "AlreadyConfirmed" })
  | (Error & { kind: "Unknown" });

export function dismissDraft(deps: DismissDraftDeps) {
  return async (
    input: DismissDraftInput,
  ): Promise<Result<void, DismissDraftError>> => {
    try {
      const outcome = await deps.repo.dismiss(
        input.tenantId,
        input.draftId,
        input.actorUserId,
      );
      if (outcome === "not_found") {
        const e = Object.assign(new Error("draft_not_found"), {
          kind: "DraftNotFound" as const,
        });
        return err(e as DismissDraftError);
      }
      if (outcome === "already_confirmed") {
        const e = Object.assign(new Error("draft_already_confirmed"), {
          kind: "AlreadyConfirmed" as const,
        });
        return err(e as DismissDraftError);
      }

      // Phase 7 (D-PH7-10) — A2 fallback: deps.repo.dismiss owns its tx
      // (audit + outbox writes live inside); we open a separate withTenantTx
      // for the resolve so the banner refreshes on next poll. Trade-off:
      // a successful dismiss that races with a concurrent resolve could in
      // principle leave the task PENDING for one poll cycle, but the partial
      // unique index + idempotent UPDATE keeps the system convergent.
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
      return err(wrapped as DismissDraftError);
    }
  };
}
