/**
 * history-queries.ts — Phase 13 reads + the two whole-holding operations.
 *
 * listHistory   — a holding's entries newest first (D-05), with the other
 *                 leg's holding name for conversions.
 * typeSummary   — realized + sold cost per CURRENT ui_type, types with no held
 *                 holding included (D-14), plus the saved type order (D-12).
 * setTypeOrder  — per-budget type-group order.
 * deleteHolding — "as if it never existed": undo every conversion it took part
 *                 in on the OTHER side (same reversal path as entry delete),
 *                 then hard-delete it (FK cascades its own rows).
 */
import { ok, err, type Result } from "neverthrow";
import Big from "big.js";
import type { FxProvider } from "@budget/shared-kernel";
import type { HoldingRepo } from "../ports/holding-repo";
import type { HistoryRepo, HoldingPatch } from "../ports/history-repo";
import type { HistoryEntryDto, TypeSummaryDto } from "../contracts/api";
import { planLegUndo } from "./reverse-history-entry";

type Who = { tenantId: string; budgetId: string; actorUserId: string };
const str = (v: bigint | null) => (v === null ? null : v.toString());

export function listHistory(deps: { historyRepo: HistoryRepo }) {
  return async (
    input: Who & { holdingId: string },
  ): Promise<Result<{ entries: HistoryEntryDto[] }, Error>> => {
    try {
      const rows = await deps.historyRepo.listForHolding(
        input.tenantId,
        input.actorUserId,
        input.holdingId,
      );
      return ok({
        entries: rows.reverse().map((r) => ({
          id: r.id,
          kind: r.kind,
          effectiveDate: r.effectiveDate,
          amountCents: str(r.amountCents),
          amountCurrency: r.amountCurrency,
          qtyDelta: r.qtyDelta,
          realizedBudgetCents: str(r.realizedBudgetCents),
          budgetCurrency: r.budgetCurrency,
          transferId: r.transferId,
          counterpartyName: r.counterpartyName,
          createdAt: r.createdAt,
        })),
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}

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
      for (const row of rows) {
        // Rows booked in an older budget currency: today's rate.
        const rate =
          row.budgetCurrency === input.budgetCurrency
            ? "1"
            : (
                await deps.fxProvider.rateAsOf(
                  row.budgetCurrency as never,
                  input.budgetCurrency as never,
                  new Date(),
                )
              ).rate;
        const cur = sums.get(row.uiType) ?? { r: new Big(0), s: new Big(0) };
        cur.r = cur.r.plus(
          new Big(row.realizedBudgetCents.toString()).times(rate),
        );
        cur.s = cur.s.plus(
          new Big(row.soldCostBudgetCents.toString()).times(rate),
        );
        sums.set(row.uiType, cur);
      }
      return ok({
        currency: input.budgetCurrency,
        order,
        types: Object.fromEntries(
          [...sums].map(([t, v]) => [
            t,
            {
              realizedBudgetCents: v.r.round(0, 2).toFixed(0),
              soldCostBudgetCents: v.s.round(0, 2).toFixed(0),
            },
          ]),
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

export function deleteHolding(deps: {
  holdingRepo: HoldingRepo;
  historyRepo: HistoryRepo;
}) {
  return async (
    input: Who & { holdingId: string },
  ): Promise<Result<{ ok: true }, Error>> => {
    try {
      const h = await deps.holdingRepo.findById(
        input.tenantId,
        input.actorUserId,
        input.holdingId,
      );
      if (!h) return err(new Error("not_found"));
      const own = await deps.historyRepo.listForHolding(
        input.tenantId,
        input.actorUserId,
        h.id,
      );
      const patches: HoldingPatch[] = [];
      const deleteHoldingIds = [h.id];
      const softDeleteEntryIds: string[] = [];
      for (const row of own.filter((r) => r.transferId)) {
        const legs = await deps.historyRepo.findLegs(
          input.tenantId,
          input.actorUserId,
          row.id,
        );
        for (const leg of legs.filter((l) => l.holdingId !== h.id)) {
          const u = await planLegUndo(deps, input, leg);
          if (u.patch) patches.push(u.patch);
          if (u.deleteHolding) deleteHoldingIds.push(u.deleteHolding);
          softDeleteEntryIds.push(leg.id);
        }
      }
      await deps.historyRepo.commit(input.tenantId, input.actorUserId, {
        budgetId: input.budgetId,
        patches: patches.filter((p) => !deleteHoldingIds.includes(p.id)),
        entries: [],
        softDeleteEntryIds,
        deleteHoldingIds,
      });
      return ok({ ok: true });
    } catch (e) {
      if (e instanceof RangeError) return err(new Error(e.message));
      return err(e as Error);
    }
  };
}
