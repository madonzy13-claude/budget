/**
 * set-wallet-balance.ts — Application use case: overwrite wallet balance.
 *
 * D-PH2-09 (amended): wallet balance is fully decoupled from transactions.
 * Only this use case mutates current_balance, and only with an absolute value.
 *
 * UAT-PH5-T3-54 (architecture pivot for RESERVE wallets):
 *   When the edited wallet is walletType=RESERVE, the new balance changes the
 *   total reserve POOL. We must redistribute the delta to category `actuals`:
 *     - positive delta → refill underfunded categories in sort_index ASC
 *     - negative delta → if Σactual exceeds the new pool, deduct bottom-up
 *   Spending/Cushion wallets bypass this logic (no reserve actual coupling).
 */
import Big from "big.js";
import { ok, err, type Result } from "@budget/shared-kernel";
import type { WalletRepo } from "../ports/wallet-repo";
import type { CategoriesRepo } from "../ports/categories-repo";
import type { ReserveBalanceRepo } from "../ports/reserve-balance-repo";
import type { ReservesSummaryRepo } from "../ports/reserves-summary-repo";
import type { SetBalanceInput } from "../contracts/api";
import { applyWalletDelta, type ReserveRow } from "../domain/reserve-allocator";

export interface SetWalletBalanceDeps {
  repo: WalletRepo;
  /** UAT-PH5-T3-54 deps — only used when the wallet is RESERVE-type. */
  categoriesRepo?: CategoriesRepo;
  reserveBalanceRepo?: ReserveBalanceRepo;
  reservesSummaryRepo?: ReservesSummaryRepo;
}

export interface SetWalletBalanceFullInput extends SetBalanceInput {
  tenantId: string;
  walletId: string;
  actorUserId: string;
}

export interface SetWalletBalanceResult {
  walletId: string;
  currentBalance: string;
  currency: string;
}

export function setWalletBalance(deps: SetWalletBalanceDeps) {
  return async (
    input: SetWalletBalanceFullInput,
  ): Promise<Result<SetWalletBalanceResult, Error>> => {
    try {
      const wallet = await deps.repo.findById(input.tenantId, input.walletId);
      if (!wallet) return err(new Error("wallet_not_found"));

      const newCents = BigInt(new Big(input.amount).times("100").toFixed(0));

      if (
        wallet.walletType === "RESERVE" &&
        deps.categoriesRepo &&
        deps.reserveBalanceRepo &&
        deps.reservesSummaryRepo
      ) {
        const oldWalletCents = BigInt(
          wallet.currentBalance.amount.times("100").toFixed(0),
        );
        const oldPool = await deps.reservesSummaryRepo.sumReserveWalletAmounts(
          input.tenantId,
        );
        const newPool = oldPool + (newCents - oldWalletCents);

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

      await deps.repo.setBalance(
        input.tenantId,
        input.walletId,
        { amount: input.amount, currency: input.currency },
        input.actorUserId,
      );
    } catch (e) {
      return err(e as Error);
    }

    return ok({
      walletId: input.walletId,
      currentBalance: input.amount,
      currency: input.currency,
    });
  };
}
