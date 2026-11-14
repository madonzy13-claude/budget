/**
 * change-category-currency.ts — D-07: change a category's currency after it
 * has transactions. Its limit converts at today's rate for the current and
 * future months; past months, the ledger and every stored amount stay as they
 * are (the reserve replay re-expresses them, D-17). New transactions default
 * to the new currency (D-05).
 *
 * After the change the reserve and the projected-shortfall tasks are
 * recomputed best-effort (precedent: set-category-limit.ts) — never failing
 * the change itself.
 */
import { ok, err, serverNow, TenantId, UserId, type Result } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import type { CategoryLimitRepo } from "../ports/category-limit-repo";
import type { TenantTx } from "../ports/task-repo";
import { recomputeReserveTopupTask, type RecomputeReserveTopupTaskDeps } from "./recompute-reserve-topup-task";
import {
  recomputeIncomeUnderPlannedTask,
  type RecomputeIncomeUnderPlannedDeps,
} from "./recompute-income-under-planned-task";

export interface ChangeCategoryCurrencyDeps {
  limitRepo: CategoryLimitRepo;
  reserveTask?: RecomputeReserveTopupTaskDeps;
  incomeTask?: RecomputeIncomeUnderPlannedDeps;
}

export function changeCategoryCurrency(deps: ChangeCategoryCurrencyDeps) {
  return async (input: {
    tenantId: string;
    userId: string;
    categoryId: string;
    currency: string;
    /** 'YYYY-MM-01' — the month being viewed (see the port). */
    month?: string;
  }): Promise<
    Result<{ category: { id: string; currency: string }; limitsConverted: number; month?: string }, Error>
  > => {
    if (!deps.limitRepo.changeCategoryCurrency) return err(new Error("not_supported"));
    try {
      const r = await deps.limitRepo.changeCategoryCurrency({
        tenantId: input.tenantId,
        actorUserId: input.userId,
        categoryId: input.categoryId,
        currency: input.currency,
        now: serverNow(),
        ...(input.month ? { month: input.month } : {}),
      });
      if (r.status === "not_found") return err(new Error("not_found"));
      if (r.status === "no_rate") {
        return err(Object.assign(new Error("fx_rate_unavailable"), { pair: `${r.fromCurrency}/${r.toCurrency}` }));
      }
      if (r.status === "changed") {
        const scope = { tenantId: input.tenantId, budgetId: input.tenantId };
        for (const [name, run] of [
          ["reserve", deps.reserveTask && ((tx: TenantTx) => recomputeReserveTopupTask(tx, scope, deps.reserveTask!))],
          ["income", deps.incomeTask && ((tx: TenantTx) => recomputeIncomeUnderPlannedTask(tx, scope, deps.incomeTask!))],
        ] as const) {
          if (!run) continue;
          const t = await withTenantTx(TenantId(input.tenantId), UserId(input.userId), (tx) => run(tx as unknown as TenantTx));
          if (t.isErr()) console.error(`[change-category-currency] ${name} recompute failed:`, t.error);
        }
      }
      const month = r.status === "changed" ? r.month : undefined;
      return ok({
        // One past month changed: the category itself kept its currency.
        category: {
          id: input.categoryId,
          currency: (r.status === "changed" && r.categoryCurrency) || input.currency,
        },
        limitsConverted: r.status === "changed" ? r.limitsConverted : 0,
        ...(month ? { month } : {}),
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
