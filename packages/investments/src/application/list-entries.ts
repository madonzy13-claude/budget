/**
 * list-entries.ts — an asset's L3 ledger (13.1 D-12, D-13, D-16, D-19).
 *
 * Every live entry, newest first, with the server deciding what may be
 * deleted (the newest only; a linked leg only while its partner is newest in
 * the other asset too) so the client never guesses. Deposits also get their
 * interest rows, computed from rate + dates and never stored; they are
 * read-only and skipped by the newest-first rule.
 *
 * Amounts are signed (sales and outgoing legs negative; value/price updates =
 * the value delta) in the entry's own currency, plus the same amount in the
 * asset's display currency at the entry date — a missing rate leaves that one
 * row's display amount empty instead of failing the list.
 */
import { ok, err, type Result } from "neverthrow";
import { Temporal } from "temporal-polyfill";
import type { FxProvider } from "@budget/shared-kernel";
import { newestEntry, type LedgerKey } from "../domain/asset-ledger";
import { depositInterestRows } from "../domain/deposit-interest";
import type { CapFrequency } from "../domain/deposit-value";
import { big, cents } from "../domain/sell-booking";
import type { HoldingRepo } from "../ports/holding-repo";
import type { HistoryRepo, StoredEntry } from "../ports/history-repo";
import type { EntryDto } from "../contracts/api";
import { makeRate } from "./fx-memo";

const NEGATIVE = new Set(["withdraw", "convert_out", "transfer_out"]);
const LINKED = new Set([
  "convert_out",
  "convert_in",
  "transfer_out",
  "transfer_in",
]);
const abs = (n: bigint) => (n < 0n ? -n : n);
const key = (e: StoredEntry): LedgerKey => ({
  id: e.id,
  effectiveDate: e.effectiveDate,
  createdAt: e.createdAt,
  transferId: e.transferId,
  holdingId: e.holdingId,
});

/** The figure a row shows, signed, in the entry's currency. */
// Round-2 gap 13: a quantity-type asset priced as one unit (qty 1) books its
// value entries without a quantity; they still read "±1 @ price" like crypto.
// Amount assets (broker, cash, deposit, savings) keep plain amounts.
const VALUE_KINDS = new Set([
  "start",
  "buy",
  "add",
  "withdraw",
  "convert_in",
  "convert_out",
  "transfer_in",
  "transfer_out",
]);
const AMOUNT_TYPES = new Set([
  "broker",
  "cash",
  "cash_fx",
  "deposit",
  "savings",
]);

function signedAmount(e: StoredEntry): bigint | null {
  if (e.kind === "value_change" || e.kind === "price_change")
    return e.valueDeltaCents;
  if (e.amountCents === null) return null;
  return NEGATIVE.has(e.kind) ? -e.amountCents : e.amountCents;
}

export function listEntries(deps: {
  holdingRepo: HoldingRepo;
  historyRepo: HistoryRepo;
  fxProvider: FxProvider;
}) {
  return async (input: {
    tenantId: string;
    budgetId: string;
    actorUserId: string;
    budgetCurrency: string;
    holdingId: string;
    today?: string;
    timezone?: string;
  }): Promise<Result<EntryDto[], Error>> => {
    try {
      const h = await deps.holdingRepo.findById(
        input.tenantId,
        input.actorUserId,
        input.holdingId,
      );
      if (!h) return err(new Error("not_found"));
      const today =
        input.today ??
        Temporal.Now.plainDateISO(input.timezone ?? "UTC").toString();
      const live = await deps.historyRepo.listForHolding(
        input.tenantId,
        input.actorUserId,
        h.id,
      );
      const newestId = newestEntry(live.map(key))?.id ?? null;
      const partners = [
        ...new Set(
          live
            .filter((e) => e.counterpartyHoldingId)
            .map((e) => e.counterpartyHoldingId!),
        ),
      ];
      const partnerNewest = await deps.historyRepo.newestFor(
        input.tenantId,
        input.actorUserId,
        partners,
      );
      const display =
        h.currentPriceCurrency ?? h.buyCurrency ?? input.budgetCurrency;

      const rates = new Map<string, ReturnType<typeof makeRate>>();
      const toDisplay = async (
        amount: bigint,
        ccy: string | null,
        date: string,
      ): Promise<string | null> => {
        if (!ccy || ccy === display) return amount.toString();
        let rate = rates.get(date);
        if (!rate) rates.set(date, (rate = makeRate(deps.fxProvider, date)));
        try {
          return cents(big(amount).times(await rate(ccy, display))).toString();
        } catch {
          return null;
        }
      };

      // R6 (user): realized in the ASSET's currency (the one its row shows):
      // exact from the stored deal where there is one, else the budget
      // figure at the sale date's rate.
      const realizedIn = async (
        e: StoredEntry,
      ): Promise<{
        realizedCents: string | null;
        realizedCurrency: string | null;
      }> => {
        if (e.realizedBudgetCents === null)
          return { realizedCents: null, realizedCurrency: null };
        const from = e.budgetCurrency ?? input.budgetCurrency;
        let rate = rates.get(e.effectiveDate);
        if (!rate)
          rates.set(
            e.effectiveDate,
            (rate = makeRate(deps.fxProvider, e.effectiveDate)),
          );
        const [amount, ccy] =
          e.costCurrency &&
          e.assetAmountCents !== null &&
          e.costDeltaCents !== null
            ? [e.assetAmountCents - abs(e.costDeltaCents), e.costCurrency]
            : [e.realizedBudgetCents, from];
        try {
          return {
            realizedCents: cents(
              big(amount).times(await rate(ccy, display)),
            ).toString(),
            realizedCurrency: display,
          };
        } catch {
          // WR-10: no rate → the figure as booked, labelled as such.
          return { realizedCents: amount.toString(), realizedCurrency: ccy };
        }
      };

      const rows: EntryDto[] = [];
      for (const e of live) {
        const linked = LINKED.has(e.kind) && e.transferId !== null;
        const partnerOk =
          !linked ||
          !e.counterpartyHoldingId ||
          partnerNewest.get(e.counterpartyHoldingId)?.transferId ===
            e.transferId;
        const isNewest = e.id === newestId;
        const amount = signedAmount(e);
        const ccy =
          e.kind === "value_change" || e.kind === "price_change"
            ? (e.amountCurrency ?? display)
            : e.amountCurrency;
        const qtyAbs = e.qtyDelta === null ? null : big(e.qtyDelta).abs();
        const oneUnit =
          e.qtyDelta === null &&
          !!amount &&
          VALUE_KINDS.has(e.kind) &&
          !AMOUNT_TYPES.has(h.uiType ?? "") &&
          !AMOUNT_TYPES.has(h.holdingType);
        rows.push({
          id: e.id,
          kind: e.kind,
          effectiveDate: e.effectiveDate,
          createdAt: e.createdAt,
          qtyDelta: e.qtyDelta,
          displayQty: oneUnit ? (amount! < 0n ? "-1" : "1") : e.qtyDelta,
          priceCents:
            qtyAbs && qtyAbs.gt(0) && e.amountCents !== null
              ? cents(big(e.amountCents).div(qtyAbs)).toString()
              : oneUnit
                ? (amount! < 0n ? -amount! : amount!).toString()
                : null,
          amountCents: amount === null ? null : amount.toString(),
          amountCurrency: ccy,
          // R6-2: a recorded deal shows its own figure in the asset's
          // currency — never re-converted at a later rate.
          ...(e.assetAmountCents !== null && VALUE_KINDS.has(e.kind)
            ? {
                displayAmountCents: (NEGATIVE.has(e.kind)
                  ? -e.assetAmountCents
                  : e.assetAmountCents
                ).toString(),
                displayCurrency: e.costCurrency ?? display,
              }
            : {
                displayAmountCents:
                  amount === null
                    ? null
                    : await toDisplay(amount, ccy, e.effectiveDate),
                displayCurrency: display,
              }),
          realizedBudgetCents:
            e.realizedBudgetCents === null
              ? null
              : e.realizedBudgetCents.toString(),
          ...(await realizedIn(e)),
          budgetCurrency: e.budgetCurrency,
          counterpartyName: e.counterpartyName,
          counterpartyHoldingId: linked ? e.counterpartyHoldingId : null,
          transferId: linked ? e.transferId : null,
          linked,
          walletName: e.walletName,
          walletDelta: e.walletDeltaNumeric,
          backfilled: e.backfilled,
          deletable: isNewest && partnerOk,
          blockedReason: !isNewest
            ? "not_newest"
            : partnerOk
              ? null
              : "linked_not_newest",
          isLastEntry: live.length === 1,
        });
      }

      if (
        (h.holdingType === "deposit" || h.uiType === "deposit") &&
        h.buyPriceCents !== null &&
        h.depositStartDate
      )
        for (const r of depositInterestRows({
          principalCents: h.buyPriceCents,
          rateBps: h.depositRateBps ?? 0,
          startDate: h.depositStartDate,
          capFrequency: (h.depositCapFrequency ?? "monthly") as CapFrequency,
          endDate: h.depositEndDate,
          asOf: today,
        }))
          rows.push({
            id: null,
            kind: "interest",
            effectiveDate: r.date,
            createdAt: null,
            qtyDelta: null,
            displayQty: null,
            priceCents: null,
            amountCents: r.interestCents.toString(),
            amountCurrency: h.buyCurrency ?? display,
            displayAmountCents: await toDisplay(
              r.interestCents,
              h.buyCurrency ?? display,
              r.date,
            ),
            displayCurrency: display,
            realizedBudgetCents: null,
            realizedCents: null,
            realizedCurrency: null,
            budgetCurrency: null,
            counterpartyName: null,
            counterpartyHoldingId: null,
            transferId: null,
            linked: false,
            walletName: null,
            walletDelta: null,
            backfilled: false,
            deletable: false,
            blockedReason: "interest",
            isLastEntry: false,
          });

      // Date desc; same date: real entries before interest, then newest created.
      rows.sort((a, b) =>
        a.effectiveDate !== b.effectiveDate
          ? b.effectiveDate.localeCompare(a.effectiveDate)
          : (a.id === null) !== (b.id === null)
            ? a.id === null
              ? 1
              : -1
            : (b.createdAt ?? "").localeCompare(a.createdAt ?? "") ||
              (b.id ?? "").localeCompare(a.id ?? ""),
      );
      return ok(rows);
    } catch (e) {
      return err(e as Error);
    }
  };
}
