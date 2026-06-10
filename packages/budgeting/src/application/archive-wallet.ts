/**
 * archive-wallet.ts — Application use case: archive a wallet.
 *
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md, 05-13 — decision C):
 *   Archiving a RESERVE wallet removes its balance from userDefined (= Σ
 *   RESERVE-wallet balances; the reserves summary filters archived_at IS NULL).
 *   It does NOT touch category reserve — internal (ΣR) is engine-derived. The
 *   surplus shifts, so the RESERVE_TOPUP task is recomputed. The OLD greedy
 *   wallet-delta recalc of stored per-category actuals is GONE.
 *
 * Archiving a CUSHION wallet removes its balance from the cushion pool →
 * CUSHION_BELOW_TARGET is recomputed (Phase 7 D-PH7-19).
 *
 * Reserve/cushion deps are optional so legacy callers that only archive plain
 * SPENDINGS wallets keep working.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { WalletRepo } from "../ports/wallet-repo";
import type { TaskRepo, TenantTx } from "../ports/task-repo";
import {
  recomputeReserveTopupTask,
  type RecomputeReserveTopupTaskDeps,
} from "./recompute-reserve-topup-task";
import { recomputeCushionTask } from "./recompute-cushion-task";
import type { FxProviderLike } from "./recurring-engine-fx";

export interface ArchiveWalletDeps {
  repo: WalletRepo;
  /** Phase 7 (D-PH7-04 / D-PH7-19): emit/resolve RESERVE_TOPUP + CUSHION tasks. */
  taskRepo?: TaskRepo;
  /** Replay orchestrator — surplus drives the RESERVE_TOPUP recompute when a
   *  RESERVE wallet leaves the pool (userDefined drops). */
  reservePositions?: RecomputeReserveTopupTaskDeps["reservePositions"];
  budgetCurrencyOf?: (tenantId: string) => Promise<string>;
  isReservesEnabled?: (tenantId: string) => Promise<boolean>;
  fxProvider?: FxProviderLike;
}

export function archiveWallet(deps: ArchiveWalletDeps) {
  return async (input: {
    tenantId: string;
    walletId: string;
    actorUserId: string;
  }): Promise<Result<{ id: string; archivedAt: string }, Error>> => {
    try {
      const wallet = await deps.repo.findById(input.tenantId, input.walletId);
      if (!wallet) {
        return err(new Error(`Wallet ${input.walletId} not found`));
      }

      const result = wallet.archive();
      if (result.isErr()) return err(result.error);

      await deps.repo.archive(input.tenantId, input.walletId, input.actorUserId);

      // Phase 7 (D-PH7-04): RESERVE_TOPUP recompute hook. Archiving a RESERVE
      // wallet drops userDefined (Σ RESERVE balances) → surplus moves. Gate on
      // the PRE-archive wallet type. A2 fallback own-tx after the archive lands.
      if (
        wallet.walletType === "RESERVE" &&
        deps.taskRepo &&
        deps.reservePositions &&
        deps.budgetCurrencyOf &&
        deps.isReservesEnabled
      ) {
        const taskRepo = deps.taskRepo;
        const reservePositions = deps.reservePositions;
        const budgetCurrencyOf = deps.budgetCurrencyOf;
        const isReservesEnabled = deps.isReservesEnabled;
        const recomputeR = await withTenantTx(
          TenantId(input.tenantId),
          UserId(input.actorUserId),
          async (tx) => {
            await recomputeReserveTopupTask(
              tx as unknown as TenantTx,
              { tenantId: input.tenantId, budgetId: input.tenantId },
              { taskRepo, reservePositions, budgetCurrencyOf, isReservesEnabled },
            );
          },
        );
        if (recomputeR.isErr()) {
          console.error(
            "[archive-wallet] reserve recompute failed:",
            recomputeR.error,
          );
        }
      }

      // Phase 7 (D-PH7-19): CUSHION_BELOW_TARGET recompute hook.
      if (wallet.walletType === "CUSHION" && deps.taskRepo && deps.fxProvider) {
        const taskRepo = deps.taskRepo;
        const fxProvider = deps.fxProvider;
        const recomputeR = await withTenantTx(
          TenantId(input.tenantId),
          UserId(input.actorUserId),
          async (tx) => {
            await recomputeCushionTask(
              tx as unknown as TenantTx,
              { tenantId: input.tenantId, budgetId: input.tenantId },
              { taskRepo, fxProvider },
            );
          },
        );
        if (recomputeR.isErr()) {
          console.error(
            "[archive-wallet] cushion recompute failed:",
            recomputeR.error,
          );
        }
      }

      return ok({
        id: input.walletId,
        archivedAt: wallet.archivedAt!.toISOString(),
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
