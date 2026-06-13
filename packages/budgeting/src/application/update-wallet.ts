/**
 * update-wallet.ts — Application use case: partial PATCH of a wallet.
 *
 * Enforces the reserve-currency invariant (D-PH5-R3, Pitfall 4) on EVERY PATCH
 * where the EFFECTIVE wallet type ends up RESERVE — regardless of which field the
 * caller actually changed (type, currency, or both).
 *
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md, 05-13 — decision C):
 *   A type flip (SPENDINGS↔RESERVE) or an amount change on a RESERVE wallet
 *   changes which wallets count toward userDefined (= Σ RESERVE balances). It
 *   does NOT allocate reserve to categories — internal (ΣR) is engine-derived.
 *   The surplus shifts, so the RESERVE_TOPUP task is recomputed when the wallet
 *   was-or-is RESERVE. The OLD greedy wallet-delta allocation into stored
 *   per-category actuals is GONE. The RESERVE response summary comes from the
 *   orchestrator.
 *
 * Plan 05-03 / WALT-01..03; 05-13 reserve rewrite.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { Money } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { Currency } from "@budget/shared-kernel";
import type { WalletRepo } from "../ports/wallet-repo";
import type { CategoriesRepo } from "../ports/categories-repo";
import type { WalletType } from "../domain/wallet";
import { buildReservesSummaryDto } from "./reserves-summary-builder";
import { type ReservesSummaryDto } from "./get-reserves-summary";
import type { TaskRepo, TenantTx } from "../ports/task-repo";
import {
  recomputeReserveTopupTask,
  type RecomputeReserveTopupTaskDeps,
} from "./recompute-reserve-topup-task";
import { recomputeCushionTask } from "./recompute-cushion-task";
import type { FxProviderLike } from "./recurring-engine-fx";

export interface UpdateWalletDeps {
  repo: WalletRepo;
  budgetCurrencyOf: (tenantId: string) => Promise<string>;
  /** Reserve response summary (RESERVE wallets): category list for the DTO. */
  categoriesRepo?: CategoriesRepo;
  /** Replay orchestrator — userDefined (Σ RESERVE balances) + engine R. */
  reservePositions?: RecomputeReserveTopupTaskDeps["reservePositions"];
  /** Phase 7 (D-PH7-04, Pitfall 1): when provided, recompute the RESERVE_TOPUP
   *  task in a follow-up tx after the wallet PATCH lands. */
  taskRepo?: TaskRepo;
  isReservesEnabled?: (tenantId: string) => Promise<boolean>;
  /** Phase 7 (D-PH7-19): when provided alongside taskRepo, recompute the
   *  CUSHION_BELOW_TARGET task after a PATCH that was-or-becomes CUSHION. */
  fxProvider?: FxProviderLike;
}

export interface UpdateWalletInput {
  tenantId: string;
  walletId: string;
  actorUserId: string;
  name?: string;
  amount?: string;
  currency?: string;
  walletType?: WalletType;
  color?: string | null;
  icon?: string | null;
}

export interface UpdateWalletResult {
  wallet: {
    id: string;
    name: string;
    walletType: WalletType;
    currency: string;
    currentBalanceCents: string;
  };
  /** Present when the patch affected a RESERVE wallet (was or is RESERVE). */
  summary?: ReservesSummaryDto;
}

export function updateWallet(deps: UpdateWalletDeps) {
  return async (
    input: UpdateWalletInput,
  ): Promise<Result<UpdateWalletResult, Error>> => {
    try {
      const wallet = await deps.repo.findById(input.tenantId, input.walletId);
      if (!wallet) return err(new Error("not_found"));

      const effectiveType: WalletType = input.walletType ?? wallet.walletType;
      const effectiveCurrency: string = input.currency ?? wallet.currency;
      const budgetCcy = await deps.budgetCurrencyOf(input.tenantId);

      if (effectiveType === "RESERVE") {
        if (effectiveCurrency.toUpperCase() !== budgetCcy.toUpperCase()) {
          return err(new Error("reserve_currency_mismatch"));
        }
      }

      // Capture pre-mutation type so SPENDINGS↔RESERVE / SPENDINGS↔CUSHION flips
      // fire the right recompute hook below.
      const wasReserve = wallet.walletType === "RESERVE";
      const wasCushion = wallet.walletType === "CUSHION";

      if (input.name !== undefined) {
        const r = wallet.rename(input.name);
        if (r.isErr()) return err(r.error);
      }
      if (input.walletType !== undefined) {
        const r = wallet.changeType(input.walletType);
        if (r.isErr()) return err(r.error);
      }
      if (input.currency !== undefined) {
        const r = wallet.changeCurrency(input.currency);
        if (r.isErr()) return err(r.error);
      }
      if (input.amount !== undefined) {
        const amt = Money.of(input.amount, wallet.currency as Currency);
        const r = wallet.setAmount(amt);
        if (r.isErr()) return err(r.error);
      }

      const patch: {
        name?: string;
        amount?: string;
        currency?: string;
        walletType?: WalletType;
        color?: string | null;
        icon?: string | null;
      } = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.amount !== undefined) patch.amount = input.amount;
      if (input.currency !== undefined)
        patch.currency = input.currency.toUpperCase();
      if (input.walletType !== undefined) patch.walletType = input.walletType;
      if (input.color !== undefined) patch.color = input.color;
      if (input.icon !== undefined) patch.icon = input.icon;

      // Persist FIRST so the orchestrator's wallet sum (userDefined) reflects the
      // new type/amount when we build the response summary + recompute the task.
      await deps.repo.update(
        input.tenantId,
        input.walletId,
        patch,
        input.actorUserId,
      );

      const isReserveNow = wallet.walletType === "RESERVE";

      // RESERVE response summary (decision C): engine-derived, NO allocation.
      let summary: ReservesSummaryDto | undefined;
      if (
        (wasReserve || isReserveNow) &&
        deps.categoriesRepo &&
        deps.reservePositions &&
        deps.isReservesEnabled
      ) {
        const [enabled, posR, categories] = await Promise.all([
          deps.isReservesEnabled(input.tenantId),
          deps.reservePositions({
            tenantId: input.tenantId,
            budgetId: input.tenantId,
          }),
          deps.categoriesRepo.list(input.tenantId),
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
          budgetCurrency: budgetCcy,
          disabled: !enabled,
        });
      }

      // Phase 7 (D-PH7-04, Pitfall 1): RESERVE_TOPUP recompute hook.
      // A SPENDINGS→RESERVE flip changes the reserve wallet pool, so the gate
      // fires when the wallet was OR became RESERVE-type.
      if (
        (wasReserve || isReserveNow) &&
        deps.taskRepo &&
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

      // Phase 7 (D-PH7-19, Pitfall 1): CUSHION_BELOW_TARGET recompute hook.
      const isCushionNow = wallet.walletType === "CUSHION";
      if ((wasCushion || isCushionNow) && deps.taskRepo && deps.fxProvider) {
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

      const balanceCentsStr = wallet.currentBalance.amount
        .times("100")
        .toFixed(0);

      return ok({
        wallet: {
          id: wallet.id,
          name: wallet.name,
          walletType: wallet.walletType,
          currency: wallet.currency,
          currentBalanceCents: balanceCentsStr,
        },
        ...(summary ? { summary } : {}),
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
