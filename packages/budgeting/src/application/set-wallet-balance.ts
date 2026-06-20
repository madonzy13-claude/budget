/**
 * set-wallet-balance.ts — Application use case: overwrite a wallet balance.
 *
 * D-PH2-09 (amended): wallet balance is fully decoupled from transactions.
 * Only this use case mutates current_balance, and only with an absolute value.
 *
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md, 05-13 — decision C):
 *   Editing a RESERVE wallet changes ONLY the wallet's current_balance, which
 *   moves userDefined (= Σ RESERVE-wallet balances). It does NOT allocate
 *   reserve to categories — internal (ΣR) is engine-derived and unaffected by
 *   the wallet edit. The surplus (userDefined − internal) shifts, so the
 *   RESERVE_TOPUP task is recomputed. The OLD greedy wallet-delta allocation
 *   into stored per-category actuals is GONE.
 *
 * Perf option A: returns the post-mutation engine-derived ReservesSummaryDto so
 * the client can skip the refetch round-trip after a RESERVE wallet edit.
 */
import Big from "big.js";
import { ok, err, type Result } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { WalletRepo } from "../ports/wallet-repo";
import type { CategoriesRepo } from "../ports/categories-repo";
import type { SetBalanceInput } from "../contracts/api";
import { buildReservesSummaryDto } from "./reserves-summary-builder";
import { type ReservesSummaryDto } from "./get-reserves-summary";
import type { TaskRepo, TenantTx } from "../ports/task-repo";
import {
  recomputeReserveTopupTask,
  type RecomputeReserveTopupTaskDeps,
} from "./recompute-reserve-topup-task";
import { recomputeCushionTask } from "./recompute-cushion-task";
import type { FxProviderLike } from "./recurring-engine-fx";

export interface SetWalletBalanceDeps {
  repo: WalletRepo;
  /** Reserve response summary (RESERVE wallets): category list for the DTO. */
  categoriesRepo?: CategoriesRepo;
  budgetCurrencyOf?: (tenantId: string) => Promise<string>;
  /** Replay orchestrator — userDefined (Σ RESERVE balances) + engine R. Drives
   *  the response summary AND the RESERVE_TOPUP recompute. */
  reservePositions?: RecomputeReserveTopupTaskDeps["reservePositions"];
  /** Phase 7 (D-PH7-04): when provided, recompute the RESERVE_TOPUP task in a
   *  follow-up tx after the balance change lands. Optional so legacy callers
   *  (tests, alternate boot paths) keep compiling. */
  taskRepo?: TaskRepo;
  isReservesEnabled?: (tenantId: string) => Promise<boolean>;
  /** Phase 7 (D-PH7-19): when provided alongside taskRepo, recompute the
   *  CUSHION_BELOW_TARGET task after a CUSHION wallet's balance change lands. */
  fxProvider?: FxProviderLike;
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

      // Persist the new balance FIRST so the orchestrator's wallet sum
      // (userDefined) reflects the edit when we build the response summary.
      await deps.repo.setBalance(
        input.tenantId,
        input.walletId,
        { amount: input.amount, currency: input.currency },
        input.actorUserId,
      );
      // Sanity: the amount is a valid decimal (throws otherwise, caught below).
      void BigInt(new Big(input.amount).times("100").toFixed(0));

      // RESERVE response summary (decision C): engine-derived. NO allocation —
      // only userDefined (Σ RESERVE balances) changed; internal/R is unchanged.
      if (
        wallet.walletType === "RESERVE" &&
        deps.categoriesRepo &&
        deps.budgetCurrencyOf &&
        deps.reservePositions &&
        deps.isReservesEnabled
      ) {
        const [enabled, posR, categories, budgetCurrency] = await Promise.all([
          deps.isReservesEnabled(input.tenantId),
          deps.reservePositions({
            tenantId: input.tenantId,
            budgetId: input.tenantId,
          }),
          deps.categoriesRepo.list(input.tenantId),
          deps.budgetCurrencyOf(input.tenantId),
        ]);
        if (posR.isErr()) return err(posR.error);
        summary = buildReservesSummaryDto({
          positions: posR.value,
          categories: categories.map((c) => ({
            id: c.id,
            name: c.name,
            reserveExcluded: c.reserveExcluded ?? false,
            colorKey: c.colorKey ?? null,
          })),
          budgetCurrency,
          disabled: !enabled,
        });
      }

      // Phase 7 (D-PH7-04): RESERVE_TOPUP recompute hook.
      // Gate on the wallet being RESERVE-type — SPENDINGS/CUSHION balance
      // changes do not touch the reserve equation. set-wallet-balance cannot
      // change wallet type; the type-change path lives in update-wallet.ts.
      //
      // A2 fallback: deps.repo.setBalance owns its inner tx (audit + outbox);
      // we open a separate withTenantTx for the recompute. Race window bounded
      // by ON CONFLICT DO NOTHING + WHERE PENDING (recompute-reserve-topup-task).
      if (
        wallet.walletType === "RESERVE" &&
        deps.taskRepo &&
        deps.budgetCurrencyOf &&
        deps.isReservesEnabled &&
        deps.reservePositions
      ) {
        const taskRepo = deps.taskRepo;
        const budgetCurrencyOf = deps.budgetCurrencyOf;
        const isReservesEnabled = deps.isReservesEnabled;
        const reservePositions = deps.reservePositions;
        await withTenantTx(
          TenantId(input.tenantId),
          UserId(input.actorUserId),
          async (tx) => {
            await recomputeReserveTopupTask(
              tx as unknown as TenantTx,
              { tenantId: input.tenantId, budgetId: input.tenantId },
              { taskRepo, budgetCurrencyOf, isReservesEnabled, reservePositions },
            );
          },
        );
      }

      // Phase 7 (D-PH7-19): CUSHION_BELOW_TARGET recompute hook.
      if (wallet.walletType === "CUSHION" && deps.taskRepo && deps.fxProvider) {
        const taskRepo = deps.taskRepo;
        const fxProvider = deps.fxProvider;
        await withTenantTx(
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
