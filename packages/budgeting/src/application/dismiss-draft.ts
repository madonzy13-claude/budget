/**
 * dismiss-draft.ts — Per-occurrence dismiss of a recurring draft.
 * RECR-06, D-PH4-R3: sets dismissed_at = now() on this occurrence only.
 * The recurring_rule keeps running; next month's draft will materialize.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { ExpenseLedgerDraftPortRepo } from "../ports/expense-ledger-draft-port-repo";

export interface DismissDraftDeps {
  repo: ExpenseLedgerDraftPortRepo;
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

      // 260612-kxd T3: the CONFIRM_DRAFT task resolve now lives INSIDE
      // repo.dismiss's transaction (expense-ledger-draft-port-repo.ts) —
      // dismiss + resolve commit together. The Phase 7 "A2 fallback"
      // (separate withTenantTx here, one-poll orphan window) is gone.
      return ok(undefined);
    } catch (e) {
      const wrapped = Object.assign(e as Error, { kind: "Unknown" as const });
      return err(wrapped as DismissDraftError);
    }
  };
}
