/**
 * archive-wallet.ts — Application use case: archive a wallet.
 *
 * UAT-PH5-T3-59 (regression fix): archiving a RESERVE-type wallet removes
 * its contribution from the reserve POOL. Without this, category
 * `reserve_actual_cents` lingers at its pre-archive snapshot — when the
 * last RESERVE wallet is archived every category still shows its old
 * actual allocation but Σ wallets is zero, leaving the share math stuck.
 *
 * Mirror of set-wallet-balance.ts: compute newPool = oldPool − walletCents,
 * run `applyWalletDelta` to redistribute (deduct bottom-up when newPool
 * drops below Σactuals; refill underfunded otherwise), persist via
 * `setReserveActualMany`. Spending/Cushion wallets bypass this branch.
 *
 * Deps for the reserve branch are optional so legacy callers that only
 * archive non-reserve wallets keep working.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { WalletRepo } from "../ports/wallet-repo";
import type { CategoriesRepo } from "../ports/categories-repo";
import type { ReserveBalanceRepo } from "../ports/reserve-balance-repo";
import type { ReservesSummaryRepo } from "../ports/reserves-summary-repo";
import { applyWalletDelta, type ReserveRow } from "../domain/reserve-allocator";
import type { TaskRepo, TenantTx } from "../ports/task-repo";
import { recomputeCushionTask } from "./recompute-cushion-task";
import type { FxProviderLike } from "./recurring-engine-fx";

export interface ArchiveWalletDeps {
  repo: WalletRepo;
  /** UAT-PH5-T3-59 — only consulted when the archived wallet is RESERVE-type. */
  categoriesRepo?: CategoriesRepo;
  reserveBalanceRepo?: ReserveBalanceRepo;
  reservesSummaryRepo?: ReservesSummaryRepo;
  /** Phase 7 (D-PH7-19): when provided alongside fxProvider, recompute the
   *  CUSHION_BELOW_TARGET task in a follow-up tx after a CUSHION wallet is
   *  archived (removes its balance from the cushion pool). Optional so
   *  legacy callers keep compiling. */
  taskRepo?: TaskRepo;
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

      // UAT-PH5-T3-59: redistribute reserve actuals before persisting the
      // archive so the same transactional context sees the updated rows.
      if (
        wallet.walletType === "RESERVE" &&
        deps.categoriesRepo &&
        deps.reserveBalanceRepo &&
        deps.reservesSummaryRepo
      ) {
        const walletCents = BigInt(
          wallet.currentBalance.amount.times("100").toFixed(0),
        );
        const oldPool = await deps.reservesSummaryRepo.sumReserveWalletAmounts(
          input.tenantId,
        );
        const newPool = oldPool - walletCents;

        if (newPool !== oldPool) {
          const asOf = new Date();
          const [activeMap, excludedMap, allCats] = await Promise.all([
            deps.reserveBalanceRepo.getForBudget(
              input.tenantId,
              input.tenantId,
              asOf,
            ),
            deps.reserveBalanceRepo.getExcludedForBudget(
              input.tenantId,
              input.tenantId,
              asOf,
            ),
            deps.categoriesRepo.list(input.tenantId),
          ]);

          const rows: ReserveRow[] = allCats.map((c) => {
            const m = c.reserveExcluded
              ? excludedMap.get(c.id)
              : activeMap.get(c.id);
            const expectedCents = m
              ? BigInt(m.amount.times("100").toFixed(0))
              : 0n;
            return {
              categoryId: c.id,
              sortIndex: c.sortIndex ?? 0,
              reserveExcluded: c.reserveExcluded,
              expectedCents,
              actualCents: c.reserveActualCents ?? 0n,
            };
          });

          const allocResult = applyWalletDelta(rows, oldPool, newPool);
          const updates = new Map<string, bigint>();
          for (const after of allocResult.rows) {
            const before = rows.find((r) => r.categoryId === after.categoryId)!;
            if (before.actualCents !== after.actualCents) {
              updates.set(after.categoryId, after.actualCents);
            }
          }
          if (updates.size > 0) {
            await deps.categoriesRepo.setReserveActualMany(
              input.tenantId,
              updates,
              input.actorUserId,
            );
          }
        }
      }

      await deps.repo.archive(
        input.tenantId,
        input.walletId,
        input.actorUserId,
      );

      // Phase 7 (D-PH7-19): CUSHION_BELOW_TARGET recompute hook.
      // Gate on the PRE-archive wallet type — archiving a CUSHION wallet
      // removes its balance from the cushion pool sum (cushion summary
      // filters `archived_at IS NULL`), so shortfall can grow and an open
      // task may need to emit (or vice versa). A2 fallback: separate
      // withTenantTx after the archive write lands.
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
