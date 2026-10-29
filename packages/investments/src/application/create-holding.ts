import { ok, err, type Result } from "neverthrow";
import Big from "big.js";
import { holdingShape, type Holding } from "../domain/holding";
import type { HoldingRepo, NewHolding } from "../ports/holding-repo";
import type { FxProvider } from "@budget/shared-kernel";
import { entry, type HistoryRepo } from "../ports/history-repo";
import type { BuyAssetInput, CreateHoldingInput } from "../contracts/api";
import { buyShapeOf, planBuy } from "./buy-into-asset";

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

const isUniqueViolation = (e: unknown) => {
  const x = e as { code?: string; cause?: { code?: string } };
  return x?.code === "23505" || x?.cause?.code === "23505";
};

/**
 * 13.1 (D-01, D-02, D-17): the name is the asset key within a type. Adding
 * under a name that already exists (trimmed, case-insensitive, hidden ones
 * too) books a buy INTO that asset — DCA becomes one line — and revives it if
 * it was sold out. Deposits never join (one deposit per asset, D-11); a
 * different instrument under the same name is refused.
 *
 * Phase 13: a holding with a buy price is born with its first history entry
 * (D-06/D-09) — `buy` for quantity holdings, `add` otherwise — dated by the
 * user (openedOn, default today). Its cost is the contribution (flow).
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
  ): Promise<Result<{ holding: Holding; joined: boolean }, Error>> => {
    const nh = toNewHolding(input);
    const date = input.openedOn ?? new Date().toISOString().slice(0, 10);
    try {
      const existing =
        nh.holdingType !== "possession" && nh.uiType
          ? await deps.holdingRepo.findByLabel(
              input.tenantId,
              input.budgetId,
              nh.uiType,
              nh.name,
              nh.currentPriceCurrency ?? nh.buyCurrency,
            )
          : null;
      if (existing) {
        if (existing.holdingType === "deposit" || nh.holdingType === "deposit")
          return err(new Error("label_taken"));
        if ((existing.instrumentId ?? null) !== (nh.instrumentId ?? null))
          return err(new Error("instrument_mismatch"));
        if (nh.buyPriceCents === null) return err(new Error("buy_positive"));
        const ccy =
          nh.buyCurrency ??
          existing.buyCurrency ??
          input.budgetCurrency ??
          "EUR";
        const cost = BigInt(
          new Big(nh.buyPriceCents.toString())
            .times(new Big(nh.quantity))
            .round(0, 2)
            .toFixed(0),
        );
        const shape = buyShapeOf(existing);
        const body: BuyAssetInput =
          shape === "quantity"
            ? {
                kind: "quantity",
                quantity: nh.quantity,
                priceCents: nh.buyPriceCents.toString(),
                currency: ccy,
                effectiveDate: date,
              }
            : shape === "broker"
              ? {
                  kind: "broker",
                  amountCents: cost.toString(),
                  valueAfterCents: (
                    BigInt(
                      new Big(String(existing.currentPriceCents ?? 0))
                        .round(0, 2)
                        .toFixed(0),
                    ) +
                    (nh.currentPriceCents === null
                      ? cost
                      : BigInt(
                          new Big(String(nh.currentPriceCents))
                            .round(0, 2)
                            .toFixed(0),
                        ))
                  ).toString(),
                  effectiveDate: date,
                }
              : {
                  kind: "amount",
                  amountCents: cost.toString(),
                  currency: ccy,
                  effectiveDate: date,
                };
        const plan = await planBuy(existing, body, {
          budgetId: input.budgetId,
          budgetCurrency: input.budgetCurrency ?? ccy,
          fx: deps.fxProvider,
        });
        await deps.historyRepo.commit(input.tenantId, input.actorUserId, plan);
        const joined = await deps.holdingRepo.findById(
          input.tenantId,
          input.actorUserId,
          existing.id,
        );
        return joined
          ? ok({ holding: joined, joined: true })
          : err(new Error("not_found"));
      }

      if (nh.holdingType === "possession" || nh.buyPriceCents === null)
        return ok({
          holding: await deps.holdingRepo.create(
            input.tenantId,
            input.budgetId,
            input.actorUserId,
            nh,
          ),
          joined: false,
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
      return ok({ holding: created, joined: false });
    } catch (e) {
      if (isUniqueViolation(e)) return err(new Error("label_taken"));
      if (e instanceof RangeError) return err(new Error(e.message));
      return err(e as Error);
    }
  };
}
