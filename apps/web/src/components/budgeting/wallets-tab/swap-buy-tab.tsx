"use client";
/**
 * swap-buy-tab.tsx — Swap → Buy (13.1 D-08). Type / name / instrument are the
 * asset's, locked. Three shapes:
 *   quantity      quantity · buy price · currency  → {kind:"quantity"}
 *   cash/savings  amount · currency (cost and value rise alike) → {kind:"amount"}
 *   broker        amount added · account value after → {kind:"broker"}; the
 *                 deposit is cost + contribution, the rest is market move.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { centsToBare } from "@/lib/cents-format";
import { deriveUiType, holdingShape } from "@/lib/investment-types";
import { isOfflineWriteError } from "@/lib/offline-write";
import { AssetWriteError } from "@/lib/investment-invalidate";
import { buildSwapSummary } from "@/lib/swap-summary";
import type { HoldingDto } from "@/hooks/use-investments";
import { useBuyAsset, type BuyAssetBody } from "@/hooks/use-buy-asset";
import { Field, NumericInput } from "./holding-sheet";
import {
  ErrorLine,
  LockedField,
  SwapDateField,
  SwapFooter,
  caption,
  ccyOf,
  dateOk,
  num,
  qtyString,
  signColor,
  toCents,
} from "./swap-shared";

export interface SwapTabProps {
  budgetId: string;
  budgetCurrency: string;
  holding: HoldingDto;
  holdings: HoldingDto[];
  date: string;
  setDate: (d: string) => void;
  minDate: string | null;
  onDone: () => void;
  /** Round 4: the main amount/quantity, carried across Buy / Sell / Transfer
   *  (seeds this tab's main field; every edit writes it back). */
  draft?: string;
  setDraft?: (v: string) => void;
  /** Add / New transaction: Type and Name are already chosen above. */
  hideLocked?: boolean;
}

export function SwapBuyTab({
  budgetId,
  budgetCurrency,
  holding,
  date,
  setDate,
  minDate,
  onDone,
  draft = "",
  setDraft,
  hideLocked = false,
}: SwapTabProps) {
  const t = useTranslations("budget.investments");
  const buyMut = useBuyAsset(budgetId);
  const ui = deriveUiType(
    holding.uiType,
    holding.holdingType,
    holding.isCustom,
  );
  const shape =
    ui === "broker"
      ? "broker"
      : holdingShape(holding) === "quantity"
        ? "quantity"
        : "amount";
  const assetCcy = ccyOf(holding, budgetCurrency);
  const valueCents = Number(holding.valueCents);
  const held = num(holding.quantity);

  const [qty, setQtyState] = useState(shape === "quantity" ? draft : "");
  const [price, setPrice] = useState("");
  const [amount, setAmountState] = useState(shape === "quantity" ? "" : draft);
  const setQty = (v: string) => {
    setQtyState(v);
    setDraft?.(v);
  };
  const setAmount = (v: string) => {
    setAmountState(v);
    setDraft?.(v);
  };
  const [ccy, setCcy] = useState(holding.buyCurrency ?? assetCcy);
  // A carried amount prefills "value after" like a typed one (D-08).
  const [valueAfter, setValueAfter] = useState(
    shape === "broker" && draft.trim() !== "" && Number.isFinite(num(draft))
      ? String((valueCents + toCents(draft)) / 100)
      : "",
  );
  const [valueAfterTouched, setValueAfterTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const money = (c: number) => centsToBare(String(Math.round(Math.abs(c))));
  const signed = (c: number) => `${c > 0 ? "+" : c < 0 ? "−" : ""}${money(c)}`;

  const onAmount = (v: string) => {
    setAmount(v);
    // Prefill "value after" = current + amount until the user sets it (D-08).
    if (shape === "broker" && !valueAfterTouched) {
      const a = num(v);
      setValueAfter(
        Number.isFinite(a) ? String((valueCents + toCents(v)) / 100) : "",
      );
    }
  };

  const typed = (s: string) => s.trim() !== "";
  const positive = (s: string) => typed(s) && num(s) > 0;
  const fields = shape === "quantity" ? [qty, price] : [amount];
  const badAmount = fields.some((f) => typed(f) && !(num(f) > 0));
  const badAfter =
    shape === "broker" && typed(valueAfter) && !(num(valueAfter) >= 0);
  const valid =
    fields.every(positive) &&
    !badAfter &&
    (shape !== "broker" || typed(valueAfter)) &&
    dateOk(date, minDate);

  const summary = !valid
    ? buildSwapSummary(null)
    : shape === "quantity"
      ? buildSwapSummary({
          tab: "buy",
          shape,
          name: holding.name,
          qty0: held,
          qty1: held + num(qty),
          v0: valueCents,
          v1:
            valueCents +
            num(qty) * (held > 0 ? valueCents / held : toCents(price)),
          ccy: assetCcy,
        })
      : shape === "amount"
        ? buildSwapSummary({
            tab: "buy",
            shape,
            name: holding.name,
            v0: valueCents,
            v1: valueCents + toCents(amount),
            ccy: assetCcy,
          })
        : buildSwapSummary({
            tab: "buy",
            shape,
            name: holding.name,
            v0: valueCents,
            v1: toCents(valueAfter),
            ccy: assetCcy,
            marketCents: toCents(valueAfter) - valueCents - toCents(amount),
            depositCents: 0,
          });

  function submit() {
    if (!valid) return;
    setServerError(null);
    const body: BuyAssetBody =
      shape === "quantity"
        ? {
            kind: "quantity",
            quantity: qtyString(num(qty)),
            priceCents: String(toCents(price)),
            currency: ccy,
            effectiveDate: date,
          }
        : shape === "amount"
          ? {
              kind: "amount",
              amountCents: String(toCents(amount)),
              currency: ccy,
              effectiveDate: date,
            }
          : {
              kind: "broker",
              amountCents: String(toCents(amount)),
              valueAfterCents: String(toCents(valueAfter)),
              effectiveDate: date,
            };
    buyMut.mutate(
      { holdingId: holding.id, body },
      {
        onSuccess: () => {
          toast.success(t("swap.cta.buy", { name: holding.name }));
          onDone();
        },
        onError: (e) => {
          if (isOfflineWriteError(e)) return;
          const w = e as AssetWriteError;
          setServerError(
            w.code === "fx_unavailable"
              ? t("swap.err.fx", {
                  currency: w.currency ?? "",
                  date: w.date ?? "",
                })
              : w.code === "before_latest_entry"
                ? t("swap.err.beforeLatest", { date: minDate ?? "" })
                : t("swap.err.saveFailed"),
          );
        },
      },
    );
  }

  return (
    <>
      <div className="space-y-4">
        {!hideLocked && (
          <>
            <LockedField
              label={t("field.type")}
              value={t(`uitype.${ui}`)}
              testId="swap-locked-type"
            />
            <LockedField
              label={t("asset.name.label")}
              value={holding.name}
              testId="swap-locked-name"
            />
          </>
        )}
        {holding.instrumentId && (
          <LockedField
            label={t("field.asset")}
            value={holding.instrumentName ?? holding.symbol ?? ""}
            testId="swap-locked-instrument"
          />
        )}

        {shape === "quantity" && (
          <>
            <Field label={t("swap.buy.quantity")}>
              <NumericInput
                testId="swap-buy-qty"
                value={qty}
                onChange={setQty}
              />
            </Field>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Field label={t("swap.buy.price")}>
                  <NumericInput
                    testId="swap-buy-price"
                    value={price}
                    onChange={setPrice}
                  />
                </Field>
              </div>
              <div className="w-24 shrink-0">
                <CurrencyPicker
                  variant="field"
                  value={ccy}
                  onSelect={setCcy}
                  aria-label={t("swap.buy.price")}
                />
              </div>
            </div>
            <p
              data-testid="swap-buy-total"
              className={caption}
              style={{ color: "var(--muted-foreground)" }}
            >
              {t("swap.buy.total", {
                amount: `${money(positive(qty) && positive(price) ? num(qty) * toCents(price) : 0)} ${ccy}`,
              })}
            </p>
          </>
        )}

        {shape === "amount" && (
          <>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Field label={t("swap.buy.amountAdded")}>
                  <NumericInput
                    testId="swap-buy-amount"
                    value={amount}
                    onChange={setAmount}
                  />
                </Field>
              </div>
              <div className="w-24 shrink-0">
                <CurrencyPicker
                  variant="field"
                  value={ccy}
                  onSelect={setCcy}
                  aria-label={t("swap.buy.amountAdded")}
                />
              </div>
            </div>
            <p className={caption} style={{ color: "var(--muted-foreground)" }}>
              {t("swap.buy.cashHelp")}
            </p>
          </>
        )}

        {shape === "broker" && (
          <>
            <Field label={`${t("swap.buy.amountAdded")} (${assetCcy})`}>
              <NumericInput
                testId="swap-buy-amount"
                value={amount}
                onChange={onAmount}
              />
            </Field>
            <Field label={`${t("swap.buy.valueAfter")} (${assetCcy})`}>
              <NumericInput
                testId="swap-buy-value-after"
                value={valueAfter}
                onChange={(v) => {
                  setValueAfterTouched(true);
                  setValueAfter(v);
                }}
              />
            </Field>
            <p className={caption} style={{ color: "var(--muted-foreground)" }}>
              {t("swap.buy.valueAfterHelp", {
                current: money(valueCents),
                amount: money(toCents(amount || "0")),
              })}
            </p>
            {valid && (
              <p data-testid="swap-buy-split" className={caption}>
                <span
                  style={{
                    color: signColor(
                      toCents(valueAfter) - valueCents - toCents(amount),
                    ),
                  }}
                >
                  {t("swap.buy.split", {
                    market: signed(
                      toCents(valueAfter) - valueCents - toCents(amount),
                    ),
                    deposit: signed(0),
                  })}
                </span>
              </p>
            )}
          </>
        )}

        {(badAmount || badAfter) && (
          <ErrorLine>{t("swap.err.positive")}</ErrorLine>
        )}
        <SwapDateField value={date} onChange={setDate} min={minDate} />
        {serverError && <ErrorLine>{serverError}</ErrorLine>}
      </div>
      <SwapFooter
        summary={summary}
        label={t("swap.cta.buy", { name: holding.name })}
        disabled={!valid}
        pending={buyMut.isPending}
        onSubmit={submit}
        onDiscard={onDone}
      />
    </>
  );
}
