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
 *
 * Perf option A: returns the post-mutation ReservesSummaryDto so the client
 * can skip the refetch round-trip after a RESERVE wallet edit.
 */
import Big from "big.js";
import { ok, err, type Result } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { WalletRepo } from "../ports/wallet-repo";
import type { CategoriesRepo } from "../ports/categories-repo";
import type { ReserveBalanceRepo } from "../ports/reserve-balance-repo";
import type { ReservesSummaryRepo } from "../ports/reserves-summary-repo";
import type { SetBalanceInput } from "../contracts/api";
import { applyWalletDelta, type ReserveRow } from "../domain/reserve-allocator";
import type { ReservesSummaryDto } from "./get-reserves-summary";
import { buildReservesSummaryDto } from "./reserves-summary-builder";
import type { TaskRepo, TenantTx } from "../ports/task-repo";
import { recomputeReserveTopupTask } from "./recompute-reserve-topup-task";

export interface SetWalletBalanceDeps {
  repo: WalletRepo;
  /** UAT-PH5-T3-54 deps — only used when the wallet is RESERVE-type. */
  categoriesRepo?: CategoriesRepo;
  reserveBalanceRepo?: ReserveBalanceRepo;
  reservesSummaryRepo?: ReservesSummaryRepo;
  budgetCurrencyOf?: (tenantId: string) => Promise<string>;
  /** Phase 7 (D-PH7-04): when provided, recompute the RESERVE_TOPUP task in
   *  a follow-up tx after the balance change lands. Optional so legacy
   *  callers (tests, alternate boot paths) keep compiling. */
  taskRepo?: TaskRepo;
  isReservesEnabled?: (tenantId: string) => Promise<boolean>;
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
  /** Present when the wallet was RESERVE-type and reserve deps were wired. */
  summary?: ReservesSummaryDto;
}

export function setWalletBalance(deps: SetWalletBalanceDeps) {
  return async (
    input: SetWalletBalanceFullInput,
  ): Promise<Result<SetWalletBalanceResult, Error>> => {
    let summary: ReservesSummaryDto | undefined;

    try {
      const wallet = await deps.repo.findById(input.tenantId, input.walletId);
      if (!wallet) return err(new Error("wallet_not_found"));

      const newCents = BigInt(new Big(input.amount).times("100").toFixed(0));

      if (
        wallet.walletType === "RESERVE" &&
        deps.categoriesRepo &&
        deps.reserveBalanceRepo &&
        deps.reservesSummaryRepo &&
        deps.budgetCurrencyOf
      ) {
        const oldWalletCents = BigInt(
          wallet.currentBalance.amount.times("100").toFixed(0),
        );
        const oldPool = await deps.reservesSummaryRepo.sumReserveWalletAmounts(
          input.tenantId,
        );
        const newPool = oldPool + (newCents - oldWalletCents);

        const asOf = new Date();
        const [activeMap, excludedMap, allCats, budgetCurrency] =
          await Promise.all([
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
            deps.budgetCurrencyOf(input.tenantId),
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

        let newActualMap: Map<string, bigint> | undefined;
        if (newPool !== oldPool) {
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
          newActualMap = new Map<string, bigint>();
          for (const r of allocResult.rows) {
            newActualMap.set(r.categoryId, r.actualCents);
          }
        }

        summary = buildReservesSummaryDto(
          activeMap,
          excludedMap,
          allCats,
          newPool,
          budgetCurrency,
          newActualMap,
        );
      }

      await deps.repo.setBalance(
        input.tenantId,
        input.walletId,
        { amount: input.amount, currency: input.currency },
        input.actorUserId,
      );

      // Phase 7 (D-PH7-04): RESERVE_TOPUP recompute hook.
      // Gate on the wallet being RESERVE-type — SPENDINGS/CUSHION balance
      // changes do not touch the reserve equation. set-wallet-balance.ts
      // cannot change wallet type; the type-change path lives in
      // update-wallet.ts which has its own broader gate (was-or-is RESERVE).
      //
      // A2 fallback: deps.repo.setBalance + the reserve allocator writes
      // each own their inner tx (audit + outbox); we open a separate
      // withTenantTx for the recompute so the banner refreshes on next
      // poll. Race window bounded by the idempotent ON CONFLICT DO NOTHING
      // + WHERE PENDING contract (see recompute-reserve-topup-task.ts).
      if (
        wallet.walletType === "RESERVE" &&
        deps.taskRepo &&
        deps.categoriesRepo &&
        deps.reserveBalanceRepo &&
        deps.reservesSummaryRepo &&
        deps.budgetCurrencyOf &&
        deps.isReservesEnabled
      ) {
        const taskRepo = deps.taskRepo;
        const categoriesRepo = deps.categoriesRepo;
        const reserveBalanceRepo = deps.reserveBalanceRepo;
        const reservesSummaryRepo = deps.reservesSummaryRepo;
        const budgetCurrencyOf = deps.budgetCurrencyOf;
        const isReservesEnabled = deps.isReservesEnabled;
        await withTenantTx(
          TenantId(input.tenantId),
          UserId(input.actorUserId),
          async (tx) => {
            await recomputeReserveTopupTask(
              tx as unknown as TenantTx,
              { tenantId: input.tenantId, budgetId: input.tenantId },
              {
                taskRepo,
                categoriesRepo,
                reserveBalanceRepo,
                reservesSummaryRepo,
                budgetCurrencyOf,
                isReservesEnabled,
              },
            );
          },
        );
      }
    } catch (e) {
      return err(e as Error);
    }

    return ok({
      walletId: input.walletId,
      currentBalance: input.amount,
      currency: input.currency,
      ...(summary ? { summary } : {}),
    });
  };
}
