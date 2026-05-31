/**
 * update-wallet.ts — Application use case: partial PATCH of a wallet.
 *
 * Enforces the reserve-currency invariant (D-PH5-R3, Pitfall 4) on EVERY PATCH
 * where the EFFECTIVE wallet type ends up RESERVE — regardless of which field the
 * caller actually changed (type, currency, or both).
 *
 * UAT-PH5-T3-54: when `amount` changes on a RESERVE wallet, applies the same
 * pool redistribution as setWalletBalance (allocator.applyWalletDelta) and
 * returns the post-mutation reserves summary so the client skips a refetch.
 *
 * Plan 05-03 / WALT-01..03.
 */
import Big from "big.js";
import { ok, err, type Result } from "@budget/shared-kernel";
import { Money } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { Currency } from "@budget/shared-kernel";
import type { WalletRepo } from "../ports/wallet-repo";
import type { CategoriesRepo } from "../ports/categories-repo";
import type { ReserveBalanceRepo } from "../ports/reserve-balance-repo";
import type { ReservesSummaryRepo } from "../ports/reserves-summary-repo";
import type { WalletType } from "../domain/wallet";
import { applyWalletDelta, type ReserveRow } from "../domain/reserve-allocator";
import type { ReservesSummaryDto } from "./get-reserves-summary";
import { buildReservesSummaryDto } from "./reserves-summary-builder";
import type { TaskRepo, TenantTx } from "../ports/task-repo";
import { recomputeReserveTopupTask } from "./recompute-reserve-topup-task";
import { recomputeCushionTask } from "./recompute-cushion-task";
import type { FxProviderLike } from "./recurring-engine-fx";

export interface UpdateWalletDeps {
  repo: WalletRepo;
  budgetCurrencyOf: (tenantId: string) => Promise<string>;
  /** UAT-PH5-T3-54 deps — only used when amount changes on RESERVE wallet. */
  categoriesRepo?: CategoriesRepo;
  reserveBalanceRepo?: ReserveBalanceRepo;
  reservesSummaryRepo?: ReservesSummaryRepo;
  /** Phase 7 (D-PH7-04, Pitfall 1): when provided, recompute the
   *  RESERVE_TOPUP task in a follow-up tx after the wallet PATCH lands.
   *  Optional so legacy callers keep compiling. */
  taskRepo?: TaskRepo;
  isReservesEnabled?: (tenantId: string) => Promise<boolean>;
  /** Phase 7 (D-PH7-19): when provided alongside taskRepo, recompute the
   *  CUSHION_BELOW_TARGET task in a follow-up tx after a wallet PATCH that
   *  was-or-becomes CUSHION lands. Optional so legacy callers keep compiling. */
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
  /** Present when the patch affected a RESERVE wallet's amount. */
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

      // Capture pre-mutation pool for reserve redistribution.
      const wasReserve = wallet.walletType === "RESERVE";
      // Phase 7 (D-PH7-19, Pitfall 1): capture pre-mutation CUSHION-ness so
      // SPENDINGS↔CUSHION flips fire the cushion recompute hook below.
      const wasCushion = wallet.walletType === "CUSHION";
      const oldWalletCents = BigInt(
        wallet.currentBalance.amount.times("100").toFixed(0),
      );

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

      // UAT-PH5-T3-54: if the wallet was/became RESERVE and amount changed,
      // redistribute the delta to category actuals BEFORE persisting the
      // wallet update so the wallet-pool sum query reflects the OLD value.
      let summary: ReservesSummaryDto | undefined;
      const isReserveAfter = wallet.walletType === "RESERVE";
      if (
        input.amount !== undefined &&
        (wasReserve || isReserveAfter) &&
        deps.categoriesRepo &&
        deps.reserveBalanceRepo &&
        deps.reservesSummaryRepo
      ) {
        const newWalletCents = BigInt(
          new Big(input.amount).times("100").toFixed(0),
        );
        const oldPool = await deps.reservesSummaryRepo.sumReserveWalletAmounts(
          input.tenantId,
        );
        const newPool = wasReserve
          ? oldPool + (newWalletCents - oldWalletCents)
          : oldPool + newWalletCents;

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
          budgetCcy,
          newActualMap,
        );
      }

      await deps.repo.update(
        input.tenantId,
        input.walletId,
        patch,
        input.actorUserId,
      );

      // Phase 7 (D-PH7-04, Pitfall 1): RESERVE_TOPUP recompute hook.
      // update-wallet handles type changes — a SPENDINGS→RESERVE flip
      // changes the reserve wallet pool, so the gate must fire when the
      // wallet was OR became RESERVE-type (Pitfall 1 — RESEARCH.md).
      //
      // A2 fallback: deps.repo.update + the reserve allocator writes each
      // own their inner tx; we open a separate withTenantTx for the
      // recompute. Race window bounded by the idempotent ON CONFLICT DO
      // NOTHING + WHERE PENDING contract.
      const isReserveNow = wallet.walletType === "RESERVE";
      if (
        (wasReserve || isReserveNow) &&
        deps.taskRepo &&
        deps.categoriesRepo &&
        deps.reserveBalanceRepo &&
        deps.reservesSummaryRepo &&
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

      // Phase 7 (D-PH7-19, Pitfall 1): CUSHION_BELOW_TARGET recompute hook.
      // Pitfall-1-style gate: wasCushion OR isCushion (the wallet either was
      // or just became CUSHION). This catches:
      //   - balance change on an existing CUSHION wallet
      //   - SPENDINGS/RESERVE → CUSHION (wallet enters cushion pool)
      //   - CUSHION → SPENDINGS/RESERVE (wallet leaves cushion pool)
      //
      // A2 fallback: separate withTenantTx mirrors the RESERVE branch.
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
