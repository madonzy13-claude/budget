/**
 * transfer-asset.ts — Swap → Transfer (13.1 D-10).
 *
 * Moves part or all of an asset to another asset of the SAME type (crypto and
 * stocks: also the same instrument) or into a new label. Not a sale: cost moves
 * with the quantity (or value) proportionally, flow is 0 so contributions do
 * not move, and nothing is realized. Two linked legs, transfer_out +
 * transfer_in, so deleting one undoes both (D-16).
 */
import { ok, err, type Result } from "neverthrow";
import type { FxProvider } from "@budget/shared-kernel";
import { holdingShape, type Holding } from "../domain/holding";
import { transferCost } from "../domain/asset-ledger";
import { big, cents, qty } from "../domain/sell-booking";
import type { HoldingRepo, NewHolding } from "../ports/holding-repo";
import {
  entry,
  type HistoryRepo,
  type HoldingPatch,
} from "../ports/history-repo";
import type { TransferAssetInput } from "../contracts/api";
import { makeRate } from "./fx-memo";

const fail = (code: string) => new Error(code);
const isDeposit = (h: Holding) =>
  h.holdingType === "deposit" || h.uiType === "deposit";
const sameInstrumentTypes = new Set(["crypto", "stocks"]);
/** Amount assets keep quantity 1: price IS the value. */
const valueOf = (h: Holding) =>
  cents(big(h.currentPriceCents ?? 0n).times(big(h.quantity)));

export function transferAsset(deps: {
  holdingRepo: HoldingRepo;
  historyRepo: HistoryRepo;
  fxProvider: FxProvider;
}) {
  return async (
    input: TransferAssetInput & {
      tenantId: string;
      budgetId: string;
      actorUserId: string;
      budgetCurrency: string;
      holdingId: string;
    },
  ): Promise<
    Result<{ transferId: string | null; newHoldingId: string | null }, Error>
  > => {
    const date = input.effectiveDate;
    const rate = makeRate(deps.fxProvider, date);
    try {
      const src = await deps.holdingRepo.findById(
        input.tenantId,
        input.actorUserId,
        input.holdingId,
      );
      if (!src) return err(fail("not_found"));
      if (isDeposit(src)) return err(fail("deposit_not_allowed"));
      const byQty = holdingShape(src) === "quantity";
      if (byQty !== "quantity" in input.move)
        return err(fail("shape_mismatch"));
      const costCcy =
        src.buyCurrency ?? src.currentPriceCurrency ?? input.budgetCurrency;

      // Destination: an existing same-type asset, or a free new label.
      let d: Holding | null = null;
      if (input.to.kind === "existing") {
        d = await deps.holdingRepo.findById(
          input.tenantId,
          input.actorUserId,
          input.to.holdingId,
        );
        if (!d) return err(fail("not_found"));
        if (d.id === src.id) return err(fail("transfer_same_asset"));
        if (d.uiType !== src.uiType || isDeposit(d))
          return err(fail("transfer_type_mismatch"));
        if (
          sameInstrumentTypes.has(src.uiType ?? "") &&
          d.instrumentId !== src.instrumentId
        )
          return err(fail("transfer_instrument_mismatch"));
        if ((holdingShape(d) === "quantity") !== byQty)
          return err(fail("shape_mismatch"));
      } else {
        const taken = await deps.holdingRepo.findByLabel(
          input.tenantId,
          input.budgetId,
          src.uiType ?? "other",
          input.to.name,
        );
        if (taken) return err(fail("label_taken"));
      }

      // Proportional cost (D-10); a full move takes the whole cost.
      const totalCost = byQty
        ? cents(big(src.buyPriceCents ?? 0n).times(big(src.quantity)))
        : (src.buyPriceCents ?? 0n);
      const srcValue = valueOf(src);
      const held = byQty ? src.quantity : srcValue.toString();
      const moved =
        "quantity" in input.move ? input.move.quantity : input.move.valueCents;
      const t = transferCost({
        costCents: totalCost,
        heldQty: held,
        moveQty: moved,
      });
      const emptied = big(t.qtyLeft).eq(0);

      const patches: HoldingPatch[] = [];
      const archive = emptied ? { archive: true } : {};
      patches.push(
        byQty
          ? { id: src.id, quantity: t.qtyLeft, ...archive }
          : {
              id: src.id,
              buyPriceCents: totalCost - t.costMovedCents,
              currentPriceCents: srcValue - BigInt(moved),
              ...archive,
            },
      );

      const leg = {
        effectiveDate: date,
        amountCents: t.costMovedCents,
        amountCurrency: costCcy,
        flowCents: 0n,
        transfer: true,
      };
      const entries = [
        entry({
          ...leg,
          holdingRef: src.id,
          kind: "transfer_out",
          qtyDelta: byQty ? `-${moved}` : null,
          costDeltaCents: -t.costMovedCents,
          costCurrency: costCcy,
          valueDeltaCents: byQty ? 0n : -BigInt(moved),
        }),
      ];

      let newHolding: NewHolding | undefined;
      if (d) {
        const dCost = d.buyCurrency ?? d.currentPriceCurrency ?? costCcy;
        const costIn = cents(
          big(t.costMovedCents).times(await rate(costCcy, dCost)),
        );
        const revive = d.archivedAt ? { unarchive: true } : {};
        if (byQty) {
          const newQty = big(d.quantity).plus(big(moved));
          const total = big(d.buyPriceCents ?? 0n)
            .times(big(d.quantity))
            .plus(big(costIn));
          patches.push({
            id: d.id,
            quantity: qty(newQty),
            buyPriceCents: cents(total.div(newQty)),
            ...revive,
          });
        } else {
          const dVal = d.currentPriceCurrency ?? dCost;
          const valueIn = cents(
            big(moved).times(
              await rate(src.currentPriceCurrency ?? costCcy, dVal),
            ),
          );
          patches.push({
            id: d.id,
            buyPriceCents: (d.buyPriceCents ?? 0n) + costIn,
            currentPriceCents: valueOf(d) + valueIn,
            ...revive,
          });
        }
        entries.push(
          entry({
            ...leg,
            holdingRef: d.id,
            kind: "transfer_in",
            qtyDelta: byQty ? moved : null,
            costDeltaCents: costIn,
            costCurrency: dCost,
            valueDeltaCents: byQty ? 0n : BigInt(moved),
          }),
        );
      } else {
        newHolding = {
          name: input.to.kind === "new" ? input.to.name : src.name,
          holdingType: src.holdingType,
          uiType: src.uiType,
          icon: src.icon,
          color: src.color,
          instrumentId: src.instrumentId,
          manualTicker: src.manualTicker,
          buyPriceCents: byQty ? (src.buyPriceCents ?? 0n) : t.costMovedCents,
          buyCurrency: src.buyCurrency,
          quantity: byQty ? moved : "1",
          currentPriceCents: byQty ? src.currentPriceCents : BigInt(moved),
          currentPriceCurrency: src.currentPriceCurrency,
          metal: src.metal,
          metalKind: src.metalKind,
          unitOfMeasure: src.unitOfMeasure,
          premiumPct: src.premiumPct,
          depositRateBps: null,
          depositStartDate: null,
          depositEndDate: null,
          depositCapFrequency: null,
        };
        entries.push(
          entry({
            ...leg,
            holdingRef: "$new",
            kind: "transfer_in",
            qtyDelta: byQty ? moved : null,
            costDeltaCents: t.costMovedCents,
            costCurrency: costCcy,
            valueDeltaCents: byQty ? 0n : BigInt(moved),
          }),
        );
      }

      const touched = [src.id, ...(d ? [d.id] : [])];
      const r = await deps.historyRepo.commit(
        input.tenantId,
        input.actorUserId,
        {
          budgetId: input.budgetId,
          patches,
          newHolding,
          entries,
          lockHoldingIds: touched,
          minEffectiveDate: touched.map((holdingId) => ({ holdingId, date })),
        },
      );
      return ok({ transferId: r.transferId, newHoldingId: r.newHoldingId });
    } catch (e) {
      if (e instanceof RangeError) return err(fail(e.message));
      return err(e as Error);
    }
  };
}
