/**
 * history-queries.ts — type-group reads (Phase 13; 13.1 moved the ledger read
 * to list-entries.ts and every edit to delete-entry.ts).
 *
 * typeSummary   — realized + sold cost per CURRENT ui_type, types with no held
 *                 holding included (D-14), plus the saved type order (D-12).
 * setTypeOrder  — per-budget type-group order.
 */
import { ok, err, type Result } from "neverthrow";
import Big from "big.js";
import type { FxProvider } from "@budget/shared-kernel";
import type { HistoryRepo } from "../ports/history-repo";
import type { TypeSummaryDto } from "../contracts/api";

type Who = { tenantId: string; budgetId: string; actorUserId: string };

export function typeSummary(deps: {
  historyRepo: HistoryRepo;
  fxProvider: FxProvider;
}) {
  return async (
    input: Who & { budgetCurrency: string },
  ): Promise<Result<TypeSummaryDto, Error>> => {
    try {
      const [rows, order] = await Promise.all([
        deps.historyRepo.realizedByType(
          input.tenantId,
          input.actorUserId,
          input.budgetId,
        ),
        deps.historyRepo.getTypeOrder(
          input.tenantId,
          input.actorUserId,
          input.budgetId,
        ),
      ]);
      const sums = new Map<string, { r: Big; s: Big }>();
      const perHolding = new Map<string, { r: Big; s: Big }>();
      const add = (
        m: Map<string, { r: Big; s: Big }>,
        k: string,
        r: Big,
        s: Big,
      ) => {
        const cur = m.get(k) ?? { r: new Big(0), s: new Big(0) };
        m.set(k, { r: cur.r.plus(r), s: cur.s.plus(s) });
      };
      for (const row of rows) {
        // Rows booked in an older budget currency: today's rate. A missing
        // rate skips that row instead of failing every header (WR-10).
        let rate = "1";
        if (row.budgetCurrency !== input.budgetCurrency)
          try {
            rate = (
              await deps.fxProvider.rateAsOf(
                row.budgetCurrency as never,
                input.budgetCurrency as never,
                new Date(),
              )
            ).rate;
          } catch {
            continue;
          }
        const r = new Big(row.realizedBudgetCents.toString()).times(rate);
        const s = new Big(row.soldCostBudgetCents.toString()).times(rate);
        add(sums, row.uiType, r, s);
        add(perHolding, row.holdingId, r, s);
      }
      const out = (m: Map<string, { r: Big; s: Big }>) =>
        Object.fromEntries(
          [...m].map(([k, v]) => [
            k,
            {
              realizedBudgetCents: v.r.round(0, 2).toFixed(0),
              soldCostBudgetCents: v.s.round(0, 2).toFixed(0),
            },
          ]),
        );
      return ok({
        currency: input.budgetCurrency,
        order,
        types: out(sums),
        holdings: out(perHolding),
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}

export function setTypeOrder(deps: { historyRepo: HistoryRepo }) {
  return async (
    input: Who & { order: string[] },
  ): Promise<Result<{ order: string[] }, Error>> => {
    try {
      await deps.historyRepo.setTypeOrder(
        input.tenantId,
        input.actorUserId,
        input.budgetId,
        input.order,
      );
      return ok({ order: input.order });
    } catch (e) {
      return err(e as Error);
    }
  };
}
