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
  qty,
  realizedInBudget,
  sellAmountHolding,
  sellDepositPart,
  sellQuantityHolding,
} from "../domain/sell-booking";
import type { HoldingRepo, NewHolding } from "../ports/holding-repo";
import {
  entry,
  type WalletCredit,
  type HistoryRepo,
  type HoldingPatch,
  type NewHistoryEntry,
} from "../ports/history-repo";
import type { SellAssetInput, WalletTargetInput } from "../contracts/api";

type Destination = SellAssetInput["destination"];
/** Parsed sell input; an Out without a wallet target means Nowhere. */
export type SellInput = Omit<SellAssetInput, "destination"> & {
  destination:
    | Exclude<Destination, { kind: "out" }>
    | { kind: "out"; wallet?: WalletTargetInput };
};
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
    input: SellInput & {
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
        walletId: string | null;
        walletType: string | null;
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
        // IN-01: value a copy — the caller's Holding stays as read.
        const copy = Object.assign(Object.create(Object.getPrototypeOf(h)), h, {
          currentPriceCents: cents(
            big(h.currentPriceCents).times(await rate(priceCcy, displayCcy)),
          ),
          currentPriceCurrency: displayCcy,
        }) as Holding;
        return cents(holdingValue(copy));
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

      // 13.1 UAT 10: a quantity destination is priced qty × price — the
      // destination's own price (Existing, D-09) or the chosen one (New) — and
      // received follows from it. Out / amount destinations take received as typed.
      const unitOf = async (d: Holding) => {
        const held = big(d.quantity);
        return held.gt(0)
          ? big(await valueOf(d)).div(held)
          : big(d.currentPriceCents ?? 0n);
      };
      const newBase =
        dest.kind === "new"
          ? toNewHolding({
              ...dest.holding,
              quantity: dest.holding.quantity ?? "1",
            })
          : null;
      const into: Holding | null =
        dest.kind === "existing"
          ? (holdings.find((h) => h.id === dest.holdingId) ?? null)
          : newBase?.uiType
            ? await deps.holdingRepo.findByLabel(
                input.tenantId,
                input.budgetId,
                newBase.uiType,
                newBase.name,
              )
            : null;
      if (dest.kind === "existing" && !into) return err(fail("not_found"));
      if (into && into.id === src.id) return err(fail("same_holding"));
      const destQty =
        dest.kind === "existing"
          ? dest.quantityBought
          : dest.kind === "new"
            ? dest.holding.quantity
            : undefined;
      let unit: Big | null = null;
      if (
        into &&
        into.holdingType !== "deposit" &&
        holdingShape(into) === "quantity"
      )
        unit = await unitOf(into);
      else if (!into && newBase && isQuantityHolding(newBase.uiType)) {
        if (dest.kind !== "new" || !dest.priceCents)
          return err(fail("price_required"));
        unit = big(dest.priceCents);
      }
      let received: bigint;
      if (unit) {
        if (!destQty || big(destQty).lte(0))
          return err(fail("quantity_required"));
        received = cents(big(destQty).times(unit));
      } else if (input.receivedCents === undefined)
        return err(fail("received_required"));
      else received = BigInt(String(input.receivedCents));

      const fx = realizedInBudget({
        receivedCents: received,
        sourceToReceivedRate: await rate(buyCcy, receivedCcy),
        soldCostCents: soldCost,
        sourceToBudgetRate: await rate(buyCcy, input.budgetCurrency),
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

      // A linked leg INTO an asset that already exists (D-09): by id for
      // Existing, by label for New (a hidden one is revived, D-17).
      const intoExisting = async (d: Holding) => {
        if (d.holdingType === "deposit") throw fail("unsupported_destination");
        if (ccyOf(d) !== receivedCcy) throw fail("currency_mismatch");
        const revive = d.archivedAt ? { unarchive: true } : {};
        if (holdingShape(d) === "quantity") {
          const addQty = qty(big(destQty!));
          const r = buyMore({
            quantity: d.quantity,
            buyPriceCents: d.buyPriceCents ?? 0n,
            addQuantity: addQty,
            paidCents: received,
          });
          patches.push({
            id: d.id,
            quantity: r.newQuantity,
            buyPriceCents: r.newBuyPriceCents,
            ...revive,
          });
          leg({ holdingRef: d.id, qtyDelta: addQty });
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
            ...revive,
          });
          leg({ holdingRef: d.id, valueDeltaCents: received });
        }
        return d.id;
      };

      let newHolding: NewHolding | undefined;
      let destId: string | null = null;
      if (into) destId = await intoExisting(into);
      else if (newBase) {
        const base = newBase;
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
        } else if (unit) {
          // Buy price = the chosen price; current = the live feed price when
          // the client has one, else the chosen price (no feed).
          newHolding = {
            ...base,
            buyPriceCents: cents(unit),
            buyCurrency: receivedCcy,
            currentPriceCents: base.currentPriceCents ?? cents(unit),
            currentPriceCurrency: base.currentPriceCurrency ?? receivedCcy,
          };
          leg({ holdingRef: "$new", qtyDelta: qty(big(destQty!)) });
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

      // D-20..D-23: Out of investments may land in a wallet, by delta.
      let walletCredit: WalletCredit | undefined;
      if (
        dest.kind === "out" &&
        dest.wallet &&
        dest.wallet.kind !== "nowhere"
      ) {
        const amountMajor = big(received).div(100).toFixed(2);
        const w = dest.wallet;
        walletCredit = {
          target:
            w.kind === "existing"
              ? { walletId: w.walletId }
              : {
                  create: {
                    name: w.name,
                    walletType: w.walletType,
                    currency: w.currency,
                  },
                },
          amountMajor,
          currency: receivedCcy,
        };
        Object.assign(entries[0]!, {
          walletId: w.kind === "existing" ? w.walletId : "$newWallet",
          walletDeltaNumeric: amountMajor,
          walletCreated: w.kind === "new",
        });
      }

      const touched = [src.id, ...(destId ? [destId] : [])];
      const r = await deps.historyRepo.commit(
        input.tenantId,
        input.actorUserId,
        {
          budgetId: input.budgetId,
          patches,
          newHolding,
          entries,
          walletCredit,
          lockHoldingIds: touched,
          // D-15: both legs append in time.
          minEffectiveDate: touched.map((holdingId) => ({ holdingId, date })),
        },
      );
      return ok({ archived, ...r });
    } catch (e) {
      if (e instanceof RangeError) return err(fail(e.message));
      return err(e as Error);
    }
  };
}
