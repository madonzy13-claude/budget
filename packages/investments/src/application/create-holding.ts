import { ok, err, type Result } from "neverthrow";
import Big from "big.js";
import { holdingShape, type Holding } from "../domain/holding";
import type { HoldingRepo, NewHolding } from "../ports/holding-repo";
import type { FxProvider } from "@budget/shared-kernel";
import { entry, type HistoryRepo } from "../ports/history-repo";
import type { CreateHoldingInput } from "../contracts/api";

/** Like toCents, but keeps 6 places of sub-cent: a total typed for several
 *  units only multiplies back exactly from a fractional unit price. */
export const toPriceCents = (
  v: string | number | null | undefined,
): string | null =>
  v === null || v === undefined || v === ""
    ? null
    : new Big(String(v).replace(/,/g, ".").replace(/\s/g, ""))
        .round(6)
        .toString();

export const toCents = (
  v: string | number | null | undefined,
): bigint | null =>
  v === null || v === undefined || v === ""
    ? null
    : BigInt(
        Math.round(Number(String(v).replace(/,/g, ".").replace(/\s/g, ""))),
      );

/** Parsed create input → the repo's NewHolding (also the Sell "new" target). */
export function toNewHolding(input: CreateHoldingInput): NewHolding {
  return {
    name: input.name,
    holdingType: input.holdingType,
    uiType: input.uiType ?? null,
    icon: input.icon ?? null,
    color: input.color ?? null,
    instrumentId: input.instrumentId ?? null,
    manualTicker: input.manualTicker ?? null,
    buyPriceCents: toCents(input.buyPriceCents),
    buyCurrency: input.buyCurrency ?? null,
    quantity: input.quantity ?? "1",
    currentPriceCents: toPriceCents(input.currentPriceCents),
    currentPriceCurrency: input.currentPriceCurrency ?? null,
    metal: input.metal ?? null,
    metalKind: input.metalKind ?? null,
    unitOfMeasure: input.unitOfMeasure ?? null,
    premiumPct: input.premiumPct ?? null,
    depositRateBps: input.depositRateBps ?? null,
    depositStartDate: input.depositStartDate ?? null,
    depositEndDate: input.depositEndDate ?? null,
    depositCapFrequency: input.depositCapFrequency ?? null,
  };
}

/**
 * 13.1, round-5 scope change (user, 2026-10-29): names are not unique — Add
 * always creates a new asset; joining one is Swap → Buy by id.
 *
 * Phase 13: a holding with a buy price is born with its first history entry
 * (D-06/D-09) — `buy` for quantity holdings, `add` otherwise — dated by the
 * user (openedOn, default today) — a deposit by its start date, clamped to
 * today (R5-1). Its cost is the contribution (flow).
 * Possessions and holdings without a buy price get none.
 */
export function createHolding(deps: {
  holdingRepo: HoldingRepo;
  historyRepo: HistoryRepo;
  fxProvider: FxProvider;
}) {
  return async (
    input: CreateHoldingInput & {
      tenantId: string;
      budgetId: string;
      actorUserId: string;
      budgetCurrency?: string;
    },
  ): Promise<Result<{ holding: Holding }, Error>> => {
    const nh = toNewHolding(input);
    const today = new Date().toISOString().slice(0, 10);
    // R5-1: a deposit's opening entry sits on its start date (never future).
    const date =
      nh.holdingType === "deposit" && nh.depositStartDate
        ? nh.depositStartDate < today
          ? nh.depositStartDate
          : today
        : (input.openedOn ?? today);
    try {
      if (nh.holdingType === "possession" || nh.buyPriceCents === null)
        return ok({
          holding: await deps.holdingRepo.create(
            input.tenantId,
            input.budgetId,
            input.actorUserId,
            nh,
          ),
        });
      const shape = holdingShape(nh);
      const cost = BigInt(
        new Big(nh.buyPriceCents.toString())
          .times(new Big(nh.quantity))
          .round(0, 2)
          .toFixed(0),
      );
      const value =
        shape === "amount" && nh.currentPriceCents !== null
          ? BigInt(
              new Big(String(nh.currentPriceCents))
                .times(new Big(nh.quantity))
                .round(0, 2)
                .toFixed(0),
            )
          : 0n;
      const { newHoldingId } = await deps.historyRepo.commit(
        input.tenantId,
        input.actorUserId,
        {
          budgetId: input.budgetId,
          patches: [],
          newHolding: nh,
          entries: [
            entry({
              holdingRef: "$new",
              kind: shape === "quantity" ? "buy" : "add",
              effectiveDate: date,
              amountCents: cost,
              amountCurrency: nh.buyCurrency,
              qtyDelta: shape === "quantity" ? nh.quantity : null,
              costDeltaCents: cost,
              costCurrency: nh.buyCurrency,
              valueDeltaCents: value,
              flowCents: cost,
              flowCurrency: nh.buyCurrency,
            }),
          ],
        },
      );
      const created = await deps.holdingRepo.findById(
        input.tenantId,
        input.actorUserId,
        newHoldingId!,
      );
      if (!created) return err(new Error("not_found"));
      return ok({ holding: created });
    } catch (e) {
      if (e instanceof RangeError) return err(new Error(e.message));
      return err(e as Error);
    }
  };
}
