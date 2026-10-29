/**
 * edit-asset.ts — asset Edit (13.1 D-06, D-07, D-18, D-36). Label, display
 * currency and, for hand-valued / hand-priced assets, the current value or
 * price. Quantity, cost and type are ledger-owned and never written here
 * (Phase 13 CR-01: a PATCH that wrote them raced /adjust).
 *
 *   label       renameHolding; names are not unique (round-5 scope change).
 *   currency    hand-valued: the stored value converts at today's rate;
 *               market-priced: only the display currency changes (the list
 *               re-denominates the fetched price). Cost is never touched.
 *   value/price a Value updated / Price updated entry dated today with the
 *               prior price kept for snapshot undo.
 */
import { ok, err, type Result } from "neverthrow";
import { Temporal } from "temporal-polyfill";
import type { FxProvider } from "@budget/shared-kernel";
import type { Holding } from "../domain/holding";
import { priceChange } from "../domain/asset-ledger";
import { big, cents } from "../domain/sell-booking";
import type { HoldingRepo } from "../ports/holding-repo";
import {
  entry,
  type BookingPlan,
  type HistoryRepo,
  type HoldingPatch,
} from "../ports/history-repo";
import type { EditAssetInput } from "../contracts/api";
import { buyShapeOf } from "./buy-into-asset";
import { makeRate } from "./fx-memo";

const fail = (code: string) => new Error(code);

export function editAsset(deps: {
  holdingRepo: HoldingRepo;
  historyRepo: HistoryRepo;
  fxProvider: FxProvider;
}) {
  return async (
    input: EditAssetInput & {
      tenantId: string;
      budgetId: string;
      actorUserId: string;
      budgetCurrency: string;
      holdingId: string;
      /** Value/price entries are dated by the viewer's today (their timezone). */
      today?: string;
      timezone?: string;
    },
  ): Promise<Result<Holding, Error>> => {
    try {
      const h = await deps.holdingRepo.findById(
        input.tenantId,
        input.actorUserId,
        input.holdingId,
      );
      if (!h) return err(fail("not_found"));
      const today =
        input.today ??
        Temporal.Now.plainDateISO(input.timezone ?? "UTC").toString();
      const rate = makeRate(deps.fxProvider, today);
      const patch: HoldingPatch = { id: h.id };
      const plan: BookingPlan = {
        budgetId: input.budgetId,
        patches: [],
        entries: [],
        lockHoldingIds: [h.id],
      };

      if (input.name !== undefined && input.name !== h.name)
        plan.renameHolding = { id: h.id, name: input.name };

      let ccy = h.currentPriceCurrency ?? h.buyCurrency ?? input.budgetCurrency;
      let price =
        h.currentPriceCents === null ? null : big(h.currentPriceCents);
      if (
        input.displayCurrency !== undefined &&
        input.displayCurrency !== ccy
      ) {
        if (h.instrumentId === null && price !== null) {
          price = big(
            cents(price.times(await rate(ccy, input.displayCurrency))),
          );
          patch.currentPriceCents = price.toFixed(0);
        }
        ccy = input.displayCurrency;
        patch.currentPriceCurrency = ccy;
      }

      const newPrice =
        input.currentValueCents !== undefined
          ? input.currentValueCents
          : input.currentPriceCents !== undefined
            ? input.currentPriceCents
            : null;
      if (newPrice !== null) {
        // Value for amount assets (qty 1), price per unit for hand-priced quantity assets.
        const amountAsset = buyShapeOf(h) !== "quantity";
        if (input.currentValueCents !== undefined && !amountAsset)
          return err(fail("shape_mismatch"));
        const prior = price === null ? "0" : price.toFixed(0);
        // A hand value may be 0; a unit price may not.
        if (!amountAsset)
          priceChange({ priorPriceCents: prior, newPriceCents: newPrice });
        const qty = big(h.quantity);
        plan.entries.push(
          entry({
            holdingRef: h.id,
            kind: amountAsset ? "value_change" : "price_change",
            effectiveDate: today,
            amountCents: cents(big(newPrice)),
            amountCurrency: ccy,
            valueDeltaCents: cents(big(newPrice).minus(big(prior)).times(qty)),
            priorPriceCents:
              h.currentPriceCents === null ? null : String(price),
            priorPriceCurrency: ccy,
          }),
        );
        plan.minEffectiveDate = [{ holdingId: h.id, date: today }];
        patch.currentPriceCents = newPrice;
        patch.currentPriceCurrency = ccy;
      }

      if (Object.keys(patch).length > 1) plan.patches.push(patch);
      await deps.historyRepo.commit(input.tenantId, input.actorUserId, plan);
      const after = await deps.holdingRepo.findById(
        input.tenantId,
        input.actorUserId,
        h.id,
      );
      return after ? ok(after) : err(fail("not_found"));
    } catch (e) {
      if (e instanceof RangeError) return err(fail(e.message));
      return err(e as Error);
    }
  };
}
