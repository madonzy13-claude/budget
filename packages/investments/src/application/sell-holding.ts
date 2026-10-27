/**
 * sell-holding.ts — Phase 13 Sell (D-01..D-04, D-17, D-18, D-20).
 *
 * "How much is left?" + "Where did the money go?" → one BookingPlan committed
 * in ONE transaction: the source patch, the destination patch or new holding,
 * and the history entries. Out of investments books a `withdraw` (flow =
 * −received, D-02); New/Existing book a flow-0 conversion pair sharing a
 * transfer id, so contributions do not move.
 *
 * Every entry carries its own deltas (and a deposit sale its prior principal +
 * start date) so deleting it later is a full undo (D-06).
 */
import { ok, err, type Result } from "neverthrow";
import Big from "big.js";
import type { FxProvider } from "@budget/shared-kernel";
import {
  holdingShape,
  isQuantityHolding,
  type Holding,
} from "../domain/holding";
import { holdingValue } from "../domain/portfolio-metrics";
import {
  computeDepositValueCents,
  type CapFrequency,
} from "../domain/deposit-value";
import {
  buyMore,
  mergeIntoAmountHolding,
  realizedInBudget,
  sellAmountHolding,
  sellDepositPart,
  sellQuantityHolding,
} from "../domain/sell-booking";
import type { HoldingRepo, NewHolding } from "../ports/holding-repo";
import {
  entry,
  type HistoryRepo,
  type HoldingPatch,
  type NewHistoryEntry,
} from "../ports/history-repo";
import type { SellHoldingInput } from "../contracts/api";
import { toNewHolding } from "./create-holding";
import { FxUnavailableError, makeRate } from "./fx-memo";

export { FxUnavailableError };

const fail = (code: string) => new Error(code);
const big = (v: bigint | string) => new Big(v.toString());
const cents = (b: Big) => BigInt(b.round(0, 2).toFixed(0));

export function sellHolding(deps: {
  holdingRepo: HoldingRepo;
  historyRepo: HistoryRepo;
  fxProvider: FxProvider;
}) {
  return async (
    input: SellHoldingInput & {
      tenantId: string;
      budgetId: string;
      actorUserId: string;
      budgetCurrency: string;
      holdingId: string;
    },
  ): Promise<
    Result<
      {
        archived: boolean;
        newHoldingId: string | null;
        transferId: string | null;
      },
      Error
    >
  > => {
    const date = input.effectiveDate;
    const rate = makeRate(deps.fxProvider, date);

    /** Value in the holding's own currency on the sale date. */
    const valueOf = async (h: Holding): Promise<bigint> => {
      if (h.holdingType === "deposit")
        return BigInt(
          computeDepositValueCents({
            principalCents: h.buyPriceCents ?? 0n,
            rateBps: h.depositRateBps ?? 0,
            startDate: h.depositStartDate ?? date,
            capFrequency: (h.depositCapFrequency ?? "monthly") as CapFrequency,
            asOf: date,
            endDate: h.depositEndDate,
          }),
        );
      // Metals: the cache price is in the source currency; value in the
      // currency the user chose (same normalization as list-holdings).
      const priceCcy = h.currentPriceCurrency;
      const displayCcy = h.displayCurrency;
      if (
        h.currentPriceCents !== null &&
        priceCcy &&
        displayCcy &&
        priceCcy !== displayCcy
      ) {
        h.currentPriceCents = cents(
          big(h.currentPriceCents).times(await rate(priceCcy, displayCcy)),
        );
        h.currentPriceCurrency = displayCcy;
      }
      return cents(holdingValue(h));
    };
    const ccyOf = (h: Holding) =>
      h.buyCurrency ?? h.currentPriceCurrency ?? input.budgetCurrency;

    try {
      const holdings = await deps.holdingRepo.listForBudget(
        input.tenantId,
        input.budgetId,
        input.actorUserId,
      );
      const src = holdings.find((h) => h.id === input.holdingId);
      if (!src) return err(fail("not_found"));

      const dest = input.destination;
      if (dest.kind === "existing" && dest.holdingId === src.id)
        return err(fail("same_holding"));

      const received = BigInt(String(input.receivedCents));
      const receivedCcy = input.receivedCurrency;
      const buyCcy = ccyOf(src);
      const shape = holdingShape(src);
      const patches: HoldingPatch[] = [];
      let archived = false;
      let soldCost: bigint;
      let srcEntry: Partial<NewHistoryEntry>;

      if (shape === "quantity") {
        if (!("quantity" in input.left))
          return err(fail("left_shape_mismatch"));
        const sellQty = big(src.quantity).minus(big(input.left.quantity));
        const r = sellQuantityHolding({
          quantity: src.quantity,
          buyPriceCents: src.buyPriceCents ?? 0n,
          sellQuantity: sellQty.toFixed(8),
        });
        soldCost = r.soldCostCents;
        archived = big(r.newQuantity).eq(0);
        patches.push({
          id: src.id,
          quantity: r.newQuantity,
          ...(archived ? { archive: true } : {}),
        });
        srcEntry = {
          qtyDelta: `-${sellQty.toFixed(8).replace(/\.?0+$/, "")}`,
          costDeltaCents: -soldCost,
        };
      } else {
        if (!("valueCents" in input.left))
          return err(fail("left_shape_mismatch"));
        const keep = BigInt(String(input.left.valueCents));
        const value = await valueOf(src);
        archived = keep === 0n;
        if (shape === "deposit") {
          const principal = src.buyPriceCents ?? 0n;
          const r = sellDepositPart({
            principalCents: principal,
            valueCents: value,
            keepCents: keep,
          });
          soldCost = r.soldCostCents;
          patches.push({
            id: src.id,
            buyPriceCents: r.newPrincipalCents,
            depositStartDate: date,
            ...(archived ? { archive: true } : {}),
          });
          srcEntry = {
            costDeltaCents: -soldCost,
            priorPrincipalCents: principal,
            priorStartDate: src.depositStartDate,
          };
        } else {
          const r = sellAmountHolding({
            buyCents: src.buyPriceCents ?? 0n,
            valueCents: value,
            keepCents: keep,
          });
          soldCost = r.soldCostCents;
          patches.push({
            id: src.id,
            buyPriceCents: r.keptCostCents,
            currentPriceCents: keep,
            ...(archived ? { archive: true } : {}),
          });
          srcEntry = {
            costDeltaCents: -soldCost,
            valueDeltaCents: keep - value,
          };
        }
      }

      const fx = realizedInBudget({
        receivedCents: received,
        receivedToBudgetRate: await rate(receivedCcy, input.budgetCurrency),
        soldCostCents: soldCost,
        costToBudgetRate: await rate(buyCcy, input.budgetCurrency),
      });

      const transfer = dest.kind !== "out";
      const entries: NewHistoryEntry[] = [
        entry({
          ...srcEntry,
          holdingRef: src.id,
          kind: transfer ? "convert_out" : "withdraw",
          effectiveDate: date,
          amountCents: received,
          amountCurrency: receivedCcy,
          costCurrency: buyCcy,
          flowCents: transfer ? 0n : -received,
          flowCurrency: receivedCcy,
          soldCostBudgetCents: fx.soldCostBudgetCents,
          realizedBudgetCents: fx.realizedBudgetCents,
          budgetCurrency: input.budgetCurrency,
          transfer,
        }),
      ];
      const leg = (e: Partial<NewHistoryEntry> & { holdingRef: string }) =>
        entries.push(
          entry({
            kind: "convert_in",
            effectiveDate: date,
            amountCents: received,
            amountCurrency: receivedCcy,
            costDeltaCents: received,
            costCurrency: receivedCcy,
            flowCurrency: receivedCcy,
            transfer: true,
            ...e,
          }),
        );

      let newHolding: NewHolding | undefined;
      if (dest.kind === "existing") {
        const d = holdings.find((h) => h.id === dest.holdingId);
        if (!d) return err(fail("not_found"));
        if (d.holdingType === "deposit")
          return err(fail("unsupported_destination"));
        if (ccyOf(d) !== receivedCcy) return err(fail("currency_mismatch"));
        if (holdingShape(d) === "quantity") {
          if (!dest.quantityBought) return err(fail("quantity_required"));
          const r = buyMore({
            quantity: d.quantity,
            buyPriceCents: d.buyPriceCents ?? 0n,
            addQuantity: dest.quantityBought,
            paidCents: received,
          });
          patches.push({
            id: d.id,
            quantity: r.newQuantity,
            buyPriceCents: r.newBuyPriceCents,
          });
          leg({ holdingRef: d.id, qtyDelta: dest.quantityBought });
        } else {
          const r = mergeIntoAmountHolding({
            buyCents: d.buyPriceCents ?? 0n,
            currentCents: await valueOf(d),
            receivedCents: received,
          });
          patches.push({
            id: d.id,
            buyPriceCents: r.newBuyCents,
            currentPriceCents: r.newCurrentCents,
          });
          leg({ holdingRef: d.id, valueDeltaCents: received });
        }
      } else if (dest.kind === "new") {
        const base = toNewHolding({
          ...dest.holding,
          quantity: dest.holding.quantity ?? "1",
        });
        if (base.holdingType === "deposit") {
          newHolding = {
            ...base,
            quantity: "1",
            buyPriceCents: received,
            buyCurrency: receivedCcy,
            currentPriceCents: null,
            currentPriceCurrency: receivedCcy,
            depositStartDate: base.depositStartDate ?? date,
          };
          leg({ holdingRef: "$new" });
        } else if (isQuantityHolding(base.uiType)) {
          if (!dest.holding.quantity || big(dest.holding.quantity).lte(0))
            return err(fail("quantity_required"));
          const unit = cents(big(received).div(big(dest.holding.quantity)));
          newHolding = {
            ...base,
            buyPriceCents: unit,
            buyCurrency: receivedCcy,
            currentPriceCents: unit,
            currentPriceCurrency: base.currentPriceCurrency ?? receivedCcy,
          };
          leg({ holdingRef: "$new", qtyDelta: dest.holding.quantity });
        } else {
          newHolding = {
            ...base,
            quantity: "1",
            buyPriceCents: received,
            buyCurrency: receivedCcy,
            currentPriceCents: received,
            currentPriceCurrency: receivedCcy,
          };
          leg({ holdingRef: "$new", valueDeltaCents: received });
        }
      }

      const r = await deps.historyRepo.commit(
        input.tenantId,
        input.actorUserId,
        {
          budgetId: input.budgetId,
          patches,
          newHolding,
          entries,
        },
      );
      return ok({ archived, ...r });
    } catch (e) {
      if (e instanceof RangeError) return err(fail(e.message));
      return err(e as Error);
    }
  };
}
