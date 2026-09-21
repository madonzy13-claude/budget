/**
 * confirm-draft.ts — Per-occurrence confirm of a scheduled draft (CASE B).
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
  /**
   * 260921: a confirm flips `confirmed_at`, so the row becomes COUNTED SPEND —
   * which can overspend a category, draw that category's reserve, and move the
   * surplus the RESERVE_TOPUP task reports.
   *
   * Every other mutation that can move that surplus already refreshes the task
   * (create-transaction, set-wallet-balance, adjust-category-reserve, and the
   * sibling confirm-scheduled-draft). This one did not — and it is the one the
   * app actually runs, since the scheduled-payments route calls it and
   * confirm-scheduled-draft is wired to no route at all. So the reserves pill
   * kept the amount it had been emitted with while the Overview, which
   * recomputes on read, moved on.
   *
   * The module's own composed recompute, rather than its three ingredients: it
   * already owns the tx and the currency/enabled lookups, and duplicating that
   * wiring here is how the two would drift apart again.
   */
  recomputeReserveTopup?: (input: {
    tenantId: string;
    budgetId: string;
    actorUserId: string;
  }) => Promise<void>;
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

      // …and the reserve the confirm may have just drawn.
      if (deps.recomputeReserveTopup) {
        try {
          await deps.recomputeReserveTopup({
            tenantId: input.tenantId,
            // v1.1 invariant: budgetId === tenantId.
            budgetId: input.tenantId,
            actorUserId: input.actorUserId,
          });
        } catch (e) {
          // Never fail the confirm over the task: the payment IS recorded, and
          // the hourly sweep reconverges the amount.
          console.error("[confirm-draft] reserve-topup recompute failed:", e);
        }
      }

      return ok(undefined);
    } catch (e) {
      const wrapped = Object.assign(e as Error, { kind: "Unknown" as const });
      return err(wrapped as ConfirmDraftError);
    }
  };
}
