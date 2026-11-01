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
      const [rows, order, ins] = await Promise.all([
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
        deps.historyRepo.contributionsByType(
          input.tenantId,
          input.actorUserId,
          input.budgetId,
        ),
      ]);
      // R6 (user): what each type was given from outside, at the entry's date.
      const contributed = new Map<string, Big>();
      for (const row of ins) {
        let rate = "1";
        if (row.currency !== input.budgetCurrency)
          try {
            rate = (
              await deps.fxProvider.rateAsOf(
                row.currency as never,
                input.budgetCurrency as never,
                new Date(`${row.effectiveDate}T12:00:00Z`),
              )
            ).rate;
          } catch {
            continue;
          }
        contributed.set(
          row.uiType,
          (contributed.get(row.uiType) ?? new Big(0)).plus(
            new Big(row.amountCents.toString()).times(rate),
          ),
        );
      }
      // R6 (user): realized happened on the sale's date — convert it at that
      // day's rate. A row without a date (older repos) falls back to today.
      const onDay = (row: { effectiveDate?: string }) =>
        row.effectiveDate
          ? new Date(`${row.effectiveDate}T12:00:00Z`)
          : new Date();
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
      // R6 (user): each asset's realized in its OWN currency — exact where
      // the booking allows, the sale date's rate for the remaining rows.
      const asset = new Map<string, { r: Big; ccy: string }>();
      for (const row of rows) {
        if (!row.costCurrency) continue;
        let r = new Big((row.realizedAssetExactCents ?? 0n).toString());
        const rest = row.realizedBudgetRestCents ?? 0n;
        if (rest !== 0n)
          try {
            r = r.plus(
              new Big(rest.toString()).times(
                (
                  await deps.fxProvider.rateAsOf(
                    row.budgetCurrency as never,
                    row.costCurrency as never,
                    onDay(row),
                  )
                ).rate,
              ),
            );
          } catch {
            /* WR-10: a missing rate drops that part, never the summary */
          }
        // R6 (user): shown in the asset's display currency (the sale's rate).
        const shown = row.displayCurrency || row.costCurrency;
        if (shown !== row.costCurrency && !r.eq(0))
          try {
            r = r.times(
              (
                await deps.fxProvider.rateAsOf(
                  row.costCurrency as never,
                  shown as never,
                  onDay(row),
                )
              ).rate,
            );
          } catch {
            /* WR-10: keep the cost-currency figure rather than fail */
          }
        const cur = asset.get(row.holdingId);
        asset.set(row.holdingId, {
          r: (cur?.r ?? new Big(0)).plus(r),
          ccy: shown,
        });
      }
      for (const row of rows) {
        // Rows booked in an older budget currency: the sale date's rate. A missing
        // rate skips that row instead of failing every header (WR-10).
        let rate = "1";
        if (row.budgetCurrency !== input.budgetCurrency)
          try {
            rate = (
              await deps.fxProvider.rateAsOf(
                row.budgetCurrency as never,
                input.budgetCurrency as never,
                onDay(row),
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
        types: Object.fromEntries(
          [...new Set([...sums.keys(), ...contributed.keys()])].map((t) => {
            const base = out(sums)[t] ?? {
              realizedBudgetCents: "0",
              soldCostBudgetCents: "0",
            };
            const c = contributed.get(t);
            return [
              t,
              c
                ? { ...base, contributedBudgetCents: c.round(0, 2).toFixed(0) }
                : base,
            ];
          }),
        ),
        holdings: Object.fromEntries(
          Object.entries(out(perHolding)).map(([id, v]) => {
            const a = asset.get(id);
            return [
              id,
              {
                ...v,
                realizedAssetCents: (a?.r ?? new Big(0)).round(0, 2).toFixed(0),
                assetCurrency: a?.ccy ?? input.budgetCurrency,
              },
            ];
          }),
        ),
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
