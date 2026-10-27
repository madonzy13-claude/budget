/**
 * buy-into-asset.ts — Swap → Buy (13.1 D-08). One entry per buy, appended in
 * time (D-15, re-checked under the row lock):
 *   quantity  `buy`: quantity + cost; a buy in another currency is converted
 *             into the asset's cost currency at the entry date; the flow
 *             (contribution) stays in the currency actually paid.
 *   amount    `add`: cost and value both rise by the amount (P/L unchanged).
 *   broker    `add`: cost + contribution rise by the amount and the value is
 *             set to "account value after" — the market move lands in P/L,
 *             the deposit never does.
 * amount/broker keep the prior price on the entry for snapshot undo (D-18).
 */
import { ok, err, type Result } from "neverthrow";
import type { FxProvider } from "@budget/shared-kernel";
import { holdingShape, type Holding } from "../domain/holding";
import { brokerAdd } from "../domain/asset-ledger";
import { addMoney, big, buyMore, cents } from "../domain/sell-booking";
import type { HoldingRepo } from "../ports/holding-repo";
import {
  entry,
  type BookingPlan,
  type HistoryRepo,
} from "../ports/history-repo";
import type { BuyAssetInput } from "../contracts/api";
import { makeRate } from "./fx-memo";

const fail = (code: string) => new Error(code);

export type BuyShape = "quantity" | "amount" | "broker";

/** Which Buy form an asset takes. Deposits take none (D-11). */
export function buyShapeOf(
  h: Pick<Holding, "holdingType" | "uiType" | "quantity">,
): BuyShape | null {
  if (h.holdingType === "deposit" || h.uiType === "deposit") return null;
  if (h.uiType === "broker") return "broker";
  return holdingShape(h) === "quantity" ? "quantity" : "amount";
}

/** The plan for one buy into `h` (shared with create-or-join). */
export async function planBuy(
  h: Holding,
  input: BuyAssetInput,
  ctx: { budgetId: string; budgetCurrency: string; fx: FxProvider },
): Promise<BookingPlan> {
  const shape = buyShapeOf(h);
  if (shape === null) throw fail("deposit_not_allowed");
  if (shape !== input.kind) throw fail("shape_mismatch");
  const date = input.effectiveDate;
  const rate = makeRate(ctx.fx, date);
  const costCcy = h.buyCurrency ?? h.currentPriceCurrency ?? ctx.budgetCurrency;
  const valueCcy = h.currentPriceCurrency ?? costCcy;
  const base = {
    budgetId: ctx.budgetId,
    lockHoldingIds: [h.id],
    minEffectiveDate: [{ holdingId: h.id, date }],
  };
  const revive = h.archivedAt ? { unarchive: true } : {};

  if (input.kind === "quantity") {
    const paid = cents(big(input.priceCents).times(big(input.quantity)));
    const cost = cents(big(paid).times(await rate(input.currency, costCcy)));
    const r = buyMore({
      quantity: h.quantity,
      buyPriceCents: h.buyPriceCents ?? 0n,
      addQuantity: input.quantity,
      paidCents: cost,
    });
    return {
      ...base,
      patches: [
        {
          id: h.id,
          quantity: r.newQuantity,
          buyPriceCents: r.newBuyPriceCents,
          ...revive,
        },
      ],
      entries: [
        entry({
          holdingRef: h.id,
          kind: "buy",
          effectiveDate: date,
          amountCents: paid,
          amountCurrency: input.currency,
          qtyDelta: input.quantity,
          costDeltaCents: cost,
          costCurrency: costCcy,
          flowCents: paid,
          flowCurrency: input.currency,
        }),
      ],
    };
  }

  const current =
    h.currentPriceCents === null ? 0n : cents(big(h.currentPriceCents));
  const snapshot = {
    priorPriceCents:
      h.currentPriceCents === null ? null : String(h.currentPriceCents),
    priorPriceCurrency: h.currentPriceCurrency,
  };

  if (input.kind === "broker") {
    const b = brokerAdd({
      amountCents: BigInt(input.amountCents),
      currentValueCents: current,
      valueAfterCents: BigInt(input.valueAfterCents),
    });
    return {
      ...base,
      patches: [
        {
          id: h.id,
          buyPriceCents: (h.buyPriceCents ?? 0n) + b.costDeltaCents,
          currentPriceCents: BigInt(input.valueAfterCents),
          ...revive,
        },
      ],
      entries: [
        entry({
          holdingRef: h.id,
          kind: "add",
          effectiveDate: date,
          amountCents: b.flowCents,
          amountCurrency: costCcy,
          costDeltaCents: b.costDeltaCents,
          costCurrency: costCcy,
          valueDeltaCents: b.valueDeltaCents,
          flowCents: b.flowCents,
          flowCurrency: costCcy,
          ...snapshot,
        }),
      ],
    };
  }

  const amount = BigInt(input.amountCents);
  const cost = cents(big(amount).times(await rate(input.currency, costCcy)));
  const value = cents(big(amount).times(await rate(input.currency, valueCcy)));
  const { newBuyCents } = addMoney({
    buyCents: h.buyPriceCents ?? 0n,
    amountCents: cost,
  });
  return {
    ...base,
    patches: [
      {
        id: h.id,
        buyPriceCents: newBuyCents,
        currentPriceCents: current + value,
        ...revive,
      },
    ],
    entries: [
      entry({
        holdingRef: h.id,
        kind: "add",
        effectiveDate: date,
        amountCents: amount,
        amountCurrency: input.currency,
        costDeltaCents: cost,
        costCurrency: costCcy,
        valueDeltaCents: value,
        flowCents: amount,
        flowCurrency: input.currency,
        ...snapshot,
      }),
    ],
  };
}

export function buyIntoAsset(deps: {
  holdingRepo: HoldingRepo;
  historyRepo: HistoryRepo;
  fxProvider: FxProvider;
}) {
  return async (
    input: BuyAssetInput & {
      tenantId: string;
      budgetId: string;
      actorUserId: string;
      budgetCurrency: string;
      holdingId: string;
    },
  ): Promise<Result<{ holdingId: string }, Error>> => {
    try {
      const h = await deps.holdingRepo.findById(
        input.tenantId,
        input.actorUserId,
        input.holdingId,
      );
      if (!h) return err(fail("not_found"));
      const plan = await planBuy(h, input, {
        budgetId: input.budgetId,
        budgetCurrency: input.budgetCurrency,
        fx: deps.fxProvider,
      });
      await deps.historyRepo.commit(input.tenantId, input.actorUserId, plan);
      return ok({ holdingId: h.id });
    } catch (e) {
      if (e instanceof RangeError) return err(fail(e.message));
      return err(e as Error);
    }
  };
}
